import "dotenv/config";

/**
 * Leva UM topo da arvore de categorias (docs/categorias-4hobby-arvore.csv) para a Loja Integrada,
 * com os produtos dele que JA existem na loja (casados pelo SKU). Teste de 15/10/2026 com o topo
 * "Placas Embarcadas" (T_placas), antes de mexer na loja inteira.
 *
 *   node scripts/categorias-li-enviar.js --topo=T_placas                      # SIMULACAO (padrao): le a LI e mostra o plano
 *   node scripts/categorias-li-enviar.js --topo=T_placas --listar-skus        # SKUs do topo, para a trava
 *   LI_ESCRITA=true LI_ESCRITA_CODIGOS=<skus> node scripts/categorias-li-enviar.js --topo=T_placas --executar [--limite=1]
 *   node scripts/categorias-li-enviar.js --reverter=<arquivo de backup>       # idem trava; devolve as categorias antigas
 *
 * Opcoes: --modo=trocar|acrescentar (padrao trocar), --segunda=sim|nao (padrao nao), --limite=N.
 *
 * Seguranca:
 * - Sem --executar nada e gravado (so GET).
 * - A trava do .env continua fechada: quem abre e a linha de comando, so deste processo. O script
 *   recusa rodar se LI_ESCRITA_CODIGOS estiver vazia (vazia libera todos) ou tiver SKU de fora do topo.
 * - Categoria nasce com o nome LIMPO e e RENOMEADA com o numero ("01 - Placas Arduino"): o site
 *   guarda a URL da criacao, entao a URL fica limpa. Vai com o `id_externo` = chave da arvore, e
 *   rodar de novo reaproveita o que ja existe (nada duplica).
 * - Antes do primeiro PUT as categorias atuais de cada produto vao para dados/backup/ (--reverter).
 * - A API da LI nao apaga categoria: categoria criada so sai pelo painel da loja.
 * - Produto: GET -> PUT do produto inteiro com so as categorias trocadas (o mesmo caminho do envio
 *   do Rise, medido em 07/10/2026). Nao mexe em preco, estoque, SEO, URL, fotos nem no Rise.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const fs = await import("node:fs");
const path = await import("node:path");
const { clienteLI } = await import("../src/lib/canaisDeVenda/li/cliente.js");
const { CHAVES_SO_LEITURA } = await import("../src/lib/canaisDeVenda/li/corpo.js");
const { paginarLojaIntegrada } = await import("../src/lib/integracoes/lojaIntegrada/paginacao.js");

const argumentos = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const MODO = argumentos.modo === "acrescentar" ? "acrescentar" : "trocar";
const SEGUNDA = argumentos.segunda === "sim";
const LIMITE = argumentos.limite ? Number(argumentos.limite) : Infinity;
const EXECUTAR = Boolean(argumentos.executar);
const idDaUri = (uri) => String(uri ?? "").split("/").filter(Boolean).at(-1) ?? null;
const uriDaCategoria = (id) => `/api/v1/categoria/${id}`;

// ---------------------------------------------------------------------------------------------
// CSVs (separador ";", aspas duplas com "" como escape, BOM no inicio)
// ---------------------------------------------------------------------------------------------
function lerCsv(arquivo) {
  const texto = fs.readFileSync(arquivo, "utf8").replace(/^﻿/, "");
  const linhas = [];
  let campo = "";
  let linha = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i += 1; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ";") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i += 1;
      linha.push(campo); campo = "";
      if (linha.some((x) => x !== "")) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
  const [cab, ...resto] = linhas;
  return resto.map((l) => Object.fromEntries(cab.map((nome, i) => [nome, l[i] ?? ""])));
}

const arvore = lerCsv("docs/categorias-4hobby-arvore.csv");
const produtosRise = lerCsv("docs/categorias-4hobby-mapeamento.csv");

const chaveTopo = String(argumentos.topo ?? "");
const linhasDoTopo = arvore.filter((l) => l.chave_topo === chaveTopo);
if (!chaveTopo || !linhasDoTopo.length) {
  console.error(`Informe --topo=<chave> (existentes: ${[...new Set(arvore.map((l) => l.chave_topo))].join(", ")}).`);
  process.exit(2);
}
const nomeDoTopo = linhasDoTopo[0].topo;
const folhasDoTopo = linhasDoTopo.filter((l) => l.tipo !== "topo");
const chavesDasFolhas = new Set(folhasDoTopo.map((l) => l.chave));
const skusDoTopo = produtosRise.filter((p) => chavesDasFolhas.has(p.chave)).map((p) => p.sku);

if (argumentos["listar-skus"]) {
  console.log(skusDoTopo.join(","));
  process.exit(0);
}

// "Topo > Folha" -> a linha da arvore (para a 2a categoria)
const folhaPorTexto = new Map(arvore.filter((l) => l.tipo !== "topo").map((l) => [`${l.topo} > ${l.folha}`, l]));
const topoPorChave = new Map(arvore.filter((l) => l.tipo === "topo").map((l) => [l.chave_topo, l]));

// ---------------------------------------------------------------------------------------------
// Leitura da LI
// ---------------------------------------------------------------------------------------------
const cliente = clienteLI();

async function todos(caminho) {
  const itens = [];
  for await (const pagina of paginarLojaIntegrada({ cliente, caminho, params: { limit: 100 } })) itens.push(...pagina.objetos);
  return itens;
}

async function lerBase() {
  const [categorias, produtos] = await Promise.all([todos("/categoria"), todos("/produto")]);
  const vivos = produtos.filter((p) => !p.removido);
  const porSku = new Map();
  for (const p of vivos) {
    const chave = String(p.sku).trim().toLowerCase();
    porSku.set(chave, [...(porSku.get(chave) ?? []), p]);
  }
  return { categorias, porSku };
}

let { categorias: categoriasDaLI, porSku } = await lerBase();
const nomeDaCategoria = new Map(categoriasDaLI.map((c) => [String(c.id), c.nome]));

// ---------------------------------------------------------------------------------------------
// O plano
// ---------------------------------------------------------------------------------------------
// Categorias que o topo precisa: ele mesmo + as folhas com produto (proprias) ou com 2a categoria.
const precisa = new Map(); // chave -> { chave, nomeLimpo, nomeNaLI, paiChave }
function exigirTopo(linhaDoTopo) {
  precisa.set(linhaDoTopo.chave_topo, { chave: linhaDoTopo.chave_topo, nomeLimpo: linhaDoTopo.topo, nomeNaLI: linhaDoTopo.nome_na_li, paiChave: null });
}
function exigirFolha(linha) {
  exigirTopo(topoPorChave.get(linha.chave_topo));
  precisa.set(linha.chave, { chave: linha.chave, nomeLimpo: linha.folha, nomeNaLI: linha.nome_na_li, paiChave: linha.chave_topo });
}
exigirTopo(topoPorChave.get(chaveTopo));
for (const f of folhasDoTopo) if (f.tipo === "propria") exigirFolha(f);

const produtosDoPlano = [];
const foraDaLI = [];
const fora2a = [];
for (const p of produtosRise.filter((x) => chavesDasFolhas.has(x.chave))) {
  const folha = folhasDoTopo.find((f) => f.chave === p.chave);
  const alvos = [folha];
  if (p.categoria_secundaria) {
    const segunda = folhaPorTexto.get(p.categoria_secundaria);
    if (!segunda) throw new Error(`2ª categoria desconhecida na arvore: "${p.categoria_secundaria}" (SKU ${p.sku})`);
    if (segunda.chave_topo === chaveTopo || SEGUNDA) alvos.push(segunda);
    else fora2a.push({ sku: p.sku, segunda: p.categoria_secundaria });
  }
  const noLi = porSku.get(p.sku.trim().toLowerCase()) ?? [];
  if (!noLi.length) { foraDaLI.push(p); continue; }
  if (noLi.length > 1) throw new Error(`SKU ${p.sku} duplicado na LI: ${noLi.map((x) => x.id).join(", ")}. Resolva antes.`);
  for (const alvo of alvos) exigirFolha(alvo);
  produtosDoPlano.push({ rise: p, li: noLi[0], alvos });
}

// Ordem de criacao: topos antes das folhas, na ordem da arvore.
const ordemDaArvore = new Map(arvore.map((l, i) => [l.tipo === "topo" ? l.chave_topo : l.chave, i]));
const categoriasDoPlano = [...precisa.values()].sort((a, b) => ordemDaArvore.get(a.chave) - ordemDaArvore.get(b.chave));
// Categoria que ja existe na loja: pelo id_externo (quando o PUT o gravou) ou pelo nome (limpo ou numerado)
// debaixo do mesmo pai. Sem isso, rodar de novo depois de uma falha no meio criaria a mesma categoria duas vezes.
function acharExistente(c, lista, idsPorChave = new Map()) {
  const porExterno = lista.find((x) => String(x.id_externo ?? "") === c.chave);
  if (porExterno) return porExterno;
  const paiId = c.paiChave ? idsPorChave.get(c.paiChave) : null;
  const paiLinha = c.paiChave ? precisa.get(c.paiChave) : null;
  const nomesDoPai = paiLinha ? new Set([paiLinha.nomeLimpo, paiLinha.nomeNaLI]) : null;
  const porId = new Map(lista.map((x) => [String(x.id), x]));
  // Com ou sem o numero na frente ("01 - Placas Arduino" = "Placas Arduino"): o topo perdeu o numero em
  // 15/10/2026 e, sem isso, o script nao reconheceu o antigo e CRIOU uma 2a arvore inteira.
  const semNumero = (nome) => String(nome ?? "").replace(/^\d{2} - /, "");
  const achadas = lista.filter((x) => {
    if (semNumero(x.nome) !== c.nomeLimpo) return false;
    const paiDeX = idDaUri(x.categoria_pai);
    if (!c.paiChave) return !paiDeX;
    if (paiId) return paiDeX === String(paiId);
    return Boolean(paiDeX) && [...nomesDoPai].some((n) => semNumero(porId.get(paiDeX)?.nome) === semNumero(n));
  });
  // Mais de uma igual: fica a mais antiga (a de menor id).
  return achadas.sort((a, b) => a.id - b.id)[0] ?? null;
}

// Categorias finais de cada produto (ids so existem depois de criar; aqui por chave)
function chavesAlvo(item) {
  const chaves = new Set();
  for (const alvo of item.alvos) { chaves.add(alvo.chave); chaves.add(alvo.chave_topo); }
  return chaves;
}

// ---------------------------------------------------------------------------------------------
// Relatorio do plano
// ---------------------------------------------------------------------------------------------
function relatorio() {
  console.log(`\n=== Topo ${nomeDoTopo} (${chaveTopo}) | modo ${MODO} | 2ª categoria de outros topos: ${SEGUNDA ? "SIM" : "não"} | ${EXECUTAR ? "EXECUTAR" : "SIMULAÇÃO (nada será gravado)"} ===`);
  console.log(`\nCategorias a ter na LI (${categoriasDoPlano.length}):`);
  for (const c of categoriasDoPlano) {
    const existe = acharExistente(c, categoriasDaLI);
    console.log(`  ${c.paiChave ? "   └ " : ""}${c.nomeNaLI}  [${c.chave}]  ${existe ? `JÁ EXISTE (id ${existe.id}, nome "${existe.nome}", url ${existe.url})` : "criar"}`);
  }
  console.log(`\nProdutos do topo no Rise: ${skusDoTopo.length} | já na LI: ${produtosDoPlano.length} | NÃO estão na LI (ficam de fora): ${foraDaLI.length}`);
  if (foraDaLI.length) console.log(`  fora da LI: ${foraDaLI.map((p) => p.sku).join(", ")}`);
  if (fora2a.length) console.log(`  2ª categoria em outro topo, ignorada nesta rodada: ${fora2a.length} produto(s) (${fora2a.map((x) => x.sku).join(", ")})`);
  const saem = new Map();
  const nomes = (item) => (item.li.categorias ?? []).map((u) => nomeDaCategoria.get(idDaUri(u)) ?? u);
  for (const item of produtosDoPlano) for (const n of nomes(item)) saem.set(n, (saem.get(n) ?? 0) + 1);
  console.log(`\nCategorias ATUAIS desses ${produtosDoPlano.length} produtos (${MODO === "trocar" ? "saem delas" : "continuam nelas"}):`);
  for (const [n, q] of [...saem.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(q).padStart(3)}x  ${n}`);
  console.log(`\nProdutos (SKU: de -> para):`);
  for (const item of produtosDoPlano) {
    const para = item.alvos.map((a) => `${a.nome_na_li}`).join(" + ");
    console.log(`  ${item.rise.sku.padEnd(10)} ${nomes(item).join(" | ") || "(sem categoria)"}  ->  ${MODO === "trocar" ? "" : "[atuais] + "}${para}`);
  }
}

relatorio();

if (argumentos.reverter) {
  // tratado mais abaixo (precisa do cliente de escrita)
} else if (!EXECUTAR) {
  console.log("\nSIMULAÇÃO: nada foi gravado. Para executar: --executar (com a trava aberta só neste comando).");
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------------------------
function textoDaRecusa(resposta) {
  const d = resposta?.dados;
  const campos = Array.isArray(d?.error) ? d.error.flatMap((i) => Object.entries(i ?? {}).map(([c, m]) => `${c}: ${m}`)).join("; ") : "";
  return `HTTP ${resposta?.status}${campos ? ` (${campos})` : d ? ` ${JSON.stringify(d).slice(0, 300)}` : ""}`;
}

function conferirTrava() {
  const lista = String(process.env.LI_ESCRITA_CODIGOS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (process.env.LI_ESCRITA !== "true" || !lista.length) {
    console.error("\nRECUSADO: abra a trava só neste comando: LI_ESCRITA=true LI_ESCRITA_CODIGOS=<SKUs do topo> (lista vazia libera todos, por isso é exigida).");
    process.exit(3);
  }
  const permitidos = new Set(skusDoTopo.map((s) => s.toLowerCase()));
  const estranhos = lista.filter((s) => !permitidos.has(s.toLowerCase()));
  if (estranhos.length) {
    console.error(`\nRECUSADO: LI_ESCRITA_CODIGOS tem SKU que não é do topo: ${estranhos.join(", ")}`);
    process.exit(3);
  }
}

async function lerUm(caminho, params) {
  const r = await cliente.get(caminho, params);
  if (!r?.ok) throw new Error(`GET ${caminho}: ${textoDaRecusa(r)}`);
  return r.dados;
}

function semSoLeitura(objeto) {
  const corpo = {};
  for (const [k, v] of Object.entries(objeto ?? {})) if (!CHAVES_SO_LEITURA.has(k)) corpo[k] = v;
  return corpo;
}

if (argumentos.reverter) {
  conferirTravaDeReversao();
  await reverter(String(argumentos.reverter));
  process.exit(0);
}

conferirTrava();

// ---- categorias
const idsPorChave = new Map();
console.log("\n--- Categorias ---");
const categoriasAgora = [...categoriasDaLI];
for (const c of categoriasDoPlano) {
  let existente = acharExistente(c, categoriasAgora, idsPorChave);
  if (!existente) {
    cliente.exigirEscrita(skusDoTopo[0]);
    // So `nome` (e `categoria_pai` na folha). Medido em 15/10/2026: `id_externo` no POST da 400 sem corpo,
    // e `descricao: ""`/`categoria_pai: null` explicitos tambem; so `{ nome }` respondeu 201 com o objeto criado.
    const corpo = { nome: c.nomeLimpo, ...(c.paiChave ? { categoria_pai: `/v1/categoria/${idsPorChave.get(c.paiChave)}` } : {}) };
    let r = await cliente.post("/categoria", corpo);
    // Nome igual a outro da loja (a LI recusa nome repetido): so a folha tem saida, criando ja com o numero
    // (a URL sai com o numero, "1-nome"); topo repetido para e o dono decide o nome.
    if (!r?.ok && c.paiChave && /J. existe uma categoria/i.test(JSON.stringify(r?.dados ?? ""))) {
      console.log(`  "${c.nomeLimpo}" ja existe na loja com esse nome: criando como "${c.nomeNaLI}"`);
      r = await cliente.post("/categoria", { ...corpo, nome: c.nomeNaLI });
    }
    if (!r?.ok) throw new Error(`POST /categoria "${c.nomeLimpo}": ${textoDaRecusa(r)}`);
    if (!r.dados?.id) throw new Error(`POST /categoria "${c.nomeLimpo}" respondeu ${r.status} sem o id: ${JSON.stringify(r.dados)?.slice(0, 200)}`);
    existente = r.dados;
    categoriasAgora.push(existente);
    console.log(`  criada "${c.nomeLimpo}" -> id ${existente.id} | url ${existente.url} | pai ${existente.categoria_pai ?? "(topo)"}`);
  }
  const id = String(existente.id);
  idsPorChave.set(c.chave, id);
  const atual = await lerUm(`/categoria/${id}`);
  const paiEsperado = c.paiChave ? String(idsPorChave.get(c.paiChave)) : null;
  const paiLido = idDaUri(atual.categoria_pai);
  if ((paiLido ?? null) !== paiEsperado) throw new Error(`Categoria ${id} ("${atual.nome}") esta debaixo de ${paiLido ?? "(topo)"}, esperado ${paiEsperado ?? "(topo)"}. Parando.`);
  console.log(`  ${c.chave}: id ${id} | nome "${atual.nome}" | id_externo ${atual.id_externo ?? "(vazio)"} | url ${atual.url}`);

  // `id_externo` NAO e gravavel pela API (POST e PUT com ele dao 400, medido em 15/10/2026): a categoria e
  // reconhecida pelo nome debaixo do mesmo pai (`acharExistente`). Falta so o numero no nome.
  if (atual.nome !== c.nomeNaLI) {
    cliente.exigirEscrita(skusDoTopo[0]);
    // O PUT leva o que a LI devolveu, sem as chaves so de leitura e sem nulos/vazios (que deram 400 no POST).
    const base = Object.fromEntries(Object.entries(semSoLeitura(atual)).filter(([, v]) => v !== null && v !== ""));
    const r = await cliente.put(`/categoria/${id}`, { ...base, nome: c.nomeNaLI });
    if (!r?.ok) throw new Error(`PUT /categoria/${id} (renomear para "${c.nomeNaLI}"): ${textoDaRecusa(r)}`);
    const depois = await lerUm(`/categoria/${id}`);
    console.log(`    agora: "${depois.nome}" | id_externo ${depois.id_externo ?? "(vazio)"} | url ${depois.url}`);
    if (depois.nome !== c.nomeNaLI) throw new Error(`Categoria ${id} continua "${depois.nome}" depois do PUT (esperado "${c.nomeNaLI}"). Parando.`);
  }
  await preencherSeo(id, c);
}

// SEO da categoria (pedido do dono em 15/10/2026): so preenche o que esta VAZIO, nunca sobrescreve texto.
// Sem numero de produtos no texto (ele envelheceria); titulo ate 70 e descricao ate 160 caracteres.
function textosDeSeo(c) {
  const topo = nomeDoTopoDe(c);
  const cortar = (texto, max) => (texto.length <= max ? texto : `${texto.slice(0, max - 1).trimEnd()}…`);
  if (!c.paiChave) {
    return {
      title: cortar(`${c.nomeLimpo} | 4hobby`, 70),
      description: cortar(`${c.nomeLimpo} na 4hobby: veja as categorias, preços e estoque. Eletrônica, automação e CNC com envio para todo o Brasil.`, 160),
    };
  }
  const longa = `Compre ${c.nomeLimpo} na 4hobby: veja preços, estoque e fotos em ${topo}. Eletrônica, automação e CNC com envio para todo o Brasil.`;
  const curta = `Compre ${c.nomeLimpo} na 4hobby: veja preços, estoque e fotos em ${topo}. Envio para todo o Brasil.`;
  const title = `${c.nomeLimpo} | ${topo} | 4hobby`;
  return { title: title.length <= 70 ? title : cortar(`${c.nomeLimpo} | 4hobby`, 70), description: cortar(longa.length <= 160 ? longa : curta, 160) };
}
function nomeDoTopoDe(c) {
  return c.paiChave ? precisa.get(c.paiChave)?.nomeLimpo ?? nomeDoTopo : c.nomeLimpo;
}
async function preencherSeo(id, c) {
  const atual = await lerUm(`/categoria/${id}`);
  const idSeo = idDaUri(atual.seo);
  if (!idSeo) return;
  const seo = await lerUm(`/seo/${idSeo}`);
  const novo = textosDeSeo(c);
  const corpo = { title: seo.title || novo.title, description: seo.description || novo.description };
  if (corpo.title === (seo.title ?? "") && corpo.description === (seo.description ?? "")) return;
  cliente.exigirEscrita(skusDoTopo[0]);
  const r = await cliente.put(`/seo/${idSeo}`, corpo);
  if (!r?.ok) throw new Error(`PUT /seo/${idSeo} (categoria ${id}): ${textoDaRecusa(r)}`);
  console.log(`    SEO: "${corpo.title}"`);
}

// ---- produtos
fs.mkdirSync("dados/backup", { recursive: true });
const agora = new Date();
const carimbo = `${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, "0")}${String(agora.getDate()).padStart(2, "0")}-${String(agora.getHours()).padStart(2, "0")}${String(agora.getMinutes()).padStart(2, "0")}${String(agora.getSeconds()).padStart(2, "0")}`;
const arquivoDeBackup = path.join("dados/backup", `li-categorias-${chaveTopo}-${carimbo}.json`);
const backup = { geradoEm: agora.toISOString(), topo: chaveTopo, modo: MODO, categoriasCriadasOuUsadas: Object.fromEntries(idsPorChave), produtos: [] };

console.log(`\n--- Produtos (limite ${Number.isFinite(LIMITE) ? LIMITE : "sem"}) ---`);
let gravados = 0;
let jaCertos = 0;
const falhas = [];
for (const item of produtosDoPlano) {
  if (gravados >= LIMITE) break;
  const sku = item.rise.sku;
  const alvoIds = [...chavesAlvo(item)].map((k) => idsPorChave.get(k)).filter(Boolean);
  const atuais = (item.li.categorias ?? []).map(idDaUri);
  const novas = MODO === "trocar" ? alvoIds : [...new Set([...atuais, ...alvoIds])];
  if (novas.length === new Set(atuais).size && novas.every((id) => atuais.includes(id))) { jaCertos += 1; continue; }
  try {
    cliente.exigirEscrita(sku);
    const detalhe = await lerUm(`/produto/${item.li.id}`, { descricao_completa: 1 });
    backup.produtos.push({ id: item.li.id, sku, categoriasAntes: detalhe.categorias ?? [] });
    fs.writeFileSync(arquivoDeBackup, JSON.stringify(backup, null, 1));
    const corpo = { ...semSoLeitura(detalhe), categorias: novas.map(uriDaCategoria) };
    const r = await cliente.put(`/produto/${item.li.id}`, corpo);
    if (!r?.ok) throw new Error(textoDaRecusa(r));
    gravados += 1;
    if (gravados === 1) {
      const depois = await lerUm(`/produto/${item.li.id}`, { descricao_completa: 1 });
      const mudou = [];
      for (const k of new Set([...Object.keys(detalhe), ...Object.keys(depois)])) {
        if (CHAVES_SO_LEITURA.has(k) && k !== "seo") continue;
        if (JSON.stringify(detalhe[k]) !== JSON.stringify(depois[k])) mudou.push(k);
      }
      console.log(`  ${sku}: gravado. Campos que mudaram na releitura: ${mudou.join(", ")} (esperado: só categorias)`);
    } else if (gravados % 10 === 0) console.log(`  ${gravados} gravados...`);
  } catch (erro) {
    falhas.push({ sku, erro: String(erro.message ?? erro) });
    console.error(`  ${sku}: FALHOU: ${erro.message ?? erro}`);
    if (falhas.length >= 3) { console.error("  3 falhas: parando."); break; }
  }
}
console.log(`\nGravados: ${gravados} | já estavam certos: ${jaCertos} | falhas: ${falhas.length}`);
console.log(`Backup das categorias antigas: ${arquivoDeBackup}`);

// ---- conferência final (leitura nova de tudo)
const final = await lerBase();
const nomesFinais = new Map(final.categorias.map((c) => [String(c.id), c.nome]));
let certos = 0;
for (const item of produtosDoPlano) {
  const noLi = final.porSku.get(item.rise.sku.trim().toLowerCase())?.[0];
  const atuais = new Set((noLi?.categorias ?? []).map(idDaUri));
  const alvoIds = [...chavesAlvo(item)].map((k) => idsPorChave.get(k)).filter(Boolean);
  if (alvoIds.length && alvoIds.every((id) => atuais.has(id))) certos += 1;
}
console.log(`Conferência na LI: ${certos} de ${produtosDoPlano.length} produtos já estão nas categorias novas.`);
for (const c of categoriasDoPlano) {
  const id = idsPorChave.get(c.chave);
  if (!id) continue;
  const n = final.categorias.find((x) => String(x.id) === id);
  const qtd = [...final.porSku.values()].flat().filter((p) => (p.categorias ?? []).map(idDaUri).includes(id)).length;
  console.log(`  ${nomesFinais.get(id)}  url ${n?.url}  produtos: ${qtd}`);
}
process.exit(falhas.length ? 1 : 0);

// ---------------------------------------------------------------------------------------------
function conferirTravaDeReversao() {
  const lista = String(process.env.LI_ESCRITA_CODIGOS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (process.env.LI_ESCRITA !== "true" || !lista.length) {
    console.error("\nRECUSADO: abra a trava só neste comando (LI_ESCRITA=true LI_ESCRITA_CODIGOS=<SKUs>).");
    process.exit(3);
  }
}

async function reverter(arquivo) {
  const salvo = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  const liberados = new Set(String(process.env.LI_ESCRITA_CODIGOS).split(",").map((s) => s.trim().toLowerCase()));
  console.log(`\n--- Reverter ${salvo.produtos.length} produto(s) do backup ${arquivo} ---`);
  for (const p of salvo.produtos) {
    if (!liberados.has(String(p.sku).toLowerCase())) { console.log(`  ${p.sku}: fora da trava, pulado`); continue; }
    cliente.exigirEscrita(p.sku);
    const detalhe = await lerUm(`/produto/${p.id}`, { descricao_completa: 1 });
    const r = await cliente.put(`/produto/${p.id}`, { ...semSoLeitura(detalhe), categorias: p.categoriasAntes });
    console.log(`  ${p.sku}: ${r?.ok ? "voltou" : `FALHOU ${textoDaRecusa(r)}`}`);
  }
  console.log("\nAs categorias novas continuam na loja (a API não apaga): remova pelo painel se quiser. Ids:", JSON.stringify(salvo.categoriasCriadasOuUsadas));
}

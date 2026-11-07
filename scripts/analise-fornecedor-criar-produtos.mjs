// Cria no Rise os itens "para criar" da analise de lista de fornecedor (roteiro em src/lib/analiseFornecedor/roteiro.js,
// passo 7; primeiro uso em 07/11/2026 com a NexMind, 258207 a 258244). SO com a permissao do dono. Roda NA VPS, numa
// conexao so, com o plano embutido antes do script (scripts/analise-fornecedor-embutir.js):
//   globalThis.PLANO = { fornecedor: "<nome no Rise>", itens: [{ n, nome, codigo?, titulo, qtd, precoUnitario, foto? }] }
//   - nome: o item como esta na lista gravada da fonte do fornecedor; codigo: o do fornecedor (lista sem codigo: null);
//   - titulo: o nome em portugues, no padrao do Rise (MAIUSCULAS); foto: JPEG em base64 (sem "data:").
// Sem --confirmo so LE e confere (fonte, fornecedor, item na lista gravada, preco igual ao da analise, nome repetido no
// Rise, item ja vinculado, foto aceita pelo padronizador). Com --confirmo, item a item:
//   1. codigo automatico livre da faixa 25xxxx (proximoCodigoLivre, o mesmo do botao do cadastro);
//   2. Produto SIMPLES, UN, ativo, com o titulo (sem preco de venda: o dono escolhe a regra depois);
//   3. a foto pelo caminho das fotos importadas (anexarImagens: padroniza a 1024 px, fundo branco);
//   4. o vinculo com o fornecedor, PADRAO, codigo do fornecedor (ou nenhum), descricao = nome na lista, custo da lista;
//   5. custo do produto = o do vinculo padrao.
// Os ids criados vao para /app/dados/criar-produtos/ a cada item (desfazer = apagar esses produtos). Nada vai ao Bling.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const RAIZ = existsSync("/app/scripts/resolver-alias.js") ? "/app" : process.cwd();
register(pathToFileURL(`${RAIZ}/scripts/resolver-alias.js`), pathToFileURL(`${RAIZ}/`));
if (RAIZ !== "/app") await import("dotenv/config");
const modulo = (caminho) => import(pathToFileURL(`${RAIZ}/${caminho}`).href);

const confirmo = process.argv.includes("--confirmo");
const { PLANO } = globalThis;
if (!PLANO?.fornecedor || !Array.isArray(PLANO.itens) || PLANO.itens.length === 0) { console.error("Falta globalThis.PLANO = { fornecedor, itens }."); process.exit(2); }

const { prisma } = await modulo("src/lib/db.js");
const { proximoCodigoLivre } = await modulo("src/lib/proposta/codigo.js");
const { anexarImagens } = await modulo("src/lib/imagensImportadas.js");
const { padronizarImagem } = await modulo("src/lib/imagens/padronizar.js");
const { custoDoFornecedor } = await modulo("src/lib/coleta/impostos.js");

const numero = (valor) => (valor == null ? null : Number(valor));
const parar = async (texto) => { console.error(`PAREI: ${texto}`); await prisma.$disconnect(); process.exit(1); };
const normal = (texto) => String(texto ?? "").trim().toLocaleUpperCase("pt-BR").replace(/ +/g, " ");
const semCodigo = (codigo) => !codigo || String(codigo).trim().toUpperCase() === "N/A";

// --- fornecedor e a fonte dele (a ligada ao cadastro, ou a de mesmo nome)
const fornecedor = await prisma.fornecedor.findFirst({
  where: { nome: { equals: PLANO.fornecedor, mode: "insensitive" } },
  select: { id: true, nome: true, fonteId: true, moedaLista: true, fatorImportacao: true },
});
if (!fornecedor) await parar(`fornecedor "${PLANO.fornecedor}" não está no Rise`);
const fonte = fornecedor.fonteId
  ? await prisma.fonteColeta.findUnique({ where: { id: fornecedor.fonteId }, select: { id: true, nome: true } })
  : await prisma.fonteColeta.findFirst({ where: { nome: { equals: fornecedor.nome, mode: "insensitive" } }, select: { id: true, nome: true } });
if (!fonte) await parar(`a fonte de ${fornecedor.nome} não foi achada (ligue a fonte ao cadastro do fornecedor)`);
console.log(`Fornecedor ${fornecedor.nome} (moeda ${fornecedor.moedaLista ?? "BRL"}, fator ${fornecedor.fatorImportacao ?? "-"}) · fonte ${fonte.nome}`);
const pedidos = await prisma.pedidoDeCompra.findMany({ where: { fornecedorId: fornecedor.id, status: "RASCUNHO" }, select: { numero: true, _count: { select: { itens: true } } } });
console.log(`Rascunho do fornecedor: ${pedidos.map((p) => `PC-${String(p.numero).padStart(4, "0")} (${p._count.itens} itens)`).join(", ") || "nenhum"}`);

// --- itens da lista gravada: pelo codigo do fornecedor, ou pelo nome quando a lista nao tem codigo
const coletados = await prisma.produtoColetado.findMany({
  where: { fonteId: fonte.id },
  select: { id: true, nome: true, codigo: true, url: true, precoComImpostos: true, precoNormal: true, precoPromocional: true, impostos: true },
});
const porNome = new Map(coletados.map((c) => [c.nome, c]));
const porCodigo = new Map(coletados.filter((c) => !semCodigo(c.codigo)).map((c) => [String(c.codigo).trim().toUpperCase(), c]));
const titulosNoRise = new Map((await prisma.produto.findMany({ select: { sku: true, tituloBase: true } })).map((p) => [normal(p.tituloBase), p.sku]));
const vinculos = await prisma.produtoFornecedor.findMany({ where: { fornecedorId: fornecedor.id }, select: { descricao: true, codigo: true, produto: { select: { sku: true } } } });
const problemas = [];
const plano = [];
const titulosDoPlano = new Set();
for (const item of PLANO.itens) {
  const coletado = semCodigo(item.codigo) ? porNome.get(item.nome) : porCodigo.get(String(item.codigo).trim().toUpperCase());
  if (!coletado) { problemas.push(`#${item.n} fora da lista gravada: ${item.codigo ?? item.nome}`); continue; }
  const custo = custoDoFornecedor(
    { comImpostos: numero(coletado.precoComImpostos), normal: numero(coletado.precoNormal), promotional: numero(coletado.precoPromocional) },
    coletado.impostos,
  );
  if (!(custo > 0)) problemas.push(`#${item.n} sem preço na lista gravada`);
  else if (Math.abs(custo - item.precoUnitario) > 0.01) problemas.push(`#${item.n} custo R$ ${custo} na lista gravada, ${item.precoUnitario} na análise (lista atualizada depois?)`);
  if (!item.titulo?.trim()) problemas.push(`#${item.n} sem nome em português`);
  else if (titulosNoRise.has(normal(item.titulo))) problemas.push(`#${item.n} já existe produto com o nome "${item.titulo}": ${titulosNoRise.get(normal(item.titulo))}`);
  if (titulosDoPlano.has(normal(item.titulo))) problemas.push(`#${item.n} nome repetido no plano: ${item.titulo}`);
  titulosDoPlano.add(normal(item.titulo));
  const jaVinculado = vinculos.find((v) => (semCodigo(item.codigo) ? v.descricao === coletado.nome : String(v.codigo ?? "").trim().toUpperCase() === String(item.codigo).trim().toUpperCase()));
  if (jaVinculado) problemas.push(`#${item.n} este item da lista já está vinculado ao produto ${jaVinculado.produto.sku}`);
  let ampliada = null;
  if (item.foto) {
    const padrao = await padronizarImagem(Buffer.from(item.foto, "base64"));
    if (!padrao.ok) problemas.push(`#${item.n} foto recusada: ${padrao.erro}`);
    else ampliada = padrao.ampliada;
  }
  plano.push({ item, coletado, custo, ampliada });
}
console.log(`Próximo código automático: ${await proximoCodigoLivre()} · itens ${PLANO.itens.length} · no plano ${plano.length} · com foto ${plano.filter((p) => p.item.foto).length}`);
for (const p of plano) console.log(`  #${p.item.n} custo R$ ${p.custo} · ${p.item.qtd ?? "-"} un. · ${p.item.titulo}`);
if (problemas.length) await parar(`${problemas.length} problema(s): ${problemas.join(" | ")}`);
if (!confirmo) {
  console.log("Nada gravado. Repita com --confirmo para gravar.");
  await prisma.$disconnect();
  process.exit(0);
}

const pasta = `${RAIZ}/dados/criar-produtos`;
await mkdir(pasta, { recursive: true });
const slug = fornecedor.nome.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase();
const arquivoIds = `${pasta}/${slug}-criados-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
const criados = [];
const guardar = () => writeFile(arquivoIds, JSON.stringify({ fornecedorId: fornecedor.id, fonteId: fonte.id, criados }, null, 1));
for (const { item, coletado, custo } of plano) {
  const sku = await proximoCodigoLivre();
  if (!sku) await parar("a faixa 25xxxx acabou");
  const produto = await prisma.produto.create({ data: { sku, tituloBase: item.titulo.trim(), unidade: "UN", tipo: "SIMPLES", ativo: true }, select: { id: true } });
  const linha = { n: item.n, sku, produtoId: produto.id, titulo: item.titulo, qtd: item.qtd ?? null, precoUnitario: item.precoUnitario, custo };
  criados.push(linha);
  await guardar();
  if (item.foto) {
    const fotos = await anexarImagens(produto.id, sku, [{ tipo: "endereco", endereco: `data:image/jpeg;base64,${item.foto}` }]);
    linha.fotos = fotos.salvas;
    if (fotos.recusadas.length) linha.fotoRecusada = fotos.recusadas.join("; ");
  }
  const vinculo = await prisma.produtoFornecedor.create({
    data: {
      produtoId: produto.id,
      fornecedorId: fornecedor.id,
      descricao: coletado.nome,
      observacao: `Análise da lista de ${fornecedor.nome}, item ${item.n}. Produto criado em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} pela lista para criar.`,
      codigo: semCodigo(item.codigo) ? null : String(item.codigo).trim(),
      precoFornecedor: custo,
      precoCusto: custo,
      link: coletado.url ?? null,
      padrao: true,
    },
    select: { id: true },
  });
  linha.vinculoId = vinculo.id;
  await prisma.produto.update({ where: { id: produto.id }, data: { custo } });
  await guardar();
  console.log(`  #${item.n} ${sku} criado · foto ${item.foto ? (linha.fotos ? "ok" : "NÃO") : "-"} · ${item.titulo}`);
}
console.log(`Criados: ${criados.length} · ids em ${arquivoIds}`);
console.log(`CRIADOS_JSON=${JSON.stringify(criados.map(({ n, sku, qtd, precoUnitario }) => ({ n, sku, qtd, precoUnitario })))}`);
await prisma.$disconnect();

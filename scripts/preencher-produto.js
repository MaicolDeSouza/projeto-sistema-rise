/**
 * Preencher produto do Rise pelo servidor (pedido do dono em 14/10/2026): o dono faz a varredura dos concorrentes e
 * passa o codigo; este script LE o que ha no banco e, com plano aprovado, GRAVA o cadastro (fotos, descricao, EAN,
 * NCM...) com as mesmas funcoes do Rise, sem passar pela tela. Comandos:
 *
 *   ler <sku>                      so consulta e imprime o produto (nada e gravado)
 *   ofertas <sku> [--prompt=<nome>]  so consulta: o que a proposta le (o mesmo lerParaProposta do MCP)
 *   descricao <sku> --prompt=<nome>  gera a descricao pela API do Rise (PAGA) e imprime; nao grava
 *   proposta <sku> --plano=<json>  grava UMA secao da proposta automatica (spec 2026-10-16); nao mexe no produto
 *   proposta <sku> --ler           imprime a proposta
 *   gravar <plano.json>            grava descricao e fotos direto no produto (caminho manual; recusa proposta aberta)
 *   clonar <sku> <novo> [--simular]  cria um produto de TESTE copiado de <sku> (como o "Clonar" da tela)
 *
 * O plano da proposta e `{ secao, conteudo, arquivos?: { "<id da candidata ou do documento>": "<base64>" } }`; o
 * formato de cada secao esta em src/lib/proposta/plano.js e no roteiro docs/superpowers/roteiros/proposta-de-produto.md.
 *
 * COMO RODA NA VPS (o arquivo viaja pela entrada do comando e NAO fica la):
 *
 *   ssh -i ~/.ssh/rise_vps rise@179.199.150.221 \
 *     "cd /srv/rise/app && docker compose exec -T app node --input-type=module - ler 100103" < scripts/preencher-produto.js
 *
 * Dentro do contêiner `app` o banco e as chaves ja estao no ambiente: o script nunca le nem imprime segredo. No PC roda
 * com `node scripts/preencher-produto.js ler <sku>` (usa o .env).
 *
 * O CLONE leva o que o botao Clonar leva (campos, fotos e documentos, fornecedores, concorrentes, pecas de kit) e NAO
 * leva o que e daquela peca: estoque, localizacao, Conferido, vinculo com o Bling, link da Loja Integrada, anuncios e a
 * reserva de imagens. O EAN fica VAZIO, porque o Salvar do Rise recusa o mesmo GTIN em dois produtos. Nunca chama
 * Bling, Mercado Livre nem Loja Integrada.
 */
import { existsSync } from "node:fs";
import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import { register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Na VPS o codigo mora em /app; no PC, na pasta atual.
const RAIZ = existsSync("/app/scripts/resolver-alias.js") ? "/app" : process.cwd();
if (RAIZ !== "/app") await import("dotenv/config");
register(pathToFileURL(`${RAIZ}/scripts/resolver-alias.js`), pathToFileURL(`${RAIZ}/`));

const { prisma } = await import(pathToFileURL(`${RAIZ}/src/lib/db.js`).href);
const { caminhoDe, pastaDoProduto, skuValido } = await import(pathToFileURL(`${RAIZ}/src/lib/arquivos.js`).href);

// O que NAO vai para a copia (ver o cabecalho). O resto dos campos escalares vai como esta, sem citar nenhuma coluna
// recente: a VPS pode estar com o banco atras do PC.
const NAO_COPIA = new Set([
  "id", "sku", "ean", "estoque", "localizacao", "urlLojaIntegrada", "blingId", "blingSincronizadoEm", "blingAssinatura",
  "blingSaldo", "blingSaldoLidoEm", "conferido", "fornecedorRascunho", "gastoIA", "criadoEm", "atualizadoEm",
]);

const COMANDOS = new Set(["ler", "ofertas", "descricao", "proposta", "gravar", "clonar"]);
const inicio = process.argv.findIndex((arg, posicao) => posicao >= 1 && COMANDOS.has(arg));
const [comando, ...resto] = inicio >= 0 ? process.argv.slice(inicio) : [];
const simular = resto.includes("--simular");
const argumentos = resto.filter((arg) => !arg.startsWith("--"));
const opcao = (nome) => resto.find((arg) => arg.startsWith(`--${nome}=`))?.split("=").slice(1).join("=") ?? null;

function sair(codigo, mensagem) {
  if (mensagem) console[codigo === 0 ? "log" : "error"](mensagem);
  // Espera a saida terminar de sair antes de encerrar: por SSH a saida e um pipe, e o process.exit direto cortava o
  // `ofertas` em 64 KB (visto na VPS em 21/10/2026). A escrita vazia so chama de volta depois das anteriores.
  return prisma.$disconnect().finally(() => process.stdout.write("", () => process.stderr.write("", () => process.exit(codigo))));
}

async function tamanhoEmDisco(sku, arquivo) {
  const caminho = caminhoDe(sku, arquivo.tipo, arquivo.arquivo);
  if (!caminho) return null;
  try {
    return (await stat(caminho)).size;
  } catch {
    return null;
  }
}

async function ler(sku) {
  const produto = await prisma.produto.findUnique({ where: { sku } });
  if (!produto) return sair(1, `Produto ${sku} nao existe.`);
  const [arquivos, fornecedores, concorrentes, pecas, anuncios] = await Promise.all([
    prisma.produtoArquivo.findMany({ where: { produtoId: produto.id }, orderBy: [{ tipo: "asc" }, { ordem: "asc" }] }),
    prisma.produtoFornecedor.findMany({ where: { produtoId: produto.id }, include: { fornecedor: { select: { nome: true } } } }),
    prisma.produtoConcorrente.findMany({ where: { produtoId: produto.id }, include: { produtoColetado: { select: { nome: true, codigo: true, precoNormal: true, fonte: { select: { nome: true } } } } } }),
    prisma.produtoComponente.findMany({ where: { kitId: produto.id }, include: { componente: { select: { sku: true } } } }),
    prisma.anuncio.findMany({ where: { produtoId: produto.id }, select: { canal: true, status: true, situacaoCanal: true, idExterno: true } }),
  ]);
  const arquivosComTamanho = [];
  for (const arquivo of arquivos) {
    arquivosComTamanho.push({
      tipo: arquivo.tipo, papel: arquivo.papel, versao: arquivo.versao, ordem: arquivo.ordem, principal: arquivo.principal,
      nomeOriginal: arquivo.nomeOriginal, arquivo: arquivo.arquivo, bytesNoBanco: arquivo.tamanhoBytes, bytesEmDisco: await tamanhoEmDisco(sku, arquivo),
    });
  }
  const { fornecedorRascunho, ...campos } = produto;
  console.log(JSON.stringify({
    produto: campos,
    temFornecedorEmRascunho: Boolean(fornecedorRascunho),
    arquivos: arquivosComTamanho,
    fornecedores: fornecedores.map((v) => ({ fornecedor: v.fornecedor.nome, codigo: v.codigo, precoCusto: v.precoCusto, padrao: v.padrao, link: v.link })),
    concorrentes: concorrentes.map((v) => (v.produtoColetado
      ? { loja: v.produtoColetado.fonte.nome, nome: v.produtoColetado.nome, codigo: v.produtoColetado.codigo, preco: v.produtoColetado.precoNormal }
      : { loja: v.fonteManual, nome: v.nomeManual, codigo: v.codigoManual, preco: v.precoManual, manual: true })),
    pecasDoKit: pecas.map((p) => ({ sku: p.componente.sku, quantidade: p.quantidade })),
    anuncios,
  }, null, 2));
  return sair(0);
}

/**
 * O que a proposta precisa ler (so leitura): o produto, os fornecedores e os concorrentes vinculados (com as fotos, cada
 * uma com o id que o MCP usa para baixar), o agregado por campo e os prompts. E o MESMO `lerParaProposta` da ferramenta
 * do MCP (src/lib/proposta/leitura.js), para os dois caminhos verem a mesma coisa. `--prompt=<nome>` traz o texto dele.
 */
async function ofertas(sku) {
  const { lerParaProposta } = await import(pathToFileURL(`${RAIZ}/src/lib/proposta/leitura.js`).href);
  try {
    console.log(JSON.stringify(await lerParaProposta(sku, { prompt: opcao("prompt") }), null, 2));
  } catch (erro) {
    return sair(1, erro.message);
  }
  return sair(0);
}

/**
 * Gera a descricao nova do produto com um prompt da biblioteca e os concorrentes VINCULADOS como referencia, pelo mesmo
 * caminho da janela "Criar descricao" (`gerarDescricao`) e monta o texto FINAL como o "Finalizar descricao" da tela faz
 * quando o dono nao escolhe nada: cada quadro de divergencia com a opcao RECOMENDADA pela IA. NAO grava nada no produto;
 * a unica coisa que fica no banco e o log da chamada paga (LogIntegracao), como na tela. Chama a IA: custa dinheiro.
 *
 *   descricao <sku> --prompt=<nome do prompt> [--modelo=<id do modelo>]
 */
async function descricao(sku) {
  const produto = await prisma.produto.findUnique({ where: { sku } });
  if (!produto) return sair(1, `Produto ${sku} nao existe.`);
  const vinculos = await prisma.produtoConcorrente.findMany({ where: { produtoId: produto.id }, select: { produtoColetadoId: true } });
  const ids = vinculos.map((v) => v.produtoColetadoId).filter(Boolean);
  if (ids.length === 0) return sair(1, "O produto nao tem concorrente vinculado do Rise. Nada foi gerado.");

  let instrucoes;
  const nomeDoPrompt = opcao("prompt");
  if (nomeDoPrompt) {
    const prompt = await prisma.promptDescricao.findFirst({ where: { nome: { equals: nomeDoPrompt, mode: "insensitive" } } });
    if (!prompt) {
      const nomes = (await prisma.promptDescricao.findMany({ select: { id: true, nome: true, padrao: true } })).map((p) => `${p.nome} (${p.id})${p.padrao ? " [padrao]" : ""}`);
      return sair(1, `Nao ha prompt chamado "${nomeDoPrompt}" na biblioteca. Existem: ${nomes.join("; ") || "nenhum salvo (so o do sistema)"}.`);
    }
    instrucoes = prompt.texto;
  }
  const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor) || null);
  const modeloIA = opcao("modelo");
  const { gerarDescricao } = await import(pathToFileURL(`${RAIZ}/src/lib/ia/anuncio.js`).href);
  const { garantirSecaoEspecificacoes, inserirEspecificacaoNaPosicao, formatarLinhaTecnica, organizarDescricao } = await import(pathToFileURL(`${RAIZ}/src/lib/ia/revisaoDescricao.js`).href);

  const inicio = new Date();
  let resultado;
  try {
    resultado = await gerarDescricao(ids, {
      titulo: produto.tituloBase, sku: produto.sku, marca: produto.marca ?? "", modelo: produto.modelo ?? "", descricao: produto.descricaoBase ?? "",
      medidas: { pesoKg: numero(produto.pesoKg), alturaCm: numero(produto.alturaCm), larguraCm: numero(produto.larguraCm), comprimentoCm: numero(produto.comprimentoCm) },
      pecas: [], ...(modeloIA ? { modeloIA } : {}),
    }, instrucoes);
  } catch (erro) {
    return sair(1, `A geracao falhou: ${erro.message}`);
  }

  // O "Finalizar" da tela sem nenhuma escolha do dono (`calcularFinal`): a recomendada de cada quadro, na ordem de posicao.
  const quadros = resultado.divergencias ?? [];
  let texto = quadros.length > 0 ? garantirSecaoEspecificacoes(resultado.texto) : resultado.texto;
  const ignoradas = [];
  const ordenados = [...quadros].sort((a, b) => (a.posicao - b.posicao) || (quadros.indexOf(a) - quadros.indexOf(b)));
  for (const quadro of ordenados) {
    const escolhida = Number.isInteger(quadro.recomendada) ? quadro.recomendada : 0;
    const linha = quadro.opcoes[escolhida]?.linha;
    if (!linha) continue;
    texto = inserirEspecificacaoNaPosicao(texto, linha, quadro.posicao ?? Number.POSITIVE_INFINITY, ignoradas);
    ignoradas.push(formatarLinhaTecnica(linha));
  }
  const textoFinal = organizarDescricao(texto);

  const logs = await prisma.logIntegracao.findMany({
    where: { criadoEm: { gte: inicio }, servico: { in: ["ANTHROPIC", "OPENAI"] } }, orderBy: { criadoEm: "asc" },
    select: { servico: true, statusHttp: true, duracaoMs: true, requestResumo: true, responseResumo: true, erro: true },
  });
  console.log(JSON.stringify({
    produto: produto.sku, prompt: nomeDoPrompt, modeloPedido: modeloIA ?? "(padrao da janela)", referencias: ids.length,
    textoFinal, textoBruto: resultado.texto, opcoesParagrafos: resultado.opcoesParagrafos,
    quadros: quadros.map((q) => ({ campo: q.campo, recomendada: q.recomendada, motivo: q.motivo ?? null, opcoes: q.opcoes.map((o) => ({ linha: o.linha, lojas: [...new Set(o.fontes.map((f) => f.nome))] })) })),
    chamadasPagas: logs,
  }, null, 2));
  return sair(0);
}

/**
 * Grava num produto o que o dono APROVOU, lendo um plano em JSON (caminho de arquivo DENTRO do conteiner). Um codigo por
 * vez; recusa produto Conferido (o portao e do dono); imprime em "ANTES" os valores velhos para o dono guardar no PC.
 * Nao chama Bling, ML nem LI. Plano:
 *   { sku, descricaoBase?, fotos?: { novas: [{ id, base64 }], ordem: ["nova:<id>" | "<arquivo>"], paraReserva: ["<arquivo>"] } }
 * `ordem` e a lista FINAL das fotos (a primeira vira a principal); foto atual que sai dela tem de estar em `paraReserva`
 * (vai para a reserva do produto, nao e apagada).
 */
async function gravar(caminhoDoPlano) {
  const { readFile, unlink, writeFile } = await import("node:fs/promises");
  const { randomUUID } = await import("node:crypto");
  const plano = JSON.parse(await readFile(caminhoDoPlano, "utf8"));
  const produto = await prisma.produto.findUnique({ where: { sku: plano.sku } });
  if (!produto) return sair(1, `Produto ${plano.sku} nao existe.`);
  if (produto.conferido) return sair(1, `${plano.sku} esta Conferido: nada foi gravado (o portao e do dono).`);
  // Dois caminhos escrevendo no mesmo produto se atropelam: com proposta aberta, o trabalho vai pela proposta. O
  // `?.` cobre a VPS antes do deploy da tabela (client sem o modelo).
  if (prisma.propostaDeProduto && (await prisma.propostaDeProduto.findUnique({ where: { produtoId: produto.id }, select: { id: true } }))) {
    return sair(1, `${plano.sku} tem proposta aberta: use o comando proposta (ou o dono aprova/apaga a proposta). Nada foi gravado.`);
  }

  const atuais = await prisma.produtoArquivo.findMany({ where: { produtoId: produto.id, tipo: "IMAGEM", papel: "FOTO" }, orderBy: { ordem: "asc" } });
  const porNome = new Map(atuais.map((a) => [a.arquivo, a]));
  const fotos = plano.fotos;
  if (fotos) {
    const ordem = fotos.ordem ?? [];
    const sai = new Set(fotos.paraReserva ?? []);
    for (const item of ordem) if (!item.startsWith("nova:") && !porNome.has(item)) return sair(1, `Foto ${item} nao e uma foto atual do produto. Nada foi gravado.`);
    for (const nome of sai) if (!porNome.has(nome)) return sair(1, `Foto ${nome} (reserva) nao e uma foto atual. Nada foi gravado.`);
    const mantidas = new Set(ordem.filter((i) => !i.startsWith("nova:")));
    const esquecidas = atuais.filter((a) => !mantidas.has(a.arquivo) && !sai.has(a.arquivo));
    if (esquecidas.length > 0) return sair(1, `Fotos atuais que o plano nao mantem nem manda para a reserva: ${esquecidas.map((a) => a.arquivo).join(", ")}. Nada foi gravado.`);
    for (const item of ordem) if (item.startsWith("nova:") && !(fotos.novas ?? []).some((n) => `nova:${n.id}` === item)) return sair(1, `${item} nao esta em "novas". Nada foi gravado.`);
  }

  console.log("ANTES:", JSON.stringify({
    sku: produto.sku, descricaoBase: produto.descricaoBase,
    fotos: atuais.map((a) => ({ arquivo: a.arquivo, ordem: a.ordem, principal: a.principal, mimeType: a.mimeType, tamanhoBytes: a.tamanhoBytes })),
  }));

  const { padronizarImagem } = await import(pathToFileURL(`${RAIZ}/src/lib/imagens/padronizar.js`).href);
  const { gravarNaReserva } = await import(pathToFileURL(`${RAIZ}/src/lib/imagens/reserva.js`).href);

  const criados = []; // arquivos escritos nesta rodada (apagados se o banco falhar)
  const naReserva = [];
  try {
    const nomeDaNova = new Map();
    for (const nova of fotos?.novas ?? []) {
      const padrao = await padronizarImagem(Buffer.from(nova.base64, "base64"));
      if (!padrao.ok) throw new Error(`Foto nova ${nova.id}: ${padrao.erro}`);
      const nome = `${randomUUID().replaceAll("-", "")}.jpg`;
      const destino = caminhoDe(plano.sku, "IMAGEM", nome);
      await mkdir(path.dirname(destino), { recursive: true });
      await writeFile(destino, padrao.bytes);
      criados.push(destino);
      nomeDaNova.set(`nova:${nova.id}`, { nome, tamanho: padrao.bytes.length, nomeOriginal: nova.nomeOriginal ?? null });
    }
    for (const nome of fotos?.paraReserva ?? []) {
      const guardada = await gravarNaReserva(plano.sku, await readFile(caminhoDe(plano.sku, "IMAGEM", nome)));
      naReserva.push({ antigo: nome, ...guardada });
    }

    await prisma.$transaction(async (tx) => {
      if (typeof plano.descricaoBase === "string") await tx.produto.update({ where: { id: produto.id }, data: { descricaoBase: plano.descricaoBase } });
      if (fotos) {
        for (const r of naReserva) {
          const linha = porNome.get(r.antigo);
          await tx.produtoArquivo.update({ where: { id: linha.id }, data: { papel: "RESERVA", arquivo: r.nome, principal: false, ordem: 0, mimeType: r.mimeType, tamanhoBytes: r.tamanhoBytes } });
        }
        let posicao = 0;
        for (const item of fotos.ordem) {
          const principal = posicao === 0;
          if (item.startsWith("nova:")) {
            const n = nomeDaNova.get(item);
            await tx.produtoArquivo.create({ data: { produtoId: produto.id, tipo: "IMAGEM", arquivo: n.nome, nomeOriginal: n.nomeOriginal, mimeType: "image/jpeg", tamanhoBytes: n.tamanho, principal, ordem: posicao, papel: "FOTO", versao: "original" } });
          } else {
            await tx.produtoArquivo.update({ where: { id: porNome.get(item).id }, data: { principal, ordem: posicao } });
          }
          posicao += 1;
        }
      }
    });
  } catch (erro) {
    for (const arquivo of criados) await unlink(arquivo).catch(() => {});
    for (const r of naReserva) await unlink(path.join(pastaDoProduto(plano.sku), "reserva", r.nome)).catch(() => {});
    return sair(1, `Falhou; nada mudou no banco e os arquivos novos foram apagados: ${erro.message}`);
  }
  // So agora os arquivos antigos que foram para a reserva saem de imagens/ (o banco ja aponta para a reserva).
  for (const r of naReserva) await unlink(caminhoDe(plano.sku, "IMAGEM", r.antigo)).catch(() => {});
  return sair(0, `GRAVADO em ${plano.sku}: descricao ${typeof plano.descricaoBase === "string" ? "sim" : "nao"}, fotos ${fotos ? fotos.ordem.length : "intactas"}, para a reserva ${naReserva.length}. Confira com: ler ${plano.sku}`);
}

/** `proposta <sku> --plano=<arquivo>` grava uma secao; `proposta <sku> --ler` imprime a proposta. */
async function proposta(sku) {
  const { gravarProposta, lerProposta } = await import(pathToFileURL(`${RAIZ}/src/lib/proposta/banco.js`).href);
  if (resto.includes("--ler")) {
    const lida = await lerProposta(sku);
    return sair(lida ? 0 : 1, lida ? JSON.stringify(lida, null, 2) : `${sku} nao tem proposta.`);
  }
  const caminho = opcao("plano");
  if (!caminho) return sair(2, "Uso: proposta <sku> --plano=<arquivo json>  ou  proposta <sku> --ler");
  const { readFile } = await import("node:fs/promises");
  const plano = JSON.parse(await readFile(caminho, "utf8"));
  const bytes = new Map(Object.entries(plano.arquivos ?? {}).map(([id, base64]) => [id, Buffer.from(base64, "base64")]));
  const resultado = await gravarProposta(sku, { secao: plano.secao, conteudo: plano.conteudo }, { bytes });
  if (!resultado.ok) return sair(1, `Nada foi gravado: ${resultado.erro}`);
  return sair(0, `PROPOSTA de ${sku}: secao ${plano.secao} gravada. Secoes: ${resultado.secoes.join(", ")}.${resultado.aviso ? ` Aviso: ${resultado.aviso}` : ""}`);
}

async function clonar(origem, novo) {
  if (!skuValido(origem) || !skuValido(novo)) return sair(2, "Codigo invalido: use letras, numeros, ponto, hifen e sublinhado.");
  if (origem.toLowerCase() === novo.toLowerCase()) return sair(2, "O codigo novo precisa ser diferente do original.");

  const fonte = await prisma.produto.findUnique({ where: { sku: origem } });
  if (!fonte) return sair(1, `Produto ${origem} nao existe.`);
  // O SKU e unico no banco, mas o Rise o compara sem caixa nas telas: recusa tambem "100103-TESTE".
  const igual = await prisma.produto.findFirst({ where: { sku: { equals: novo, mode: "insensitive" } }, select: { sku: true } });
  if (igual) return sair(1, `Ja existe o produto ${igual.sku}. Nada foi feito.`);
  const pastaNova = pastaDoProduto(novo);
  if (existsSync(pastaNova)) return sair(1, `A pasta de arquivos ${novo} ja existe no disco. Nada foi feito.`);

  const [arquivos, fornecedores, concorrentes, pecas] = await Promise.all([
    // A reserva (originais e versoes nao escolhidas) nao e foto do produto e nao vai na copia.
    prisma.produtoArquivo.findMany({ where: { produtoId: fonte.id, papel: { not: "RESERVA" } }, orderBy: [{ tipo: "asc" }, { ordem: "asc" }] }),
    prisma.produtoFornecedor.findMany({ where: { produtoId: fonte.id } }),
    prisma.produtoConcorrente.findMany({ where: { produtoId: fonte.id } }),
    prisma.produtoComponente.findMany({ where: { kitId: fonte.id }, orderBy: { ordem: "asc" } }),
  ]);

  // Todo arquivo do banco tem de existir no disco: foto que falta na origem nao pode virar linha na copia.
  const faltando = [];
  for (const arquivo of arquivos) if ((await tamanhoEmDisco(origem, arquivo)) === null) faltando.push(`${arquivo.tipo} ${arquivo.arquivo}`);
  if (faltando.length > 0) return sair(1, `Arquivos da origem que nao estao no disco (nada foi feito): ${faltando.join(", ")}`);

  const campos = Object.fromEntries(Object.entries(fonte).filter(([nome]) => !NAO_COPIA.has(nome)));
  const plano = {
    de: origem, para: novo, tituloBase: fonte.tituloBase,
    camposCopiados: Object.keys(campos).length,
    arquivos: arquivos.length, fornecedores: fornecedores.length, concorrentes: concorrentes.length, pecasDoKit: pecas.length,
    naoCopiado: [...NAO_COPIA].filter((n) => n in fonte),
  };
  console.log("PLANO:", JSON.stringify(plano));
  if (simular) return sair(0, "Simulacao: nada foi gravado.");

  // Arquivos primeiro (nome novo, nunca mexe no que ja existe) e o banco depois, numa transacao: se o banco falhar, a
  // pasta nova e apagada e o produto de origem fica intacto.
  await mkdir(pastaNova, { recursive: true });
  try {
    for (const arquivo of arquivos) {
      const destino = caminhoDe(novo, arquivo.tipo, arquivo.arquivo);
      await mkdir(path.dirname(destino), { recursive: true });
      await copyFile(caminhoDe(origem, arquivo.tipo, arquivo.arquivo), destino);
    }
    const criado = await prisma.$transaction(async (tx) => {
      const produto = await tx.produto.create({ data: { ...campos, sku: novo, ean: null, estoque: 0, conferido: false } });
      if (arquivos.length > 0) {
        await tx.produtoArquivo.createMany({
          data: arquivos.map((a) => ({
            produtoId: produto.id, tipo: a.tipo, arquivo: a.arquivo, nomeOriginal: a.nomeOriginal, mimeType: a.mimeType,
            tamanhoBytes: a.tamanhoBytes, principal: a.principal, ordem: a.ordem, papel: a.papel, versao: a.versao, grupo: null,
          })),
        });
      }
      if (fornecedores.length > 0) {
        await tx.produtoFornecedor.createMany({
          data: fornecedores.map((v) => ({ produtoId: produto.id, fornecedorId: v.fornecedorId, descricao: v.descricao, codigo: v.codigo, precoCusto: v.precoCusto, link: v.link, padrao: v.padrao })),
        });
      }
      if (concorrentes.length > 0) {
        await tx.produtoConcorrente.createMany({
          data: concorrentes.map((v) => ({ produtoId: produto.id, produtoColetadoId: v.produtoColetadoId, fonteManual: v.fonteManual, nomeManual: v.nomeManual, codigoManual: v.codigoManual, precoManual: v.precoManual, linkManual: v.linkManual })),
        });
      }
      if (pecas.length > 0) {
        await tx.produtoComponente.createMany({ data: pecas.map((p) => ({ kitId: produto.id, componenteId: p.componenteId, quantidade: p.quantidade, ordem: p.ordem })) });
      }
      return produto;
    });
    console.log(`CRIADO: ${criado.sku} (id ${criado.id}). Confira com: ler ${novo}`);
  } catch (erro) {
    await rm(pastaNova, { recursive: true, force: true });
    return sair(1, `Falhou e a pasta nova foi apagada (o produto de origem nao mudou): ${erro.message}`);
  }
  return sair(0);
}

if (comando === "ler" && argumentos.length === 1) await ler(argumentos[0]);
else if (comando === "ofertas" && argumentos.length === 1) await ofertas(argumentos[0]);
else if (comando === "descricao" && argumentos.length === 1) await descricao(argumentos[0]);
else if (comando === "proposta" && argumentos.length === 1) await proposta(argumentos[0]);
else if (comando === "gravar" && argumentos.length === 1) await gravar(argumentos[0]);
else if (comando === "clonar" && argumentos.length === 2) await clonar(argumentos[0], argumentos[1]);
else await sair(2, "Uso:\n  ler <sku>\n  ofertas <sku>\n  descricao <sku> --prompt=<nome> [--modelo=<id>]\n  proposta <sku> --plano=<json> | --ler\n  gravar <plano.json no conteiner>\n  clonar <sku> <novo> [--simular]");

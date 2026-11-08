// Vincula ao fornecedor os produtos que entraram no pedido SEM vinculo (roteiro da analise de lista de fornecedor, passo 7;
// o montarPedidoDeCompra devolve semVinculoComOFornecedor e a pagina guarda o item na lista "vincular"). O pedido nao cria
// vinculo, e a linha sairia sem o nome do fornecedor no PDF: em 07/11/2026 tres itens da NexMind ficaram assim. SO com a
// permissao do dono. Roda NA VPS, numa conexao so, com o plano embutido antes do script (analise-fornecedor-embutir.js):
//   globalThis.PLANO = { fornecedor: "<nome no Rise>", itens: [{ n, nome, codigo?, sku }] }
//   - nome: o item como esta na lista gravada da fonte; codigo: o do fornecedor (lista sem codigo: null); sku: o do Rise.
// Sem --confirmo so LE e confere (produto, item na lista gravada, produto ainda sem vinculo com o fornecedor, o item da lista
// em outro produto, a linha no rascunho e o preco dela). Com --confirmo, item a item:
//   1. cria o vinculo: codigo do fornecedor (ou nenhum), descricao = nome na lista, custo da lista, NAO padrao (o custo do
//      produto nao muda; o padrao e decisao do dono na tela);
//   2. poe nome, codigo, vinculo e link na linha do rascunho do fornecedor (quantidade e preco ficam como estao).
import { existsSync } from "node:fs";
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
const { custoDoFornecedor } = await modulo("src/lib/coleta/impostos.js");

const numero = (valor) => (valor == null ? null : Number(valor));
const parar = async (texto) => { console.error(`PAREI: ${texto}`); await prisma.$disconnect(); process.exit(1); };
const semCodigo = (codigo) => !codigo || String(codigo).trim().toUpperCase() === "N/A";
const custoDe = (c) => custoDoFornecedor({ comImpostos: numero(c.precoComImpostos), normal: numero(c.precoNormal), promotional: numero(c.precoPromocional) }, c.impostos);
const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

// --- fornecedor, a fonte dele (a ligada ao cadastro, ou a de mesmo nome) e o rascunho aberto
const fornecedor = await prisma.fornecedor.findFirst({ where: { nome: { equals: PLANO.fornecedor, mode: "insensitive" } }, select: { id: true, nome: true, fonteId: true } });
if (!fornecedor) await parar(`fornecedor "${PLANO.fornecedor}" não está no Rise`);
const fonte = fornecedor.fonteId
  ? await prisma.fonteColeta.findUnique({ where: { id: fornecedor.fonteId }, select: { id: true, nome: true } })
  : await prisma.fonteColeta.findFirst({ where: { nome: { equals: fornecedor.nome, mode: "insensitive" } }, select: { id: true, nome: true } });
if (!fonte) await parar(`a fonte de ${fornecedor.nome} não foi achada (ligue a fonte ao cadastro do fornecedor)`);
const rascunho = await prisma.pedidoDeCompra.findFirst({ where: { fornecedorId: fornecedor.id, status: "RASCUNHO" }, select: { id: true, numero: true } });
const codigoDoPedido = rascunho ? `PC-${String(rascunho.numero).padStart(4, "0")}` : null;
console.log(`Fornecedor ${fornecedor.nome} · fonte ${fonte.nome} · rascunho ${codigoDoPedido ?? "nenhum"}`);

const SELECAO = { id: true, nome: true, codigo: true, url: true, precoComImpostos: true, precoNormal: true, precoPromocional: true, impostos: true, precoOriginal: true };
const problemas = [];
const plano = [];
for (const alvo of PLANO.itens) {
  const rotulo = `#${alvo.n} → ${alvo.sku}`;
  const produto = await prisma.produto.findUnique({ where: { sku: String(alvo.sku) }, select: { id: true, sku: true, tituloBase: true, fornecedores: { select: { fornecedorId: true, codigo: true, descricao: true } } } });
  if (!produto) { problemas.push(`${rotulo}: o produto não existe no Rise`); continue; }
  const coletado = semCodigo(alvo.codigo)
    ? await prisma.produtoColetado.findFirst({ where: { fonteId: fonte.id, nome: alvo.nome }, select: SELECAO })
    : await prisma.produtoColetado.findFirst({ where: { fonteId: fonte.id, codigo: { equals: String(alvo.codigo).trim(), mode: "insensitive" } }, select: SELECAO });
  if (!coletado) { problemas.push(`${rotulo}: fora da lista gravada (${alvo.codigo ?? alvo.nome})`); continue; }
  // Ja vinculado a este item da lista? (a pagina pode ter guardado de novo; o vinculo pode ter sido feito na tela)
  const doMesmoItem = (v) => v.fornecedorId === fornecedor.id && (semCodigo(alvo.codigo) ? v.descricao === coletado.nome : String(v.codigo ?? "").trim().toUpperCase() === String(alvo.codigo).trim().toUpperCase());
  if (produto.fornecedores.some(doMesmoItem)) problemas.push(`${rotulo}: já está vinculado a este item da lista`);
  // O mesmo item da lista em outro produto e normal quando a lista tem uma linha para varias variantes (5V/12V/24V):
  // so informa.
  const outros = await prisma.produtoFornecedor.findMany({
    where: { fornecedorId: fornecedor.id, NOT: { produtoId: produto.id }, ...(semCodigo(alvo.codigo) ? { descricao: coletado.nome } : { codigo: { equals: String(alvo.codigo).trim(), mode: "insensitive" } }) },
    select: { produto: { select: { sku: true } } },
  });
  const custo = custoDe(coletado);
  if (!(custo > 0)) problemas.push(`${rotulo}: sem preço na lista gravada`);
  const item = rascunho
    ? await prisma.itemDoPedidoDeCompra.findFirst({ where: { pedidoId: rascunho.id, produtoId: produto.id }, select: { id: true, quantidade: true, precoUnitario: true, nomeNoFornecedor: true, vinculoId: true } })
    : null;
  plano.push({ alvo, produto, coletado, custo, item, outros: outros.map((v) => v.produto.sku) });
}
for (const p of plano) {
  const linha = p.item ? `linha ${p.item.quantidade} × ${p.item.precoUnitario} (nome hoje: ${JSON.stringify(p.item.nomeNoFornecedor)})` : "fora do rascunho";
  console.log(`  ${p.produto.sku} ${p.produto.tituloBase} ← #${p.alvo.n} "${p.coletado.nome}"${p.coletado.codigo && !semCodigo(p.coletado.codigo) ? ` cód. ${p.coletado.codigo}` : ""} · custo R$ ${p.custo} · ${linha}${p.outros.length ? ` · o item também está no ${p.outros.join(", ")}` : ""}`);
}
if (problemas.length) await parar(`${problemas.length} problema(s): ${problemas.join(" | ")}`);
if (!confirmo) { console.log("Nada gravado. Repita com --confirmo para gravar."); await prisma.$disconnect(); process.exit(0); }

let vinculados = 0;
let linhas = 0;
for (const p of plano) {
  const codigo = semCodigo(p.alvo.codigo) ? null : String(p.coletado.codigo ?? p.alvo.codigo).trim();
  const vinculo = await prisma.produtoFornecedor.create({
    data: {
      produtoId: p.produto.id, fornecedorId: fornecedor.id, descricao: p.coletado.nome, codigo,
      observacao: `Análise da lista de ${fornecedor.nome}, item ${p.alvo.n}.${codigo ? "" : " Sem código na lista: vinculado pelo nome."} Vinculado em ${hoje} a pedido do dono: o item entrou no pedido sem vínculo.`,
      precoFornecedor: p.custo, precoCusto: p.custo, link: p.coletado.url ?? null, padrao: false,
    },
    select: { id: true },
  });
  vinculados++;
  if (p.item) {
    await prisma.itemDoPedidoDeCompra.update({ where: { id: p.item.id }, data: { nomeNoFornecedor: p.coletado.nome, codigoNoFornecedor: codigo, vinculoId: vinculo.id, link: p.coletado.url ?? null } });
    linhas++;
  }
  console.log(`  ${p.produto.sku} + ${fornecedor.nome} (vínculo ${vinculo.id})${p.item ? ` · linha do ${codigoDoPedido} com o nome da lista` : ""}`);
}
console.log(`Vínculos criados: ${vinculados} · linhas do pedido acertadas: ${linhas}`);
await prisma.$disconnect();

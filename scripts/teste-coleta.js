import "dotenv/config";

/**
 * Testes da gravacao da coleta NO BANCO, sem rede.
 *
 * Provam as regras que so aparecem na segunda coleta em diante — o que nenhum
 * teste de extracao alcanca: coleta sem mudanca nao reescreve nada, preco que
 * muda ganha linha na serie, ausente da lista fica com saldo nulo e a data da
 * PRIMEIRA falta, e lista pela metade e recusada inteira.
 *
 * Cria tres fontes de teste e apaga as tres no fim (e no comeco, se uma
 * execucao anterior morreu no meio).
 *
 *   npm run teste:coleta
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("@/lib/db.js");
const { detalheDoProduto, gravarColeta, produtosParaLista } = await import(
  "@/lib/coleta/banco.js"
);
const { aplicarListaDoFornecedor } = await import("@/lib/coleta/coletar.js");
const { chaveDoProduto, linhaDoProduto, produtoDaLinha } = await import(
  "@/lib/coleta/linha.js"
);

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${
      ok ? "" : `\n        obtido=${JSON.stringify(obtido)}\n      esperado=${JSON.stringify(esperado)}`
    }`,
  );
}

const DOMINIOS = ["teste-concorrente.local", "teste-fornecedor.local", "teste-lotes.local"];

function produto({ code, name, normal, promotional = null, status = "AVAILABLE", quantity = null, url = null }) {
  return {
    name,
    code,
    mpn: null,
    ean: null,
    brand: "Marca Teste",
    model: null,
    category: null,
    ncm: null,
    url,
    images: [`https://img.local/${code}.jpg`],
    prices: { normal, promotional, comImpostos: null },
    taxes: [],
    stock: { status, quantity, aChegar: null },
    description: `Descricao de ${name}`,
    specifications: [
      { nome: "Tensao", valor: "5V" },
      { nome: null, valor: "linha sem rotulo" },
    ],
    documentos: [],
    variants: [],
    seo: { title: name, description: "resumo", keywords: null, canonical: url },
    plataforma: null,
    collectedAt: new Date().toISOString(),
    origens: { name: "teste", code: "teste", precoNormal: "teste" },
  };
}

const segundos = (n) => new Date(Date.UTC(2026, 8, 15, 12, 0, n));

await prisma.fonteColeta.deleteMany({ where: { dominio: { in: DOMINIOS } } });

// ---------------------------------------------------------------------------
console.log("\n— conversao produto <-> linha —");

conferir("chave: codigo", chaveDoProduto({ code: "AB-1" }), "codigo:AB-1");
conferir("chave: N/A usa o endereco", chaveDoProduto({ code: "N/A", url: "https://x/p" }), "url:https://x/p");
conferir("chave: sem codigo nem endereco usa o nome", chaveDoProduto({ code: null, name: "Módulo Relé" }), "nome:modulo rele");
conferir("chave: nada que identifique", chaveDoProduto({ code: "N/A" }), null);

const base = produto({ code: "AB-1", name: "Módulo Relé", normal: 12.5 });
const linha = linhaDoProduto(base, { origem: "site" });
const volta = linhaDoProduto(produtoDaLinha(linha), { origem: "site" });
conferir("ida e volta: mesma assinatura", volta.hashConteudo, linha.hashConteudo);
conferir("ida e volta: ficha na mesma ordem, linha sem rotulo preservada", produtoDaLinha(linha).specifications, base.specifications);
conferir(
  "data da leitura nao muda a assinatura",
  linhaDoProduto({ ...base, collectedAt: "2020-01-01T00:00:00.000Z" }, { origem: "site" }).hashConteudo,
  linha.hashConteudo,
);
conferir(
  "ordem das chaves de um objeto nao muda a assinatura (JSONB reordena)",
  linhaDoProduto({ ...base, origens: { precoNormal: "teste", code: "teste", name: "teste" } }, { origem: "site" }).hashConteudo,
  linha.hashConteudo,
);
conferir("buscaTexto sem acento", linha.buscaTexto, "modulo rele marca teste ab-1");
conferir("miniatura e a primeira foto", linha.miniatura, "https://img.local/AB-1.jpg");

// ---------------------------------------------------------------------------
console.log("\n— concorrente: coletas seguidas —");

// PAUSADAS: o teste chama a gravacao direto, e fonte ativa seria enfileirada pelo
// worker — que tentaria varrer um dominio que nao existe enquanto o teste roda.
const concorrente = await prisma.fonteColeta.create({
  data: { nome: "Concorrente Teste", dominio: DOMINIOS[0], tipo: "CONCORRENTE", ativa: false },
});

const mouse = (preco) => produto({ code: "MOU-1", name: "Mouse M170", normal: preco, url: "https://c/mouse" });
const teclado = () => produto({ code: "TEC-1", name: "Teclado K552", normal: 249.9, url: "https://c/teclado" });

let gravacao = await gravarColeta({ fonte: concorrente, produtos: [mouse(89.9), teclado()], origem: "site", coletadoEm: segundos(1) });
conferir("coleta 1: dois novos", [gravacao.novos, gravacao.atualizados], [2, 0]);

const serie = () => prisma.precoHistorico.count({ where: { produto: { fonteId: concorrente.id } } });
conferir("coleta 1: serie com a linha de base de cada um", await serie(), 2);

let fonte = await prisma.fonteColeta.findUnique({ where: { id: concorrente.id } });
conferir("coleta 1: fonte registra a coleta", [fonte.ultimaColetaTotal, fonte.ultimaColetaOrigem], [2, "site"]);

gravacao = await gravarColeta({ fonte: concorrente, produtos: [mouse(89.9), teclado()], origem: "site", coletadoEm: segundos(2) });
conferir("coleta 2 sem mudanca: nada reescrito", [gravacao.novos, gravacao.atualizados, gravacao.inalterados], [0, 0, 2]);
conferir("coleta 2: NENHUMA linha nova de preco", await serie(), 2);

let linhaMouse = await prisma.produtoColetado.findFirst({ where: { fonteId: concorrente.id, codigo: "MOU-1" } });
conferir("coleta 2: vistoEm avancou", linhaMouse.vistoEm.toISOString(), segundos(2).toISOString());

gravacao = await gravarColeta({ fonte: concorrente, produtos: [mouse(79.9), teclado()], origem: "site", coletadoEm: segundos(3) });
conferir("coleta 3: preco do mouse caiu", [gravacao.atualizados, gravacao.precosMudaram], [1, 1]);
conferir("coleta 3: uma linha nova na serie", await serie(), 3);

let detalhe = await detalheDoProduto(linhaMouse.id);
conferir("detalhe: preco anterior", detalhe.precoAnterior, 89.9);
conferir("detalhe: quando mudou", new Date(detalhe.mudouEm).toISOString(), segundos(3).toISOString());

gravacao = await gravarColeta({ fonte: concorrente, produtos: [teclado()], origem: "site", coletadoEm: segundos(4) });
conferir(
  "coleta 4 sem o mouse: ele NAO e apagado (ficar fora da amostra nao prova nada)",
  await prisma.produtoColetado.count({ where: { fonteId: concorrente.id } }),
  2,
);
linhaMouse = await prisma.produtoColetado.findUnique({ where: { id: linhaMouse.id } });
conferir("coleta 4: o mouse guarda a data em que foi visto", linhaMouse.vistoEm.toISOString(), segundos(3).toISOString());

// A tela mostra so a ultima coleta de cada fonte: o mouse continua no banco, com
// o historico dele, e volta a aparecer quando cair numa amostra de novo.
const naLista = (await produtosParaLista()).filter((item) => item.fonte.dominio === DOMINIOS[0]);
conferir(
  "lista da tela: so o que veio na ultima coleta, e sem galeria",
  [naLista.length, naLista[0]?.code, "images" in (naLista[0] ?? {})],
  [1, "TEC-1", false],
);

// ---------------------------------------------------------------------------
console.log("\n— fornecedor: lista, ausente e trava de queda —");

const fornecedor = await prisma.fonteColeta.create({
  data: { nome: "Fornecedor Teste", dominio: DOMINIOS[1], tipo: "FORNECEDOR", ativa: false },
});
const recarregar = () => prisma.fonteColeta.findUnique({ where: { id: fornecedor.id } });

const item = (code, quantity) => produto({ code, name: `Item ${code}`, normal: 10, status: "IN_STOCK", quantity });

let resultado = await aplicarListaDoFornecedor({
  fonte: await recarregar(),
  produtos: [item("X", 5), item("Y", 7), item("Z", 9)],
  listaEnviadaEm: segundos(10),
});
conferir("lista 1: tres produtos", [resultado.erro, resultado.produtos], [null, 3]);

const dataLista2 = segundos(20);
resultado = await aplicarListaDoFornecedor({
  fonte: await recarregar(),
  produtos: [item("X", 5), item("Y", 7)],
  listaEnviadaEm: dataLista2,
});
conferir("lista 2 sem o Z: aceita (2 de 3 nao e queda)", resultado.erro, null);

const linhaZ = () => prisma.produtoColetado.findFirst({ where: { fonteId: fornecedor.id, codigo: "Z" } });
let z = await linhaZ();
conferir("ausente: a linha FICA", Boolean(z), true);
conferir("ausente: saldo nulo, e nao zero", z.quantidade, null);
conferir("ausente: desde a lista em que faltou", z.ausenteDesde.toISOString(), dataLista2.toISOString());
conferir(
  "ausente: a mudanca de estoque entrou na serie",
  await prisma.precoHistorico.count({ where: { produtoId: z.id } }),
  2,
);

resultado = await aplicarListaDoFornecedor({
  fonte: await recarregar(),
  produtos: [item("X", 5), item("Y", 7)],
  listaEnviadaEm: segundos(30),
});
z = await linhaZ();
conferir("lista 3: o Z continua ausente desde a PRIMEIRA falta", z.ausenteDesde.toISOString(), dataLista2.toISOString());
conferir("lista 3 igual a 2: nada reescrito, nem o ausente", resultado.gravacao.atualizados, 0);

// ---------------------------------------------------------------------------
console.log("\n— saldo anterior, para o historico de venda —");

const linhaX = () => prisma.produtoColetado.findFirst({ where: { fonteId: fornecedor.id, codigo: "X" } });

let x = await linhaX();
conferir("primeira lista: nao ha saldo anterior", [x.quantidadeAnterior, x.quantidadeAnteriorEm], [null, null]);

const dataLista4 = segundos(35);
resultado = await aplicarListaDoFornecedor({
  fonte: await recarregar(),
  produtos: [item("X", 2), item("Y", 7)],
  listaEnviadaEm: dataLista4,
});
x = await linhaX();
conferir("saldo mudou de 5 para 2: guarda o 5", [x.quantidadeAnterior, x.quantidade], [5, 2]);
conferir("e guarda quando o 5 foi visto", Boolean(x.quantidadeAnteriorEm), true);

const quandoEra5 = x.quantidadeAnteriorEm;
await aplicarListaDoFornecedor({
  fonte: await recarregar(),
  produtos: [item("X", 2), item("Y", 7)],
  listaEnviadaEm: segundos(36),
});
x = await linhaX();
conferir(
  "lista sem mudanca de saldo: o anterior fica como estava",
  [x.quantidadeAnterior, x.quantidadeAnteriorEm.toISOString()],
  [5, quandoEra5.toISOString()],
);

// O Z esta ausente desde a lista 2, com saldo nulo: "nao veio" nao e saldo novo.
z = await linhaZ();
conferir("ausente nao vira saldo anterior", z.quantidadeAnterior, null);

// ---------------------------------------------------------------------------
resultado = await aplicarListaDoFornecedor({
  fonte: await recarregar(),
  produtos: [item("X", 1)],
  listaEnviadaEm: segundos(40),
});
conferir("lista 4 com 1 de 3: recusada pela trava", /sumiriam/.test(resultado.erro ?? ""), true);
conferir(
  "lista recusada: nada foi tocado",
  (await prisma.produtoColetado.findFirst({ where: { fonteId: fornecedor.id, codigo: "X" } })).quantidade,
  2,
);

// ---------------------------------------------------------------------------
console.log("\n— varredura gravada em lotes —");

// A fonte ja tem uma coleta antiga; a varredura nova grava dois lotes sem fechar
// e fecha no fim com a data do INICIO. A lista da tela precisa mostrar os tres
// produtos da varredura nova — e so eles.
const lotes = await prisma.fonteColeta.create({
  data: { nome: "Lotes Teste", dominio: DOMINIOS[2], tipo: "CONCORRENTE", ativa: false },
});
const peca = (code) => produto({ code, name: `Peca ${code}`, normal: 10, url: `https://l/${code}` });

await gravarColeta({ fonte: lotes, produtos: [peca("VELHA")], origem: "site", coletadoEm: segundos(50) });

const inicioVarredura = segundos(60);
await gravarColeta({ fonte: lotes, produtos: [peca("L1")], origem: "site", coletadoEm: segundos(61), fecharColeta: false });
let fonteLotes = await prisma.fonteColeta.findUnique({ where: { id: lotes.id } });
conferir(
  "lote no meio da varredura nao mexe na ultima coleta",
  [fonteLotes.ultimaColetaEm.toISOString(), fonteLotes.ultimaColetaTotal],
  [segundos(50).toISOString(), 1],
);

await gravarColeta({ fonte: lotes, produtos: [peca("L2")], origem: "site", coletadoEm: segundos(62), fecharColeta: false });
await gravarColeta({
  fonte: lotes,
  produtos: [peca("L3")],
  origem: "site",
  coletadoEm: segundos(63),
  inicioDaColeta: inicioVarredura,
  totalDaColeta: 3,
});
fonteLotes = await prisma.fonteColeta.findUnique({ where: { id: lotes.id } });
conferir(
  "fechamento: ultima coleta com a data do inicio e o total da varredura",
  [fonteLotes.ultimaColetaEm.toISOString(), fonteLotes.ultimaColetaTotal],
  [inicioVarredura.toISOString(), 3],
);

const naListaLotes = (await produtosParaLista())
  .filter((item) => item.fonte.dominio === DOMINIOS[2])
  .map((item) => item.code)
  .sort();
conferir("a lista mostra os tres lotes, e nao a coleta antiga", naListaLotes, ["L1", "L2", "L3"]);

// Produto achado de novo num lote seguinte nao duplica.
await gravarColeta({ fonte: lotes, produtos: [peca("L1")], origem: "site", coletadoEm: segundos(64), fecharColeta: false });
conferir(
  "produto repetido em outro lote: uma linha so",
  await prisma.produtoColetado.count({ where: { fonteId: lotes.id, codigo: "L1" } }),
  1,
);

// ---------------------------------------------------------------------------
await prisma.fonteColeta.deleteMany({ where: { dominio: { in: DOMINIOS } } });
await prisma.$disconnect();

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

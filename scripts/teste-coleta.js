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
const { detalheDoProduto, gravarColeta, listarProdutos, produtosParaLista } = await import(
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

const DOMINIOS = [
  "teste-concorrente.local",
  "teste-fornecedor.local",
  "teste-lotes.local",
  "teste-primeira.local",
  "teste-ampla.local",
  "teste-pelafonte.local",
  "teste-custo.local",
  "teste-adicional.local",
];

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

// A tela mostra TODOS os produtos do banco (pedido do dono em 07/10/2026; antes so a ultima coleta de cada
// fonte). O que a ultima varredura nao viu vem marcado com a data em que foi visto pela ultima vez.
const naLista = (await produtosParaLista())
  .filter((item) => item.fonte.dominio === DOMINIOS[0])
  .sort((a, b) => a.code.localeCompare(b.code));
conferir(
  "lista da tela: os dois produtos, e sem galeria",
  [naLista.map((item) => item.code), "images" in (naLista[0] ?? {})],
  [["MOU-1", "TEC-1"], false],
);
conferir(
  "o mouse, fora da ultima coleta, vem marcado com quando foi visto; o teclado nao",
  [naLista[0]?.naoVistoDesde, naLista[1]?.naoVistoDesde],
  [segundos(3).toISOString(), null],
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
conferir("a lista mostra os tres lotes E a coleta antiga", naListaLotes, ["L1", "L2", "L3", "VELHA"]);

// A lista da TELA do Scraper (SQL no banco): todos aparecem, os nao vistos marcados e por ultimo.
const telaLotes = await listarProdutos({ fontes: ["Lotes Teste"] });
conferir("tela: conta os quatro", telaLotes.total, 4);
conferir(
  "tela: o nao visto na ultima varredura vem por ultimo, marcado com a data em que foi visto",
  [telaLotes.linhas.at(-1)?.code, telaLotes.linhas.at(-1)?.naoVistoDesde],
  ["VELHA", segundos(50).toISOString()],
);
conferir("tela: os da ultima varredura nao vem marcados", telaLotes.linhas.slice(0, 3).map((linha) => linha.naoVistoDesde), [null, null, null]);
const telaPorPreco = await listarProdutos({ fontes: ["Lotes Teste"], ordem: "menor" });
conferir("tela: ordenado por preco, o nao visto continua por ultimo", telaPorPreco.linhas.at(-1)?.code, "VELHA");
// Filtro de coluna (23/10/2026): codigo crescente e decrescente, com o nao visto sempre por ultimo.
const porCodigo = async (direcao) =>
  (await listarProdutos({ fontes: ["Lotes Teste"], ordenar: "codigo", direcao })).linhas.map((linha) => linha.code);
conferir("tela: coluna Código crescente", await porCodigo("asc"), ["L1", "L2", "L3", "VELHA"]);
conferir("tela: coluna Código decrescente, nao visto por ultimo", await porCodigo("desc"), ["L3", "L2", "L1", "VELHA"]);

// Produto achado de novo num lote seguinte nao duplica.
await gravarColeta({ fonte: lotes, produtos: [peca("L1")], origem: "site", coletadoEm: segundos(64), fecharColeta: false });
conferir(
  "produto repetido em outro lote: uma linha so",
  await prisma.produtoColetado.count({ where: { fonteId: lotes.id, codigo: "L1" } }),
  1,
);

// PRIMEIRA varredura, ainda sem fechar: a fonte nao tem `ultimaColetaEm`, e os
// lotes gravados precisam aparecer na lista (a Mamute Eletronica, com 3.711
// produtos no banco, sumia da tabela e do filtro de fontes em 17/09/2026).
const primeira = await prisma.fonteColeta.create({
  data: { nome: "Primeira Teste", dominio: DOMINIOS[3], tipo: "CONCORRENTE", ativa: false },
});
await gravarColeta({ fonte: primeira, produtos: [peca("P1")], origem: "site", coletadoEm: segundos(70), fecharColeta: false });
await gravarColeta({ fonte: primeira, produtos: [peca("P2")], origem: "site", coletadoEm: segundos(71), fecharColeta: false });
const naListaPrimeira = (await produtosParaLista())
  .filter((item) => item.fonte.dominio === DOMINIOS[3])
  .map((item) => item.code)
  .sort();
conferir("primeira varredura ainda aberta: os lotes ja aparecem na lista", naListaPrimeira, ["P1", "P2"]);

// ---------------------------------------------------------------------------
// BUSCA AMPLA (pedido do dono em 09/10/2026): com o botao ligado, procura tambem na descricao, na ficha e no SEO.
console.log("\n— busca ampla (descricao, ficha, SEO) —");
const { EXPRESSAO_AMPLA_COLETADO, EXPRESSAO_BUSCA_PRODUTO, EXPRESSAO_AMPLA_PRODUTO, idsDaBuscaDeProdutos, ondeAchouNoProduto } =
  await import("@/lib/buscaAmpla.js");
const { readFile } = await import("node:fs/promises");
const migracaoAmpla = await readFile(new URL("../prisma/migrations/20261009_busca_ampla/migration.sql", import.meta.url), "utf8");
conferir(
  "a migration usa as MESMAS expressoes da busca (senao o banco nao usa o indice)",
  [EXPRESSAO_AMPLA_COLETADO, EXPRESSAO_BUSCA_PRODUTO, EXPRESSAO_AMPLA_PRODUTO].map((expressao) => migracaoAmpla.includes(`((${expressao}) gin_trgm_ops)`)),
  [true, true, true],
);
// Revisao de seguranca de 22/10/2026: "%" e "_" digitados sao texto, nao curinga do LIKE.
const { padraoLike } = await import("@/lib/buscaAmpla.js");
conferir("o LIKE escapa %, _ e a barra da palavra", [padraoLike("920302_1"), padraoLike("50%"), padraoLike("a\\b")], ["%920302\\_1%", "%50\\%%", "%a\\\\b%"]);

const amplaFonte = await prisma.fonteColeta.create({
  data: { nome: "Ampla Teste", dominio: DOMINIOS[4], tipo: "CONCORRENTE", ativa: false },
});
const comTexto = (code, name, extra = {}) => ({ ...produto({ code, name, normal: 10, url: `https://a/${code}` }), ...extra });
await gravarColeta({
  fonte: amplaFonte,
  produtos: [
    comTexto("A1", "Placa Zzampla Nome"),
    comTexto("A2", "Outra placa", { description: "Leva o chip Zzampla na placa" }),
    comTexto("A3", "Terceira placa", { specifications: [{ nome: "Chip", valor: "Zzampla" }] }),
    comTexto("A4", "Quarta peca", { seo: { title: "ZZÁMPLA no titulo da pagina", description: null, keywords: null, canonical: null } }),
    comTexto("A5", "Sem a palavra"),
  ],
  origem: "site",
  coletadoEm: segundos(80),
});
const buscaNormal = await listarProdutos({ fontes: ["Ampla Teste"], busca: "zzampla" });
conferir("busca normal: so o que tem a palavra no nome", buscaNormal.linhas.map((linha) => linha.code), ["A1"]);
const buscaAmpla = await listarProdutos({ fontes: ["Ampla Teste"], busca: "zzampla", ampla: true });
conferir(
  "busca ampla: tambem descricao, ficha e SEO (com acento no texto da loja)",
  [buscaAmpla.total, buscaAmpla.linhas.map((linha) => linha.code).sort()],
  [4, ["A1", "A2", "A3", "A4"]],
);
conferir("busca ampla: o achado pelo nome vem primeiro", buscaAmpla.linhas[0]?.code, "A1");
conferir(
  "busca ampla: o selo diz onde achou (o achado pelo nome nao tem selo)",
  Object.fromEntries(buscaAmpla.linhas.map((linha) => [linha.code, linha.achadoEm])),
  { A1: [], A2: ["descrição"], A3: ["ficha técnica"], A4: ["SEO"] },
);
const duasPalavras = await listarProdutos({ fontes: ["Ampla Teste"], busca: "outra zzampla", ampla: true });
conferir("busca ampla: todas as palavras, cada uma em qualquer parte", duasPalavras.linhas.map((linha) => linha.code), ["A2"]);
conferir("busca normal continua sem selo", buscaNormal.linhas[0]?.achadoEm, []);

// A busca ampla tambem acha pelo NOME DA FONTE (pedido do dono em 11/10/2026): "4hobby" traz tudo da 4hobby.
// Fonte com nome unico ("Zzpelafonte"): nenhum produto de verdade tem essa palavra no texto.
const pelaFonteFonte = await prisma.fonteColeta.create({
  data: { nome: "Zzpelafonte Loja", dominio: DOMINIOS[5], tipo: "CONCORRENTE", ativa: false },
});
await gravarColeta({
  fonte: pelaFonteFonte,
  produtos: [comTexto("F1", "Peca um"), comTexto("F2", "Peca dois com chip Zzfontechip")],
  origem: "site",
  coletadoEm: segundos(80),
});
const pelaFonte = await listarProdutos({ busca: "zzpelafonte", ampla: true });
conferir(
  "busca ampla: o nome da fonte traz todos os produtos dela (e so os dela)",
  [pelaFonte.total, pelaFonte.linhas.map((linha) => linha.code).sort()],
  [2, ["F1", "F2"]],
);
conferir(
  "busca ampla: o nome da fonte nao gera selo",
  pelaFonte.linhas.every((linha) => linha.achadoEm.length === 0),
  true,
);
const fonteMaisTexto = await listarProdutos({ busca: "zzpelafonte zzfontechip", ampla: true });
conferir(
  "busca ampla: uma palavra pela fonte e outra pelo texto da loja",
  fonteMaisTexto.linhas.map((linha) => linha.code),
  ["F2"],
);
conferir(
  "busca ampla: o nome da fonte e a aba (outra aba nao a ve)",
  (await listarProdutos({ tipo: "FORNECEDOR", busca: "zzpelafonte", ampla: true })).total,
  0,
);
conferir("busca normal NAO procura pelo nome da fonte", (await listarProdutos({ busca: "zzpelafonte" })).total, 0);

// Produtos do Rise: a mesma regra, com indice proprio.
const SKUS_AMPLA = ["ZZ-AMPLA-1", "ZZ-AMPLA-2", "ZZ-AMPLA-3"];
await prisma.produto.deleteMany({ where: { sku: { in: SKUS_AMPLA } } });
try {
  await prisma.produto.createMany({
    data: [
      { sku: "ZZ-AMPLA-1", tituloBase: "Modulo Zzproduto" },
      { sku: "ZZ-AMPLA-2", tituloBase: "Outro modulo", descricaoBase: "Usa o chip ZZPRÓDUTO na placa" },
      { sku: "ZZ-AMPLA-3", tituloBase: "Terceiro modulo", localizacao: "zzproduto-r1" },
    ],
  });
  const skus = async (ids) =>
    (await prisma.produto.findMany({ where: { id: { in: ids } }, select: { sku: true } })).map((p) => p.sku).sort();
  conferir("produtos, busca normal: so pelo nome", await skus(await idsDaBuscaDeProdutos("zzproduto")), ["ZZ-AMPLA-1"]);
  conferir(
    "produtos, busca ampla: tambem descricao (com acento) e localizacao",
    await skus(await idsDaBuscaDeProdutos("zzproduto", { ampla: true })),
    SKUS_AMPLA,
  );
  conferir("produtos, busca normal acha pelo codigo", await skus(await idsDaBuscaDeProdutos("zz-ampla-3")), ["ZZ-AMPLA-3"]);
  conferir("produtos, sem palavras: nenhuma restricao (null)", await idsDaBuscaDeProdutos("   "), null);
  const segundo = await prisma.produto.findUnique({ where: { sku: "ZZ-AMPLA-2" } });
  conferir("produtos: o selo diz onde achou", ondeAchouNoProduto(segundo, ["zzproduto"]), ["descrição"]);

  // Pesquisa profunda pelos VINCULOS (pedido do dono em 20/10/2026: "patola" traz os produtos do fornecedor Patola):
  // o nome do fornecedor, o codigo e a descricao do produto nele, o rascunho do Bling e a loja do concorrente.
  const forn = await prisma.fornecedor.create({ data: { nome: "ZZ Fornpatolinha" } });
  const p1 = await prisma.produto.findUnique({ where: { sku: "ZZ-AMPLA-1" } });
  await prisma.produtoFornecedor.create({ data: { produtoId: p1.id, fornecedorId: forn.id, codigo: "ZZCOD-77", descricao: "zzdescforn item" } });
  await prisma.produto.update({ where: { sku: "ZZ-AMPLA-2" }, data: { fornecedorRascunho: { nome: "ZZ Rascunhoblíng", codigo: "zzrasc-9" } } });
  const p3 = await prisma.produto.findUnique({ where: { sku: "ZZ-AMPLA-3" } });
  await prisma.produtoConcorrente.create({ data: { produtoId: p3.id, fonteManual: "ZZ Lojaconcorrente" } });
  conferir("vinculos: o nome do fornecedor acha o produto", await skus(await idsDaBuscaDeProdutos("fornpatolinha", { ampla: true })), ["ZZ-AMPLA-1"]);
  conferir("vinculos: o codigo no fornecedor acha", await skus(await idsDaBuscaDeProdutos("zzcod-77", { ampla: true })), ["ZZ-AMPLA-1"]);
  conferir("vinculos: a descricao no fornecedor acha", await skus(await idsDaBuscaDeProdutos("zzdescforn", { ampla: true })), ["ZZ-AMPLA-1"]);
  conferir("vinculos: o rascunho do Bling acha (sem acento)", await skus(await idsDaBuscaDeProdutos("rascunhobling", { ampla: true })), ["ZZ-AMPLA-2"]);
  conferir("vinculos: o codigo do rascunho acha", await skus(await idsDaBuscaDeProdutos("zzrasc-9", { ampla: true })), ["ZZ-AMPLA-2"]);
  conferir("vinculos: a loja do concorrente acha", await skus(await idsDaBuscaDeProdutos("lojaconcorrente", { ampla: true })), ["ZZ-AMPLA-3"]);
  conferir("vinculos: uma palavra pelo fornecedor e outra pelo nome", await skus(await idsDaBuscaDeProdutos("fornpatolinha modulo", { ampla: true })), ["ZZ-AMPLA-1"]);
  conferir("vinculos: a busca normal NAO procura nos vinculos", await idsDaBuscaDeProdutos("fornpatolinha"), []);
  const comVinculos = { ...p1, fornecedores: [{ fornecedor: { nome: "ZZ Fornpatolinha" }, codigo: "ZZCOD-77", descricao: null }], concorrentes: [] };
  conferir("vinculos: o selo diz que achou no fornecedor", ondeAchouNoProduto(comVinculos, ["fornpatolinha"]), ["fornecedor"]);
  const comConcorrente = { ...p3, fornecedores: [], concorrentes: [{ fonteManual: "ZZ Lojaconcorrente", produtoColetado: null }] };
  conferir("vinculos: o selo diz que achou no concorrente", ondeAchouNoProduto(comConcorrente, ["lojaconcorrente"]), ["concorrente"]);
} finally {
  await prisma.produto.deleteMany({ where: { sku: { in: SKUS_AMPLA } } });
  await prisma.fornecedor.deleteMany({ where: { nome: "ZZ Fornpatolinha" } });
}

// ---------------------------------------------------------------------------
// O CUSTO DO FORNECEDOR SEGUE A VARREDURA (23/10/2026, Opcao 1): ao fechar a coleta, o vinculo cujo codigo esta na
// lista ganha o custo com impostos; o de codigo fora da lista fica como estava.
await prisma.produto.deleteMany({ where: { sku: { in: ["ZZ-CUSTO-1", "ZZ-CUSTO-2"] } } });
await prisma.fornecedor.deleteMany({ where: { nome: "ZZ Fornecedor Custo" } });
try {
  const fonteCusto = await prisma.fonteColeta.create({
    data: { nome: "ZZ Fonte Custo", dominio: "teste-custo.local", tipo: "FORNECEDOR", ativa: false },
  });
  const fornCusto = await prisma.fornecedor.create({
    data: { nome: "ZZ Fornecedor Custo", fonteId: fonteCusto.id, cnpj: "98.765.432/0001-98" },
  });
  const prodCusto = await prisma.produto.create({ data: { sku: "ZZ-CUSTO-1", tituloBase: "Produto teste custo" } });
  const naLista = await prisma.produtoFornecedor.create({
    data: { produtoId: prodCusto.id, fornecedorId: fornCusto.id, codigo: "zz-c1", precoCusto: 31.9, padrao: true },
  });
  // Um segundo produto com o mesmo codigo, NUNCA sincronizado com o Bling: o custo muda, mas nao vai ao Bling.
  const prodSemBling = await prisma.produto.create({ data: { sku: "ZZ-CUSTO-2", tituloBase: "Produto teste custo 2" } });
  await prisma.produtoFornecedor.create({
    data: { produtoId: prodSemBling.id, fornecedorId: fornCusto.id, codigo: "ZZ-C1", precoCusto: 31.9, padrao: true },
  });
  // O primeiro esta EM DIA com o Bling: a assinatura gravada e a de hoje.
  const { lerProdutoDoRise } = await import("@/lib/blingSync/leitura.js");
  const { assinaturaDoRise, normalizarDoRise, normalizarFornecedoresDoRise } = await import("@/lib/blingSync/campos.js");
  const lidoCusto = await lerProdutoDoRise(prodCusto.id);
  await prisma.produto.update({
    where: { id: prodCusto.id },
    data: {
      blingSincronizadoEm: new Date(),
      blingAssinatura: assinaturaDoRise(normalizarDoRise(lidoCusto), normalizarFornecedoresDoRise(lidoCusto.fornecedores)),
    },
  });

  const comIpi = { ...produto({ code: "ZZ-C1", name: "Peca custo", normal: 31.9 }), taxes: [{ nome: "IPI", percentual: 2 }] };
  comIpi.prices.comImpostos = 32.54;
  const mandadosAoBling = [];
  const enviarCustos = async (ids) => {
    mandadosAoBling.push(...ids);
    return { enviados: ids.length, falhas: [] };
  };
  const gravacaoCusto = await gravarColeta({ fonte: fonteCusto, produtos: [comIpi], origem: "arquivo", enviarCustos });
  const depois = await prisma.produtoFornecedor.findUnique({ where: { id: naLista.id } });
  conferir("custo: o vinculo ganha o custo com IPI da varredura (codigo sem caixa)", Number(depois.precoCusto), 32.54);
  conferir("custo: a gravacao conta os dois vinculos atualizados", gravacaoCusto.custosAtualizados, 2);
  conferir("custo ao Bling: so o produto que estava em dia vai ao Bling", mandadosAoBling, [prodCusto.id]);
  await prisma.produto.update({ where: { id: prodCusto.id }, data: { blingSincronizadoEm: null, blingAssinatura: null } });

  // Codigo que nao esta na lista: o custo fica.
  await prisma.produtoFornecedor.update({ where: { id: naLista.id }, data: { codigo: "OUTRO", precoCusto: 50 } });
  await gravarColeta({ fonte: fonteCusto, produtos: [comIpi], origem: "arquivo" });
  const fora = await prisma.produtoFornecedor.findUnique({ where: { id: naLista.id } });
  conferir("custo: codigo fora da lista nao muda", Number(fora.precoCusto), 50);

  // Lote no meio da varredura nao mexe (so o fechamento).
  await prisma.produtoFornecedor.update({ where: { id: naLista.id }, data: { codigo: "ZZ-C1", precoCusto: 10 } });
  await gravarColeta({ fonte: fonteCusto, produtos: [comIpi], origem: "site", fecharColeta: false });
  const lote = await prisma.produtoFornecedor.findUnique({ where: { id: naLista.id } });
  conferir("custo: lote sem fechar a coleta nao mexe", Number(lote.precoCusto), 10);
} finally {
  await prisma.produto.deleteMany({ where: { sku: { in: ["ZZ-CUSTO-1", "ZZ-CUSTO-2"] } } });
  await prisma.fornecedor.deleteMany({ where: { nome: "ZZ Fornecedor Custo" } });
}

// ---------------------------------------------------------------------------
// CUSTO ADICIONAL NA LINHA DO FORNECEDOR (24/10/2026, opcao 1 + vinculo a um codigo do Rise): o custo do vinculo e o
// preco do fornecedor mais os adicionais (valor fixo ou quantidade x o custo de hoje de outro produto do Rise), e o
// custo do cabo que muda refaz o do Arduino, em cadeia, inclusive pela varredura.
const SKUS_ADIC = ["ZZ-ADIC-CABO", "ZZ-ADIC-ARD", "ZZ-ADIC-KIT"];
await prisma.produto.deleteMany({ where: { sku: { in: SKUS_ADIC } } });
await prisma.fornecedor.deleteMany({ where: { nome: "ZZ Fornecedor Adicional" } });
try {
  const { custoTotal, normalizarAdicionais, somaDosAdicionais } = await import("@/lib/custoAdicionalRegras.js");
  const { produtosQueDependem, recalcularQuemUsa, recalcularVinculos, vinculosDoProduto } = await import("@/lib/custoAdicional.js");

  conferir("adicional: lixo sai, repetido soma e o proprio produto nao entra", normalizarAdicionais([
    { descricao: "Cabo", valor: "2,5" }, { descricao: "", valor: 3 }, { descricao: "Zero", valor: 0 },
    { produtoId: "a", quantidade: 1 }, { produtoId: "a", quantidade: "2" }, { produtoId: "eu", quantidade: 1 },
    { produtoId: "b", quantidade: 0 }, null, "texto",
  ], "eu"), [{ descricao: "Cabo", valor: 2.5 }, { produtoId: "a", quantidade: 3 }]);
  conferir("adicional: produto sem custo conta zero e avisa", somaDosAdicionais(
    [{ descricao: "X", valor: 1 }, { produtoId: "c", quantidade: 2 }, { produtoId: "d", quantidade: 1 }],
    (id) => (id === "c" ? 3.2 : null)), { total: 7.4, semCusto: ["d"] });
  conferir("adicional: sem preco do fornecedor nao ha custo", custoTotal(null, 5), null);
  conferir("adicional: total em centavos", custoTotal("20.10", 0.2), 20.3);

  const fonteAdic = await prisma.fonteColeta.create({
    data: { nome: "ZZ Fonte Adicional", dominio: "teste-adicional.local", tipo: "FORNECEDOR", ativa: false },
  });
  const fornAdic = await prisma.fornecedor.create({
    data: { nome: "ZZ Fornecedor Adicional", fonteId: fonteAdic.id, cnpj: "11.222.333/0001-81" },
  });
  const cabo = await prisma.produto.create({ data: { sku: "ZZ-ADIC-CABO", tituloBase: "Cabo teste" } });
  const ard = await prisma.produto.create({ data: { sku: "ZZ-ADIC-ARD", tituloBase: "Arduino teste" } });
  const kit = await prisma.produto.create({ data: { sku: "ZZ-ADIC-KIT", tituloBase: "Kit teste" } });
  const vCabo = await prisma.produtoFornecedor.create({
    data: { produtoId: cabo.id, fornecedorId: fornAdic.id, codigo: "ZZ-CABO", precoCusto: 3.2, precoFornecedor: 3.2, padrao: true },
  });
  const vArd = await prisma.produtoFornecedor.create({
    data: {
      produtoId: ard.id, fornecedorId: fornAdic.id, codigo: "ZZ-ARD", precoCusto: 20, precoFornecedor: 20, padrao: true,
      adicionais: [{ descricao: "Embalagem", valor: 0.5 }, { produtoId: cabo.id, quantidade: 2 }],
    },
  });
  const vKit = await prisma.produtoFornecedor.create({
    data: { produtoId: kit.id, fornecedorId: fornAdic.id, precoCusto: 1, precoFornecedor: 1, padrao: true, adicionais: [{ produtoId: ard.id, quantidade: 1 }] },
  });
  const custoDe = async (id) => {
    const linha = await prisma.produtoFornecedor.findUnique({ where: { id } });
    return [Number(linha.precoFornecedor), Number(linha.adicionaisValor), Number(linha.precoCusto)];
  };

  const mudaramArd = await recalcularVinculos(await vinculosDoProduto(ard.id));
  conferir("adicional: Arduino = 20 + embalagem 0,50 + 2 cabos de 3,20", await custoDe(vArd.id), [20, 6.9, 26.9]);
  conferir("adicional: o vinculo padrao leva o custo do produto", Number((await prisma.produto.findUnique({ where: { id: ard.id } })).custo), 26.9);
  conferir("adicional: devolve o produto que mudou de custo", mudaramArd, [ard.id]);
  conferir("adicional: refazer sem mudanca nao grava nada", await recalcularVinculos(await vinculosDoProduto(ard.id)), []);
  await recalcularVinculos(await vinculosDoProduto(kit.id));
  conferir("adicional: o kit soma o Arduino com o cabo dentro", await custoDe(vKit.id), [1, 26.9, 27.9]);

  conferir("adicional: quem depende do cabo, em cadeia", (await produtosQueDependem([cabo.id])).sort(), [ard.id, kit.id].sort());

  // O dono salva o cabo com outro custo: o Arduino e o kit acompanham.
  await prisma.produtoFornecedor.update({ where: { id: vCabo.id }, data: { precoCusto: 5, precoFornecedor: 5 } });
  const cadeia = await recalcularQuemUsa([cabo.id]);
  conferir("adicional: cabo a 5 leva o Arduino a 30,50", await custoDe(vArd.id), [20, 10.5, 30.5]);
  conferir("adicional: e o kit a 31,50", await custoDe(vKit.id), [1, 30.5, 31.5]);
  conferir("adicional: a cadeia devolve os dois", cadeia.sort(), [ard.id, kit.id].sort());

  // A varredura: o fornecedor muda o preco do cabo e do Arduino; o total soma o adicional e a cadeia segue.
  await gravarColeta({
    fonte: fonteAdic,
    produtos: [produto({ code: "ZZ-CABO", name: "Cabo", normal: 6 }), produto({ code: "ZZ-ARD", name: "Arduino", normal: 22 })],
    origem: "arquivo",
  });
  conferir("adicional, varredura: o cabo vai a 6", await custoDe(vCabo.id), [6, 0, 6]);
  conferir("adicional, varredura: o Arduino = 22 + 0,50 + 2 x 6", await custoDe(vArd.id), [22, 12.5, 34.5]);
  conferir("adicional, varredura: o kit acompanha", await custoDe(vKit.id), [1, 34.5, 35.5]);
} finally {
  await prisma.produto.deleteMany({ where: { sku: { in: SKUS_ADIC } } });
  await prisma.fornecedor.deleteMany({ where: { nome: "ZZ Fornecedor Adicional" } });
}

// ---------------------------------------------------------------------------
await prisma.fonteColeta.deleteMany({ where: { dominio: { in: DOMINIOS } } });
await prisma.$disconnect();

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

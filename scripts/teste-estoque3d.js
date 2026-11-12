import "dotenv/config";

/**
 * Testes do Mapa do estoque (spec 2026-11-12-enderecamento-de-estoque-design.md): as regras puras (leitura da
 * localizacao, pecas que cabem na caixinha, caixinha certa, peso, a cena montada) e o banco (colunas pela localizacao,
 * cadastro de coluna e de modelo, a caixinha do produto). SEM rede.
 *
 *   npm run teste:estoque3d
 *
 * So escreve produtos ZZ-E3D-*, as colunas ZY e ZZ e os modelos "ZZ E3D *", e apaga tudo no fim.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

const { capacidadeDoProduto, colunasPelaLocalizacao, lerLocalizacao, menorCaixinha, montarMapa, nivelDaPrateleira, pecasQueCabem, pesoDaCaixinha, quantidadeAGuardar, textoDaLocalizacao } = await import(
  "../src/lib/estoque3d/regras.js"
);

console.log("Leitura da localizacao");
conferir("M2", lerLocalizacao("M2"), { letra: "M", numero: 2 });
conferir("minuscula, espaco e zero a esquerda", [lerLocalizacao(" m 2 "), lerLocalizacao("R-014".replace("0", ""))], [{ letra: "M", numero: 2 }, { letra: "R", numero: 14 }]);
conferir("so a letra", lerLocalizacao("X"), { letra: "X", numero: null });
conferir("CHAO, vazio e lixo ficam fora", [lerLocalizacao("CHAO"), lerLocalizacao(""), lerLocalizacao(null), lerLocalizacao("M2B")], [null, null, null, null]);
conferir("texto da localizacao", [textoDaLocalizacao("m", 2), textoDaLocalizacao("X", null), textoDaLocalizacao("", 2)], ["M2", "X", null]);

console.log("\nPecas que cabem na caixinha");
const P = { nome: "P", larguraCm: 10, alturaCm: 8, profundidadeCm: 20, fatorUtil: 0.7 };
const G = { nome: "G", larguraCm: 20, alturaCm: 15, profundidadeCm: 35, fatorUtil: 0.7 };
// P: 1600 cm3 x 0,7 x 0,85 = 952 cm3 uteis.
conferir("peca de 1 cm3", pecasQueCabem(P, { larguraCm: 1, alturaCm: 1, comprimentoCm: 1 }), { pecas: 952, motivo: null });
conferir("peca de 2x3x4 (24 cm3)", pecasQueCabem(P, { larguraCm: 2, alturaCm: 3, comprimentoCm: 4 }).pecas, 39);
conferir("peca comprida entra deitada (rotacao)", pecasQueCabem(P, { larguraCm: 18, alturaCm: 2, comprimentoCm: 2 }).pecas, 13);
conferir("peca maior que a caixinha nao entra", pecasQueCabem(P, { larguraCm: 25, alturaCm: 2, comprimentoCm: 2 }), { pecas: 0, motivo: "A peça não entra nesta caixinha." });
conferir("peca que passa cabe ao menos uma", pecasQueCabem(P, { larguraCm: 9, alturaCm: 7, comprimentoCm: 19 }).pecas, 1);
conferir("produto sem medida", pecasQueCabem(P, { larguraCm: 2, alturaCm: null, comprimentoCm: 4 }), { pecas: null, motivo: "Produto sem medidas no cadastro." });
conferir("sem caixinha", pecasQueCabem(null, { larguraCm: 2, alturaCm: 3, comprimentoCm: 4 }).pecas, null);
conferir("digitado vence a estimativa", capacidadeDoProduto({ pecasPorCaixinha: 50, larguraCm: 1, alturaCm: 1, comprimentoCm: 1 }, P), { pecas: 50, origem: "digitado", motivo: null });
conferir("sem digitado vale a estimativa", capacidadeDoProduto({ larguraCm: 2, alturaCm: 3, comprimentoCm: 4 }, P).origem, "estimado");
conferir("digitado vale mesmo sem medida", capacidadeDoProduto({ pecasPorCaixinha: 7 }, null).pecas, 7);

console.log("\nCaixinha certa e peso");
const peca = { larguraCm: 2, alturaCm: 3, comprimentoCm: 4, estoque: 10, estoqueMaximo: 30 };
conferir("guarda o estoque maximo; sem ele, o estoque", [quantidadeAGuardar(peca), quantidadeAGuardar({ estoque: 12 }), quantidadeAGuardar({})], [30, 12, 0]);
conferir("cabe na menor", [menorCaixinha([G, P], peca).modelo.nome, menorCaixinha([G, P], peca).cabe], ["P", true]);
conferir("nao coube na P: a maior", [menorCaixinha([G, P], { ...peca, estoqueMaximo: 100 }).modelo.nome, menorCaixinha([G, P], { ...peca, estoqueMaximo: 100 }).cabe], ["G", true]);
conferir("nao cabe em nenhuma: a maior, avisando", [menorCaixinha([G, P], { ...peca, estoqueMaximo: 5000 }).modelo.nome, menorCaixinha([G, P], { ...peca, estoqueMaximo: 5000 }).cabe], ["G", false]);
conferir("modelo desativado fica fora", menorCaixinha([{ ...P, ativo: false }, G], peca).modelo.nome, "G");
conferir("sem medida nao escolhe", menorCaixinha([G, P], { estoque: 3 }), null);
conferir("peso da caixinha cheia", [pesoDaCaixinha({ pesoKg: 0.05, estoque: 20 }, { pesoVazioKg: 0.1 }), pesoDaCaixinha({ estoque: 20 }, P)], [1.1, null]);
conferir("nivel: a 1 embaixo ou em cima", [nivelDaPrateleira(1, 5, true), nivelDaPrateleira(1, 5, false), nivelDaPrateleira(5, 5, false)], [0, 4, 0]);

console.log("\nA cena");
const locais = [
  { id: "l1", numero: 1, nome: "Estoque 1", primeiraEmbaixo: false, aplicaRegras: false },
  { id: "l2", numero: 2, nome: "Estoque 2", primeiraEmbaixo: true, aplicaRegras: true },
];
const colunas = [
  { id: "cM", localId: "l1", letra: "M", ordem: 2, prateleiras: 3, larguraCm: 50 },
  { id: "cA", localId: "l1", letra: "A", ordem: 1, prateleiras: 2 },
  { id: "cK", localId: "l2", letra: "K", ordem: 1, prateleiras: 2 },
];
const modelos = [{ id: "mP", ...P, cor: "#112233" }, { id: "mG", ...G, cor: "#445566" }];
const produto = (sku, localizacao, extra = {}) => ({ id: `id-${sku}`, sku, nome: `Produto ${sku}`, localizacao, estoque: 5, ...extra });
const cena = montarMapa({
  locais,
  colunas,
  modelos,
  produtos: [
    produto("100300", "M2", { modeloCaixinhaId: "mG", ordemNaPrateleira: 1 }),
    produto("100100", "M2", { modeloCaixinhaId: "mP", larguraCm: 2, alturaCm: 3, comprimentoCm: 4, estoque: 80, pesoKg: 0.01 }),
    produto("100200", "m2", { modeloCaixinhaId: "mG", larguraCm: 2, alturaCm: 3, comprimentoCm: 4 }),
    produto("100400", "M5"),
    produto("100500", "A1"),
    produto("100600", "A"),
    produto("100700", "Q3"),
    produto("100800", "CHAO"),
    produto("100900", "K1"),
    produto("101000", ""),
  ],
});
const estoque1 = cena.locais[0];
const colunaM = estoque1.colunas.find((coluna) => coluna.letra === "M");
const m2 = colunaM.prateleiras.find((prateleira) => prateleira.numero === 2);
conferir("colunas na ordem do cadastro", estoque1.colunas.map((coluna) => coluna.letra), ["A", "M"]);
conferir("em fila: a M comeca depois da A (90 + 3)", [estoque1.colunas[0].xCm, colunaM.xCm], [0, 93]);
conferir("a ordem digitada vem primeiro, depois o codigo", m2.caixinhas.map((caixinha) => caixinha.sku), ["100300", "100100", "100200"]);
conferir("lado a lado pela largura do modelo", m2.caixinhas.map((caixinha) => caixinha.xCm), [0, 20, 30]);
conferir("o que passa do vao e avisado", [m2.ocupadoCm, m2.excedeCm], [50, 0]);
conferir("estoque maior que o que cabe pede caixinha maior", m2.caixinhas[1].avisos, ["Estoque (80) maior que o que cabe (39): caixinha maior."]);
conferir("peso da prateleira", m2.pesoKg, 0.8);
conferir("prateleira citada alem do cadastro existe", [colunaM.prateleiras.length, colunaM.prateleiras.find((p) => p.numero === 5).caixinhas[0].sku], [5, "100400"]);
conferir("a 1 em cima: nivel mais alto vem primeiro", [colunaM.prateleiras[0].numero, colunaM.prateleiras[0].nivel, colunaM.prateleiras.at(-1).numero], [1, 4, 5]);
conferir("sem modelo: cor padrao e aviso", [colunaM.prateleiras.find((p) => p.numero === 5).caixinhas[0].avisos, colunaM.prateleiras.find((p) => p.numero === 5).caixinhas[0].modelo], [["Sem modelo de caixinha."], null]);
conferir("so a letra: fora das prateleiras do estoque dela", estoque1.fora.map((item) => item.sku), ["100600"]);
conferir("letra sem coluna cadastrada", cena.semColuna, [{ letra: "Q", produtos: 1 }]);
conferir("texto que nao e coluna", cena.semLugar.map((item) => item.sku), ["100800"]);
conferir("estoque 2: a 1 embaixo", [cena.locais[1].colunas[0].prateleiras.at(-1).numero, cena.locais[1].caixinhas, cena.locais[1].aplicaRegras], [1, 1, true]);
conferir("total de caixinhas do estoque 1", estoque1.caixinhas, 5);
const largo = montarMapa({ locais, colunas, modelos, produtos: ["1", "2", "3"].map((n) => produto(`20${n}`, "M1", { modeloCaixinhaId: "mG" })) });
conferir("tres G (60 cm) num vao de 50: excede 10", largo.locais[0].colunas.find((c) => c.letra === "M").prateleiras.find((p) => p.numero === 1).excedeCm, 10);

console.log("\nColunas pela localizacao");
conferir("uma por letra, com a maior prateleira; as que existem ficam fora", colunasPelaLocalizacao(["M2", "M7", "A1", "X", "CHAO", "AB3", "T1", null], ["T"]), [
  { letra: "A", prateleiras: 1 },
  { letra: "M", prateleiras: 7 },
  { letra: "X", prateleiras: 1 },
  { letra: "AB", prateleiras: 3 },
]);

console.log("\nBanco");
const { prisma } = await import("../src/lib/db.js");
const { criarColunasPelaLocalizacao, excluirColuna, excluirModelo, lerMapa, salvarCaixinhaDoProduto, salvarColuna, salvarLocal, salvarModelo } = await import("../src/lib/estoque3d/banco.js");

async function limpar() {
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-E3D-" } } });
  await prisma.colunaDeEstoque.deleteMany({ where: { letra: { in: ["ZY", "ZZ"] } } });
  await prisma.modeloDeCaixinha.deleteMany({ where: { nome: { startsWith: "ZZ E3D" } } });
}

const estoqueUm = await prisma.localDeEstoque.findUnique({ where: { numero: 1 } });
const embaixoAntes = estoqueUm.primeiraEmbaixo;
try {
  await limpar();
  conferir("a migration criou os tres estoques", (await prisma.localDeEstoque.findMany({ orderBy: { numero: "asc" } })).map((local) => [local.numero, local.aplicaRegras]), [[1, false], [2, true], [3, true]]);

  const criarProduto = (sku, localizacao, extra = {}) => prisma.produto.create({ data: { sku, tituloBase: `ZZ E3D ${sku}`, localizacao, estoque: 4, ...extra } });
  const um = await criarProduto("ZZ-E3D-1", "ZZ3", { larguraCm: 2, alturaCm: 3, comprimentoCm: 4 });
  await criarProduto("ZZ-E3D-2", "zz1");
  await criarProduto("ZZ-E3D-3", "ZZ3", { ativo: false });

  const criadas = await criarColunasPelaLocalizacao();
  conferir("cria a coluna ZZ no Estoque 1", [criadas.ok, criadas.letras.includes("ZZ")], [true, true]);
  const colunaZZ = await prisma.colunaDeEstoque.findUnique({ where: { letra: "ZZ" } });
  conferir("com a maior prateleira e no Estoque 1", [colunaZZ.prateleiras, colunaZZ.localId], [3, estoqueUm.id]);
  conferir("repetir nao cria de novo", (await criarColunasPelaLocalizacao()).criadas, 0);

  conferir("letra repetida recusa", (await salvarColuna(null, { localId: estoqueUm.id, letra: "zz", ordem: 1, prateleiras: 2 })).ok, false);
  conferir("letra invalida recusa", (await salvarColuna(null, { localId: estoqueUm.id, letra: "Z1", ordem: 1, prateleiras: 2 })).erro, "A coluna é uma ou duas letras.");
  conferir("coluna nova", (await salvarColuna(null, { localId: estoqueUm.id, letra: "zy", ordem: 99, prateleiras: 4, larguraCm: "85,5".replace(",", "."), profundidadeCm: "", alturaLivreCm: "", pesoMaximoKg: "" })).ok, true);
  const colunaZY = await prisma.colunaDeEstoque.findUnique({ where: { letra: "ZY" } });
  conferir("medida gravada e vazia como nula", [Number(colunaZY.larguraCm), colunaZY.profundidadeCm], [85.5, null]);
  conferir("trocar a letra da coluna com produtos recusa", (await salvarColuna(colunaZZ.id, { localId: estoqueUm.id, letra: "ZX", ordem: 1, prateleiras: 3 })).erro, "A coluna ZZ tem produtos: a letra não muda.");
  conferir("alterar medidas da coluna com produtos", (await salvarColuna(colunaZZ.id, { localId: estoqueUm.id, letra: "ZZ", ordem: 98, prateleiras: 3, larguraCm: 50 })).ok, true);
  conferir("excluir coluna com produtos recusa (so os ativos contam)", (await excluirColuna(colunaZZ.id)).erro, "A coluna ZZ tem 2 produto(s) e não pode ser excluída.");
  conferir("excluir coluna vazia", (await excluirColuna(colunaZY.id)).ok, true);

  conferir("modelo sem medida recusa", (await salvarModelo(null, { nome: "ZZ E3D P", cor: "#112233", larguraCm: "", alturaCm: 8, profundidadeCm: 20, fatorUtil: 0.7 })).ok, false);
  conferir("modelo novo", (await salvarModelo(null, { nome: "ZZ E3D P", cor: "#112233", larguraCm: 10, alturaCm: 8, profundidadeCm: 20, fatorUtil: 0.7, pesoVazioKg: "" })).ok, true);
  conferir("nome repetido recusa", (await salvarModelo(null, { nome: "zz e3d p", cor: "#112233", larguraCm: 10, alturaCm: 8, profundidadeCm: 20, fatorUtil: 0.7 })).erro, 'Já existe um modelo "zz e3d p".');
  const modelo = await prisma.modeloDeCaixinha.findUnique({ where: { nome: "ZZ E3D P" } });

  conferir("caixinha do produto", (await salvarCaixinhaDoProduto(um.id, { modeloCaixinhaId: modelo.id, pecasPorCaixinha: "", ordemNaPrateleira: "2" })).ok, true);
  conferir("modelo que nao existe recusa", (await salvarCaixinhaDoProduto(um.id, { modeloCaixinhaId: "nao-existe" })).erro, "Modelo de caixinha não encontrado.");
  conferir("modelo em uso nao se exclui", (await excluirModelo(modelo.id)).erro, 'O modelo "ZZ E3D P" está em 1 produto(s) e não pode ser excluído.');

  conferir("a 1 embaixo grava", [(await salvarLocal(estoqueUm.id, { primeiraEmbaixo: !embaixoAntes })).ok, (await prisma.localDeEstoque.findUnique({ where: { numero: 1 } })).primeiraEmbaixo], [true, !embaixoAntes]);

  const lido = await lerMapa();
  const zz = lido.mapa.locais[0].colunas.find((coluna) => coluna.letra === "ZZ");
  const zz3 = zz.prateleiras.find((prateleira) => prateleira.numero === 3);
  conferir("o mapa traz a caixinha com o modelo, a estimativa e a posicao", [zz3.caixinhas.map((c) => c.sku), zz3.caixinhas[0].modelo, zz3.caixinhas[0].capacidade, zz3.caixinhas[0].origemDaCapacidade], [["ZZ-E3D-1"], "ZZ E3D P", 39, "estimado"]);
  conferir("o inativo fica fora e a minuscula entra", [zz.caixinhas, zz.prateleiras.find((p) => p.numero === 1).caixinhas[0].sku], [2, "ZZ-E3D-2"]);
  conferir("a lista de colunas conta os produtos", lido.colunas.find((coluna) => coluna.letra === "ZZ").produtos, 2);
  conferir("a lista de modelos conta os produtos", lido.modelos.find((item) => item.nome === "ZZ E3D P").produtos, 1);

  await prisma.produto.update({ where: { id: um.id }, data: { modeloCaixinhaId: null } });
  conferir("modelo sem uso se exclui", (await excluirModelo(modelo.id)).ok, true);
} finally {
  await prisma.localDeEstoque.update({ where: { numero: 1 }, data: { primeiraEmbaixo: embaixoAntes } });
  // As colunas que o teste criou pela localizacao dos produtos de VERDADE ficam: o botao da tela faria o mesmo. So as ZZ saem.
  await limpar();
  await prisma.$disconnect();
}

console.log(`\n${falhas === 0 ? "Tudo certo." : `${falhas} falha(s).`}`);
process.exit(falhas === 0 ? 0 : 1);

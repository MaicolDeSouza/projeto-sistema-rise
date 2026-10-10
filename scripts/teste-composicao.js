import "dotenv/config";

/**
 * Testes do produto com composicao (kit): regras puras do kit e, nas tarefas seguintes,
 * a gravacao no Postgres. SEM rede.
 *
 *   npm run teste:composicao
 *
 * Os produtos de teste levam SKU "ZZ-KIT-..." e sao apagados no inicio e no fim.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const {
  codigoSugeridoDoKit,
  estoqueDoKit,
  faltasParaSerPeca,
  LIMITE_DA_LOCALIZACAO,
  LOCALIZACAO_DE_VARIAS_PECAS,
  localizacaoDoKit,
  mudancasDaPeca,
  ncmsDasPecas,
  pesoEMedidasDoKit,
  totaisDoKit,
  validarComposicao,
} = await import("../src/lib/composicao.js");
const { prisma } = await import("../src/lib/db.js");
const { gravarComposicao, kitsQueUsam, lerPecasDoKit, pecasPermitidas, recalcularKitsDaPeca } = await import(
  "../src/lib/composicaoBanco.js"
);

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

// ---------------------------------------------------------------------------
// Regras puras
// ---------------------------------------------------------------------------

console.log("\nEstoque do kit (o menor de estoque da peca / quantidade)");
conferir("990204: pecas com 18, 28 e 9, uma de cada -> 9", estoqueDoKit([{ estoque: 18, quantidade: 1 }, { estoque: 28, quantidade: 1 }, { estoque: 9, quantidade: 1 }]), 9);
conferir("3 de uma peca com 10 e 1 de outra com 5 -> 3 (10/3 arredonda para baixo)", estoqueDoKit([{ estoque: 10, quantidade: 3 }, { estoque: 5, quantidade: 1 }]), 3);
conferir("peca com estoque negativo conta 0", estoqueDoKit([{ estoque: -4, quantidade: 1 }, { estoque: 9, quantidade: 1 }]), 0);
conferir("sem pecas o kit nao tem estoque", estoqueDoKit([]), 0);
conferir("estoque em texto (vem do Prisma como numero, mas nao se confia) e quantidade 0 nao quebram", estoqueDoKit([{ estoque: "7", quantidade: 2 }, { estoque: 9, quantidade: 0 }]), 3);

console.log("\nTotais do kit (custo e venda = soma de valor x quantidade)");
conferir(
  "custo e venda completos",
  totaisDoKit([
    { sku: "A", quantidade: 1, precoVenda: 12.4, custo: 7.7 },
    { sku: "B", quantidade: 2, precoVenda: 14.9, custo: 5.4 },
  ]),
  { custo: 18.5, venda: 42.2, faltaCusto: [], faltaVenda: [] },
);
conferir(
  "peca sem custo deixa o custo NULO (nunca soma parcial) e diz quem falta; a venda segue",
  totaisDoKit([
    { sku: "A", quantidade: 1, precoVenda: 12.4, custo: 7.7 },
    { sku: "B", quantidade: 1, precoVenda: 14.9, custo: null },
  ]),
  { custo: null, venda: 27.3, faltaCusto: ["B"], faltaVenda: [] },
);
conferir(
  "peca sem preco de venda deixa a venda nula e diz quem falta",
  totaisDoKit([{ sku: "A", quantidade: 2, precoVenda: null, custo: "3.30" }]),
  { custo: 6.6, venda: null, faltaCusto: [], faltaVenda: ["A"] },
);
conferir("sem pecas: tudo nulo, ninguem falta", totaisDoKit([]), { custo: null, venda: null, faltaCusto: [], faltaVenda: [] });

console.log("\nPeso e medidas do kit (peso soma; comprimento e largura = maior; altura soma, como pecas empilhadas)");
conferir(
  "duas pecas completas",
  pesoEMedidasDoKit([
    { sku: "A", quantidade: 1, pesoKg: 0.2, comprimentoCm: 5, larguraCm: 5, alturaCm: 5 },
    { sku: "B", quantidade: 2, pesoKg: 0.1, comprimentoCm: 30, larguraCm: 1, alturaCm: 1 },
  ]),
  { pesoKg: 0.4, comprimentoCm: 30, larguraCm: 5, alturaCm: 7, incompleto: [] },
);
conferir(
  "peca sem medida: o campo que depende dela fica nulo, as outras contas seguem, e a peca e apontada",
  pesoEMedidasDoKit([
    { sku: "A", quantidade: 1, pesoKg: 0.2, comprimentoCm: 5, larguraCm: 5, alturaCm: 5 },
    { sku: "B", quantidade: 1, pesoKg: null, comprimentoCm: null, larguraCm: 2, alturaCm: 2 },
  ]),
  { pesoKg: null, comprimentoCm: null, larguraCm: 5, alturaCm: 7, incompleto: ["B"] },
);
conferir("valores em texto (Decimal do Prisma) sao lidos como numero, com 3 casas no peso", pesoEMedidasDoKit([{ sku: "A", quantidade: 3, pesoKg: "0.123", comprimentoCm: "4.5", larguraCm: "3", alturaCm: "2" }]), {
  pesoKg: 0.369,
  comprimentoCm: 4.5,
  larguraCm: 3,
  alturaCm: 6,
  incompleto: [],
});

console.log("\nNCMs das pecas (cada NCM uma vez, com as pecas que o tem)");
conferir(
  "dois NCMs, um repetido",
  ncmsDasPecas([
    { sku: "A", tituloBase: "Polia 16", ncm: "8483.50.10" },
    { sku: "B", tituloBase: "Correia", ncm: "4010.39.00" },
    { sku: "C", tituloBase: "Polia 80", ncm: "8483.50.10" },
  ]),
  [
    { ncm: "8483.50.10", pecas: ["A", "C"] },
    { ncm: "4010.39.00", pecas: ["B"] },
  ],
);
conferir("peca sem NCM fica fora; so digitos e pontuacao sao a mesma coisa", ncmsDasPecas([{ sku: "A", ncm: "84835010" }, { sku: "B", ncm: null }, { sku: "C", ncm: "8483.50.10" }]), [{ ncm: "84835010", pecas: ["A", "C"] }]);

console.log("\nValidacao da composicao");
const PROPRIO = "kit-1";
conferir("duas pecas, uma de cada: ok", validarComposicao([{ componenteId: "a", quantidade: 1 }, { componenteId: "b", quantidade: 1 }], { produtoId: PROPRIO }), { ok: true });
conferir("uma peca com quantidade 2: ok (um kit de 2 unidades da mesma peca)", validarComposicao([{ componenteId: "a", quantidade: 2 }], { produtoId: PROPRIO }), { ok: true });
conferir("lista vazia: recusa", validarComposicao([], { produtoId: PROPRIO }).ok, false);
conferir("uma peca so, quantidade 1: recusa (kit precisa de pelo menos 2 unidades)", validarComposicao([{ componenteId: "a", quantidade: 1 }], { produtoId: PROPRIO }).ok, false);
conferir("quantidade 0: recusa", validarComposicao([{ componenteId: "a", quantidade: 0 }, { componenteId: "b", quantidade: 1 }], { produtoId: PROPRIO }).ok, false);
conferir("quantidade 1.5: recusa", validarComposicao([{ componenteId: "a", quantidade: 1.5 }, { componenteId: "b", quantidade: 1 }], { produtoId: PROPRIO }).ok, false);
conferir("quantidade 10000: recusa (teto 9999)", validarComposicao([{ componenteId: "a", quantidade: 10000 }], { produtoId: PROPRIO }).ok, false);
conferir("quantidade em texto '2' e aceita como 2", validarComposicao([{ componenteId: "a", quantidade: "2" }], { produtoId: PROPRIO }), { ok: true });
conferir("peca repetida: recusa", validarComposicao([{ componenteId: "a", quantidade: 1 }, { componenteId: "a", quantidade: 1 }], { produtoId: PROPRIO }).ok, false);
conferir("o proprio produto como peca: recusa", validarComposicao([{ componenteId: PROPRIO, quantidade: 1 }, { componenteId: "b", quantidade: 1 }], { produtoId: PROPRIO }).ok, false);
conferir("nao e lista: recusa", validarComposicao("abc", { produtoId: PROPRIO }).ok, false);
conferir("peca sem id: recusa", validarComposicao([{ componenteId: "", quantidade: 1 }, { componenteId: "b", quantidade: 1 }], { produtoId: PROPRIO }).ok, false);

console.log("\nSugestoes do kit no cadastro (10/10/2026)");
conferir("codigo: uma peca x5 -> {sku}_5", codigoSugeridoDoKit([{ sku: "100101", quantidade: 5 }]), "100101_5");
conferir("codigo: milhar com ponto, como os kits do Bling (920302_1.000)", codigoSugeridoDoKit([{ sku: "920302", quantidade: 1000 }]), "920302_1.000");
conferir("codigo: quantidade em texto '3' vale 3", codigoSugeridoDoKit([{ sku: "100101", quantidade: "3" }]), "100101_3");
conferir("codigo: quantidade 1 nao sugere (seria a propria peca)", codigoSugeridoDoKit([{ sku: "100101", quantidade: 1 }]), null);
conferir("codigo: mais de uma peca nao sugere (o dono digita)", codigoSugeridoDoKit([{ sku: "A", quantidade: 2 }, { sku: "B", quantidade: 1 }]), null);
conferir("codigo: sem pecas nao sugere", codigoSugeridoDoKit([]), null);
conferir("localizacao: sem pecas, nada", localizacaoDoKit([]), { valor: null, travada: false });
conferir("localizacao: uma peca = a dela, travada", localizacaoDoKit([{ localizacao: " T-2 " }]), { valor: "T-2", travada: true });
conferir("localizacao: uma peca sem localizacao = vazio, travada", localizacaoDoKit([{ localizacao: null }]), { valor: "", travada: true });
conferir("localizacao: varias pecas = cada uma com o lugar, na ordem, travada", localizacaoDoKit([{ sku: "100101", localizacao: "F9" }, { sku: "101010", localizacao: "H2" }]), { valor: "100101(F9) / 101010(H2)", travada: true });
conferir("localizacao: tres pecas, uma sem lugar entra so com o codigo", localizacaoDoKit([{ sku: "100101", localizacao: "F9" }, { sku: "120809", localizacao: null }, { sku: "101010", localizacao: " H2 " }]).valor, "100101(F9) / 120809 / 101010(H2)");
conferir("localizacao: exatamente 40 caracteres ainda cabe", localizacaoDoKit([{ sku: "A".repeat(15), localizacao: "1" }, { sku: "B".repeat(16), localizacao: "2" }]).valor.length, 40);
conferir("localizacao: 41 caracteres vira o texto fixo", localizacaoDoKit([{ sku: "A".repeat(15), localizacao: "1" }, { sku: "B".repeat(17), localizacao: "2" }]), { valor: LOCALIZACAO_DE_VARIAS_PECAS, travada: true });
conferir("localizacao: muitas pecas passam de 40 e viram o texto fixo", localizacaoDoKit(["100101", "101010", "120706", "120809"].map((sku) => ({ sku, localizacao: "R-14" }))).valor, LOCALIZACAO_DE_VARIAS_PECAS);
conferir("o texto fixo cabe nos 40 caracteres da localizacao", LOCALIZACAO_DE_VARIAS_PECAS.length <= LIMITE_DA_LOCALIZACAO, true);
conferir("faltas: produto apto -> nada", faltasParaSerPeca({ tipo: "SIMPLES", conferido: true, blingId: "1" }), []);
conferir("faltas: TUDO de uma vez (nao so o primeiro motivo)", faltasParaSerPeca({ tipo: "SIMPLES", conferido: false, blingId: null }), ["validar no Rise", "integrar com o Bling"]);
conferir("faltas: so o Bling", faltasParaSerPeca({ tipo: "SIMPLES", conferido: true, blingId: null }), ["integrar com o Bling"]);
conferir("faltas: kit nunca e peca, e os outros motivos nao importam", faltasParaSerPeca({ tipo: "COMPOSICAO", conferido: false, blingId: null }), ["É um kit, não pode ser peça"]);

console.log("\nO que mudou na peca desde o ultimo Salvar do kit (o \"!\", 10/10/2026)");
const retratoBase = {
  tituloBase: "PLACA UNO", descricao: "aaa", precoVenda: 38.9, pesoKg: 0.024, comprimentoCm: 6.8, larguraCm: 5.3,
  alturaCm: 1, ncm: "8473.30.49", ativo: true, conferido: true, fotos: "f1", quantidadeFotos: 3, documentos: ["Datasheet.pdf"],
};
conferir("igual: nada mudou", mudancasDaPeca(retratoBase, { ...retratoBase }), []);
conferir("sem retrato guardado (kit antigo): nada muda, sem \"!\"", mudancasDaPeca(null, retratoBase), []);
conferir("numero em texto do Prisma e o mesmo numero; NCM so pelos digitos", mudancasDaPeca(retratoBase, { ...retratoBase, precoVenda: "38.90", ncm: "84733049" }), []);
// O Intl poe espaco nao separavel depois do "R$": compara com espaco comum.
conferir("preco mudou", mudancasDaPeca(retratoBase, { ...retratoBase, precoVenda: 42 }).map((m) => m.texto.replace(/\s/g, " ")), ["Preço de venda: R$ 38,90 → R$ 42,00"]);
conferir(
  "nome, descricao, peso, situacao e Conferido",
  mudancasDaPeca(retratoBase, { ...retratoBase, tituloBase: "PLACA UNO R3", descricao: "bbb", pesoKg: 0.03, ativo: false, conferido: false }).map((m) => m.campo),
  ["Nome", "Peso", "Situação", "Conferido", "Descrição"],
);
conferir("foto a mais: conta", mudancasDaPeca(retratoBase, { ...retratoBase, fotos: "f2", quantidadeFotos: 4 }).map((m) => m.texto), ["Fotos: 3 → 4"]);
conferir("foto trocada, mesma quantidade", mudancasDaPeca(retratoBase, { ...retratoBase, fotos: "f2" }).map((m) => m.texto), ["Fotos trocadas"]);
conferir(
  "documentos: novo e removido, sem ligar para a ordem",
  mudancasDaPeca({ ...retratoBase, documentos: ["A.pdf", "B.pdf"] }, { ...retratoBase, documentos: ["C.pdf", "A.pdf"] }).map((m) => m.texto),
  ["Documentos: novo C.pdf; removido B.pdf"],
);
conferir("custo, estoque e localizacao nao fazem parte do retrato", mudancasDaPeca(retratoBase, { ...retratoBase, custo: 99, estoque: 0, localizacao: "Z-9" }), []);

// ---------------------------------------------------------------------------
// Banco: ler, gravar e recalcular o kit; peca usada em kit nao e excluida
// ---------------------------------------------------------------------------

console.log("\nBanco do kit");

async function limpar() {
  // As pecas sao Restrict: apagar primeiro os kits (Cascade leva as linhas de ProdutoComponente).
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-KIT-" }, tipo: "COMPOSICAO" } });
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-KIT-" } } });
}
await limpar();

// Peca "boa": simples, conferida e vinculada ao Bling (os tres requisitos do dono).
const novaPeca = (sku, extra = {}) =>
  prisma.produto.create({
    data: { sku, tituloBase: `Peca ${sku}`, tipo: "SIMPLES", conferido: true, blingId: `9${sku.replace(/\D/g, "")}`, estoque: 10, ...extra },
  });
const estoqueDe = async (id) => (await prisma.produto.findUnique({ where: { id }, select: { estoque: true } })).estoque;

try {
  const a = await novaPeca("ZZ-KIT-A1", { estoque: 18 });
  const b = await novaPeca("ZZ-KIT-B2", { estoque: 28 });
  const c = await novaPeca("ZZ-KIT-C3", { estoque: 9 });
  const kit = await prisma.produto.create({ data: { sku: "ZZ-KIT-K1", tituloBase: "Kit de teste", tipo: "COMPOSICAO", estoque: 999 } });

  // --- gravar e ler ---
  await gravarComposicao(kit.id, [
    { componenteId: a.id, quantidade: 1 },
    { componenteId: b.id, quantidade: 1 },
    { componenteId: c.id, quantidade: 1 },
  ]);
  let pecas = await lerPecasDoKit(kit.id);
  conferir("gravar 3 pecas: le as 3, na ordem, com os dados da peca", pecas.map((p) => [p.componente.sku, p.quantidade, p.ordem, p.componente.estoque]), [["ZZ-KIT-A1", 1, 0, 18], ["ZZ-KIT-B2", 1, 1, 28], ["ZZ-KIT-C3", 1, 2, 9]]);
  conferir("o estoque do kit foi gravado calculado (menor peca: 9), apagando o 999 digitado", await estoqueDe(kit.id), 9);

  // --- trocar quantidade e tirar uma peca: troca a lista inteira ---
  await gravarComposicao(kit.id, [
    { componenteId: a.id, quantidade: 3 },
    { componenteId: b.id, quantidade: 1 },
  ]);
  pecas = await lerPecasDoKit(kit.id);
  conferir("regravar com 2 pecas e quantidade 3: a terceira some, a quantidade muda", pecas.map((p) => [p.componente.sku, p.quantidade]), [["ZZ-KIT-A1", 3], ["ZZ-KIT-B2", 1]]);
  conferir("estoque recalculado: 18/3 = 6, 28/1 = 28 -> 6", await estoqueDe(kit.id), 6);
  conferir("a peca que saiu continua existindo como produto", (await prisma.produto.findUnique({ where: { id: c.id } }))?.sku, "ZZ-KIT-C3");

  // --- pecas permitidas ---
  const naoConferida = await novaPeca("ZZ-KIT-N4", { conferido: false });
  const semBling = await novaPeca("ZZ-KIT-S5", { blingId: null });
  conferir("pecas boas: ok", await pecasPermitidas([a.id, b.id]), { ok: true });
  conferir("peca nao conferida: recusa dizendo o sku e o motivo", (await pecasPermitidas([a.id, naoConferida.id])).erro.includes("ZZ-KIT-N4") && (await pecasPermitidas([naoConferida.id])).erro.toLowerCase().includes("conferid"), true);
  conferir("peca sem vinculo com o Bling: recusa dizendo o sku", (await pecasPermitidas([semBling.id])).erro.includes("ZZ-KIT-S5"), true);
  conferir("um kit como peca de outro kit: recusa", (await pecasPermitidas([kit.id])).ok, false);
  conferir("id que nao existe: recusa", (await pecasPermitidas(["nao-existe"])).ok, false);

  // --- recalcular os kits de uma peca ---
  const kit2 = await prisma.produto.create({ data: { sku: "ZZ-KIT-K2", tituloBase: "Kit de teste 2", tipo: "COMPOSICAO" } });
  await gravarComposicao(kit2.id, [{ componenteId: a.id, quantidade: 2 }]);
  conferir("kit2 nasce com 18/2 = 9", await estoqueDe(kit2.id), 9);
  await prisma.produto.update({ where: { id: a.id }, data: { estoque: 4 } });
  await prisma.$transaction((tx) => recalcularKitsDaPeca(a.id, tx));
  conferir("a peca A caiu para 4: kit1 (A x3) vira 1 e kit2 (A x2) vira 2, os dois na mesma transacao", [await estoqueDe(kit.id), await estoqueDe(kit2.id)], [1, 2]);
  conferir("kitsQueUsam lista os dois kits da peca A, pelo sku", (await kitsQueUsam(a.id)).map((k) => k.sku).sort(), ["ZZ-KIT-K1", "ZZ-KIT-K2"]);
  conferir("peca que nao esta em kit nenhum: lista vazia", await kitsQueUsam(c.id), []);

  // --- Tarefa 4: edicao rapida de estoque (kit recusado; peca recalcula os kits) ---
  const { gravarAjusteDeEstoque } = await import("../src/lib/ajusteRapido.js");
  const atualizadoDe = async (id) => (await prisma.produto.findUnique({ where: { id }, select: { atualizadoEm: true } })).atualizadoEm.getTime();
  const noKitAntes = await atualizadoDe(kit.id);
  const ajusteNoKit = await gravarAjusteDeEstoque(kit.id, { tipo: "ENTRADA", quantidade: 1 });
  conferir("ajuste de estoque direto no kit: recusado, dizendo que e calculado pelas pecas", [ajusteNoKit.ok, /calculado pelas peças/.test(ajusteNoKit.erro ?? "")], [false, true]);
  conferir("e nenhum movimento foi gravado no kit", await prisma.movimentoEstoque.count({ where: { produtoId: kit.id } }), 0);
  const ajusteNaPeca = await gravarAjusteDeEstoque(a.id, { tipo: "ENTRADA", quantidade: 5 });
  conferir("entrada de 5 na peca A (4 -> 9): ok", [ajusteNaPeca.ok, ajusteNaPeca.saldoNovo], [true, 9]);
  conferir("os dois kits da peca A foram recalculados junto: kit1 (A x3, B x1) = 3, kit2 (A x2) = 4", [await estoqueDe(kit.id), await estoqueDe(kit2.id)], [3, 4]);
  conferir("o recalculo nao mexe no atualizadoEm do kit (a lista ordena por ele e o envio ao Bling o usa)", await atualizadoDe(kit.id), noKitAntes);

  // --- Tarefa 4: botao "Sincronizar estoque com Bling" (pecas gravadas, kit so com o saldo do Bling) ---
  const { sincronizarEstoqueDoBling } = await import("../src/lib/blingSync/saldos.js");
  const { criarBlingFalso } = await import("./lib/blingFalso.js");
  const falso = criarBlingFalso({
    produtos: [
      { id: 501, codigo: "ZZ-KIT-A1", nome: "Peca A" },
      { id: 502, codigo: "ZZ-KIT-B2", nome: "Peca B" },
      { id: 503, codigo: "ZZ-KIT-K1", nome: "Kit 1" },
    ],
    saldos: { "ZZ-KIT-A1": 12, "ZZ-KIT-B2": 28, "ZZ-KIT-K1": 50 },
  });
  const saldos = await sincronizarEstoqueDoBling(falso, { produtoIds: [a.id, b.id, kit.id] });
  conferir("botao de saldos: 3 atualizados, sem falha", [saldos.atualizados, saldos.falhas], [3, []]);
  const lidoA = await prisma.produto.findUnique({ where: { id: a.id }, select: { estoque: true, blingSaldo: true } });
  conferir("peca A: saldo 12 do Bling + a entrada de 5 ainda pendente = 17", [lidoA.blingSaldo, lidoA.estoque], [12, 17]);
  const lidoKit = await prisma.produto.findUnique({ where: { id: kit.id }, select: { estoque: true, blingSaldo: true } });
  conferir("kit: guarda o saldo do Bling (50), mas o estoque e o CALCULADO pelas pecas daqui: 17/3 = 5", [lidoKit.blingSaldo, lidoKit.estoque], [50, 5]);
  conferir("kit2, fora do lote mas com a peca A: recalculado para 17/2 = 8", await estoqueDe(kit2.id), 8);

  // --- a peca usada em kit nao e excluida: o Restrict do banco e a ultima defesa ---
  let recusouNoBanco = false;
  try {
    await prisma.produto.delete({ where: { id: a.id } });
  } catch (erro) {
    recusouNoBanco = erro?.code === "P2003";
  }
  conferir("apagar a peca A direto no banco e recusado pela chave estrangeira (P2003)", recusouNoBanco, true);
  conferir("e a peca continua la", (await prisma.produto.findUnique({ where: { id: a.id } }))?.sku, "ZZ-KIT-A1");

  // --- a acao de excluir recusa ANTES do banco, dizendo em quais kits a peca esta ---
  // `excluirProduto` importa `revalidatePath` do Next, que fora dele so lanca se for chamado: a
  // recusa acontece antes, entao da para testar a regra aqui (o caminho feliz nao).
  const { excluirProduto } = await import("../src/app/produtos/acoes.js");
  const recusa = await excluirProduto(a.id);
  conferir("excluirProduto da peca A: ok false e o recado lista os dois kits pelo sku", [recusa.ok, recusa.erro.includes("ZZ-KIT-K1") && recusa.erro.includes("ZZ-KIT-K2")], [false, true]);
  conferir("e a peca A continua la (nada foi apagado)", (await prisma.produto.findUnique({ where: { id: a.id } }))?.sku, "ZZ-KIT-A1");

  // --- importacao do Bling: pecas resolvidas pelo blingId guardado (sem rede) ---
  // A estrutura do Bling so traz o id de cada peca; quem ja tem `blingId` no Rise e achado sem ler o
  // Bling. Quantidade "1,00" do Bling vira inteiro.
  const { resolverPecasDoKit } = await import("../src/lib/integracoes/importarBling.js");
  const pecaA = await prisma.produto.findUnique({ where: { id: a.id }, select: { blingId: true } });
  const pecaB = await prisma.produto.findUnique({ where: { id: b.id }, select: { blingId: true } });
  const resolvido = await resolverPecasDoKit({
    estrutura: { tipoEstoque: "V", componentes: [{ produto: { id: Number(pecaB.blingId) }, quantidade: 2 }, { produto: { id: Number(pecaA.blingId) }, quantidade: 1.0 }] },
  });
  conferir("resolver pecas do kit pelo blingId: as duas achadas, na ordem do Bling, sem faltar nenhuma", resolvido, { pecas: [{ componenteId: b.id, quantidade: 2 }, { componenteId: a.id, quantidade: 1 }], faltam: [] });
  conferir("kit sem pecas no Bling: erro, nada a gravar", Boolean((await resolverPecasDoKit({ estrutura: { componentes: [] } })).erro), true);

  // --- Tarefa 5: cadastro (tipo + composicao do formulario), na ordem que o salvarProduto usa ---
  // `salvarProduto` chama `revalidatePath` (so existe dentro do Next): a regra mora em composicaoBanco e e
  // testada aqui; a acao so a chama antes de gravar e grava na mesma transacao.
  const { gravarComposicaoDoCadastro, pecasParaKit, prepararComposicaoDoCadastro } = await import("../src/lib/composicaoBanco.js");
  const campoDe = (lista) => JSON.stringify(lista);

  const preparoNovo = await prepararComposicaoDoCadastro({
    produtoId: null,
    tipo: "COMPOSICAO",
    campo: campoDe([{ componenteId: b.id, quantidade: 1 }, { componenteId: c.id, quantidade: "2" }]),
  });
  conferir("cadastro de kit novo com 2 pecas: aceito, quantidade em texto vira numero", [preparoNovo.ok, preparoNovo.itens], [true, [{ componenteId: b.id, quantidade: 1 }, { componenteId: c.id, quantidade: 2 }]]);
  const kit3 = await prisma.$transaction(async (tx) => {
    const criado = await tx.produto.create({ data: { sku: "ZZ-KIT-K3", tituloBase: "Kit do cadastro", tipo: "COMPOSICAO" } });
    await gravarComposicaoDoCadastro(criado.id, preparoNovo, tx);
    return criado;
  });
  conferir("kit criado: grava as pecas e o estoque calculado (B 28/1, C 9/2 -> 4)", [(await lerPecasDoKit(kit3.id)).map((p) => [p.componente.sku, p.quantidade]), await estoqueDe(kit3.id)], [[["ZZ-KIT-B2", 1], ["ZZ-KIT-C3", 2]], 4]);

  const comNaoConferida = await prepararComposicaoDoCadastro({ produtoId: null, tipo: "COMPOSICAO", campo: campoDe([{ componenteId: b.id, quantidade: 1 }, { componenteId: naoConferida.id, quantidade: 1 }]) });
  conferir("peca nao conferida no cadastro: recusa com o sku", [comNaoConferida.ok, (comNaoConferida.erro ?? "").includes("ZZ-KIT-N4")], [false, true]);
  conferir("uma peca so, quantidade 1: recusa (kit de uma unidade e o proprio produto)", (await prepararComposicaoDoCadastro({ produtoId: null, tipo: "COMPOSICAO", campo: campoDe([{ componenteId: b.id, quantidade: 1 }]) })).ok, false);
  conferir("kit novo sem o campo composicao: recusa pedindo as pecas", (await prepararComposicaoDoCadastro({ produtoId: null, tipo: "COMPOSICAO", campo: null })).ok, false);
  conferir("JSON quebrado: recusa", (await prepararComposicaoDoCadastro({ produtoId: null, tipo: "COMPOSICAO", campo: "[{" })).ok, false);
  conferir("kit consigo mesmo como peca: recusa", (await prepararComposicaoDoCadastro({ produtoId: kit3.id, tipo: "COMPOSICAO", campo: campoDe([{ componenteId: kit3.id, quantidade: 1 }, { componenteId: b.id, quantidade: 1 }]) })).ok, false);
  conferir("kit gravado, formulario sem tipo nem composicao (aberto antes do campo): mantem as pecas", await prepararComposicaoDoCadastro({ produtoId: kit3.id, campo: null }), { ok: true, tipo: "COMPOSICAO", itens: null });
  conferir("peca A (usada nos kits K1 e K2) virando kit: recusa dizendo os kits", (await prepararComposicaoDoCadastro({ produtoId: a.id, tipo: "COMPOSICAO", campo: campoDe([{ componenteId: b.id, quantidade: 2 }]) })).erro?.includes("ZZ-KIT-K1"), true);
  conferir("produto simples sem o campo tipo: continua simples, lista vazia (nada a apagar)", await prepararComposicaoDoCadastro({ produtoId: c.id, campo: null }), { ok: true, tipo: "SIMPLES", itens: [] });

  const paraSimples = await prepararComposicaoDoCadastro({ produtoId: kit3.id, tipo: "SIMPLES", campo: campoDe([{ componenteId: b.id, quantidade: 1 }]) });
  await prisma.$transaction(async (tx) => {
    await tx.produto.update({ where: { id: kit3.id }, data: { tipo: paraSimples.tipo } });
    await gravarComposicaoDoCadastro(kit3.id, paraSimples, tx);
  });
  conferir("kit trocado para Simples: as pecas saem (a lista enviada e ignorada) e as pecas continuam existindo", [await prisma.produtoComponente.count({ where: { kitId: kit3.id } }), (await prisma.produto.findUnique({ where: { id: b.id } }))?.sku], [0, "ZZ-KIT-B2"]);

  // --- Tarefa 5: busca de pecas da aba Composicao ---
  const busca = await pecasParaKit("zz-kit-", [a.id]);
  const achados = busca.itens.map((p) => p.sku);
  conferir("busca por sku sem caixa: so simples, conferidas e com Bling; a excluida fica de fora", [achados.includes("ZZ-KIT-B2"), achados.includes("ZZ-KIT-C3"), achados.includes("ZZ-KIT-A1"), achados.includes("ZZ-KIT-N4"), achados.includes("ZZ-KIT-S5"), achados.includes("ZZ-KIT-K1")], [true, true, false, false, false, false]);
  conferir("busca que so acha produto barrado: devolve o id e TUDO o que falta", await pecasParaKit("ZZ-KIT-N4"), { itens: [], barrados: [{ id: naoConferida.id, sku: "ZZ-KIT-N4", tituloBase: "Peca ZZ-KIT-N4", faltas: ["validar no Rise"] }] });
  conferir(
    "busca com aptos e barrados: as duas listas juntas (antes o barrado so vinha sem nenhum apto)",
    [
      busca.itens.length > 0,
      busca.barrados.find((item) => item.sku === "ZZ-KIT-N4")?.faltas,
      busca.barrados.find((item) => item.sku === "ZZ-KIT-S5")?.faltas,
      busca.barrados.find((item) => item.sku === "ZZ-KIT-K1")?.faltas,
      busca.barrados.some((item) => item.sku === "ZZ-KIT-A1"),
    ],
    [true, ["validar no Rise"], ["integrar com o Bling"], ["É um kit, não pode ser peça"], false],
  );
  conferir("busca com menos de 2 letras: vazia, sem consultar", await pecasParaKit("z"), { itens: [], barrados: [] });

  // --- Tarefa 6: a peca no formato das abas do kit ---
  const { pecaParaTela } = await import("../src/lib/composicaoBanco.js");
  const comPadrao = pecaParaTela(
    {
      id: "p1", sku: "S1", tituloBase: "Peca", estoque: 4, precoVenda: "12.50", custo: "3.00", pesoKg: "0.020",
      comprimentoCm: null, larguraCm: "2", alturaCm: "1.5", ncm: "8483.50.10",
      fornecedores: [{ id: "v1", descricao: "link", codigo: "F-1", precoCusto: "5.40", link: "https://x", fornecedor: { id: "f1", nome: "Fortek", site: null } }],
    },
    3,
  );
  conferir("peca para tela: numeros simples, custo do fornecedor padrao (vence o do cadastro) e a quantidade", [comPadrao.custo, comPadrao.precoVenda, comPadrao.pesoKg, comPadrao.comprimentoCm, comPadrao.quantidade, comPadrao.fornecedor.nome], [5.4, 12.5, 0.02, null, 3, "Fortek"]);
  const semPadrao = pecaParaTela({ id: "p2", sku: "S2", tituloBase: "Peca 2", estoque: 0, precoVenda: null, custo: "3.00", fornecedores: [] });
  conferir("peca sem fornecedor padrao: custo do cadastro, fornecedor nulo, preco nulo", [semPadrao.custo, semPadrao.fornecedor, semPadrao.precoVenda], [3, null, null]);
  const soRascunho = pecaParaTela({ id: "p3", sku: "S3", tituloBase: "Peca 3", estoque: 1, custo: null, fornecedorRascunho: { nome: "Loja X", codigo: "LX-9", precoCusto: 7.25 }, fornecedores: [] });
  conferir("peca so com o fornecedor em rascunho do Bling: usa o nome e o custo dele, marcado como rascunho, sem vinculo", [soRascunho.custo, soRascunho.fornecedor?.nome, soRascunho.fornecedor?.rascunho, soRascunho.fornecedor?.id], [7.25, "Loja X", true, null]);
  conferir("rascunho com custo zero nao vira custo", pecaParaTela({ id: "p4", sku: "S4", tituloBase: "P4", estoque: 0, fornecedorRascunho: { nome: "Y", precoCusto: 0 }, fornecedores: [] }).custo, null);
  conferir("a busca de pecas devolve no mesmo formato (componenteId, fornecedor)", Object.hasOwn(busca.itens[0] ?? {}, "componenteId") && Object.hasOwn(busca.itens[0] ?? {}, "fornecedor"), true);

  // --- Tarefa 7: "Criar descricao" so com as referencias cadastradas (todo produto) ---
  // A janela recebia lojas achadas pelo NOME no catalogo inteiro, inclusive concorrentes que nao estavam na
  // aba do produto (o dono viu isso em 07/10/2026). Agora so le os ids que o formulario manda: os da aba
  // Fornecedores / Concorrentes e os marcados na lupa. So leitura de ProdutoColetado ja coletado.
  const { buscarDescricoesParaProduto } = await import("../src/app/produtos/acoes.js");
  const coletados = await prisma.produtoColetado.findMany({
    where: { fonte: { tipo: "CONCORRENTE" }, nome: { contains: "arduino", mode: "insensitive" } },
    select: { id: true },
    take: 2,
  });
  const semReferencia = await buscarDescricoesParaProduto([]);
  conferir("descricao sem nenhuma referencia cadastrada: nada (antes buscava o nome no catalogo)", [semReferencia.ok, semReferencia.itens.length, semReferencia.encontrados], [true, 0, 0]);
  if (coletados.length > 0) {
    const umaSo = await buscarDescricoesParaProduto([coletados[0].id, coletados[0].id]);
    conferir("descricao com 1 concorrente cadastrado: so ele, sem repetir e sem lojas parecidas do catalogo", umaSo.itens.map((item) => item.id), [coletados[0].id]);
  }
  conferir("ids que nao sao texto: ignorados", (await buscarDescricoesParaProduto([null, 42, { id: "x" }])).itens.length, 0);

  // --- 10/10/2026: produto de origem do clone como peca ---
  const { pecaDeOrigemParaKit, localizacaoDoKitNoSalvar, propagarLocalizacaoDaPeca, ehKit, documentosDasPecas, descricoesDasPecas } =
    await import("../src/lib/composicaoBanco.js");
  const origemBoa = await pecaDeOrigemParaKit(b.id);
  conferir("origem apta: entra como peca, quantidade 1, no formato da aba", [origemBoa.ok, origemBoa.peca?.sku, origemBoa.peca?.quantidade, Object.hasOwn(origemBoa.peca ?? {}, "localizacao")], [true, "ZZ-KIT-B2", 1, true]);
  conferir("origem nao apta: nao entra, com o sku e o que falta", await pecaDeOrigemParaKit(semBling.id), { ok: false, sku: "ZZ-KIT-S5", faltas: ["integrar com o Bling"] });
  conferir("origem que nao existe: nao entra", (await pecaDeOrigemParaKit("nao-existe")).ok, false);

  // --- 10/10/2026: localizacao automatica do kit (uma peca = a dela; varias = `SKU(lugar) / SKU(lugar)`) ---
  await prisma.produto.update({ where: { id: c.id }, data: { localizacao: "R-7" } });
  const kitLoc = await prisma.produto.create({ data: { sku: "ZZ-KIT-L1", tituloBase: "Kit de localizacao", tipo: "COMPOSICAO", localizacao: "ERRADA" } });
  const kitLoc2 = await prisma.produto.create({ data: { sku: "ZZ-KIT-L2", tituloBase: "Kit de duas pecas", tipo: "COMPOSICAO", localizacao: "Verificar a aba composição" } });
  await gravarComposicao(kitLoc.id, [{ componenteId: c.id, quantidade: 2 }]);
  await gravarComposicao(kitLoc2.id, [{ componenteId: c.id, quantidade: 1 }, { componenteId: b.id, quantidade: 1 }]);
  conferir("Salvar de kit com UMA peca: grava a localizacao da peca", await localizacaoDoKitNoSalvar(kitLoc.id, { tipo: "COMPOSICAO", itens: [{ componenteId: c.id }] }), "R-7");
  conferir("Salvar de kit sem a lista no envio: le a peca gravada", await localizacaoDoKitNoSalvar(kitLoc.id, { tipo: "COMPOSICAO", itens: null }), "R-7");
  conferir("Salvar de kit com varias pecas: grava a lista das pecas na ordem da composicao", await localizacaoDoKitNoSalvar(kitLoc2.id, { tipo: "COMPOSICAO", itens: null }), "ZZ-KIT-C3(R-7) / ZZ-KIT-B2");
  conferir("Salvar de kit com a lista do formulario (outra ordem): segue a ordem enviada", await localizacaoDoKitNoSalvar(kitLoc2.id, { tipo: "COMPOSICAO", itens: [{ componenteId: b.id }, { componenteId: c.id }] }), "ZZ-KIT-B2 / ZZ-KIT-C3(R-7)");
  conferir("Salvar de kit sem pecas: fica a digitada (undefined)", await localizacaoDoKitNoSalvar(kitLoc2.id, { tipo: "COMPOSICAO", itens: [] }), undefined);
  conferir("Salvar de produto simples: fica a digitada (undefined)", await localizacaoDoKitNoSalvar(c.id, { tipo: "SIMPLES", itens: [] }), undefined);
  conferir("e kit? (qualquer kit, de uma ou de varias pecas)", [await ehKit(kitLoc.id), await ehKit(kitLoc2.id), await ehKit(c.id)], [true, true, false]);
  const antesDoKit = (await prisma.produto.findUnique({ where: { id: kitLoc.id }, select: { atualizadoEm: true } })).atualizadoEm.getTime();
  await prisma.produto.update({ where: { id: c.id }, data: { localizacao: "R-9" } });
  const kitsDaPeca = await prisma.produtoComponente.count({ where: { componenteId: c.id } });
  conferir("a peca mudou de lugar: TODOS os kits que a usam mudam junto (de uma ou de varias pecas)", await propagarLocalizacaoDaPeca(c.id), kitsDaPeca);
  const depoisDoKit = await prisma.produto.findUnique({ where: { id: kitLoc.id }, select: { localizacao: true, atualizadoEm: true } });
  conferir(
    "kit de uma peca com a nova localizacao, sem mexer no atualizadoEm; o de duas pecas com a lista nova",
    [depoisDoKit.localizacao, depoisDoKit.atualizadoEm.getTime() === antesDoKit, (await prisma.produto.findUnique({ where: { id: kitLoc2.id } })).localizacao],
    ["R-9", true, "ZZ-KIT-C3(R-9) / ZZ-KIT-B2"],
  );
  conferir("propagar de novo, sem mudanca: nenhum kit regravado", await propagarLocalizacaoDaPeca(c.id), 0);
  await prisma.produto.update({ where: { id: c.id }, data: { localizacao: "ESTANTE-MUITO-LONGA-DE-TESTE-7" } });
  await propagarLocalizacaoDaPeca(c.id);
  conferir("lista que passa de 40 caracteres: o kit de varias pecas vira o texto fixo; o de uma peca copia o lugar", [(await prisma.produto.findUnique({ where: { id: kitLoc2.id } })).localizacao, (await prisma.produto.findUnique({ where: { id: kitLoc.id } })).localizacao], ["Verificar a aba composição", "ESTANTE-MUITO-LONGA-DE-TESTE-7"]);
  const { gravarLocalizacao } = await import("../src/lib/ajusteRapido.js");
  conferir("edicao rapida: localizacao de kit de uma peca e recusada", (await gravarLocalizacao(kitLoc.id, "X-1")).ok, false);
  conferir("edicao rapida: localizacao de kit de varias pecas tambem e recusada (e automatica)", (await gravarLocalizacao(kitLoc2.id, "Prateleira 3")).ok, false);
  conferir("edicao rapida da peca: leva os kits junto", [(await gravarLocalizacao(c.id, "R-10")).ok, (await prisma.produto.findUnique({ where: { id: kitLoc.id } })).localizacao, (await prisma.produto.findUnique({ where: { id: kitLoc2.id } })).localizacao], [true, "R-10", "ZZ-KIT-C3(R-10) / ZZ-KIT-B2"]);
  await prisma.produto.update({ where: { id: c.id }, data: { sku: "ZZ-KIT-C3" } });

  // --- 10/10/2026: documentos e descricoes das pecas (so leitura) ---
  await prisma.produtoArquivo.create({ data: { produtoId: c.id, tipo: "DOCUMENTO", arquivo: "a".repeat(32) + ".pdf", nomeOriginal: "Datasheet C3.pdf" } });
  await prisma.produtoArquivo.create({ data: { produtoId: c.id, tipo: "CERTIFICADO", arquivo: "b".repeat(32) + ".pdf", nomeOriginal: "Anatel C3.pdf" } });
  const docs = await documentosDasPecas([c.id, b.id, "nao-existe"]);
  conferir(
    "documentos das pecas: na ordem pedida, com nome real e endereco calculado; peca sem arquivo vem vazia",
    [docs.map((p) => p.sku), docs[0].documentos.map((d) => d.nomeOriginal), docs[0].certificados.length, docs[0].documentos[0].url.startsWith("/api/arquivos/ZZ-KIT-C3/documentos/"), docs[1].documentos.length],
    [["ZZ-KIT-C3", "ZZ-KIT-B2"], ["Datasheet C3.pdf"], 1, true, 0],
  );
  conferir("documentos sem ids: lista vazia, sem consultar", await documentosDasPecas([]), []);
  await prisma.produto.update({ where: { id: c.id }, data: { descricaoBase: "PECA C3\nTexto da peca." } });
  conferir("descricoes das pecas: na ordem pedida", (await descricoesDasPecas([c.id, b.id])).map((p) => [p.sku, p.descricaoBase]), [["ZZ-KIT-C3", "PECA C3\nTexto da peca."], ["ZZ-KIT-B2", null]]);

  // --- 10/10/2026: o "!" do kit (retrato da peca no Salvar e o que mudou depois) ---
  const { mudancasDosKits, retratoDaPeca } = await import("../src/lib/composicaoBanco.js");
  const kitAlerta = await prisma.produto.create({ data: { sku: "ZZ-KIT-R1", tituloBase: "Kit do alerta", tipo: "COMPOSICAO" } });
  await gravarComposicao(kitAlerta.id, [{ componenteId: b.id, quantidade: 2 }]);
  const linhaAlerta = await prisma.produtoComponente.findFirst({ where: { kitId: kitAlerta.id }, select: { retrato: true } });
  conferir("o Salvar do kit grava o retrato da peca", [linhaAlerta.retrato?.tituloBase, linhaAlerta.retrato?.quantidadeFotos, Array.isArray(linhaAlerta.retrato?.documentos)], ["Peca ZZ-KIT-B2", 0, true]);
  conferir("logo depois do Salvar: nenhuma mudanca, sem \"!\"", (await mudancasDosKits([kitAlerta.id])).size, 0);
  await prisma.produto.update({ where: { id: b.id }, data: { custo: 77, estoque: 3, localizacao: "Q-1" } });
  conferir("custo, estoque e localizacao da peca mudaram: continua sem \"!\"", (await mudancasDosKits([kitAlerta.id])).size, 0);
  await prisma.produto.update({ where: { id: b.id }, data: { precoVenda: 19.9, tituloBase: "Peca B2 nova" } });
  const alerta = (await mudancasDosKits([kitAlerta.id])).get(kitAlerta.id);
  conferir("preco e nome da peca mudaram: o kit tem o \"!\" e diz o que mudou", [alerta?.length, alerta?.[0]?.sku, alerta?.[0]?.mudancas.map((m) => m.campo)], [1, "ZZ-KIT-B2", ["Nome", "Preço de venda"]]);
  await gravarComposicao(kitAlerta.id, [{ componenteId: b.id, quantidade: 2 }]);
  conferir("salvar o kit de novo e o \"revisado\": o \"!\" apaga", (await mudancasDosKits([kitAlerta.id])).size, 0);
  conferir(
    "o retrato do codigo usa md5 da descricao e das fotos (o mesmo da migration)",
    retratoDaPeca({ tituloBase: "X", descricaoBase: null, arquivos: [{ tipo: "IMAGEM", papel: "FOTO", arquivo: "b.jpg" }, { tipo: "IMAGEM", papel: "FOTO", arquivo: "a.jpg" }, { tipo: "IMAGEM", papel: "RESERVA", arquivo: "z.jpg" }] }),
    {
      tituloBase: "X", descricao: "d41d8cd98f00b204e9800998ecf8427e", precoVenda: null, pesoKg: null, comprimentoCm: null, larguraCm: null,
      alturaCm: null, ncm: null, ativo: false, conferido: false, fotos: "5773833bf91ed255424103935dcd4711", quantidadeFotos: 2, documentos: [],
    },
  );

  // --- 10/10/2026: "Anexar a este produto" copia o documento da peca para o lote do kit ---
  const fs = await import("node:fs/promises");
  const caminho = await import("node:path");
  const { anexarDocumentoDaPeca } = await import("../src/app/produtos/acoes.js");
  const pastaDaPeca = caminho.join(process.cwd(), "dados", "produtos", "ZZ-KIT-C3", "documentos");
  const nomeNoDisco = "c".repeat(32) + ".pdf";
  await fs.mkdir(pastaDaPeca, { recursive: true });
  await fs.writeFile(caminho.join(pastaDaPeca, nomeNoDisco), "%PDF-1.4 teste");
  const docDaPeca = await prisma.produtoArquivo.create({ data: { produtoId: c.id, tipo: "DOCUMENTO", arquivo: nomeNoDisco, nomeOriginal: "Manual C3.pdf" } });
  const lote = "11111111-2222-3333-4444-555555555555";
  const anexado = await anexarDocumentoDaPeca(lote, docDaPeca.id);
  const noLote = anexado.ok
    ? await fs.readFile(caminho.join(process.cwd(), "dados", "temporarios", lote, "documentos", anexado.arquivo.nome), "utf8").catch(() => null)
    : null;
  conferir(
    "anexar: copia para o lote do kit, com o nome real, e o original da peca fica",
    [anexado.ok, anexado.arquivo?.tipo, anexado.arquivo?.nomeOriginal, noLote, (await fs.stat(caminho.join(pastaDaPeca, nomeNoDisco))).isFile()],
    [true, "DOCUMENTO", "Manual C3.pdf", "%PDF-1.4 teste", true],
  );
  const fotoDaPeca = await prisma.produtoArquivo.create({ data: { produtoId: c.id, tipo: "IMAGEM", arquivo: "d".repeat(32) + ".jpg" } });
  conferir("anexar uma foto (nao e documento): recusa", (await anexarDocumentoDaPeca(lote, fotoDaPeca.id)).ok, false);
  conferir("anexar um id que nao existe: recusa", (await anexarDocumentoDaPeca(lote, "nao-existe")).ok, false);
  await fs.rm(caminho.join(process.cwd(), "dados", "temporarios", lote), { recursive: true, force: true });
  await fs.rm(caminho.join(process.cwd(), "dados", "produtos", "ZZ-KIT-C3"), { recursive: true, force: true });

  // --- apagar o kit leva as linhas de composicao, nao as pecas ---
  await prisma.produto.delete({ where: { id: kit2.id } });
  conferir("apagar o kit2 apaga as linhas dele e a peca A fica", [await prisma.produtoComponente.count({ where: { kitId: kit2.id } }), (await prisma.produto.findUnique({ where: { id: a.id } }))?.sku], [0, "ZZ-KIT-A1"]);
} finally {
  await limpar();
  await prisma.$disconnect();
}

// ---------------------------------------------------------------------------
// Resumo
// ---------------------------------------------------------------------------

console.log(falhas === 0 ? "\nTodos os testes da composicao OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);

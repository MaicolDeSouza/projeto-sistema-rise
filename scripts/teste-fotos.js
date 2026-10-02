import "dotenv/config";

/**
 * Testes da foto mensal (src/lib/coleta/fotos.js). Usa o Postgres, SEM rede.
 *
 *   npm run teste:fotos
 *
 * Cria fontes e produtos de teste e fotografa dois meses de 2025, que nunca existem
 * de verdade; tudo e apagado no fim (e no comeco, se um teste anterior morreu).
 * Como a foto e do banco INTEIRO, o teste tambem prova que ela roda sobre os dados
 * reais sem erro de SQL — mas so confere as linhas dos seus proprios produtos.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("../src/lib/db.js");
const { dataEmSaoPaulo, fotoDevida, mesDaFoto, tirarFotoMensal } = await import("../src/lib/coleta/fotos.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

// ---------------------------------------------------------------------------
// Data: o dia 14 e o mes sao os de Sao Paulo, nao os do UTC
// ---------------------------------------------------------------------------

console.log("\nData");
conferir("dia 14 ao meio-dia", fotoDevida(new Date("2026-09-14T15:00:00Z")), true);
conferir("dia 13 ainda nao", fotoDevida(new Date("2026-09-13T15:00:00Z")), false);
// 02:30 UTC de 14/09 ainda e 23:30 de 13/09 em Sao Paulo.
conferir("madrugada UTC do dia 14 ainda e dia 13 aqui", fotoDevida(new Date("2026-09-14T02:30:00Z")), false);
conferir("dia 20 e devida (recuperacao)", fotoDevida(new Date("2026-09-20T15:00:00Z")), true);
conferir("dia 31 e devida", fotoDevida(new Date("2026-08-31T15:00:00Z")), true);
conferir("dia 1 nao", fotoDevida(new Date("2026-09-01T15:00:00Z")), false);
conferir("mes da foto", mesDaFoto(new Date("2026-09-14T15:00:00Z")), "2026-09-01");
// 02:00 UTC de 01/10 ainda e 23:00 de 30/09 em Sao Paulo: o mes nao vira antes da hora.
conferir("virada de mes respeita o fuso", mesDaFoto(new Date("2026-10-01T02:00:00Z")), "2026-09-01");
conferir("virada de ano", mesDaFoto(new Date("2027-01-01T05:00:00Z")), "2027-01-01");
conferir("dia, mes e ano", dataEmSaoPaulo(new Date("2026-09-14T15:00:00Z")), { ano: 2026, mes: 9, dia: 14 });

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

console.log("\nFoto (banco)");

const PREFIXO = "ZZ Teste Fotos";
const MES1 = new Date("2025-01-01T12:00:00Z");
const MES2 = new Date("2025-02-01T12:00:00Z");
const AGORA1 = new Date("2025-01-20T15:00:00Z");
const AGORA2 = new Date("2025-02-20T15:00:00Z");

async function limpar() {
  await prisma.fotoMensalColeta.deleteMany({ where: { mes: { in: [MES1, MES2] } } });
  await prisma.fotoMensalProduto.deleteMany({ where: { mes: { in: [MES1, MES2] } } });
  await prisma.fonteColeta.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-FOTO-" } } });
  await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
}

const contarColeta = (fonteIds, mes) =>
  prisma.fotoMensalColeta.count({ where: { fonteId: { in: fonteIds }, mes } });

await limpar();

try {
  const fonteF = await prisma.fonteColeta.create({
    data: { nome: `${PREFIXO} Fornecedor`, dominio: "zz-fotos-f.invalid", tipo: "FORNECEDOR", ativa: false, proximaVarreduraEm: null },
  });
  const fonteC = await prisma.fonteColeta.create({
    data: { nome: `${PREFIXO} Concorrente`, dominio: "zz-fotos-c.invalid", tipo: "CONCORRENTE", ativa: false, proximaVarreduraEm: null },
  });
  const ids = [fonteF.id, fonteC.id];

  const lido = new Date("2025-01-10T12:00:00Z");
  const produto = (fonte, chave, dados) =>
    prisma.produtoColetado.create({
      data: { fonteId: fonte.id, chave, origem: "site", codigo: chave, nome: `Produto ${chave}`, coletadoEm: lido, vistoEm: lido, ...dados },
    });

  // Fornecedor: entra sempre, ate o que ficou ausente da lista.
  await produto(fonteF, "F1", { precoNormal: "10.00", precoComImpostos: "10.65", quantidade: 50, aChegar: 5, estoqueStatus: "IN_STOCK" });
  await produto(fonteF, "F2", { precoNormal: "20.00", quantidade: 0 });
  await produto(fonteF, "F3", { precoNormal: "5.00", quantidade: null, ausenteDesde: lido });
  // Fornecedor visto ha muito tempo continua entrando: a lista dele e regravada inteira.
  await produto(fonteF, "F4", { precoNormal: "7.00", quantidade: 3, vistoEm: new Date("2024-01-01T12:00:00Z") });

  // Concorrente: so o visto na janela.
  await produto(fonteC, "C1", { precoNormal: "30.00", precoPromocional: "27.00", precoComImpostos: "99.00", estoqueStatus: "AVAILABLE" });
  await produto(fonteC, "C2", { precoPromocional: "15.00" });
  await produto(fonteC, "C3", { precoNormal: "40.00", vistoEm: new Date("2024-06-01T12:00:00Z") });
  await produto(fonteC, "C4", { estoqueStatus: "OUT_OF_STOCK" });

  // Loja.
  const forn = await prisma.fornecedor.create({ data: { nome: `${PREFIXO} Forn` } });
  const p1 = await prisma.produto.create({
    data: { sku: "ZZ-FOTO-1", tituloBase: "Produto foto 1", precoVenda: "25.90", estoque: 7, fornecedorRascunho: { nome: "X", precoCusto: 12.5 } },
  });
  await prisma.anuncio.create({ data: { produtoId: p1.id, canal: "MERCADO_LIVRE", idExterno: "MLB0001" } });
  await prisma.anuncio.create({ data: { produtoId: p1.id, canal: "BLING" } });
  await prisma.produto.create({ data: { sku: "ZZ-FOTO-2", tituloBase: "Produto foto 2", precoVenda: "9.90", estoque: 0, custo: "4.20" } });
  const p3 = await prisma.produto.create({
    data: { sku: "ZZ-FOTO-3", tituloBase: "Produto foto 3", estoque: 2, fornecedorRascunho: { precoCusto: 12.5 } },
  });
  await prisma.produtoFornecedor.create({ data: { produtoId: p3.id, fornecedorId: forn.id, precoCusto: "8.00", padrao: true } });
  // Rascunho com valor que nao e numero nao pode derrubar a foto inteira.
  await prisma.produto.create({
    data: { sku: "ZZ-FOTO-4", tituloBase: "Produto foto 4", estoque: 1, fornecedorRascunho: { precoCusto: "abc" } },
  });

  // Antes do dia 14: nada.
  const cedo = await tirarFotoMensal({ agora: new Date("2025-01-10T15:00:00Z") });
  conferir("antes do dia 14 nao tira foto", [cedo.tirou, cedo.motivo], [false, "antes do dia 14"]);
  conferir("e nao grava nada", await contarColeta(ids, MES1), 0);

  // Dia 20 (o worker estava desligado no 14): tira.
  const foto1 = await tirarFotoMensal({ agora: AGORA1 });
  conferir("depois do dia 14 tira a foto", [foto1.tirou, foto1.mes], [true, "2025-01-01"]);
  conferir("a foto cobre o banco inteiro (ao menos os produtos de teste)", foto1.coleta >= 6 && foto1.produtos >= 4, true);

  const linhas = new Map(
    (await prisma.fotoMensalColeta.findMany({ where: { fonteId: { in: ids }, mes: MES1 } })).map((l) => [l.codigo, l]),
  );
  conferir("fornecedor: 4 produtos (o visto ha muito tempo inclusive)", [...linhas.keys()].filter((c) => c.startsWith("F")).sort(), ["F1", "F2", "F3", "F4"]);
  conferir("concorrente: so os vistos na janela", [...linhas.keys()].filter((c) => c.startsWith("C")).sort(), ["C1", "C2", "C4"]);

  conferir("fornecedor guarda o preco COM impostos", [Number(linhas.get("F1").preco), linhas.get("F1").tipoPreco], [10.65, "COM_IMPOSTOS"]);
  conferir("fornecedor sem imposto guarda o normal", [Number(linhas.get("F2").preco), linhas.get("F2").tipoPreco], [20, "NORMAL"]);
  conferir("concorrente guarda o NORMAL, nunca o promocional", [Number(linhas.get("C1").preco), linhas.get("C1").tipoPreco], [30, "NORMAL"]);
  conferir("concorrente ignora o preco com impostos", Number(linhas.get("C1").preco) === 99, false);
  conferir("so o promocional: guarda ele e diz que e", [Number(linhas.get("C2").preco), linhas.get("C2").tipoPreco], [15, "PROMOCIONAL"]);
  conferir("sem preco nenhum: nulo, sem tipo", [linhas.get("C4").preco, linhas.get("C4").tipoPreco], [null, null]);

  conferir("estoque do fornecedor: pronta entrega e a chegar", [linhas.get("F1").quantidade, linhas.get("F1").aChegar], [50, 5]);
  conferir("esgotado (0) e diferente de nao informado (nulo)", [linhas.get("F2").quantidade, linhas.get("C1").quantidade], [0, null]);
  conferir("ausente da lista: sem saldo e marcado", [linhas.get("F3").quantidade, linhas.get("F3").ausente], [null, true]);
  conferir("status do estoque", [linhas.get("C1").estoqueStatus, linhas.get("C4").estoqueStatus], ["AVAILABLE", "OUT_OF_STOCK"]);
  conferir("data da leitura, e nao da foto", linhas.get("F1").lidoEm.toISOString(), lido.toISOString());
  conferir("copia fonte e nome", [linhas.get("F1").fonteNome, linhas.get("F1").tipoFonte, linhas.get("F1").nome], [`${PREFIXO} Fornecedor`, "FORNECEDOR", "Produto F1"]);

  const loja = new Map(
    (await prisma.fotoMensalProduto.findMany({ where: { sku: { startsWith: "ZZ-FOTO-" }, mes: MES1 } })).map((l) => [l.sku, l]),
  );
  conferir("loja: 4 produtos", loja.size, 4);
  const l1 = loja.get("ZZ-FOTO-1");
  conferir("loja: preco de venda e estoque", [Number(l1.precoVenda), l1.estoque, l1.ativo], [25.9, 7, true]);
  conferir("loja: custo do rascunho", [Number(l1.custo), l1.custoOrigem], [12.5, "rascunho do Bling"]);
  conferir("loja: canais com anuncio", l1.canais.map((c) => c.canal), ["BLING", "MERCADO_LIVRE"]);
  conferir("loja: id do anuncio no canal", l1.canais.find((c) => c.canal === "MERCADO_LIVRE").idExterno, "MLB0001");
  conferir("loja: sem anuncio, lista vazia", loja.get("ZZ-FOTO-2").canais, []);
  conferir("loja: custo do cadastro quando nao ha rascunho", [Number(loja.get("ZZ-FOTO-2").custo), loja.get("ZZ-FOTO-2").custoOrigem], [4.2, "cadastro"]);
  conferir("loja: estoque zero e zero", loja.get("ZZ-FOTO-2").estoque, 0);
  conferir("loja: fornecedor padrao vence o rascunho", [Number(loja.get("ZZ-FOTO-3").custo), loja.get("ZZ-FOTO-3").custoOrigem], [8, "fornecedor padrao"]);
  conferir("loja: rascunho que nao e numero nao derruba a foto", [loja.get("ZZ-FOTO-4").custo, loja.get("ZZ-FOTO-4").custoOrigem], [null, null]);
  conferir("loja: sem preco de venda fica nulo", loja.get("ZZ-FOTO-3").precoVenda, null);

  // Idempotente: o worker confere de hora em hora.
  const repetida = await tirarFotoMensal({ agora: new Date("2025-01-25T15:00:00Z") });
  conferir("no mesmo mes nao tira de novo", [repetida.tirou, repetida.motivo], [false, "a foto deste mes ja existe"]);
  conferir("e nao duplica linha", await contarColeta(ids, MES1), 7);

  // Mes seguinte: concorrente so entra se foi visto DEPOIS da foto anterior.
  await produto(fonteC, "C5", { precoNormal: "50.00", vistoEm: new Date(Date.now() + 24 * 3600 * 1000), coletadoEm: new Date() });
  const foto2 = await tirarFotoMensal({ agora: AGORA2 });
  conferir("mes seguinte tira outra foto", [foto2.tirou, foto2.mes], [true, "2025-02-01"]);
  const linhas2 = (await prisma.fotoMensalColeta.findMany({ where: { fonteId: { in: ids }, mes: MES2 } })).map((l) => l.codigo).sort();
  conferir("concorrente: so o visto depois da foto anterior; fornecedor sempre", linhas2, ["C5", "F1", "F2", "F3", "F4"]);
  conferir("a foto do mes anterior segue intacta", await contarColeta(ids, MES1), 7);

  // Apagar fonte e produto nao leva o historico.
  await prisma.fonteColeta.deleteMany({ where: { id: { in: ids } } });
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-FOTO-" } } });
  conferir("apagar a fonte NAO apaga a foto", await contarColeta(ids, MES1), 7);
  conferir(
    "apagar o produto da loja NAO apaga a foto",
    await prisma.fotoMensalProduto.count({ where: { sku: { startsWith: "ZZ-FOTO-" }, mes: MES1 } }),
    4,
  );
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTodas as fotos mensais OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);

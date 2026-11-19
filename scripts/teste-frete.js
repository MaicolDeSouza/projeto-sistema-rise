import "dotenv/config";

/**
 * Testes do modulo de frete (spec 2026-11-18-modulo-de-frete-design.md, fase 1: cotacao). SEM rede: o Melhor Envio e
 * um servidor falso nesta maquina.
 *
 *   npm run teste:frete
 *
 * So escreve caixas "CX ZZ*" e produtos/pedidos ZZ-FRETE-*, apagados no comeco e no fim, e devolve a linha
 * ConfigDeFrete e a Conexao MELHOR_ENVIO do dono.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const {
  nomeDaCaixa,
  medidasInternas,
  itensIncompletos,
  pesoDoPacote,
  sugerirCaixa,
  valorACobrar,
  separarServicos,
  textoDaCotacao,
  lerDecimal,
} = await import("../src/lib/frete/regras.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

// ---------------------------------------------------------------------------
// Regras puras
// ---------------------------------------------------------------------------

console.log("\nRegras do frete");
const CX3 = { nome: "CX 16x11x3", comprimentoCm: 16, larguraCm: 11, alturaCm: 3, pesoVazioKg: 0.035, ativo: true };
const CX6 = { nome: "CX 16x11x6", comprimentoCm: 16, larguraCm: 11, alturaCm: 6, pesoVazioKg: 0.045, ativo: true };
const CX12 = { nome: "CX 19x12x12", comprimentoCm: 19, larguraCm: 12, alturaCm: 12, pesoVazioKg: 0.07, ativo: true };
const CAIXAS = [CX12, CX3, CX6]; // fora de ordem de proposito
const lcd = { pesoKg: 0.055, alturaCm: 2, larguraCm: 8, comprimentoCm: 6, quantidade: 1 };
const rele = { pesoKg: 0.096, alturaCm: 7.4, larguraCm: 10.6, comprimentoCm: 13.7, quantidade: 1 };

conferir("nome inteiro", nomeDaCaixa(CX3), "CX 16x11x3");
conferir("nome com casa decimal", nomeDaCaixa({ comprimentoCm: 16.5, larguraCm: 11, alturaCm: 3 }), "CX 16,5x11x3");
conferir("interna pela folga", medidasInternas(CX3), { comprimentoCm: 15.5, larguraCm: 10.5, alturaCm: 2.5 });
conferir(
  "interna informada vence",
  medidasInternas({ ...CX3, comprimentoInternoCm: 15.8, larguraInternaCm: 10.8, alturaInternaCm: 2.8 }),
  { comprimentoCm: 15.8, larguraCm: 10.8, alturaCm: 2.8 },
);
conferir(
  "peso: (itens + caixa) x 1,10",
  pesoDoPacote({ itens: [{ ...lcd, quantidade: 2 }, { pesoKg: 0.005, quantidade: 1 }], caixa: CX3, percentualDePesoExtra: 10 }),
  0.165,
);
conferir("peso sobe no grama", pesoDoPacote({ itens: [{ pesoKg: 0.0101, quantidade: 1 }], caixa: CX3, percentualDePesoExtra: 10 }), 0.05);
conferir("peso com item sem peso", pesoDoPacote({ itens: [{ pesoKg: null, quantidade: 1 }], caixa: CX3, percentualDePesoExtra: 10 }), null);
conferir("incompletos", itensIncompletos([lcd, { ...lcd, alturaCm: null }, { ...lcd, pesoKg: 0 }]), 2);
conferir("menor caixa que serve", sugerirCaixa({ itens: [lcd], caixas: CAIXAS }).caixa?.nome, "CX 16x11x3");
conferir("item alto pula para a grande", sugerirCaixa({ itens: [rele], caixas: CAIXAS }).caixa?.nome, "CX 19x12x12");
conferir("volume acima de 70% sobe de caixa", sugerirCaixa({ itens: [{ ...lcd, quantidade: 3 }], caixas: CAIXAS }).caixa?.nome, "CX 16x11x6");
conferir("nao cabe", sugerirCaixa({ itens: [{ ...lcd, comprimentoCm: 35 }], caixas: CAIXAS }), { caixa: null, motivo: "NAO_CABE" });
conferir("incompleto nao sugere", sugerirCaixa({ itens: [{ ...lcd, larguraCm: null }], caixas: CAIXAS }), { caixa: null, motivo: "ITENS_INCOMPLETOS" });
conferir("caixa inativa fica de fora", sugerirCaixa({ itens: [lcd], caixas: [{ ...CX3, ativo: false }, CX6] }).caixa?.nome, "CX 16x11x6");
conferir("cobrar", [valorACobrar(28.85, 1), valorACobrar(10.57, 1.5)], [29.85, 12.07]);
const lista = [
  { servicoId: "2", servicoNome: "SEDEX", transportadora: "Correios", preco: 28.85, prazoDias: 2, motivoDaRecusa: null },
  { servicoId: "1", servicoNome: "PAC", transportadora: "Correios", preco: 18.4, prazoDias: 6, motivoDaRecusa: null },
  { servicoId: "12", servicoNome: "éFácil", transportadora: "LATAM Cargo", preco: null, prazoDias: null, motivoDaRecusa: "Transportadora não atende este trecho." },
];
conferir(
  "separa e ordena",
  separarServicos(lista, 1).atendem.map((s) => [s.servicoNome, s.valorACobrar]),
  [
    ["PAC", 19.4],
    ["SEDEX", 29.85],
  ],
);
conferir("recusados", separarServicos(lista, 1).recusados.length, 1);
conferir("todos recusados", separarServicos([lista[2]], 1), { atendem: [], recusados: [lista[2]] });
conferir(
  "texto",
  textoDaCotacao({ cidadeDestino: "São Paulo (SP)", servicos: separarServicos(lista, 1).atendem }),
  "Frete para São Paulo (SP):\nCorreios PAC: R$ 19,40, 6 dias úteis\nCorreios SEDEX: R$ 29,85, 2 dias úteis",
);
conferir(
  "texto com 1 dia",
  textoDaCotacao({ cidadeDestino: "Caxias do Sul (RS)", servicos: [{ ...lista[0], prazoDias: 1, valorACobrar: 11.8 }] }),
  "Frete para Caxias do Sul (RS):\nCorreios SEDEX: R$ 11,80, 1 dia útil",
);
conferir(
  "decimal",
  [lerDecimal("0,3"), lerDecimal("1.250,00"), lerDecimal("0.3"), lerDecimal(""), lerDecimal("-1"), lerDecimal("abc")],
  [0.3, 1250, 0.3, null, null, null],
);

// ---------------------------------------------------------------------------
// Banco: caixas de envio e configuracao
// ---------------------------------------------------------------------------

const { prisma } = await import("../src/lib/db.js");
const { listarCaixas, salvarCaixa, excluirCaixa } = await import("../src/lib/frete/caixas.js");
const { lerConfigDeFrete, salvarConfigDeFrete } = await import("../src/lib/frete/configuracao.js");

const configDoDono = await prisma.configDeFrete.findUnique({ where: { id: "frete" } });
const limparCaixas = () => prisma.caixaDeEnvio.deleteMany({ where: { OR: [{ nome: { startsWith: "CX 9" } }, { nome: { startsWith: "CX ZZ" } }] } });

try {
  await limparCaixas();
  console.log("\nBanco: caixas e configuração");
  const nomes = (await listarCaixas()).map((c) => c.nome);
  conferir("semeadas", ["CX 16x11x3", "CX 16x11x6", "CX 19x12x12"].every((nome) => nomes.includes(nome)), true);
  conferir(
    "ordenadas pelo volume",
    nomes.indexOf("CX 16x11x3") < nomes.indexOf("CX 16x11x6") && nomes.indexOf("CX 16x11x6") < nomes.indexOf("CX 19x12x12"),
    true,
  );
  const nova = await salvarCaixa({ comprimentoCm: "99", larguraCm: "98,5", alturaCm: "97", pesoVazioKg: "0,2" });
  conferir("cria com o nome das medidas", [nova.ok, nova.caixa?.nome, nova.caixa?.pesoVazioKg], [true, "CX 99x98,5x97", 0.2]);
  conferir("medidas repetidas", (await salvarCaixa({ comprimentoCm: "99", larguraCm: "98,5", alturaCm: "97", pesoVazioKg: "0,2" })).ok, false);
  conferir("medida zero", "comprimentoCm" in ((await salvarCaixa({ comprimentoCm: "0", larguraCm: "10", alturaCm: "10", pesoVazioKg: "0,1" })).erros ?? {}), true);
  conferir(
    "interna maior que a externa",
    "comprimentoInternoCm" in ((await salvarCaixa({ comprimentoCm: "96", larguraCm: "95", alturaCm: "94", pesoVazioKg: "0,1", comprimentoInternoCm: "97" })).erros ?? {}),
    true,
  );
  const editada = await salvarCaixa({ comprimentoCm: "99", larguraCm: "98,5", alturaCm: "97", pesoVazioKg: "0,25", ativo: false }, nova.caixa.id);
  conferir("edita o peso e desativa", [editada.ok, editada.caixa?.pesoVazioKg, editada.caixa?.ativo], [true, 0.25, false]);
  conferir("so ativas", (await listarCaixas({ soAtivas: true })).every((c) => c.ativo), true);
  conferir("exclui a sem uso", (await excluirCaixa(nova.caixa.id)).ok, true);
  conferir("excluida some", (await listarCaixas()).some((c) => c.id === nova.caixa.id), false);
  const config = await lerConfigDeFrete();
  conferir("config padrao", [config.acrescimoDeEmbalagem, config.percentualDePesoExtra], [1, 10]);
  conferir("config invalida", (await salvarConfigDeFrete({ acrescimoDeEmbalagem: "-1", percentualDePesoExtra: "10" })).ok, false);
  conferir("config acima de 100%", (await salvarConfigDeFrete({ acrescimoDeEmbalagem: "1", percentualDePesoExtra: "120" })).ok, false);
  conferir(
    "config salva",
    [(await salvarConfigDeFrete({ acrescimoDeEmbalagem: "1,50", percentualDePesoExtra: "12" })).ok, (await lerConfigDeFrete()).acrescimoDeEmbalagem],
    [true, 1.5],
  );
} finally {
  await limparCaixas();
  if (configDoDono) await prisma.configDeFrete.update({ where: { id: "frete" }, data: { ...configDoDono, atualizadoEm: undefined } });
}

// ---------------------------------------------------------------------------

await prisma.$disconnect();
console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

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

const { estoqueDoKit, ncmsDasPecas, pesoEMedidasDoKit, totaisDoKit, validarComposicao } = await import(
  "../src/lib/composicao.js"
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

// ---------------------------------------------------------------------------
// Resumo
// ---------------------------------------------------------------------------

console.log(falhas === 0 ? "\nTodos os testes da composicao OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);

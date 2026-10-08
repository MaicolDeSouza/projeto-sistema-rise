/**
 * Testa as regras puras da migracao para a VPS: a auditoria de nomes de arquivo (Windows ignora caixa,
 * Linux nao). Sem rede e sem banco.
 *
 *   npm run teste:migracao
 */

const { conferirNomes } = await import("../src/lib/auditoriaArquivos.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}`);
  if (!ok) console.log(`       obtido:   ${JSON.stringify(obtido)}\n       esperado: ${JSON.stringify(esperado)}`);
}

// ---------------------------------------------------------------- conferirNomes
conferir("conferirNomes: tudo certo", conferirNomes(["a.jpg"], ["a.jpg"]), { faltando: [], caixaDiferente: [] });
conferir("conferirNomes: faltando", conferirNomes(["a.jpg", "b.pdf"], ["a.jpg"]), { faltando: ["b.pdf"], caixaDiferente: [] });
conferir(
  "conferirNomes: caixa diferente",
  conferirNomes(["abc.jpg"], ["ABC.jpg"]),
  { faltando: [], caixaDiferente: [{ esperado: "abc.jpg", encontrado: "ABC.jpg" }] },
);
conferir(
  "conferirNomes: pasta de SKU com caixa diferente",
  conferirNomes(["ZZ-TESTE-BLING", "100101"], ["zz-teste-bling", "100101"]),
  { faltando: [], caixaDiferente: [{ esperado: "ZZ-TESTE-BLING", encontrado: "zz-teste-bling" }] },
);
conferir("conferirNomes: arquivo a mais no disco nao e problema", conferirNomes(["a.jpg"], ["a.jpg", "sobra.jpg"]), { faltando: [], caixaDiferente: [] });
conferir("conferirNomes: nada esperado", conferirNomes([], ["a.jpg"]), { faltando: [], caixaDiferente: [] });
conferir("conferirNomes: pasta vazia", conferirNomes(["a.jpg"], []), { faltando: ["a.jpg"], caixaDiferente: [] });
conferir(
  "conferirNomes: o exato vence o de caixa diferente",
  conferirNomes(["a.jpg"], ["A.jpg", "a.jpg"]),
  { faltando: [], caixaDiferente: [] },
);
conferir("conferirNomes: esperado repetido conta uma vez", conferirNomes(["b.pdf", "b.pdf"], []), { faltando: ["b.pdf"], caixaDiferente: [] });

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

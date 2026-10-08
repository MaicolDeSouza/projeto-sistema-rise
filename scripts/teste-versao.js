/**
 * Testa a versao mostrada no pe do menu. Sem rede e sem banco.
 *
 *   npm run teste:versao
 */

const { formatarVersao, versaoDoDeploy, versaoLocal } = await import("../src/lib/versao.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}`);
  if (!ok) console.log(`       obtido:   ${JSON.stringify(obtido)}\n       esperado: ${JSON.stringify(esperado)}`);
}

// ---------------------------------------------------------------- formatarVersao
// 01:17 UTC do dia 8 e 22:17 do dia 7 em Sao Paulo: a versao e a hora de quem opera.
conferir("formatarVersao: Sao Paulo", formatarVersao(new Date("2026-10-08T01:17:00Z")), "07.10.2026.22.17");
conferir("formatarVersao: zero a esquerda", formatarVersao(new Date("2026-01-05T12:03:00Z")), "05.01.2026.09.03");
conferir("formatarVersao: meia-noite", formatarVersao(new Date("2026-10-08T03:00:00Z")), "08.10.2026.00.00");
conferir("formatarVersao: virada do ano", formatarVersao(new Date("2027-01-01T02:59:00Z")), "31.12.2026.23.59");

// ---------------------------------------------------------------- versaoDoDeploy
conferir("versaoDoDeploy: sem variavel", versaoDoDeploy({}), { versao: "dev", commit: null });
conferir(
  "versaoDoDeploy: com variavel",
  versaoDoDeploy({ RISE_VERSAO: "07.10.2026.22.17", RISE_COMMIT: "9b1c481" }),
  { versao: "07.10.2026.22.17", commit: "9b1c481" },
);
conferir("versaoDoDeploy: so commit", versaoDoDeploy({ RISE_COMMIT: "9b1c481" }), { versao: "dev", commit: "9b1c481" });
conferir("versaoDoDeploy: variavel em branco", versaoDoDeploy({ RISE_VERSAO: "  ", RISE_COMMIT: "" }), { versao: "dev", commit: null });
conferir(
  "versaoDoDeploy: espacos nas pontas",
  versaoDoDeploy({ RISE_VERSAO: " 07.10.2026.22.17 ", RISE_COMMIT: " 9b1c481 " }),
  { versao: "07.10.2026.22.17", commit: "9b1c481" },
);
conferir("versaoDoDeploy: sem objeto", versaoDoDeploy(undefined), { versao: "dev", commit: null });

// ---------------------------------------------------------------- versaoLocal (o PC)
// A data vem do git (%cI, com o fuso do commit) e sai na hora de Sao Paulo, como na VPS.
conferir("versaoLocal: hora do ultimo commit", versaoLocal({ dataDoCommit: "2026-10-08T13:08:31-03:00" }), "dev 08.10.2026.13.08");
conferir("versaoLocal: alterado e nao commitado", versaoLocal({ dataDoCommit: "2026-10-08T13:08:31-03:00", alterado: true }), "dev 08.10.2026.13.08+");
conferir("versaoLocal: Date", versaoLocal({ dataDoCommit: new Date("2026-10-08T01:17:00Z") }), "dev 07.10.2026.22.17");
conferir("versaoLocal: sem git", versaoLocal({}), "dev");
conferir("versaoLocal: sem objeto", versaoLocal(), "dev");
conferir("versaoLocal: data nula nao vira 1970", versaoLocal({ dataDoCommit: null }), "dev");
conferir("versaoLocal: data invalida", versaoLocal({ dataDoCommit: "ontem" }), "dev");

const local = { commit: "46cdeca", dataDoCommit: "2026-10-08T13:08:31-03:00", alterado: false };
conferir("versaoDoDeploy: no PC usa o git local", versaoDoDeploy({}, local), { versao: "dev 08.10.2026.13.08", commit: "46cdeca" });
conferir(
  "versaoDoDeploy: na VPS a variavel vence o git",
  versaoDoDeploy({ RISE_VERSAO: "08.10.2026.11.12", RISE_COMMIT: "a006d48" }, local),
  { versao: "08.10.2026.11.12", commit: "a006d48" },
);
conferir("versaoDoDeploy: git sem commit (imagem Docker)", versaoDoDeploy({}, {}), { versao: "dev", commit: null });

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

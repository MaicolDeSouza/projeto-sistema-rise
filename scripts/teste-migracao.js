/**
 * Testa as regras puras da migracao para a VPS: a auditoria de nomes de arquivo (Windows ignora caixa,
 * Linux nao). Sem rede e sem banco.
 *
 *   npm run teste:migracao
 */

const { conferirNomes } = await import("../src/lib/auditoriaArquivos.js");
const {
  argumentosDeRestore,
  bancoDeEnsaioValido,
  dumpMaisRecente,
  ehBackupAutomatico,
  ehBancoLocal,
  nomeDaCopiaDeSeguranca,
  sqlLimparConexoes,
} = await import("../src/lib/copiaLocal.js");
const { conexaoDaUrl } = await import("./lib/postgres.js");

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

// ---------------------------------------------------------------- copia de desenvolvimento
conferir("ehBancoLocal: localhost", ehBancoLocal("postgresql://rise:x@localhost:5432/sistema_rise"), true);
conferir("ehBancoLocal: 127.0.0.1", ehBancoLocal("postgresql://rise:x@127.0.0.1:5432/sistema_rise"), true);
conferir("ehBancoLocal: ::1", ehBancoLocal("postgresql://rise:x@[::1]:5432/sistema_rise"), true);
conferir("ehBancoLocal: VPS (host db)", ehBancoLocal("postgresql://rise:x@db:5432/sistema_rise"), false);
conferir("ehBancoLocal: ip publico", ehBancoLocal("postgresql://rise:x@187.1.2.3:5432/sistema_rise"), false);
conferir("ehBancoLocal: dominio que comeca com localhost", ehBancoLocal("postgresql://rise:x@localhost.evil.com/sistema_rise"), false);
conferir("ehBancoLocal: vazio", ehBancoLocal(""), false);
conferir("ehBancoLocal: lixo", ehBancoLocal("nao e url"), false);

conferir(
  "sqlLimparConexoes: so ML e Bling",
  sqlLimparConexoes(),
  `DELETE FROM "Conexao" WHERE "servico" IN ('MERCADO_LIVRE', 'BLING')`,
);

const restore = argumentosDeRestore({ dump: "x.dump", banco: "sistema_rise" });
conferir("argumentosDeRestore: dropdb", restore.dropdb, ["--if-exists", "--no-password", "sistema_rise"]);
conferir(
  "argumentosDeRestore: createdb igual ao banco de hoje (template0, UTF8, en-US libc e ICU)",
  restore.createdb,
  ["--no-password", "--template=template0", "--encoding=UTF8", "--locale=en-US", "--locale-provider=icu", "--icu-locale=en-US", "sistema_rise"],
);
conferir("argumentosDeRestore: pg_restore sem dono", restore.pgRestore, ["--no-owner", "--no-password", "--dbname=sistema_rise", "x.dump"]);

conferir("ehBackupAutomatico: nome do npm run backup", ehBackupAutomatico("sistema_rise-20261007-164838.dump", "sistema_rise"), true);
conferir("ehBackupAutomatico: copia de seguranca nao e automatico", ehBackupAutomatico("sistema_rise-antes-da-copia-20261008-010203.dump", "sistema_rise"), false);
conferir("ehBackupAutomatico: outro banco", ehBackupAutomatico("outro-20261007-164838.dump", "sistema_rise"), false);

// A copia de seguranca nunca pode casar com o padrao automatico: a retencao do npm run backup a apagaria.
const copia = nomeDaCopiaDeSeguranca("sistema_rise", new Date(2026, 9, 8, 1, 2, 3));
conferir("nomeDaCopiaDeSeguranca: formato", copia, "sistema_rise-antes-da-copia-20261008-010203.dump");
conferir("nomeDaCopiaDeSeguranca: fora da retencao", ehBackupAutomatico(copia, "sistema_rise"), false);

conferir(
  "dumpMaisRecente: o de data maior, so automaticos",
  dumpMaisRecente(
    ["sistema_rise-20261006-232659.dump", "sistema_rise-20261007-164838.dump", "sistema_rise-antes-da-copia-20261009-000000.dump", "leia-me.txt"],
    "sistema_rise",
  ),
  "sistema_rise-20261007-164838.dump",
);
conferir("dumpMaisRecente: nenhum", dumpMaisRecente(["leia-me.txt"], "sistema_rise"), null);

conferir("bancoDeEnsaioValido: com sufixo", bancoDeEnsaioValido("sistema_rise_ensaio", "sistema_rise"), true);
conferir("bancoDeEnsaioValido: o proprio banco", bancoDeEnsaioValido("sistema_rise", "sistema_rise"), false);
conferir("bancoDeEnsaioValido: outro banco qualquer", bancoDeEnsaioValido("postgres", "sistema_rise"), false);
conferir("bancoDeEnsaioValido: caractere estranho", bancoDeEnsaioValido("sistema_rise_x;drop", "sistema_rise"), false);
conferir("bancoDeEnsaioValido: maiuscula", bancoDeEnsaioValido("sistema_rise_Ensaio", "sistema_rise"), false);

conferir(
  "conexaoDaUrl: senha com caracteres especiais",
  conexaoDaUrl("postgresql://rise:p%40ss%3Aw0rd@localhost:5433/sistema_rise"),
  { PGHOST: "localhost", PGPORT: "5433", PGUSER: "rise", PGPASSWORD: "p@ss:w0rd", PGDATABASE: "sistema_rise" },
);
conferir(
  "conexaoDaUrl: porta padrao",
  conexaoDaUrl("postgresql://rise:x@127.0.0.1/sistema_rise").PGPORT,
  "5432",
);

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

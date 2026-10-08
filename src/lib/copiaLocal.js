/**
 * Regras puras da copia de desenvolvimento (o banco do PC restaurado a partir do backup da VPS). Sem imports:
 * sao lidas pelo `scripts/atualizar-copia.js`, pelo `scripts/backup-banco.js` e pelo `teste-migracao.js`.
 */

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/// Restaurar apaga o banco inteiro. So se aceita fazer isso num Postgres desta maquina: com a URL da VPS no
/// .env, o script apagaria a producao.
export function ehBancoLocal(url) {
  try {
    return HOSTS_LOCAIS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/// Os tokens do ML e do Bling ROTACIONAM a cada renovacao: uma copia do PC que renovasse o token invalidaria o
/// da VPS, e a falha pareceria erro da API. O da Loja Integrada e fixo (Personal Token) e pode ficar.
export function sqlLimparConexoes() {
  return `DELETE FROM "Conexao" WHERE "servico" IN ('MERCADO_LIVRE', 'BLING')`;
}

/**
 * Argumentos de dropdb, createdb e pg_restore. O createdb repete como o banco do PC foi criado (15/09/2026):
 * template0 (o template1 do instalador herda a codificacao do Windows), UTF8, locale en-US e ICU en-US.
 */
export function argumentosDeRestore({ dump, banco }) {
  return {
    dropdb: ["--if-exists", "--no-password", banco],
    createdb: [
      "--no-password",
      "--template=template0",
      "--encoding=UTF8",
      "--locale=en-US",
      "--locale-provider=icu",
      "--icu-locale=en-US",
      banco,
    ],
    pgRestore: ["--no-owner", "--no-password", `--dbname=${banco}`, dump],
  };
}

/// O nome que o `npm run backup` da: `<banco>-AAAAMMDD-HHMMSS.dump`. So esses entram na retencao de 4.
export function ehBackupAutomatico(nome, banco) {
  return nome.startsWith(`${banco}-`) && /^\d{8}-\d{6}\.dump$/.test(nome.slice(banco.length + 1));
}

/// Copia do banco ANTES de apagar, com nome fora da retencao (nunca e apagada sozinha).
export function nomeDaCopiaDeSeguranca(banco, data) {
  const dois = (valor) => String(valor).padStart(2, "0");
  const carimbo =
    `${data.getFullYear()}${dois(data.getMonth() + 1)}${dois(data.getDate())}` +
    `-${dois(data.getHours())}${dois(data.getMinutes())}${dois(data.getSeconds())}`;
  return `${banco}-antes-da-copia-${carimbo}.dump`;
}

/// O dump automatico mais novo de uma listagem (o nome carrega a data, entao a ordem alfabetica e a cronologica).
export function dumpMaisRecente(nomes, banco) {
  const automaticos = nomes.filter((nome) => ehBackupAutomatico(nome, banco)).sort();
  return automaticos.at(-1) ?? null;
}

/// Banco de ENSAIO: restaura ao lado do de verdade, sem tocar nele nem nos tokens. Precisa comecar pelo nome do
/// banco principal e ter so minusculas, numeros e "_", porque o nome vai para a linha de comando.
export function bancoDeEnsaioValido(nome, banco) {
  return typeof nome === "string" && nome !== banco && nome.startsWith(`${banco}_`) && /^[a-z0-9_]+$/.test(nome);
}

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

/// Quantos backups automaticos o `npm run backup` guarda (BACKUP_MANTER). So inteiro de 1 a 365; o resto cai no
/// padrao. Com 0 ou negativo o `slice` da retencao cobriria a lista inteira e o backup das 03:00 apagaria TODOS
/// os dumps, o que acabou de gerar inclusive (um `BACKUP_MANTER=-1` digitado no .env da VPS).
export function manterBackups(valor, padrao = 4) {
  const texto = String(valor ?? "").trim();
  if (!/^\d+$/.test(texto)) return padrao;
  const numero = Number(texto);
  return numero >= 1 && numero <= 365 ? numero : padrao;
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

// ---------------------------------------------------------------------------------------------------------------
// As Conexao do PC que sobrevivem a copia (08/10/2026). Com um app proprio do PC no ML e no Bling, o token do PC
// e do PC: nao ha por que apaga-lo a cada copia. O que continua sendo apagado e o token que veio no dump (o da
// VPS) e qualquer token cujo app nao seja o do .env deste PC.
// ---------------------------------------------------------------------------------------------------------------

const COLUNAS_CONEXAO = [
  "id",
  "servico",
  "segredoCifrado",
  "status",
  "contaExterna",
  "escopos",
  "expiraEm",
  "conectadoEm",
  "ultimoTesteEm",
  "ultimoTesteOk",
  "ultimoErro",
  "criadoEm",
  "atualizadoEm",
];

/// As linhas do PC dos servicos que rotacionam, lidas ANTES de apagar o banco. Enum e TIMESTAMP vao como texto:
/// o pg converteria o TIMESTAMP sem fuso em Date local e de volta, e a linha tem que voltar igual.
export function sqlLerConexoes() {
  const colunas = COLUNAS_CONEXAO.map((coluna) =>
    ["servico", "status", "expiraEm", "conectadoEm", "ultimoTesteEm", "criadoEm", "atualizadoEm"].includes(coluna)
      ? `"${coluna}"::text AS "${coluna}"`
      : `"${coluna}"`,
  );
  return `SELECT ${colunas.join(", ")} FROM "Conexao" WHERE "servico" IN ('MERCADO_LIVRE', 'BLING')`;
}

function limpo(valor) {
  const texto = typeof valor === "string" ? valor.trim() : "";
  return texto || null;
}

/**
 * Quais Conexao do PC voltam depois do restore. So volta o token cujo app (o `clientId` gravado no segredo
 * desde 08/10/2026) e o mesmo do .env deste PC. Token de outro app e o da producao (o .env do PC tinha as
 * credenciais da VPS quando ele foi gerado), e token gravado antes de o clientId existir nao prova nada: os
 * dois saem, como sempre sairam, e a tela Integracoes pede a autorizacao de novo.
 */
export function conexoesDoPc(linhas, { clientIds, decifrar }) {
  const manter = [];
  const descartar = [];
  for (const linha of linhas ?? []) {
    const esperado = limpo(clientIds?.[linha.servico]);
    let gravado = null;
    let ilegivel = false;
    if (linha.segredoCifrado) {
      try {
        gravado = limpo(decifrar(linha.segredoCifrado)?.clientId);
      } catch {
        ilegivel = true;
      }
    }
    let motivo = null;
    if (!linha.segredoCifrado) motivo = "sem token";
    else if (ilegivel) motivo = "segredo ilegivel com a ENCRYPTION_KEY deste .env";
    else if (!esperado) motivo = "sem client id no .env";
    else if (!gravado) motivo = "token sem o app registrado (autorizado antes de 08/10/2026)";
    else if (gravado !== esperado) motivo = "token de outro app";
    if (motivo) descartar.push({ servico: linha.servico, motivo });
    else manter.push(linha);
  }
  return { manter, descartar };
}

/// INSERT parametrizado de uma linha lida por sqlLerConexoes, coluna a coluna, na mesma ordem.
export function sqlInserirConexao(linha) {
  return {
    texto:
      `INSERT INTO "Conexao" (${COLUNAS_CONEXAO.map((coluna) => `"${coluna}"`).join(", ")}) ` +
      `VALUES (${COLUNAS_CONEXAO.map((_, indice) => `$${indice + 1}`).join(", ")})`,
    valores: COLUNAS_CONEXAO.map((coluna) => linha[coluna] ?? null),
  };
}

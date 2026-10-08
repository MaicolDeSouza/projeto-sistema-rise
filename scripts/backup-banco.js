import "dotenv/config";

/**
 * Backup do banco em arquivo.
 *
 *   npm run backup
 *
 * Gera dados/backup/sistema_rise-AAAAMMDD-HHMMSS.dump no formato do pg_dump
 * (`--format=custom`: compactado, e o pg_restore escolhe o que restaurar) e confere
 * o arquivo lendo o indice dele com pg_restore. E o arquivo que vai para a VPS:
 *
 *   pg_restore --no-owner --dbname=<banco novo> dados/backup/<arquivo>.dump
 *
 * Pode rodar com o site e o worker no ar: o pg_dump le uma foto consistente do
 * banco, sem travar quem grava.
 *
 * A SENHA VAI POR VARIAVEL DE AMBIENTE (PGPASSWORD) e `--no-password`. Passada na
 * URL, o pg_dump do Windows parou esperando senha no terminal em 16/09/2026 — e sem
 * `--no-password` ficaria esperando para sempre, sem erro.
 *
 * `dados/` fica fora do git: o backup leva os tokens das integracoes (cifrados).
 */

import { appendFileSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ehBackupAutomatico } from "../src/lib/copiaLocal.js";
import { binario, conexaoDaUrl, rodar } from "./lib/postgres.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const PASTA = path.join(aqui, "..", "dados", "backup");
const LOG = path.join(aqui, "..", "dados", "logs", "backup.log");

/// Quantos backups AUTOMATICOS ficam guardados — 4, pedido do dono em 16/09/2026:
/// ao gravar o quinto, o mais antigo sai. So conta arquivo com o nome deste script
/// (`<banco>-AAAAMMDD-HHMMSS.dump`): backup feito a mao com outro nome
/// ("...-antes-coleta-no-banco-...") nunca e apagado.
const MANTER = 4;

/** Registra no dados/logs/backup.log — a tarefa agendada roda sem terminal. */
function registrar(texto) {
  const linha = `[${new Date().toLocaleString("pt-BR")}] ${texto}`;
  console.log(linha);
  try {
    mkdirSync(path.dirname(LOG), { recursive: true });
    appendFileSync(LOG, `${linha}\n`);
  } catch {
    // Sem log em arquivo, o backup continua valendo.
  }
}

// binario() e rodar() moram em scripts/lib/postgres.js desde 08/10/2026: a copia de desenvolvimento
// (atualizar-copia.js) chama os mesmos programas do mesmo jeito.
const conexao = conexaoDaUrl(process.env.DATABASE_URL);

const agora = new Date();
const carimbo = [
  agora.getFullYear(),
  String(agora.getMonth() + 1).padStart(2, "0"),
  String(agora.getDate()).padStart(2, "0"),
  "-",
  String(agora.getHours()).padStart(2, "0"),
  String(agora.getMinutes()).padStart(2, "0"),
  String(agora.getSeconds()).padStart(2, "0"),
].join("");

mkdirSync(PASTA, { recursive: true });
const arquivo = path.join(PASTA, `${conexao.PGDATABASE}-${carimbo}.dump`);

const inicio = Date.now();

try {
  await rodar(
    binario("pg_dump"),
    ["--format=custom", "--no-owner", "--no-password", `--file=${arquivo}`],
    conexao,
    10 * 60 * 1000,
  );

  // Conferencia: um backup que o pg_restore nao le nao e backup.
  const indice = await rodar(binario("pg_restore"), ["--list", arquivo], {}, 60 * 1000);
  const tabelas = indice.split("\n").filter((linha) => /TABLE DATA/.test(linha)).length;
  if (tabelas === 0) throw new Error("o arquivo gerado nao tem dados de tabela nenhuma");

  const megas = (statSync(arquivo).size / 1024 / 1024).toFixed(1);
  registrar(
    `backup pronto: ${path.basename(arquivo)} · ${megas} MB · ${tabelas} tabela(s) com dados · ` +
      `${((Date.now() - inicio) / 1000).toFixed(1)} s`,
  );
} catch (erro) {
  // Backup quebrado sai da pasta: senao contaria como um dos quatro e apagaria
  // um bom no lugar dele.
  rmSync(arquivo, { force: true });
  registrar(`BACKUP FALHOU: ${erro.message}`);
  process.exit(1);
}

// HISTORICO DE QUATRO. So depois do backup novo conferido: se ele falhar, os
// antigos ficam todos. O nome carrega a data, entao ordem alfabetica e cronologica.
const automaticos = readdirSync(PASTA)
  .filter((nome) => ehBackupAutomatico(nome, conexao.PGDATABASE))
  .sort();
for (const antigo of automaticos.slice(0, Math.max(0, automaticos.length - MANTER))) {
  rmSync(path.join(PASTA, antigo), { force: true });
  registrar(`backup antigo apagado (historico de ${MANTER}): ${antigo}`);
}

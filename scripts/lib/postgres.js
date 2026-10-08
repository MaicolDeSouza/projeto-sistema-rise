/**
 * Utilitarios dos scripts que chamam os programas do Postgres (pg_dump, pg_restore, dropdb, createdb).
 * Usado por backup-banco.js e atualizar-copia.js; sem `@/`, para rodar com `node` puro.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/// Onde estao os programas. PG_BIN aponta outra pasta; sem ela, a do instalador do PostgreSQL 17 no Windows,
/// e por fim o PATH (Linux da VPS, onde a imagem instala o postgresql-client-17).
export function binario(nome) {
  const extensao = process.platform === "win32" ? ".exe" : "";
  const pastas = [process.env.PG_BIN, "C:/Program Files/PostgreSQL/17/bin"].filter(Boolean);
  for (const pasta of pastas) {
    const caminho = path.join(pasta, `${nome}${extensao}`);
    if (existsSync(caminho)) return caminho;
  }
  return nome;
}

/// Roda um programa e devolve o que ele escreveu. Teto de tempo porque um pg_dump esperando senha no terminal
/// ficaria parado para sempre, sem erro (visto em 16/09/2026).
export function rodar(comando, argumentos, env, tetoMs) {
  return new Promise((resolver, rejeitar) => {
    const filho = spawn(comando, argumentos, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let saida = "";
    let erro = "";
    filho.stdout.on("data", (pedaco) => (saida += pedaco));
    filho.stderr.on("data", (pedaco) => (erro += pedaco));
    const relogio = setTimeout(() => {
      filho.kill();
      rejeitar(new Error(`${path.basename(comando)} passou de ${tetoMs / 1000}s e foi interrompido`));
    }, tetoMs);
    filho.on("error", (falha) => {
      clearTimeout(relogio);
      rejeitar(falha);
    });
    filho.on("close", (codigo) => {
      clearTimeout(relogio);
      if (codigo === 0) resolver(saida);
      else rejeitar(new Error(`${path.basename(comando)} saiu com codigo ${codigo}: ${erro.trim()}`));
    });
  });
}

/// A conexao em variaveis PG*. A senha vai por PGPASSWORD com --no-password: passada na URL, o pg_dump do
/// Windows parou esperando senha no terminal.
export function conexaoDaUrl(texto) {
  const url = new URL(texto);
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

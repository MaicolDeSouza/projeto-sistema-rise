/**
 * O lado do cartao "Servidor VPS" que FALA com o mundo: o git do PC, a VPS por SSH e o arquivo de estado da operacao
 * (`dados/vps-operacao.json`). As decisoes moram em `regras.js`.
 *
 * Sem imports do projeto por `@/` (so caminhos relativos e o Node): `scripts/vps-copiar-banco.js` importa este arquivo
 * direto, sem o resolvedor. Tudo aqui so roda no Rise do PC: as acoes conferem isso antes (`ehOPcDeDesenvolvimento`).
 */

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import * as regras from "./regras.js";
import { ambienteDoTerminal } from "../coleta/workerPc.js";

const ARQUIVO_DE_ESTADO = "vps-operacao.json";
/// O log do ajudante da copia (o que ele e o `copia:atualizar` escrevem), para quando a tela disser "veja o log".
export const LOG_DA_COPIA = "vps-copia-botao.log";

// ---------------------------------------------------------------- rodar programas

/**
 * Roda um programa SEM shell, com teto de tempo. Nunca lanca: devolve `{codigo, saida, erro}` (codigo -1 quando nem
 * comecou). `saidaPara`: um descritor de arquivo para a saida padrao (o dump, que e binario e grande).
 */
export function rodar(programa, argumentos, { cwd, entrada = null, tempoMs = 60_000, saidaPara = null } = {}) {
  return new Promise((resolver) => {
    let filho;
    try {
      filho = spawn(programa, argumentos, { cwd, windowsHide: true, stdio: ["pipe", saidaPara ?? "pipe", "pipe"] });
    } catch (erro) {
      resolver({ codigo: -1, saida: "", erro: erro.message });
      return;
    }
    let saida = "";
    let erro = "";
    filho.stdout?.on("data", (pedaco) => {
      saida += pedaco;
      if (saida.length > 2_000_000) saida = saida.slice(-1_000_000);
    });
    filho.stderr.on("data", (pedaco) => {
      erro += pedaco;
      if (erro.length > 200_000) erro = erro.slice(-100_000);
    });
    const relogio = setTimeout(() => filho.kill(), tempoMs);
    filho.on("error", (falha) => {
      clearTimeout(relogio);
      resolver({ codigo: -1, saida, erro: falha.message });
    });
    filho.on("close", (codigo) => {
      clearTimeout(relogio);
      resolver({ codigo: codigo ?? -1, saida, erro });
    });
    filho.stdin.on("error", () => {});
    filho.stdin.end(entrada ?? undefined);
  });
}

/// As mesmas opcoes do `worker-pc.js`: so a chave, uma VPS de chave trocada e recusada, e o BatchMode nao pergunta nada.
function opcoesDoSsh() {
  const chave = process.env.VPS_SSH_CHAVE || path.join(os.homedir(), ".ssh", "rise_vps");
  return ["-i", chave, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15"];
}

/// Roda um script bash NA VPS, mandado pelo stdin (`bash -s`): nada do script passa pela linha de comando.
export function naVps(script, opcoes = {}) {
  return rodar("ssh", [...opcoesDoSsh(), process.env.VPS_SSH || regras.VPS_PADRAO.ssh, "bash -s"], { ...opcoes, entrada: script });
}

/// A primeira linha util do erro do ssh, curta, para a tela.
export function erroDoSsh(resultado) {
  const linha = String(resultado.erro ?? "")
    .split(/\r?\n/)
    .map((texto) => texto.trim())
    .find((texto) => texto && !/^Warning: Permanently added/i.test(texto));
  return (linha || `o ssh saiu com ${resultado.codigo}`).slice(0, 200);
}

// ---------------------------------------------------------------- estado da operacao

const caminhoDoEstado = (pasta) => path.join(pasta, "dados", ARQUIVO_DE_ESTADO);

export function lerEstado(pasta) {
  try {
    return JSON.parse(readFileSync(caminhoDoEstado(pasta), "utf8"));
  } catch {
    return null;
  }
}

/// Por arquivo temporario e rename: a tela nunca le um JSON pela metade.
export function gravarEstado(pasta, estado) {
  const destino = caminhoDoEstado(pasta);
  mkdirSync(path.dirname(destino), { recursive: true });
  const temporario = `${destino}.${process.pid}.tmp`;
  writeFileSync(temporario, JSON.stringify(estado, null, 2));
  renameSync(temporario, destino);
}

const SEM_COR = /\u001b\[[0-9;]*[A-Za-z]/g;
const ultimasLinhas = (texto, quantas = 12) =>
  String(texto ?? "")
    .replace(SEM_COR, "")
    .split(/\r?\n/)
    .map((linha) => linha.trimEnd())
    .filter(Boolean)
    .slice(-quantas);

// ---------------------------------------------------------------- leitura

/// O git do PC: busca a origin/main (o que a VPS vai baixar) e le o que esta so aqui.
async function lerGit(pasta) {
  const busca = await rodar("git", ["fetch", "-q", "origin"], { cwd: pasta, tempoMs: 30_000 });
  const status = await rodar("git", ["status", "--porcelain=v1", "-b", "--untracked-files=no"], { cwd: pasta });
  const github = await rodar("git", ["rev-parse", "--short", "origin/main"], { cwd: pasta });
  return {
    githubLido: busca.codigo === 0,
    git: status.codigo === 0 ? regras.lerStatusDoGit(status.saida) : null,
    commitDoGithub: github.codigo === 0 ? github.saida.trim() || null : null,
  };
}

/** A VPS numa conexao so: commit, versao no ar, deploy rodando, disco e varreduras. */
export async function lerVps() {
  const resultado = await naVps(regras.scriptDeLeituraDaVps(), { tempoMs: 40_000 });
  if (resultado.codigo !== 0) return { alcancavel: false, erro: erroDoSsh(resultado) };
  return { alcancavel: true, ...regras.lerSaidaDaVps(resultado.saida) };
}

/// Ha operacao rodando? O texto do bloqueio, ou null.
function outraOperacaoDe(operacao) {
  if (operacao?.fase !== "rodando") return null;
  return operacao.tipo === "deploy"
    ? "A VPS já está sendo atualizada (deploy em andamento)."
    : "O banco do PC já está sendo atualizado.";
}

/**
 * Tudo o que o cartao mostra: o que esta no ar, o que vai subir (commits e migrations entre o que roda na VPS e a
 * origin/main), as decisoes dos dois botoes e a ultima operacao.
 */
export async function lerSituacao(pasta) {
  const [git, vps] = await Promise.all([lerGit(pasta), lerVps()]);

  let migrations = [];
  let commits = [];
  if (vps.alcancavel && vps.commitNoAr && git.commitDoGithub && !regras.mesmoCommit(vps.commitNoAr, git.commitDoGithub)) {
    const faixa = `${vps.commitNoAr}..origin/main`;
    const diferenca = await rodar("git", ["diff", "--name-only", faixa, "--", "prisma/migrations"], { cwd: pasta });
    if (diferenca.codigo === 0) migrations = regras.migrationsNovas(diferenca.saida.split(/\r?\n/));
    const historico = await rodar("git", ["log", "--oneline", "--no-decorate", "-n", "40", faixa], { cwd: pasta });
    if (historico.codigo === 0) commits = historico.saida.split(/\r?\n/).filter(Boolean);
  }

  const operacao = await acompanharOperacao(pasta);
  const outraOperacao = outraOperacaoDe(operacao);
  return {
    git: git.git,
    commitDoGithub: git.commitDoGithub,
    vps,
    migrations,
    commits,
    operacao,
    deploy: regras.decidirDeploy({ ...git, vps, outraOperacao, migrations }),
    copia: regras.decidirCopia({ vps, outraOperacao }),
  };
}

// ---------------------------------------------------------------- atualizar a VPS (deploy)

/** Liga o deploy na VPS, em segundo plano. Quem decide se pode e quem chama (`decidirDeploy`). */
export async function iniciarDeploy(pasta) {
  const resultado = await naVps(regras.scriptDoDeploy(), { tempoMs: 40_000 });
  if (resultado.codigo !== 0) return { ok: false, erro: `Não consegui ligar o deploy na VPS: ${erroDoSsh(resultado)}` };
  if (/^erro=/m.test(resultado.saida)) return { ok: false, erro: "Já há um deploy rodando na VPS." };

  const log = /^log=(.+)$/m.exec(resultado.saida)?.[1]?.trim();
  if (!regras.caminhoDeLogValido(log)) return { ok: false, erro: "A VPS não devolveu o arquivo de log do deploy." };

  gravarEstado(pasta, {
    tipo: "deploy",
    fase: "rodando",
    inicio: new Date().toISOString(),
    log,
    passo: regras.PASSOS_DO_DEPLOY[0].rotulo,
  });
  return { ok: true };
}

/**
 * A ultima operacao, ja com o andamento do deploy lido do log na VPS (e gravado quando termina). A copia se atualiza
 * sozinha: o ajudante grava o estado a cada passo e a cada 10 s.
 */
export async function acompanharOperacao(pasta) {
  const estado = regras.estadoDaOperacao(lerEstado(pasta));
  if (!estado || estado.tipo !== "deploy" || estado.fase !== "rodando") return estado;
  if (!regras.caminhoDeLogValido(estado.log)) {
    const quebrado = { ...estado, fase: "erro", fim: new Date().toISOString(), mensagem: "O log do deploy é inválido." };
    gravarEstado(pasta, quebrado);
    return quebrado;
  }

  // O caminho foi conferido acima (so letras, numeros, "-" e "/"): pode ir entre aspas simples.
  const resultado = await naVps(`tail -c 40000 '${estado.log}'`, { tempoMs: 25_000 });
  if (resultado.codigo !== 0) {
    return { ...estado, aviso: `Não consegui ler o andamento agora (${erroDoSsh(resultado)}). Tento de novo.` };
  }

  const leitura = regras.lerSaidaDoDeploy(resultado.saida);
  const codigo = regras.codigoDeSaidaDoLog(resultado.saida);
  let novo = { ...estado, passo: leitura.passo, aviso: null };
  if (codigo !== null) {
    const ok = codigo === 0 && leitura.ok;
    novo = {
      ...novo,
      fase: ok ? "ok" : "erro",
      fim: new Date().toISOString(),
      versao: leitura.versao,
      commit: leitura.commit,
      externos: leitura.externos,
      voltar: leitura.voltar,
      mensagem: ok
        ? `Versão ${leitura.versao} no ar (commit ${leitura.commit}).`
        : leitura.parou
          ? `O deploy parou no passo: ${leitura.parou.passo}. O site continua com a versão de antes do passo que falhou.`
          : `O deploy terminou com erro (código ${codigo}).`,
      ultimas: ok ? [] : ultimasLinhas(resultado.saida),
    };
  }
  if (novo.passo !== estado.passo || novo.fase !== estado.fase) gravarEstado(pasta, novo);
  return novo;
}

// ---------------------------------------------------------------- atualizar o banco do PC (copia)

/**
 * Liga o ajudante `scripts/vps-copiar-banco.js`, DESTACADO: ele para o servidor do PC (este, que o ligou) no meio do
 * caminho, e tem que sobreviver a isso. Quem decide se pode e quem chama (`decidirCopia`).
 */
export function iniciarCopia(pasta) {
  const script = path.join(pasta, "scripts", "vps-copiar-banco.js");
  if (!existsSync(script)) return { ok: false, erro: "Não achei scripts/vps-copiar-banco.js nesta pasta." };

  const pastaLogs = path.join(pasta, "dados", "logs");
  mkdirSync(pastaLogs, { recursive: true });
  const saida = openSync(path.join(pastaLogs, LOG_DA_COPIA), "a");
  let filho;
  try {
    filho = spawn(process.execPath, [script], {
      cwd: pasta,
      detached: true,
      stdio: ["ignore", saida, saida],
      windowsHide: true,
      env: ambienteDoTerminal(process.env),
    });
  } finally {
    closeSync(saida);
  }
  filho.on("error", () => {});
  if (!filho.pid) return { ok: false, erro: "Não consegui ligar o ajudante da cópia." };
  filho.unref();

  const agora = new Date().toISOString();
  gravarEstado(pasta, { tipo: "copia", fase: "rodando", inicio: agora, batimento: agora, pid: filho.pid, passo: "Começando" });
  return { ok: true };
}

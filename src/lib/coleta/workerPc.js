/**
 * O worker do PC visto pelo Rise do PC: o "Varrer agora" da linha de uma fonte marcada "Varrer pelo PC" o liga, e a
 * tela le daqui se ele esta rodando e como terminou da ultima vez.
 *
 * Sem imports do projeto, so do Node: `scripts/worker-pc.js` importa este arquivo direto, sem o resolvedor de `@/`.
 *
 * O ESTADO mora num arquivo (`dados/worker-pc.estado.json`), e nao na memoria do servidor: o worker e destacado e
 * sobrevive a um reinicio do `next dev`, e a tela tem que continuar sabendo dele. Quem liga grava o comeco; o proprio
 * `worker-pc.js` grava o fim (codigo e motivo), porque so ele sabe como terminou.
 */

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const ARQUIVO_DO_ESTADO = "worker-pc.estado.json";
/// A saida do `worker-pc.js` ligado pelo botao (o tunel, o SSH). O worker em si escreve no log dele, `worker-pc-<dia>.log`.
export const LOG_DO_BOTAO = "worker-pc-botao.log";
/// Estado sem fim mais velho que isto e de um worker que morreu sem gravar o fim. O pid pode ter sido reaproveitado
/// por outro processo do Windows, e a idade desempata.
const ESTADO_ABANDONADO_MS = 24 * 60 * 60 * 1000;

/// O id de fonte vai para a linha de comando e para o ambiente do worker: so o formato de um cuid passa.
export const idDeFonteValido = (valor) => typeof valor === "string" && /^[a-z0-9]{8,40}$/i.test(valor);

const caminhoDoEstado = (pastaDados) => path.join(pastaDados, ARQUIVO_DO_ESTADO);

/** O estado gravado, ou null (nunca rodou, ou o arquivo nao abre). */
export function lerEstadoDoWorkerPc(pastaDados) {
  try {
    return JSON.parse(readFileSync(caminhoDoEstado(pastaDados), "utf8"));
  } catch {
    return null;
  }
}

/// Por arquivo temporario e rename: a tela nunca le um JSON pela metade.
export function gravarEstadoDoWorkerPc(pastaDados, estado) {
  mkdirSync(pastaDados, { recursive: true });
  const destino = caminhoDoEstado(pastaDados);
  const temporario = `${destino}.${process.pid}.tmp`;
  writeFileSync(temporario, JSON.stringify(estado, null, 2));
  renameSync(temporario, destino);
}

/// `kill(pid, 0)` so pergunta: nao envia sinal nenhum. EPERM = existe, mas e de outro usuario.
export function processoVivo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (erro) {
    return erro.code === "EPERM";
  }
}

/**
 * O que a tela mostra: `rodando` (e para qual fonte; `fonteId` nulo = todas as marcadas, o `npm run worker:pc` do
 * terminal) ou, parado, o resultado da ultima vez em `ultima`.
 */
export function situacaoDoWorkerPc(estado, { agora = Date.now(), vivo = processoVivo } = {}) {
  if (!estado || !estado.pid) return { rodando: false, ultima: null };

  const base = {
    fonteId: estado.fonteId ?? null,
    fonteNome: estado.fonteNome ?? null,
    inicioEm: estado.inicioEm ?? null,
  };
  if (!estado.fimEm) {
    const idade = agora - new Date(estado.inicioEm ?? 0).getTime();
    if (vivo(estado.pid) && idade < ESTADO_ABANDONADO_MS) return { rodando: true, ...base, ultima: null };
    return {
      rodando: false,
      ultima: {
        ...base,
        ok: false,
        fimEm: null,
        mensagem: "Interrompida antes do fim (o PC desligou ou o processo foi encerrado).",
      },
    };
  }

  const ok = estado.codigo === 0;
  return {
    rodando: false,
    ultima: {
      ...base,
      ok,
      fimEm: estado.fimEm,
      mensagem: ok ? "Concluída." : estado.motivo || `Falhou (código ${estado.codigo}).`,
    },
  };
}

/// O ambiente do servidor do Next, sem o que e do Next: o worker tem que rodar como se tivesse sido aberto no terminal.
/// Tambem usado pelo ajudante do cartao "Servidor VPS" (`src/lib/vps/executar.js`).
export function ambienteDoTerminal(ambiente) {
  const limpo = {};
  for (const [chave, valor] of Object.entries(ambiente)) {
    if (chave === "NODE_OPTIONS" || chave === "NODE_ENV" || chave.startsWith("__NEXT") || chave.startsWith("NEXT_")) {
      continue;
    }
    limpo[chave] = valor;
  }
  return limpo;
}

/**
 * Liga o `worker-pc.js` para UMA fonte, destacado do servidor: a varredura leva minutos ou horas, e um reinicio do
 * `next dev` nao pode derruba-la. Ele abre o tunel, varre, grava no banco da VPS e termina sozinho.
 *
 * @returns {{ok: true} | {ok: false, erro: string}}
 */
export function iniciarWorkerPc({ pastaProjeto, fonteId, fonteNome }) {
  if (!idDeFonteValido(fonteId)) return { ok: false, erro: "Fonte inválida." };

  const pastaDados = path.join(pastaProjeto, "dados");
  const atual = situacaoDoWorkerPc(lerEstadoDoWorkerPc(pastaDados));
  if (atual.rodando) {
    return {
      ok: false,
      erro: `Já há uma varredura pelo PC em andamento${atual.fonteNome ? ` (${atual.fonteNome})` : ""}.`,
    };
  }

  const script = path.join(pastaProjeto, "scripts", "worker-pc.js");
  if (!existsSync(script)) return { ok: false, erro: "Não achei scripts/worker-pc.js nesta pasta." };

  const pastaLogs = path.join(pastaDados, "logs");
  mkdirSync(pastaLogs, { recursive: true });
  const saida = openSync(path.join(pastaLogs, LOG_DO_BOTAO), "a");
  let filho;
  try {
    // `windowsHide`: sem ele, o Windows abre uma janela de console para o processo destacado.
    filho = spawn(process.execPath, [script, `--fonte=${fonteId}`], {
      cwd: pastaProjeto,
      detached: true,
      stdio: ["ignore", saida, saida],
      windowsHide: true,
      env: ambienteDoTerminal(process.env),
    });
  } finally {
    closeSync(saida);
  }
  // Falha de spawn chega como evento: sem ouvinte, ela derrubaria o servidor.
  filho.on("error", () => {});
  if (!filho.pid) return { ok: false, erro: "Não consegui ligar o worker do PC." };
  filho.unref();

  gravarEstadoDoWorkerPc(pastaDados, { pid: filho.pid, fonteId, fonteNome: fonteNome ?? null, inicioEm: new Date().toISOString() });
  return { ok: true };
}

/**
 * Supervisor do worker da coleta.
 *
 *   npm run worker
 *
 * Roda FORA do Next, em processo separado: uma varredura passa de horas e nao
 * caberia numa requisicao HTTP, e dentro do dev server morreria no primeiro hot
 * reload.
 *
 * Este arquivo nao varre nada. Ele sobe scripts/worker-processo.js e o RELIGA
 * quando cai, com espera crescente. Substitui o laco de shell
 * (`until npm run worker; do ...`) usado ate 16/09/2026, que dava errado de dois
 * jeitos: sobrevivia a sessao que o abriu (e religou um worker enquanto outro
 * rodava), e nao deixava registro nenhum do que aconteceu.
 *
 * O supervisor e pequeno de proposito: sem banco, sem rede, sem o codigo da
 * coleta — nada nele pode cair junto com a varredura.
 *
 * LOG EM ARQUIVO: tudo o que o worker escreve vai tambem para
 * dados/logs/worker-AAAA-MM-DD.log. Quando uma varredura "para", e la que se ve
 * por que.
 *
 * Ctrl+C, ou `npm run worker:parar` de outro terminal, encerra do jeito certo: o
 * worker devolve os jobs a fila, sem gastar tentativa, e grava o lote aberto antes
 * de sair. Matar o processo (taskkill /F) NAO: no Windows o worker morre junto, sem
 * aviso, e os jobs so voltam a fila quando o proximo worker sobe.
 */

import { fork } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const PROCESSO = path.join(aqui, "worker-processo.js");
const PASTA_LOGS = path.join(aqui, "..", "dados", "logs");

/// O worker saiu porque ja ha outro no ar: religar seria insistir no mesmo.
const SAIDA_OUTRO_WORKER = 3;
/// O worker encerrou a pedido (`npm run worker:parar`): o supervisor sai junto.
const SAIDA_PARADO = 4;
/// Configuracao invalida (modos que se contradizem, ou o worker do PC no banco errado): religar repetiria o erro.
const SAIDA_CONFIGURACAO = 5;
/// O worker do PC acabou o que era dele e saiu de proposito: o supervisor sai junto, com sucesso.
const SAIDA_CONCLUIDO = 6;
/// O worker do PC (COLETA_SO_PC=1) tem o proprio arquivo de log, para nunca se misturar ao do worker normal.
const PREFIXO_DO_LOG = process.env.COLETA_SO_PC === "1" ? "worker-pc" : "worker";
/// O worker do PC que termina sozinho (o padrao do `npm run worker:pc` e do "Varrer agora" do Rise do PC) desiste
/// depois de tantas quedas seguidas: quem pediu a varredura espera um fim, e o da VPS sem a coluna nova ou um tunel
/// que cai a toda hora religariam para sempre, com o tunel aberto.
const PC_TERMINA_SOZINHO = process.env.COLETA_SO_PC === "1" && process.env.COLETA_PC_SAIR === "1";
const QUEDAS_PARA_DESISTIR = 3;

/// Espera antes de religar: 5 s, 10 s, 20 s... ate 2 min.
const ESPERA_INICIAL_MS = 5 * 1000;
const ESPERA_MAXIMA_MS = 2 * 60 * 1000;
/// Worker que ficou no ar mais que isso caiu por acaso, nao em sequencia: a
/// espera volta ao inicio.
const NO_AR_ESTAVEL_MS = 10 * 60 * 1000;

/// Quanto se espera o worker encerrar sozinho antes de mata-lo.
const ENCERRAMENTO_MS = 2 * 60 * 1000;

mkdirSync(PASTA_LOGS, { recursive: true });

// Terminal fechado: escrever na tela da EPIPE, e o erro sem ouvinte derrubaria o
// supervisor — e com ele a varredura. O arquivo de log continua recebendo tudo.
process.stdout.on("error", () => {});
process.stderr.on("error", () => {});

let arquivoDoDia = null;
let streamDoDia = null;

function escreverNoLog(texto) {
  const dia = new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD, no fuso local
  if (dia !== arquivoDoDia) {
    streamDoDia?.end();
    arquivoDoDia = dia;
    streamDoDia = createWriteStream(path.join(PASTA_LOGS, `${PREFIXO_DO_LOG}-${dia}.log`), { flags: "a" });
  }
  streamDoDia.write(texto);
}

function registrar(texto, erro = false) {
  const linha = `[${new Date().toLocaleTimeString("pt-BR")}] [supervisor] ${texto}\n`;
  (erro ? process.stderr : process.stdout).write(linha);
  escreverNoLog(linha);
}

let filho = null;
let parando = false;
let tentativasSeguidas = 0;
let relogioDeReligar = null;

function subir() {
  const subiuEm = Date.now();
  filho = fork(PROCESSO, [], { stdio: ["ignore", "pipe", "pipe", "ipc"] });

  // Saida do worker: para a tela E para o arquivo.
  filho.stdout.on("data", (pedaco) => {
    process.stdout.write(pedaco);
    escreverNoLog(pedaco);
  });
  filho.stderr.on("data", (pedaco) => {
    process.stderr.write(pedaco);
    escreverNoLog(pedaco);
  });

  filho.on("exit", (codigo, sinal) => {
    filho = null;

    if (parando) {
      registrar("worker encerrado; supervisor saindo.");
      streamDoDia?.end();
      process.exit(0);
    }

    if (codigo === SAIDA_PARADO) {
      registrar("worker parado a pedido; supervisor saindo.");
      streamDoDia?.end();
      process.exit(0);
    }

    if (codigo === SAIDA_CONCLUIDO) {
      registrar("varredura do PC concluida; supervisor saindo.");
      streamDoDia?.end();
      process.exit(0);
    }

    if (codigo === SAIDA_CONFIGURACAO) {
      registrar("configuracao invalida do worker — este supervisor nao tenta de novo.", true);
      streamDoDia?.end();
      process.exit(SAIDA_CONFIGURACAO);
    }

    if (codigo === SAIDA_OUTRO_WORKER) {
      registrar("ja ha um worker no ar — este supervisor nao sobe outro.", true);
      streamDoDia?.end();
      process.exit(SAIDA_OUTRO_WORKER);
    }

    if (Date.now() - subiuEm > NO_AR_ESTAVEL_MS) tentativasSeguidas = 0;
    const espera = Math.min(ESPERA_INICIAL_MS * 2 ** tentativasSeguidas, ESPERA_MAXIMA_MS);
    tentativasSeguidas++;

    if (PC_TERMINA_SOZINHO && tentativasSeguidas >= QUEDAS_PARA_DESISTIR) {
      registrar(`o worker do PC caiu ${tentativasSeguidas} vezes seguidas — desistindo. Veja o log acima.`, true);
      streamDoDia?.end();
      process.exit(1);
    }

    registrar(
      `worker saiu (${sinal ? `sinal ${sinal}` : `codigo ${codigo}`}) — religando em ${espera / 1000}s`,
      codigo !== 0,
    );
    relogioDeReligar = setTimeout(subir, espera);
  });
}

function parar(motivo) {
  if (parando) {
    // Segundo Ctrl+C: sai ja.
    filho?.kill();
    process.exit(1);
  }
  parando = true;
  registrar(`encerrando (${motivo})... Ctrl+C de novo forca a saida.`);
  clearTimeout(relogioDeReligar);

  if (!filho) {
    streamDoDia?.end();
    process.exit(0);
  }

  // Por mensagem, e nao por sinal: no Windows um sinal entre processos mata sem
  // dar chance de devolver os jobs.
  try {
    filho.send({ tipo: "encerrar" });
  } catch {
    filho.kill();
  }
  setTimeout(() => {
    registrar("o worker nao encerrou a tempo — forcando.", true);
    filho?.kill();
    process.exit(1);
  }, ENCERRAMENTO_MS).unref();
}

for (const sinal of ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"]) {
  process.on(sinal, () => parar(`sinal ${sinal}`));
}

registrar(`supervisor no ar · pid ${process.pid} · log em ${PASTA_LOGS}`);
subir();

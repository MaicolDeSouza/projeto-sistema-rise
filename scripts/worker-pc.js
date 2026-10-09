import "dotenv/config";

/**
 * Worker do PC: varre as fontes marcadas "Varrer pelo PC" e grava o resultado no banco da VPS.
 *
 *   npm run worker:pc            varre as fontes marcadas e TERMINA quando acabar
 *   npm run worker:pc -- --ficar  fica no ar esperando mais trabalho
 *   node scripts/worker-pc.js --fonte=<id>   so aquela fonte (e o que o "Varrer agora" do Rise do PC roda)
 *
 * Ctrl+C encerra do jeito certo nos dois casos. Nao precisa clicar em nada na tela da VPS: rodar o comando e o pedido
 * de varredura (ele poe as fontes marcadas e ativas na fila sozinho).
 *
 * O comeco e o fim (codigo e motivo) vao para `dados/worker-pc.estado.json`, que a tela Fontes do Rise do PC le
 * (`src/lib/coleta/workerPc.js`). Ligado pelo botao, a saida deste script vai para `dados/logs/worker-pc-botao.log`.
 *
 * POR QUE EXISTE. Alguns sites bloqueiam o IP de datacenter da VPS, e outros virao. A fonte e marcada na tela de
 * Fontes; o worker da VPS passa a ignora-la, e este comando a varre daqui, com o IP de casa, no mesmo ritmo e com o
 * mesmo user-agent de sempre. Nada e copiado: o worker grava DIRETO no banco de verdade da VPS, entao os produtos
 * aparecem la na hora, sem merge.
 *
 * COMO. (1) le o DATABASE_URL da VPS por SSH, so em memoria; (2) abre um tunel SSH de uma porta local ate o banco da
 * VPS, que so aceita conexao de dentro dela; (3) sobe o supervisor do worker em modo COLETA_SO_PC, com esse
 * endereco SO no ambiente do processo filho. A senha do banco da VPS nunca vai para o `.env` nem para o disco do PC,
 * e nunca e impressa.
 *
 * O QUE ESTE COMANDO NUNCA FAZ: nao e o worker normal. Ele so atende fontes marcadas, usa outra trava do Postgres
 * (convive com o worker da VPS), e nao tira a foto mensal. Rodar o worker normal no PC continua proibido.
 *
 * A porta do tunel e outra que a do Postgres do PC (5432) de proposito: um engano de porta nao pode apontar o PC
 * para a VPS. E `npm run copia:atualizar` recusa qualquer banco que nao seja o Postgres do Windows (ver
 * `servidorEhWindows`), porque um tunel aparece como "localhost" e a copia o apagaria.
 *
 * Variaveis opcionais: VPS_SSH (usuario@host), VPS_SSH_CHAVE (arquivo da chave), WORKER_PC_PORTA (porta do tunel).
 */

import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gravarEstadoDoWorkerPc, idDeFonteValido, lerEstadoDoWorkerPc } from "../src/lib/coleta/workerPc.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const SUPERVISOR = path.join(aqui, "worker.js");
const PASTA_DADOS = path.join(aqui, "..", "dados");

const FICAR = process.argv.includes("--ficar");
/// `--fonte=<id>`: so aquela fonte. Sem ele, todas as marcadas e ativas.
const FONTE = process.argv.find((argumento) => argumento.startsWith("--fonte="))?.slice("--fonte=".length) ?? null;

const VPS = process.env.VPS_SSH || "rise@179.199.150.221";
const CHAVE = process.env.VPS_SSH_CHAVE || path.join(os.homedir(), ".ssh", "rise_vps");
const PASTA_DA_VPS = "/srv/rise/app";
const PORTA_LOCAL = Number.parseInt(process.env.WORKER_PC_PORTA ?? "", 10) || 55432;

const hora = () => new Date().toLocaleTimeString("pt-BR");
const dizer = (texto) => console.log(`[${hora()}] [worker-pc] ${texto}`);

/// Este processo ja gravou o comeco no arquivo de estado, ou foi o botao que o gravou com o pid dele. So entao o fim e
/// gravado: um segundo worker-pc recusado pela porta nao pode apagar o estado do que esta rodando.
let estadoEMeu = false;
const estadoAindaEMeu = () => estadoEMeu || lerEstadoDoWorkerPc(PASTA_DADOS)?.pid === process.pid;

function gravarComeco() {
  const antes = lerEstadoDoWorkerPc(PASTA_DADOS);
  const doBotao = antes?.pid === process.pid;
  try {
    gravarEstadoDoWorkerPc(PASTA_DADOS, {
      pid: process.pid,
      fonteId: FONTE,
      fonteNome: doBotao ? (antes.fonteNome ?? null) : null,
      inicioEm: doBotao && antes.inicioEm ? antes.inicioEm : new Date().toISOString(),
    });
    estadoEMeu = true;
  } catch {
    // Sem o arquivo, so a tela do PC deixa de saber; a varredura segue.
  }
}

/// `naTela`: o motivo que a tela do PC mostra (com acento, para quem le).
function gravarFim(codigo, naTela) {
  if (!estadoAindaEMeu()) return;
  try {
    gravarEstadoDoWorkerPc(PASTA_DADOS, {
      ...(lerEstadoDoWorkerPc(PASTA_DADOS) ?? { pid: process.pid, fonteId: FONTE }),
      fimEm: new Date().toISOString(),
      codigo,
      motivo: naTela ?? null,
    });
  } catch {
    // Idem.
  }
}

function sair(codigo, motivo, naTela = null) {
  if (motivo) console.error(`[${hora()}] [worker-pc] ${motivo}`);
  gravarFim(codigo, naTela ?? motivo ?? null);
  process.exit(codigo);
}

/// `StrictHostKeyChecking=yes`: uma chave de servidor trocada e recusada, e uma VPS ainda desconhecida pede um
/// `ssh` manual antes (o `BatchMode` nao pergunta nada).
const opcoesDoSsh = [
  "-i",
  CHAVE,
  "-o",
  "BatchMode=yes",
  "-o",
  "StrictHostKeyChecking=yes",
  "-o",
  "ConnectTimeout=15",
];

/// Le a linha DATABASE_URL do `.env` da VPS e troca o endereco pelo do tunel. A senha fica so na variavel devolvida.
function urlDoBancoPeloTunel() {
  const resposta = spawnSync("ssh", [...opcoesDoSsh, VPS, `grep -m1 '^DATABASE_URL=' ${PASTA_DA_VPS}/.env`], {
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  const semSsh = "Não consegui falar com a VPS por SSH (internet, ou a chave ~/.ssh/rise_vps). Veja dados/logs/worker-pc-botao.log.";
  if (resposta.error) sair(1, `nao consegui rodar o ssh: ${resposta.error.message}`, semSsh);
  if (resposta.status !== 0) {
    sair(
      1,
      `nao consegui ler o endereco do banco na VPS (ssh saiu com ${resposta.status}): ${String(resposta.stderr).trim().slice(0, 300)}`,
      semSsh,
    );
  }
  const linha = String(resposta.stdout).trim();
  if (!linha.startsWith("DATABASE_URL=")) sair(1, "a VPS nao devolveu um DATABASE_URL.");

  let url;
  try {
    url = new URL(linha.slice("DATABASE_URL=".length).replace(/^["']|["']$/g, ""));
  } catch {
    return sair(1, "o DATABASE_URL da VPS nao e um endereco valido.");
  }
  url.hostname = "127.0.0.1";
  url.port = String(PORTA_LOCAL);
  if (url.hostname !== "127.0.0.1" || url.port !== String(PORTA_LOCAL)) sair(1, "nao consegui trocar o endereco do banco pelo do tunel.");
  return url.toString();
}

function portaAceita(porta) {
  return new Promise((resolver) => {
    const soquete = net.connect({ host: "127.0.0.1", port: porta });
    soquete.setTimeout(1000);
    soquete.on("connect", () => {
      soquete.destroy();
      resolver(true);
    });
    soquete.on("timeout", () => {
      soquete.destroy();
      resolver(false);
    });
    soquete.on("error", () => resolver(false));
  });
}

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

async function abrirTunel() {
  if (await portaAceita(PORTA_LOCAL)) {
    sair(1, `a porta ${PORTA_LOCAL} deste PC ja esta em uso (outro tunel aberto?). Feche-o ou use WORKER_PC_PORTA.`);
  }

  // `detached`: o Ctrl+C do terminal vai para todo o grupo de processos, e o tunel nao pode cair antes do worker
  // terminar de devolver as varreduras ao banco. Quem fecha o tunel e este script, depois do supervisor sair.
  const tunel = spawn(
    "ssh",
    [
      "-N",
      "-L",
      `127.0.0.1:${PORTA_LOCAL}:127.0.0.1:5432`,
      "-o",
      "ExitOnForwardFailure=yes",
      "-o",
      "ServerAliveInterval=30",
      "-o",
      "ServerAliveCountMax=3",
      ...opcoesDoSsh,
      VPS,
    ],
    { stdio: ["ignore", "ignore", "pipe"], detached: true, windowsHide: true },
  );
  let erroDoTunel = "";
  tunel.stderr.on("data", (pedaco) => {
    erroDoTunel += pedaco;
  });
  let saiu = false;
  tunel.on("exit", () => {
    saiu = true;
  });

  const semTunel = "O túnel SSH até o banco da VPS não abriu. Veja dados/logs/worker-pc-botao.log.";
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    if (saiu) sair(1, `o tunel SSH fechou sozinho: ${erroDoTunel.trim().slice(0, 300) || "sem mensagem"}`, semTunel);
    if (await portaAceita(PORTA_LOCAL)) return tunel;
    await dormir(500);
  }
  tunel.kill();
  return sair(1, `o tunel SSH nao abriu em 20 s: ${erroDoTunel.trim().slice(0, 300) || "sem mensagem"}`, semTunel);
}

if (FONTE !== null && !idDeFonteValido(FONTE)) sair(1, `--fonte invalida: ${FONTE.slice(0, 60)}`, "Fonte inválida.");

// A porta ANTES de tudo: ocupada, ha outro worker do PC (ou outro tunel) no ar, e este sai sem tocar no estado dele.
if (await portaAceita(PORTA_LOCAL)) {
  sair(1, `a porta ${PORTA_LOCAL} deste PC ja esta em uso (outro worker do PC ou outro tunel aberto?). Feche-o ou use WORKER_PC_PORTA.`,
    `A porta ${PORTA_LOCAL} do PC já está em uso: há outro worker do PC (ou outro túnel) aberto.`);
}
gravarComeco();

dizer(`lendo o endereco do banco da VPS (${VPS})...`);
const urlDoBanco = urlDoBancoPeloTunel();

dizer(`abrindo o tunel SSH na porta ${PORTA_LOCAL} deste PC...`);
const tunel = await abrirTunel();
dizer(
  "tunel aberto. Subindo o worker, " +
    (FONTE ? `so da fonte ${FONTE}` : "so das fontes marcadas para varrer pelo PC") +
    (FICAR ? " (fica no ar)" : " (termina quando acabar)") +
    ". Ctrl+C encerra.",
);

// O Ctrl+C chega ao supervisor pelo mesmo terminal e ele encerra do jeito certo. Este script espera, para fechar o
// tunel por ultimo; se saisse junto, o worker nao teria por onde devolver as varreduras ao banco.
process.on("SIGINT", () => {});

// `windowsHide`: ligado pelo botao, este processo nao tem console, e o Windows abriria uma janela para o supervisor.
const supervisor = spawn(process.execPath, [SUPERVISOR], {
  stdio: "inherit",
  windowsHide: true,
  env: {
    ...process.env,
    DATABASE_URL: urlDoBanco,
    COLETA_SO_PC: "1",
    COLETA_PC_SAIR: FICAR ? "0" : "1",
    ...(FONTE ? { COLETA_PC_FONTE: FONTE } : {}),
  },
});

let tunelCaiu = false;
tunel.on("exit", () => {
  if (supervisor.exitCode === null) {
    tunelCaiu = true;
    console.error(`[${hora()}] [worker-pc] o tunel SSH caiu: encerrando o worker. As varreduras em andamento voltam a fila em 2 minutos.`);
    supervisor.kill();
  }
});

/// O que a tela do PC diz de cada fim (os codigos sao os do supervisor, `scripts/worker.js`).
function motivoNaTela(codigo) {
  if (tunelCaiu) return "O túnel SSH caiu no meio da varredura. O que estava em andamento volta à fila; clique de novo.";
  if (codigo === 0) return null;
  if (codigo === 3) return "Já havia um worker do PC no ar.";
  if (codigo === 5) {
    return "A VPS recusou: a fonte não está marcada \"Varrer pelo PC\" lá, está pausada ou não existe. Confira na tela Fontes da VPS e atualize a cópia do PC.";
  }
  return "O worker do PC falhou. Veja dados/logs/worker-pc-<dia>.log.";
}

supervisor.on("exit", (codigo) => {
  tunel.removeAllListeners("exit");
  tunel.kill();
  dizer("worker encerrado; tunel fechado.");
  const final = tunelCaiu ? 1 : (codigo ?? 1);
  gravarFim(final, motivoNaTela(final));
  process.exit(final);
});

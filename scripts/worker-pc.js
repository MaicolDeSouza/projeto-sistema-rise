import "dotenv/config";

/**
 * Worker do PC: varre as fontes marcadas "Varrer pelo PC" e grava o resultado no banco da VPS.
 *
 *   npm run worker:pc            varre as fontes marcadas e TERMINA quando acabar
 *   npm run worker:pc -- --ficar  fica no ar esperando mais trabalho
 *
 * Ctrl+C encerra do jeito certo nos dois casos. Nao precisa clicar em nada na tela da VPS: rodar o comando e o pedido
 * de varredura (ele poe as fontes marcadas e ativas na fila sozinho).
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

const aqui = path.dirname(fileURLToPath(import.meta.url));
const SUPERVISOR = path.join(aqui, "worker.js");

const VPS = process.env.VPS_SSH || "rise@179.199.150.221";
const CHAVE = process.env.VPS_SSH_CHAVE || path.join(os.homedir(), ".ssh", "rise_vps");
const PASTA_DA_VPS = "/srv/rise/app";
const PORTA_LOCAL = Number.parseInt(process.env.WORKER_PC_PORTA ?? "", 10) || 55432;

const hora = () => new Date().toLocaleTimeString("pt-BR");
const dizer = (texto) => console.log(`[${hora()}] [worker-pc] ${texto}`);

function sair(codigo, motivo) {
  if (motivo) console.error(`[${hora()}] [worker-pc] ${motivo}`);
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
  });
  if (resposta.error) sair(1, `nao consegui rodar o ssh: ${resposta.error.message}`);
  if (resposta.status !== 0) {
    sair(1, `nao consegui ler o endereco do banco na VPS (ssh saiu com ${resposta.status}): ${String(resposta.stderr).trim().slice(0, 300)}`);
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

  for (let tentativa = 0; tentativa < 40; tentativa++) {
    if (saiu) sair(1, `o tunel SSH fechou sozinho: ${erroDoTunel.trim().slice(0, 300) || "sem mensagem"}`);
    if (await portaAceita(PORTA_LOCAL)) return tunel;
    await dormir(500);
  }
  tunel.kill();
  return sair(1, `o tunel SSH nao abriu em 20 s: ${erroDoTunel.trim().slice(0, 300) || "sem mensagem"}`);
}

dizer(`lendo o endereco do banco da VPS (${VPS})...`);
const urlDoBanco = urlDoBancoPeloTunel();

dizer(`abrindo o tunel SSH na porta ${PORTA_LOCAL} deste PC...`);
const tunel = await abrirTunel();
dizer(
  "tunel aberto. Subindo o worker, so das fontes marcadas para varrer pelo PC" +
    (process.argv.includes("--ficar") ? " (fica no ar)" : " (termina quando acabar)") +
    ". Ctrl+C encerra.",
);

// O Ctrl+C chega ao supervisor pelo mesmo terminal e ele encerra do jeito certo. Este script espera, para fechar o
// tunel por ultimo; se saisse junto, o worker nao teria por onde devolver as varreduras ao banco.
process.on("SIGINT", () => {});

const supervisor = spawn(process.execPath, [SUPERVISOR], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: urlDoBanco,
    COLETA_SO_PC: "1",
    COLETA_PC_SAIR: process.argv.includes("--ficar") ? "0" : "1",
  },
});

tunel.on("exit", () => {
  if (supervisor.exitCode === null) {
    console.error(`[${hora()}] [worker-pc] o tunel SSH caiu: encerrando o worker. As varreduras em andamento voltam a fila em 2 minutos.`);
    supervisor.kill();
  }
});

supervisor.on("exit", (codigo) => {
  tunel.removeAllListeners("exit");
  tunel.kill();
  dizer("worker encerrado; tunel fechado.");
  process.exit(codigo ?? 1);
});

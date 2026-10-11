import "dotenv/config";

/**
 * O túnel do Rise AI: leva o LM Studio deste PC até o Rise que roda na VPS.
 *
 *   npm run ia:pc        deixe aberto enquanto quiser que o Rise da VPS use o modelo do seu PC
 *
 * Abre um SSH REVERSO (`ssh -N -R 172.17.0.1:1234:127.0.0.1:1234 rise@vps`): a VPS passa a escutar a porta do LM Studio
 * do lado de DENTRO dela, e o contêiner do Rise a alcança por `host.docker.internal`. Quem conecta é este PC (nada abre no
 * roteador de casa) e nenhuma porta do PC fica exposta à internet.
 *
 * SE O TÚNEL CAIR, ELE VOLTA SOZINHO: o `ssh` é religado com espera crescente (5 s, 10 s, 20 s... até 2 min), como o
 * supervisor do worker. Enquanto ele não está no ar, o Rise da VPS usa o modelo de RESERVA (a API), e a resposta diz
 * qual modelo respondeu.
 *
 * O estado (no ar desde quando, ou "caiu às 14:40, religando") vai para `dados/ia-pc.estado.json`, que o cartão "Servidor
 * VPS" de Integrações lê. A saída vai também para `dados/logs/ia-pc-AAAA-MM-DD.log`. Ctrl+C encerra do jeito certo.
 *
 * O QUE ESTE COMANDO NUNCA FAZ: não escreve nada na VPS (só abre a conexão) e não aceita publicar a porta fora da ponte do
 * Docker (`0.0.0.0` é recusado). Para o túnel funcionar, o servidor SSH da VPS precisa de `GatewayPorts clientspecified`
 * e o firewall deve barrar a porta fora da ponte — mudanças que o dono autoriza (ver o roteiro de implantação). Sem elas, o
 * `ssh` sai com "remote port forwarding failed", o script registra a queda e tenta de novo.
 *
 * Variáveis opcionais: VPS_SSH (usuario@host), VPS_SSH_CHAVE (arquivo da chave), IA_PC_BIND (IP da ponte do Docker na VPS,
 * padrão 172.17.0.1), IA_PC_PORTA (a porta do LM Studio, padrão 1234).
 */

import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { processoVivo } from "../src/lib/coleta/workerPc.js";
import { BIND_PADRAO, PORTA_PADRAO, argumentosDeConferencia, argumentosDoTunel, gravarEstadoDoTunel, lerEstadoDoTunel, portaNaPonte, proximaEspera } from "../src/lib/riseAi/tunelPc.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const PASTA_DADOS = path.join(aqui, "..", "dados");
const PASTA_LOGS = path.join(PASTA_DADOS, "logs");

const VPS = process.env.VPS_SSH || "rise@179.199.150.221";
const CHAVE = process.env.VPS_SSH_CHAVE || path.join(os.homedir(), ".ssh", "rise_vps");
const BIND = process.env.IA_PC_BIND || BIND_PADRAO;
const PORTA = Number.parseInt(process.env.IA_PC_PORTA ?? "", 10) || PORTA_PADRAO;

/// O `ssh` que ficou de pé por tanto tempo conectou de verdade (com `ExitOnForwardFailure`, falha de redirecionamento ou de
/// autenticação sai em segundos).
const CONECTOU_APOS_MS = 6 * 1000;
/// Conexão que durou isto caiu "por acaso", não em sequência: a espera volta ao início.
const ESTAVEL_APOS_MS = 60 * 1000;

mkdirSync(PASTA_LOGS, { recursive: true });
process.stdout.on("error", () => {});
process.stderr.on("error", () => {});

let streamDoDia = null;
let arquivoDoDia = null;
function dizer(texto, erro = false) {
  const linha = `[${new Date().toLocaleTimeString("pt-BR")}] [ia-pc] ${texto}\n`;
  (erro ? process.stderr : process.stdout).write(linha);
  const dia = new Date().toLocaleDateString("sv-SE");
  if (dia !== arquivoDoDia) {
    streamDoDia?.end();
    arquivoDoDia = dia;
    streamDoDia = createWriteStream(path.join(PASTA_LOGS, `ia-pc-${dia}.log`), { flags: "a" });
  }
  streamDoDia.write(linha);
}

// Antes de qualquer coisa: dois túneis para a mesma porta se atrapalhariam (o segundo pediria uma porta que o primeiro já tem).
const anterior = lerEstadoDoTunel(PASTA_DADOS);
if (anterior?.pid && anterior.pid !== process.pid && !anterior.fimEm && processoVivo(anterior.pid)) {
  dizer(`já há um túnel do Rise AI no ar neste PC (processo ${anterior.pid}). Feche aquele antes de abrir outro.`, true);
  process.exit(1);
}

let argumentos;
try {
  argumentos = argumentosDoTunel({ bind: BIND, porta: PORTA, chave: CHAVE, vps: VPS });
} catch (erro) {
  dizer(erro.message, true);
  process.exit(1);
}

const estado = { pid: process.pid, inicioEm: new Date().toISOString(), conectadoEm: null, quedas: 0, fimEm: null, motivo: null, alcance: null };
function gravar() {
  try {
    gravarEstadoDoTunel(PASTA_DADOS, estado);
  } catch {
    // Sem o arquivo só o cartão deixa de saber; o túnel segue.
  }
}

/** Avisa se o LM Studio não está respondendo aqui: o túnel sobe do mesmo jeito (o modelo pode ser ligado depois). */
async function conferirLmStudio() {
  try {
    const resposta = await fetch(`http://127.0.0.1:${PORTA}/v1/models`, { signal: AbortSignal.timeout(3000) });
    dizer(resposta.ok ? `LM Studio respondendo em 127.0.0.1:${PORTA}.` : `LM Studio respondeu HTTP ${resposta.status} em 127.0.0.1:${PORTA}. Confira se o servidor local dele está ligado.`);
  } catch {
    dizer(`AVISO: o LM Studio não respondeu em 127.0.0.1:${PORTA}. Abra o LM Studio e ligue o servidor local (aba "Developer"); o túnel sobe mesmo assim.`);
  }
}

/**
 * Pergunta à VPS (só leitura, `ss -ltn`) onde a porta do túnel abriu. O `sshd` com `GatewayPorts no` aceita o pedido e abre
 * a porta só no loopback: o túnel "conecta" e não serve. Devolve "ok", "so_loopback", "ausente" ou null (não deu para ver).
 */
function conferirAlcance() {
  return new Promise((resolver) => {
    let saida = "";
    let filhoDaConferencia;
    try {
      filhoDaConferencia = spawn("ssh", argumentosDeConferencia({ chave: CHAVE, vps: VPS }), { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    } catch {
      return resolver(null);
    }
    const desistir = setTimeout(() => {
      filhoDaConferencia.kill();
      resolver(null);
    }, 30 * 1000);
    filhoDaConferencia.stdout.on("data", (pedaco) => (saida += pedaco));
    filhoDaConferencia.on("error", () => {
      clearTimeout(desistir);
      resolver(null);
    });
    filhoDaConferencia.on("exit", (codigo) => {
      clearTimeout(desistir);
      if (codigo !== 0) return resolver(null);
      const alcance = portaNaPonte(saida, BIND, PORTA);
      if (alcance === "ok") dizer(`túnel no ar: a VPS escuta ${BIND}:${PORTA}.`);
      else if (alcance === "so_loopback") {
        dizer(
          `AVISO: a VPS abriu a porta ${PORTA} SÓ em 127.0.0.1, e o contêiner do Rise não a alcança. O sshd dela precisa de "GatewayPorts clientspecified" (e o firewall, de uma regra para a ponte do Docker). Sem isso o Rise usa o modelo de reserva.`,
          true,
        );
      } else dizer("AVISO: não achei a porta do túnel entre as que a VPS escuta.", true);
      resolver(alcance);
    });
  });
}

let filho = null;
let encerrando = false;
let quedasSeguidas = 0;
let relogioDeReligar = null;

function subir() {
  const subiuEm = Date.now();
  estado.conectadoEm = null;
  estado.alcance = null;
  gravar();
  dizer(`abrindo o túnel: ${BIND}:${PORTA} na VPS -> 127.0.0.1:${PORTA} aqui (${VPS})`);
  // `windowsHide`: sem ele o Windows abre uma janela de console para o ssh. A saída de erro do ssh é o que explica a queda.
  filho = spawn("ssh", argumentos, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });

  let ultimaMensagem = "";
  filho.stderr.on("data", (pedaco) => {
    const texto = String(pedaco).trim();
    if (!texto) return;
    ultimaMensagem = texto.split(/\r?\n/).pop().slice(0, 300);
    dizer(`ssh: ${texto.replace(/\s+/g, " ").slice(0, 400)}`, true);
  });

  const marcaConexao = setTimeout(async () => {
    estado.conectadoEm = new Date().toISOString();
    gravar();
    dizer("túnel conectado; conferindo se a VPS abriu a porta onde o Rise a alcança...");
    estado.alcance = await conferirAlcance();
    gravar();
  }, CONECTOU_APOS_MS);

  // `exit` e `error` podem vir os dois para o mesmo ssh: so o primeiro conta.
  let tratado = false;
  const aoSair = (codigo, sinal, falhaAoSubir) => {
    if (tratado) return;
    tratado = true;
    clearTimeout(marcaConexao);
    filho = null;
    if (encerrando) return;
    const durou = Date.now() - subiuEm;
    quedasSeguidas = durou >= ESTAVEL_APOS_MS ? 1 : quedasSeguidas + 1;
    estado.quedas += 1;
    estado.fimEm = new Date().toISOString();
    estado.motivo = falhaAoSubir ?? `ssh saiu com ${codigo ?? sinal}${ultimaMensagem ? `: ${ultimaMensagem}` : ""}`;
    gravar();
    const espera = proximaEspera(quedasSeguidas - 1);
    dizer(`túnel caiu (${estado.motivo}). Religando em ${Math.round(espera / 1000)} s.`, true);
    relogioDeReligar = setTimeout(subir, espera);
  };
  filho.on("exit", (codigo, sinal) => aoSair(codigo, sinal, null));
  // O Windows sem o cliente OpenSSH instalado: o `spawn` falha antes de existir processo.
  filho.on("error", (erro) => aoSair(null, null, `não consegui rodar o ssh (${erro.code ?? erro.message}). Instale o cliente OpenSSH do Windows.`));
}

function encerrar() {
  if (encerrando) return;
  encerrando = true;
  clearTimeout(relogioDeReligar);
  estado.fimEm = new Date().toISOString();
  estado.motivo = "encerrado";
  gravar();
  dizer("encerrando o túnel.");
  if (filho) filho.kill();
  streamDoDia?.end(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);

await conferirLmStudio();
subir();

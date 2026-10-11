import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * O túnel SSH REVERSO que leva o LM Studio do PC do dono até o Rise na VPS (spec §5.6, decisão do dono em 11/10/2026:
 * "ligação direta que se reconecta sozinha"). Com o Rise rodando na VPS, o modelo local mora no PC: o PC abre uma conexão
 * SSH PARA a VPS e pede que a porta do LM Studio apareça lá, do lado de dentro; o contêiner do Rise a alcança por
 * `host.docker.internal`. Nenhuma porta do PC abre para a internet, e quem inicia a conexão é o PC (sem redirecionar nada
 * no roteador de casa).
 *
 * Este arquivo só tem o que não depende de rede nem de processo: os argumentos do `ssh`, a espera entre tentativas, o
 * arquivo de estado que o cartão "Servidor VPS" lê e o texto desse estado. Quem sobe o `ssh` e o religa é
 * `scripts/ia-pc.js` (`npm run ia:pc`).
 */

/** A ponte do Docker na VPS (`docker0`): é por ela que o contêiner chega ao `host.docker.internal` (extra_hosts do compose). */
export const BIND_PADRAO = "172.17.0.1";
/** A porta do LM Studio (e a que aparece na VPS). */
export const PORTA_PADRAO = 1234;

const ESPERA_INICIAL_MS = 5 * 1000;
const ESPERA_MAXIMA_MS = 2 * 60 * 1000;
const FUSO = "America/Sao_Paulo";
const ARQUIVO_DO_ESTADO = "ia-pc.estado.json";

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/**
 * Os argumentos do `ssh` do túnel. `-R <bind>:<porta>:127.0.0.1:<porta>` pede à VPS que escute `bind:porta` e entregue o
 * que chegar ao `127.0.0.1:<porta>` do PC.
 *
 * O `bind` é SEMPRE um IP fechado (o da ponte do Docker): `0.0.0.0` publicaria o LM Studio do dono para a internet inteira,
 * então é recusado aqui, antes de qualquer conexão. Na VPS, o servidor SSH só aceita esse `bind` com
 * `GatewayPorts clientspecified` (e o firewall deve barrar a porta fora da ponte); sem isso o `ssh` sai com "remote port
 * forwarding failed" e o script espera para tentar de novo.
 *
 * `ExitOnForwardFailure`: sem o redirecionamento o túnel não serve, então o `ssh` morre em vez de ficar conectado e inútil.
 * `ServerAlive*`: uma conexão que parou de responder cai em ~90 s e é refeita. `BatchMode`: nunca pede senha. `StrictHostKeyChecking=yes`: uma
 * chave de servidor trocada é recusada (o mesmo cuidado do `worker-pc.js`).
 *
 * @param {{ bind?: string, porta?: number | string, chave: string, vps: string }} opcoes
 * @returns {string[]}
 */
export function argumentosDoTunel({ bind = BIND_PADRAO, porta = PORTA_PADRAO, chave, vps }) {
  const endereco = String(bind ?? "").trim();
  if (!IPV4.test(endereco) || endereco.split(".").some((parte) => Number(parte) > 255) || endereco === "0.0.0.0") {
    throw new Error("O endereço do túnel na VPS tem que ser um IP fechado (como 172.17.0.1), nunca 0.0.0.0.");
  }
  const numero = Number(porta);
  if (!Number.isInteger(numero) || numero < 1 || numero > 65535) throw new Error("A porta do túnel tem que ser um número de 1 a 65535.");
  if (!String(chave ?? "").trim() || !String(vps ?? "").trim()) throw new Error("Informe a chave SSH e o destino (usuario@host).");

  return [
    "-N",
    "-R",
    `${endereco}:${numero}:127.0.0.1:${numero}`,
    "-o",
    "ExitOnForwardFailure=yes",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
    "-i",
    chave,
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    "ConnectTimeout=15",
    vps,
  ];
}

/**
 * O `ssh` de LEITURA que confere, na VPS, onde a porta do túnel abriu: `ss -ltn` lista as portas em escuta. Só lê.
 *
 * Existe porque o `sshd` da VPS (medido em 11/10/2026: `GatewayPorts no`) ACEITA o pedido `-R 172.17.0.1:...` e abre a porta
 * só em 127.0.0.1: o `ssh` fica conectado e o `ExitOnForwardFailure` não dispara, mas o contêiner do Rise (que chega por
 * `host.docker.internal`) não alcança nada. Sem esta conferência o túnel pareceria "no ar" sem servir.
 */
export function argumentosDeConferencia({ chave, vps }) {
  if (!String(chave ?? "").trim() || !String(vps ?? "").trim()) throw new Error("Informe a chave SSH e o destino (usuario@host).");
  return ["-i", chave, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15", vps, "ss -ltn"];
}

/**
 * Onde a porta abriu, lendo a saída de `ss -ltn` da VPS: `"ok"` (no IP da ponte do Docker, ou em todos os endereços),
 * `"so_loopback"` (só em 127.0.0.1 ou ::1: o contêiner não alcança) ou `"ausente"` (nenhuma escuta nessa porta).
 */
export function portaNaPonte(saidaDoSs, bind, porta) {
  const escutas = String(saidaDoSs ?? "")
    .split(/\r?\n/)
    .map((linha) => linha.trim().split(/\s+/)[3])
    .filter(Boolean);
  // A porta e o fim do endereco local ("172.17.0.1:1234", "[::1]:1234", "*:1234"): 11234 nao e 1234.
  const daPorta = escutas.filter((local) => local.endsWith(`:${porta}`)).map((local) => local.slice(0, -String(porta).length - 1));
  if (daPorta.some((endereco) => endereco === bind || endereco === "0.0.0.0" || endereco === "*" || endereco === "[::]")) return "ok";
  if (daPorta.length > 0) return "so_loopback";
  return "ausente";
}

/** Quanto esperar antes de religar depois de `quedasSeguidas` quedas: 5 s, 10 s, 20 s... até 2 min (como o supervisor do worker). */
export function proximaEspera(quedasSeguidas) {
  const quedas = Number(quedasSeguidas);
  if (!Number.isFinite(quedas) || quedas < 0) return ESPERA_INICIAL_MS;
  return Math.min(ESPERA_INICIAL_MS * 2 ** Math.floor(quedas), ESPERA_MAXIMA_MS);
}

const caminhoDoEstado = (pastaDados) => path.join(pastaDados, ARQUIVO_DO_ESTADO);

/** O estado gravado (`{ pid, inicioEm, conectadoEm, quedas, fimEm, motivo }`), ou `null` (nunca rodou, ou o arquivo não abre). */
export function lerEstadoDoTunel(pastaDados) {
  try {
    return JSON.parse(readFileSync(caminhoDoEstado(pastaDados), "utf8"));
  } catch {
    return null;
  }
}

/** Por arquivo temporário e `rename`: quem lê (o cartão) nunca vê um JSON pela metade. */
export function gravarEstadoDoTunel(pastaDados, estado) {
  mkdirSync(pastaDados, { recursive: true });
  const destino = caminhoDoEstado(pastaDados);
  const temporario = `${destino}.${process.pid}.tmp`;
  writeFileSync(temporario, JSON.stringify(estado, null, 2));
  renameSync(temporario, destino);
}

const hora = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: FUSO });
const dia = (data) => new Date(data).toLocaleDateString("sv-SE", { timeZone: FUSO });

/** "14:02", ou "09/10 14:02" quando foi em outro dia (um túnel no ar há dias não pode parecer de hoje). */
function quando(iso, agora) {
  if (dia(iso) === dia(agora)) return hora(iso);
  const [, mes, diaDoMes] = dia(iso).split("-");
  return `${diaDoMes}/${mes} ${hora(iso)}`;
}

/**
 * Como está o túnel, em poucas palavras ("no ar desde 14:02", "caiu às 14:40 (religando)", "parado", "conectando…"): o que o
 * cartão "Servidor VPS" mostra ao lado do rótulo "Túnel do Rise AI". `vivo: false` (o processo que gravou o estado não existe mais:
 * o PC desligou ou o terminal foi morto à força) vale como parado, porque o estado gravado ficou velho.
 *
 * @param {{ inicioEm?: string, conectadoEm?: string | null, fimEm?: string | null, motivo?: string | null, quedas?: number, alcance?: "ok" | "so_loopback" | "ausente" | null } | null} estado
 * @param {Date} [agora]
 * @param {{ vivo?: boolean }} [opcoes]
 */
export function situacaoDoTunel(estado, agora = new Date(), { vivo = true } = {}) {
  if (!estado || !vivo) return "parado";
  const conectado = estado.conectadoEm && (!estado.fimEm || new Date(estado.conectadoEm) > new Date(estado.fimEm));
  if (conectado && estado.alcance === "so_loopback") {
    return "conectado, mas a VPS abriu a porta só em 127.0.0.1 e o Rise não a alcança (falta GatewayPorts clientspecified)";
  }
  if (conectado) return `no ar desde ${quando(estado.conectadoEm, agora)}`;
  if (estado.fimEm) return estado.motivo === "encerrado" ? "parado" : `caiu às ${hora(estado.fimEm)} (religando)`;
  return "conectando…";
}

/** A frase inteira ("Túnel do Rise AI: no ar desde 14:02"). */
export const textoDoEstadoDoTunel = (estado, agora, opcoes) => `Túnel do Rise AI: ${situacaoDoTunel(estado, agora, opcoes)}`;

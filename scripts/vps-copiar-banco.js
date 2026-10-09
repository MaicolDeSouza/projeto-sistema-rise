/**
 * Ajudante do botao "Atualizar banco do PC" (cartao "Servidor VPS", em Integracoes, so no Rise do PC).
 *
 * Ligado DESTACADO pelo servidor do PC (`iniciarCopia` em src/lib/vps/executar.js), porque o para no meio do caminho:
 *   1. tira um dump de AGORA do banco da VPS, pela saida do ssh (nada fica gravado la);
 *   2. para os servidores de desenvolvimento das portas 3000/3001/3002 (o `copia:atualizar` recusa com eles no ar):
 *      a cadeia inteira do `npm run dev`, nunca o Claude nem o terminal, e nunca este ajudante nem um worker do PC;
 *   3. roda `scripts/atualizar-copia.js --dump=<arquivo>` (copia de seguranca do banco do PC antes, Conexao do PC
 *      mantidas, fotos do R2);
 *   4. aplica as migrations deste codigo que a VPS ainda nao tem (`prisma migrate deploy`): sem isso o servidor do PC
 *      quebraria com tabela ou coluna faltando;
 *   5. religa o servidor DESTA pasta (o das outras pastas fica para quem o usa), mesmo se algo deu errado antes.
 *
 * Cada passo vai para `dados/vps-operacao.json`, com um batimento a cada 10 s, e a tela le de la (inclusive depois
 * que o servidor volta). Saida em `dados/logs/vps-copia-botao.log`.
 *
 * Sem `dotenv`: este processo nao precisa do .env, e o servidor que ele religa leria as chaves como variaveis do
 * ambiente. O `copia:atualizar` e o Prisma leem o .env sozinhos.
 */

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, rmSync, statSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as regras from "../src/lib/vps/regras.js";
import { erroDoSsh, gravarEstado, lerEstado, naVps, rodar } from "../src/lib/vps/executar.js";
import { ambienteDoTerminal } from "../src/lib/coleta/workerPc.js";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORTAS = [3000, 3001, 3002];
const PORTA_DESTA_PASTA = 3000;
const PASTA_LOGS = path.join(RAIZ, "dados", "logs");

const hora = () => new Date().toLocaleTimeString("pt-BR");
const dizer = (texto) => console.log(`[${hora()}] [vps-copia] ${texto}`);
const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

// ---------------------------------------------------------------- estado

const agora = () => new Date().toISOString();
let estado = {
  ...(lerEstado(RAIZ) ?? {}),
  tipo: "copia",
  fase: "rodando",
  pid: process.pid,
  inicio: lerEstado(RAIZ)?.inicio ?? agora(),
  batimento: agora(),
};

function gravar(mudancas = {}) {
  estado = { ...estado, ...mudancas, batimento: agora() };
  try {
    gravarEstado(RAIZ, estado);
  } catch (erro) {
    dizer(`nao consegui gravar o estado: ${erro.message}`);
  }
}

function passo(texto) {
  dizer(texto);
  gravar({ passo: texto });
}

const batimento = setInterval(() => gravar(), 10_000);

class Falha extends Error {
  constructor(mensagem, ultimas = []) {
    super(mensagem);
    this.ultimas = ultimas;
  }
}

const ultimasLinhas = (texto, quantas = 12) =>
  String(texto ?? "")
    .split(/\r?\n/)
    .map((linha) => linha.trimEnd())
    .filter(Boolean)
    .slice(-quantas);

// ---------------------------------------------------------------- portas e processos

function portaOcupada(porta) {
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

async function portasOcupadas() {
  const ocupadas = [];
  for (const porta of PORTAS) if (await portaOcupada(porta)) ocupadas.push(porta);
  return ocupadas;
}

/**
 * Para os servidores de desenvolvimento das tres pastas. Devolve se o DESTA pasta estava entre eles (so ele e
 * religado) e quais portas estavam ocupadas.
 */
async function pararServidores() {
  const ocupadasAntes = await portasOcupadas();
  if (ocupadasAntes.length === 0) return { desteProjeto: false, portas: [] };

  const netstat = await rodar("netstat", ["-ano"], { tempoMs: 30_000 });
  const escutando = regras.pidsEscutando(netstat.saida, PORTAS);
  const processos = await rodar(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress",
    ],
    { tempoMs: 90_000 },
  );
  const tabela = regras.lerTabelaDeProcessos(processos.saida);
  if (tabela.length === 0) throw new Falha("Não consegui ler a lista de processos do Windows para parar o servidor.");

  const raizes = regras.raizesDoServidor(tabela, escutando);
  const ordem = regras.pidsParaParar(tabela, raizes, regras.protegidosDoServidor(tabela, process.pid));
  // "...\sistema-rise\" e nao so "sistema-rise": a pasta "sistema-rise-agente-1" comeca igual.
  const marca = `${RAIZ.toLowerCase()}${path.sep}`;
  const desteProjeto = ordem.some((pid) => (tabela.find((processo) => processo.pid === pid)?.comando ?? "").toLowerCase().includes(marca));

  dizer(`parando ${ordem.length} processo(s) do servidor (portas ${ocupadasAntes.join(", ")})`);
  for (const pid of ordem) {
    try {
      process.kill(pid);
    } catch {
      // Ja tinha saido junto com o pai.
    }
  }
  for (let tentativa = 0; tentativa < 60; tentativa++) {
    if ((await portasOcupadas()).length === 0) return { desteProjeto, portas: ocupadasAntes };
    await dormir(500);
  }
  throw new Falha(`O servidor do PC não parou: a(s) porta(s) ${(await portasOcupadas()).join(", ")} continuam ocupadas.`);
}

/** Religa o servidor desta pasta (`npm run dev`), destacado, e espera a porta responder. */
async function religarServidor() {
  mkdirSync(PASTA_LOGS, { recursive: true });
  const saida = openSync(path.join(PASTA_LOGS, "servidor-dev-botao.log"), "a");
  try {
    // Pelo cmd: no Windows o Node nao roda `npm.cmd` direto.
    const filho = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm run dev"], {
      cwd: RAIZ,
      detached: true,
      stdio: ["ignore", saida, saida],
      windowsHide: true,
      env: ambienteDoTerminal(process.env),
    });
    filho.on("error", () => {});
    filho.unref();
  } finally {
    closeSync(saida);
  }
  for (let tentativa = 0; tentativa < 180; tentativa++) {
    if (await portaOcupada(PORTA_DESTA_PASTA)) return true;
    await dormir(1000);
  }
  return false;
}

// ---------------------------------------------------------------- a copia

const carimbo = new Date().toLocaleString("sv-SE").replace(/[-: ]/g, "").replace(/^(\d{8})(\d{6})$/, "$1-$2");
const DUMP = path.join(RAIZ, "dados", "backup", `vps-agora-${carimbo}.dump`);

let parou = { desteProjeto: false, portas: [] };
let resultado = null;
try {
  passo(regras.PASSOS_DA_COPIA.dump);
  mkdirSync(path.dirname(DUMP), { recursive: true });
  const arquivo = openSync(DUMP, "w");
  let dump;
  try {
    dump = await naVps(regras.scriptDoDump(), { tempoMs: 20 * 60_000, saidaPara: arquivo });
  } finally {
    closeSync(arquivo);
  }
  const tamanho = existsSync(DUMP) ? statSync(DUMP).size : 0;
  if (dump.codigo !== 0 || tamanho < 1024) {
    throw new Falha(`Não consegui tirar o backup na VPS: ${erroDoSsh(dump)}`, ultimasLinhas(dump.erro));
  }
  dizer(`dump de ${(tamanho / 1024 / 1024).toFixed(1)} MB em ${path.relative(RAIZ, DUMP)}`);

  passo(regras.PASSOS_DA_COPIA.parar);
  parou = await pararServidores();

  passo(regras.PASSOS_DA_COPIA.restaurar);
  const copia = await rodar(process.execPath, [path.join(RAIZ, "scripts", "atualizar-copia.js"), `--dump=${DUMP}`], {
    cwd: RAIZ,
    tempoMs: 90 * 60_000,
  });
  process.stdout.write(copia.saida);
  process.stderr.write(copia.erro);
  const resumo = regras.resumoDaCopia(copia.saida);
  if (copia.codigo !== 0 || !resumo.pronta) {
    throw new Falha(
      "A cópia não terminou. O banco do PC ficou como estava se a recusa veio antes de restaurar; veja o log.",
      ultimasLinhas(`${copia.saida}\n${copia.erro}`),
    );
  }

  passo(regras.PASSOS_DA_COPIA.migrations);
  const prisma = path.join(RAIZ, "node_modules", "prisma", "build", "index.js");
  const migracao = await rodar(process.execPath, [prisma, "migrate", "deploy"], { cwd: RAIZ, tempoMs: 10 * 60_000 });
  process.stdout.write(migracao.saida);
  process.stderr.write(migracao.erro);
  if (migracao.codigo !== 0) {
    throw new Falha("O banco foi copiado, mas as migrations do PC falharam: o servidor pode dar erro.", ultimasLinhas(migracao.erro || migracao.saida));
  }

  resultado = { fase: "ok", mensagem: resumo.pronta.replace(/^Copia pronta em /, "Cópia pronta em ") };
  rmSync(DUMP, { force: true });
} catch (erro) {
  dizer(`FALHOU: ${erro.message}`);
  resultado = {
    fase: "erro",
    mensagem: erro instanceof Falha ? erro.message : `Erro inesperado: ${erro.message}`,
    ultimas: erro.ultimas ?? [],
    parouNoPasso: estado.passo,
  };
} finally {
  // Religa mesmo com erro: o dono nao pode ficar sem o Rise do PC por causa de uma copia que falhou.
  if (parou.desteProjeto) {
    passo(regras.PASSOS_DA_COPIA.religar);
    const voltou = await religarServidor();
    if (!voltou) {
      resultado = {
        ...resultado,
        servidor: "O servidor do PC não voltou em 3 minutos: abra o terminal e rode npm run dev.",
      };
    }
  }
  const outras = parou.portas.filter((porta) => porta !== PORTA_DESTA_PASTA);
  if (outras.length > 0) {
    resultado = { ...resultado, outrasPortas: `O servidor da(s) porta(s) ${outras.join(", ")} (outra pasta) foi parado e não foi religado.` };
  }
  clearInterval(batimento);
  gravar({ ...resultado, fim: agora(), passo: resultado?.fase === "ok" ? "Concluído" : (resultado?.parouNoPasso ?? estado.passo) });
  dizer(resultado?.fase === "ok" ? "concluido" : "terminou com erro");
}
process.exit(resultado?.fase === "ok" ? 0 : 1);

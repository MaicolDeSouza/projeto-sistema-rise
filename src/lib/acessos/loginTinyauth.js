import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";
import { registrarAuditoria } from "./banco.js";

/**
 * O login do Tinyauth (a tela de entrada do Rise na VPS) definido pelo proprio Rise (Opcao 1 do dono, 20/10/2026: "a
 * criacao de senha pelo Rise, so com nivel de administrador"). O Rise grava o ARQUIVO de usuarios que o Tinyauth le
 * (`TINYAUTH_AUTH_USERSFILE`, montado so para leitura no conteiner `auth`); um vigia do host (`deploy/aplicar-logins.sh`,
 * no cron) reinicia o Tinyauth quando o arquivo muda.
 *
 * Medido em 20/10/2026 num Tinyauth v5 descartavel: ele so le o arquivo na PARTIDA; junta os usuarios do arquivo com os
 * do `TINYAUTH_AUTH_USERS` do .env; sobe com o arquivo vazio e CAI sem ele (por isso o arquivo nunca e apagado, so
 * regravado); reiniciar mantem as sessoes abertas (recriar o conteiner as perde).
 *
 * Os logins do .env (o do dono) ficam de fora de proposito: sao a reserva de emergencia, que entra mesmo com o Rise ou o
 * arquivo quebrados, e so mudam pelo script `deploy/usuario-tinyauth.sh`. Um nome nunca esta nos dois lugares.
 *
 * O arquivo guarda so `nome:codigo` (bcrypt), uma linha por pessoa. A senha em texto existe so dentro da acao que a recebe
 * (num FormData: o `next dev` imprime os argumentos de Server Action) e nunca e gravada nem devolvida.
 */

export const ARQUIVO_DE_LOGINS = join(process.cwd(), "dados", "tinyauth", "usuarios");

// O mesmo que o script do host aceita: nada que quebre a linha "nome:codigo". Maiusculas valem ("Andrea"): o Tinyauth
// diferencia, o Rise poe em minusculas o login que recebe.
const NOME_DE_ENTRADA = /^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/;
const CODIGO = /^\$2[aby]\$\d{2}\$[A-Za-z0-9./]{53}$/;
// O bcrypt so le os primeiros 72 bytes: senha maior entraria "cortada" sem ninguem saber.
const MAXIMO_DE_BYTES = 72;
const CUSTO = 10;

export const nomeDeEntradaValido = (nome) => NOME_DE_ENTRADA.test(String(nome ?? ""));

/** Os nomes que entram pelo `TINYAUTH_AUTH_USERS` do .env (o app recebe o .env inteiro), em minusculas, com a grafia original. */
function loginsDoEnv(env) {
  const mapa = new Map();
  for (const entrada of String(env?.TINYAUTH_AUTH_USERS ?? "").replace(/^"|"$/g, "").split(",")) {
    const nome = entrada.split(":")[0].trim();
    if (nome) mapa.set(nome.toLowerCase(), nome);
  }
  return mapa;
}

export const nomesDoEnv = (env = process.env) => new Set(loginsDoEnv(env).keys());

/** As linhas boas do arquivo (`nome:codigo`); linha estranha e ignorada (e sai na proxima gravacao). Sem arquivo, lista vazia. */
export async function lerLogins({ arquivo = ARQUIVO_DE_LOGINS } = {}) {
  let texto = "";
  try {
    texto = await readFile(arquivo, "utf8");
  } catch (erro) {
    if (erro.code !== "ENOENT") throw erro;
  }
  return texto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .map((linha) => ({ nome: linha.slice(0, linha.indexOf(":")), codigo: linha.slice(linha.indexOf(":") + 1) }))
    .filter((linha) => nomeDeEntradaValido(linha.nome) && CODIGO.test(linha.codigo));
}

// Uma gravacao por vez neste processo: ler, mudar e gravar o arquivo inteiro nao pode se cruzar com outra.
let fila = Promise.resolve();
const umaPorVez = (trabalho) => {
  const vez = fila.then(trabalho, trabalho);
  fila = vez.catch(() => {});
  return vez;
};

/** Grava ao lado e troca de uma vez (o Tinyauth nunca le meio arquivo), legivel por ele (644). */
async function gravar(arquivo, linhas) {
  await mkdir(dirname(arquivo), { recursive: true });
  const temporario = `${arquivo}.novo-${process.pid}`;
  await writeFile(temporario, linhas.map((linha) => `${linha.nome}:${linha.codigo}\n`).join(""), { mode: 0o644 });
  await chmod(temporario, 0o644);
  await rename(temporario, arquivo);
}

const doLogin = (login) => (linha) => linha.nome.toLowerCase() === login;

/** Onde o login entra: pelo .env (reserva), pelo arquivo do Rise, ou ainda nao entra. Com a grafia do nome de entrada. */
export async function estadoDoLogin(login, { arquivo = ARQUIVO_DE_LOGINS, env = process.env } = {}) {
  const chave = String(login ?? "").toLowerCase();
  const doEnv = loginsDoEnv(env).get(chave);
  if (doEnv) return { onde: "env", nome: doEnv };
  const linha = (await lerLogins({ arquivo })).find(doLogin(chave));
  return linha ? { onde: "rise", nome: linha.nome } : { onde: "nenhum", nome: null };
}

const recusa = (campo, erro) => ({ ok: false, erro, erros: { [campo]: erro } });

/**
 * Cria o login do usuario do Rise no Tinyauth, ou troca a senha (e a escrita do nome). `login` e o do cadastro (minusculas);
 * `nome` e como a pessoa digita na tela de entrada, e tem que ser o mesmo login com outra caixa ("Andrea" para "andrea").
 *
 * @returns {Promise<{ ok: true, nome: string } | { ok: false, erro: string, erros: Record<string, string> }>}
 */
export async function definirSenha({ login, nome, senha }, { arquivo = ARQUIVO_DE_LOGINS, env = process.env, quem } = {}) {
  const chave = String(login ?? "").toLowerCase();
  const nomeDeEntrada = String(nome ?? "").trim();
  if (!nomeDeEntradaValido(nomeDeEntrada)) return recusa("nome", "Use de 2 a 40 letras, números, ponto, hífen ou sublinhado, sem espaço.");
  if (nomeDeEntrada.toLowerCase() !== chave) return recusa("nome", `O nome de entrada tem que ser o login (${chave}), podendo mudar só maiúsculas e minúsculas.`);
  if (loginsDoEnv(env).has(chave)) return recusa("geral", "Este login entra pelo .env da VPS (reserva de emergência): troque a senha pelo script deploy/usuario-tinyauth.sh.");
  const texto = typeof senha === "string" ? senha : "";
  if (!texto) return recusa("senha", "Digite a senha.");
  if (Buffer.byteLength(texto, "utf8") > MAXIMO_DE_BYTES) return recusa("senha", `Senha longa demais: até ${MAXIMO_DE_BYTES} bytes (o Tinyauth ignoraria o resto).`);

  const codigo = await bcrypt.hash(texto, CUSTO);
  await umaPorVez(async () => {
    const linhas = (await lerLogins({ arquivo })).filter((linha) => !doLogin(chave)(linha));
    await gravar(arquivo, [...linhas, { nome: nomeDeEntrada, codigo }]);
  });
  await prisma.$transaction((tx) => registrarAuditoria(tx, { quem: quem ?? "pc", oQue: "acessos.login.senha", alvo: chave, depois: { nome: nomeDeEntrada } }));
  return { ok: true, nome: nomeDeEntrada };
}

/** Tira o login do arquivo (usuario desativado, renomeado ou o botao "Remover login"). O .env nao e tocado. */
export async function removerLogin(login, { arquivo = ARQUIVO_DE_LOGINS, quem } = {}) {
  const chave = String(login ?? "").toLowerCase();
  const removido = await umaPorVez(async () => {
    const linhas = await lerLogins({ arquivo });
    const ficam = linhas.filter((linha) => !doLogin(chave)(linha));
    if (ficam.length === linhas.length) return false;
    await gravar(arquivo, ficam);
    return true;
  });
  if (removido) await prisma.$transaction((tx) => registrarAuditoria(tx, { quem: quem ?? "pc", oQue: "acessos.login.remover", alvo: chave }));
  return { removido };
}

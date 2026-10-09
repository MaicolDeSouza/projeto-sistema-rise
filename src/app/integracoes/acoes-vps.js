"use server";

import { headers } from "next/headers";

import { ehOPcDeDesenvolvimento, decidirCopia } from "@/lib/vps/regras";
import { acompanharOperacao, iniciarCopia, iniciarDeploy, lerSituacao, lerVps } from "@/lib/vps/executar";

/**
 * Acoes do cartao "Servidor VPS" (Integracoes). So o Rise do PC, aberto em localhost, as aceita: a VPS nao pode
 * oferecer atualizar a si mesma nem apagar o banco de ninguem, e o servidor do PC tambem escuta na rede local, onde
 * outro aparelho nao pode apertar estes botoes. A pagina so mostra o cartao nesse caso; aqui se confere de novo.
 *
 * Este arquivo so exporta funcao assincrona (regra do "use server").
 */

async function permitido() {
  return ehOPcDeDesenvolvimento(process.env, (await headers()).get("host"));
}

const SO_NO_PC = { ok: false, erro: "Estes botões só funcionam no Rise do PC, aberto em localhost." };
const PASTA = () => process.cwd();

/** Tudo o que o cartao mostra (git, VPS, o que sobe, as decisoes e a ultima operacao). Leva alguns segundos. */
export async function situacaoDaVps() {
  if (!(await permitido())) return SO_NO_PC;
  try {
    return { ok: true, ...(await lerSituacao(PASTA())) };
  } catch (erro) {
    return { ok: false, erro: `Não consegui ler a situação: ${erro.message}` };
  }
}

/** So a operacao em andamento (rapido): o cartao pergunta isto a cada poucos segundos enquanto algo roda. */
export async function andamentoDaVps() {
  if (!(await permitido())) return SO_NO_PC;
  try {
    return { ok: true, operacao: await acompanharOperacao(PASTA()) };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/**
 * "Atualizar a VPS": o clique e o "sobe" do dono. A situacao e lida DE NOVO aqui, e nao a da tela: entre abrir o
 * cartao e clicar, outro deploy pode ter comecado ou a VPS pode ter ficado igual ao GitHub.
 */
export async function atualizarAVps() {
  if (!(await permitido())) return SO_NO_PC;
  try {
    const situacao = await lerSituacao(PASTA());
    if (!situacao.deploy.pode) return { ok: false, erro: situacao.deploy.bloqueios.join(" ") };
    return await iniciarDeploy(PASTA());
  } catch (erro) {
    return { ok: false, erro: `Não consegui atualizar a VPS: ${erro.message}` };
  }
}

/** "Atualizar banco do PC": liga o ajudante destacado, que para e religa este servidor. */
export async function atualizarBancoDoPc() {
  if (!(await permitido())) return SO_NO_PC;
  try {
    const [vps, operacao] = await Promise.all([lerVps(), acompanharOperacao(PASTA())]);
    const outra = operacao?.fase === "rodando" ? "Já há uma operação em andamento." : null;
    const decisao = decidirCopia({ vps, outraOperacao: outra });
    if (!decisao.pode) return { ok: false, erro: decisao.bloqueios.join(" ") };
    return iniciarCopia(PASTA());
  } catch (erro) {
    return { ok: false, erro: `Não consegui atualizar o banco do PC: ${erro.message}` };
  }
}

import { registrarAuditoria } from "@/lib/acessos/banco";
import { prisma } from "@/lib/db";

import { PROVEDORES_DO_CANAL } from "./cliente/configuracaoDoCanal";
import { cifrarSegredo, decifrarSegredo, derivarChave } from "./cliente/segredos";
import { etiquetaDoWidget, lerPublicados } from "./cliente/widgetPublicado";
import { endpointPadrao, provedorPorId } from "./modelos";
import { criarProvedor as criarProvedorReal } from "./provedores/index";

/**
 * O lado do RISE do chat da loja (o Hobi): o que a tela Canais > Chat da loja le e grava. O servico `ia` so LE estas
 * tabelas, com o usuario de banco restrito; quem escreve e o Rise, aqui.
 *
 * Mora fora de `cliente/` de proposito: aquela pasta e o que o servico publico carrega, e este arquivo traz a trilha
 * de auditoria e os provedores do Rise.
 *
 * Os dois segredos do servico (a chave de IA dedicada ao chat e o segredo do Turnstile) sao SO DE ESCRITA: entram
 * cifrados com a chave "segredos" derivada do `IA_SEGREDO` (`derivarChave`) e nunca voltam, nem para a tela, nem para o
 * log, nem para a trilha (a trilha guarda so "qual segredo" e "cadastrado ou nao").
 */

export const NOMES_DOS_SEGREDOS = ["openai", "anthropic", "turnstile"];
const SINAL_VALE_MS = 2 * 60 * 1000;
const NAO_PREPARADO = "O serviço do chat ainda não foi preparado na VPS.";

/** O `deploy/preparar-ia.sh` ja rodou nesta maquina? (E ele quem poe o IA_SEGREDO no ambiente do Rise.) */
export const servicoPreparado = (env = process.env) => /^[0-9a-f]{64}$/i.test(String(env?.IA_SEGREDO ?? ""));

const rotuloDoProvedor = (id) => provedorPorId(id)?.rotulo ?? id;

/**
 * Guarda um segredo do chat, cifrado. Nao testa: o "Testar chave" e um clique a parte.
 * @returns {Promise<{ ok: true } | { ok: false, erro: string }>}
 */
export async function guardarSegredoDoChat(nome, valor, { usuario, env = process.env }) {
  if (!NOMES_DOS_SEGREDOS.includes(nome)) return { ok: false, erro: "Segredo desconhecido." };
  if (!servicoPreparado(env)) return { ok: false, erro: NAO_PREPARADO };
  const limpo = String(valor ?? "").trim();
  if (limpo.length < 10 || limpo.length > 400) return { ok: false, erro: "Cole o valor inteiro (de 10 a 400 caracteres)." };
  const cifrado = cifrarSegredo(limpo, derivarChave(env.IA_SEGREDO, "segredos"));
  await prisma.$transaction(async (tx) => {
    const antes = await tx.segredoDoAssistente.findUnique({ where: { nome }, select: { nome: true } });
    await tx.segredoDoAssistente.upsert({ where: { nome }, create: { nome, cifrado, atualizadoPor: usuario }, update: { cifrado, atualizadoPor: usuario } });
    await registrarAuditoria(tx, { quem: usuario, oQue: "rise-ai.chatDaLoja.segredo", alvo: "SegredoDoAssistente", antes: { nome, cadastrado: Boolean(antes) }, depois: { nome, cadastrado: true } });
  });
  return { ok: true };
}

/** @returns {Promise<{ ok: true } | { ok: false, erro: string }>} */
export async function removerSegredoDoChat(nome, { usuario }) {
  if (!NOMES_DOS_SEGREDOS.includes(nome)) return { ok: false, erro: "Segredo desconhecido." };
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.segredoDoAssistente.deleteMany({ where: { nome } });
    if (count > 0) await registrarAuditoria(tx, { quem: usuario, oQue: "rise-ai.chatDaLoja.segredo", alvo: "SegredoDoAssistente", antes: { nome, cadastrado: true }, depois: { nome, cadastrado: false } });
  });
  return { ok: true };
}

/**
 * Confere a chave de IA do chat no provedor. So lista os modelos (nao gasta). A chave e decifrada aqui e nao sai daqui.
 * @returns {Promise<{ ok: boolean, latenciaMs: number, erro: string | null }>}
 */
export async function testarChaveDoChat(provedor, { env = process.env, criarProvedor = criarProvedorReal } = {}) {
  const falha = (erro) => ({ ok: false, latenciaMs: 0, erro });
  if (!PROVEDORES_DO_CANAL.includes(provedor)) return falha("Provedor desconhecido.");
  if (!servicoPreparado(env)) return falha(NAO_PREPARADO);
  const linha = await prisma.segredoDoAssistente.findUnique({ where: { nome: provedor } });
  if (!linha) return falha("Cadastre a chave antes de testar.");
  let chave;
  try {
    chave = decifrarSegredo(linha.cifrado, derivarChave(env.IA_SEGREDO, "segredos"));
  } catch {
    return falha("A chave guardada não abre com o segredo deste serviço. Cole a chave de novo.");
  }
  const teste = await (await criarProvedor(provedor, { endpoint: endpointPadrao(provedor, "vps"), chave })).testar();
  return { ok: Boolean(teste.ok), latenciaMs: Number(teste.latenciaMs) || 0, erro: teste.ok ? null : String(teste.erro ?? "O provedor recusou a chave.") };
}

/**
 * O que falta para o chat poder ser ligado, na ordem em que o dono resolve. Lista vazia = pode ligar. E a mesma conta
 * que o servico faz para responder "ligado" (falha fechada la; aqui, a tela diz o motivo).
 *
 * @param {{ preparado: boolean, segredos: Record<string, { cadastrado: boolean }>, canal: object }} situacao
 * @returns {string[]}
 */
export function faltasParaLigar({ preparado, segredos, canal }) {
  const faltas = [];
  if (!preparado) faltas.push("o serviço do chat ainda não foi preparado na VPS");
  const principal = canal?.principal?.provedor;
  if (!segredos?.[principal]?.cadastrado) faltas.push(`a chave da IA (${rotuloDoProvedor(principal)})`);
  if (!segredos?.turnstile?.cadastrado) faltas.push("o segredo do Turnstile");
  if (!String(canal?.turnstileSiteKey ?? "").trim()) faltas.push("a chave pública do Turnstile");
  if (!String(canal?.whatsapp ?? "").trim()) faltas.push("o link do WhatsApp");
  return faltas;
}

/** "a", "a e b", "a, b e c". */
export function listaEmTexto(itens) {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
}

/** Quais segredos estao cadastrados e desde quando. Nunca o valor, nem o cifrado. */
export async function segredosCadastrados() {
  const linhas = await prisma.segredoDoAssistente.findMany({ select: { nome: true, atualizadoEm: true } });
  const porNome = new Map(linhas.map((linha) => [linha.nome, linha.atualizadoEm]));
  return Object.fromEntries(NOMES_DOS_SEGREDOS.map((nome) => [nome, { cadastrado: porNome.has(nome), em: porNome.get(nome) ?? null }]));
}

/**
 * Tudo o que a tela mostra do canal alem do formulario: se o servico foi preparado, os segredos, o sinal de vida do
 * servico, a etiqueta para colar na loja e o que falta para ligar.
 *
 * @param {{ config: { chatDaLoja: object }, env?: object, agora?: number }} opcoes
 */
export async function estadoDoChatDaLoja({ config, env = process.env, agora = Date.now() }) {
  const [segredos, sinal] = await Promise.all([segredosCadastrados(), prisma.sinalDoAssistente.findUnique({ where: { id: "unico" } })]);
  const preparado = servicoPreparado(env);
  const atual = lerPublicados().atual;
  return {
    preparado,
    segredos,
    sinal: sinal ? { em: sinal.sinalEm, versao: sinal.versao ?? null, emAndamento: sinal.emAndamento, ultimoErro: sinal.ultimoErro ?? null } : null,
    noAr: Boolean(sinal) && agora - sinal.sinalEm.getTime() <= SINAL_VALE_MS,
    widget: atual ? { versao: atual.versao, etiqueta: etiquetaDoWidget(atual) } : null,
    faltas: faltasParaLigar({ preparado, segredos, canal: config.chatDaLoja }),
  };
}

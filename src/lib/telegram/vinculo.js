import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { registrarAuditoria } from "@/lib/acessos/banco";

/**
 * O vinculo de uma pessoa do Rise ao chat dela no Telegram (spec do agente, §7 Entrega C). Sem polling: o
 * Administrador gera um codigo na tela do usuario, a pessoa manda `/vincular CODIGO` ao bot, e o Rise faz UMA leitura
 * curta do `getUpdates` para achar o chat. So o hash do codigo fica no banco; o texto aparece uma vez, na tela.
 *
 * Regras: 12 caracteres de um alfabeto sem `0 O 1 I L` (quem digita no celular nao confunde), 10 minutos de validade,
 * um chat liga a um usuario so (`telegramChatId @unique`), e cinco tentativas erradas de um mesmo chat silenciam o chat
 * e anulam o codigo (quem esta chutando nao ganha mais chances naquele codigo).
 */

export const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const TAMANHO_DO_CODIGO = 12;
export const VALIDADE_DO_CODIGO_MS = 10 * 60 * 1000;
export const TENTATIVAS_QUE_SILENCIAM = 5;

const COMANDO = /^\/vincular\s+(\S+)/i;

export function gerarCodigo(aleatorio = randomInt) {
  let codigo = "";
  for (let i = 0; i < TAMANHO_DO_CODIGO; i++) codigo += ALFABETO[aleatorio(ALFABETO.length)];
  return codigo;
}

/** SHA-256 hex do codigo em MAIUSCULAS e sem espacos: o que a pessoa digita com outra caixa ainda vale. */
export function hashDoCodigo(codigo) {
  return createHash("sha256").update(String(codigo ?? "").replace(/\s+/g, "").toUpperCase()).digest("hex");
}

/**
 * Le as atualizacoes do `getUpdates` (puro, sem banco). So mensagem de chat privado, com texto `/vincular X`, de
 * depois de o codigo ser criado. Por chat, conta os codigos errados; chat com 5 ou mais e ignorado e anula o codigo.
 *
 * @returns {{ achado: { chatId: string, nome: string, usuario: string|null, updateId: number } | null, anulado: boolean, ultimoUpdateId: number|null }}
 */
export function avaliarAtualizacoes(updates, { hash, criadoEm, agora = Date.now() } = {}) {
  const errosPorChat = new Map();
  const acertos = [];
  let ultimoUpdateId = null;
  for (const update of updates ?? []) {
    if (typeof update?.update_id === "number") ultimoUpdateId = Math.max(ultimoUpdateId ?? update.update_id, update.update_id);
    const mensagem = update?.message;
    const chat = mensagem?.chat;
    if (!chat || chat.type !== "private" || typeof mensagem.text !== "string") continue;
    const casou = COMANDO.exec(mensagem.text.trim());
    if (!casou) continue;
    // O Telegram da a data em segundos inteiros: compara-se no segundo, senao a mensagem mandada no mesmo segundo em
    // que o codigo nasceu (date truncado) pareceria anterior a ele.
    if (Number(mensagem.date) < Math.floor(Number(criadoEm) / 1000)) continue;
    if (Number(mensagem.date) * 1000 > Number(agora) + 60 * 1000) continue;
    const chatId = String(chat.id);
    if (hashDoCodigo(casou[1]) === hash) {
      acertos.push({ chatId, nome: [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chatId, usuario: chat.username ?? null, updateId: update.update_id });
    } else {
      errosPorChat.set(chatId, (errosPorChat.get(chatId) ?? 0) + 1);
    }
  }
  const silenciados = new Set([...errosPorChat].filter(([, erros]) => erros >= TENTATIVAS_QUE_SILENCIAM).map(([chatId]) => chatId));
  const validos = acertos.filter((acerto) => !silenciados.has(acerto.chatId));
  return { achado: validos.at(-1) ?? null, anulado: silenciados.size > 0, ultimoUpdateId };
}

async function lerUsuario(usuarioId) {
  const usuario = await prisma.usuarioRise.findUnique({ where: { id: usuarioId } });
  if (!usuario) throw new Error("Usuário não encontrado.");
  return usuario;
}

/** Grava o hash e a validade; devolve o codigo UMA vez. A auditoria registra o inicio, nunca o codigo. */
export async function iniciarVinculo(usuarioId, { quem, agora = new Date() } = {}) {
  const usuario = await lerUsuario(usuarioId);
  if (!usuario.ativo) throw new Error("Ative o usuário antes de vincular o Telegram.");
  const codigo = gerarCodigo();
  const expiraEm = new Date(agora.getTime() + VALIDADE_DO_CODIGO_MS);
  await prisma.$transaction(async (tx) => {
    await tx.usuarioRise.update({ where: { id: usuarioId }, data: { codigoDeVinculoHash: hashDoCodigo(codigo), codigoDeVinculoExpiraEm: expiraEm } });
    await registrarAuditoria(tx, { quem, oQue: "telegram.vinculo.iniciar", alvo: usuarioId, depois: { expiraEm: expiraEm.toISOString() } });
  });
  return { codigo, expiraEm };
}

const limparCodigo = (usuarioId) => prisma.usuarioRise.update({ where: { id: usuarioId }, data: { codigoDeVinculoHash: null, codigoDeVinculoExpiraEm: null } });

/**
 * A leitura do vinculo. `motivo`: `sem-codigo`, `expirado` (limpa o hash), `telegram` (com `erro`, ja mascarado),
 * `anulado` (5 erros de um chat; limpa o hash) ou `nao-chegou`.
 */
export async function localizarVinculo(usuarioId, { cliente, agora = Date.now() } = {}) {
  const usuario = await lerUsuario(usuarioId);
  if (!usuario.codigoDeVinculoHash || !usuario.codigoDeVinculoExpiraEm) return { ok: false, motivo: "sem-codigo" };
  if (usuario.codigoDeVinculoExpiraEm.getTime() < agora) {
    await limparCodigo(usuarioId);
    return { ok: false, motivo: "expirado" };
  }
  const leitura = await cliente.getUpdates();
  if (!leitura.ok) return { ok: false, motivo: "telegram", erro: leitura.erro };
  const criadoEm = usuario.codigoDeVinculoExpiraEm.getTime() - VALIDADE_DO_CODIGO_MS;
  const { achado, anulado, ultimoUpdateId } = avaliarAtualizacoes(leitura.dados ?? [], { hash: usuario.codigoDeVinculoHash, criadoEm, agora });
  if (anulado) {
    await limparCodigo(usuarioId);
    return { ok: false, motivo: "anulado" };
  }
  if (!achado) return { ok: false, motivo: "nao-chegou" };
  const { updateId: _updateId, ...chat } = achado;
  return { ok: true, chat, ultimoUpdateId };
}

const MOTIVO_EM_TEXTO = {
  "sem-codigo": "Não há código aberto. Gere outro.",
  expirado: "Código vencido. Gere outro.",
  anulado: "Código anulado: cinco tentativas erradas de um chat. Gere outro.",
  "nao-chegou": "O código ainda não chegou ao bot. Envie a mensagem e confira de novo.",
};

/**
 * Confirma o que o Administrador viu na tela: rele o Telegram e exige que seja o MESMO chat (o `chatId` vem do
 * navegador). Grava o chat, zera o codigo, audita, confirma o `update_id` lido e manda a boas-vindas (falha do envio
 * nao desfaz o vinculo: vai em `aviso`).
 */
export async function confirmarVinculo(usuarioId, chatId, { cliente, quem, agora = Date.now() } = {}) {
  const leitura = await localizarVinculo(usuarioId, { cliente, agora });
  if (!leitura.ok) return { ok: false, erro: leitura.motivo === "telegram" ? `Telegram: ${leitura.erro}` : MOTIVO_EM_TEXTO[leitura.motivo] };
  if (leitura.chat.chatId !== String(chatId)) return { ok: false, erro: "O chat conferido não é o que enviou o código. Confira de novo." };
  const usuario = await lerUsuario(usuarioId);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.usuarioRise.update({
        where: { id: usuarioId },
        data: { telegramChatId: leitura.chat.chatId, codigoDeVinculoHash: null, codigoDeVinculoExpiraEm: null },
      });
      await registrarAuditoria(tx, { quem, oQue: "telegram.vinculo.confirmar", alvo: usuarioId, depois: { chatId: leitura.chat.chatId, usuario: leitura.chat.usuario } });
    });
  } catch (erro) {
    if (erro?.code === "P2002") return { ok: false, erro: "Este Telegram já está ligado a outro usuário." };
    throw erro;
  }
  if (leitura.ultimoUpdateId !== null) await cliente.confirmarAtualizacoes(leitura.ultimoUpdateId);
  const envio = await cliente.enviarMensagem(leitura.chat.chatId, `Telegram ligado ao Rise para ${usuario.nome}.\nOs avisos chegam por aqui.`, { caminho: "/rise-ai/configuracoes" });
  return { ok: true, chat: leitura.chat, ...(envio.ok ? {} : { aviso: `Vinculado, mas a mensagem de boas-vindas não saiu: ${envio.erro}` }) };
}

export async function desvincular(usuarioId, { quem } = {}) {
  const usuario = await lerUsuario(usuarioId);
  await prisma.$transaction(async (tx) => {
    await tx.usuarioRise.update({ where: { id: usuarioId }, data: { telegramChatId: null, codigoDeVinculoHash: null, codigoDeVinculoExpiraEm: null } });
    await registrarAuditoria(tx, { quem, oQue: "telegram.vinculo.remover", alvo: usuarioId, antes: { chatId: usuario.telegramChatId } });
  });
}

/** Quem tem Telegram vinculado, para a aba Canais. O chatId nao sai daqui. */
export async function vinculosDaEquipe() {
  const usuarios = await prisma.usuarioRise.findMany({
    where: { telegramChatId: { not: null } },
    select: { id: true, login: true, nome: true, ativo: true },
    orderBy: { nome: "asc" },
  });
  return usuarios.map(({ id, login, nome, ativo }) => ({ usuarioId: id, login, nome, ativo }));
}

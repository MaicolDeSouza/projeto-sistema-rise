import { prisma } from "@/lib/db";
import { permissoesDoLogin } from "@/lib/acessos/banco";
import { lerSegredo } from "@/lib/integracoes/conexoes";

import { criarClienteTelegram } from "./cliente";
import { SERVICO_TELEGRAM } from "./estado";
import { COMANDO_DE_VINCULO, hashDoCodigo } from "./vinculo";

/**
 * O bot do Telegram ESCUTANDO (Atendimento do ML, spec 2026-11-24-atendimento-ml-design.md). Ate 24/11/2026 o bot so
 * enviava; a unica leitura era a do vinculo, feita pela tela. Agora o worker NORMAL le as atualizacoes em espera longa
 * (`getUpdates`), sem abrir rota publica nenhuma, e guarda no banco ate onde ja leu (`EstadoDoBotTelegram.offset`).
 *
 * O que ele faz com cada atualizacao:
 *  - `/vincular CODIGO` num chat privado: guarda em `ComandoDeVinculoTelegram` (so o SHA-256 do codigo). E a tela
 *    "Conferir vinculo" que le dali, porque quem le o `getUpdates` passa a ser um so (dois leitores se atropelam);
 *  - clique de botao ou texto de um chat AUTORIZADO (usuario ativo, vinculado e com `acao.atendimentoML.responder`):
 *    entrega ao tratador;
 *  - todo o resto e descartado em silencio: chat que o Rise nao conhece nao recebe nem resposta.
 *
 * O texto recebido NUNCA e comando: quem decide o que ele significa e o tratador, e ele so o le como o conteudo de uma
 * resposta a um pedido que o proprio bot fez.
 */

export const ENTRADA_DO_TELEGRAM_MS = 1000;
/// A espera longa do `getUpdates`: curta o bastante para o worker encerrar sem demora num deploy.
export const ESPERA_DA_ENTRADA_S = 15;
/// Os `/vincular` guardados so servem aos 10 minutos do codigo; um dia e folga para depurar.
const VALIDADE_DOS_COMANDOS_MS = 24 * 60 * 60 * 1000;
const ID = "bot";
const RECURSO = "acao.atendimentoML.responder";

/** Os chats que o bot ouve: usuario ativo, com chat vinculado e com a permissao de responder. */
export async function chatsAutorizados({ env = process.env } = {}) {
  const usuarios = await prisma.usuarioRise.findMany({ where: { ativo: true, telegramChatId: { not: null } }, select: { login: true, telegramChatId: true } });
  const chats = new Set();
  for (const usuario of usuarios) {
    const sessao = await permissoesDoLogin(usuario.login, { env });
    if (sessao.pode(RECURSO, "executar")) chats.add(String(usuario.telegramChatId));
  }
  return chats;
}

/** O login do chat autorizado (para a auditoria do envio feito pelo Telegram), ou `null`. */
export async function loginDoChat(chatId, { env = process.env } = {}) {
  const usuario = await prisma.usuarioRise.findFirst({ where: { ativo: true, telegramChatId: String(chatId) }, select: { login: true } });
  if (!usuario) return null;
  return (await permissoesDoLogin(usuario.login, { env })).pode(RECURSO, "executar") ? usuario.login : null;
}

async function guardarComandoDeVinculo(update, agora) {
  const mensagem = update.message;
  const chat = mensagem.chat;
  const casou = COMANDO_DE_VINCULO.exec(String(mensagem.text).trim());
  if (!casou) return false;
  const linha = {
    chatId: String(chat.id),
    nome: [chat.first_name, chat.last_name].filter(Boolean).join(" ").slice(0, 120) || String(chat.id),
    usuario: chat.username ? String(chat.username).slice(0, 64) : null,
    codigoHash: hashDoCodigo(casou[1]),
    recebidoEm: Number.isFinite(Number(mensagem.date)) ? new Date(Number(mensagem.date) * 1000) : new Date(agora),
  };
  await prisma.comandoDeVinculoTelegram.upsert({ where: { updateId: update.update_id }, update: linha, create: { updateId: update.update_id, ...linha } });
  return true;
}

/**
 * Uma rodada: le o que chegou desde o `offset`, trata cada atualizacao e avanca o `offset` depois de cada uma (erro num
 * tratador nao trava a fila: conta em `erros` e segue). Nunca lanca. A linha `EstadoDoBotTelegram` e tocada a cada
 * rodada mesmo sem novidade: e por ela que a tela do vinculo sabe que ha um ouvinte vivo.
 *
 * @param {{ cliente: object, agora?: number, esperaS?: number, tratadores?: { clique?: Function, texto?: Function }, autorizados?: () => Promise<Set<string>> }} opcoes
 * @returns {Promise<{ ok: boolean, lidas: number, erros: number, erro?: string }>}
 */
export async function rodarEntradaDoTelegram({ cliente, agora = Date.now(), esperaS = ESPERA_DA_ENTRADA_S, tratadores = {}, autorizados = chatsAutorizados } = {}) {
  try {
    const estado = await prisma.estadoDoBotTelegram.upsert({ where: { id: ID }, update: { atualizadoEm: new Date(agora) }, create: { id: ID } });
    const leitura = await cliente.lerAtualizacoes({ offset: estado.offset, esperaS });
    if (!leitura.ok) return { ok: false, lidas: 0, erros: 0, erro: leitura.erro };
    const updates = (leitura.dados ?? []).filter((update) => Number.isInteger(update?.update_id)).sort((a, b) => a.update_id - b.update_id);
    if (updates.length === 0) return { ok: true, lidas: 0, erros: 0 };

    const ouvidos = await autorizados();
    let erros = 0;
    for (const update of updates) {
      try {
        const mensagem = update.message;
        const clique = update.callback_query;
        if (mensagem?.chat?.type === "private" && typeof mensagem.text === "string" && (await guardarComandoDeVinculo(update, agora))) {
          // Guardado para a tela do vinculo: nao vai a tratador nenhum.
        } else if (clique) {
          const chatId = String(clique.message?.chat?.id ?? clique.from?.id ?? "");
          if (ouvidos.has(chatId) && tratadores.clique) await tratadores.clique(clique, { cliente, chatId });
        } else if (mensagem?.chat?.type === "private" && typeof mensagem.text === "string") {
          const chatId = String(mensagem.chat.id);
          if (ouvidos.has(chatId) && tratadores.texto) await tratadores.texto(mensagem, { cliente, chatId });
        }
      } catch (erro) {
        erros++;
        console.error("[telegram] atualização não tratada:", String(erro?.message ?? erro).slice(0, 300));
      }
      await prisma.estadoDoBotTelegram.update({ where: { id: ID }, data: { offset: update.update_id + 1 } });
    }
    await prisma.comandoDeVinculoTelegram.deleteMany({ where: { recebidoEm: { lt: new Date(agora - VALIDADE_DOS_COMANDOS_MS) } } });
    return { ok: true, lidas: updates.length, erros };
  } catch (erro) {
    return { ok: false, lidas: 0, erros: 0, erro: String(erro?.message ?? erro).slice(0, 300) };
  }
}

/** O cliente do bot a partir do token cadastrado, ou `null` sem token (o worker nao escuta sem bot). */
export async function clienteDoBotCadastrado() {
  const segredo = await lerSegredo(SERVICO_TELEGRAM).catch(() => null);
  return segredo?.token ? criarClienteTelegram({ token: segredo.token }) : null;
}

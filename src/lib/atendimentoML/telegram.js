import { readFile } from "node:fs/promises";

import { caminhoDe } from "@/lib/arquivos";
import { prisma } from "@/lib/db";
import { clienteML } from "@/lib/canaisDeVenda/ml/cliente";
import { lerConfiguracao } from "@/lib/riseAi/configuracao";
import { chatsAutorizados, clienteDoBotCadastrado, loginDoChat } from "@/lib/telegram/entrada";
import { linkAbrirNoRise, neutralizar, trechoSeguro } from "@/lib/telegram/texto";

import { ignorarAtendimento, lerAtendimento, salvarRascunho } from "./banco";
import { enviarResposta } from "./enviar";
import { textoDoBarrado } from "./filtro";
import { sugerirResposta } from "./sugerir";

/**
 * O Atendimento do ML no Telegram (spec 2026-11-24-atendimento-ml-design.md, "Telegram"). Tres partes:
 *
 *  - `avisarPerguntasNovas`: a pergunta aberta vira uma mensagem com a foto do produto e os botoes Sugerir com IA,
 *    Escrever / Editar, Ignorar e Abrir no Rise. Uma vez por pergunta e por chat (linha de `AvisoTelegram`).
 *  - `criarTratadoresDoAtendimento`: o que o bot faz com o clique de um botao e com o texto que o dono manda. O texto so
 *    vale quando RESPONDE ao pedido "Escreva a resposta" de uma pergunta ainda aberta, e e sempre o CONTEUDO da resposta,
 *    nunca um comando. Texto solto ganha uma linha de dica e nada mais.
 *  - `atualizarAvisoFechado`: a pergunta respondida (pelo Rise, pelo assistente, pelo app do ML) ou ignorada tem o aviso
 *    editado e perde os botoes.
 *
 * Quem publica no ML continua sendo so `enviarResposta` (a mesma trava, o mesmo filtro, o mesmo envio unico).
 */

const TIPO = "perguntaML";
const CABECALHO = "Pergunta no Mercado Livre";
const DICA = "Para responder, toque em Escrever / Editar na pergunta.";
const TRES_DIAS_MS = 3 * 24 * 60 * 60 * 1000;
const MAXIMO_POR_VOLTA = 10;
/// O Telegram recusa foto acima de 10 MB.
const MAXIMO_DA_FOTO_BYTES = 10 * 1024 * 1024;
const TIPO_DA_FOTO = { png: "image/png", webp: "image/webp" };
const DADOS = /^at:([a-z0-9]{1,40}):([sevi])$/;

const botao = (texto, id, acao) => ({ texto, dados: `at:${id}:${acao}` });
const horaDeSaoPaulo = (data) => new Date(data).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const VIA = { RISE: "pelo Rise", TELEGRAM: "pelo Telegram", MCP: "pelo assistente", ML: "fora do Rise" };

/** O corpo do aviso: o cabecalho, o anuncio (com "Kit de N") e a pergunta do comprador, mascarada e sem virar link. */
function corpoDoAviso(linha) {
  const kit = Number(linha.anuncio?.unidadesDoKit) > 1 ? ` (Kit de ${linha.anuncio.unidadesDoKit})` : "";
  const anuncio = linha.anuncio?.titulo ? `${trechoSeguro(linha.anuncio.titulo, 90)}${kit}` : `Anúncio ${trechoSeguro(linha.itemId ?? "", 20)} (fora do Rise)`;
  return [CABECALHO, anuncio, `“${trechoSeguro(linha.textoDoCliente, 600)}”`].join("\n");
}

function botoesDoAviso(id, urlPublica) {
  const link = linkAbrirNoRise(urlPublica, "/atendimento");
  return [
    [botao("Sugerir com IA", id, "s"), botao("Escrever / Editar", id, "e")],
    [botao("Ignorar", id, "i"), ...(link ? [{ texto: "Abrir no Rise", url: link }] : [])],
  ];
}

async function lerFotoDoDisco(sku, arquivo) {
  const caminho = caminhoDe(sku, "IMAGEM", arquivo);
  if (!caminho) throw new Error("caminho inválido para a foto");
  return readFile(caminho);
}

/** A foto principal do produto do anuncio, ou `null` (anuncio de fora do Rise, sem foto, arquivo que nao abre). */
async function fotoDoProduto(produtoId, lerFoto) {
  if (!produtoId) return null;
  const arquivo = await prisma.produtoArquivo.findFirst({ where: { produtoId, tipo: "IMAGEM", papel: "FOTO" }, orderBy: [{ principal: "desc" }, { ordem: "asc" }], select: { arquivo: true, produto: { select: { sku: true } } } });
  if (!arquivo) return null;
  try {
    const bytes = await lerFoto(arquivo.produto.sku, arquivo.arquivo);
    if (!bytes?.length || bytes.length > MAXIMO_DA_FOTO_BYTES) return null;
    const extensao = String(arquivo.arquivo).split(".").pop().toLowerCase();
    return { bytes, nome: arquivo.arquivo, tipo: TIPO_DA_FOTO[extensao] ?? "image/jpeg" };
  } catch {
    return null;
  }
}

/**
 * Manda o aviso das perguntas ABERTAS que ainda nao foram avisadas (dos ultimos 3 dias; o worker pode ter ficado parado).
 * Nunca lanca. So com o bot ligado e o aviso "Pergunta nova no Mercado Livre" marcado na aba Canais.
 *
 * @returns {Promise<{ ok: boolean, mandados: number, falhas: number, motivo?: string }>}
 */
export async function avisarPerguntasNovas({ cliente = null, agora = Date.now(), env = process.env, configuracao = null, autorizados = null, lerFoto = lerFotoDoDisco, soPrefixo = null, urlPublica = env.APP_URL_PUBLICA } = {}) {
  try {
    const config = configuracao ?? (await lerConfiguracao());
    if (!config.telegram?.ligado || !config.telegram.avisos?.[TIPO]) return { ok: true, mandados: 0, falhas: 0, motivo: "desligado" };
    const abertas = await prisma.atendimentoML.findMany({
      where: { tipo: "PERGUNTA", status: "ABERTA", recebidaEm: { gte: new Date(agora - TRES_DIAS_MS) }, ...(soPrefixo ? { idExterno: { startsWith: soPrefixo } } : {}) },
      orderBy: { recebidaEm: "asc" },
      select: { id: true },
    });
    if (abertas.length === 0) return { ok: true, mandados: 0, falhas: 0 };
    const chats = [...(autorizados ? await autorizados() : await chatsAutorizados({ env }))].sort();
    if (chats.length === 0) return { ok: true, mandados: 0, falhas: 0, motivo: "sem-destinatario" };
    const bot = cliente ?? (await clienteDoBotCadastrado());
    if (!bot) return { ok: true, mandados: 0, falhas: 0, motivo: "sem-token" };

    // A linha de `AvisoTelegram` so nasce quando a mensagem SAIU (ou quando o chat bloqueou o bot): a rotina comum dos
    // avisos reenvia toda linha pendente como texto simples, e a pergunta sem os botoes nao serviria. O que falhou
    // fica sem linha e tenta de novo na volta seguinte.
    const jaTratados = await prisma.avisoTelegram.findMany({ where: { tipo: TIPO, chave: { in: abertas.flatMap((a) => chats.map((chat) => `pergunta-ml:${a.id}:${chat}`)) } }, select: { chave: true } });
    const tratadas = new Set(jaTratados.map((aviso) => aviso.chave));
    let mandados = 0;
    let falhas = 0;
    for (const { id } of abertas) {
      for (const chatId of chats) {
        if (mandados + falhas >= MAXIMO_POR_VOLTA) return { ok: true, mandados, falhas };
        const chave = `pergunta-ml:${id}:${chatId}`;
        if (tratadas.has(chave)) continue;
        const linha = await lerAtendimento(id);
        if (!linha || linha.status !== "ABERTA") continue;
        const texto = corpoDoAviso(linha);
        const botoes = botoesDoAviso(id, urlPublica);
        const foto = await fotoDoProduto(linha.produtoId, lerFoto);
        let envio = foto ? await bot.enviarFotoComBotoes(chatId, foto, texto, { botoes }) : null;
        // Sem foto, ou com a foto recusada: o texto sai do mesmo jeito. Chat que bloqueou o bot nao ganha a 2a tentativa.
        if (!envio?.ok && !envio?.bloqueado) envio = await bot.enviarComBotoes(chatId, texto, { botoes });
        if (envio.ok || envio.bloqueado) {
          const dadosDoAviso = { enviadoEm: new Date(agora), tentativas: 1, erro: envio.ok ? null : String(envio.erro ?? "").slice(0, 300) };
          await prisma.avisoTelegram.upsert({ where: { chave }, update: dadosDoAviso, create: { chave, tipo: TIPO, chatId, texto, ...dadosDoAviso } });
        }
        if (!envio.ok) {
          falhas++;
          continue;
        }
        mandados++;
        // A mensagem do aviso fica guardada no primeiro chat que a recebeu: e ela que e editada quando a pergunta fecha.
        if (envio.dados?.message_id) await prisma.atendimentoML.updateMany({ where: { id, telegramMensagemId: null }, data: { telegramChatId: chatId, telegramMensagemId: envio.dados.message_id } });
      }
    }
    return { ok: true, mandados, falhas };
  } catch (erro) {
    console.error("[atendimentoML] aviso do Telegram:", String(erro?.message ?? erro).slice(0, 300));
    return { ok: false, mandados: 0, falhas: 0, motivo: "erro" };
  }
}

/** "…Respondida às 14:32 pelo Rise." / "Ignorada no Rise." / "Respondida fora do Rise." */
function estadoEmTexto(linha) {
  if (linha.status === "IGNORADA") return "Ignorada no Rise.";
  if (linha.status === "FECHADA_FORA") return "Respondida fora do Rise.";
  if (linha.status === "RESPONDIDA") return `Respondida às ${horaDeSaoPaulo(linha.respondidaEm ?? new Date())} ${VIA[linha.respondidaVia] ?? ""}.`.replace(" .", ".");
  return null;
}

/** Edita uma mensagem do bot sem saber se ela tem foto: tenta o texto e, se o Telegram disser que nao ha texto, a legenda. */
async function editar(bot, chatId, mensagemId, texto) {
  const comoTexto = await bot.editarMensagem(chatId, mensagemId, { texto, botoes: [] });
  if (comoTexto.ok || !/no text in the message|message can't be edited/i.test(comoTexto.erro ?? "")) return comoTexto;
  return bot.editarMensagem(chatId, mensagemId, { texto, botoes: [], comFoto: true });
}

/**
 * A pergunta saiu de ABERTA (respondida, ignorada ou fechada fora do Rise): o aviso do Telegram e editado com o estado e
 * perde os botoes. Nunca lanca; sem aviso mandado, sem bot ou com a pergunta ainda aberta, nao faz nada.
 */
export async function atualizarAvisoFechado(id, { cliente = null } = {}) {
  try {
    const linha = await lerAtendimento(id);
    const estado = linha ? estadoEmTexto(linha) : null;
    if (!estado || !linha.telegramChatId || !linha.telegramMensagemId) return { ok: false };
    const bot = cliente ?? (await clienteDoBotCadastrado());
    if (!bot) return { ok: false };
    return await editar(bot, linha.telegramChatId, linha.telegramMensagemId, `${corpoDoAviso(linha)}\n\n${estado}`);
  } catch (erro) {
    console.error("[atendimentoML] aviso do Telegram nao editado:", String(erro?.message ?? erro).slice(0, 200));
    return { ok: false };
  }
}

/** O rascunho dentro de um bloco `code` (o Telegram copia com um toque), depois de uma linha de titulo. */
function comRascunho(titulo, rascunho, rodape = "") {
  const inicio = `${titulo}\n`;
  const texto = `${inicio}${rascunho}${rodape ? `\n\n${rodape}` : ""}`;
  // O `offset` e o `length` das entidades contam em unidades UTF-16, a mesma conta do `length` do JavaScript.
  return { texto, entidades: [{ type: "code", offset: inicio.length, length: rascunho.length }] };
}

/**
 * Os tratadores que a escuta do bot chama (`rodarEntradaDoTelegram`): so chegam aqui cliques e textos de um chat que pode
 * responder. `sugestao` leva o provedor e a configuracao falsos do teste.
 *
 * @param {{ ml?: object, env?: object, sugestao?: { criarProvedor?: Function, configuracao?: object } }} dependencias
 */
export function criarTratadoresDoAtendimento({ ml = null, env = process.env, sugestao = {} } = {}) {
  const mercadoLivre = () => ml ?? clienteML();

  async function mostrarRascunho(cliente, chatId, id, titulo, rascunho, barrados) {
    if (barrados.length) {
      const montada = comRascunho(`${titulo} (não pode sair assim)`, rascunho, neutralizar(barrados.map(textoDoBarrado).join("\n")));
      return cliente.enviarComBotoes(chatId, montada.texto, { entidades: montada.entidades, botoes: [[botao("Escrever / Editar", id, "e")]] });
    }
    const montada = comRascunho(titulo, rascunho);
    const botoes = titulo.startsWith("Sugestão") ? [[botao("Enviar ao ML", id, "v"), botao("Escrever / Editar", id, "e")], [botao("Ignorar", id, "i")]] : [[botao("Enviar ao ML", id, "v"), botao("Escrever / Editar", id, "e")]];
    return cliente.enviarComBotoes(chatId, montada.texto, { entidades: montada.entidades, botoes });
  }

  async function clique(evento, { cliente, chatId }) {
    const casou = DADOS.exec(String(evento?.data ?? ""));
    if (!casou) return void (await cliente.responderAoClique(evento.id, "Botão desconhecido."));
    const [, id, acao] = casou;
    const linha = await prisma.atendimentoML.findUnique({ where: { id }, select: { id: true, status: true, tipo: true, rascunho: true, textoDoCliente: true, telegramChatId: true } });
    if (!linha || linha.tipo !== "PERGUNTA") return void (await cliente.responderAoClique(evento.id, "Pergunta não encontrada."));
    if (linha.status !== "ABERTA") {
      await cliente.responderAoClique(evento.id, "Esta pergunta não está mais aberta.");
      return void (await atualizarAvisoFechado(id, { cliente }));
    }
    const por = (await loginDoChat(chatId, { env })) ?? "telegram";

    if (acao === "s") {
      await cliente.responderAoClique(evento.id, "Pedindo a sugestão…");
      const resultado = await sugerirResposta(id, { por, ml: mercadoLivre(), ...sugestao });
      if (!resultado.ok) return void (await cliente.enviarComBotoes(chatId, neutralizar(resultado.mensagem), { botoes: [[botao("Escrever / Editar", id, "e")]] }));
      return void (await mostrarRascunho(cliente, chatId, id, "Sugestão da IA:", resultado.texto, resultado.barrados));
    }

    if (acao === "e") {
      await cliente.responderAoClique(evento.id);
      // O rascunho que ja existe vai antes, num bloco que copia com um toque: o dono cola e ajusta.
      if (linha.rascunho) {
        const atual = comRascunho("Rascunho atual (toque para copiar):", linha.rascunho);
        await cliente.enviarComBotoes(chatId, atual.texto, { entidades: atual.entidades });
      }
      const pedido = await cliente.enviarComBotoes(chatId, `Escreva a resposta para esta pergunta:\n“${trechoSeguro(linha.textoDoCliente, 200)}”`, { forcarResposta: true, dica: "Sua resposta" });
      if (pedido.ok && pedido.dados?.message_id) {
        await prisma.atendimentoML.updateMany({ where: { id, status: "ABERTA" }, data: { telegramPedidoId: pedido.dados.message_id, ...(linha.telegramChatId ? {} : { telegramChatId: chatId }) } });
      }
      return;
    }

    if (acao === "v") {
      const envio = await enviarResposta({ id, por, via: "TELEGRAM", ml: mercadoLivre(), env });
      if (!envio.ok) {
        await cliente.responderAoClique(evento.id, envio.mensagem);
        if (envio.motivo === "fechada-fora") await atualizarAvisoFechado(id, { cliente });
        return;
      }
      await cliente.responderAoClique(evento.id, "Enviada ao Mercado Livre.");
      // A mensagem em que ele clicou (a sugestao ou a previa) tambem perde os botoes.
      const clicada = evento.message;
      if (clicada?.message_id && clicada.message_id !== (await lerAtendimento(id))?.telegramMensagemId) {
        await editar(cliente, chatId, clicada.message_id, `${String(clicada.text ?? clicada.caption ?? "").slice(0, 3900)}\n\nEnviada ao Mercado Livre às ${horaDeSaoPaulo(new Date())}.`);
      }
      return void (await atualizarAvisoFechado(id, { cliente }));
    }

    // acao === "i"
    const feito = await ignorarAtendimento({ id, por });
    await cliente.responderAoClique(evento.id, feito.ok ? "Ignorada." : "Esta pergunta não está mais aberta.");
    await atualizarAvisoFechado(id, { cliente });
  }

  async function texto(mensagem, { cliente, chatId }) {
    const respondeA = mensagem?.reply_to_message?.message_id;
    const linha = Number.isInteger(respondeA) ? await prisma.atendimentoML.findFirst({ where: { tipo: "PERGUNTA", status: "ABERTA", telegramPedidoId: respondeA, OR: [{ telegramChatId: chatId }, { telegramChatId: null }] }, select: { id: true } }) : null;
    // Texto solto, ou resposta a outra mensagem: nunca e comando. Uma linha de dica e nada no banco.
    if (!linha) return void (await cliente.enviarComBotoes(chatId, DICA));
    const por = (await loginDoChat(chatId, { env })) ?? "telegram";
    const salvo = await salvarRascunho({ id: linha.id, texto: String(mensagem.text ?? ""), origem: "DONO", por });
    if (salvo.motivo === "nao-aberta") return void (await cliente.enviarComBotoes(chatId, "Esta pergunta não está mais aberta."));
    await prisma.atendimentoML.updateMany({ where: { id: linha.id, telegramPedidoId: respondeA }, data: { telegramPedidoId: null } });
    await mostrarRascunho(cliente, chatId, linha.id, "Vai ficar assim:", String(mensagem.text ?? "").trim(), salvo.barrados);
  }

  return { clique, texto };
}

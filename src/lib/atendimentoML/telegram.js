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
import { LIMITE_PADRAO_DE_MENSAGEM, textoDoBloqueio } from "./posVenda";
import { destinatarioEmTexto, etapaEmTexto, LIMITE_DA_RECLAMACAO, textoDoBloqueioDaReclamacao } from "./reclamacoes";
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

// O tipo de aviso (o interruptor da aba Canais) e o cabecalho de cada tipo de atendimento. Fase 2: a mensagem de pos-venda.
// Fase 3: a reclamacao usa o interruptor `reclamacaoML` que ja existia (o aviso antigo, sem botoes, deixa de sair para a
// reclamacao que tem conversa aqui: ver `reclamacoesAbertas` em `lib/telegram/avisos.js`). A chave nao pode comecar por
// "reclamacao-ml:", que e a do aviso antigo.
const TIPO_DO_AVISO = { PERGUNTA: "perguntaML", POS_VENDA: "mensagemML", RECLAMACAO: "reclamacaoML" };
const PREFIXO_DA_CHAVE = { PERGUNTA: "pergunta-ml", POS_VENDA: "mensagem-ml", RECLAMACAO: "reclamacao-conversa" };
const ABA = { PERGUNTA: "/atendimento", POS_VENDA: "/atendimento?tipo=mensagens", RECLAMACAO: "/atendimento?tipo=reclamacoes" };
const NAO_ABERTA = { PERGUNTA: "Esta pergunta não está mais aberta.", POS_VENDA: "Esta mensagem não está mais aberta.", RECLAMACAO: "Esta reclamação não está mais aberta." };
const CABECALHO_DA_RECLAMACAO = "Reclamação no Mercado Livre";
/// O limite de caracteres de uma linha de conversa (pos-venda: o que o ML informou; reclamacao: o teto do Rise).
const limiteDaConversa = (linha) => (linha.tipo === "RECLAMACAO" ? LIMITE_DA_RECLAMACAO : (linha.limite ?? LIMITE_PADRAO_DE_MENSAGEM));
const bloqueioEmTexto = (linha) => (linha.tipo === "RECLAMACAO" ? textoDoBloqueioDaReclamacao(linha.bloqueio) : textoDoBloqueio(linha.bloqueio));
const CABECALHO = "Pergunta no Mercado Livre";
const CABECALHO_DA_MENSAGEM = "Mensagem de comprador no Mercado Livre";
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
  if (linha.tipo === "RECLAMACAO") {
    // O pedido, o motivo, a reputacao, a etapa e para quem a mensagem vai. Nenhum dado do comprador.
    const numero = linha.pedido?.numero ? `Pedido ${trechoSeguro(linha.pedido.numero, 30)}` : `Reclamação ${trechoSeguro(linha.idExterno ?? "", 30)}`;
    const item = linha.pedido?.primeiroItem ? `: ${trechoSeguro(linha.pedido.primeiroItem, 80)}${linha.pedido.itens > 1 ? ` e mais ${linha.pedido.itens - 1}` : ""}` : linha.pedido ? "" : " (venda fora do Rise)";
    const motivo = linha.reclamacao?.motivoNome ? [`Motivo: ${trechoSeguro(linha.reclamacao.motivoNome, 120)}${linha.reclamacao.afetaReputacao === true ? " (afeta a reputação)" : ""}`] : [];
    const destino = destinatarioEmTexto(linha.destinatario);
    const bloqueio = textoDoBloqueioDaReclamacao(linha.bloqueio);
    return [CABECALHO_DA_RECLAMACAO, `${numero}${item}`, ...motivo, `${etapaEmTexto(linha.etapa)}${destino ? `: a mensagem vai para o ${destino}` : ""}`, `“${trechoSeguro(linha.textoDoCliente, 600)}”`, ...(bloqueio ? [bloqueio] : [])].join("\n");
  }
  if (linha.tipo === "POS_VENDA") {
    // So o que o dono precisa para reconhecer a venda: o numero do pedido e o item. Nenhum dado do comprador.
    const numero = trechoSeguro(linha.pedido?.numero ?? linha.idExterno ?? "", 30);
    const item = linha.pedido?.primeiroItem ? `: ${trechoSeguro(linha.pedido.primeiroItem, 80)}${linha.pedido.itens > 1 ? ` e mais ${linha.pedido.itens - 1}` : ""}` : " (fora do Rise)";
    const bloqueio = textoDoBloqueio(linha.bloqueio);
    return [CABECALHO_DA_MENSAGEM, `Pedido ${numero}${item}`, `“${trechoSeguro(linha.textoDoCliente, 600)}”`, ...(bloqueio ? [bloqueio] : [])].join("\n");
  }
  const kit = Number(linha.anuncio?.unidadesDoKit) > 1 ? ` (Kit de ${linha.anuncio.unidadesDoKit})` : "";
  const anuncio = linha.anuncio?.titulo ? `${trechoSeguro(linha.anuncio.titulo, 90)}${kit}` : `Anúncio ${trechoSeguro(linha.itemId ?? "", 20)} (fora do Rise)`;
  return [CABECALHO, anuncio, `“${trechoSeguro(linha.textoDoCliente, 600)}”`].join("\n");
}

function botoesDoAviso(id, urlPublica, linha = null) {
  const link = linkAbrirNoRise(urlPublica, ABA[linha?.tipo] ?? ABA.PERGUNTA);
  // Conversa que o ML bloqueou: nao ha o que responder, so tirar das abertas ou abrir no Rise.
  if (linha?.bloqueio) return [[botao("Ignorar", id, "i"), ...(link ? [{ texto: "Abrir no Rise", url: link }] : [])]];
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
    // Cada tipo de atendimento tem o seu interruptor na aba Canais (pergunta e mensagem de pos-venda).
    const tiposLigados = Object.keys(TIPO_DO_AVISO).filter((tipo) => config.telegram?.avisos?.[TIPO_DO_AVISO[tipo]]);
    if (!config.telegram?.ligado || tiposLigados.length === 0) return { ok: true, mandados: 0, falhas: 0, motivo: "desligado" };
    const abertas = await prisma.atendimentoML.findMany({
      where: { tipo: { in: tiposLigados }, status: "ABERTA", recebidaEm: { gte: new Date(agora - TRES_DIAS_MS) }, ...(soPrefixo ? { idExterno: { startsWith: soPrefixo } } : {}) },
      orderBy: { recebidaEm: "asc" },
      select: { id: true, tipo: true, ultimaDoClienteId: true },
    });
    // A chave do aviso. Na conversa de pos-venda entra a ultima mensagem do comprador: mensagem nova (com a conversa
    // aberta, ou reabrindo a linha) e aviso novo.
    const chaveDe = (aberta, chat) => (aberta.tipo === "PERGUNTA" ? `${PREFIXO_DA_CHAVE.PERGUNTA}:${aberta.id}:${chat}` : `${PREFIXO_DA_CHAVE[aberta.tipo]}:${aberta.id}:${aberta.ultimaDoClienteId ?? ""}:${chat}`);
    if (abertas.length === 0) return { ok: true, mandados: 0, falhas: 0 };
    const chats = [...(autorizados ? await autorizados() : await chatsAutorizados({ env }))].sort();
    if (chats.length === 0) return { ok: true, mandados: 0, falhas: 0, motivo: "sem-destinatario" };
    const bot = cliente ?? (await clienteDoBotCadastrado());
    if (!bot) return { ok: true, mandados: 0, falhas: 0, motivo: "sem-token" };

    // A linha de `AvisoTelegram` so nasce quando a mensagem SAIU (ou quando o chat bloqueou o bot): a rotina comum dos
    // avisos reenvia toda linha pendente como texto simples, e a pergunta sem os botoes nao serviria. O que falhou
    // fica sem linha e tenta de novo na volta seguinte.
    const jaTratados = await prisma.avisoTelegram.findMany({ where: { tipo: { in: Object.values(TIPO_DO_AVISO) }, chave: { in: abertas.flatMap((a) => chats.map((chat) => chaveDe(a, chat))) } }, select: { chave: true } });
    const tratadas = new Set(jaTratados.map((aviso) => aviso.chave));
    let mandados = 0;
    let falhas = 0;
    for (const aberta of abertas) {
      const { id } = aberta;
      const TIPO = TIPO_DO_AVISO[aberta.tipo];
      for (const chatId of chats) {
        if (mandados + falhas >= MAXIMO_POR_VOLTA) return { ok: true, mandados, falhas };
        const chave = chaveDe(aberta, chatId);
        if (tratadas.has(chave)) continue;
        const linha = await lerAtendimento(id);
        if (!linha || linha.status !== "ABERTA") continue;
        const texto = corpoDoAviso(linha);
        const botoes = botoesDoAviso(id, urlPublica, linha);
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

  async function mostrarRascunho(cliente, chatId, id, titulo, rascunho, barrados, rodape = "") {
    if (barrados.length) {
      const montada = comRascunho(`${titulo} (não pode sair assim)`, rascunho, neutralizar(barrados.map(textoDoBarrado).join("\n")));
      return cliente.enviarComBotoes(chatId, montada.texto, { entidades: montada.entidades, botoes: [[botao("Escrever / Editar", id, "e")]] });
    }
    const montada = comRascunho(titulo, rascunho, rodape);
    const botoes = titulo.startsWith("Sugestão") ? [[botao("Enviar ao ML", id, "v"), botao("Escrever / Editar", id, "e")], [botao("Ignorar", id, "i")]] : [[botao("Enviar ao ML", id, "v"), botao("Escrever / Editar", id, "e")]];
    return cliente.enviarComBotoes(chatId, montada.texto, { entidades: montada.entidades, botoes });
  }

  async function clique(evento, { cliente, chatId }) {
    const casou = DADOS.exec(String(evento?.data ?? ""));
    if (!casou) return void (await cliente.responderAoClique(evento.id, "Botão desconhecido."));
    const [, id, acao] = casou;
    const linha = await prisma.atendimentoML.findUnique({ where: { id }, select: { id: true, status: true, tipo: true, rascunho: true, textoDoCliente: true, telegramChatId: true, bloqueio: true, limite: true, destinatario: true } });
    if (!linha || !TIPO_DO_AVISO[linha.tipo]) return void (await cliente.responderAoClique(evento.id, "Pergunta não encontrada."));
    // "Conversa": a mensagem de pos-venda e a reclamacao (tem limite proprio e pode estar bloqueada pelo ML).
    const posVenda = linha.tipo !== "PERGUNTA";
    const reclamacao = linha.tipo === "RECLAMACAO";
    if (linha.status !== "ABERTA") {
      await cliente.responderAoClique(evento.id, NAO_ABERTA[linha.tipo]);
      return void (await atualizarAvisoFechado(id, { cliente }));
    }
    // Conversa bloqueada pelo ML: o aviso nem traz estes botoes; um clique antigo ou forjado so recebe o motivo.
    if (posVenda && linha.bloqueio && acao !== "i") return void (await cliente.responderAoClique(evento.id, bloqueioEmTexto(linha)));
    // Na mensagem de pos-venda a previa diz o tamanho contra o limite do ML (350): no celular nao ha contador.
    const medida = (texto) => (posVenda ? ` (${String(texto ?? "").length} de ${limiteDaConversa(linha)})` : "");
    const por = (await loginDoChat(chatId, { env })) ?? "telegram";

    if (acao === "s") {
      await cliente.responderAoClique(evento.id, "Pedindo a sugestão…");
      const resultado = await sugerirResposta(id, { por, ml: mercadoLivre(), ...sugestao });
      if (!resultado.ok) return void (await cliente.enviarComBotoes(chatId, neutralizar(resultado.mensagem), { botoes: [[botao("Escrever / Editar", id, "e")]] }));
      // Na reclamacao a sugestao sai com o lembrete: o mediador do ML le a mensagem.
      return void (await mostrarRascunho(cliente, chatId, id, `Sugestão da IA${medida(resultado.texto)}:`, resultado.texto, resultado.barrados, resultado.lembrete ?? ""));
    }

    if (acao === "e") {
      await cliente.responderAoClique(evento.id);
      // O rascunho que ja existe vai antes, num bloco que copia com um toque: o dono cola e ajusta.
      if (linha.rascunho) {
        const atual = comRascunho("Rascunho atual (toque para copiar):", linha.rascunho);
        await cliente.enviarComBotoes(chatId, atual.texto, { entidades: atual.entidades });
      }
      const oQue = reclamacao ? `Escreva a mensagem desta reclamação${destinatarioEmTexto(linha.destinatario) ? `, para o ${destinatarioEmTexto(linha.destinatario)}` : ""} (até ${limiteDaConversa(linha)} caracteres)` : `Escreva a resposta para esta ${posVenda ? `mensagem (até ${limiteDaConversa(linha)} caracteres)` : "pergunta"}`;
      const pedido = await cliente.enviarComBotoes(chatId, `${oQue}:\n“${trechoSeguro(linha.textoDoCliente, 200)}”`, { forcarResposta: true, dica: "Sua resposta" });
      if (pedido.ok && pedido.dados?.message_id) {
        await prisma.atendimentoML.updateMany({ where: { id, status: "ABERTA" }, data: { telegramPedidoId: pedido.dados.message_id, ...(linha.telegramChatId ? {} : { telegramChatId: chatId }) } });
      }
      return;
    }

    if (acao === "v") {
      const envio = await enviarResposta({ id, por, via: "TELEGRAM", ml: mercadoLivre(), env });
      if (!envio.ok) {
        await cliente.responderAoClique(evento.id, envio.mensagem);
        if (envio.motivo === "fechada-fora" || envio.motivo === "fechada") await atualizarAvisoFechado(id, { cliente });
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
    const feito = await ignorarAtendimento({ id, por, ml: mercadoLivre() });
    await cliente.responderAoClique(evento.id, feito.ok ? "Ignorada." : NAO_ABERTA[linha.tipo]);
    await atualizarAvisoFechado(id, { cliente });
  }

  async function texto(mensagem, { cliente, chatId }) {
    const respondeA = mensagem?.reply_to_message?.message_id;
    const linha = Number.isInteger(respondeA) ? await prisma.atendimentoML.findFirst({ where: { tipo: { in: Object.keys(TIPO_DO_AVISO) }, status: "ABERTA", telegramPedidoId: respondeA, OR: [{ telegramChatId: chatId }, { telegramChatId: null }] }, select: { id: true, tipo: true, limite: true } }) : null;
    // Texto solto, ou resposta a outra mensagem: nunca e comando. Uma linha de dica e nada no banco.
    if (!linha) return void (await cliente.enviarComBotoes(chatId, DICA));
    const por = (await loginDoChat(chatId, { env })) ?? "telegram";
    const salvo = await salvarRascunho({ id: linha.id, texto: String(mensagem.text ?? ""), origem: "DONO", por });
    const posVenda = linha.tipo !== "PERGUNTA";
    if (salvo.motivo === "nao-aberta") return void (await cliente.enviarComBotoes(chatId, NAO_ABERTA[linha.tipo]));
    await prisma.atendimentoML.updateMany({ where: { id: linha.id, telegramPedidoId: respondeA }, data: { telegramPedidoId: null } });
    const escrito = String(mensagem.text ?? "").trim();
    await mostrarRascunho(cliente, chatId, linha.id, posVenda ? `Vai ficar assim (${escrito.length} de ${limiteDaConversa(linha)}):` : "Vai ficar assim:", escrito, salvo.barrados);
  }

  return { clique, texto };
}

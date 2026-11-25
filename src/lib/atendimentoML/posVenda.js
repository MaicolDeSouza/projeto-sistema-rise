import { prisma } from "@/lib/db";
import { registrarAuditoria } from "@/lib/acessos/banco";
import { clienteML } from "@/lib/canaisDeVenda/ml/cliente";

import { filtrarResposta, textoDoBarrado } from "./filtro";

/**
 * As MENSAGENS DE POS-VENDA do Mercado Livre (Atendimento do ML, fase 2; plano
 * docs/superpowers/plans/2026-11-24-atendimento-ml-fase-2-pos-venda.md). Uma linha de `AtendimentoML` (`tipo: POS_VENDA`)
 * por conversa: o `idExterno` e o pack do ML (ou o pedido, quando a venda nao tem pack).
 *
 * O Rise so RESPONDE a quem ja escreveu: a linha nasce com mensagem do comprador e nunca por iniciativa da loja.
 * A conversa chega pela notificacao `messages`, pelas nao lidas e pela releitura das abertas (`rodarPosVendaML`), e os
 * tres acabam em `aplicarConversaLida`. O retrato da conversa fica na linha (`conversa`), para a lista, o Telegram e o MCP
 * nao dependerem do ML na hora.
 *
 * Formato medido na conta em 24/11/2026: `messages[]` vem da mais NOVA para a mais antiga, 10 por pagina;
 * `conversation_status { status: "active" | "blocked", substatus, claim_ids }`; `seller_max_message_length` 350.
 * Toda leitura vai com `mark_as_read=false`; so `marcarConversaComoLida` (depois de responder ou ignorar) marca.
 */

export const LIMITE_PADRAO_DE_MENSAGEM = 350;
export const TEXTO_DA_TRAVA_DE_MENSAGENS = "Envio desligado na VPS (ML_RESPONDER_MENSAGENS).";

const POR_PAGINA_DO_ML = 10;
/// Teto do retrato: conversa maior guarda as mais novas e a tela avisa ("conversa longa").
const MAXIMO_DE_MENSAGENS = 50;
/// Quantas ABERTAS do banco a rotina rele por volta.
const MAXIMO_DE_RELEITURAS = 50;
/// Uma trava de envio mais velha que isto e de um processo que morreu no meio: tratada como solta.
const TRAVA_VELHA_MS = 2 * 60 * 1000;

const BLOQUEIOS = {
  blocked_by_cancelled_order: "O pedido foi cancelado: o Mercado Livre não aceita mais mensagens nesta conversa.",
  blocked_by_mediation: "O pedido está em reclamação: a conversa segue pela reclamação, no Mercado Livre.",
  blocked_by_claim: "O pedido está em reclamação: a conversa segue pela reclamação, no Mercado Livre.",
  blocked_by_fulfillment: "Compra do Full ainda não entregue: o Mercado Livre só libera a conversa depois da entrega.",
  blocked_by_time: "O prazo desta conversa acabou: o Mercado Livre não aceita mais mensagens.",
  blocked_by_closed_order: "O pedido foi encerrado: o Mercado Livre não aceita mais mensagens nesta conversa.",
  blocked_by_conversation_initiated_by_seller_limited: "O comprador ainda não escreveu: o Rise só responde a quem já mandou mensagem.",
  blocked_by_buyer: "O comprador bloqueou a conversa.",
  blocked: "O Mercado Livre bloqueou esta conversa.",
};

/** A frase que a tela, o bot e o MCP mostram no lugar do envio. `null` quando a conversa pode ser respondida. */
export function textoDoBloqueio(bloqueio) {
  if (!bloqueio) return null;
  return BLOQUEIOS[bloqueio] ?? `O Mercado Livre bloqueou esta conversa (${String(bloqueio).slice(0, 80)}).`;
}

const data = (valor) => {
  const d = valor ? new Date(valor) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/**
 * O retrato de uma conversa lida do ML. Mensagens da mais antiga para a mais nova; `de` e "V" (a loja) ou "C" (o
 * comprador). Mensagem so com anexo vira "[anexo]" e a retida pela moderacao do ML vira "[mensagem retida pelo ML]":
 * o texto dela nao e mostrado nem vai a IA.
 */
export function resumirConversa(dados, vendedorId) {
  const vendedor = String(vendedorId ?? "");
  const mensagens = (Array.isArray(dados?.messages) ? dados.messages : [])
    .map((m) => {
      const anexos = Array.isArray(m?.message_attachments) ? m.message_attachments.length : 0;
      const moderacao = m?.message_moderation?.status ?? null;
      const retida = Boolean(moderacao) && moderacao !== "clean";
      const cru = String(m?.text ?? "").trim();
      const texto = retida ? "[mensagem retida pelo ML]" : cru || (anexos > 0 ? "[anexo]" : "");
      const de = String(m?.from?.user_id ?? "") === vendedor ? "V" : "C";
      return { id: String(m?.id ?? ""), de, texto: texto.slice(0, 4000), em: (data(m?.message_date?.created) ?? data(m?.message_date?.received))?.toISOString() ?? null, anexos: retida ? 0 : anexos, retida, quem: String((de === "V" ? m?.to?.user_id : m?.from?.user_id) ?? "") };
    })
    .filter((m) => m.id && m.texto)
    .sort((a, b) => String(a.em ?? "").localeCompare(String(b.em ?? "")))
    .slice(-MAXIMO_DE_MENSAGENS);

  const ultimaDoCliente = mensagens.filter((m) => m.de === "C").at(-1) ?? null;
  const compradorId = mensagens.map((m) => m.quem).filter(Boolean).at(-1) ?? null;
  const situacao = dados?.conversation_status ?? {};
  const ativa = situacao.status === "active";
  const total = Number(dados?.paging?.total ?? mensagens.length);
  return {
    mensagens: mensagens.map((m) => ({ id: m.id, de: m.de, texto: m.texto, em: m.em, anexos: m.anexos, retida: m.retida })),
    compradorId,
    ultimaDoCliente: ultimaDoCliente ? { id: ultimaDoCliente.id, texto: ultimaDoCliente.texto, em: ultimaDoCliente.em } : null,
    aguardaResposta: mensagens.at(-1)?.de === "C",
    situacao: String(situacao.status ?? ""),
    bloqueio: ativa ? null : String(situacao.substatus ?? situacao.status ?? "blocked"),
    emReclamacao: Array.isArray(situacao.claim_ids) && situacao.claim_ids.length > 0,
    limite: Number.isInteger(dados?.seller_max_message_length) && dados.seller_max_message_length > 0 ? dados.seller_max_message_length : LIMITE_PADRAO_DE_MENSAGEM,
    longa: total > mensagens.length,
  };
}

/**
 * Le a conversa de um pack (todas as paginas, ate `MAXIMO_DE_MENSAGENS`), SEM marcar como lida. Devolve o corpo do ML com
 * `messages` juntas, ou `null` quando o ML nao tem a conversa (404). Lanca nos outros erros.
 */
export async function lerConversaDoML(ml, idExterno, { vendedorId = null } = {}) {
  const vendedor = vendedorId ?? (await ml.usuarioId());
  const caminho = `/messages/packs/${idExterno}/sellers/${vendedor}`;
  let primeira = null;
  const mensagens = [];
  for (let offset = 0; offset < MAXIMO_DE_MENSAGENS; offset += POR_PAGINA_DO_ML) {
    const resposta = await ml.get(caminho, { tag: "post_sale", mark_as_read: "false", limit: POR_PAGINA_DO_ML, offset });
    if (resposta?.status === 404) return null;
    if (!resposta?.ok) throw new Error(`o Mercado Livre respondeu ${resposta?.status ?? "erro"} em GET ${caminho}`);
    primeira ??= resposta.dados ?? {};
    const pagina = Array.isArray(resposta.dados?.messages) ? resposta.dados.messages : [];
    mensagens.push(...pagina);
    if (pagina.length < POR_PAGINA_DO_ML || mensagens.length >= Number(resposta.dados?.paging?.total ?? 0)) break;
  }
  return { ...primeira, messages: mensagens };
}

/** Marca a conversa como lida no ML (a leitura sem `mark_as_read=false`). Nunca lanca: so o log sabe da falha. */
export async function marcarConversaComoLida(ml, idExterno) {
  try {
    const resposta = await ml.get(`/messages/packs/${idExterno}/sellers/${await ml.usuarioId()}`, { tag: "post_sale", limit: 1 });
    return Boolean(resposta?.ok);
  } catch (erro) {
    console.error("[atendimentoML] nao marcou a conversa como lida:", String(erro?.message ?? erro).slice(0, 200));
    return false;
  }
}

/** O PedidoDeVenda do Rise para um pack (ou pedido) do ML; `null` quando o Rise nao o tem. */
async function pedidoDoPack(idExterno) {
  const pedido = await prisma.pedidoDeVenda.findFirst({ where: { origem: "MERCADO_LIVRE", OR: [{ packId: String(idExterno) }, { idExterno: String(idExterno) }] }, orderBy: { criadoEm: "asc" }, select: { id: true } });
  return pedido?.id ?? null;
}

/**
 * Grava (ou atualiza) a conversa lida. So a conversa cuja ULTIMA mensagem e do comprador cria linha. Linha ABERTA cuja
 * ultima mensagem passou a ser da loja (respondida pelo app do ML) vira FECHADA_FORA. Linha respondida, ignorada ou
 * fechada em que o comprador escreveu DE NOVO reabre limpa (sem rascunho, sem erro e sem o aviso antigo do Telegram, para
 * sair outro). Linha ABERTA com mensagem mais nova do comprador atualiza o texto e pede aviso novo, mantendo o rascunho.
 *
 * @returns {Promise<{ id: string | null, criada: boolean, reabriu: boolean, fechou: boolean, atualizou: boolean, status: string | null }>}
 */
export async function aplicarConversaLida(idExterno, dados, { vendedorId, agora = new Date() } = {}) {
  const nada = { id: null, criada: false, reabriu: false, fechou: false, atualizou: false, status: null };
  const pack = String(idExterno ?? "");
  if (!pack) return nada;
  const resumo = resumirConversa(dados, vendedorId);
  const chave = { tipo_idExterno: { tipo: "POS_VENDA", idExterno: pack } };
  const existente = await prisma.atendimentoML.findUnique({ where: chave, select: { id: true, status: true, ultimaDoClienteId: true } });

  const retrato = {
    conversa: { mensagens: resumo.mensagens, compradorId: resumo.compradorId, emReclamacao: resumo.emReclamacao, longa: resumo.longa },
    bloqueio: resumo.bloqueio,
    limite: resumo.limite,
    situacaoNoML: resumo.situacao || "desconhecida",
  };
  const doCliente = resumo.ultimaDoCliente ? { textoDoCliente: resumo.ultimaDoCliente.texto, recebidaEm: data(resumo.ultimaDoCliente.em) ?? new Date(agora), ultimaDoClienteId: resumo.ultimaDoCliente.id } : {};

  if (!existente) {
    if (!resumo.aguardaResposta || !resumo.ultimaDoCliente) return nada;
    try {
      const criada = await prisma.atendimentoML.create({ data: { tipo: "POS_VENDA", idExterno: pack, pedidoId: await pedidoDoPack(pack), ...retrato, ...doCliente }, select: { id: true } });
      return { ...nada, id: criada.id, criada: true, status: "ABERTA" };
    } catch (erro) {
      // A notificacao e a rotina leram a mesma conversa ao mesmo tempo: a outra ja gravou.
      if (erro?.code !== "P2002") throw erro;
      const outra = await prisma.atendimentoML.findUnique({ where: chave, select: { id: true, status: true } });
      return { ...nada, id: outra?.id ?? null, status: outra?.status ?? null };
    }
  }

  const mensagemNova = Boolean(resumo.ultimaDoCliente) && resumo.ultimaDoCliente.id !== existente.ultimaDoClienteId;
  const semAvisoAntigo = { telegramChatId: null, telegramMensagemId: null, telegramPedidoId: null };

  if (existente.status === "ABERTA") {
    if (!resumo.aguardaResposta) {
      const daLoja = resumo.mensagens.at(-1);
      const fechou = await prisma.atendimentoML.updateMany({
        where: { id: existente.id, status: "ABERTA" },
        data: { ...retrato, status: "FECHADA_FORA", respondidaVia: "ML", respostaEnviada: daLoja?.de === "V" ? daLoja.texto : null, respondidaEm: data(daLoja?.em) ?? new Date(agora), enviandoDesde: null },
      });
      return { ...nada, id: existente.id, fechou: fechou.count === 1, status: "FECHADA_FORA" };
    }
    await prisma.atendimentoML.updateMany({ where: { id: existente.id, status: "ABERTA" }, data: { ...retrato, ...doCliente, ...(mensagemNova ? semAvisoAntigo : {}) } });
    return { ...nada, id: existente.id, atualizou: mensagemNova, status: "ABERTA" };
  }

  // Respondida, ignorada ou fechada fora: so reabre com mensagem NOVA do comprador esperando resposta.
  if (mensagemNova && resumo.aguardaResposta) {
    await prisma.atendimentoML.update({
      where: { id: existente.id },
      data: { ...retrato, ...doCliente, ...semAvisoAntigo, status: "ABERTA", rascunho: null, rascunhoOrigem: null, rascunhoEm: null, erroDoEnvio: null, enviandoDesde: null, respostaEnviada: null, respondidaEm: null, respondidaPor: null, respondidaVia: null },
    });
    return { ...nada, id: existente.id, reabriu: true, status: "ABERTA" };
  }
  await prisma.atendimentoML.update({ where: { id: existente.id }, data: retrato });
  return { ...nada, id: existente.id, status: existente.status };
}

/** Le e aplica a conversa de um pack. `null` quando o ML nao tem a conversa. */
async function lerEAplicar(ml, pack, { vendedorId, agora }) {
  const dados = await lerConversaDoML(ml, pack, { vendedorId });
  return dados ? aplicarConversaLida(pack, dados, { vendedorId, agora }) : null;
}

/** O pack de um recurso do ML: "/packs/123/sellers/456", "packs/123" ou o proprio id. */
function packDoRecurso(recurso) {
  const texto = String(recurso ?? "");
  const casou = /packs\/([^/?]+)/.exec(texto);
  if (casou) return casou[1];
  return /^[\w-]+$/.test(texto) ? texto : null;
}

/** As conversas com mensagem nao lida (`GET /messages/unread`): a rede de seguranca da notificacao. Devolve os packs. */
export async function buscarNaoLidas(ml) {
  const resposta = await ml.get("/messages/unread", { role: "seller", tag: "post_sale" });
  if (!resposta?.ok) throw new Error(`o Mercado Livre respondeu ${resposta?.status ?? "erro"} na busca de mensagens nao lidas`);
  const itens = Array.isArray(resposta.dados?.results) ? resposta.dados.results : [];
  return [...new Set(itens.map((item) => packDoRecurso(item?.resource ?? item?.pack_id ?? item?.id)).filter(Boolean))];
}

/**
 * A notificacao do topico `messages`: o recurso e o id da mensagem. Le a mensagem, tira o pack de `message_resources` e
 * aplica a conversa. Mensagem que o ML nao tem, ou sem pack, nao faz nada (a rotina pega depois).
 */
export async function aplicarNotificacaoDeMensagem(ml, mensagemId, { agora = new Date() } = {}) {
  const nada = { id: null, criada: false, reabriu: false, fechou: false, atualizou: false, status: null };
  const resposta = await ml.get(`/messages/${mensagemId}`, { tag: "post_sale" });
  if (resposta?.status === 404) return nada;
  if (!resposta?.ok) throw new Error(`o Mercado Livre respondeu ${resposta?.status ?? "erro"} em GET /messages/${mensagemId}`);
  const mensagem = Array.isArray(resposta.dados?.messages) ? resposta.dados.messages[0] : resposta.dados;
  const recurso = (Array.isArray(mensagem?.message_resources) ? mensagem.message_resources : []).find((r) => r?.name === "packs");
  if (!recurso?.id) return nada;
  return (await lerEAplicar(ml, String(recurso.id), { vendedorId: await ml.usuarioId(), agora })) ?? nada;
}

/**
 * Uma volta das mensagens de pos-venda. Nunca lanca: `{ ok, lidas, novas, reabertas, fechadas, fechadasIds }` ou
 * `{ ok: false, erro }`. `soPrefixo` restringe as linhas do banco que ela rele (o teste).
 */
export async function rodarPosVendaML({ ml = clienteML(), agora = new Date(), soPrefixo = null } = {}) {
  try {
    const vendedorId = await ml.usuarioId();
    const packs = await buscarNaoLidas(ml);
    let novas = 0;
    let reabertas = 0;
    const fechadasIds = [];
    const contar = (aplicada) => {
      if (aplicada?.criada) novas++;
      if (aplicada?.reabriu) reabertas++;
      if (aplicada?.fechou) fechadasIds.push(aplicada.id);
    };
    for (const pack of packs) contar(await lerEAplicar(ml, pack, { vendedorId, agora }));

    // As ABERTAS que nao vieram nas nao lidas: e assim que a resposta dada pelo app do ML fecha a linha aqui.
    const vistas = new Set(packs);
    const abertas = await prisma.atendimentoML.findMany({
      where: { tipo: "POS_VENDA", status: "ABERTA", ...(soPrefixo ? { idExterno: { startsWith: soPrefixo } } : {}) },
      orderBy: { atualizadoEm: "asc" },
      select: { idExterno: true },
    });
    for (const linha of abertas.filter((a) => !vistas.has(a.idExterno)).slice(0, MAXIMO_DE_RELEITURAS)) contar(await lerEAplicar(ml, linha.idExterno, { vendedorId, agora }));
    return { ok: true, lidas: packs.length, novas, reabertas, fechadas: fechadasIds.length, fechadasIds };
  } catch (erro) {
    return { ok: false, erro: String(erro?.message ?? erro).slice(0, 300) };
  }
}

/** A trava do .env das mensagens, lida na hora. */
export function mensagemDePosVendaLiberada(env = process.env) {
  return String(env?.ML_RESPONDER_MENSAGENS ?? "").trim().toLowerCase() === "true";
}

const MENSAGEM = {
  "sem-rascunho": "Escreva a resposta antes de enviar.",
  trava: TEXTO_DA_TRAVA_DE_MENSAGENS,
  "ja-enviando": "Esta resposta já está sendo enviada.",
  "fechada-fora": "Esta mensagem já foi respondida fora do Rise.",
  "mensagem-nova": "O comprador mandou outra mensagem. Confira a conversa antes de enviar.",
};
const recusa = (motivo, extra = {}) => ({ ok: false, motivo, mensagem: MENSAGEM[motivo] ?? "Não foi possível enviar.", ...extra });

/**
 * O ENVIO UNICO da resposta de pos-venda (chamado por `enviarResposta`, que ja conferiu linha ABERTA). Ordem: filtro ->
 * trava `ML_RESPONDER_MENSAGENS` -> marca `enviandoDesde` (so quem marcou segue) -> rele a conversa (bloqueada, respondida
 * fora ou com mensagem nova do comprador: nada sai) -> `POST`, UMA tentativa -> RESPONDIDA -> marca como lida no ML.
 *
 * @returns {Promise<{ ok: true } | { ok: false, motivo: string, mensagem: string, barrados?: object[] }>}
 */
export async function enviarMensagemDePosVenda({ linha, por, via, ml = clienteML(), env = process.env, agora = new Date() }) {
  const texto = String(linha.rascunho ?? "").trim();
  if (!texto) return recusa("sem-rascunho");
  // A sugestao da IA de pos-venda nao leva link; o dono pode colar link do Mercado Livre.
  const filtro = filtrarResposta({ texto, origem: linha.rascunhoOrigem === "IA" ? "IA" : "DONO", linksDaTroca: [], limite: linha.limite ?? LIMITE_PADRAO_DE_MENSAGEM });
  if (!filtro.ok) return recusa("filtro", { mensagem: textoDoBarrado(filtro.barrados[0]), barrados: filtro.barrados });
  if (!mensagemDePosVendaLiberada(env)) return recusa("trava");

  const marcada = await prisma.atendimentoML.updateMany({
    where: { id: linha.id, status: "ABERTA", rascunho: linha.rascunho, OR: [{ enviandoDesde: null }, { enviandoDesde: { lt: new Date(agora.getTime() - TRAVA_VELHA_MS) } }] },
    data: { enviandoDesde: new Date(agora) },
  });
  if (marcada.count !== 1) return recusa("ja-enviando");
  const soltar = (erroDoEnvio = null) => prisma.atendimentoML.updateMany({ where: { id: linha.id, status: "ABERTA" }, data: { enviandoDesde: null, ...(erroDoEnvio ? { erroDoEnvio } : {}) } });

  try {
    const vendedorId = await ml.usuarioId();
    const dados = await lerConversaDoML(ml, linha.idExterno, { vendedorId });
    const resumo = resumirConversa(dados, vendedorId);
    if (resumo.bloqueio) {
      await soltar();
      await aplicarConversaLida(linha.idExterno, dados, { vendedorId, agora });
      return recusa("bloqueada", { mensagem: textoDoBloqueio(resumo.bloqueio) });
    }
    if (!resumo.aguardaResposta) {
      await aplicarConversaLida(linha.idExterno, dados, { vendedorId, agora });
      return recusa("fechada-fora");
    }
    if (resumo.ultimaDoCliente?.id !== linha.ultimaDoClienteId) {
      await soltar();
      await aplicarConversaLida(linha.idExterno, dados, { vendedorId, agora });
      return recusa("mensagem-nova");
    }
    if (texto.length > resumo.limite) {
      await soltar();
      return recusa("filtro", { mensagem: `A resposta passou do limite: ${texto.length} de ${resumo.limite} caracteres.` });
    }
    const resposta = await ml.post(`/messages/packs/${linha.idExterno}/sellers/${vendedorId}?tag=post_sale`, { from: { user_id: vendedorId }, to: { user_id: resumo.compradorId }, text: texto });
    if (!resposta?.ok) throw new Error(`o Mercado Livre respondeu ${resposta?.status ?? "erro"}${resposta?.dados?.message ? `: ${String(resposta.dados.message).slice(0, 200)}` : ""}`);
  } catch (erro) {
    const mensagem = String(erro?.message ?? erro).slice(0, 300);
    await soltar(mensagem);
    return recusa("ml", { mensagem: `O Mercado Livre não aceitou a mensagem: ${mensagem}` });
  }

  const enviadaEm = new Date(agora);
  await prisma.$transaction(async (tx) => {
    const atual = await tx.atendimentoML.findUnique({ where: { id: linha.id }, select: { conversa: true } });
    const conversa = atual?.conversa && typeof atual.conversa === "object" ? atual.conversa : {};
    const mensagens = [...(Array.isArray(conversa.mensagens) ? conversa.mensagens : []), { id: `rise-${enviadaEm.getTime()}`, de: "V", texto, em: enviadaEm.toISOString(), anexos: 0, retida: false }].slice(-MAXIMO_DE_MENSAGENS);
    await tx.atendimentoML.update({
      where: { id: linha.id },
      data: { status: "RESPONDIDA", conversa: { ...conversa, mensagens }, respostaEnviada: texto, respondidaEm: enviadaEm, respondidaPor: por ?? null, respondidaVia: via, enviandoDesde: null, erroDoEnvio: null },
    });
    // Sem o texto do comprador nem a resposta: so o que identifica o envio.
    await registrarAuditoria(tx, { quem: por ?? "desconhecido", oQue: "atendimentoML.responder", alvo: linha.id, depois: { tipo: linha.tipo, idExterno: linha.idExterno, via, caracteres: texto.length, origem: linha.rascunhoOrigem ?? null } });
  });
  await marcarConversaComoLida(ml, linha.idExterno);
  return { ok: true };
}

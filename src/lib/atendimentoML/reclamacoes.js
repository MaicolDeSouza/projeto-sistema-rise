import { prisma } from "@/lib/db";
import { registrarAuditoria } from "@/lib/acessos/banco";
import { clienteML } from "@/lib/canaisDeVenda/ml/cliente";

import { filtrarResposta, textoDoBarrado } from "./filtro";

/**
 * As MENSAGENS DAS RECLAMACOES do Mercado Livre (Atendimento do ML, fase 3; plano
 * docs/superpowers/plans/2026-11-25-atendimento-ml-fase-3-reclamacoes.md). Uma linha de `AtendimentoML`
 * (`tipo: RECLAMACAO`) por reclamacao do tipo `mediations`; o `idExterno` e o id da reclamacao no ML.
 *
 * SO MENSAGENS: reembolsar, abrir mediacao, aceitar devolucao e encerrar continuam no ML. A tabela `ReclamacaoML` e a
 * rotina `reclamacoesML` (motivo, reputacao, devolucao, "Em mediacao") nao mudam: a linha daqui so aponta para ela.
 *
 * Formato medido na conta em 25/11/2026: `GET /post-purchase/v1/claims/search` devolve cada reclamacao com `players[]` e
 * as `available_actions` do vendedor (`role: respondent`); `GET .../claims/{id}/messages` devolve uma LISTA solta, da mais
 * NOVA para a mais antiga, com `sender_role`/`receiver_role` (complainant | respondent | mediator), `message`, `stage`,
 * `attachments`, `message_moderation` e `hash` (o identificador; nao ha `id`); `GET .../claims/{id}/detail` devolve
 * `title`, `description`, `problem`, `due_date` e `action_responsible`. O ML nao informa limite de caracteres: o Rise usa
 * um teto proprio e mostra a recusa do ML como veio.
 *
 * Para quem a mensagem vai e o ML que diz, pela acao liberada: `send_message_to_complainant` (etapa claim) ou
 * `send_message_to_mediator` (etapa dispute). Sem acao de mensagem, nada e oferecido.
 */

export const LIMITE_DA_RECLAMACAO = 1000;
export const TEXTO_DA_TRAVA_DE_RECLAMACOES = "Envio desligado na VPS (ML_RESPONDER_RECLAMACOES).";

const POR_PAGINA = 50;
/// Freio da busca das abertas (a conta tinha 1 aberta em 25/11/2026): 4 paginas de 50.
const MAXIMO_DE_PAGINAS = 4;
const MAXIMO_DE_MENSAGENS = 50;
/// Quantas ABERTAS do banco a rotina rele por volta (as que sairam da busca: e assim que a reclamacao fechada fecha a linha).
const MAXIMO_DE_RELEITURAS = 50;
/// Uma trava de envio mais velha que isto e de um processo que morreu no meio: tratada como solta.
const TRAVA_VELHA_MS = 2 * 60 * 1000;

const DESTINATARIO_DA_ACAO = { send_message_to_complainant: "complainant", send_message_to_mediator: "mediator" };
/// Acoes que nao sao "outra coisa que da para fazer no ML": as de mensagem, o anexo e a `recontact` (a documentacao diz
/// que ainda nao esta disponivel).
const ACOES_QUE_NAO_APARECEM = new Set(["send_message_to_complainant", "send_message_to_mediator", "send_attachments", "recontact"]);
const QUEM = { complainant: "C", respondent: "V", mediator: "M" };
const ROTULOS = new Set(["[sem texto]", "[anexo]", "[mensagem retida pelo ML]"]);

const BLOQUEIOS = {
  fechada: "A reclamação foi encerrada no Mercado Livre.",
  "sem-acao": "O Mercado Livre não libera mensagem nesta etapa da reclamação.",
};

/** A frase que a tela, o bot e o MCP mostram no lugar do envio. `null` quando da para escrever. */
export function textoDoBloqueioDaReclamacao(bloqueio) {
  if (!bloqueio) return null;
  return BLOQUEIOS[bloqueio] ?? BLOQUEIOS["sem-acao"];
}

/** "comprador" ou "mediador do Mercado Livre" (a linha "Vai para:" da tela, do bot e do MCP). */
export function destinatarioEmTexto(destinatario) {
  if (destinatario === "mediator") return "mediador do Mercado Livre";
  return destinatario === "complainant" ? "comprador" : null;
}

const ACAO_EM_TEXTO = {
  refund: "reembolsar o comprador",
  open_dispute: "pedir a mediação do Mercado Livre",
  allow_return: "aceitar a devolução",
  allow_return_label: "liberar a etiqueta de devolução",
  allow_partial_refund: "oferecer reembolso parcial",
  add_shipping_evidence: "enviar o comprovante de envio",
  return_review_ok: "confirmar que o produto devolvido chegou bem",
  return_review_fail: "informar problema no produto devolvido",
};

/** As outras acoes que o ML libera, em palavras (a tela, o bot e o MCP so as CITAM; quem as executa e o dono, no ML). */
export function acoesEmTexto(acoes) {
  return (Array.isArray(acoes) ? acoes : []).map((acao) => ACAO_EM_TEXTO[acao] ?? String(acao).replaceAll("_", " "));
}

/** "Reclamação" ou "Mediação" (a etapa `dispute` e a que o ML intermedia). */
export function etapaEmTexto(etapa) {
  return etapa === "dispute" ? "Mediação" : "Reclamação";
}

const data = (valor) => {
  const d = valor ? new Date(valor) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
const texto = (valor, teto = 300) => (typeof valor === "string" && valor.trim() ? valor.trim().slice(0, teto) : null);

/**
 * O retrato de uma reclamacao lida do ML. Mensagens da mais antiga para a mais nova; `de` e "C" (comprador), "V" (a loja)
 * ou "M" (mediador do ML) e `para` idem. Mensagem vazia vira "[sem texto]", so com anexo "[anexo]" e a retida pela
 * moderacao "[mensagem retida pelo ML]": o texto dela nao e mostrado nem vai a IA.
 *
 * `aguardaResposta`: reclamacao aberta cuja ultima mensagem nao e da loja (ou sem mensagem nenhuma: a reclamacao em si
 * pede resposta). `ultimaDeForaId` e o `hash` da ultima mensagem que nao e da loja ("abertura" quando nao ha): e o que o
 * envio compara para saber se a conversa andou.
 */
export function resumirReclamacao(reclamacao, mensagensDoML, vendedorId, detalheDoML = null) {
  const vendedor = String(vendedorId ?? "");
  const jogadores = Array.isArray(reclamacao?.players) ? reclamacao.players : [];
  const loja = jogadores.find((p) => p?.role === "respondent" && (!vendedor || String(p?.user_id ?? "") === vendedor)) ?? jogadores.find((p) => p?.role === "respondent") ?? null;
  const acoes = (Array.isArray(loja?.available_actions) ? loja.available_actions : []).filter((a) => a?.action);
  const aberta = reclamacao?.status === "opened";
  const etapa = texto(reclamacao?.stage, 40);
  // Na mediacao a mensagem vai ao mediador; fora dela, ao comprador. Se o ML liberar as duas, vale a da etapa.
  const liberadas = acoes.map((a) => DESTINATARIO_DA_ACAO[a.action]).filter(Boolean);
  const daEtapa = etapa === "dispute" ? "mediator" : "complainant";
  const destinatario = !aberta ? null : liberadas.includes(daEtapa) ? daEtapa : liberadas[0] ?? null;
  const prazos = acoes.filter((a) => a.mandatory && data(a.due_date)).map((a) => data(a.due_date).getTime());
  const prazoEm = prazos.length ? new Date(Math.min(...prazos)) : data(detalheDoML?.due_date);

  const mensagens = (Array.isArray(mensagensDoML) ? mensagensDoML : [])
    .map((m, i) => {
      const anexos = Array.isArray(m?.attachments) ? m.attachments.length : 0;
      const moderacao = m?.message_moderation?.status ?? null;
      const retida = m?.status === "moderated" || m?.status === "rejected" || moderacao === "rejected";
      const cru = String(m?.message ?? "").trim();
      const em = (data(m?.date_created) ?? data(m?.message_date))?.toISOString() ?? null;
      return {
        id: String(m?.hash ?? `${em ?? i}-${m?.sender_role ?? ""}`),
        de: QUEM[m?.sender_role] ?? "C",
        para: QUEM[m?.receiver_role] ?? null,
        texto: (retida ? "[mensagem retida pelo ML]" : cru || (anexos > 0 ? "[anexo]" : "[sem texto]")).slice(0, 4000),
        em,
        anexos: retida ? 0 : anexos,
        retida,
        etapa: texto(m?.stage, 40),
      };
    })
    .sort((a, b) => String(a.em ?? "").localeCompare(String(b.em ?? "")));
  const longa = mensagens.length > MAXIMO_DE_MENSAGENS;
  const guardadas = mensagens.slice(-MAXIMO_DE_MENSAGENS);

  const ultimaDeFora = guardadas.filter((m) => m.de !== "V").at(-1) ?? null;
  const util = ultimaDeFora && !ultimaDeFora.retida && !ROTULOS.has(ultimaDeFora.texto) && ultimaDeFora.texto.length >= 3;
  return {
    etapa,
    statusNoML: String(reclamacao?.status ?? ""),
    tipoNoML: String(reclamacao?.type ?? ""),
    abertaEm: data(reclamacao?.date_created),
    destinatario,
    outrasAcoes: aberta ? acoes.map((a) => String(a.action)).filter((a) => !ACOES_QUE_NAO_APARECEM.has(a)) : [],
    prazoEm: prazoEm ? prazoEm.toISOString() : null,
    detalhe: detalheDoML ? { titulo: texto(detalheDoML.title), descricao: texto(detalheDoML.description, 600), problema: texto(detalheDoML.problem), responsavel: texto(detalheDoML.action_responsible, 40) } : null,
    mensagens: guardadas,
    longa,
    ultimaDeFora,
    ultimaDeForaId: ultimaDeFora?.id ?? "abertura",
    textoUtilDeFora: util ? ultimaDeFora.texto : null,
    aguardaResposta: aberta && guardadas.at(-1)?.de !== "V",
    bloqueio: destinatario ? null : aberta ? "sem-acao" : "fechada",
  };
}

async function lerMensagens(ml, id) {
  const resposta = await ml.get(`/post-purchase/v1/claims/${encodeURIComponent(id)}/messages`);
  if (resposta?.status === 404) return [];
  if (!resposta?.ok) throw new Error(`o Mercado Livre respondeu ${resposta?.status ?? "erro"} em GET /post-purchase/v1/claims/${id}/messages`);
  return Array.isArray(resposta.dados) ? resposta.dados : [];
}

/** O "detalhe" (titulo, descricao, prazo): enfeite da tela. Nunca lanca; sem ele a reclamacao e lida igual. */
async function lerDetalhe(ml, id) {
  try {
    const resposta = await ml.get(`/post-purchase/v1/claims/${encodeURIComponent(id)}/detail`);
    return resposta?.ok && resposta.dados && typeof resposta.dados === "object" ? resposta.dados : null;
  } catch {
    return null;
  }
}

/**
 * Le uma reclamacao inteira (ela, as mensagens e o detalhe). `null` quando o ML nao a tem (404); lanca nos outros erros.
 * `reclamacao` ja lida (a da busca) evita o primeiro GET.
 */
export async function lerReclamacaoDoML(ml, id, { reclamacao = null } = {}) {
  let lida = reclamacao;
  if (!lida) {
    const resposta = await ml.get(`/post-purchase/v1/claims/${encodeURIComponent(id)}`);
    if (resposta?.status === 404) return null;
    if (!resposta?.ok) throw new Error(`o Mercado Livre respondeu ${resposta?.status ?? "erro"} em GET /post-purchase/v1/claims/${id}`);
    lida = resposta.dados ?? {};
  }
  return { reclamacao: lida, mensagens: await lerMensagens(ml, id), detalhe: await lerDetalhe(ml, id) };
}

const NADA = { id: null, criada: false, reabriu: false, fechou: false, atualizou: false, status: null };

/**
 * Grava (ou atualiza) a reclamacao lida. So a reclamacao `mediations` ABERTA que espera resposta cria linha. Linha ABERTA
 * cuja reclamacao fechou, ou cuja ultima mensagem passou a ser da loja (respondida pelo app do ML), vira FECHADA_FORA.
 * Linha respondida, ignorada ou fechada em que chegou mensagem NOVA de fora reabre limpa (sem rascunho nem o aviso antigo
 * do Telegram). O texto da linha e a ultima mensagem de fora, ou o motivo da reclamacao quando ela nao tem texto util.
 *
 * @returns {Promise<{ id: string | null, criada: boolean, reabriu: boolean, fechou: boolean, atualizou: boolean, status: string | null }>}
 */
export async function aplicarReclamacaoLida({ reclamacao, mensagens, detalhe = null }, { vendedorId, agora = new Date() } = {}) {
  const idExterno = String(reclamacao?.id ?? "");
  if (!idExterno) return NADA;
  const resumo = resumirReclamacao(reclamacao, mensagens, vendedorId, detalhe);
  const chave = { tipo_idExterno: { tipo: "RECLAMACAO", idExterno } };
  const existente = await prisma.atendimentoML.findUnique({ where: chave, select: { id: true, status: true, ultimaDoClienteId: true } });
  // Cancelamento de compra, devolucao sem conversa etc.: nunca tem mensagem (medido em 25/11/2026).
  if (!existente && resumo.tipoNoML !== "mediations") return NADA;

  const base = await prisma.reclamacaoML.findUnique({ where: { id: idExterno }, select: { id: true, pedidoId: true, motivoNome: true } });
  const retrato = {
    conversa: { mensagens: resumo.mensagens, longa: resumo.longa, outrasAcoes: resumo.outrasAcoes, detalhe: resumo.detalhe },
    bloqueio: resumo.bloqueio,
    limite: LIMITE_DA_RECLAMACAO,
    situacaoNoML: resumo.statusNoML || "desconhecida",
    etapa: resumo.etapa,
    destinatario: resumo.destinatario,
    prazoEm: data(resumo.prazoEm),
    ...(base ? { reclamacaoId: base.id, pedidoId: base.pedidoId ?? null } : {}),
  };
  const deFora = {
    textoDoCliente: (resumo.textoUtilDeFora ?? base?.motivoNome ?? resumo.detalhe?.problema ?? "Reclamação aberta no Mercado Livre").slice(0, 4000),
    recebidaEm: data(resumo.ultimaDeFora?.em) ?? resumo.abertaEm ?? new Date(agora),
    ultimaDoClienteId: resumo.ultimaDeForaId,
  };

  if (!existente) {
    if (!resumo.aguardaResposta) return NADA;
    try {
      const criada = await prisma.atendimentoML.create({ data: { tipo: "RECLAMACAO", idExterno, ...retrato, ...deFora }, select: { id: true } });
      return { ...NADA, id: criada.id, criada: true, status: "ABERTA" };
    } catch (erro) {
      // A notificacao e a rotina leram a mesma reclamacao ao mesmo tempo: a outra ja gravou.
      if (erro?.code !== "P2002") throw erro;
      const outra = await prisma.atendimentoML.findUnique({ where: chave, select: { id: true, status: true } });
      return { ...NADA, id: outra?.id ?? null, status: outra?.status ?? null };
    }
  }

  const mensagemNova = resumo.ultimaDeForaId !== existente.ultimaDoClienteId;
  const semAvisoAntigo = { telegramChatId: null, telegramMensagemId: null, telegramPedidoId: null };

  if (existente.status === "ABERTA") {
    if (!resumo.aguardaResposta) {
      const ultima = resumo.mensagens.at(-1);
      const daLoja = ultima?.de === "V" ? ultima : null;
      const fechou = await prisma.atendimentoML.updateMany({
        where: { id: existente.id, status: "ABERTA" },
        data: { ...retrato, status: "FECHADA_FORA", respondidaVia: "ML", respostaEnviada: daLoja?.texto ?? null, respondidaEm: data(daLoja?.em) ?? new Date(agora), enviandoDesde: null },
      });
      return { ...NADA, id: existente.id, fechou: fechou.count === 1, status: "FECHADA_FORA" };
    }
    await prisma.atendimentoML.updateMany({ where: { id: existente.id, status: "ABERTA" }, data: { ...retrato, ...deFora, ...(mensagemNova ? semAvisoAntigo : {}) } });
    return { ...NADA, id: existente.id, atualizou: mensagemNova, status: "ABERTA" };
  }

  // Respondida, ignorada ou fechada fora: so reabre com mensagem NOVA de fora esperando resposta.
  if (mensagemNova && resumo.aguardaResposta) {
    await prisma.atendimentoML.update({
      where: { id: existente.id },
      data: { ...retrato, ...deFora, ...semAvisoAntigo, status: "ABERTA", rascunho: null, rascunhoOrigem: null, rascunhoEm: null, erroDoEnvio: null, enviandoDesde: null, respostaEnviada: null, respondidaEm: null, respondidaPor: null, respondidaVia: null },
    });
    return { ...NADA, id: existente.id, reabriu: true, status: "ABERTA" };
  }
  await prisma.atendimentoML.update({ where: { id: existente.id }, data: retrato });
  return { ...NADA, id: existente.id, status: existente.status };
}

/** As reclamacoes ABERTAS da conta, com os filtros que a documentacao pede (o vendedor e o papel dele). */
async function buscarAbertas(ml, vendedorId) {
  const achadas = [];
  for (let pagina = 0; pagina < MAXIMO_DE_PAGINAS; pagina++) {
    const resposta = await ml.get("/post-purchase/v1/claims/search", { status: "opened", "players.role": "respondent", "players.user_id": vendedorId, limit: POR_PAGINA, offset: pagina * POR_PAGINA, sort: "date_created:desc" });
    if (!resposta?.ok) throw new Error(`o Mercado Livre respondeu ${resposta?.status ?? "erro"} na busca de reclamações`);
    const lista = Array.isArray(resposta.dados?.data) ? resposta.dados.data : [];
    achadas.push(...lista);
    if (lista.length < POR_PAGINA) break;
  }
  return achadas;
}

/** O id da reclamacao num recurso do ML: "post-purchase/v1/claims/123" (com ou sem barra), "/claims/123" ou o proprio id. */
function reclamacaoDoRecurso(recurso) {
  const valor = String(recurso ?? "");
  const casou = /claims\/([^/?]+)/.exec(valor);
  if (casou) return casou[1];
  return /^[\w-]+$/.test(valor) ? valor : null;
}

/** A notificacao do topico `post_purchase`: le a reclamacao e aplica. Reclamacao que o ML nao tem nao faz nada. */
export async function aplicarNotificacaoDeReclamacao(ml, recurso, { agora = new Date() } = {}) {
  const id = reclamacaoDoRecurso(recurso);
  if (!id) return NADA;
  const lida = await lerReclamacaoDoML(ml, id);
  return lida ? aplicarReclamacaoLida(lida, { vendedorId: await ml.usuarioId(), agora }) : NADA;
}

/**
 * Uma volta das reclamacoes. Nunca lanca. O erro de UMA reclamacao nao impede as outras: a volta segue e devolve
 * `ok: false` com o primeiro erro, mais o que deu certo (`novas`, `fechadasIds`). `soPrefixo` restringe as linhas do banco
 * que ela rele (o teste).
 */
export async function rodarReclamacoesML({ ml = clienteML(), agora = new Date(), soPrefixo = null } = {}) {
  let novas = 0;
  let reabertas = 0;
  let lidas = 0;
  const fechadasIds = [];
  const erros = [];
  const contar = (aplicada) => {
    if (aplicada?.criada) novas++;
    if (aplicada?.reabriu) reabertas++;
    if (aplicada?.fechou) fechadasIds.push(aplicada.id);
  };
  const tentar = async (funcao) => {
    try {
      contar(await funcao());
    } catch (erro) {
      erros.push(String(erro?.message ?? erro).slice(0, 300));
    }
  };
  try {
    const vendedorId = await ml.usuarioId();
    const abertas = (await buscarAbertas(ml, vendedorId)).filter((r) => r?.type === "mediations" && r?.id);
    lidas = abertas.length;
    const vistas = new Set();
    for (const reclamacao of abertas) {
      vistas.add(String(reclamacao.id));
      await tentar(async () => aplicarReclamacaoLida(await lerReclamacaoDoML(ml, String(reclamacao.id), { reclamacao }), { vendedorId, agora }));
    }
    // As ABERTAS do banco que sairam da busca: a reclamacao fechou (ou mudou) no ML.
    const linhas = await prisma.atendimentoML.findMany({
      where: { tipo: "RECLAMACAO", status: "ABERTA", ...(soPrefixo ? { idExterno: { startsWith: soPrefixo } } : {}) },
      orderBy: { atualizadoEm: "asc" },
      select: { idExterno: true },
    });
    for (const linha of linhas.filter((l) => !vistas.has(l.idExterno)).slice(0, MAXIMO_DE_RELEITURAS)) {
      await tentar(async () => {
        const lida = await lerReclamacaoDoML(ml, linha.idExterno);
        // O ML nao tem mais a reclamacao: para o Rise ela fechou.
        return aplicarReclamacaoLida(lida ?? { reclamacao: { id: linha.idExterno, status: "closed", type: "mediations", players: [] }, mensagens: [] }, { vendedorId, agora });
      });
    }
  } catch (erro) {
    erros.push(String(erro?.message ?? erro).slice(0, 300));
  }
  return { ok: erros.length === 0, ...(erros.length ? { erro: erros[0] } : {}), lidas, novas, reabertas, fechadas: fechadasIds.length, fechadasIds };
}

/** A trava do .env das reclamacoes, lida na hora. */
export function mensagemDeReclamacaoLiberada(env = process.env) {
  return String(env?.ML_RESPONDER_RECLAMACOES ?? "").trim().toLowerCase() === "true";
}

const MENSAGEM = {
  "sem-rascunho": "Escreva a mensagem antes de enviar.",
  trava: TEXTO_DA_TRAVA_DE_RECLAMACOES,
  "ja-enviando": "Esta mensagem já está sendo enviada.",
  "fechada-fora": "Esta reclamação já foi respondida fora do Rise.",
  fechada: BLOQUEIOS.fechada,
  "sem-acao": BLOQUEIOS["sem-acao"],
  "mensagem-nova": "Chegou mensagem nova na reclamação. Confira a conversa antes de enviar.",
};
const recusa = (motivo, extra = {}) => ({ ok: false, motivo, mensagem: MENSAGEM[motivo] ?? "Não foi possível enviar.", ...extra });
const MENSAGEM_DA_ETAPA = (destinatario) => (destinatarioEmTexto(destinatario) ? `A reclamação mudou de etapa: agora a mensagem vai para o ${destinatarioEmTexto(destinatario)}. Confira o texto antes de enviar.` : BLOQUEIOS["sem-acao"]);

/**
 * O ENVIO UNICO da mensagem de reclamacao (chamado por `enviarResposta`, que ja conferiu linha ABERTA). Ordem: filtro ->
 * trava `ML_RESPONDER_RECLAMACOES` -> marca `enviandoDesde` (so quem marcou segue) -> rele a reclamacao (fechada, sem acao
 * de mensagem, destinatario diferente do que a linha mostrava, respondida fora ou com mensagem nova: nada sai) -> `POST`,
 * UMA tentativa -> RESPONDIDA.
 *
 * O destinatario e relido do ML: a mensagem escrita para o comprador nunca vai ao mediador sem o dono ver a troca.
 *
 * @returns {Promise<{ ok: true } | { ok: false, motivo: string, mensagem: string, barrados?: object[] }>}
 */
export async function enviarMensagemDeReclamacao({ linha, por, via, ml = clienteML(), env = process.env, agora = new Date(), visto = null }) {
  const mensagem = String(linha.rascunho ?? "").trim();
  if (!mensagem) return recusa("sem-rascunho");
  // A rotina do worker pode ter atualizado a linha (etapa nova, mensagem nova) com a janela aberta ou entre o preparo e o
  // envio do assistente: o que a pessoa viu ja nao e o que a linha diz, e nada sai sem ela conferir.
  if (visto) {
    if ((visto.destinatario ?? null) !== (linha.destinatario ?? null)) return recusa("etapa-mudou", { mensagem: MENSAGEM_DA_ETAPA(linha.destinatario) });
    if (String(visto.ultima ?? "") !== String(linha.ultimaDoClienteId ?? "")) return recusa("mensagem-nova");
  }
  const filtro = filtrarResposta({ texto: mensagem, origem: linha.rascunhoOrigem === "IA" ? "IA" : "DONO", linksDaTroca: [], limite: LIMITE_DA_RECLAMACAO });
  if (!filtro.ok) return recusa("filtro", { mensagem: textoDoBarrado(filtro.barrados[0]), barrados: filtro.barrados });
  if (!mensagemDeReclamacaoLiberada(env)) return recusa("trava");

  const marcada = await prisma.atendimentoML.updateMany({
    where: { id: linha.id, status: "ABERTA", rascunho: linha.rascunho, OR: [{ enviandoDesde: null }, { enviandoDesde: { lt: new Date(agora.getTime() - TRAVA_VELHA_MS) } }] },
    data: { enviandoDesde: new Date(agora) },
  });
  if (marcada.count !== 1) return recusa("ja-enviando");
  const soltar = (erroDoEnvio = null) => prisma.atendimentoML.updateMany({ where: { id: linha.id, status: "ABERTA" }, data: { enviandoDesde: null, ...(erroDoEnvio ? { erroDoEnvio } : {}) } });

  let destinatario = null;
  try {
    const vendedorId = await ml.usuarioId();
    const lida = (await lerReclamacaoDoML(ml, linha.idExterno)) ?? { reclamacao: { id: linha.idExterno, status: "closed", type: "mediations", players: [] }, mensagens: [] };
    const resumo = resumirReclamacao(lida.reclamacao, lida.mensagens, vendedorId, lida.detalhe);
    const parar = async (motivo, extra) => {
      await soltar();
      await aplicarReclamacaoLida(lida, { vendedorId, agora });
      return recusa(motivo, extra);
    };
    if (resumo.statusNoML !== "opened") return await parar("fechada");
    if (!resumo.aguardaResposta) return await parar("fechada-fora");
    if (!resumo.destinatario) return await parar("sem-acao");
    if (resumo.destinatario !== linha.destinatario) {
      return await parar("etapa-mudou", { mensagem: MENSAGEM_DA_ETAPA(resumo.destinatario) });
    }
    if (resumo.ultimaDeForaId !== linha.ultimaDoClienteId) return await parar("mensagem-nova");
    destinatario = resumo.destinatario;
    const resposta = await ml.post(`/post-purchase/v1/claims/${encodeURIComponent(linha.idExterno)}/actions/send-message`, { receiver_role: destinatario, message: mensagem });
    if (!resposta?.ok) throw new Error(`o Mercado Livre respondeu ${resposta?.status ?? "erro"}${resposta?.dados?.message ? `: ${String(resposta.dados.message).slice(0, 200)}` : ""}`);
  } catch (erro) {
    const motivo = String(erro?.message ?? erro).slice(0, 300);
    await soltar(motivo);
    return recusa("ml", { mensagem: `O Mercado Livre não aceitou a mensagem: ${motivo}` });
  }

  const enviadaEm = new Date(agora);
  await prisma.$transaction(async (tx) => {
    const atual = await tx.atendimentoML.findUnique({ where: { id: linha.id }, select: { conversa: true, etapa: true } });
    const conversa = atual?.conversa && typeof atual.conversa === "object" ? atual.conversa : {};
    const mensagens = [...(Array.isArray(conversa.mensagens) ? conversa.mensagens : []), { id: `rise-${enviadaEm.getTime()}`, de: "V", para: QUEM[destinatario], texto: mensagem, em: enviadaEm.toISOString(), anexos: 0, retida: false, etapa: atual?.etapa ?? null }].slice(-MAXIMO_DE_MENSAGENS);
    await tx.atendimentoML.update({
      where: { id: linha.id },
      data: { status: "RESPONDIDA", conversa: { ...conversa, mensagens }, respostaEnviada: mensagem, respondidaEm: enviadaEm, respondidaPor: por ?? null, respondidaVia: via, enviandoDesde: null, erroDoEnvio: null },
    });
    // Sem o texto do comprador nem a mensagem: so o que identifica o envio.
    await registrarAuditoria(tx, { quem: por ?? "desconhecido", oQue: "atendimentoML.responder", alvo: linha.id, depois: { tipo: linha.tipo, idExterno: linha.idExterno, via, para: destinatario, caracteres: mensagem.length, origem: linha.rascunhoOrigem ?? null } });
  });
  return { ok: true };
}

import { prisma } from "@/lib/db";
import { clienteML } from "@/lib/canaisDeVenda/ml/cliente";

import { rodarPosVendaML } from "./posVenda";

/**
 * As perguntas dos anuncios do Mercado Livre (Atendimento do ML, fase 1; spec 2026-11-24-atendimento-ml-design.md).
 *
 * A pergunta chega por dois caminhos, e os dois acabam em `aplicarPerguntaLida`:
 *  - a notificacao do topico `questions` (fila `NotificacaoDePedido`, recurso `/questions/{id}`, `tratarRecurso`);
 *  - a rotina `atendimentoML` do worker (`rodarAtendimentoML`), a cada 5 min: busca as sem resposta (notificacao perdida
 *    nao deixa pergunta sem aparecer) e rele as ABERTAS do banco que sumiram da busca, que e como a resposta dada pelo app
 *    do ML, ou a pergunta apagada, fecha a linha aqui.
 *
 * So LEITURA do ML. Quem escreve e `enviar.js`.
 */

export const ATENDIMENTO_ML_MS = 5 * 60 * 1000;

const POR_PAGINA = 50;
/// Freio da busca de seguranca: 10 paginas de 50 (conta com mais de 500 perguntas abertas nao e o caso da 4hobby).
const MAXIMO_DE_PAGINAS = 10;
/// Quantas ABERTAS do banco a rotina rele por volta (as que nao vieram na busca).
const MAXIMO_DE_RELEITURAS = 50;
/// Situacoes do ML em que a pergunta nao espera mais resposta.
const ENCERRADAS = new Set(["ANSWERED", "BANNED", "CLOSED_UNANSWERED", "DELETED", "DISABLED"]);

const data = (valor) => {
  const d = valor ? new Date(valor) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/** `GET /questions/{id}?api_version=4`. `null` quando o ML nao tem mais a pergunta (404); lanca nos outros erros. */
export async function lerPerguntaDoML(ml, id) {
  const resposta = await ml.get(`/questions/${id}`, { api_version: 4 });
  if (resposta?.status === 404) return null;
  if (!resposta?.ok) throw new Error(`o Mercado Livre respondeu ${resposta?.status ?? "erro"} em GET /questions/${id}`);
  return resposta.dados ?? null;
}

/** O Anuncio e o Produto do Rise para um item do ML (nulos quando o anuncio e antigo, de fora do Rise). */
async function anuncioDoItem(itemId) {
  if (!itemId) return { anuncioId: null, produtoId: null };
  const anuncio = await prisma.anuncio.findFirst({ where: { canal: "MERCADO_LIVRE", idExterno: String(itemId) }, select: { id: true, produtoId: true } });
  return { anuncioId: anuncio?.id ?? null, produtoId: anuncio?.produtoId ?? null };
}

/**
 * Grava (ou atualiza) uma pergunta lida do ML. So a pergunta SEM RESPOSTA e com texto cria linha. Linha ABERTA cuja
 * pergunta foi respondida, apagada ou encerrada no ML vira FECHADA_FORA; RESPONDIDA e IGNORADA nao mudam de status.
 *
 * @returns {Promise<{ id: string | null, criada: boolean, status: string | null, fechou: boolean }>}
 */
export async function aplicarPerguntaLida(pergunta, { agora = new Date() } = {}) {
  const idExterno = String(pergunta?.id ?? "");
  if (!idExterno) return { id: null, criada: false, status: null, fechou: false };
  const situacaoNoML = String(pergunta.status ?? "");
  const chave = { tipo_idExterno: { tipo: "PERGUNTA", idExterno } };
  const existente = await prisma.atendimentoML.findUnique({ where: chave, select: { id: true, status: true, situacaoNoML: true } });

  if (!existente) {
    const texto = String(pergunta.text ?? "").trim();
    if (situacaoNoML !== "UNANSWERED" || !texto) return { id: null, criada: false, status: null, fechou: false };
    const itemId = pergunta.item_id ? String(pergunta.item_id) : null;
    try {
      const criada = await prisma.atendimentoML.create({
        data: { tipo: "PERGUNTA", idExterno, itemId, ...(await anuncioDoItem(itemId)), textoDoCliente: texto.slice(0, 4000), situacaoNoML, recebidaEm: data(pergunta.date_created) ?? new Date(agora) },
        select: { id: true },
      });
      return { id: criada.id, criada: true, status: "ABERTA", fechou: false };
    } catch (erro) {
      // A notificacao e a rotina leram a mesma pergunta ao mesmo tempo: a outra ja gravou.
      if (erro?.code !== "P2002") throw erro;
      const outra = await prisma.atendimentoML.findUnique({ where: chave, select: { id: true, status: true } });
      return { id: outra?.id ?? null, criada: false, status: outra?.status ?? null, fechou: false };
    }
  }

  if (existente.status === "ABERTA" && ENCERRADAS.has(situacaoNoML)) {
    await prisma.atendimentoML.updateMany({
      where: { id: existente.id, status: "ABERTA" },
      data: {
        status: "FECHADA_FORA",
        situacaoNoML,
        respondidaVia: "ML",
        respostaEnviada: pergunta.answer?.text ? String(pergunta.answer.text).slice(0, 4000) : null,
        respondidaEm: data(pergunta.answer?.date_created) ?? new Date(agora),
        enviandoDesde: null,
      },
    });
    return { id: existente.id, criada: false, status: "FECHADA_FORA", fechou: true };
  }
  if (situacaoNoML && situacaoNoML !== existente.situacaoNoML) await prisma.atendimentoML.update({ where: { id: existente.id }, data: { situacaoNoML } });
  return { id: existente.id, criada: false, status: existente.status, fechou: false };
}

/** As perguntas sem resposta da conta (`GET /questions/search`, de 50 em 50). Devolve os objetos do ML. */
export async function buscarSemResposta(ml, vendedorId) {
  const achadas = [];
  for (let pagina = 0; pagina < MAXIMO_DE_PAGINAS; pagina++) {
    const resposta = await ml.get("/questions/search", { seller_id: vendedorId, status: "UNANSWERED", api_version: 4, limit: POR_PAGINA, offset: pagina * POR_PAGINA, sort_fields: "date_created", sort_types: "ASC" });
    if (!resposta?.ok) throw new Error(`o Mercado Livre respondeu ${resposta?.status ?? "erro"} na busca de perguntas`);
    const lista = resposta.dados?.questions ?? [];
    achadas.push(...lista);
    if (lista.length < POR_PAGINA) break;
  }
  return achadas;
}

/**
 * Uma volta das PERGUNTAS. Nunca lanca: `{ ok, lidas, novas, fechadas, fechadasIds }` ou `{ ok: false, erro }`.
 * `soPrefixo` restringe as linhas do banco que ela rele (o teste, para nao tocar as perguntas de verdade).
 */
export async function rodarPerguntasML({ ml = clienteML(), agora = new Date(), soPrefixo = null } = {}) {
  try {
    const semResposta = await buscarSemResposta(ml, await ml.usuarioId());
    let novas = 0;
    const fechadasIds = [];
    const vistas = new Set();
    for (const pergunta of semResposta) {
      vistas.add(String(pergunta.id));
      const aplicada = await aplicarPerguntaLida(pergunta, { agora });
      if (aplicada.criada) novas++;
    }

    const abertas = await prisma.atendimentoML.findMany({
      where: { tipo: "PERGUNTA", status: "ABERTA", ...(soPrefixo ? { idExterno: { startsWith: soPrefixo } } : {}) },
      orderBy: { atualizadoEm: "asc" },
      select: { id: true, idExterno: true },
    });
    for (const linha of abertas.filter((a) => !vistas.has(a.idExterno)).slice(0, MAXIMO_DE_RELEITURAS)) {
      const pergunta = await lerPerguntaDoML(ml, linha.idExterno);
      const aplicada = await aplicarPerguntaLida(pergunta ?? { id: linha.idExterno, status: "DELETED" }, { agora });
      if (aplicada.fechou) fechadasIds.push(linha.id);
    }
    return { ok: true, lidas: semResposta.length, novas, fechadas: fechadasIds.length, fechadasIds };
  } catch (erro) {
    return { ok: false, erro: String(erro?.message ?? erro).slice(0, 300) };
  }
}

/**
 * Uma volta da rotina do worker: as perguntas e, depois, as mensagens de pos-venda (fase 2). O erro de uma nao esconde a
 * outra: o retorno e o das perguntas, com `posVenda` (o da outra volta) e `fechadasIds` das duas juntas, que e de onde o
 * worker tira os avisos do Telegram a atualizar.
 */
export async function rodarAtendimentoML(opcoes = {}) {
  const perguntas = await rodarPerguntasML(opcoes);
  const posVenda = await rodarPosVendaML(opcoes);
  return { ...perguntas, fechadasIds: [...(perguntas.fechadasIds ?? []), ...(posVenda.fechadasIds ?? [])], posVenda };
}

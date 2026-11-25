import { prisma } from "@/lib/db";
import { registrarAuditoria } from "@/lib/acessos/banco";
import { clienteML } from "@/lib/canaisDeVenda/ml/cliente";

import { limiteDaPergunta, linksDosAnunciosDoProduto } from "./banco";
import { filtrarResposta, textoDoBarrado } from "./filtro";
import { aplicarPerguntaLida, lerPerguntaDoML } from "./perguntas";
import { enviarMensagemDePosVenda } from "./posVenda";
import { enviarMensagemDeReclamacao } from "./reclamacoes";

/**
 * O ENVIO UNICO da resposta ao Mercado Livre (spec 2026-11-24-atendimento-ml-design.md, "O envio"). A tela, o Telegram e o
 * MCP chamam esta funcao; e o unico lugar do Rise que faz `POST /answers`.
 *
 * Ordem: linha ABERTA com rascunho -> filtro de novo -> trava do .env (`ML_RESPONDER_PERGUNTAS`) -> marca `enviandoDesde`
 * de forma atomica (so quem marcou segue) -> rele a pergunta no ML (respondida ou apagada fora: fecha a linha, nada sai) ->
 * `POST /answers`, UMA tentativa (o `post` do cliente ja nao repete: repetir poderia publicar duas vezes).
 *
 * A resposta do ML nao pode ser editada depois: por isso nada aqui "conserta" o texto.
 */

/// Uma trava de envio mais velha que isto e de um processo que morreu no meio: tratada como solta.
const TRAVA_VELHA_MS = 2 * 60 * 1000;

export const TEXTO_DA_TRAVA = "Envio desligado na VPS (ML_RESPONDER_PERGUNTAS).";

const MENSAGEM = {
  "nao-aberta": "Esta pergunta não está mais aberta.",
  "sem-rascunho": "Escreva a resposta antes de enviar.",
  trava: TEXTO_DA_TRAVA,
  "ja-enviando": "Esta resposta já está sendo enviada.",
  "fechada-fora": "Esta pergunta já foi respondida fora do Rise.",
};

/** A trava do .env, lida na hora (o teste liga e desliga sem recarregar o modulo). */
export function respostaDePerguntaLiberada(env = process.env) {
  return String(env?.ML_RESPONDER_PERGUNTAS ?? "").trim().toLowerCase() === "true";
}

/** O ML quer o id da pergunta como numero; o id de teste (ZZ-ATD-*) segue como texto. */
export function idDaPerguntaNoML(idExterno) {
  return /^\d+$/.test(String(idExterno)) ? Number(idExterno) : String(idExterno);
}

const recusa = (motivo, extra = {}) => ({ ok: false, motivo, mensagem: MENSAGEM[motivo] ?? "Não foi possível enviar.", ...extra });

/**
 * @param {{ id: string, por: string, via: "RISE" | "TELEGRAM" | "MCP", ml?: object, env?: object, agora?: Date }} entrada
 * @returns {Promise<{ ok: true } | { ok: false, motivo: string, mensagem: string, barrados?: object[] }>}
 */
export async function enviarResposta({ id, por, via, ml = clienteML(), env = process.env, agora = new Date() }) {
  const linha = await prisma.atendimentoML.findUnique({ where: { id: String(id ?? "") } });
  if (!linha || linha.status !== "ABERTA") return recusa("nao-aberta");
  // A mensagem de pos-venda (fase 2) tem outro caminho no ML, outra trava e outro limite: `posVenda.js`.
  if (linha.tipo === "POS_VENDA") return enviarMensagemDePosVenda({ linha, por, via, ml, env, agora });
  // A mensagem de reclamacao (fase 3): outro caminho, outra trava, e o destinatario e o que o ML libera: `reclamacoes.js`.
  if (linha.tipo === "RECLAMACAO") return enviarMensagemDeReclamacao({ linha, por, via, ml, env, agora });
  if (linha.tipo !== "PERGUNTA") return recusa("nao-aberta");
  const texto = String(linha.rascunho ?? "").trim();
  if (!texto) return recusa("sem-rascunho");

  // O rascunho pode ter sido gravado barrado, ou a regra pode ter mudado desde entao: confere de novo, no servidor.
  const daIA = linha.rascunhoOrigem === "IA";
  const filtro = filtrarResposta({ texto, origem: daIA ? "IA" : "DONO", linksDaTroca: daIA ? await linksDosAnunciosDoProduto(linha.produtoId) : [], limite: await limiteDaPergunta() });
  if (!filtro.ok) return recusa("filtro", { mensagem: textoDoBarrado(filtro.barrados[0]), barrados: filtro.barrados });

  if (!respostaDePerguntaLiberada(env)) return recusa("trava");

  const marcada = await prisma.atendimentoML.updateMany({
    where: { id: linha.id, status: "ABERTA", rascunho: linha.rascunho, OR: [{ enviandoDesde: null }, { enviandoDesde: { lt: new Date(agora.getTime() - TRAVA_VELHA_MS) } }] },
    data: { enviandoDesde: new Date(agora) },
  });
  if (marcada.count !== 1) return recusa("ja-enviando");
  const soltar = (erroDoEnvio) => prisma.atendimentoML.updateMany({ where: { id: linha.id, status: "ABERTA" }, data: { enviandoDesde: null, erroDoEnvio } });

  try {
    const noML = await lerPerguntaDoML(ml, linha.idExterno);
    if (!noML || noML.status !== "UNANSWERED") {
      await aplicarPerguntaLida(noML ?? { id: linha.idExterno, status: "DELETED" }, { agora });
      return recusa("fechada-fora");
    }
    const resposta = await ml.post("/answers", { question_id: idDaPerguntaNoML(linha.idExterno), text: texto });
    if (!resposta?.ok) throw new Error(`o Mercado Livre respondeu ${resposta?.status ?? "erro"}${resposta?.dados?.message ? `: ${String(resposta.dados.message).slice(0, 200)}` : ""}`);
  } catch (erro) {
    const mensagem = String(erro?.message ?? erro).slice(0, 300);
    await soltar(mensagem);
    return recusa("ml", { mensagem: `O Mercado Livre não aceitou a resposta: ${mensagem}` });
  }

  await prisma.$transaction(async (tx) => {
    await tx.atendimentoML.update({
      where: { id: linha.id },
      data: { status: "RESPONDIDA", situacaoNoML: "ANSWERED", respostaEnviada: texto, respondidaEm: new Date(agora), respondidaPor: por ?? null, respondidaVia: via, enviandoDesde: null, erroDoEnvio: null },
    });
    // Sem o texto do comprador nem a resposta: so o que identifica o envio.
    await registrarAuditoria(tx, { quem: por ?? "desconhecido", oQue: "atendimentoML.responder", alvo: linha.id, depois: { tipo: linha.tipo, idExterno: linha.idExterno, via, caracteres: texto.length, origem: linha.rascunhoOrigem } });
  });
  return { ok: true };
}

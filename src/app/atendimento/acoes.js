"use server";

import { revalidatePath } from "next/cache";

import { negarSemAcesso, negarSemAcessos, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { ignorarAtendimento, lerAtendimento, limiteDaPergunta, reabrirAtendimento, salvarRascunho } from "@/lib/atendimentoML/banco";
import { montarContexto } from "@/lib/atendimentoML/contexto";
import { detalhesDaConversa, detalhesDaReclamacao } from "@/lib/atendimentoML/janela";
import { enviarResposta, respostaDePerguntaLiberada, TEXTO_DA_TRAVA } from "@/lib/atendimentoML/enviar";
import { textoDoBarrado } from "@/lib/atendimentoML/filtro";
import { sugerirResposta } from "@/lib/atendimentoML/sugerir";
import { atualizarAvisoFechado } from "@/lib/atendimentoML/telegram";
import { gravarConfiguracao } from "@/lib/riseAi/configuracao";

/**
 * As acoes da tela "Atendimento ML" (spec 2026-11-24-atendimento-ml-design.md). Todas conferem
 * `acao.atendimentoML.responder` (o dono pediu "apenas eu"). A regra mora em `src/lib/atendimentoML/`, onde o teste a
 * alcanca sem o Next; aqui so entra a sessao, a permissao e o formato `{ ok, erro }` da tela.
 */

const RECURSO = ["acao.atendimentoML.responder", "executar"];
const ehId = (valor) => typeof valor === "string" && valor !== "" && valor.length <= 64;
const INVALIDO = { ok: false, erro: "Atendimento inválido." };
const NAO_ABERTA = "Este atendimento não está mais aberto.";

// O nome comeca por "negarSem" de proposito: o guarda estatico do `teste:acessos` procura a conferencia nas primeiras
// linhas de cada acao exportada, e e por esta funcao que todas passam.
async function negarSemAcessoOuFazer(trabalho) {
  const negado = await negarSemAcesso(...RECURSO);
  if (negado) return negado;
  try {
    return await trabalho((await sessaoDeAcessos())?.login ?? "desconhecido");
  } catch (erro) {
    console.error("[atendimento]", erro);
    return { ok: false, erro: "Não foi possível concluir. Tente de novo." };
  }
}

const avisos = (barrados) => (barrados ?? []).map(textoDoBarrado);

/** O que a janela mostra ao abrir: o anuncio como esta no ML agora, os outros anuncios do produto e as respostas anteriores. */
export async function detalhesDaPerguntaAcao(id) {
  if (!ehId(id)) return INVALIDO;
  return negarSemAcessoOuFazer(async () => {
    const atendimento = await lerAtendimento(id);
    if (!atendimento) return INVALIDO;
    if (atendimento.tipo === "POS_VENDA") return detalhesDaConversa(id);
    if (atendimento.tipo === "RECLAMACAO") return detalhesDaReclamacao(id);
    const limite = await limiteDaPergunta();
    const envio = respostaDePerguntaLiberada() ? null : TEXTO_DA_TRAVA;
    const base = { ok: true, rascunho: atendimento.rascunho ?? "", rascunhoOrigem: atendimento.rascunhoOrigem, status: atendimento.status, erroDoEnvio: atendimento.erroDoEnvio, limite, motivoDoEnvioDesligado: envio };
    try {
      const contexto = await montarContexto(id);
      return {
        ...base,
        anuncio: { titulo: contexto.anuncio.titulo, preco: contexto.anuncio.preco, disponivel: contexto.anuncio.disponivel, unidadesDoKit: contexto.anuncio.unidadesDoKit, url: contexto.anuncio.url },
        outros: contexto.outrosAnuncios.map((a) => ({ itemId: a.itemId, titulo: a.titulo, unidadesDoKit: a.unidadesDoKit, preco: a.preco, url: a.url })),
        respondidas: contexto.respondidas,
        avisos: contexto.avisos,
      };
    } catch (erro) {
      // Sem o Mercado Livre (desconectado, fora do ar): a janela abre so com o que o Rise tem, e diz por que.
      console.error("[atendimento] contexto:", erro?.message ?? erro);
      return { ...base, anuncio: null, outros: [], respondidas: [], avisos: ["ml-fora"] };
    }
  });
}

export async function salvarRascunhoAcao(id, texto) {
  if (!ehId(id) || typeof texto !== "string") return INVALIDO;
  return negarSemAcessoOuFazer(async (por) => {
    const salvo = await salvarRascunho({ id, texto, origem: "DONO", por });
    if (salvo.motivo === "nao-aberta") return { ok: false, erro: NAO_ABERTA };
    return { ok: true, barrados: avisos(salvo.barrados) };
  });
}

export async function sugerirAcao(id) {
  if (!ehId(id)) return INVALIDO;
  return negarSemAcessoOuFazer(async (por) => {
    const sugestao = await sugerirResposta(id, { por });
    if (!sugestao.ok) return { ok: false, erro: sugestao.mensagem };
    return { ok: true, texto: sugestao.texto, barrados: avisos(sugestao.barrados), custoBrl: sugestao.custoBrl, lembrete: sugestao.lembrete ?? null };
  });
}

/** Grava o texto que esta na tela e envia: o dono aprova exatamente o que le. */
export async function enviarAcao(id, texto, visto = null) {
  if (!ehId(id) || typeof texto !== "string") return INVALIDO;
  // Reclamacao: o que a janela mostrou (para quem ia e a ultima mensagem). So texto curto ou nulo passa.
  const curto = (valor) => (typeof valor === "string" && valor.length <= 120 ? valor : null);
  const oQueViu = visto && typeof visto === "object" ? { destinatario: curto(visto.destinatario), ultima: curto(visto.ultima) } : null;
  return negarSemAcessoOuFazer(async (por) => {
    const salvo = await salvarRascunho({ id, texto, origem: "DONO", por });
    if (salvo.motivo === "nao-aberta") return { ok: false, erro: NAO_ABERTA };
    const envio = await enviarResposta({ id, por, via: "RISE", visto: oQueViu });
    revalidatePath("/atendimento");
    // O aviso da pergunta no Telegram perde os botoes (nunca lanca; sem bot nao faz nada).
    const fechada = envio.motivo === "fechada-fora" || envio.motivo === "fechada";
    if (envio.ok || fechada) await atualizarAvisoFechado(id);
    // Mensagem nova, conversa bloqueada ou (na reclamacao) etapa que mudou: a janela rele antes de o dono tentar de novo.
    if (!envio.ok) return { ok: false, erro: envio.mensagem, barrados: avisos(envio.barrados), fechada, recarregar: ["mensagem-nova", "bloqueada", "etapa-mudou", "sem-acao"].includes(envio.motivo) };
    return { ok: true };
  });
}

export async function ignorarAcao(id) {
  if (!ehId(id)) return INVALIDO;
  return negarSemAcessoOuFazer(async (por) => {
    const feito = await ignorarAtendimento({ id, por });
    revalidatePath("/atendimento");
    if (feito.ok) await atualizarAvisoFechado(id);
    return feito.ok ? { ok: true } : { ok: false, erro: NAO_ABERTA };
  });
}

export async function reabrirAcao(id) {
  if (!ehId(id)) return INVALIDO;
  return negarSemAcessoOuFazer(async (por) => {
    const feito = await reabrirAtendimento({ id, por });
    revalidatePath("/atendimento");
    return feito.ok ? { ok: true } : { ok: false, erro: "Só um atendimento ignorado pode ser reaberto." };
  });
}

/** O estilo que o dono quer nas sugestoes e o limite de caracteres da resposta. Mexe na configuracao do Rise AI. */
export async function salvarAjustesAcao({ prompt, limite }) {
  const negado = await negarSemAcessos(RECURSO, ["riseAi.configuracoes", "editar"]);
  if (negado) return negado;
  try {
    const usuario = (await sessaoDeAcessos())?.login ?? "desconhecido";
    const resultado = await gravarConfiguracao({ atendimentoML: { prompt: String(prompt ?? "").replace(/\r\n?/g, "\n").trim(), limiteDaPergunta: Number(limite) } }, { usuario });
    if (!resultado.ok) return { ok: false, erro: Object.values(resultado.erros ?? {})[0] ?? "Corrija os campos." };
    revalidatePath("/atendimento");
    return { ok: true };
  } catch (erro) {
    console.error("[atendimento] ajustes:", erro);
    return { ok: false, erro: "Não foi possível salvar. Tente de novo." };
  }
}

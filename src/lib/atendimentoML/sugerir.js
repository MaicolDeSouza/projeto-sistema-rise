import { prisma } from "@/lib/db";
import { clienteML } from "@/lib/canaisDeVenda/ml/cliente";
import { lerChave, lerConfiguracao } from "@/lib/riseAi/configuracao";
import { custoDaChamada } from "@/lib/riseAi/modelos";
import { estadoDoOrcamento, estimarCustoMaximoBrl, liquidarReserva, registrarGasto, reservarOrcamento } from "@/lib/riseAi/orcamento";
import { criarProvedor as criarProvedorReal } from "@/lib/riseAi/provedores/index";

import { salvarRascunho } from "./banco";
import { anunciosIndicaveis, montarContexto, montarContextoDePosVenda, montarContextoDeReclamacao } from "./contexto";
import { trocarEtiquetas } from "./etiquetas";
import { montarPromptDoML } from "./prompt";

/**
 * A SUGESTAO DA IA para uma pergunta do ML (spec 2026-11-24-atendimento-ml-design.md). So roda quando o dono pede
 * ("Sugerir com IA" na tela ou no Telegram): nenhuma pergunta gasta sozinha.
 *
 * Uma chamada so, SEM ferramentas: o codigo monta o contexto e o modelo so escreve. O texto volta, as etiquetas viram os
 * enderecos guardados no Rise, o filtro confere e o rascunho e gravado como "IA" (mesmo barrado, com o trecho apontado:
 * o envio recusa o que o filtro barrou). Conta no orcamento INTERNO; modelo principal e reserva da configuracao do Rise AI.
 */

const MAX_TOKENS_DA_SUGESTAO = 900;
/// A mensagem de pos-venda cabe em 350 caracteres: teto curto, para a sugestao nao nascer maior que o limite do ML.
const MAX_TOKENS_DE_POS_VENDA = 300;
/// A mensagem de reclamacao tem teto de 1000 caracteres no Rise, e o prompt pede ate 500.
const MAX_TOKENS_DE_RECLAMACAO = 600;
/// Vai junto de toda sugestao de reclamacao (tela, Telegram e MCP): a mensagem pesa na decisao do ML.
export const LEMBRETE_DO_MEDIADOR = "O mediador do ML lê esta mensagem.";
/// Estimativa grosseira para a reserva do orcamento: 1 token a cada 3 caracteres (portugues).
const tokensDe = (texto) => Math.ceil(String(texto ?? "").length / 3);

const TEXTO = {
  "nao-aberta": "Este atendimento não está mais aberto.",
  orcamento: "O orçamento interno da IA deste mês acabou (Rise AI › Configurações).",
  provedor: "A IA não respondeu agora. Tente de novo ou escreva a resposta.",
  "sem-modelo": "Nenhum modelo de IA está configurado (Rise AI › Configurações).",
};

const recusa = (motivo, extra = {}) => ({ ok: false, motivo, mensagem: TEXTO[motivo], ...extra });

/**
 * @param {string} id
 * @param {{ por: string, ml?: object, criarProvedor?: Function, configuracao?: object, agora?: number }} opcoes
 *   `criarProvedor` e `configuracao` so o teste passa (provedor falso, sem tocar a configuracao do dono).
 * @returns {Promise<{ ok: true, texto: string, barrados: object[], custoBrl: number, avisos: string[] } | { ok: false, motivo: string, mensagem: string }>}
 */
export async function sugerirResposta(id, { por, ml = clienteML(), criarProvedor = null, configuracao = null, agora = Date.now() } = {}) {
  const linha = await prisma.atendimentoML.findUnique({ where: { id: String(id ?? "") }, select: { id: true, status: true, tipo: true } });
  if (!linha || linha.status !== "ABERTA" || !["PERGUNTA", "POS_VENDA", "RECLAMACAO"].includes(linha.tipo)) return recusa("nao-aberta");
  const posVenda = linha.tipo === "POS_VENDA";
  const reclamacao = linha.tipo === "RECLAMACAO";
  const maxTokens = reclamacao ? MAX_TOKENS_DE_RECLAMACAO : posVenda ? MAX_TOKENS_DE_POS_VENDA : MAX_TOKENS_DA_SUGESTAO;

  const config = configuracao ?? (await lerConfiguracao());
  if ((await estadoDoOrcamento("INTERNO", { agora, config })).nivel === "esgotado") return recusa("orcamento");
  const escolhas = [config.padrao, config.reserva].filter((escolha) => escolha?.provedor && escolha?.modelo);
  if (escolhas.length === 0) return recusa("sem-modelo");

  const contexto = reclamacao ? await montarContextoDeReclamacao(linha.id) : posVenda ? await montarContextoDePosVenda(linha.id) : await montarContexto(linha.id, { ml });
  const { sistema, mensagem } = montarPromptDoML({ contexto, estiloDoDono: config.atendimentoML?.prompt });
  const fabricar = criarProvedor ?? (async (provedorId) => criarProvedorReal(provedorId, { endpoint: config.endpoints?.[provedorId], chave: await lerChave(provedorId) }));

  let resposta = null;
  let usada = null;
  for (const escolha of escolhas) {
    const estimadoBrl = estimarCustoMaximoBrl({ provedor: escolha.provedor, modelo: escolha.modelo, tokensEntrada: tokensDe(sistema) + tokensDe(mensagem), maxTokensSaida: maxTokens });
    const reserva = await reservarOrcamento("INTERNO", estimadoBrl, { dono: `atendimentoML:${linha.id}`, agora, config });
    if (!reserva.ok) return recusa("orcamento");
    try {
      const provedor = await fabricar(escolha.provedor);
      resposta = await provedor.conversar({ modelo: escolha.modelo, sistema, mensagens: [{ papel: "usuario", conteudo: mensagem }], maxTokens, temperatura: 0.3 });
      usada = escolha;
    } catch (erro) {
      console.error(`[atendimentoML] ${escolha.provedor} nao respondeu:`, String(erro?.message ?? erro).slice(0, 200));
    } finally {
      await liquidarReserva(reserva.reservaId);
    }
    if (resposta && String(resposta.texto ?? "").trim()) break;
    resposta = null;
  }
  if (!resposta) return recusa("provedor");

  const custo = custoDaChamada({ provedor: usada.provedor, modelo: usada.modelo, tokensEntrada: resposta.uso?.entrada ?? 0, tokensSaida: resposta.uso?.saida ?? 0 });
  await registrarGasto({
    tipo: "ATENDIMENTO_ML",
    escopo: "INTERNO",
    provedor: usada.provedor,
    modelo: usada.modelo,
    valorUsd: custo?.usd ?? 0,
    valorBrl: custo?.brl ?? 0,
    referencia: linha.id,
    detalhe: { tokensEntrada: resposta.uso?.entrada ?? 0, tokensSaida: resposta.uso?.saida ?? 0, por: por ?? null },
  });

  // Pos-venda e reclamacao nao tem etiqueta de anuncio: o texto fica como veio e qualquer endereco e barrado pelo filtro.
  const troca = posVenda || reclamacao ? { texto: String(resposta.texto).trim(), links: [] } : trocarEtiquetas(String(resposta.texto).trim(), anunciosIndicaveis(contexto));
  const salvo = await salvarRascunho({ id: linha.id, texto: troca.texto, origem: "IA", por, linksDaTroca: troca.links, agora: new Date(agora) });
  if (salvo.motivo === "nao-aberta") return recusa("nao-aberta");
  return { ok: true, texto: troca.texto, barrados: salvo.barrados, custoBrl: custo?.brl ?? 0, avisos: contexto.avisos, ...(reclamacao ? { lembrete: LEMBRETE_DO_MEDIADOR } : {}) };
}

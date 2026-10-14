import { custoDaChamada, PRECOS_USD_POR_MILHAO } from "@/lib/riseAi/modelos";

import { ehModeloGpt } from "./modelosDaDescricao";

/**
 * Quanto custou uma geracao de texto do cadastro (pedido do dono em 12/10/2026: "quantos tokens e R$ gastei para
 * gerar aquela descricao"). Vale para descricao, titulo, SEO e categorias da Loja Integrada.
 *
 * Uma geracao pode fazer MAIS DE UMA chamada (a descricao volta a IA para encurtar o paragrafo longo; titulo e SEO
 * pedem as opcoes que faltaram), entao quem gera cria um `novoGasto()`, cada chamada soma nele, e a tela recebe o
 * total. A conta e a mesma do Rise AI (`custoDaChamada`, cotacao unica do sistema).
 *
 * Cache: o `input_tokens` da Anthropic NAO inclui o lido nem o gravado no cache. Os tres somam no total de entrada
 * mostrado, e no custo cada um entra com o seu peso (gravar 1,25x, ler 0,1x o preco de entrada), que e como a
 * Anthropic cobra.
 */
export function novoGasto() {
  return { modelos: [], chamadas: 0, entrada: 0, saida: 0, entradaPonderada: 0 };
}

/** Soma uma resposta da Anthropic ao gasto. Chamada sem resposta (erro de rede) nao custa nada. */
export function somarAoGasto(gasto, resposta, modeloPedido) {
  if (!gasto || !resposta?.usage) return;
  const uso = resposta.usage;
  const semCache = Number(uso.input_tokens) || 0;
  const gravado = Number(uso.cache_creation_input_tokens) || 0;
  const lido = Number(uso.cache_read_input_tokens) || 0;
  gasto.chamadas += 1;
  gasto.entrada += semCache + gravado + lido;
  gasto.saida += Number(uso.output_tokens) || 0;
  // Cache lido: 0,1x a entrada na Anthropic; a OpenAI cobra menos em alguns modelos (`pesoDoCacheLido` na tabela de precos).
  gasto.entradaPonderada += semCache + gravado * 1.25 + lido * (PRECOS_USD_POR_MILHAO[resposta.model || modeloPedido]?.pesoDoCacheLido ?? 0.1);
  // Com o "fallbacks" ligado, outro modelo pode responder: o preco e o de quem respondeu.
  const modelo = resposta.model || modeloPedido;
  if (modelo && !gasto.modelos.includes(modelo)) gasto.modelos.push(modelo);
}

/**
 * Soma dois resumos (o da descricao com o do titulo; o salvo no produto com o desta edicao). Reais `null` (modelo
 * sem preco) contamina a soma: um total parcial pareceria o gasto inteiro.
 */
export function somarResumos(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  const somar = (x, y) => (x === null || y === null ? null : Math.round((x + y) * 1e6) / 1e6);
  const modelos = [...new Set([a.modelo, b.modelo].filter(Boolean).flatMap((nome) => nome.split(" + ")))];
  return {
    modelo: modelos.join(" + "),
    chamadas: a.chamadas + b.chamadas,
    entrada: a.entrada + b.entrada,
    saida: a.saida + b.saida,
    total: a.total + b.total,
    usd: somar(a.usd, b.usd),
    brl: somar(a.brl, b.brl),
  };
}

/// Tetos do que o navegador pode mandar no Salvar: muito acima de qualquer geracao real, so para nada absurdo entrar.
const TETO = { chamadas: 10_000, tokens: 1e9, reais: 100_000 };

/**
 * Confere o gasto que vem do formulario no Salvar (`gastoIA`, JSON). O numero e calculado no servidor a cada geracao e
 * guardado na tela ate o Salvar; o servidor nao tem como refazer a conta, entao aqui so recusa o que nao tem forma de
 * gasto (texto, negativo, absurdo). Invalido ou vazio = `null` (nada a somar), nunca erro: o Salvar do produto nao
 * pode falhar por causa do contador.
 */
export function gastoDoFormulario(texto) {
  if (typeof texto !== "string" || !texto.trim() || texto.length > 2000) return null;
  let bruto;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return null;
  }
  const inteiro = (valor, teto) => (Number.isInteger(valor) && valor >= 0 && valor <= teto ? valor : null);
  const decimal = (valor) => (valor === null ? null : Number.isFinite(valor) && valor >= 0 && valor <= TETO.reais ? valor : undefined);
  const chamadas = inteiro(bruto?.chamadas, TETO.chamadas);
  const entrada = inteiro(bruto?.entrada, TETO.tokens);
  const saida = inteiro(bruto?.saida, TETO.tokens);
  const usd = decimal(bruto?.usd ?? null);
  const brl = decimal(bruto?.brl ?? null);
  if (chamadas === null || entrada === null || saida === null || usd === undefined || brl === undefined) return null;
  if (chamadas === 0) return null;
  const modelo = typeof bruto.modelo === "string" ? bruto.modelo.slice(0, 120) : "";
  return { modelo, chamadas, entrada, saida, total: entrada + saida, usd, brl };
}

/// Nome legivel do modelo para a tela; o id cru fica para o que nao estiver aqui.
const NOMES = {
  "claude-opus-5": "Claude Opus 5",
  "claude-opus-5-5": "Claude Opus 5.5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "gpt-6.1-sol": "GPT 6.1 Sol",
};

/**
 * O que vai para a tela: `{ modelo, chamadas, entrada, saida, total, brl, usd }`. `brl`/`usd` ficam `null` quando
 * o modelo nao tem preco cadastrado (a tela diz isso em vez de mostrar zero). `null` sem nenhuma chamada.
 */
export function resumoDoGasto(gasto) {
  if (!gasto || gasto.chamadas === 0) return null;
  // Mais de um modelo so acontece com o fallback; o custo usa o primeiro (o pedido), e a tela mostra os dois nomes.
  const custo = custoDaChamada({
    provedor: ehModeloGpt(gasto.modelos[0]) ? "openai" : "anthropic",
    modelo: gasto.modelos[0],
    tokensEntrada: gasto.entradaPonderada,
    tokensSaida: gasto.saida,
  });
  return {
    modelo: gasto.modelos.map((id) => NOMES[id] ?? id).join(" + "),
    chamadas: gasto.chamadas,
    entrada: gasto.entrada,
    saida: gasto.saida,
    total: gasto.entrada + gasto.saida,
    usd: custo?.usd ?? null,
    brl: custo?.brl ?? null,
  };
}

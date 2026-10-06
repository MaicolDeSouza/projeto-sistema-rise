import { MAXIMO_EXTRAS, MAXIMO_PROMPT } from "@/lib/limites";

/**
 * Nano Banana (modelos de imagem do Google, API Gemini): refaz a foto do produto como foto de estudio.
 *
 * Decidido com o dono em 05/10/2026 (spec docs/superpowers/specs/2026-10-05-nano-banana-design.md):
 *
 *  - O Google NAO tem sandbox para imagem e cada chamada sai diferente: aqui gerar ja e pagar. Por isso a
 *    tela confirma o preco a cada clique, e o servidor tem trava (NANO_BANANA_GERACAO), teto por dia
 *    (NANO_BANANA_TETO_DIA) e uma geracao por vez por foto (essas duas na acao, que conhece o banco).
 *  - O modelo e GENERATIVO: pode redesenhar o produto, como o `beautify` do Photoroom fez com um Arduino.
 *    A defesa e o prompt (manter forma, cores, conectores e textos), as imagens extras de referencia e a
 *    revisao lado a lado na janela antes de escolher.
 *  - Sempre 1:1 em 1K, so imagem: e o que o padronizador (1024x1024) aceita sem perda, e 2K/4K custam mais.
 *
 * FORMATO DO CORPO: o classico `contents/parts` com `inline_data` (a documentacao de 05/10/2026 mostra
 * tambem um formato novo, com `previous_interaction_id`). So `montarPedido` e `lerResposta` conhecem o
 * formato; a Tarefa 11 do plano o confirma com a chave real e, se for preciso, so essas duas mudam.
 *
 * Sem banco aqui: regras e rede testaveis sem nada ligado. O registro em LogIntegracao fica em
 * `nanobananaLog.js`.
 */

export const ENDERECO_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Modelos oferecidos na tela, na ordem da lista. A CHAVE e a nossa (vai no banco, no prompt salvo); o `id` e
 * o do Google. Precos por imagem 1K, em dolar, conferidos em ai.google.dev/gemini-api/docs/pricing na data
 * de `conferidoEm`: se o Google mudar, e uma linha. O Nano Banana 1 (gemini-2.5-flash-image) fica fora:
 * legado.
 */
export const MODELOS = {
  "nano-banana-2": { id: "gemini-3.1-flash-image", nome: "Nano Banana 2", usd: 0.067, conferidoEm: "2026-10-05", aceitaExtras: true },
  "nano-banana-pro": { id: "gemini-3-pro-image", nome: "Nano Banana Pro", usd: 0.134, conferidoEm: "2026-10-05", aceitaExtras: true },
  // "Nao otimizado para varias referencias", segundo o Google: as extras nao vao (nem a regra fixa).
  "nano-banana-2-lite": { id: "gemini-3.1-flash-lite-image", nome: "Nano Banana 2 Lite", usd: 0.034, conferidoEm: "2026-10-05", aceitaExtras: false },
};

export const MODELO_PADRAO = "nano-banana-2";

/** Ponto de partida do prompt (spec §8, literal). O dono refina na tela e salva um por modelo. */
export const PROMPT_PADRAO =
  "Digitalize esta foto de produto de loja de componentes eletrônicos, reproduzindo-a fielmente, como um scanner de alta resolução, mantendo o aspecto original. Mantenha exatamente o produto da foto: mesma forma, proporções e cores. Mesmo ângulo e mesmo enquadramento da foto original. Deixe o fundo branco. Não acrescente nem remova nenhum elemento. Sem texto, logo ou marca d'água adicionados.";

/** Frase que o sistema acrescenta quando ha extras (nao aparece na caixa do prompt). Spec §8, literal. */
export const REGRA_EXTRAS = "As imagens a seguir são do mesmo produto e servem só como referência de forma e acabamento.";

const TIMEOUT_MS = 120_000;

/** Motivos de recusa por conteudo, no pedido (`blockReason`) ou na resposta (`finishReason`). */
const RECUSAS = new Set(["SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT", "IMAGE_PROHIBITED_CONTENT", "BLOCKLIST"]);

/** Endereco de geracao de um modelo (chave do `MODELOS`), ou null se o modelo nao existe. */
export function enderecoDoModelo(modelo) {
  const definicao = Object.hasOwn(MODELOS, modelo) ? MODELOS[modelo] : null;
  return definicao ? `${ENDERECO_BASE}/${definicao.id}:generateContent` : null;
}

/**
 * O que o ambiente permite, lido do .env. Devolve MOTIVOS, e nunca o valor da chave.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ ok: boolean, motivo: string | null, tetoDia: number }}
 */
export function avaliarConfiguracao(env = process.env) {
  const chave = (env.GEMINI_API_KEY ?? "").trim();
  const ligada = (env.NANO_BANANA_GERACAO ?? "").trim().toLowerCase() === "true";
  const tetoTexto = (env.NANO_BANANA_TETO_DIA ?? "").trim();
  // So inteiro sem sinal; qualquer outra coisa volta ao padrao (um teto que nao se entende nao pode
  // virar "sem teto").
  const tetoDia = /^\d+$/.test(tetoTexto) ? Number(tetoTexto) : 50;

  if (!chave) {
    return { ok: false, motivo: "Chave do Google ausente: coloque GEMINI_API_KEY no arquivo .env e reinicie o servidor.", tetoDia };
  }
  if (!ligada) {
    return { ok: false, motivo: "Geracao desligada. Ela so liga com NANO_BANANA_GERACAO=true no .env.", tetoDia };
  }
  return { ok: true, motivo: null, tetoDia };
}

const parteDeImagem = ({ bytes, mimeType }) => ({ inline_data: { mime_type: mimeType, data: Buffer.from(bytes).toString("base64") } });

/**
 * O corpo do pedido ao Google: o prompt, a foto original e, se o modelo aceita, a regra fixa e as extras
 * na ordem marcada. Pede so imagem, 1:1, 1K.
 *
 * @param {{ prompt: string, original: { bytes: Buffer, mimeType: string },
 *           extras?: Array<{ bytes: Buffer, mimeType: string }>, aceitaExtras: boolean }} entrada
 */
export function montarPedido({ prompt, original, extras = [], aceitaExtras }) {
  const partes = [{ text: prompt }, parteDeImagem(original)];
  if (aceitaExtras && extras.length > 0) {
    partes.push({ text: REGRA_EXTRAS }, ...extras.map(parteDeImagem));
  }
  return {
    contents: [{ role: "user", parts: partes }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
    },
  };
}

/** A imagem e conferida pelos BYTES (PNG, JPEG ou WebP): o tipo declarado pelo Google nao basta. */
function pareceImagem(bytes) {
  if (bytes.length < 12) return false;
  const png = bytes[0] === 0x89 && bytes.subarray(1, 4).toString("latin1") === "PNG";
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP";
  return png || jpeg || webp;
}

/**
 * A imagem da resposta, ou o motivo de nao ter vindo. Aceita `inlineData` (o que a API REST devolve) e
 * `inline_data`.
 *
 * @returns {{ ok: true, bytes: Buffer } | { ok: false, erro: string }}
 */
export function lerResposta(corpo) {
  const candidato = corpo?.candidates?.[0];
  const partes = Array.isArray(candidato?.content?.parts) ? candidato.content.parts : [];

  for (const parte of partes) {
    const dados = parte?.inlineData?.data ?? parte?.inline_data?.data;
    if (typeof dados !== "string" || !dados) continue;
    const bytes = Buffer.from(dados, "base64");
    if (!pareceImagem(bytes)) return { ok: false, erro: "O Google devolveu uma imagem que nao pode ser lida." };
    return { ok: true, bytes };
  }

  if (RECUSAS.has(corpo?.promptFeedback?.blockReason) || RECUSAS.has(candidato?.finishReason)) {
    return { ok: false, erro: "O Google recusou esta foto, tente outra ou mude o prompt." };
  }
  const texto = partes
    .map((parte) => (typeof parte?.text === "string" ? parte.text : ""))
    .join(" ")
    .trim()
    .slice(0, 200);
  return { ok: false, erro: `O Google nao devolveu imagem${texto ? `: ${texto}` : "."}` };
}

/** Mensagem para a tela a partir do que o Google respondeu com erro. */
export function mensagemDeErro(status, corpo = "") {
  const texto = String(corpo ?? "");
  let detalhe = "";
  try {
    detalhe = JSON.parse(texto)?.error?.message ?? "";
  } catch {
    detalhe = texto.slice(0, 200);
  }
  detalhe = String(detalhe).slice(0, 200);

  // Sem faturamento o Google responde 403, ou 400 FAILED_PRECONDITION; o texto e o que diz qual e o caso.
  const faturamento = /billing|faturamento|payment|FAILED_PRECONDITION/i.test(texto);
  const chaveInvalida = /API_KEY_INVALID/.test(texto);
  if ((status === 401 || status === 403 || status === 400) && faturamento && !chaveInvalida) {
    return "O Google pede faturamento ativo para gerar imagem. Ative em aistudio.google.com (Plan / Billing).";
  }
  if (status === 401 || status === 403 || (status === 400 && chaveInvalida)) {
    return "O Google recusou a chave. Confira GEMINI_API_KEY no .env.";
  }
  if (status === 429) return "Limite ou cota do Google atingido. Tente de novo mais tarde.";
  if (status === 400) return `O Google recusou o pedido${detalhe ? `: ${detalhe}` : "."}`;
  return `O Google falhou (HTTP ${status})${detalhe ? `: ${detalhe}` : "."}`;
}

/**
 * Uma geracao. Recusa ANTES de chamar (`enviada: false`, nada a registrar nem a contar no teto) quando o
 * modelo nao existe, a configuracao nao permite, o prompt esta vazio ou longo demais, ou ha extras demais.
 * Depois que a chamada sai, toda falha volta com `enviada: true`: ela entra no log, e so a resposta 200
 * conta como gasto.
 *
 * @param {{ modelo: string, prompt: string, original: { bytes: Buffer, mimeType: string },
 *           extras?: Array<{ bytes: Buffer, mimeType: string }>, env?: Record<string, string | undefined> }} entrada
 * @returns {Promise<{ ok: true, enviada: true, bytes: Buffer, status: number, duracaoMs: number }
 *   | { ok: false, enviada: boolean, erro: string, status: number | null, duracaoMs: number }>}
 */
export async function gerarImagem({ modelo, prompt, original, extras = [], env = process.env }) {
  const inicio = Date.now();
  const falha = (erro, status = null, enviada = false) => ({ ok: false, enviada, erro, status, duracaoMs: Date.now() - inicio });

  const endereco = enderecoDoModelo(modelo);
  if (!endereco) return falha("Modelo desconhecido.");

  const configuracao = avaliarConfiguracao(env);
  if (!configuracao.ok) return falha(configuracao.motivo);

  const texto = String(prompt ?? "").trim();
  if (!texto) return falha("Escreva o prompt antes de gerar.");
  if (texto.length > MAXIMO_PROMPT) return falha(`O prompt passa de ${MAXIMO_PROMPT} caracteres.`);

  if (!original?.bytes?.length) return falha("A foto original nao esta disponivel.");
  const lista = Array.isArray(extras) ? extras : [];
  if (lista.length > MAXIMO_EXTRAS) return falha(`No maximo ${MAXIMO_EXTRAS} imagens extras por foto.`);

  const corpo = montarPedido({ prompt: texto, original, extras: lista, aceitaExtras: MODELOS[modelo].aceitaExtras });

  let resposta;
  try {
    resposta = await fetch(endereco, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY.trim() },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (erro) {
    return falha(
      erro?.name === "TimeoutError" ? "O Google demorou demais para responder." : "Nao foi possivel falar com o Google. Confira a conexao.",
      null,
      true,
    );
  }

  if (!resposta.ok) {
    return falha(mensagemDeErro(resposta.status, await resposta.text().catch(() => "")), resposta.status, true);
  }

  let json;
  try {
    json = await resposta.json();
  } catch {
    return falha("O Google devolveu uma resposta que nao e JSON.", resposta.status, true);
  }

  const lida = lerResposta(json);
  if (!lida.ok) return falha(lida.erro, resposta.status, true);
  return { ok: true, enviada: true, bytes: lida.bytes, status: resposta.status, duracaoMs: Date.now() - inicio };
}

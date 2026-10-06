"use server";

import sharp from "sharp";

import { prisma } from "@/lib/db";
import { loteValido } from "@/lib/arquivos";
import { cotacaoDoDolar, emReais } from "@/lib/cotacaoDolar";
import { MAXIMO_EXTRAS, MAXIMO_EXTRA_BYTES, MAXIMO_PROMPT } from "@/lib/limites";
import {
  adicionarExtra,
  baseValida,
  garantirOriginalGuardado,
  gravarGeracao,
  guardarVersao,
  lerExtra,
  originalDoLote,
  removerExtra,
} from "@/lib/imagens/lote";
import { padronizarImagem } from "@/lib/imagens/padronizar";
import { versoesParaTela } from "@/lib/imagens/paraTela";
import {
  MODELOS,
  MODELO_PADRAO,
  PROMPT_PADRAO,
  avaliarConfiguracao,
  gerarImagem,
} from "@/lib/integracoes/nanobanana";
import { registrarChamada, usoDoNanoBanana } from "@/lib/integracoes/nanobananaLog";

/**
 * Nano Banana na janela "Fotos do produto": gerar a foto de estudio a partir da ORIGINAL de uma foto do lote.
 *
 * Gerar e PAGAR (o Google nao tem previa gratis, e cada chamada sai diferente). Por isso tudo o que pode
 * barrar a geracao e conferido ANTES de chamar o Google, e o que sai e auditado em LogIntegracao. O
 * resultado vira a versao `nanobanana` da foto no lote; a foto do produto (`imagens/<base>.jpg`), a original e
 * a versao do Photoroom NUNCA sao tocadas aqui: so o "Escolher essa" da janela troca a foto.
 *
 * Este arquivo so exporta funcao assincrona: num modulo "use server", uma constante exportada faz o Next
 * recusar o modulo inteiro.
 */

// Uma geracao por vez por foto, no servidor (clique duplo, duas abas). Fica em `globalThis` para sobreviver ao
// recarregamento do modulo no desenvolvimento; numa VPS com um processo so, vale igual.
const emAndamento = (globalThis.nanoBananaEmAndamento ??= new Set());

const TIPO_DA_EXTENSAO = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

const falha = (erro) => ({ ok: false, erro });

/**
 * As imagens extras do pedido, na ordem: outra foto do carrossel (`{ tipo: "foto", base }`, vai o ORIGINAL
 * dela) ou uma enviada (`{ tipo: "enviada", n }`, o arquivo de extras/). Qualquer uma faltando recusa o pedido
 * inteiro ANTES de cobrar: gerar sem a referencia que o dono marcou nao e o que ele pediu.
 */
async function lerExtras(lote, base, extras) {
  const lidas = [];
  for (const extra of extras) {
    if (extra?.tipo === "foto") {
      if (extra.base === base) return { erro: "A propria foto nao pode ser imagem extra dela." };
      const original = baseValida(extra.base) ? await originalDoLote(lote, extra.base) : null;
      if (!original) return { erro: "Uma das imagens extras nao esta mais disponivel." };
      lidas.push({ bytes: original.bytes, mimeType: TIPO_DA_EXTENSAO[original.extensao] ?? "image/jpeg" });
    } else if (extra?.tipo === "enviada") {
      const enviada = await lerExtra(lote, base, Number(extra.n));
      if (!enviada) return { erro: "Uma das imagens extras nao esta mais disponivel." };
      lidas.push({ bytes: enviada.bytes, mimeType: TIPO_DA_EXTENSAO[enviada.extensao] ?? "image/jpeg" });
    } else {
      return { erro: "Uma das imagens extras nao esta mais disponivel." };
    }
  }
  return { lidas };
}

/**
 * Uma geracao. Devolve so as versoes e os enderecos (o cliente mescla na foto e nao perde a validacao nem a
 * versao escolhida), o custo em dolar e quanto levou.
 *
 * @param {string} lote
 * @param {string} base
 * @param {{ modelo: string, prompt: string, extras?: Array<{ tipo: "foto", base: string } | { tipo: "enviada", n: number }>,
 *           repetida?: boolean }} pedido
 */
export async function gerarComNanoBanana(lote, base, pedido) {
  if (!loteValido(lote) || !baseValida(base)) return falha("Foto invalida.");

  const modelo = String(pedido?.modelo ?? "");
  if (!Object.hasOwn(MODELOS, modelo)) return falha("Modelo desconhecido.");

  const prompt = String(pedido?.prompt ?? "").trim();
  if (!prompt) return falha("Escreva o prompt antes de gerar.");
  if (prompt.length > MAXIMO_PROMPT) return falha(`O prompt passa de ${MAXIMO_PROMPT} caracteres.`);

  const configuracao = avaliarConfiguracao();
  if (!configuracao.ok) return falha(configuracao.motivo);

  // O teto do dia e gasto de verdade: sem conseguir ler o uso, nao gera.
  let uso;
  try {
    uso = await usoDoNanoBanana();
  } catch {
    return falha("Nao foi possivel conferir o uso de hoje, e a geracao nao foi feita. Tente de novo.");
  }
  if (uso.hoje >= configuracao.tetoDia) {
    return falha(`O limite de ${configuracao.tetoDia} geracoes de hoje acabou. Volta amanha ou aumente NANO_BANANA_TETO_DIA.`);
  }

  // Conferir e marcar na MESMA volta do laco de eventos: entre as duas linhas nao ha `await`, entao outro
  // pedido da mesma foto nao passa no meio.
  const chave = `${lote}:${base}`;
  if (emAndamento.has(chave)) return falha("Ja ha uma geracao desta foto em andamento.");
  emAndamento.add(chave);

  try {
    const original = await originalDoLote(lote, base);
    if (!original) return falha("O original desta foto nao esta mais disponivel.");

    // O Lite nao aceita extras: elas nem sao lidas (uma extra faltando nao barra uma geracao que nao a usaria).
    const pedidas = MODELOS[modelo].aceitaExtras && Array.isArray(pedido?.extras) ? pedido.extras : [];
    if (pedidas.length > MAXIMO_EXTRAS) return falha(`No maximo ${MAXIMO_EXTRAS} imagens extras por foto.`);
    const extras = await lerExtras(lote, base, pedidas);
    if (extras.erro) return falha(extras.erro);

    let pixelsOrigem = null;
    try {
      const meta = await sharp(original.bytes).metadata();
      pixelsOrigem = meta.width && meta.height ? meta.width * meta.height : null;
    } catch {
      // So informativo no log.
    }

    const resposta = await gerarImagem({
      modelo,
      prompt,
      original: { bytes: original.bytes, mimeType: TIPO_DA_EXTENSAO[original.extensao] ?? "image/jpeg" },
      extras: extras.lidas,
    });
    if (resposta.enviada) {
      await registrarChamada({
        modelo,
        status: resposta.status,
        duracaoMs: resposta.duracaoMs,
        pixelsOrigem,
        extras: extras.lidas.length,
        tamanhoPrompt: prompt.length,
        repetida: pedido?.repetida === true,
        erro: resposta.ok ? null : resposta.erro,
      });
    }
    if (!resposta.ok) return falha(resposta.erro);

    // A resposta passa pelo padronizador (1024x1024, fundo branco): o Google pode devolver fora de 1:1.
    const padrao = await padronizarImagem(resposta.bytes);
    if (!padrao.ok) return falha(`A geracao foi cobrada, mas a imagem recebida nao pode ser tratada: ${padrao.erro}`);

    const guardouOriginal = await garantirOriginalGuardado(lote, base);
    if (!guardouOriginal.ok) return falha(`A geracao foi cobrada, mas a original nao pode ser guardada: ${guardouOriginal.erro}`);
    // So a ULTIMA geracao fica (spec §8): esta substitui a anterior. Para ficar com as duas, o dono escolhe a
    // primeira antes de gerar a segunda, e ela vai para a reserva no Salvar.
    await guardarVersao(lote, base, "nanobanana", padrao.bytes);
    await gravarGeracao(lote, base, { modelo, prompt, extras: pedidas });

    return { ok: true, ...(await versoesParaTela(lote, base)), custoUsd: MODELOS[modelo].usd, duracaoMs: resposta.duracaoMs };
  } catch (erro) {
    return falha(erro.message);
  } finally {
    emAndamento.delete(chave);
  }
}

// ---------------------------------------------------------------------------
// Estado para a tela, prompt salvo por modelo e imagens extras
// ---------------------------------------------------------------------------

/**
 * O que a aba Nano Banana precisa para desenhar: a configuracao (com o motivo, se estiver recusando), os
 * modelos com o preco em reais (pela cotacao de `cotacaoDolar.js`), o prompt de cada modelo (o salvo ou o
 * padrao do codigo) e o uso do dia e do mes. Sem o uso a tela ainda funciona: so nao o mostra.
 */
export async function estadoDoNanoBanana() {
  const configuracao = avaliarConfiguracao();
  const cotacao = cotacaoDoDolar();

  const salvos = new Map();
  try {
    for (const linha of await prisma.promptImagem.findMany()) salvos.set(linha.modelo, linha.texto);
  } catch {
    // Sem o banco a tela usa o prompt padrao.
  }

  let uso = null;
  try {
    uso = await usoDoNanoBanana();
  } catch {
    // Sem contagem a tela ainda funciona: so nao mostra o uso.
  }

  return {
    config: { ok: configuracao.ok, motivo: configuracao.motivo },
    modelos: Object.entries(MODELOS).map(([chave, modelo]) => ({
      chave,
      nome: modelo.nome,
      usd: modelo.usd,
      brl: emReais(modelo.usd, cotacao),
      aceitaExtras: modelo.aceitaExtras,
    })),
    modeloPadrao: MODELO_PADRAO,
    // Uma linha por modelo no banco so quando o dono mudou o texto: sem linha, vale o do codigo.
    prompts: Object.fromEntries(Object.keys(MODELOS).map((chave) => [chave, salvos.get(chave) ?? PROMPT_PADRAO])),
    cotacao,
    uso,
    gastoMesBrl: uso ? emReais(uso.gastoMesUsd, cotacao) : null,
    maximoExtras: MAXIMO_EXTRAS,
    maximoPrompt: MAXIMO_PROMPT,
  };
}

/**
 * "Salvar prompt": um por modelo, que passa a ser o ponto de partida daquele modelo. Salvar o texto igual ao
 * padrao do codigo APAGA a linha: o padrao do codigo e "sem linha", e assim uma melhoria futura do padrao
 * chega a quem nunca mexeu nele.
 */
export async function salvarPromptDoModelo(modelo, texto) {
  const chave = typeof modelo === "string" ? modelo : "";
  if (!Object.hasOwn(MODELOS, chave)) return falha("Modelo desconhecido.");

  const limpo = typeof texto === "string" ? texto.trim() : "";
  if (!limpo) return falha("O prompt nao pode ficar vazio.");
  if (limpo.length > MAXIMO_PROMPT) return falha(`O prompt passa de ${MAXIMO_PROMPT} caracteres.`);

  try {
    if (limpo === PROMPT_PADRAO.trim()) {
      await prisma.promptImagem.deleteMany({ where: { modelo: chave } });
    } else {
      await prisma.promptImagem.upsert({
        where: { modelo: chave },
        create: { modelo: chave, texto: limpo },
        update: { texto: limpo },
      });
    }
    return { ok: true, texto: limpo };
  } catch (erro) {
    return falha(erro.message);
  }
}

/** Uma imagem extra enviada de fora para a geracao desta foto (campo `arquivo`). */
export async function adicionarExtraAoLote(lote, base, formData) {
  if (!loteValido(lote) || !baseValida(base)) return falha("Foto invalida.");

  const arquivo = formData?.get?.("arquivo");
  if (!arquivo || typeof arquivo.arrayBuffer !== "function" || !arquivo.size) return falha("Nenhum arquivo enviado.");
  if (arquivo.size > MAXIMO_EXTRA_BYTES) {
    return falha(`A imagem tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB; o limite e ${MAXIMO_EXTRA_BYTES / 1024 / 1024} MB.`);
  }

  try {
    const resultado = await adicionarExtra(lote, base, Buffer.from(await arquivo.arrayBuffer()));
    if (!resultado.ok) return falha(resultado.erro);
    return { ok: true, extra: { n: resultado.n, url: `/api/temporarios/${lote}/extras/${base}.${resultado.n}.${resultado.extensao}?v=${Date.now()}` } };
  } catch (erro) {
    return falha(erro.message);
  }
}

export async function removerExtraDoLote(lote, base, n) {
  if (!loteValido(lote) || !baseValida(base)) return falha("Foto invalida.");
  if (!Number.isInteger(n) || n < 1 || n > MAXIMO_EXTRAS) return falha("Imagem extra invalida.");
  try {
    await removerExtra(lote, base, n);
    return { ok: true };
  } catch (erro) {
    return falha(erro.message);
  }
}

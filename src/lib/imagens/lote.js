import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  RAIZ,
  RAIZ_TEMPORARIA,
  limparTemporariosAntigos,
  loteValido,
  skuValido,
} from "@/lib/arquivos";

import { MAXIMO_EXTRAS } from "@/lib/limites";

import { padronizarImagem } from "./padronizar";

/**
 * As fotos do produto NOVO antes de ele existir: o produto ainda nao tem SKU gravado, e a
 * pasta definitiva tem o nome do SKU, entao a foto espera no mesmo lote temporario dos
 * documentos (`dados/temporarios/<lote>/`) e so vai para `dados/produtos/<SKU>/imagens/` no
 * Salvar.
 *
 *   imagens/<base>.jpg    a foto PADRONIZADA (1024x1024), a que vai para o produto
 *   originais/<base>.<ext> como chegou: e o que se manda ao Photoroom e o que "Voltar ao
 *                          original" restaura. Some no Salvar (decisao do dono, 21/09/2026)
 *   previas/<base>.jpg     a previa com marca d'agua, ja padronizada; ao lado, .json com as
 *                          opcoes pedidas — a compra so vale para uma previa ja vista
 *   versoes/<base>.<versao>.jpg   as versoes ja padronizadas de uma foto: `original` (a que chegou),
 *                          `photoroom` (a comprada) e `nanobanana` (a ultima geracao do Google).
 *                          `imagens/` guarda a que vai para o produto; estas deixam o dono
 *                          ALTERNAR entre elas sem perder a paga e sem pagar de novo. O nome antigo
 *                          `.melhorada.jpg` (lotes de antes de 05/10/2026) e lido como `photoroom`
 *   extras/<base>.<n>.<ext>  imagens extras ENVIADAS de fora para a geracao do Nano Banana daquela
 *                          foto (n de 1 a 5). A extra que e outra foto do carrossel nao e copiada:
 *                          o servidor le o original dela pelo `base`
 *   geracoes/<base>.json   modelo, prompt e extras da ultima geracao ("Gerar de novo" repete o pedido)
 *
 * `<base>` e um UUID sem hifens, gerado aqui. Nenhum nome vem do navegador: cada segmento
 * de caminho e conferido antes de o disco ser tocado (o lote guarda arquivos de clientes,
 * e um "../../.env" nao pode virar leitura ou escrita arbitraria).
 */

/** As versoes de uma foto, pelo nome. A ordem e a das abas da janela. */
export const VERSOES = ["original", "photoroom", "nanobanana"];

// `.melhorada` so para LER lote antigo; nada novo e gravado com esse nome. O 1 a 5 das extras e o
// MAXIMO_EXTRAS de limites.js, escrito aqui porque o padrao e literal.
const PADROES = {
  imagens: /^[0-9a-f]{32}\.jpg$/,
  originais: /^[0-9a-f]{32}\.(jpg|png|webp)$/,
  previas: /^[0-9a-f]{32}\.(jpg|json)$/,
  versoes: /^[0-9a-f]{32}\.(original|photoroom|nanobanana|melhorada)\.jpg$/,
  extras: /^[0-9a-f]{32}\.[1-5]\.(jpg|png|webp)$/,
  geracoes: /^[0-9a-f]{32}\.json$/,
};

export const PASTAS_DO_LOTE = Object.keys(PADROES);

const EXTENSOES = ["jpg", "png", "webp"];

export const baseValida = (base) => /^[0-9a-f]{32}$/.test(base ?? "");

/** Caminho absoluto, ou null se qualquer segmento for invalido. */
export function caminhoNoLote(lote, pasta, nome) {
  if (!loteValido(lote) || !PADROES[pasta] || !PADROES[pasta].test(nome ?? "")) return null;
  return path.join(RAIZ_TEMPORARIA, lote, pasta, nome);
}

async function escrever(lote, pasta, nome, bytes) {
  const destino = caminhoNoLote(lote, pasta, nome);
  if (!destino) throw new Error("Caminho invalido no lote.");
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, bytes);
}

async function apagar(lote, pasta, nome) {
  const alvo = caminhoNoLote(lote, pasta, nome);
  if (!alvo) return;
  try {
    await unlink(alvo);
  } catch (erro) {
    if (erro.code !== "ENOENT") throw erro;
  }
}

/** Bytes de um arquivo do lote, ou null se nao existir. */
export async function lerDoLote(lote, pasta, nome) {
  const alvo = caminhoNoLote(lote, pasta, nome);
  if (!alvo) return null;
  try {
    return await readFile(alvo);
  } catch (erro) {
    if (erro.code === "ENOENT") return null;
    throw erro;
  }
}

/**
 * A "impressao" (sha1) de cada foto ORIGINAL que ja esta no lote. As fotos dos produtos marcados na
 * lupa chegam em chamadas separadas, uma por produto, e a mesma foto costuma estar em dois deles (a
 * loja e o catalogo publicam o mesmo arquivo): sem isto, cada chamada nao saberia o que a anterior ja
 * trouxe e a foto entraria em dobro.
 */
export async function impressoesDoLote(lote) {
  const impressoes = new Set();
  if (!loteValido(lote)) return impressoes;

  const pasta = path.join(RAIZ_TEMPORARIA, lote, "originais");
  let nomes;
  try {
    nomes = await readdir(pasta);
  } catch (erro) {
    if (erro.code === "ENOENT") return impressoes;
    throw erro;
  }
  for (const nome of nomes) {
    if (!PADROES.originais.test(nome)) continue;
    impressoes.add(createHash("sha1").update(await readFile(path.join(pasta, nome))).digest("hex"));
  }
  return impressoes;
}

/** O original de uma foto, com a extensao em que foi guardado. */
export async function originalDoLote(lote, base) {
  if (!baseValida(base)) return null;
  for (const extensao of EXTENSOES) {
    const bytes = await lerDoLote(lote, "originais", `${base}.${extensao}`);
    if (bytes) return { bytes, extensao };
  }
  return null;
}

/**
 * Troca o ORIGINAL da foto (o "arquivo que chegou"). Usado ao reabrir um produto cuja foto e uma versao
 * gerada: a original verdadeira mora na reserva, e e dela que o Nano Banana e o Photoroom tem que partir, e
 * nao da foto atual. As outras extensoes saem, senao `originalDoLote` poderia achar a antiga primeiro.
 */
export async function definirOriginal(lote, base, bytes) {
  if (!loteValido(lote) || !baseValida(base)) throw new Error("Foto invalida.");
  for (const extensao of EXTENSOES) if (extensao !== "jpg") await apagar(lote, "originais", `${base}.${extensao}`);
  await escrever(lote, "originais", `${base}.jpg`, bytes);
}

/**
 * Uma foto que chegou (enviada pelo dono, do Bling ou do "Clonar"): padroniza e guarda a
 * padronizada e o original.
 *
 * @returns {Promise<{ ok: true, base: string, ampliada: boolean, jaPadrao: boolean,
 *   origem: object, tamanhoBytes: number } | { ok: false, erro: string }>}
 */
export async function adicionarImagem(lote, bytes) {
  if (!loteValido(lote)) return { ok: false, erro: "Lote de envio invalido." };

  // Cadastro abandonado (aba fechada sem salvar) e apagado na proxima foto enviada.
  await limparTemporariosAntigos();

  const padrao = await padronizarImagem(bytes);
  if (!padrao.ok) return padrao;

  const base = randomUUID().replaceAll("-", "");
  const extensao = padrao.origem.formato === "jpeg" ? "jpg" : padrao.origem.formato;

  await escrever(lote, "originais", `${base}.${extensao}`, bytes);
  await escrever(lote, "imagens", `${base}.jpg`, padrao.bytes);

  return {
    ok: true,
    base,
    ampliada: padrao.ampliada,
    jaPadrao: padrao.jaPadrao,
    origem: padrao.origem,
    tamanhoBytes: padrao.bytes.length,
  };
}

/**
 * Troca a foto padronizada de `base` por outra (o resultado do Photoroom, ou o original de
 * volta). Passa pelo mesmo padronizador: o resultado de fora nao chega em 1024x1024 nem
 * dentro do peso combinado.
 */
export async function substituirImagem(lote, base, bytes) {
  if (!loteValido(lote) || !baseValida(base)) return { ok: false, erro: "Foto invalida." };

  const padrao = await padronizarImagem(bytes);
  if (!padrao.ok) return padrao;

  await escrever(lote, "imagens", `${base}.jpg`, padrao.bytes);
  return { ok: true, ampliada: padrao.ampliada, tamanhoBytes: padrao.bytes.length, bytes: padrao.bytes };
}

/** Padroniza de novo o arquivo que chegou e o poe como a foto do produto. */
export async function voltarAoOriginal(lote, base) {
  const original = await originalDoLote(lote, base);
  if (!original) return { ok: false, erro: "O original desta foto nao esta mais disponivel." };
  return substituirImagem(lote, base, original.bytes);
}

/** Existe o arquivo? Sem ler os bytes (uma versao tem ~200 KB e a pergunta e so sim ou nao). */
async function existe(lote, pasta, nome) {
  const alvo = caminhoNoLote(lote, pasta, nome);
  if (!alvo) return false;
  try {
    await stat(alvo);
    return true;
  } catch (erro) {
    if (erro.code === "ENOENT") return false;
    throw erro;
  }
}

/**
 * O nome do arquivo de uma versao guardada, ou null. `photoroom` cai para `.melhorada.jpg` quando o
 * nome novo falta: um lote aberto antes desta mudanca continua com a compra que o dono pagou.
 */
export async function nomeGuardadoDaVersao(lote, base, versao) {
  if (!loteValido(lote) || !baseValida(base) || !VERSOES.includes(versao)) return null;
  const nome = `${base}.${versao}.jpg`;
  if (await existe(lote, "versoes", nome)) return nome;
  if (versao === "photoroom" && (await existe(lote, "versoes", `${base}.melhorada.jpg`))) return `${base}.melhorada.jpg`;
  return null;
}

/** Os bytes de uma versao guardada (ja padronizada), ou null. */
export async function lerVersao(lote, base, versao) {
  const nome = await nomeGuardadoDaVersao(lote, base, versao);
  return nome ? lerDoLote(lote, "versoes", nome) : null;
}

/**
 * Guarda uma versao ja padronizada. Grava por cima da anterior do mesmo nome: do Nano Banana so a
 * ULTIMA geracao fica (spec §8). Nunca toca em `imagens/` nem nas outras versoes.
 */
export async function guardarVersao(lote, base, versao, bytesPadronizados) {
  if (!loteValido(lote) || !baseValida(base)) return { ok: false, erro: "Foto invalida." };
  if (!VERSOES.includes(versao)) return { ok: false, erro: "Versao invalida." };
  await escrever(lote, "versoes", `${base}.${versao}.jpg`, bytesPadronizados);
  // O nome antigo deixaria duas "photoroom" no lote; a nova vale.
  if (versao === "photoroom") await apagar(lote, "versoes", `${base}.melhorada.jpg`);
  return { ok: true };
}

/**
 * Guarda a ORIGINAL padronizada (`versoes/<base>.original.jpg`), se ainda nao estiver. Roda antes de
 * guardar qualquer versao gerada: sem ela, escolher a gerada perderia o caminho de volta na janela.
 */
export async function garantirOriginalGuardado(lote, base) {
  if (!loteValido(lote) || !baseValida(base)) return { ok: false, erro: "Foto invalida." };
  if (await existe(lote, "versoes", `${base}.original.jpg`)) return { ok: true };
  const original = await originalDoLote(lote, base);
  if (!original) return { ok: false, erro: "O original desta foto nao esta mais disponivel." };
  const padrao = await padronizarImagem(original.bytes);
  if (!padrao.ok) return padrao;
  await escrever(lote, "versoes", `${base}.original.jpg`, padrao.bytes);
  return { ok: true };
}

/** Quais versoes GERADAS (pagas) existem guardadas para a foto. */
export async function versoesDoLote(lote, base) {
  return {
    photoroom: (await nomeGuardadoDaVersao(lote, base, "photoroom")) !== null,
    nanobanana: (await nomeGuardadoDaVersao(lote, base, "nanobanana")) !== null,
  };
}

/**
 * Poe a versao escolhida como a foto do produto (`imagens/<base>.jpg`), sem chamar ninguem e sem
 * custo. `original` volta ao arquivo que chegou; as geradas exigem uma geracao anterior.
 */
export async function escolherVersao(lote, base, versao) {
  if (!loteValido(lote) || !baseValida(base)) return { ok: false, erro: "Foto invalida." };
  if (!VERSOES.includes(versao)) return { ok: false, erro: "Versao invalida." };

  if (versao === "original") return voltarAoOriginal(lote, base);

  const bytes = await lerVersao(lote, base, versao);
  if (!bytes) return { ok: false, erro: "Esta foto ainda nao foi melhorada." };
  await escrever(lote, "imagens", `${base}.jpg`, bytes);
  return { ok: true, ampliada: false, tamanhoBytes: bytes.length };
}

// ---------------------------------------------------------------------------
// Nano Banana: imagens extras enviadas de fora e o ultimo pedido de cada foto
// ---------------------------------------------------------------------------

const EXTENSAO_DO_FORMATO = { jpeg: "jpg", png: "png", webp: "webp" };

/**
 * Guarda uma imagem extra ENVIADA para a geracao de uma foto, no primeiro numero livre de 1 a 5. Passa pelo
 * padronizador so para CONFERIR que e imagem (os bytes guardados sao os que chegaram: e o que vai ao Google).
 */
export async function adicionarExtra(lote, base, bytes) {
  if (!loteValido(lote) || !baseValida(base)) return { ok: false, erro: "Foto invalida." };
  const padrao = await padronizarImagem(bytes);
  if (!padrao.ok) return padrao;
  const extensao = EXTENSAO_DO_FORMATO[padrao.origem.formato];
  if (!extensao) return { ok: false, erro: "Formato nao aceito. Envie JPG, PNG ou WebP." };

  for (let n = 1; n <= MAXIMO_EXTRAS; n++) {
    if (await lerExtra(lote, base, n)) continue;
    await escrever(lote, "extras", `${base}.${n}.${extensao}`, bytes);
    return { ok: true, n, extensao };
  }
  return { ok: false, erro: `No maximo ${MAXIMO_EXTRAS} imagens extras por foto.` };
}

/** Uma extra enviada, com a extensao em que foi guardada, ou null. */
export async function lerExtra(lote, base, n) {
  if (!baseValida(base) || !Number.isInteger(n)) return null;
  for (const extensao of EXTENSOES) {
    const bytes = await lerDoLote(lote, "extras", `${base}.${n}.${extensao}`);
    if (bytes) return { bytes, extensao };
  }
  return null;
}

export async function removerExtra(lote, base, n) {
  if (!baseValida(base) || !Number.isInteger(n)) return;
  for (const extensao of EXTENSOES) await apagar(lote, "extras", `${base}.${n}.${extensao}`);
}

/** O ultimo pedido ao Nano Banana desta foto (modelo, prompt e extras), para "Gerar de novo" e auditoria. */
export async function gravarGeracao(lote, base, dados) {
  if (!baseValida(base)) throw new Error("Foto invalida.");
  await escrever(lote, "geracoes", `${base}.json`, JSON.stringify({ ...dados, em: new Date().toISOString() }));
}

export async function lerGeracao(lote, base) {
  if (!baseValida(base)) return null;
  const bytes = await lerDoLote(lote, "geracoes", `${base}.json`);
  if (!bytes) return null;
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  }
}

/** A previa (com marca d'agua) e as opcoes com que foi pedida. */
export async function gravarPrevia(lote, base, bytesPadronizados, opcoes) {
  if (!baseValida(base)) throw new Error("Foto invalida.");
  await escrever(lote, "previas", `${base}.jpg`, bytesPadronizados);
  await escrever(lote, "previas", `${base}.json`, JSON.stringify({ opcoes, em: new Date().toISOString() }));
}

export async function lerOpcoesDaPrevia(lote, base) {
  if (!baseValida(base)) return null;
  const bytes = await lerDoLote(lote, "previas", `${base}.json`);
  if (!bytes) return null;
  try {
    return JSON.parse(bytes.toString("utf8")).opcoes ?? null;
  } catch {
    return null;
  }
}

export async function apagarPrevia(lote, base) {
  if (!baseValida(base)) return;
  await apagar(lote, "previas", `${base}.jpg`);
  await apagar(lote, "previas", `${base}.json`);
}

/**
 * Remove a foto e tudo o que tem ao lado dela: original, previa, as versoes (nas quatro grafias), as
 * extras enviadas para ela e a ultima geracao. As da foto vizinha ficam: o filtro e o `<base>.`.
 */
export async function apagarImagem(lote, base) {
  if (!loteValido(lote) || !baseValida(base)) return;
  await apagar(lote, "imagens", `${base}.jpg`);
  for (const extensao of EXTENSOES) await apagar(lote, "originais", `${base}.${extensao}`);
  for (const versao of [...VERSOES, "melhorada"]) await apagar(lote, "versoes", `${base}.${versao}.jpg`);
  await apagarPrevia(lote, base);
  await apagar(lote, "geracoes", `${base}.json`);

  let nomes = [];
  try {
    nomes = await readdir(path.join(RAIZ_TEMPORARIA, lote, "extras"));
  } catch (erro) {
    if (erro.code !== "ENOENT") throw erro;
  }
  for (const nome of nomes) {
    if (nome.startsWith(`${base}.`)) await apagar(lote, "extras", nome);
  }
}

/** Apaga o lote inteiro: fotos, originais, previas e tambem os documentos enviados nele. */
export async function descartarLote(lote) {
  if (!loteValido(lote)) return;
  await rm(path.join(RAIZ_TEMPORARIA, lote), { recursive: true, force: true });
}

/**
 * Leva as fotos do lote para a pasta do produto recem-criado, NA ORDEM dada. So entra o que
 * existe no lote com nome gerado por nos: a lista vem do navegador.
 *
 * Nao apaga o lote: os documentos sao movidos logo depois, e quem chama o descarta no fim.
 *
 * @param {string} lote
 * @param {string} sku
 * @param {string[]} bases
 * @returns {Promise<Array<{ nome: string, tamanhoBytes: number, mimeType: string }>>}
 */
export async function moverImagensParaProduto(lote, sku, bases) {
  if (!loteValido(lote) || !skuValido(sku)) return [];

  const movidas = [];
  const vistas = new Set();
  for (const base of bases ?? []) {
    if (!baseValida(base) || vistas.has(base)) continue;
    vistas.add(base);

    const nome = `${base}.jpg`;
    const origem = caminhoNoLote(lote, "imagens", nome);
    const pasta = path.join(RAIZ, sku, "imagens");
    try {
      const { size } = await stat(origem);
      await mkdir(pasta, { recursive: true });
      await rename(origem, path.join(pasta, nome));
      movidas.push({ nome, tamanhoBytes: size, mimeType: "image/jpeg" });
    } catch (erro) {
      // Foto que sumiu do lote (limpeza de 24 h, outra aba) so nao entra.
      if (erro.code !== "ENOENT") throw erro;
    }
  }
  return movidas;
}

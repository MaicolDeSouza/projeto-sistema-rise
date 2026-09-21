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
 *   versoes/<base>.original.jpg e .melhorada.jpg   as DUAS versoes de uma foto ja comprada, ambas
 *                          padronizadas. `imagens/` guarda a que vai para o produto; estas duas
 *                          deixam o dono ALTERNAR entre elas sem perder a melhorada (paga) e sem
 *                          pagar de novo
 *
 * `<base>` e um UUID sem hifens, gerado aqui. Nenhum nome vem do navegador: cada segmento
 * de caminho e conferido antes de o disco ser tocado (o lote guarda arquivos de clientes,
 * e um "../../.env" nao pode virar leitura ou escrita arbitraria).
 */

const PADROES = {
  imagens: /^[0-9a-f]{32}\.jpg$/,
  originais: /^[0-9a-f]{32}\.(jpg|png|webp)$/,
  previas: /^[0-9a-f]{32}\.(jpg|json)$/,
  versoes: /^[0-9a-f]{32}\.(original|melhorada)\.jpg$/,
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

/**
 * Guarda as DUAS versoes depois de uma compra: a original (padronizada a partir do arquivo que
 * chegou) e a melhorada. So assim o dono pode alternar entre elas: sem isto, escolher a original
 * apagaria a melhorada que ele pagou.
 */
export async function guardarVersoes(lote, base, { originalCru, melhorada }) {
  if (!loteValido(lote) || !baseValida(base)) return { ok: false, erro: "Foto invalida." };
  const padrao = await padronizarImagem(originalCru);
  if (!padrao.ok) return padrao;
  await escrever(lote, "versoes", `${base}.original.jpg`, padrao.bytes);
  await escrever(lote, "versoes", `${base}.melhorada.jpg`, melhorada);
  return { ok: true };
}

/** A foto ja foi comprada (existe a versao melhorada guardada)? */
export async function temMelhorada(lote, base) {
  if (!baseValida(base)) return false;
  return (await lerDoLote(lote, "versoes", `${base}.melhorada.jpg`)) !== null;
}

/**
 * Poe a versao escolhida como a foto do produto (`imagens/<base>.jpg`), sem chamar o Photoroom e
 * sem custo. "melhorada" exige uma compra anterior.
 */
export async function escolherVersao(lote, base, versao) {
  if (!loteValido(lote) || !baseValida(base)) return { ok: false, erro: "Foto invalida." };

  if (versao === "original") return voltarAoOriginal(lote, base);

  if (versao === "melhorada") {
    const bytes = await lerDoLote(lote, "versoes", `${base}.melhorada.jpg`);
    if (!bytes) return { ok: false, erro: "Esta foto ainda nao foi melhorada." };
    await escrever(lote, "imagens", `${base}.jpg`, bytes);
    return { ok: true, ampliada: false, tamanhoBytes: bytes.length };
  }

  return { ok: false, erro: "Versao invalida." };
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

/** Remove a foto e tudo o que tem ao lado dela (original e previa). */
export async function apagarImagem(lote, base) {
  if (!loteValido(lote) || !baseValida(base)) return;
  await apagar(lote, "imagens", `${base}.jpg`);
  for (const extensao of EXTENSOES) await apagar(lote, "originais", `${base}.${extensao}`);
  await apagar(lote, "versoes", `${base}.original.jpg`);
  await apagar(lote, "versoes", `${base}.melhorada.jpg`);
  await apagarPrevia(lote, base);
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

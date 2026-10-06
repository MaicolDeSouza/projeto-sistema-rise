import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { caminhoDaReserva, pastaDoProduto, PASTA_RESERVA } from "@/lib/arquivos";
import { padronizarImagem } from "./padronizar";

/**
 * Disco da RESERVA de imagens do produto: dados/produtos/<SKU>/reserva/<nome>.jpg.
 *
 * So mexe em arquivo, sem banco: quem cria a linha `RESERVA` (e decide o que desce para ca) e o Salvar
 * (`reconciliarImagensDoProduto`). Todo arquivo daqui e JPEG com nome gerado por nos, o mesmo formato que
 * `caminhoDaReserva` aceita; e o que impede um nome vindo do navegador de virar caminho.
 */

/** JPEG pelos bytes (FF D8 FF), nunca pela extensao nem pelo tipo que alguem informou. */
const ehJpeg = (bytes) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

/**
 * Guarda uma imagem na reserva do produto. JPEG entra como esta (a reserva guarda o que foi trabalhado,
 * sem recomprimir); qualquer outro formato, como uma foto antiga em PNG, passa antes pelo padronizador
 * para que o arquivo seja de fato o JPEG que o nome promete.
 *
 * @param {string} sku
 * @param {Buffer} bytes
 * @returns {Promise<{ nome: string, tamanhoBytes: number, mimeType: "image/jpeg" }>}
 */
export async function gravarNaReserva(sku, bytes) {
  const pasta = pastaDoProduto(sku);
  if (!pasta) throw new Error("SKU invalido para a reserva.");

  let jpeg = bytes;
  if (!ehJpeg(bytes)) {
    const padrao = await padronizarImagem(bytes);
    if (!padrao.ok) throw new Error(padrao.erro);
    jpeg = padrao.bytes;
  }

  const nome = `${randomUUID().replaceAll("-", "")}.jpg`;
  const destino = path.join(pasta, PASTA_RESERVA);
  await mkdir(destino, { recursive: true });
  await writeFile(path.join(destino, nome), jpeg);
  return { nome, tamanhoBytes: jpeg.length, mimeType: "image/jpeg" };
}

/** Os bytes de um arquivo da reserva, ou null se o nome nao for valido ou o arquivo nao existir. */
export async function lerDaReserva(sku, nome) {
  const caminho = caminhoDaReserva(sku, nome);
  if (!caminho) return null;
  try {
    return await readFile(caminho);
  } catch (erro) {
    if (erro.code === "ENOENT") return null;
    throw erro;
  }
}

/** Apaga um arquivo da reserva. Arquivo que ja nao existe nao e erro. */
export async function apagarDaReserva(sku, nome) {
  const caminho = caminhoDaReserva(sku, nome);
  if (!caminho) return;
  try {
    await unlink(caminho);
  } catch (erro) {
    if (erro.code !== "ENOENT") throw erro;
  }
}

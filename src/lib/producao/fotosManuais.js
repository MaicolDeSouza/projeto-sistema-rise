import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

/**
 * Foto do item manual da lista personalizada (pedido do dono em 27/10/2026). Nao e foto de produto: nao vai a canal
 * nenhum nem passa pelas regras do Mercado Livre (500 px de minimo). Fica numa pasta propria, fora da do SKU, porque o
 * produto novo ainda nao tem pasta quando a foto e enviada; a linha so a cita depois do Salvar.
 *
 * O arquivo e conferido PELOS BYTES (o sharp decodifica; texto ou SVG disfarcado falha) e regravado como JPEG de ate
 * 600 px: o que se guarda e sempre uma imagem nossa, nunca o arquivo de quem enviou.
 */

export const RAIZ_FOTOS_MANUAIS = path.join(process.cwd(), "dados", "pecas-manuais");
const TAMANHO_MAXIMO = 10 * 1024 * 1024;
const LADO = 600;
const PADRAO_NOME = /^[a-f0-9]{32}\.jpg$/;

export const nomeDeFotoManualValido = (nome) => PADRAO_NOME.test(String(nome ?? ""));
export const urlDaFotoManual = (nome) => (nomeDeFotoManualValido(nome) ? `/api/producao/foto-manual/${nome}` : null);

export async function salvarFotoManual(arquivo) {
  if (!arquivo || typeof arquivo.arrayBuffer !== "function" || !arquivo.size) return { ok: false, erro: "Nenhuma foto enviada." };
  if (arquivo.size > TAMANHO_MAXIMO) return { ok: false, erro: "A foto passa de 10 MB." };
  let bytes;
  try {
    bytes = await sharp(Buffer.from(await arquivo.arrayBuffer()), { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(LADO, LADO, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    return { ok: false, erro: "Não foi possível ler a imagem. Envie JPG, PNG ou WebP." };
  }
  const nome = `${randomUUID().replaceAll("-", "")}.jpg`;
  await mkdir(RAIZ_FOTOS_MANUAIS, { recursive: true });
  await writeFile(path.join(RAIZ_FOTOS_MANUAIS, nome), bytes);
  return { ok: true, nome, url: urlDaFotoManual(nome) };
}

export async function lerFotoManual(nome) {
  if (!nomeDeFotoManualValido(nome)) return null;
  try {
    return await readFile(path.join(RAIZ_FOTOS_MANUAIS, nome));
  } catch {
    return null;
  }
}

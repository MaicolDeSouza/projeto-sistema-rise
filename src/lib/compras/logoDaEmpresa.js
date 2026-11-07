import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

/**
 * O logo INTEIRO da empresa (engrenagem + "4HOBBY"), enviado em Configuracoes > Dados da empresa (pedido do dono em
 * 07/11/2026: "salvar o logo inteiro no rise, usar esse logo nos pedidos de compra e de venda"). Fica em
 * `dados/empresa/logo.png` (a mesma pasta persistente das fotos dos produtos, fora do `public/` e do git), sem coluna
 * nova no banco. Sem logo enviado, o PDF continua com a engrenagem do `public/marcas/4hobby.svg`.
 *
 * Ao gravar: qualquer imagem (PNG, JPG, WebP, SVG) vira PNG, a margem em branco em volta e cortada (`trim`: o logo do
 * dono veio num quadro 16:9 com metade da area em branco, e no PDF ele ficaria pequeno) e o lado maior fica em ate
 * 1600 px.
 */

const PASTA = path.join(process.cwd(), "dados", "empresa");
const ARQUIVO = path.join(PASTA, "logo.png");
export const TETO_DO_LOGO = 5 * 1024 * 1024;

/** Os bytes do logo enviado (PNG), ou null quando nao ha. */
export async function lerLogoDaEmpresa() {
  try {
    return await readFile(ARQUIVO);
  } catch {
    return null;
  }
}

/** O logo como data URI, para a previa na tela. */
export async function logoEmDataUri() {
  const bytes = await lerLogoDaEmpresa();
  return bytes ? `data:image/png;base64,${bytes.toString("base64")}` : null;
}

/** @returns {Promise<{ ok: true, largura: number, altura: number } | { ok: false, erro: string }>} */
export async function salvarLogoDaEmpresa(bytes) {
  if (!bytes?.length) return { ok: false, erro: "Escolha uma imagem." };
  if (bytes.length > TETO_DO_LOGO) return { ok: false, erro: "Imagem acima de 5 MB." };
  let png;
  try {
    const cortado = await sharp(Buffer.from(bytes), { density: 300 }).trim({ threshold: 20 }).toBuffer();
    png = await sharp(cortado).resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch {
    return { ok: false, erro: "Não consegui ler a imagem. Use PNG, JPG, WebP ou SVG." };
  }
  await mkdir(PASTA, { recursive: true });
  // Grava ao lado e troca: um PDF gerado no meio da gravacao nunca le um arquivo pela metade.
  const temporario = `${ARQUIVO}.${process.pid}.tmp`;
  await writeFile(temporario, png);
  await rename(temporario, ARQUIVO);
  const { width, height } = await sharp(png).metadata();
  return { ok: true, largura: width, altura: height };
}

export async function apagarLogoDaEmpresa() {
  await rm(ARQUIVO, { force: true });
  return { ok: true };
}

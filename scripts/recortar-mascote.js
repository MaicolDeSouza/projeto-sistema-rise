/**
 * Recorta o fundo das imagens do mascote do chat da loja (o Hobi) e grava os `.webp` que o widget embute.
 *
 *   npm run hobi:mascote            (grava em assistente/mascote/)
 *   npm run hobi:mascote -- --conferir   (grava tambem, em dados/diag/, cada recorte sobre fundo escuro, para olhar a borda)
 *
 * As imagens que o dono gerou (docs/mascote-hobi/) sao JPG com fundo claro. O fundo sai por PREENCHIMENTO A PARTIR DAS
 * BORDAS: so vira transparente o que e claro E esta ligado a borda da imagem; as partes claras de dentro do robo ficam.
 * O robo e branco sobre fundo branco, entao a tolerancia e baixa de proposito: melhor sobrar um fio de fundo do que
 * comer um pedaco do robo.
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGEM = path.join(RAIZ, "docs", "mascote-hobi");
const DESTINO = path.join(RAIZ, "assistente", "mascote");

// As caixas da folha de expressoes (1376x768) foram escolhidas olhando a imagem: em cima a esquerda o rosto feliz, em
// cima a direita o olho que gira (o "pensando").
const IMAGENS = [
  { nome: "cabeca", arquivo: "hobi-cabeca.jpg", caixa: null, lado: { width: 128, height: 128 }, tolerancia: 7 },
  { nome: "corpo", arquivo: "hobi-corpo.jpg", caixa: null, lado: { height: 320 }, tolerancia: 4 },
  { nome: "feliz", arquivo: "hobi-expressoes.jpg", caixa: { left: 150, top: 8, width: 390, height: 364 }, lado: { width: 96, height: 96 }, tolerancia: 4 },
  { nome: "pensando", arquivo: "hobi-expressoes.jpg", caixa: { left: 828, top: 8, width: 390, height: 364 }, lado: { width: 96, height: 96 }, tolerancia: 4 },
];

/** Os pixels RGBA com o fundo ligado a borda ja transparente, e a caixa do que sobrou. */
async function semFundo(arquivo, caixa, tolerancia) {
  let imagem = sharp(arquivo);
  if (caixa) imagem = imagem.extract(caixa);
  const { data, info } = await imagem.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const indice = (x, y) => (y * width + x) * 4;

  // A cor do fundo e a media dos quatro cantos; o fundo da cabeca nao e branco puro (243), o do corpo e (255).
  const cantos = [indice(1, 1), indice(width - 2, 1), indice(1, height - 2), indice(width - 2, height - 2)];
  const fundo = [0, 1, 2].map((canal) => cantos.reduce((soma, i) => soma + data[i + canal], 0) / cantos.length);
  const ehFundo = (i) => Math.abs(data[i] - fundo[0]) <= tolerancia && Math.abs(data[i + 1] - fundo[1]) <= tolerancia && Math.abs(data[i + 2] - fundo[2]) <= tolerancia;

  const visto = new Uint8Array(width * height);
  const fila = new Int32Array(width * height);
  let inicio = 0;
  let fim = 0;
  const entrar = (x, y) => {
    const posicao = y * width + x;
    if (visto[posicao] || !ehFundo(posicao * 4)) return;
    visto[posicao] = 1;
    fila[fim++] = posicao;
  };
  for (let x = 0; x < width; x++) {
    entrar(x, 0);
    entrar(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    entrar(0, y);
    entrar(width - 1, y);
  }
  while (inicio < fim) {
    const posicao = fila[inicio++];
    const x = posicao % width;
    const y = (posicao - x) / width;
    if (x > 0) entrar(x - 1, y);
    if (x < width - 1) entrar(x + 1, y);
    if (y > 0) entrar(x, y - 1);
    if (y < height - 1) entrar(x, y + 1);
  }

  let esquerda = width;
  let direita = -1;
  let topo = height;
  let base = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const posicao = y * width + x;
      if (visto[posicao]) {
        data[posicao * 4 + 3] = 0;
        continue;
      }
      // Borda suavizada: o pixel do robo que encosta no fundo fica meio transparente (sem serrilhado nem halo duro).
      const encosta = (x > 0 && visto[posicao - 1]) || (x < width - 1 && visto[posicao + 1]) || (y > 0 && visto[posicao - width]) || (y < height - 1 && visto[posicao + width]);
      if (encosta) data[posicao * 4 + 3] = 150;
      if (x < esquerda) esquerda = x;
      if (x > direita) direita = x;
      if (y < topo) topo = y;
      if (y > base) base = y;
    }
  }
  if (direita < 0) throw new Error(`O recorte de ${path.basename(arquivo)} ficou vazio.`);
  const recorte = { left: esquerda, top: topo, width: direita - esquerda + 1, height: base - topo + 1 };
  return sharp(data, { raw: { width, height, channels: 4 } }).extract(recorte).png().toBuffer();
}

const conferir = process.argv.includes("--conferir");
await mkdir(DESTINO, { recursive: true });
if (conferir) await mkdir(path.join(RAIZ, "dados", "diag"), { recursive: true });

for (const { nome, arquivo, caixa, lado, tolerancia } of IMAGENS) {
  const recortada = await semFundo(path.join(ORIGEM, arquivo), caixa, tolerancia);
  const saida = await sharp(recortada)
    .resize({ ...lado, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 86, alphaQuality: 90 })
    .toBuffer();
  await sharp(saida).toFile(path.join(DESTINO, `${nome}.webp`));
  const medidas = await sharp(saida).metadata();
  console.log(`${nome}.webp  ${medidas.width}x${medidas.height}  ${(saida.length / 1024).toFixed(1)} KB`);
  if (conferir) {
    // Ampliado e sobre fundo escuro: e assim que um pedaco comido do robo ou um halo de fundo aparecem.
    await sharp(recortada).resize({ height: 700 }).flatten({ background: "#1f2937" }).png().toFile(path.join(RAIZ, "dados", "diag", `mascote-${nome}.png`));
  }
}

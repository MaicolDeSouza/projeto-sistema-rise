import "dotenv/config";

/**
 * ROTEIRO MANUAL do Nano Banana, com a chave de verdade. **COBRA**: manda UMA foto ao Nano Banana 2 e ao
 * Nano Banana Pro, com o prompt padrao, e cada resposta boa custa dinheiro (cerca de US$ 0,20 no total, uns
 * R$ 1,20). Por isso so roda com `--confirmo`.
 *
 *   node scripts/teste-nano-banana.js --confirmo --foto C:/caminho/da/foto.jpg
 *
 * Serve para duas coisas, que o teste automatico nao alcanca (ele usa o Google falso):
 *  1. CONFIRMAR O FORMATO do corpo (`montarPedido` e `lerResposta`, em src/lib/integracoes/nanobanana.js): o
 *     roteiro imprime a ESTRUTURA da resposta (as chaves, sem o conteudo da imagem). Se o Google recusar o
 *     corpo classico ou responder em outro formato, so essas duas funcoes mudam;
 *  2. COMPARAR os dois modelos lado a lado: as imagens saem em dados/temporarios/teste-nano-banana/ (pasta
 *     fora do git, pode apagar) para olhar com o dono se o produto e o MESMO (forma, cores, conectores,
 *     textos).
 *
 * Le GEMINI_API_KEY do .env. Nao exige NANO_BANANA_GERACAO=true (e um teste de bancada, nao a tela), mas avisa
 * se estiver desligada. NUNCA imprime a chave nem o base64 da imagem.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { register } from "node:module";

import sharp from "sharp";

register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { MODELOS, PROMPT_PADRAO, enderecoDoModelo, lerResposta, montarPedido } = await import(
  "../src/lib/integracoes/nanobanana.js"
);

const argumentos = process.argv.slice(2);
const confirmou = argumentos.includes("--confirmo");
const posicaoDaFoto = argumentos.indexOf("--foto");
const caminhoDaFoto = posicaoDaFoto >= 0 ? argumentos[posicaoDaFoto + 1] : null;

if (!confirmou || !caminhoDaFoto) {
  console.log("Este roteiro COBRA do Google (cerca de US$ 0,20 no total, uns R$ 1,20).");
  console.log("Uso: node scripts/teste-nano-banana.js --confirmo --foto <caminho da foto>");
  process.exit(2);
}

const chave = (process.env.GEMINI_API_KEY ?? "").trim();
if (!chave) {
  console.error("GEMINI_API_KEY esta vazia no .env: crie a chave em aistudio.google.com, ative o faturamento e cole la.");
  process.exit(2);
}
if ((process.env.NANO_BANANA_GERACAO ?? "").trim().toLowerCase() !== "true") {
  console.log("Aviso: NANO_BANANA_GERACAO nao esta em true, entao a TELA ainda nao gera. Este roteiro nao depende dela.\n");
}

/**
 * A estrutura de um JSON sem o conteudo: texto longo (como o base64 de uma imagem) vira so o tamanho, e a chave
 * e o texto da foto nunca saem na tela.
 */
function formaDe(valor) {
  if (typeof valor === "string") return valor.length > 60 ? `<texto de ${valor.length} caracteres>` : valor;
  if (Array.isArray(valor)) return valor.map(formaDe);
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, formaDe(v)]));
  return valor;
}

const bytes = await readFile(caminhoDaFoto);
const meta = await sharp(bytes).metadata();
const tipo = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }[meta.format];
if (!tipo) {
  console.error(`Formato ${meta.format ?? "desconhecido"} nao aceito: use JPG, PNG ou WebP.`);
  process.exit(2);
}
console.log(`Foto: ${path.basename(caminhoDaFoto)} (${meta.width}x${meta.height}, ${meta.format}, ${Math.round(bytes.length / 1024)} KB)`);

const pasta = path.join(process.cwd(), "dados", "temporarios", "teste-nano-banana");
await mkdir(pasta, { recursive: true });

let custoUsd = 0;
for (const modelo of ["nano-banana-2", "nano-banana-pro"]) {
  console.log(`\n== ${MODELOS[modelo].nome} (${MODELOS[modelo].id}) ==`);
  const pedido = montarPedido({ prompt: PROMPT_PADRAO, original: { bytes, mimeType: tipo }, extras: [], aceitaExtras: true });

  const inicio = Date.now();
  let resposta;
  try {
    resposta = await fetch(enderecoDoModelo(modelo), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify(pedido),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (erro) {
    console.log(`Nao chegou ao Google: ${erro?.name === "TimeoutError" ? "tempo esgotado (120 s)" : erro?.message}`);
    continue;
  }
  const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
  const texto = await resposta.text();
  console.log(`HTTP ${resposta.status} em ${duracao} s`);

  let corpo = null;
  try {
    corpo = JSON.parse(texto);
  } catch {
    console.log(`A resposta nao e JSON: ${texto.slice(0, 200)}`);
    continue;
  }
  // As chaves, para confirmar o formato. O conteudo da imagem nunca e impresso.
  console.log("Estrutura da resposta:");
  console.log(JSON.stringify(formaDe(corpo), null, 2));

  if (!resposta.ok) {
    console.log(`Recusado: ${corpo?.error?.message ?? "sem mensagem"}`);
    continue;
  }
  const lida = lerResposta(corpo);
  if (!lida.ok) {
    console.log(`Sem imagem: ${lida.erro}`);
    continue;
  }
  const geradaMeta = await sharp(lida.bytes).metadata();
  const destino = path.join(pasta, `${modelo}.${geradaMeta.format === "jpeg" ? "jpg" : geradaMeta.format}`);
  await writeFile(destino, lida.bytes);
  custoUsd += MODELOS[modelo].usd;
  console.log(`Imagem: ${geradaMeta.width}x${geradaMeta.height} ${geradaMeta.format}, ${Math.round(lida.bytes.length / 1024)} KB -> ${path.relative(process.cwd(), destino)}`);
}

console.log(`\nGasto estimado neste roteiro: US$ ${custoUsd.toFixed(3)}. Compare as imagens com a original: o produto e o mesmo?`);

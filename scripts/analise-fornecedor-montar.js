/**
 * Monta a pagina da analise de lista de fornecedor (roteiro em src/lib/analiseFornecedor/roteiro.js, passo 6): o modelo
 * padrao com os DADOS e as fotos reduzidas a 300 px (JPEG). So calcula e grava o HTML; nao fala com o Rise.
 *
 *   node scripts/analise-fornecedor-montar.js --dados=<dados.json> [--fotos=<fotos.json>] --saida=<pagina.html>
 *
 * fotos.json: { "n<numero do item>": "data:image/...;base64,..." ou o caminho de um arquivo de imagem }. Foto que nao se
 * le fica de fora (o cartao mostra "sem foto") e entra no aviso do fim.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { lerModeloDaAnalise, montarPagina } from "../src/lib/analiseFornecedor/montar.js";

const argumento = (nome) => process.argv.find((arg) => arg.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? null;
const arquivoDados = argumento("dados");
const arquivoFotos = argumento("fotos");
const saida = argumento("saida");
if (!arquivoDados || !saida) {
  console.error("Uso: node scripts/analise-fornecedor-montar.js --dados=<dados.json> [--fotos=<fotos.json>] --saida=<pagina.html>");
  process.exit(2);
}

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dados = JSON.parse(readFileSync(arquivoDados, "utf8"));
const fotosBrutas = arquivoFotos ? JSON.parse(readFileSync(arquivoFotos, "utf8")) : {};
const fotos = {};
const falharam = [];
for (const [chave, origem] of Object.entries(fotosBrutas)) {
  try {
    const bytes = String(origem).startsWith("data:") ? Buffer.from(String(origem).slice(String(origem).indexOf(",") + 1), "base64") : readFileSync(String(origem));
    // Uma foto so por item, no tamanho da lista: miniatura no cartao, 3x no mouse e grande no clique.
    const jpg = await sharp(bytes).flatten({ background: "#ffffff" }).resize(300, 300, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 70, mozjpeg: true }).toBuffer();
    fotos[chave] = `data:image/jpeg;base64,${jpg.toString("base64")}`;
  } catch (erro) {
    falharam.push(`${chave} (${erro.message})`);
  }
}
const html = montarPagina(await lerModeloDaAnalise(raiz), dados, Object.keys(fotos).length ? fotos : null);
writeFileSync(saida, html);
const comOferta = dados.itens.filter((item) => item.ofertas.length).length;
console.log(`ok ${saida}: ${(html.length / 1024).toFixed(0)} KB · ${dados.itens.length} itens (${comOferta} com concorrente) · ${Object.keys(fotos).length} fotos${falharam.length ? ` · fotos que não se leram: ${falharam.join(", ")}` : ""}`);

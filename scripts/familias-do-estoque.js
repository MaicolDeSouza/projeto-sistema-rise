import "dotenv/config";

/**
 * Carrega a FAMILIA de cada produto (Topo > Folha) da arvore de categorias do dono (docs/categorias-4hobby-mapeamento.csv,
 * trabalho de 06-21/10/2026) em `Produto.familiaEstoque`, para a regra "parecidos nunca vizinhos" do Mapa do estoque.
 * So escreve essa coluna: nada da Loja Integrada, do Bling nem da localizacao muda.
 *
 *   node scripts/familias-do-estoque.js --simular     (padrao: so conta)
 *   node scripts/familias-do-estoque.js --confirmo    (grava)
 *
 * Fica sem familia o produto "NÃO PUBLICAR"/"SEM CATEGORIA" e o que nao esta no CSV (cadastrado depois de 20/10/2026): para
 * esses a regra usa o nome.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const confirmar = process.argv.includes("--confirmo");
const ARQUIVO = fileURLToPath(new URL("../docs/categorias-4hobby-mapeamento.csv", import.meta.url));

/** Uma linha do CSV com ";" e aspas (o titulo pode ter ";" dentro das aspas). */
function campos(linha) {
  const saida = [];
  let atual = "";
  let entreAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const letra = linha[i];
    if (letra === '"') {
      if (entreAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else entreAspas = !entreAspas;
    } else if (letra === ";" && !entreAspas) {
      saida.push(atual);
      atual = "";
    } else atual += letra;
  }
  saida.push(atual);
  return saida.map((valor) => valor.trim());
}

const SEM_FAMILIA = new Set(["NÃO PUBLICAR", "SEM CATEGORIA", ""]);
const linhas = readFileSync(ARQUIVO, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
const cabecalho = campos(linhas[0]);
const [iSku, iTopo, iFolha] = ["sku", "nivel1", "nivel2"].map((nome) => cabecalho.indexOf(nome));
const familiaPorSku = new Map();
for (const linha of linhas.slice(1)) {
  const valores = campos(linha);
  const topo = valores[iTopo];
  const folha = valores[iFolha];
  if (SEM_FAMILIA.has(topo)) continue;
  familiaPorSku.set(valores[iSku].toUpperCase(), folha ? `${topo} > ${folha}` : topo);
}

const { prisma } = await import("../src/lib/db.js");
try {
  const produtos = await prisma.produto.findMany({ select: { id: true, sku: true, familiaEstoque: true } });
  const mudar = [];
  let semNoCsv = 0;
  for (const produto of produtos) {
    const familia = familiaPorSku.get(produto.sku.toUpperCase()) ?? null;
    if (!familia) semNoCsv++;
    if (familia && familia !== produto.familiaEstoque) mudar.push({ id: produto.id, familia });
  }
  const familias = new Set(familiaPorSku.values());
  console.log(`CSV: ${familiaPorSku.size} produtos com familia, ${familias.size} familias.`);
  console.log(`Rise: ${produtos.length} produtos; ${mudar.length} a gravar; ${semNoCsv} sem familia no CSV (a regra usa o nome).`);
  if (!confirmar) {
    console.log("Simulacao: nada gravado. Use --confirmo para gravar.");
  } else {
    // SQL direto, um por produto, para nao mexer no `atualizadoEm` (o rascunho automatico do cadastro o compara).
    for (const { id, familia } of mudar) await prisma.$executeRaw`UPDATE "Produto" SET "familiaEstoque" = ${familia} WHERE "id" = ${id}`;
    console.log(`Gravados: ${mudar.length}.`);
  }
} finally {
  await prisma.$disconnect();
}

/**
 * Confere, antes da migracao para a VPS (Linux), que todo arquivo que o banco aponta existe no disco com o
 * nome EXATO, inclusive a caixa da pasta do SKU. So le: nao corrige nada.
 *
 *   npm run auditar:arquivos
 *
 * O Windows acha `ABC1/imagens/x.jpg` quando o banco pede `abc1/imagens/x.jpg`; o Linux nao. Sem esta
 * conferencia o defeito so apareceria como foto quebrada (404) depois da virada.
 *
 * Termina com codigo 1 quando ha qualquer problema, para poder travar um roteiro.
 */

import "dotenv/config";
const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const path = (await import("node:path")).default;
const { readdir } = await import("node:fs/promises");
const { RAIZ, PASTAS, PASTA_RESERVA } = await import("../src/lib/arquivos.js");
const { conferirNomes } = await import("../src/lib/auditoriaArquivos.js");
const { prisma } = await import("../src/lib/db.js");

/// Pasta que nao existe e pasta vazia dizem a mesma coisa aqui: nenhum dos nomes esperados esta la.
async function listar(pasta) {
  try {
    return await readdir(pasta);
  } catch (erro) {
    if (erro.code === "ENOENT") return [];
    throw erro;
  }
}

const problemas = [];
function anotar(sku, pasta, nome, motivo) {
  problemas.push(`${sku}  ${pasta}  ${nome}  ${motivo}`);
}

try {
  const linhas = await prisma.produtoArquivo.findMany({
    select: { arquivo: true, tipo: true, papel: true, produto: { select: { sku: true } } },
  });

  // sku -> pasta -> nomes. A reserva tem pasta propria (ver PASTA_RESERVA em arquivos.js).
  const porSku = new Map();
  for (const linha of linhas) {
    const sku = linha.produto.sku;
    const pasta = linha.papel === "RESERVA" ? PASTA_RESERVA : PASTAS[linha.tipo];
    if (!pasta) {
      anotar(sku, "?", linha.arquivo, `tipo ${linha.tipo} sem pasta conhecida`);
      continue;
    }
    if (!porSku.has(sku)) porSku.set(sku, new Map());
    const pastas = porSku.get(sku);
    if (!pastas.has(pasta)) pastas.set(pasta, []);
    pastas.get(pasta).push(linha.arquivo);
  }

  // 1. A pasta do SKU, com a caixa exata.
  const pastasDeSku = conferirNomes([...porSku.keys()], await listar(RAIZ));
  const skusSemPasta = new Set(pastasDeSku.faltando);
  for (const { esperado, encontrado } of pastasDeSku.caixaDiferente) {
    skusSemPasta.add(esperado);
    anotar(esperado, "(pasta do SKU)", encontrado, "caixa diferente no disco");
  }
  for (const sku of pastasDeSku.faltando) {
    const total = [...porSku.get(sku).values()].reduce((soma, nomes) => soma + nomes.length, 0);
    anotar(sku, "(pasta do SKU)", "-", `nao existe (${total} arquivo(s) no banco)`);
  }

  // 2. Dentro de cada SKU: a subpasta e cada arquivo, com a caixa exata.
  for (const [sku, pastas] of porSku) {
    if (skusSemPasta.has(sku)) continue;
    const subpastas = conferirNomes([...pastas.keys()], await listar(path.join(RAIZ, sku)));
    const subpastasRuins = new Set([...subpastas.faltando, ...subpastas.caixaDiferente.map((item) => item.esperado)]);
    for (const pasta of subpastas.faltando) anotar(sku, pasta, "-", `pasta nao existe (${pastas.get(pasta).length} arquivo(s))`);
    for (const { esperado, encontrado } of subpastas.caixaDiferente) anotar(sku, esperado, encontrado, "caixa diferente na pasta");

    for (const [pasta, nomes] of pastas) {
      if (subpastasRuins.has(pasta)) continue;
      const resultado = conferirNomes(nomes, await listar(path.join(RAIZ, sku, pasta)));
      for (const nome of resultado.faltando) anotar(sku, pasta, nome, "nao existe no disco");
      for (const { esperado, encontrado } of resultado.caixaDiferente) anotar(sku, pasta, esperado, `no disco como ${encontrado}`);
    }
  }

  if (problemas.length === 0) {
    console.log(`Nenhum problema em ${linhas.length} arquivo(s) de ${porSku.size} produto(s).`);
  } else {
    console.log("SKU  pasta  arquivo  problema");
    for (const linha of problemas) console.log(linha);
    console.log(`\n${problemas.length} problema(s) em ${linhas.length} arquivo(s) de ${porSku.size} produto(s).`);
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}

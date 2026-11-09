import "dotenv/config";

/**
 * Marca como PADRAO o fornecedor dos produtos que tem UM fornecedor so e nenhum padrao (pedido do dono em 08/11/2026:
 * "sempre que o produto tiver um unico fornecedor automaticamente deve marcar aquele como padrao"). Dai em diante a
 * regra vale sozinha (`garantirPadraoDoUnico` em src/lib/fornecedorPadraoBanco.js, e a aba Fornecedores); este script
 * corrige os que ja estavam assim, como os vinculos que a lupa do Claude e o AliExpress criavam sem padrao (os
 * eletroimas 940501, 121208 e 940503 ficaram sem preco na proposta por isso).
 *
 *   node scripts/fornecedor-padrao-unico.js --simular    # so lista
 *   node scripts/fornecedor-padrao-unico.js --confirmo   # grava
 *
 * Na VPS, pela entrada do comando (nada fica no disco de la):
 *   ssh -i ~/.ssh/rise_vps rise@179.199.150.221 \
 *     "cd /srv/rise/app && docker compose exec -T app node --input-type=module - --simular" < scripts/fornecedor-padrao-unico.js
 *
 * A mesma regra de `garantirPadraoDoUnico`, repetida aqui de proposito: o script roda na VPS pela entrada, antes de o
 * codigo novo subir. Fica de fora o produto cujo fornecedor do Bling em rascunho ainda vale (a aba mostra dois
 * fornecedores e o rascunho e o padrao). O custo do produto passa a ser o do vinculo, menos no produto com pecas proprias
 * (o custo e o das pecas) e no vinculo sem custo (nao apaga o custo que o produto tem). Nada vai ao Bling.
 */

import { existsSync } from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Dentro do conteiner da VPS o script chega pela entrada e `import.meta.url` nao aponta para a pasta do projeto.
const RAIZ = existsSync("/app/scripts/resolver-alias.js") ? "/app" : process.cwd();
register(pathToFileURL(`${RAIZ}/scripts/resolver-alias.js`), pathToFileURL(`${RAIZ}/`));

const { prisma } = await import("@/lib/db.js");
const { rascunhoVale } = await import("@/lib/fornecedorRascunho.js");

const argumentos = process.argv.slice(2);
const simular = argumentos.includes("--simular");
const confirmo = argumentos.includes("--confirmo");
if (!simular && !confirmo) {
  console.error("Use --simular para so listar, ou --confirmo para gravar.");
  process.exit(2);
}

try {
  const candidatos = await prisma.produto.findMany({
    where: { fornecedores: { some: {}, none: { padrao: true } } },
    orderBy: { sku: "asc" },
    select: {
      id: true,
      sku: true,
      tituloBase: true,
      custo: true,
      pecasProprias: true,
      fornecedorRascunho: true,
      fornecedores: { select: { id: true, padrao: true, precoCusto: true, codigo: true, fornecedor: { select: { nome: true } } } },
    },
  });
  const alvos = candidatos.filter(
    (produto) => produto.fornecedores.length === 1 && !rascunhoVale(produto.fornecedores, produto.fornecedorRascunho),
  );
  const comRascunho = candidatos.filter(
    (produto) => produto.fornecedores.length === 1 && rascunhoVale(produto.fornecedores, produto.fornecedorRascunho),
  ).length;
  const varios = candidatos.filter((produto) => produto.fornecedores.length > 1).length;

  console.log(`Produtos sem fornecedor padrao: ${candidatos.length}`);
  console.log(`  com UM fornecedor (a corrigir): ${alvos.length}`);
  console.log(`  com um fornecedor e o rascunho do Bling valendo (ficam): ${comRascunho}`);
  console.log(`  com varios fornecedores (ficam: o dono escolhe): ${varios}`);
  for (const produto of alvos) {
    const [vinculo] = produto.fornecedores;
    const custoNovo = produto.pecasProprias || vinculo.precoCusto == null ? produto.custo : vinculo.precoCusto;
    console.log(
      `- ${produto.sku} | ${String(produto.tituloBase).slice(0, 50)} | ${vinculo.fornecedor.nome} ${vinculo.codigo ?? ""} | custo ${produto.custo ?? "-"} -> ${custoNovo ?? "-"}`,
    );
  }

  if (confirmo) {
    let gravados = 0;
    for (const produto of alvos) {
      const [vinculo] = produto.fornecedores;
      await prisma.$transaction(async (tx) => {
        await tx.produtoFornecedor.update({ where: { id: vinculo.id }, data: { padrao: true } });
        if (!produto.pecasProprias && vinculo.precoCusto != null) {
          await tx.produto.update({ where: { id: produto.id }, data: { custo: vinculo.precoCusto } });
        }
      });
      gravados++;
    }
    console.log(`\nGravado: ${gravados} fornecedor(es) marcado(s) como padrao.`);
  } else {
    console.log("\nSimulacao: nada foi gravado. Use --confirmo para gravar.");
  }
} finally {
  await prisma.$disconnect();
}

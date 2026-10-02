import "dotenv/config";

/**
 * Testes do Canais de Venda / Mercado Livre (fase 1): o banco (varios anuncios por
 * produto, dados do anuncio, configuracao do canal, versiculos) e, nas tarefas
 * seguintes, as regras puras e as acoes. Usa o Postgres, SEM rede.
 *
 *   npm run teste:anuncios-ml
 *
 * Os produtos de teste levam SKU "ZZ-ML-..." e sao apagados no comeco de cada bloco
 * e no fim, com os anuncios deles (Cascade).
 *
 * Como ampliar: cada tarefa acrescenta UM bloco `{ ... }` dentro do try, antes do
 * comentario "Blocos das tarefas seguintes". O bloco abre com um console.log do titulo
 * e, se mexe no banco, com `await limpar()`.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("../src/lib/db.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

// O banco e o de verdade (compartilhado), entao so se apaga o que o teste criou.
async function limpar() {
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-ML-" } } });
}

try {
  {
    console.log("\nBanco: anuncios por canal");
    await limpar();

    const p = await prisma.produto.create({ data: { sku: "ZZ-ML-1", tituloBase: "Produto de teste ML", conferido: true } });
    await prisma.anuncio.create({ data: { produtoId: p.id, canal: "MERCADO_LIVRE", dados: { tipoAnuncio: "gold_special" } } });
    await prisma.anuncio.create({ data: { produtoId: p.id, canal: "MERCADO_LIVRE", dados: { tipoAnuncio: "gold_pro" } } });
    conferir("dois anuncios ML do mesmo produto", await prisma.anuncio.count({ where: { produtoId: p.id, canal: "MERCADO_LIVRE" } }), 2);

    // O Bling guarda um anuncio por produto: o indice parcial do SQL e quem garante isso.
    await prisma.anuncio.create({ data: { produtoId: p.id, canal: "BLING" } });
    let recusado = false;
    try {
      await prisma.anuncio.create({ data: { produtoId: p.id, canal: "BLING" } });
    } catch (e) {
      recusado = e.code === "P2002";
    }
    conferir("Bling continua com um anuncio por produto", recusado, true);

    conferir(
      "dados volta como JSON",
      (await prisma.anuncio.findFirst({ where: { produtoId: p.id, canal: "MERCADO_LIVRE" }, orderBy: { criadoEm: "asc" } })).dados,
      { tipoAnuncio: "gold_special" },
    );
  }

  // Blocos das tarefas seguintes entram aqui, antes do finally.
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTodos os testes de anuncios ML OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);

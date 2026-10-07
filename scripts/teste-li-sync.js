import "dotenv/config";

/**
 * Testes da sincronizacao Rise -> Loja Integrada (plano de 06/10/2026): o banco, as
 * regras puras (slug, SEO, descricao, campos, corpo, rascunho, validacao, icone) e o
 * envio, sempre contra uma LOJA INTEGRADA FALSA em memoria. Usa o Postgres, SEM rede:
 * nenhum teste fala com a LI real.
 *
 *   npm run teste:li-sync
 *
 * Os produtos de teste levam SKU "ZZ-LI-..."; tudo e apagado no comeco de cada bloco e
 * no fim (anuncios e copias saem junto com o produto, por Cascade).
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

async function limpar() {
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-LI-" } } });
}

try {
  {
    console.log("\nBanco: tipoProducao e CopiaProdutoCanal");
    await limpar();
    const produto = await prisma.produto.create({ data: { sku: "ZZ-LI-1", tituloBase: "Teste LI" } });
    conferir("produto novo nasce REVENDA", produto.tipoProducao, "REVENDA");
    const fabricado = await prisma.produto.update({ where: { id: produto.id }, data: { tipoProducao: "FABRICACAO_PROPRIA" } });
    conferir("aceita FABRICACAO_PROPRIA", fabricado.tipoProducao, "FABRICACAO_PROPRIA");
    await prisma.copiaProdutoCanal.create({
      data: { canal: "LOJA_INTEGRADA", produtoId: produto.id, conteudo: { nome: "x" }, alteracoes: [{ campo: "nome", de: "x", para: "y" }] },
    });
    conferir("copia por canal gravada", await prisma.copiaProdutoCanal.count({ where: { produtoId: produto.id, canal: "LOJA_INTEGRADA" } }), 1);
    await prisma.produto.delete({ where: { id: produto.id } });
    conferir("copia sai com o produto (Cascade)", await prisma.copiaProdutoCanal.count({ where: { produtoId: produto.id } }), 0);
  }

  // Blocos das tarefas seguintes entram aqui, antes do finally.
} catch (erro) {
  falhas++;
  console.log(`FALHA inesperada: ${erro.stack ?? erro.message}`);
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTodos os testes da sincronizacao com a Loja Integrada OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);

import "dotenv/config";

/**
 * Testes do AliExpress no modulo Compras (spec 2026-10-28-aliexpress-em-compras-design.md): regras puras, a chave da
 * extensao, a importacao, o casamento com o produto e o deposito Virtual contra um Bling falso. SEM rede.
 *
 *   npm run teste:aliexpress            (apaga o que criou no fim)
 *   npm run teste:aliexpress -- --manter (deixa os ZZ no banco, para conferir a tela)
 *
 * So escreve produtos ZZ-ALI-*, fornecedores "ZZ Ali *" e os pedidos deles, apagados no comeco e no fim. O fornecedor
 * marcado como o do AliExpress (o "Ali" do dono) e a conexao ALIEXPRESS voltam ao que eram.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const manter = process.argv.includes("--manter");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

// ---------------------------------------------------------------------------
// Regras puras (sem banco)
// ---------------------------------------------------------------------------

// Marcador: os blocos puros entram acima desta linha.

// ---------------------------------------------------------------------------
// Banco (Postgres local)
// ---------------------------------------------------------------------------

const { prisma } = await import("../src/lib/db.js");
const { fornecedorDoAliExpress, marcarFornecedorDoAliExpress } = await import("../src/lib/compras/aliexpress/fornecedor.js");

async function limpar() {
  await prisma.pedidoDeCompra.deleteMany({ where: { fornecedor: { nome: { startsWith: "ZZ Ali" } } } });
  await prisma.pedidoDeCompra.deleteMany({ where: { itens: { some: { produto: { sku: { startsWith: "ZZ-ALI" } } } } } });
  await prisma.produtoFornecedor.deleteMany({ where: { produto: { sku: { startsWith: "ZZ-ALI" } } } });
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-ALI" } } });
  await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: "ZZ Ali" } } });
}

// O "Ali" do dono: marcado de novo no fim de cada bloco que troca a marca.
const fornecedorOriginal = await fornecedorDoAliExpress();
async function devolverMarca() {
  if (fornecedorOriginal) await marcarFornecedorDoAliExpress(fornecedorOriginal.id);
  else await prisma.fornecedor.updateMany({ where: { aliexpress: true }, data: { aliexpress: false } });
}

await limpar();
try {
  {
    console.log("\nFornecedor do AliExpress");
    const a = await prisma.fornecedor.create({ data: { nome: "ZZ Ali A", estrangeiro: true } });
    const b = await prisma.fornecedor.create({ data: { nome: "ZZ Ali B", estrangeiro: true } });
    conferir("marcar A", (await marcarFornecedorDoAliExpress(a.id)).ok, true);
    conferir("A e o fornecedor do AliExpress", (await fornecedorDoAliExpress())?.id, a.id);
    conferir("marcar B desmarca A", [(await marcarFornecedorDoAliExpress(b.id)).ok, (await fornecedorDoAliExpress())?.id], [true, b.id]);
    conferir("so um marcado", await prisma.fornecedor.count({ where: { aliexpress: true } }), 1);
    conferir("indice unico barra dois marcados", await prisma.fornecedor.update({ where: { id: a.id }, data: { aliexpress: true } }).then(() => "gravou", (erro) => erro.code), "P2002");
    conferir("id inexistente recusa", (await marcarFornecedorDoAliExpress("nao-existe")).ok, false);
    await devolverMarca();
    conferir("devolveu a marca do dono", (await fornecedorDoAliExpress())?.id ?? null, fornecedorOriginal?.id ?? null);
  }

  // Marcador: os blocos de banco seguintes entram acima desta linha.
} finally {
  await devolverMarca();
  if (!manter) await limpar();
  await prisma.$disconnect();
}

console.log(`\n${falhas === 0 ? "Tudo certo." : `${falhas} falha(s).`}`);
process.exit(falhas === 0 ? 0 : 1);

import "dotenv/config";

/**
 * Testes da sincronizacao Rise <-> Bling (plano de 04/10/2026): o estado de
 * sincronizacao no banco e, nas tarefas seguintes, as regras puras e as acoes, sempre
 * contra um Bling FALSO em memoria. Usa o Postgres, SEM rede: nenhum teste fala com o
 * Bling real.
 *
 *   npm run teste:bling-sync
 *
 * Os produtos de teste levam SKU "ZZ-BS-..." e os fornecedores "ZZ Teste BS...";
 * tudo e apagado no comeco de cada bloco e no fim (os movimentos e as copias de
 * seguranca saem junto com o produto, por Cascade).
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
  // Produto primeiro: leva junto os vinculos, os movimentos de estoque e as copias
  // de seguranca (Cascade). O fornecedor so pode sair depois dos vinculos (Restrict).
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-BS-" } } });
  await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: "ZZ Teste BS" } } });
}
await limpar();

try {
  // -------------------------------------------------------------------------
  // Banco: estado do Bling
  // -------------------------------------------------------------------------
  {
    console.log("\nBanco: estado do Bling");
    await limpar();

    const produto = await prisma.produto.create({
      data: { sku: "ZZ-BS-1", tituloBase: "Produto de teste da sincronizacao com o Bling", estoque: 5 },
    });
    const id = produto.id;
    const ler = () => prisma.produto.findUnique({ where: { id } });

    const novo = await ler();
    conferir("produto novo nasce nunca sincronizado", novo.blingSincronizadoEm, null);
    conferir("produto novo nasce sem assinatura", novo.blingAssinatura, null);
    conferir("produto novo nasce sem saldo do Bling", novo.blingSaldo, null);

    // O ajuste de estoque nasce pendente: so a sincronizacao o marca como enviado.
    const movimento = await prisma.movimentoEstoque.create({
      data: { produtoId: id, tipo: "ENTRADA", quantidade: 3, saldoAnterior: 5, saldoNovo: 8 },
    });
    conferir("movimento novo nasce pendente (enviadoAoBlingEm nulo)", movimento.enviadoAoBlingEm, null);
    const lido = await prisma.movimentoEstoque.findUnique({ where: { id: movimento.id } });
    conferir("e continua pendente ao ler do banco", lido.enviadoAoBlingEm, null);

    // O saldo do Bling e virtual (com reservas) e pode ser negativo.
    await prisma.produto.update({ where: { id }, data: { blingSaldo: -2 } });
    conferir("blingSaldo aceita negativo", (await ler()).blingSaldo, -2);

    // Copias de seguranca: uma por envio, ligadas ao produto.
    for (let i = 1; i <= 4; i++) {
      await prisma.blingCopiaProduto.create({
        data: {
          produtoId: id,
          conteudo: { nome: `Copia ${i}`, preco: i },
          // So as copias pares trazem o resumo "campo: de -> para"; as outras ficam sem.
          ...(i % 2 === 0 ? { alteracoes: [{ campo: "preco", de: i - 1, para: i }] } : {}),
        },
      });
    }
    const copias = await prisma.blingCopiaProduto.findMany({ where: { produtoId: id } });
    conferir("4 copias de seguranca gravadas", copias.length, 4);
    conferir("a copia guarda o conteudo em JSON", copias.map((c) => c.conteudo.nome).sort(), ["Copia 1", "Copia 2", "Copia 3", "Copia 4"]);
    // O JSONB do Postgres reordena as chaves do objeto, entao se compara campo a campo.
    const semResumo = copias.find((c) => c.conteudo.nome === "Copia 1");
    const comResumo = copias.find((c) => c.conteudo.nome === "Copia 2");
    conferir("alteracoes e opcional: nula na copia sem resumo", semResumo.alteracoes, null);
    conferir(
      "alteracoes guarda o resumo campo: de -> para",
      comResumo.alteracoes.map((a) => [a.campo, a.de, a.para]),
      [["preco", 1, 2]],
    );
    conferir("a copia tem data de criacao", copias.every((c) => c.criadoEm instanceof Date), true);

    // Apagar o produto leva as copias e os movimentos (Cascade).
    await prisma.produto.delete({ where: { id } });
    conferir("apagar o produto apaga as copias de seguranca", await prisma.blingCopiaProduto.count({ where: { produtoId: id } }), 0);
    conferir("e apaga os movimentos", await prisma.movimentoEstoque.count({ where: { produtoId: id } }), 0);
  }

  // Blocos das tarefas seguintes entram aqui, antes do finally.
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTodos os testes da sincronizacao com o Bling OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);

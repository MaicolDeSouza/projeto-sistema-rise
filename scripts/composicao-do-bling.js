import "dotenv/config";

/**
 * Grava no Rise a composicao de um kit que JA foi importado do Bling como produto comum (antes de
 * 07/10/2026 o kit entrava sem as pecas; o primeiro foi o 990204). So LE o Bling (GET): nao passa
 * pela trava de escrita e nao muda nada la.
 *
 *   node scripts/composicao-do-bling.js <codigo do kit>
 *
 * Usa o mesmo caminho da importacao (`resolverPecasDoKit` + `gravarComposicao`): todas as pecas
 * tem que existir no Rise, senao nada e gravado e a saida diz quais faltam. Marca o produto como
 * COMPOSICAO e grava o estoque calculado pelas pecas.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("../src/lib/db.js");
const { blingGet } = await import("../src/lib/integracoes/bling.js");
const { resolverPecasDoKit } = await import("../src/lib/integracoes/importarBling.js");
const { gravarComposicao, lerPecasDoKit } = await import("../src/lib/composicaoBanco.js");

const codigo = String(process.argv[2] ?? "").trim();
if (!codigo) {
  console.error("Uso: node scripts/composicao-do-bling.js <codigo do kit>");
  process.exit(2);
}

try {
  const produto = await prisma.produto.findFirst({ where: { sku: { equals: codigo, mode: "insensitive" } }, select: { id: true, sku: true, tipo: true, blingId: true, estoque: true } });
  if (!produto) throw new Error(`O produto ${codigo} não existe no Rise.`);

  // O alvo e achado pelo CODIGO no Bling (mesma regra da sincronizacao), nao pelo blingId guardado.
  const busca = await blingGet("/produtos", { "codigos[]": [produto.sku] });
  const achados = (Array.isArray(busca.dados?.data) ? busca.dados.data : []).filter(
    (item) => String(item?.codigo ?? "").trim().toLowerCase() === produto.sku.toLowerCase(),
  );
  if (achados.length !== 1) throw new Error(`Esperava 1 produto ativo com o código ${produto.sku} no Bling, achei ${achados.length}.`);

  const detalhe = await blingGet(`/produtos/${achados[0].id}`);
  const bling = detalhe.dados?.data;
  if (!detalhe.ok || !bling) throw new Error(`Não foi possível ler o produto no Bling (HTTP ${detalhe.status}).`);
  if (bling.formato !== "E") throw new Error(`O ${produto.sku} não é composição no Bling (formato ${bling.formato}).`);

  const resolvido = await resolverPecasDoKit(bling);
  if (resolvido.erro) throw new Error(resolvido.erro);
  if (resolvido.faltam.length) throw new Error(`Faltam no Rise: ${resolvido.faltam.join(", ")}. Nada foi gravado.`);

  const estoque = await prisma.$transaction(async (tx) => {
    await tx.produto.update({ where: { id: produto.id }, data: { tipo: "COMPOSICAO" } });
    return gravarComposicao(produto.id, resolvido.pecas, tx);
  });

  const pecas = await lerPecasDoKit(produto.id);
  console.log(`${produto.sku}: tipo COMPOSICAO, ${pecas.length} peça(s), estoque ${produto.estoque} -> ${estoque} (calculado pelas peças)`);
  for (const peca of pecas) console.log(`  ${peca.componente.sku} x${peca.quantidade} (estoque ${peca.componente.estoque}) ${peca.componente.tituloBase}`);
} catch (erro) {
  console.error(`Erro: ${erro.message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

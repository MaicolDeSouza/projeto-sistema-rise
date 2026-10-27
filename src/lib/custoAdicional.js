import { custoDoProduto } from "@/lib/canaisDeVenda/custo";
import { custoTotal, normalizarAdicionais, somaDosAdicionais } from "@/lib/custoAdicionalRegras";
import { prisma } from "@/lib/db";

/**
 * O custo adicional da linha do fornecedor no banco (regras em `custoAdicionalRegras.js`; pedido do dono em 24/10/2026).
 * `precoCusto` continua sendo o custo TOTAL que o resto do Rise le (margem, proposta, Bling, indicadores, foto mensal);
 * `precoFornecedor` e o que o fornecedor cobra (a varredura escreve nele) e `adicionaisValor` guarda a soma de agora,
 * para a varredura refazer o total em SQL sem ler os produtos vinculados.
 */

// Cadeia maxima de "produto que usa produto" (o cabo dentro do Arduino dentro de um kit...). Protege contra ciclo.
const PROFUNDIDADE = 5;

const SELECAO_DO_VINCULO = {
  id: true, produtoId: true, padrao: true, precoCusto: true, precoFornecedor: true, adicionais: true, adicionaisValor: true,
};

const comoNumero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

/**
 * O custo de hoje de cada produto (a regra da margem: fornecedor padrao, rascunho do Bling, cadastro), com o codigo e o
 * nome para a tela. Produto que nao existe mais nao entra.
 * @returns {Promise<Map<string, { sku: string, nome: string, custo: number|null }>>}
 */
export async function custosDosProdutos(ids, cliente = prisma) {
  const unicos = [...new Set((ids ?? []).filter(Boolean))];
  if (unicos.length === 0) return new Map();
  const produtos = await cliente.produto.findMany({
    where: { id: { in: unicos } },
    select: {
      id: true, sku: true, tituloBase: true, custo: true, pecasProprias: true, fornecedorRascunho: true,
      fornecedores: { where: { padrao: true }, select: { padrao: true, precoCusto: true } },
    },
  });
  return new Map(produtos.map((produto) => [produto.id, { sku: produto.sku, nome: produto.tituloBase, custo: custoDoProduto(produto).valor }]));
}

/**
 * Refaz a soma dos adicionais e o custo total dos vinculos dados, e grava so o que mudou. O vinculo padrao que mudou de
 * custo leva junto o `Produto.custo` (o mesmo espelho de `recalcularCusto`, no Salvar).
 * @returns {Promise<string[]>} os produtos cujo custo (o do vinculo padrao) mudou
 */
export async function recalcularVinculos(vinculos, cliente = prisma) {
  const vinculados = (vinculos ?? []).flatMap((vinculo) => normalizarAdicionais(vinculo.adicionais).filter((item) => item.produtoId).map((item) => item.produtoId));
  const custos = await custosDosProdutos(vinculados, cliente);
  const mudaram = new Set();
  for (const vinculo of vinculos ?? []) {
    const adicionais = normalizarAdicionais(vinculo.adicionais, vinculo.produtoId);
    const soma = adicionais.length > 0 ? somaDosAdicionais(adicionais, (id) => custos.get(id)?.custo ?? null).total : null;
    // Linha anterior aos adicionais sem `precoFornecedor`: o custo gravado e o preco do fornecedor.
    const base = comoNumero(vinculo.precoFornecedor ?? vinculo.precoCusto);
    const novo = custoTotal(base, soma ?? 0);
    const atual = comoNumero(vinculo.precoCusto);
    if (novo === atual && soma === comoNumero(vinculo.adicionaisValor) && base === comoNumero(vinculo.precoFornecedor)) continue;
    await cliente.produtoFornecedor.update({ where: { id: vinculo.id }, data: { precoCusto: novo, adicionaisValor: soma, precoFornecedor: base } });
    if (vinculo.padrao && novo !== atual) {
      await cliente.produto.update({ where: { id: vinculo.produtoId }, data: { custo: novo } });
      mudaram.add(vinculo.produtoId);
    }
  }
  return [...mudaram];
}

/** Os vinculos que tem algum destes produtos como adicional. */
export async function vinculosQueUsam(produtoIds, cliente = prisma) {
  const ids = [...new Set((produtoIds ?? []).filter(Boolean))];
  if (ids.length === 0) return [];
  const linhas = await cliente.$queryRaw`
    SELECT v.id FROM "ProdutoFornecedor" v
     WHERE jsonb_typeof(v."adicionais") = 'array'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(v."adicionais") e WHERE e->>'produtoId' = ANY(${ids}))`;
  if (linhas.length === 0) return [];
  return cliente.produtoFornecedor.findMany({ where: { id: { in: linhas.map((linha) => linha.id) } }, select: SELECAO_DO_VINCULO });
}

/** Os vinculos de um produto (para refazer o total depois do Salvar dele). */
export async function vinculosDoProduto(produtoId, cliente = prisma) {
  return cliente.produtoFornecedor.findMany({ where: { produtoId }, select: SELECAO_DO_VINCULO });
}

/**
 * Depois que o custo destes produtos mudou (o cabo foi salvo com outro custo, a varredura atualizou o fornecedor dele):
 * refaz os vinculos que os usam como adicional, e segue a cadeia (o Arduino que mudou pode ser adicional de outro).
 * @returns {Promise<string[]>} os produtos que mudaram de custo por causa disso
 */
export async function recalcularQuemUsa(produtoIds, cliente = prisma) {
  const todos = new Set();
  let fila = [...new Set(produtoIds ?? [])];
  // Cada rodada segue com TUDO o que mudou, mesmo o que ja estava na fila: na varredura o cabo e o Arduino mudam juntos,
  // e o kit que usa o Arduino foi refeito na primeira rodada com o custo do Arduino ANTES de ele somar o cabo novo (o
  // teste pegou: 33,50 no lugar de 35,50). So o que mudou volta, entao a conta para sozinha; o limite e contra ciclo.
  for (let nivel = 0; nivel < PROFUNDIDADE && fila.length > 0; nivel++) {
    const mudaram = await recalcularVinculos(await vinculosQueUsam(fila, cliente), cliente);
    mudaram.forEach((id) => todos.add(id));
    fila = mudaram;
  }
  return [...todos];
}

/** Os produtos que dependem destes pelo adicional (em cadeia), sem gravar nada: para saber quem conferir com o Bling. */
export async function produtosQueDependem(produtoIds, cliente = prisma) {
  const vistos = new Set(produtoIds ?? []);
  const dependentes = new Set();
  let fila = [...vistos];
  for (let nivel = 0; nivel < PROFUNDIDADE && fila.length > 0; nivel++) {
    const donos = [...new Set((await vinculosQueUsam(fila, cliente)).map((vinculo) => vinculo.produtoId))];
    fila = donos.filter((id) => !vistos.has(id));
    fila.forEach((id) => {
      vistos.add(id);
      dependentes.add(id);
    });
  }
  return [...dependentes];
}

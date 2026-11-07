/**
 * Os itens do pedido casados com o Produto do Rise e o custo congelado no dia (spec 5.4 e 5.6).
 *
 * O custo e congelado na primeira leitura porque o lucro de uma venda e o do custo DAQUELE dia: o fornecedor muda o
 * preco e o pedido antigo nao pode mudar de lucro junto. A ordem do custo e a mesma da foto mensal
 * (`coleta/fotos.js`): fornecedor padrao confirmado > rascunho do Bling > cadastro; o kit soma as pecas pelo mesmo
 * criterio e o produto com pecas proprias usa o `custo` do cadastro, que o Salvar grava como o total das pecas.
 */

const numero = (valor) => {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

/** `{ custo, origem }` de um produto ja lido com `fornecedores` e, no kit, `componentes[].componente`. Puro. */
export function custoCongeladoDoProduto(produto) {
  if (!produto) return { custo: null, origem: null };
  if (produto.tipo === "COMPOSICAO") {
    const pecas = Array.isArray(produto.componentes) ? produto.componentes : [];
    let soma = 0;
    for (const peca of pecas) {
      const { custo } = custoCongeladoDoProduto(peca?.componente);
      // Uma peca sem custo deixa o kit sem custo: somar so as outras daria um lucro inventado.
      if (custo === null) return { custo: null, origem: null };
      soma += custo * Number(peca?.quantidade ?? 0);
    }
    // 4 casas, como o custo do vinculo desde 06/11/2026 (10 resistores de R$ 0,0122 = R$ 0,122, e nao R$ 0,12).
    return pecas.length > 0 ? { custo: Math.round(soma * 10000) / 10000, origem: "kit" } : { custo: null, origem: null };
  }
  if (produto.pecasProprias) {
    const custo = numero(produto.custo);
    return custo === null ? { custo: null, origem: null } : { custo, origem: "pecas" };
  }
  const padrao = (produto.fornecedores ?? []).find((f) => f?.padrao && numero(f.precoFornecedor) !== null);
  // Fator (06/11/2026): o preco do fornecedor e o da caixa (5000 resistores); o custo e o de uma unidade, em 4 casas.
  if (padrao) return { custo: Math.round((numero(padrao.precoFornecedor) / (Number(padrao.fator) || 1)) * 10000) / 10000, origem: "fornecedorPadrao" };
  const rascunho = numero(produto.fornecedorRascunho?.precoCusto);
  if (rascunho !== null) return { custo: rascunho, origem: "rascunhoBling" };
  const cadastro = numero(produto.custo);
  if (cadastro !== null) return { custo: cadastro, origem: "cadastro" };
  return { custo: null, origem: null };
}

const INCLUIR_PRODUTO = {
  fornecedores: { select: { padrao: true, precoFornecedor: true, fator: true } },
  componentes: {
    select: {
      quantidade: true,
      componente: {
        select: {
          custo: true,
          tipo: true,
          pecasProprias: true,
          fornecedorRascunho: true,
          fornecedores: { select: { padrao: true, precoFornecedor: true, fator: true } },
        },
      },
    },
  },
};

const CANAL_DO_ANUNCIO = { MERCADO_LIVRE: "MERCADO_LIVRE", LOJA_INTEGRADA: "LOJA_INTEGRADA" };

/** Quantas unidades do produto base um kit do ML leva (a composicao do editor); 1 fora do kit. */
function unidadesDoKit(anuncio) {
  const itens = anuncio?.dados?.composicao?.itens;
  if (!Array.isArray(itens) || itens.length === 0) return 1;
  const soma = itens.reduce((total, item) => total + (Number(item?.quantidade) || 0), 0);
  return soma > 0 ? soma : 1;
}

/**
 * Casa cada item do pedido normalizado com o Produto (ML pelo anuncio MLB, LI pelo anuncio da loja, Bling pelo
 * blingId; todos caem no sku sem caixa) e congela o custo. Uma consulta de anuncios e uma de produtos por pedido.
 */
export async function casarItens(tx, normalizado) {
  const origem = normalizado?.origem;
  const itens = Array.isArray(normalizado?.itens) ? normalizado.itens : [];
  const canal = CANAL_DO_ANUNCIO[origem] ?? null;

  const idsNaOrigem = [...new Set(itens.map((item) => item?.idNaOrigem).filter(Boolean).map(String))];
  const anuncios =
    canal && idsNaOrigem.length > 0
      ? await tx.anuncio.findMany({
          where: { canal, idExterno: { in: idsNaOrigem } },
          select: { id: true, idExterno: true, produtoId: true, dados: true, atualizadoEm: true },
          orderBy: { atualizadoEm: "desc" },
        })
      : [];
  const anuncioPorId = new Map();
  for (const anuncio of anuncios) if (!anuncioPorId.has(anuncio.idExterno)) anuncioPorId.set(anuncio.idExterno, anuncio);

  const skus = [...new Set(itens.map((item) => item?.codigoNaOrigem).filter(Boolean).map((s) => String(s).trim()))];
  const produtoIds = [...new Set(anuncios.map((a) => a.produtoId))];
  const condicoes = [];
  if (produtoIds.length > 0) condicoes.push({ id: { in: produtoIds } });
  if (skus.length > 0) condicoes.push({ sku: { in: skus, mode: "insensitive" } });
  if (origem === "BLING" && idsNaOrigem.length > 0) condicoes.push({ blingId: { in: idsNaOrigem } });
  const produtos =
    condicoes.length > 0
      ? await tx.produto.findMany({
          where: { OR: condicoes },
          select: {
            id: true,
            sku: true,
            blingId: true,
            custo: true,
            tipo: true,
            pecasProprias: true,
            conferido: true,
            fornecedorRascunho: true,
            ...INCLUIR_PRODUTO,
          },
        })
      : [];
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const porSku = new Map(produtos.map((p) => [p.sku.toLowerCase(), p]));
  const porBlingId = new Map(produtos.filter((p) => p.blingId).map((p) => [String(p.blingId), p]));

  const avisos = new Set();
  const casados = itens.map((item) => {
    const idNaOrigem = item?.idNaOrigem ? String(item.idNaOrigem) : null;
    const anuncio = canal && idNaOrigem ? (anuncioPorId.get(idNaOrigem) ?? null) : null;
    let produto = anuncio ? (porId.get(anuncio.produtoId) ?? null) : null;
    if (!produto && origem === "BLING" && idNaOrigem) produto = porBlingId.get(idNaOrigem) ?? null;
    if (!produto && item?.codigoNaOrigem) produto = porSku.get(String(item.codigoNaOrigem).trim().toLowerCase()) ?? null;

    const quantidadeDoKit = anuncio ? unidadesDoKit(anuncio) : 1;
    const { custo, origem: custoOrigem } = custoCongeladoDoProduto(produto);
    if (!produto) avisos.add("produtoForaDoRise");
    else {
      if (custo === null) avisos.add("semCusto");
      if (!produto.conferido && origem !== "BLING") avisos.add("produtoNaoConferido");
    }
    return {
      ...item,
      quantidade: Number(item?.quantidade ?? 0) * quantidadeDoKit,
      quantidadeDoKit,
      produtoId: produto?.id ?? null,
      anuncioId: anuncio?.id ?? null,
      custoUnitarioCongelado: custo,
      custoOrigem,
      conferido: produto ? Boolean(produto.conferido) : false,
    };
  });
  return { itens: casados, avisos: [...avisos] };
}

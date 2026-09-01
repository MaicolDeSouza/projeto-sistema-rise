/**
 * Os campos de um produto de mercado: rotulo e presenca.
 *
 * Modulo proprio, sem import nenhum, porque a lista e usada nos DOIS lados: o
 * servidor monta o relatorio "campos identificados" e a tela lista campo a
 * campo na previa. Com uma copia em cada lado, o relatorio diria que a loja
 * publica marca enquanto a previa nao mostraria marca nenhuma — e nada
 * apontaria qual dos dois esta certo.
 *
 * A ordem daqui e a ordem em que os campos aparecem na tela.
 */

export const ROTULOS_CAMPOS = {
  name: "Nome",
  code: "Codigo / SKU",
  mpn: "MPN",
  ean: "EAN",
  brand: "Marca",
  model: "Modelo",
  category: "Categoria",
  ncm: "NCM",
  url: "URL",
  images: "Imagens",
  precoNormal: "Preco normal",
  precoPromocional: "Preco promocional",
  precoComImpostos: "Preco com impostos",
  description: "Descricao",
  specifications: "Especificacoes",
  status: "Status",
  quantidade: "Pronta entrega",
  quantidadeAChegar: "A chegar",
  seo: "SEO",
};

/**
 * Quais campos vieram preenchidos.
 *
 * Ausente e ausente: campo que a loja nao publica fica falso aqui e null no
 * produto. Preencher com um valor plausivel esconderia o que o site nao tem.
 */
export function camposPreenchidos(produto) {
  return {
    name: Boolean(produto?.name),
    code: Boolean(produto?.code),
    mpn: Boolean(produto?.mpn),
    ean: Boolean(produto?.ean),
    brand: Boolean(produto?.brand),
    model: Boolean(produto?.model),
    category: Boolean(produto?.category),
    ncm: Boolean(produto?.ncm),
    url: Boolean(produto?.url),
    images: (produto?.images?.length ?? 0) > 0,
    precoNormal: typeof produto?.prices?.normal === "number",
    precoPromocional: typeof produto?.prices?.promotional === "number",
    precoComImpostos: typeof produto?.prices?.comImpostos === "number",
    description: Boolean(produto?.description),
    specifications: (produto?.specifications?.length ?? 0) > 0,
    status: Boolean(produto?.stock?.status) && produto.stock.status !== "UNKNOWN",
    quantidade: typeof produto?.stock?.quantity === "number",
    quantidadeAChegar: typeof produto?.stock?.aChegar === "number",
    seo: Object.values(produto?.seo ?? {}).some(Boolean),
  };
}

/** Valor de exibicao de cada campo, ja formatado. `null` quando nao coletado. */
export function valoresDoProduto(produto) {
  const moeda = (valor) =>
    typeof valor === "number"
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor)
      : null;

  const situacoes = {
    AVAILABLE: "Disponivel",
    OUT_OF_STOCK: "Sem estoque",
    PAUSED: "Pausado",
    UNKNOWN: "Indeterminado",
  };

  return {
    name: produto?.name ?? null,
    code: produto?.code ?? null,
    mpn: produto?.mpn ?? null,
    ean: produto?.ean ?? null,
    brand: produto?.brand ?? null,
    model: produto?.model ?? null,
    category: produto?.category ?? null,
    ncm: produto?.ncm ?? null,
    url: produto?.url ?? null,
    images: produto?.images?.length ? `${produto.images.length} imagem(ns)` : null,
    precoNormal: moeda(produto?.prices?.normal),
    precoPromocional: moeda(produto?.prices?.promotional),
    // O valor vem com os impostos entre parenteses: sem dizer o que entrou na
    // conta, o numero maior parece preco inflado sem explicacao.
    precoComImpostos: (() => {
      const valor = moeda(produto?.prices?.comImpostos);
      if (!valor) return null;

      const resumo = (produto?.taxes ?? [])
        .map((imposto) => `${imposto.nome} ${String(imposto.percentual).replace(".", ",")}%`)
        .join(" + ");

      return resumo ? `${valor} (${resumo})` : valor;
    })(),
    description: produto?.description
      ? `${produto.description.length} caracteres`
      : null,
    specifications: produto?.specifications?.length
      ? `${produto.specifications.length} item(ns)`
      : null,
    status: situacoes[produto?.stock?.status] ?? null,
    quantidade:
      typeof produto?.stock?.quantity === "number" ? String(produto.stock.quantity) : null,
    quantidadeAChegar:
      typeof produto?.stock?.aChegar === "number" ? String(produto.stock.aChegar) : null,
    seo: (() => {
      const partes = Object.entries(produto?.seo ?? {}).filter(([, v]) => v);
      return partes.length ? partes.map(([k]) => k).join(", ") : null;
    })(),
  };
}

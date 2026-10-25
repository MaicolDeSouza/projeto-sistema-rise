import { slugDe } from "./slug";

/**
 * O rascunho do anuncio da Loja Integrada, guardado em `Anuncio.dados` (canal LOJA_INTEGRADA,
 * um por produto). Sem imports de servidor: o editor o usa.
 *
 * Forma: { produtoId, titulo, slug (sempre slugDe(titulo), decisao do dono em 07/10/2026), marca, destaque, videoUrl, imagens }.
 * A descricao, as categorias (ids da LI em texto) e o SEO (Tag Title e Meta Description) NAO sao do anuncio: vem sempre do
 * cadastro do PRODUTO (pedidos do dono em 07/10 e 25/10/2026). A marca e o NOME (a URI e achada no envio).
 */

const texto = (valor) => (valor === null || valor === undefined ? "" : String(valor));

/** O rascunho que nasce de um produto do Rise: titulo, slug e SEO saem do cadastro. */
export function rascunhoInicialLI(produto, { fotos = [] } = {}) {
  const p = produto ?? {};
  // As fotos do produto, a principal na frente (aba Imagens, 07/10/2026). So vao para a loja na VPS.
  const imagens = [...fotos.filter((foto) => foto.principal), ...fotos.filter((foto) => !foto.principal)].map((foto) => foto.id);
  const titulo = texto(p.tituloBase).trim();
  return {
    produtoId: p.id ?? null,
    titulo,
    slug: slugDe(titulo),
    marca: texto(p.marca).trim(),
    destaque: false,
    videoUrl: p.videoUrl ?? null,
    imagens,
  };
}

/**
 * Ao vincular um produto que ja existe na LI, o destaque vem de la: o dono o escolheu na loja. O resto fica o do Rise. O
 * slug NAO vem: desde 07/10/2026 ele e sempre o do nome no Rise (decisao do dono, sabendo que a URL antiga muda com 301
 * no proximo Sincronizar). As categorias da loja vao para o produto (`vincularPeloSku`), nao para o rascunho.
 */
export function rascunhoDaLI(rascunho, produtoLINormalizado) {
  const li = produtoLINormalizado ?? {};
  return {
    ...rascunho,
    slug: slugDe(rascunho.titulo),
    destaque: Boolean(li.destaque),
  };
}

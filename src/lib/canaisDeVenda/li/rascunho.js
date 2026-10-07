import { slugDe } from "./slug";
import { descriptionPadrao, tituloSeoPadrao } from "./seo";

/**
 * O rascunho do anuncio da Loja Integrada, guardado em `Anuncio.dados` (canal LOJA_INTEGRADA,
 * um por produto). Sem imports de servidor: o editor o usa.
 *
 * Forma: { produtoId, titulo, slug, marca, categorias: string[], destaque, videoUrl, seo: { title,
 * description } }. A descricao NAO e do anuncio: vem sempre do cadastro (pedido do dono em 07/10/2026). As categorias sao ids da LI em
 * texto; a marca e o NOME (a URI e achada no envio).
 */

const texto = (valor) => (valor === null || valor === undefined ? "" : String(valor));

/** O rascunho que nasce de um produto do Rise: titulo, slug e SEO saem do cadastro. */
export function rascunhoInicialLI(produto) {
  const p = produto ?? {};
  const titulo = texto(p.tituloBase).trim();
  const descricao = texto(p.descricaoBase);
  return {
    produtoId: p.id ?? null,
    titulo,
    slug: slugDe(titulo),
    marca: texto(p.marca).trim(),
    categorias: [],
    destaque: false,
    videoUrl: p.videoUrl ?? null,
    seo: { title: tituloSeoPadrao(titulo), description: descriptionPadrao(descricao, titulo) },
  };
}

/**
 * Ao vincular um produto que ja existe na LI, o slug (a URL que o Google ja indexou), as
 * categorias e o destaque vem de la: o dono os escolheu na loja. O resto fica o do Rise.
 */
export function rascunhoDaLI(rascunho, produtoLINormalizado) {
  const li = produtoLINormalizado ?? {};
  return {
    ...rascunho,
    slug: li.slug || rascunho.slug,
    categorias: Array.isArray(li.categorias) ? [...li.categorias] : rascunho.categorias,
    destaque: Boolean(li.destaque),
  };
}

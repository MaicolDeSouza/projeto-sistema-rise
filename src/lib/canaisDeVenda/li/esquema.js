import { z } from "zod";

/**
 * Forma do rascunho do anuncio da Loja Integrada (ver `rascunho.js`) quando chega da tela
 * para ser salvo. Confere o FORMATO; regra de negocio (sem NCM, SEO longo, categoria que
 * sumiu da loja) fica em `validacao.js`, porque rascunho incompleto pode ser salvo.
 *
 * Chave desconhecida e descartada: o que a tela mandar a mais nao chega ao banco.
 */

// Tetos de tamanho: a Server Action recebe o que o navegador mandar. O titulo vai ate 255,
// o limite medido na LI (256 da 400); slug 100. O SEO tem folga: o corte em 70/250 e no envio.
export const LIMITES_LI = {
  titulo: 255,
  slug: 100,
  descricao: 50000,
  marca: 120,
  categorias: 20,
  idDeCategoria: 32,
  videoUrl: 500,
  seoTitulo: 300,
  seoDescription: 1000,
};

const textoAte = (maximo) => z.preprocess((valor) => (valor === null || valor === undefined ? "" : valor), z.string().max(maximo));

export const RascunhoLISchema = z.object({
  produtoId: z.string().nullish(),
  titulo: textoAte(LIMITES_LI.titulo).default(""),
  slug: textoAte(LIMITES_LI.slug).default(""),
  descricao: textoAte(LIMITES_LI.descricao).default(""),
  marca: textoAte(LIMITES_LI.marca).default(""),
  categorias: z.array(z.string().max(LIMITES_LI.idDeCategoria)).max(LIMITES_LI.categorias).default([]),
  destaque: z.boolean().default(false),
  videoUrl: z.preprocess(
    (valor) => (typeof valor === "string" && valor.trim() === "" ? null : valor),
    z.string().max(LIMITES_LI.videoUrl).nullable().default(null),
  ),
  seo: z
    .object({
      title: textoAte(LIMITES_LI.seoTitulo).default(""),
      description: textoAte(LIMITES_LI.seoDescription).default(""),
    })
    .default({ title: "", description: "" }),
  especificacoes: z.boolean().default(true),
});

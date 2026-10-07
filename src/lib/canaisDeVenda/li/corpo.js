import { TEXTO_DO_TIPO_PRODUCAO } from "./campos";

/**
 * O corpo que vai para a Loja Integrada: o POST do cadastro e o PUT do produto inteiro.
 *
 * O PUT da LI exige o produto INTEIRO (nao ha PATCH: medido, da 405). Por isso o corpo parte
 * do que a LI devolveu no GET e troca so os campos que o Rise mudou. Duas regras medidas em
 * 07/10/2026 mandam aqui:
 * - `categorias: []` e `marca: null` explicitos APAGAM o que a LI tem; sem a chave, mantem.
 *   Por isso lista vazia no Rise nunca entra: fica o valor da propria LI.
 * - O PUT aceita as chaves so de leitura do GET, mas devolver `preco_cheio` e
 *   `estoque_quantidade` lidos segundos antes desfaria uma atualizacao do Bling (dono do preco
 *   e do estoque) feita no intervalo. Elas saem do corpo.
 *
 * Slug e SEO nunca vao no PUT: o slug muda pelo /alias (com 301) e o SEO pelo /v1/seo/{id}
 * (o PUT do produto ignora os dois). Origem e tipo de producao tambem nao: a API nao os grava.
 */

export const CHAVES_SO_LEITURA = new Set([
  "id",
  "resource_uri",
  "url",
  "seo",
  "data_criacao",
  "data_modificacao",
  "imagem_principal",
  "imagens",
  "variacoes",
  "grades",
  "filhos",
  "preco_cheio",
  "preco_promocional",
  "preco_custo",
  "preco_sob_consulta",
  "estoque_gerenciado",
  "estoque_quantidade",
  "estoque_situacao_em_estoque",
  "estoque_situacao_sem_estoque",
  "produto_id_anymarket",
  "produto_id_sku_anymarket",
  "tags",
  "seo_title",
  "seo_description",
]);

const vazio = (valor) =>
  valor === null || valor === undefined || valor === "" || (Array.isArray(valor) && valor.length === 0);

/** "85371020" vira "8537.10.20", o formato que a loja usa (e que a LI aceitou na medicao). */
export function formatarNcmLI(ncm) {
  const digitos = String(ncm ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  return digitos.length === 8 ? `${digitos.slice(0, 4)}.${digitos.slice(4, 6)}.${digitos.slice(6)}` : digitos;
}

/** Campo normalizado do Rise -> chave e valor da LI. `slug`, SEO e fiscais nao entram aqui. */
function valorParaLI(campo, rise, { descricaoHtml, marcaUri, categoriasUris }) {
  switch (campo) {
    case "nome":
      return ["nome", rise.nome];
    case "descricao":
      return ["descricao_completa", descricaoHtml || null];
    case "ncm":
      return ["ncm", formatarNcmLI(rise.ncm)];
    case "gtin":
      return ["gtin", rise.gtin];
    case "mpn":
      return ["mpn", rise.mpn];
    case "peso":
      return ["peso", rise.peso];
    case "altura":
      return ["altura", rise.altura];
    case "largura":
      return ["largura", rise.largura];
    case "comprimento":
      return ["profundidade", rise.comprimento];
    case "marca":
      return ["marca", marcaUri ?? null];
    case "categorias":
      return ["categorias", categoriasUris ?? []];
    case "video":
      return ["url_video_youtube", rise.video];
    case "destaque":
      return ["destaque", Boolean(rise.destaque)];
    default:
      return null;
  }
}

const CAMPOS_DO_CORPO = ["nome", "descricao", "ncm", "gtin", "mpn", "peso", "altura", "largura", "comprimento", "marca", "categorias", "video", "destaque"];

/**
 * POST do cadastro: o produto nasce INATIVO (o dono confere na loja antes de ligar), tipo
 * normal, com o slug como `apelido`. Chave sem valor fica de fora. Origem e tipo de producao
 * vao como texto: o PUT os ignora, e se o POST tambem ignorar nao custa nada.
 */
export function montarCorpoDeCadastroLI({ sku, rise, descricaoHtml, marcaUri, categoriasUris }) {
  const contexto = { descricaoHtml, marcaUri, categoriasUris };
  const corpo = { sku, tipo: "normal", ativo: false, usado: false };
  if (!vazio(rise?.slug)) corpo.apelido = rise.slug;
  for (const campo of CAMPOS_DO_CORPO) {
    const par = valorParaLI(campo, rise ?? {}, contexto);
    if (par && !vazio(par[1])) corpo[par[0]] = par[1];
  }
  if (rise?.origem !== null && rise?.origem !== undefined) corpo.icms_origin_code = String(rise.origem);
  if (rise?.tipoProducao && TEXTO_DO_TIPO_PRODUCAO[rise.tipoProducao]) {
    corpo.production_type = TEXTO_DO_TIPO_PRODUCAO[rise.tipoProducao];
  }
  return corpo;
}

/**
 * PUT: copia do produto da LI sem as chaves so de leitura, com os campos alterados trocados
 * pelo valor do Rise. Campo alterado que esta vazio no Rise fica com o valor da LI (o envio
 * nunca apaga). Nao muda `produtoLI`.
 */
export function mesclarCorpoLI(produtoLI, rise, camposAlterados, { descricaoHtml, marcaUri, categoriasUris }) {
  const corpo = {};
  for (const [chave, valor] of Object.entries(produtoLI ?? {})) {
    if (!CHAVES_SO_LEITURA.has(chave)) corpo[chave] = valor;
  }
  const contexto = { descricaoHtml, marcaUri, categoriasUris };
  for (const campo of camposAlterados ?? []) {
    const par = valorParaLI(campo, rise ?? {}, contexto);
    if (!par || vazio(par[1])) continue;
    corpo[par[0]] = par[1];
  }
  return corpo;
}

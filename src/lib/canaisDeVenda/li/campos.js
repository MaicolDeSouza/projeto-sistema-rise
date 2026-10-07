import { createHash } from "node:crypto";

import { htmlParaTexto } from "@/lib/integracoes/normalizacao";

import { montarDescricaoLI } from "./descricao";
import { LIMITE_DA_DESCRIPTION_SEO, LIMITE_DO_TITULO_SEO, cortarNaPalavra } from "./seo";
import { slugDe } from "./slug";

/**
 * Os campos que o Rise escreve na Loja Integrada, lidos dos dois lados no MESMO formato:
 * a assinatura (o icone) e as diferencas (o pop-up) comparam um com o outro. So servidor
 * (`node:crypto`).
 *
 * Origem e tipo de producao tambem sao lidos, mas a API NAO os grava (medido em 07/10/2026:
 * o PUT os ignora e o PATCH da 405). Ficam fora do envio e da assinatura e viram aviso: se
 * contassem como divergencia, o selo "!" nunca apagaria, porque o Sincronizar nao consegue
 * igualar.
 */

export const CAMPOS_DE_ENVIO_LI = [
  { id: "nome", rotulo: "Nome" },
  { id: "slug", rotulo: "Endereco (slug)" },
  { id: "descricao", rotulo: "Descricao" },
  { id: "ncm", rotulo: "NCM" },
  { id: "gtin", rotulo: "GTIN / EAN" },
  { id: "mpn", rotulo: "MPN (modelo)" },
  { id: "peso", rotulo: "Peso (kg)" },
  { id: "altura", rotulo: "Altura (cm)" },
  { id: "largura", rotulo: "Largura (cm)" },
  { id: "comprimento", rotulo: "Comprimento (cm)" },
  { id: "marca", rotulo: "Marca" },
  { id: "categorias", rotulo: "Categorias" },
  { id: "video", rotulo: "Video (YouTube)" },
  { id: "destaque", rotulo: "Destaque" },
  { id: "seoTitulo", rotulo: "SEO: titulo" },
  { id: "seoDescription", rotulo: "SEO: description" },
];

export const CAMPOS_SO_LEITURA_LI = [
  { id: "origem", rotulo: "Origem (NF-e)" },
  { id: "tipoProducao", rotulo: "Tipo de producao (NF-e)" },
];

/** Texto exato que a LI devolve em `production_type` (lido em 07/10/2026). */
export const TEXTO_DO_TIPO_PRODUCAO = {
  REVENDA: "Revenda",
  FABRICACAO_PROPRIA: "Fabricação própria",
};

const semAcento = (valor) =>
  String(valor ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const TIPO_POR_TEXTO = new Map(
  Object.entries(TEXTO_DO_TIPO_PRODUCAO).map(([enumerado, rotulo]) => [semAcento(rotulo), enumerado]),
);

/** `production_type` da LI para o enum do Rise; texto desconhecido = null (nao adivinha). */
export function TIPO_PRODUCAO_DA_LI(valor) {
  return TIPO_POR_TEXTO.get(semAcento(valor)) ?? null;
}

const texto = (valor) => {
  if (valor === null || valor === undefined) return null;
  const limpo = String(valor).trim();
  return limpo || null;
};

// Marca sem acento e em maiusculas, dos dois lados: "Arduíno" no Rise e "Arduino" na LI sao a mesma
// marca (o envio acha uma pela outra), e comparar com acento deixaria o selo aceso para sempre.
const marcaNormalizada = (valor) => texto(valor)?.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase() ?? null;

const soDigitos = (valor) => texto(String(valor ?? "").replace(/\D/g, ""));

const positivo = (valor) => {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
};

const peso = (valor) => {
  const numero = positivo(valor);
  return numero === null ? null : Number(numero.toFixed(3));
};

// A LI guarda medida em cm INTEIRO (decimal da 400): sobe para o inteiro de cima, como o
// envio fara. O arredondamento a 3 casas antes evita 12.000000001 virar 13.
const medida = (valor) => {
  const numero = positivo(valor);
  return numero === null ? null : Math.ceil(Number(numero.toFixed(3)));
};

const idsOrdenados = (lista) => [...new Set((lista ?? []).map((id) => texto(id)).filter(Boolean))].sort();

const idDaUri = (uri) => texto(String(uri ?? "").split("/").filter(Boolean).at(-1));

const origemInteira = (valor) => {
  if (valor === null || valor === undefined || String(valor).trim() === "") return null;
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 0 && numero <= 8 ? numero : null;
};

const seoTitulo = (valor) => texto(cortarNaPalavra(valor ?? "", LIMITE_DO_TITULO_SEO));
const seoDescription = (valor) => texto(cortarNaPalavra(valor ?? "", LIMITE_DA_DESCRIPTION_SEO));

/**
 * O Rise: o Produto (cadastro) mais o rascunho do anuncio da LI. A descricao e SEMPRE a do cadastro
 * (`descricaoBase`): o anuncio nao a edita (pedido do dono em 07/10/2026).
 */
export function normalizarDoRiseLI(produto, rascunho, { documentos = [] } = {}) {
  const p = produto ?? {};
  const r = rascunho ?? {};
  const html = montarDescricaoLI({ descricao: p.descricaoBase, documentos });
  return {
    nome: texto(r.titulo),
    // Sempre do nome (decisao do dono em 07/10/2026): o slug guardado nao manda.
    slug: texto(slugDe(r.titulo)),
    descricao: html ? htmlParaTexto(html, { paragrafos: true }) : null,
    ncm: soDigitos(p.ncm),
    gtin: texto(p.ean),
    mpn: texto(p.modelo),
    peso: peso(p.pesoKg),
    altura: medida(p.alturaCm),
    largura: medida(p.larguraCm),
    comprimento: medida(p.comprimentoCm),
    marca: marcaNormalizada(r.marca),
    categorias: idsOrdenados(r.categorias),
    video: texto(r.videoUrl),
    destaque: Boolean(r.destaque),
    seoTitulo: seoTitulo(r.seo?.title),
    seoDescription: seoDescription(r.seo?.description),
    origem: origemInteira(p.origem),
    tipoProducao: p.tipoProducao ?? null,
  };
}

/** A LI: o JSON cru do detalhe do produto, o do /seo/{id} (ou null) e o nome da marca. */
export function normalizarDaLI(produtoLI, seo, { marcaNome = null } = {}) {
  const l = produtoLI ?? {};
  // Depois de um /alias o `apelido` fica o antigo e o `url` passa a ser o caminho atual.
  const caminho = texto(l.url) ?? texto(l.apelido);
  return {
    nome: texto(l.nome),
    // Produto antigo da loja tem a URL "/produto/<slug>.html" (medido no 100101 em 07/10/2026); o
    // novo, "/<slug>". O slug e o miolo: sem as barras, o "produto/" e o ".html".
    slug: caminho
      ? caminho
          .replace(/^\/+/, "")
          .replace(/^produto\//, "")
          .replace(/\.html?$/, "") || null
      : null,
    descricao: htmlParaTexto(l.descricao_completa, { paragrafos: true }),
    ncm: soDigitos(l.ncm),
    gtin: texto(l.gtin),
    mpn: texto(l.mpn),
    peso: peso(l.peso),
    altura: medida(l.altura),
    largura: medida(l.largura),
    comprimento: medida(l.profundidade),
    marca: marcaNormalizada(marcaNome),
    categorias: idsOrdenados((l.categorias ?? []).map(idDaUri)),
    video: texto(l.url_video_youtube),
    destaque: Boolean(l.destaque),
    seoTitulo: seoTitulo(seo?.title ?? l.seo_title),
    seoDescription: seoDescription(seo?.description ?? l.seo_description),
    origem: origemInteira(l.icms_origin_code),
    tipoProducao: TIPO_PRODUCAO_DA_LI(l.production_type),
  };
}

/** SHA-256 dos campos de envio, na ordem fixa: os fiscais so de leitura ficam de fora. */
export function assinaturaLI(campos) {
  const pares = CAMPOS_DE_ENVIO_LI.map(({ id }) => [id, campos?.[id] ?? null]);
  return createHash("sha256").update(JSON.stringify(pares)).digest("hex");
}

const vazio = (valor) =>
  valor === null || valor === undefined || valor === "" || (Array.isArray(valor) && valor.length === 0);

/** Campo a campo. Vazio no Rise com valor na LI e "vazioNoRise": o envio nunca apaga, entao nao e divergencia. */
export function diferencasLI(rise, li) {
  const lista = [];
  for (const { id, rotulo } of CAMPOS_DE_ENVIO_LI) {
    const deRise = rise?.[id] ?? null;
    const daLI = li?.[id] ?? null;
    if (vazio(deRise) && vazio(daLI)) continue;
    if (vazio(deRise)) {
      lista.push({ campo: id, rotulo, rise: deRise, li: daLI, tipo: "vazioNoRise" });
      continue;
    }
    if (JSON.stringify(deRise) !== JSON.stringify(daLI)) {
      lista.push({ campo: id, rotulo, rise: deRise, li: daLI, tipo: "diferente" });
    }
  }
  return lista;
}

export function contarDivergencias(lista) {
  return (lista ?? []).filter((item) => item.tipo === "diferente").length;
}

/**
 * Origem e tipo de producao: so aviso. "vazioNaLI" = a NF-e usara o padrao do emissor;
 * "diferente" = ajustar no painel da LI. Sem valor no Rise nao ha o que avisar.
 */
export function avisosFiscaisLI(rise, li) {
  const lista = [];
  for (const { id, rotulo } of CAMPOS_SO_LEITURA_LI) {
    const deRise = rise?.[id] ?? null;
    const daLI = li?.[id] ?? null;
    if (deRise === null) continue;
    if (daLI === null) lista.push({ campo: id, rotulo, rise: deRise, li: null, tipo: "vazioNaLI" });
    else if (deRise !== daLI) lista.push({ campo: id, rotulo, rise: deRise, li: daLI, tipo: "diferente" });
  }
  return lista;
}

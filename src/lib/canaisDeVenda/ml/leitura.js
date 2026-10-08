/**
 * Leituras do Mercado Livre para o editor de anuncio (fase 2, so GET): categoria sugerida, a
 * categoria e os atributos dela, taxas, frete do vendedor e termos em alta.
 *
 * Toda funcao recebe o `cliente` (`clienteML()` em `./cliente.js`, ou o ML falso no teste) e
 * devolve o dado ja no formato do Rise. Resposta de erro do ML vira um `Error` com `status` e
 * `dados`, para a acao do servidor traduzir com `textoDoErroML`.
 *
 * Os formatos seguem a investigacao de 03/10/2026
 * (`docs/superpowers/investigacoes/2026-10-01-ml-bling-para-fases-2-e-3.md`, A1 a A5).
 */

import { normalizarAtributosDaCategoria } from "./atributos";

/** Texto do erro para a tela: resposta do ML com o motivo e o HTTP, ou a mensagem do erro. */
export function textoDoErroML(erro) {
  if (typeof erro?.status === "number") {
    return `Mercado Livre: ${erro.dados?.message ?? erro.dados?.error ?? "erro"} (HTTP ${erro.status})`;
  }
  return erro?.message ?? "Falha ao consultar o Mercado Livre.";
}

function falhou({ status, dados }) {
  return Object.assign(new Error(textoDoErroML({ status, dados })), { status, dados });
}

async function ler(cliente, caminho, params) {
  const resposta = await cliente.get(caminho, params);
  if (!resposta.ok) throw falhou(resposta);
  return resposta.dados;
}

const caminhoDaCategoria = (categoriaId) => `/categories/${encodeURIComponent(String(categoriaId ?? "").trim())}`;

/** Categorias que o ML preve para o titulo (`domain_discovery`). Lista vazia quando nao acha nada. */
export async function descobrirCategoria(cliente, titulo) {
  const dados = await ler(cliente, "/sites/MLB/domain_discovery/search", { q: String(titulo ?? "").trim() });
  return (Array.isArray(dados) ? dados : []).map((item) => ({
    categoriaId: item.category_id,
    nome: item.category_name,
    dominioId: item.domain_id,
    dominioNome: item.domain_name,
  }));
}

/**
 * A categoria pelo codigo, ou `null` se o ML nao a conhece (404). `folha` diz se e final: so
 * categoria sem filhas aceita anuncio. O limite do titulo e o maximo de fotos vem dela.
 */
export async function lerCategoria(cliente, categoriaId) {
  const resposta = await cliente.get(caminhoDaCategoria(categoriaId));
  if (resposta.status === 404) return null;
  if (!resposta.ok) throw falhou(resposta);

  const dados = resposta.dados;
  return {
    id: dados.id,
    nome: dados.name,
    caminho: (dados.path_from_root ?? []).map((parte) => parte.name),
    folha: (dados.children_categories ?? []).length === 0,
    limiteTitulo: dados.settings?.max_title_length,
    maxFotos: dados.settings?.max_pictures_per_item,
    condicoes: dados.settings?.item_conditions ?? [],
  };
}

/** Os atributos da categoria, crus, como o ML os devolve. */
export async function lerAtributosDaCategoria(cliente, categoriaId) {
  const dados = await ler(cliente, `${caminhoDaCategoria(categoriaId)}/attributes`);
  return Array.isArray(dados) ? dados : [];
}

/**
 * A categoria com os atributos ja no formato do Rise (`normalizarAtributosDaCategoria`), numa
 * leitura so para o editor; `null` se ela nao existe.
 */
export async function lerCategoriaCompleta(cliente, categoriaId) {
  const categoria = await lerCategoria(cliente, categoriaId);
  if (!categoria) return null;
  return { ...categoria, atributos: normalizarAtributosDaCategoria(await lerAtributosDaCategoria(cliente, categoriaId)) };
}

import { buscarPagina } from "./buscar";

/**
 * Categoria de uma loja VTEX (Patolastore, 20/10/2026).
 *
 * O campo "Seção / categoria" sempre foi um FILTRO DE TEXTO sobre o endereco ("so enderecos que contem este trecho").
 * Na VTEX o produto mora em `/{slug}/p`, sem a categoria no caminho: "gabinetes" so achava produto cujo NOME tem
 * "gabinetes" (17 enderecos, quase todos fora da categoria), e a categoria de verdade, com 264 produtos, ficava de fora.
 *
 * A VTEX publica a busca por categoria sem credencial: `/api/catalog_system/pub/products/search/<caminho>?_from=&_to=`
 * devolve ate 50 produtos por pagina, com `link` (o endereco do produto) e o total no cabecalho `resources`
 * ("0-49/264"). Aqui ela serve so para DESCOBRIR os produtos da categoria; os dados de cada um continuam sendo lidos na
 * pagina, como nas outras lojas. Passa por `buscarPagina`: robots.txt e ritmo do dominio valem.
 */

const POR_PAGINA = 50;
/// A busca da VTEX nao entrega alem do item 2.500 de uma consulta.
const TETO_DA_VTEX = 2500;

/**
 * "gabinetes", "/gabinetes/", "gabinetes/linha-pbo" ou o endereco completo da categoria -> o caminho da categoria, ou
 * null quando nao e um (vazio, produto `/p`, caracteres que nao sao de caminho). Pura.
 */
export function categoriaDaVtex(secao) {
  let texto = String(secao ?? "").trim();
  if (!texto) return null;
  if (/^https?:\/\//i.test(texto)) {
    try {
      texto = new URL(texto).pathname;
    } catch {
      return null;
    }
  }
  const caminho = texto.replace(/^\/+|\/+$/g, "");
  if (!caminho || /(^|\/)p$/i.test(caminho)) return null;
  return /^[A-Za-z0-9_\-/%.]+$/.test(caminho) ? caminho : null;
}

/** "0-49/264" -> 264. */
export function totalDoCabecalhoResources(valor) {
  const total = /\/(\d+)\s*$/.exec(String(valor ?? ""))?.[1];
  return total ? Number(total) : null;
}

/**
 * Le a categoria. `limite`: quantos produtos bastam (o teste pede 3; a coleta pede tudo).
 *
 * @returns {Promise<{total: number|null, itens: object[], erro: string|null}>}
 */
export async function lerCategoriaDaVtex({ origem, categoria, limite = 0, sinal = null }) {
  const itens = [];
  let total = null;

  for (let de = 0; de < TETO_DA_VTEX && !sinal?.aborted; de += POR_PAGINA) {
    const endereco = `${origem}/api/catalog_system/pub/products/search/${categoria}?_from=${de}&_to=${de + POR_PAGINA - 1}`;
    const resposta = await buscarPagina(endereco, { sinal });
    if (!resposta.ok || !resposta.corpo) {
      // A primeira pagina falhar = a categoria nao existe (ou a loja nao publica a busca); depois dela, fica o que veio.
      if (de === 0) return { total: null, itens: [], erro: resposta.erro ?? `HTTP ${resposta.status ?? "?"}` };
      break;
    }

    let lista;
    try {
      lista = JSON.parse(resposta.corpo);
    } catch {
      if (de === 0) return { total: null, itens: [], erro: "resposta não é JSON" };
      break;
    }
    if (!Array.isArray(lista) || lista.length === 0) break;

    total ??= totalDoCabecalhoResources(resposta.cabecalhos?.resources);
    for (const produto of lista) {
      if (typeof produto?.link === "string") itens.push({ name: produto.productName ?? null, url: produto.link });
    }

    if (limite > 0 && itens.length >= limite) break;
    if (lista.length < POR_PAGINA) break;
    if (total !== null && itens.length >= total) break;
  }

  // O total so e o da categoria quando a lista veio inteira; no teste (poucos itens) ele e o declarado pela loja.
  return { total: total ?? (itens.length || null), itens, erro: null };
}

import { buscarPagina } from "./buscar";

/**
 * Catalogo publico da plataforma.
 *
 * Algumas plataformas publicam a lista de produtos em JSON, sem credencial — a
 * Tray em /web_api/products, a Shopify em /products.json. Quando existe, ele
 * responde de uma vez o que o sitemap responde pela metade e a navegacao
 * responde caro: quantos produtos a loja tem e onde cada um esta.
 *
 * NAO substitui a pagina. Medido na Tray, o catalogo nao traz a referencia da
 * loja ("Ref: 21A502") nem o preco a vista — e a referencia e a chave de acesso
 * ao produto do concorrente. O catalogo entra como FONTE A MAIS: melhor para o
 * que ele tem (a lista de imagens e autoritativa, sem adivinhar convencao de
 * nome de arquivo), e calado no que nao tem.
 *
 * Tudo aqui passa por buscarPagina, entao robots.txt e o ritmo do dominio
 * valem igual — catalogo publico nao e licenca para atropelar o servidor.
 */

/// Teto de paginas da listagem. Cada uma custa uma requisicao; sem limite, uma
/// loja de cem mil itens prenderia o teste.
const MAXIMO_PAGINAS = 60;

/** Caminha por um objeto seguindo uma lista de chaves. */
function em(objeto, caminho) {
  return caminho.reduce((atual, chave) => atual?.[chave], objeto);
}

function comoJson(corpo) {
  try {
    return JSON.parse(corpo);
  } catch {
    return null;
  }
}

/**
 * O endereco de uma pagina da listagem.
 *
 * A Tray pagina por `page`; o caminho ja vem com `limit` no registro. Montar
 * pela URL evita supor a ordem dos parametros.
 */
function paginaDe(url, numero) {
  const alvo = new URL(url);
  if (numero > 1) alvo.searchParams.set("page", String(numero));
  return alvo.toString();
}

/**
 * Le a listagem do catalogo.
 *
 * @param {object} catalogo  o bloco `entrega.catalogo` do registro, ja com url
 * @param {object} [opcoes]
 * @param {number} [opcoes.limite]  quantos produtos bastam; 0 = so o total
 * @returns {Promise<{total: number|null, itens: object[], erro: string|null}>}
 */
export async function lerCatalogo(catalogo, { limite = 0 } = {}) {
  if (!catalogo?.url || catalogo.formato !== "json") {
    return { total: null, itens: [], erro: "sem catalogo publico" };
  }

  const itens = [];
  let total = null;

  for (let pagina = 1; pagina <= MAXIMO_PAGINAS; pagina++) {
    const resposta = await buscarPagina(paginaDe(catalogo.url, pagina));
    if (!resposta.ok || !resposta.corpo) {
      // A primeira pagina falhar significa que nao ha catalogo; da segunda em
      // diante, ficamos com o que ja veio em vez de perder tudo.
      if (pagina === 1) {
        return { total: null, itens: [], erro: resposta.erro ?? "sem corpo" };
      }
      break;
    }

    const json = comoJson(resposta.corpo);
    if (!json) {
      if (pagina === 1) return { total: null, itens: [], erro: "resposta nao e JSON" };
      break;
    }

    if (total === null && catalogo.totalEm) {
      const declarado = Number(em(json, catalogo.totalEm));
      if (Number.isFinite(declarado)) total = declarado;
    }

    const lista = catalogo.listaEm ? em(json, [catalogo.listaEm]) : json;
    const desta = Array.isArray(lista) ? lista : [];
    if (desta.length === 0) break;

    // A Tray embrulha cada item em {Product: {...}}. Desembrulhar aqui deixa o
    // resto do codigo lidando com um produto so, venha de onde vier.
    for (const bruto of desta) {
      itens.push(bruto?.Product ?? bruto);
    }

    // So o total foi pedido: uma pagina basta, e as outras 45 nao sao abertas.
    if (limite === 0) break;
    if (itens.length >= limite) break;
  }

  return { total: total ?? (itens.length || null), itens, erro: null };
}

/** Endereco do produto dentro de um item do catalogo. */
export function urlDoItem(item, origem) {
  const bruto = item?.url?.https ?? item?.url?.http ?? item?.url ?? item?.slug;
  if (!bruto) return null;

  try {
    return new URL(bruto, origem).toString();
  } catch {
    return null;
  }
}

/**
 * Os campos do catalogo que valem mais que os da pagina.
 *
 * So imagens e NCM, e por motivo medido: a lista de imagens e declarada pela
 * loja, o que dispensa deduzir o dono da foto pelo nome do arquivo — foi onde a
 * leitura da pagina mais errou. O NCM a pagina simplesmente nao publica.
 *
 * Preco, nome e codigo NAO entram: na Tray o catalogo traz promotional_price
 * zerado num produto que anuncia desconto a vista, e nao traz a referencia.
 * Deixar o catalogo vencer ali apagaria dado bom com dado ausente.
 */
export function camposDoCatalogo(item, origem) {
  if (!item) return null;

  const imagens = Array.isArray(item.ProductImage)
    ? item.ProductImage.map((imagem) => imagem?.https ?? imagem?.http ?? imagem)
        .filter((endereco) => typeof endereco === "string")
        .map((endereco) => {
          try {
            return new URL(endereco, origem).toString();
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    : [];

  const ncm = typeof item.ncm === "string" && item.ncm.trim() ? item.ncm.trim() : null;

  return { imagens, ncm };
}

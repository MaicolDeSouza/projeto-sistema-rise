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
///
/// Subiu de 60 para 400 em 15/09/2026, quando a coleta passou a pegar o catalogo
/// inteiro: a 50 itens por pagina, 60 paravam em 3.000 — menos que os 3.780 da
/// Smartkits, e o resto teria de ser descoberto de novo pelo sitemap. Lendo a
/// listagem, cada pagina traz 50 produtos por requisicao; abrindo produto a
/// produto, cada requisicao traz um.
const MAXIMO_PAGINAS = 400;

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
 * @param {AbortSignal} [opcoes.sinal] cancela entre paginas e a requisicao em voo;
 *   cancelada, devolve o que ja leu (quem chamou confere o sinal e desiste)
 * @returns {Promise<{total: number|null, itens: object[], erro: string|null}>}
 */
export async function lerCatalogo(catalogo, { limite = 0, sinal = null } = {}) {
  if (!catalogo?.url || catalogo.formato !== "json") {
    return { total: null, itens: [], erro: "sem catalogo publico" };
  }

  const itens = [];
  let total = null;
  let esgotado = false;

  for (let pagina = 1; pagina <= MAXIMO_PAGINAS && !sinal?.aborted; pagina++) {
    const resposta = await buscarPagina(paginaDe(catalogo.url, pagina), { sinal });
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
    if (desta.length === 0) {
      esgotado = true;
      break;
    }

    // A Tray embrulha cada item em {Product: {...}}. Desembrulhar aqui deixa o
    // resto do codigo lidando com um produto so, venha de onde vier.
    for (const bruto of desta) {
      itens.push(bruto?.Product ?? bruto);
    }

    // So o total foi pedido: uma pagina basta, e as outras 45 nao sao abertas.
    if (limite === 0) break;
    if (itens.length >= limite) break;
  }

  // itens.length SO vale como total quando a paginacao ESGOTOU (pagina vazia
  // no fim), nunca quando parou por ter batido o `limite` de quem chamou. A
  // Metaltex tem 912 produtos em 4 paginas de 250; o teste (limite=3) parava
  // na primeira pagina e "250" virava "produto(s) no catalogo da loja" na
  // tela — menor que a loja de verdade, mas escrito como se fosse o total. A
  // coleta de verdade usa um limite alto e esgota a paginacao, entao o total
  // sai certo do jeito que ja era antes.
  return { total: total ?? (esgotado ? itens.length || null : null), itens, erro: null };
}

/** Endereco do produto dentro de um item do catalogo. */
export function urlDoItem(item, origem) {
  const bruto =
    item?.url?.https ??
    item?.url?.http ??
    item?.url ??
    item?.slug ??
    // O catalogo do Shopify nao traz url nem slug, so "handle" — a pagina e
    // sempre /products/{handle} (ver plataformas.js). Sem isso, todo item do
    // catalogo virava null aqui e a colheita nunca abria pagina nenhuma: foi
    // o caso da Metaltex, 912 produtos lidos no catalogo e zero paginas
    // visitadas, porque "catalogo completo" desligava sitemap e navegacao.
    (typeof item?.handle === "string" && item.handle ? `/products/${item.handle}` : null);
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

import { buscarPagina } from "./buscar";
import { comoTexto, comoUrlAbsoluta } from "./texto-html";

const TAMANHO_PAGINA = 50;
const CAMPOS = `total_count items {
  sku name url_key url_suffix description { html } short_description { html }
  stock_status categories { name url_path }
  price_range { minimum_price { regular_price { value } final_price { value } } }
  cash_price { final_price percent_off }
  meta_title meta_description meta_keyword canonical_url
  custom_attributesV2 { items {
    code
    ... on AttributeValue { value }
    ... on AttributeSelectedOptions { selected_options { label value } }
  } }
  small_image { url } media_gallery { url }
}`;

/** O HTML do Venia e apenas uma casca; o endereco do Magento vem declarado nele. */
export function backendDoMagentoPwa(html, enderecoLoja) {
  if (!/MAGENTO_BACKEND_URL/.test(html) || !/fallback-nojs|venia/i.test(html)) return null;
  const declarado = /MAGENTO_BACKEND_URL\s*:\s*["'](https:\/\/[^"']+)["']/i.exec(html)?.[1];
  if (!declarado) return null;
  try {
    const loja = new URL(enderecoLoja);
    const backend = new URL(declarado);
    const dominio = loja.hostname.replace(/^www\./i, "");
    // O HTML e de terceiros. Nao seguir um backend arbitrario apontado por ele.
    if (backend.protocol !== "https:" || (backend.hostname !== dominio && !backend.hostname.endsWith(`.${dominio}`))) return null;
    return new URL("/graphql", backend).toString();
  } catch {
    return null;
  }
}

async function consultar(graphql, consulta, sinal) {
  const url = new URL(graphql);
  url.searchParams.set("query", consulta);
  const resposta = await buscarPagina(url.toString(), { sinal });
  if (!resposta.ok || !resposta.corpo) throw new Error(resposta.erro ?? `GraphQL respondeu HTTP ${resposta.status ?? "?"}`);
  let dados;
  try {
    dados = JSON.parse(resposta.corpo);
  } catch {
    throw new Error("O catalogo GraphQL nao devolveu JSON.");
  }
  // O Magento pode falhar em custom_attributesV2 de UM item e ainda devolver a
  // pagina inteira em data.products.items (observado na pagina 2 da Ryndack).
  // Descartar a resposta por causa desse erro parcial interromperia a varredura
  // apos os primeiros 50 produtos. Os atributos ausentes ficam vazios so ali.
  if (dados.errors?.length && !dados.data) throw new Error(dados.errors[0].message ?? "Erro no catalogo GraphQL.");
  return dados.data;
}

/** Alguns temas guardam a ficha inteira em um unico atributo JSON. */
export function especificacoesDosAtributosMagento(atributos, rotulos) {
  return (atributos ?? []).flatMap((atributo) => {
    const nome = rotulos.get(atributo.code);
    if (!nome) return [];
    const valor = comoTexto(atributo.value)
      ?? atributo.selected_options?.map((opcao) => comoTexto(opcao.label)).filter(Boolean).join(", ");
    if (!valor) return [];

    if (/atributos?_?json/i.test(atributo.code) || /atributos?\s+json/i.test(nome)) {
      try {
        const lista = JSON.parse(valor);
        if (!Array.isArray(lista)) return [];
        return lista.flatMap((item) => {
          const campo = comoTexto(item?.name ?? item?.nome);
          const dado = comoTexto(item?.value ?? item?.valor);
          return campo && dado ? [{ nome: campo, valor: dado }] : [];
        });
      } catch {
        return [];
      }
    }
    return [{ nome, valor }];
  });
}

function produtoDoMagentoPwa(item, origem, plataforma, rotulos) {
  const slug = String(item.url_key ?? "").replace(/^\/+|\/+$/g, "");
  const url = slug ? comoUrlAbsoluta(`/${slug}${item.url_suffix ?? ".html"}`, origem) : null;
  const preco = Number(item.price_range?.minimum_price?.final_price?.value);
  const precoNormal = Number.isFinite(preco) && preco > 0 ? Math.round(preco * 100) / 100 : null;
  const precoAVista = Number(item.cash_price?.final_price);
  const desconto = Number(item.cash_price?.percent_off);
  // Algumas consultas por SKU devolvem final_price=0, mas ainda informam o
  // percentual. Na listagem o valor vem com ate quatro casas (131.6795): a
  // vitrine apresenta dinheiro com duas, arredondando 138,61 -> 131,68.
  const brutoAVista = precoAVista > 0
    ? precoAVista
    : precoNormal && desconto > 0 && desconto < 100
      ? precoNormal * (1 - desconto / 100)
      : null;
  const promocional = brutoAVista && precoNormal
    ? Math.round(brutoAVista * 100) / 100
    : null;
  const imagens = [...new Set([
    item.small_image?.url,
    ...(item.media_gallery ?? []).map((foto) => foto?.url),
  ].map((imagem) => comoUrlAbsoluta(imagem, origem)).filter(Boolean))];
  const status = item.stock_status === "IN_STOCK" ? "AVAILABLE" : item.stock_status === "OUT_OF_STOCK" ? "OUT_OF_STOCK" : "UNKNOWN";
  const specifications = especificacoesDosAtributosMagento(item.custom_attributesV2?.items, rotulos);
  const descricao = comoTexto(item.description?.html) ?? comoTexto(item.short_description?.html);
  const tituloSeo = comoTexto(item.meta_title);
  const descricaoSeo = comoTexto(item.meta_description);
  const resumoDerivado = descricao && descricao.length > 160
    ? `${descricao.slice(0, 160).replace(/\s+\S*$/, "").replace(/[\s,;:.]+$/, "")}…`
    : descricao;
  const seo = {
    title: tituloSeo ?? comoTexto(item.name),
    description: descricaoSeo ?? resumoDerivado,
    keywords: comoTexto(item.meta_keyword),
    canonical: comoUrlAbsoluta(item.canonical_url, origem) ?? url,
  };
  return {
    name: comoTexto(item.name),
    code: item.sku ? String(item.sku) : "N/A",
    mpn: null, ean: null, brand: null, model: null,
    category: item.categories?.at(-1)?.name ?? null,
    ncm: null, url, images: imagens,
    prices: { normal: precoNormal, promotional: promocional && promocional < precoNormal ? promocional : null, comImpostos: null },
    taxes: [],
    stock: { status, quantity: status === "OUT_OF_STOCK" ? 0 : null, aChegar: null },
    description: descricao,
    specifications, documentos: [], variants: [], seo,
    plataforma: { id: plataforma.id, nome: plataforma.nome, confianca: plataforma.confianca },
    collectedAt: new Date().toISOString(),
    origens: {
      name: "Magento GraphQL: name", code: "Magento GraphQL: sku",
      url: "Magento GraphQL: url_key", precoNormal: "Magento GraphQL: final_price",
      ...(promocional && promocional < precoNormal ? { precoPromocional: "Magento GraphQL: cash_price" } : {}),
      description: "Magento GraphQL: description", images: "Magento GraphQL: media_gallery",
      ...(specifications.length ? { specifications: "Magento GraphQL: atributos visiveis" } : {}),
      seo: tituloSeo || descricaoSeo || item.meta_keyword || item.canonical_url
        ? "Magento GraphQL: metadados SEO (campos ausentes derivados do produto)"
        : "Titulo, resumo e URL derivados dos dados publicados do produto",
      status: "Magento GraphQL: stock_status",
    },
  };
}

/** A mesma leitura serve para testar a fonte e para a varredura completa. */
export async function colherMagentoPwa({ graphql, origem, secao, limite, orcamento, fonte, plataforma, jaColetadas, aoGuardar, aoProgredir, sinal }) {
  let categoriaId = null;
  let visitas = 0;
  let retomados = 0;
  let total = null;
  const produtos = [];
  const rotulos = new Map();

  try {
    // O Magento declara quais atributos sao exibidos na ficha tecnica e seus
    // rotulos traduzidos. A consulta e unica por fonte; evita importar campos
    // internos como tax_class_id, imagem e preco como se fossem especificacoes.
    try {
      const dados = await consultar(graphql, `{
        attributesList(entityType: CATALOG_PRODUCT, filters: { is_visible_on_front: true }) {
          items { code label }
        }
      }`, sinal);
      visitas++;
      for (const atributo of dados?.attributesList?.items ?? []) {
        if (atributo.code && atributo.label) rotulos.set(atributo.code, atributo.label);
      }
    } catch (erro) {
      if (sinal?.aborted) throw erro;
      // Produto ainda pode ser lido sem a ficha se o endpoint de metadados falhar.
    }

    if (secao?.trim()) {
      const caminho = secao.trim().replace(/^\/+|\/+$/g, "");
      const dados = await consultar(graphql, `{
        categories(filters: { url_path: { eq: ${JSON.stringify(caminho)} } }) { items { id } }
      }`, sinal);
      visitas++;
      categoriaId = dados?.categories?.items?.[0]?.id;
      if (!categoriaId) throw new Error(`A secao /${caminho} nao existe no catalogo Magento.`);
    }

    for (let pagina = 1; visitas < orcamento && produtos.length + retomados < limite; pagina++) {
      sinal?.throwIfAborted();
      const argumento = categoriaId
        ? `filter: { category_id: { eq: ${JSON.stringify(String(categoriaId))} } }`
        : `search: ""`;
      const dados = await consultar(graphql, `{
        products(${argumento}, pageSize: ${TAMANHO_PAGINA}, currentPage: ${pagina}) { ${CAMPOS} }
      }`, sinal);
      visitas++;
      const bloco = dados?.products;
      const itens = bloco?.items;
      if (!Array.isArray(itens)) throw new Error("O catalogo GraphQL nao trouxe a lista de produtos.");
      if (total === null && bloco.total_count != null && Number.isFinite(Number(bloco.total_count))) total = Number(bloco.total_count);

      for (const item of itens) {
        if (produtos.length + retomados >= limite) break;
        if (!item) continue;
        const produto = produtoDoMagentoPwa(item, origem, plataforma, rotulos);
        if (!produto.name || !produto.url || !produto.code || (fonte.type !== "FORNECEDOR" && !produto.prices.normal)) continue;
        if (jaColetadas?.has(produto.url.replace(/\/+$/, ""))) {
          retomados++;
          continue;
        }
        produtos.push(produto);
        await aoGuardar?.(produto);
      }
      await aoProgredir?.({ visitadas: visitas, produtos: produtos.length + retomados, retomados });
      if (itens.length < TAMANHO_PAGINA || pagina * TAMANHO_PAGINA >= total) break;
    }
    return { produtos, retomados, total, visitas, erro: null };
  } catch (erro) {
    if (sinal?.aborted) throw erro;
    return { produtos, retomados, total, visitas, erro: erro.message };
  }
}

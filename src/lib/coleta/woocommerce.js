import { buscarPagina } from "./buscar";
import { ehProdutoValido, especificacoesDaDescricao } from "./normalizar";
import { ehForseti, precosDaForseti } from "./forseti";
import { comoTexto, comoUrlAbsoluta } from "./texto-html";

const TAMANHO_PAGINA = 20;

function dinheiro(valor, casas) {
  if (valor === null || valor === undefined || valor === "") return null;
  const centavos = Number(valor);
  const decimais = Number(casas);
  if (!Number.isFinite(centavos) || centavos <= 0 || !Number.isInteger(decimais) || decimais < 0 || decimais > 4) return null;
  return Math.round((centavos / 10 ** decimais) * 100) / 100;
}

/** A Store API publica dinheiro em unidades menores (ex.: 2500 = R$ 25,00). */
export function produtoDoWooCommerce(item, origem, plataforma, html = "") {
  const url = comoUrlAbsoluta(item?.permalink, origem);
  const precos = item?.prices ?? {};
  const normal = dinheiro(precos.regular_price, precos.currency_minor_unit)
    ?? dinheiro(precos.price, precos.currency_minor_unit);
  const atual = dinheiro(precos.price, precos.currency_minor_unit);
  const forseti = precosDaForseti(html, url);
  const aVista = forseti?.aVista;
  const vigente = aVista && atual && aVista < atual ? aVista : atual;
  const promocional = vigente && normal && vigente < normal ? vigente : null;
  const indisponivel = item?.is_in_stock === false || item?.stock_status === "outofstock";
  const atributos = (item?.attributes ?? []).flatMap((atributo) => {
    const nome = comoTexto(atributo.name);
    const valor = (atributo.terms ?? []).map((termo) => comoTexto(termo.name)).filter(Boolean).join(", ");
    return nome && valor ? [{ nome, valor }] : [];
  });
  const descricao = comoTexto(item?.description) ?? comoTexto(item?.short_description);
  const specifications = especificacoesDaDescricao(item?.description || item?.short_description, atributos);
  return {
    name: comoTexto(item?.name), code: item?.sku ? String(item.sku) : "N/A",
    mpn: null, ean: null, brand: null, model: null,
    category: comoTexto(item?.categories?.at(-1)?.name), ncm: null, url,
    images: [...new Set((item?.images ?? []).map((imagem) => comoUrlAbsoluta(imagem?.src, origem)).filter(Boolean))],
    prices: { normal, promotional: promocional, comImpostos: null }, taxes: [],
    stock: { status: indisponivel ? "OUT_OF_STOCK" : item?.is_in_stock === true ? "AVAILABLE" : "UNKNOWN", quantity: indisponivel ? 0 : null, aChegar: null },
    description: descricao, specifications, documentos: [], variants: [],
    seo: { title: comoTexto(item?.name), description: comoTexto(item?.short_description) ?? descricao?.slice(0, 160) ?? null, keywords: null, canonical: url },
    plataforma: { id: plataforma.id, nome: plataforma.nome, confianca: plataforma.confianca },
    collectedAt: new Date().toISOString(),
    origens: { name: "WooCommerce Store API: name", code: "WooCommerce Store API: sku", url: "WooCommerce Store API: permalink", precoNormal: "WooCommerce Store API: prices.regular_price", ...(promocional ? { precoPromocional: promocional === aVista ? "painel da Forseti: preco a vista no PIX" : "WooCommerce Store API: prices.price" } : {}), images: "WooCommerce Store API: images", description: "WooCommerce Store API: description", status: "WooCommerce Store API: is_in_stock" },
  };
}

/** Teste e worker usam a mesma leitura, com limite, retomada e ritmo de buscarPagina. */
export async function colherWooCommerce({ catalogo, origem, secao, limite, orcamento, fonte, plataforma, jaColetadas, aoGuardar, aoProgredir, sinal, buscar = buscarPagina }) {
  const produtos = [];
  const vistos = new Set();
  let retomados = 0;
  let visitas = 0;
  let total = null;
  const trecho = secao?.trim().replace(/^\/+|\/+$/g, "");
  try {
    for (let pagina = 1; visitas < orcamento && produtos.length + retomados < limite; pagina++) {
      sinal?.throwIfAborted();
      const endereco = new URL(catalogo.url);
      endereco.searchParams.set("per_page", String(TAMANHO_PAGINA));
      endereco.searchParams.set("page", String(pagina));
      const resposta = await buscar(endereco.toString(), { sinal });
      visitas++;
      if (!resposta.ok || !resposta.corpo) throw new Error(resposta.erro ?? `Store API respondeu HTTP ${resposta.status ?? "?"}`);
      let itens;
      try { itens = JSON.parse(resposta.corpo); } catch { throw new Error("A Store API nao devolveu JSON."); }
      if (!Array.isArray(itens)) throw new Error("A Store API nao devolveu uma lista de produtos.");
      const declarado = Number(resposta.cabecalhos?.["x-wp-total"]);
      if (total === null && Number.isFinite(declarado) && declarado >= 0) total = declarado;

      for (const item of itens) {
        if (produtos.length + retomados >= limite) break;
        // /loja/ e a pagina geral do WooCommerce, nao uma categoria.
        if (trecho && trecho !== "loja" && !(item.categories ?? []).some((categoria) => categoria.slug === trecho || categoria.link?.includes(`/${trecho}/`))) continue;
        let produto = produtoDoWooCommerce(item, origem, plataforma);
        if (!ehProdutoValido(produto, fonte.type)) continue;
        const chave = produto.code !== "N/A" ? `sku:${produto.code}` : produto.url;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        if (jaColetadas?.has(produto.url.replace(/\/+$/, ""))) { retomados++; continue; }
        if (ehForseti(produto.url)) {
          if (visitas >= orcamento) throw new Error("Limite de visitas atingido antes de conferir o PIX da Forseti.");
          sinal?.throwIfAborted();
          const paginaProduto = await buscar(produto.url, { sinal });
          visitas++;
          if (!paginaProduto.ok || !paginaProduto.corpo) throw new Error(paginaProduto.erro ?? "Nao foi possivel conferir o preco na pagina da Forseti.");
          produto = produtoDoWooCommerce(item, origem, plataforma, paginaProduto.corpo);
        }
        produtos.push(produto);
        await aoGuardar?.(produto);
      }
      await aoProgredir?.({ visitadas: visitas, produtos: produtos.length + retomados, retomados });
      if (itens.length < TAMANHO_PAGINA || (total !== null && pagina * TAMANHO_PAGINA >= total)) break;
    }
    return { produtos, retomados, total, visitas, erro: null };
  } catch (erro) {
    if (sinal?.aborted) throw erro;
    return { produtos, retomados, total, visitas, erro: erro.message };
  }
}

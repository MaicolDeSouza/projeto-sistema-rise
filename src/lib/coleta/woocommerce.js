import { buscarPagina } from "./buscar";
import { ehProdutoValido, especificacoesDaDescricao, precosDoSimuladorWoo } from "./normalizar";
import { ehForseti, precosDaForseti } from "./forseti";
import { aplicarRegraDePagamento, aprenderRegraDePagamento } from "./pagamento";
import { caminhoDeCategoria } from "./categoria";
import { comoTexto, comoUrlAbsoluta, enderecoComparavel } from "./texto-html";

const TAMANHO_PAGINA = 20;

function dinheiro(valor, casas) {
  if (valor === null || valor === undefined || valor === "") return null;
  const centavos = Number(valor);
  const decimais = Number(casas);
  if (!Number.isFinite(centavos) || centavos <= 0 || !Number.isInteger(decimais) || decimais < 0 || decimais > 4) return null;
  return Math.round((centavos / 10 ** decimais) * 100) / 100;
}

/**
 * Categoria como CAMINHO ("Impressão 3D > Partes"), decisao do dono em 09/10/2026.
 *
 * A Store API da a lista PLANA das categorias do produto (pai e filha juntas), mas
 * o `link` de cada uma traz a hierarquia: ".../categoria/impressao-3d/partes-impressao-3d/".
 * Os slugs do caminho viram nomes pela propria lista; vale a categoria mais funda.
 * Ate ali ficava so a ultima da lista ("Partes").
 */
export function caminhoDasCategoriasWoo(categorias) {
  const lista = Array.isArray(categorias) ? categorias : [];
  const nomePorSlug = new Map(
    lista.filter((categoria) => categoria?.slug).map((categoria) => [categoria.slug, comoTexto(categoria.name)]),
  );

  let melhor = null;
  for (const categoria of lista) {
    let segmentos = [];
    try {
      // O primeiro segmento e a base da taxonomia ("categoria", "product-category").
      segmentos = new URL(categoria?.link).pathname.split("/").filter(Boolean).slice(1);
    } catch {
      segmentos = [];
    }
    const nomes = segmentos.map((slug) => nomePorSlug.get(slug)).filter(Boolean);
    const caminho = caminhoDeCategoria(nomes.length ? nomes : [comoTexto(categoria?.name)]);
    if (caminho && (!melhor || caminho.split(" > ").length > melhor.split(" > ").length)) melhor = caminho;
  }
  return melhor;
}

/**
 * A Store API publica dinheiro em unidades menores (ex.: 2500 = R$ 25,00).
 *
 * `html` e a pagina do produto, quando foi aberta: o preco a vista (PIX) nao esta
 * na API — na Forseti fica num painel proprio, na Makerhero no bloco do Simulador
 * de Parcelas. `aVistaCalculado` ({ valor, origem }) e o PIX deduzido pela regra da
 * loja ja aprendida, sem abrir a pagina (ver colherWooCommerce).
 */
export function produtoDoWooCommerce(item, origem, plataforma, html = "", aVistaCalculado = null) {
  const url = comoUrlAbsoluta(item?.permalink, origem);
  const precos = item?.prices ?? {};
  const normal = dinheiro(precos.regular_price, precos.currency_minor_unit)
    ?? dinheiro(precos.price, precos.currency_minor_unit);
  const atual = dinheiro(precos.price, precos.currency_minor_unit);
  const forseti = precosDaForseti(html, url);
  const simulador = html ? precosDoSimuladorWoo(html) : null;
  const aVista = forseti?.aVista ?? simulador?.aVista ?? aVistaCalculado?.valor ?? null;
  const origemAVista = forseti?.aVista
    ? "painel da Forseti: preco a vista no PIX"
    : simulador?.aVista
      ? "pagina do produto (simulador de parcelas): preco no PIX"
      : aVistaCalculado?.origem ?? null;
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
  const category = caminhoDasCategoriasWoo(item?.categories);
  return {
    name: comoTexto(item?.name), code: item?.sku ? String(item.sku) : "N/A",
    mpn: null, ean: null, brand: null, model: null,
    category, ncm: null, url,
    images: [...new Set((item?.images ?? []).map((imagem) => comoUrlAbsoluta(imagem?.src, origem)).filter(Boolean))],
    prices: { normal, promotional: promocional, comImpostos: null }, taxes: [],
    stock: { status: indisponivel ? "OUT_OF_STOCK" : item?.is_in_stock === true ? "AVAILABLE" : "UNKNOWN", quantity: indisponivel ? 0 : null, aChegar: null },
    description: descricao, specifications, documentos: [], variants: [],
    seo: { title: comoTexto(item?.name), description: comoTexto(item?.short_description) ?? descricao?.slice(0, 160) ?? null, keywords: null, canonical: url },
    plataforma: { id: plataforma.id, nome: plataforma.nome, confianca: plataforma.confianca },
    collectedAt: new Date().toISOString(),
    origens: {
      name: "WooCommerce Store API: name", code: "WooCommerce Store API: sku", url: "WooCommerce Store API: permalink",
      precoNormal: "WooCommerce Store API: prices.regular_price",
      ...(promocional ? { precoPromocional: promocional === aVista ? origemAVista : "WooCommerce Store API: prices.price" } : {}),
      ...(category ? { category: "WooCommerce Store API: categories (caminho pelo link)" } : {}),
      images: "WooCommerce Store API: images", description: "WooCommerce Store API: description", status: "WooCommerce Store API: is_in_stock",
    },
  };
}

/** Percentual de desconto entre dois precos, inteiro quando a diferenca e so de arredondamento do centavo. */
function percentualDeDesconto(cheio, aVista) {
  const bruto = (1 - aVista / cheio) * 100;
  const decimo = Math.round(bruto * 10) / 10;
  return Math.abs(decimo - Math.round(decimo)) < 0.06 ? Math.round(decimo) : decimo;
}

/** Teste e worker usam a mesma leitura, com limite, retomada e ritmo de buscarPagina. */
export async function colherWooCommerce({ catalogo, origem, secao, limite, orcamento, fonte, plataforma, jaColetadas, evitar, aoGuardar, aoProgredir, sinal, buscar = buscarPagina }) {
  const produtos = [];
  const vistos = new Set();
  let retomados = 0;
  let visitas = 0;
  let total = null;
  const trecho = secao?.trim().replace(/^\/+|\/+$/g, "");

  /*
    PIX DA LOJA, APRENDIDO NAS PRIMEIRAS PAGINAS (Makerhero, 09/10/2026).

    A Store API nao traz o preco a vista; ele so existe no bloco do Simulador de
    Parcelas da pagina de cada produto ("R$ 12,25 no PIX"). Abrir a pagina de todo
    produto DOBRARIA a varredura (2 s por visita). O desconto e da loja, entao a
    regra e aprendida com a mesma logica da Tray (pagamento.js: percentual unico e
    o modo de arredondar provado por amostra que separa os dois) e aplicada ao
    resto. Loja sem o bloco: desiste na primeira pagina, uma visita so.
  */
  const memoria = { regra: null, semRegra: false, amostras: [], semSimulador: false };

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
      try { itens = JSON.parse(resposta.corpo); } catch { throw new Error("A Store API não devolveu JSON."); }
      if (!Array.isArray(itens)) throw new Error("A Store API não devolveu uma lista de produtos.");
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
        // "Amostra variada" (09/10/2026, a Makerhero): pula o que o teste anterior
        // ja mostrou, sem contar como achado, para trazer tres DIFERENTES. O
        // Magento PWA ja fazia isso; aqui o `evitar` nem chegava.
        if (evitar?.has(enderecoComparavel(produto.url))) continue;
        if (ehForseti(produto.url)) {
          if (visitas >= orcamento) throw new Error("Limite de visitas atingido antes de conferir o PIX da Forseti.");
          sinal?.throwIfAborted();
          const paginaProduto = await buscar(produto.url, { sinal });
          visitas++;
          if (!paginaProduto.ok || !paginaProduto.corpo) throw new Error(paginaProduto.erro ?? "Não foi possível conferir o preço na página da Forseti.");
          produto = produtoDoWooCommerce(item, origem, plataforma, paginaProduto.corpo);
        } else if (!memoria.semSimulador) {
          const cobrado = dinheiro(item?.prices?.price, item?.prices?.currency_minor_unit);
          if (memoria.regra) {
            // Regra ja aprendida: calcula, sem visita. Desconto 0 = loja sem PIX mais barato.
            if (memoria.regra.percentual && cobrado) {
              produto = produtoDoWooCommerce(item, origem, plataforma, "", {
                valor: aplicarRegraDePagamento(memoria.regra, cobrado),
                origem: `calculado: desconto de ${memoria.regra.percentual}% da loja no PIX, conferido em ${memoria.regra.conferidoEm} leitura(s)`,
              });
            }
          } else if (visitas < orcamento) {
            sinal?.throwIfAborted();
            const paginaProduto = await buscar(produto.url, { sinal });
            visitas++;
            const simulador = paginaProduto.ok && paginaProduto.corpo ? precosDoSimuladorWoo(paginaProduto.corpo) : null;
            if (paginaProduto.ok && paginaProduto.corpo && !simulador) {
              // A pagina abriu e nao tem o bloco: a loja nao usa o simulador.
              memoria.semSimulador = true;
            } else if (simulador) {
              produto = produtoDoWooCommerce(item, origem, plataforma, paginaProduto.corpo);
              if (!memoria.semRegra) {
                memoria.amostras.push({
                  precoTabela: simulador.normal,
                  percentual: simulador.aVista ? percentualDeDesconto(simulador.normal, simulador.aVista) : 0,
                  aVista: simulador.aVista ?? simulador.normal,
                });
                const aprendido = aprenderRegraDePagamento(memoria.amostras);
                if (aprendido.regra) memoria.regra = aprendido.regra;
                if (aprendido.semRegra) memoria.semRegra = true;
              }
            }
          }
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

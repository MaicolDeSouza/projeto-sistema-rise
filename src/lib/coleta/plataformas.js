/**
 * Quem serve esta loja, e como aquela plataforma entrega os dados.
 *
 * PRIMEIRO PASSO DO TESTE DE FONTE. Saber a plataforma antes de ler a pagina
 * muda o que se procura: a Loja Integrada publica produto inteiro em Microdata
 * e NENHUM JSON-LD; a Tray declara so o nome e esconde o preco num input; a
 * PrestaShop guarda o preco de tabela numa variavel de script. Sem essa
 * resposta, o extrator tenta os tres formatos as cegas e o relatorio do teste
 * so consegue dizer "faltou preco" — nunca ONDE o preco estava.
 *
 * Cada entrada aqui foi CONFERIDA em loja real, com a data da conferencia. O
 * que nao foi conferido esta marcado, porque impressao digital envelhece: loja
 * troca de plataforma (o Eletrogate ja foi descrito como Loja Integrada e
 * continua sendo, mas hoje responde por infra da VTEX) e plataforma troca de
 * CDN.
 *
 * Nada aqui faz requisicao. E dado; quem visita e buscarPagina.
 */

/// Pesos por tipo de sinal. O meta generator e o CDN proprio sao os unicos que
/// a loja nao consegue emitir por acidente; cabecalho e cookie vem da infra, e
/// podem ser compartilhados por plataformas diferentes (ver a armadilha da
/// Loja Integrada com "vtex-integrated-store"); marca no HTML e a mais fraca,
/// porque um link de rodape ou um script de terceiro cita qualquer nome.
const PESOS = {
  gerador: 6,
  host: 5,
  cabecalho: 4,
  cookie: 3,
  caminho: 3,
  html: 2,
};

/**
 * O catalogo.
 *
 * `entrega` responde "onde estao os dados nesta plataforma" e e o que a tela
 * mostra ao operador. `catalogo` so existe quando a plataforma publica o
 * catalogo em JSON SEM exigir credencial — verificado, nao presumido.
 */
export const PLATAFORMAS = [
  // -------------------------------------------------------------------------
  {
    id: "aspnet-uploads",
    nome: "Plataforma propria em ASP.NET (_uploads)",
    familia: "front proprio",
    conferidaEm: "2026-09-16",
    conferidaEm_lojas: ["eletruscomp.com.br"],
    sinais: {
      cabecalho: [["x-aspnetmvc-version", /\d/]],
      caminho: [["/_uploads/ProdutoDestaque/", /\/_uploads\/ProdutoDestaque\//i]],
      html: [
        ['class="detalhe_informacoes_cod_ref"', /detalhe_informacoes_cod_ref/],
        ['class="produto__valor__parcelas"', /produto__valor__parcelas/],
        ['class="loja__breadcrumb"', /loja__breadcrumb/],
      ],
    },
    entrega: {
      formatos: ["microdata parcial", "painel da pagina"],
      resumo:
        "Sem JSON-LD. O Microdata so tem nome, preco e imagem, com sku VAZIO; codigo, referencia, marca, a vista, descricao e ficha estao no HTML do painel e das abas.",
      preco:
        'itemprop="price" content="320.00" no painel. O a vista vem escrito: "Ou R$ 304,00 a vista ( - 5% )". Produto sem estoque nao tem preco — o botao vira "avise-me".',
      imagens: "/_uploads/ProdutoDestaque/ProdutoDestaque_{id}_{n}__orig.jpg (tambem __thumb.webp e __facebook.webp).",
      sitemap: "/sitemap.xml plano: /{slug}/p sao produtos (1.825 na Eletrus), /produtos/... sao categorias.",
      urlProduto: "/{slug}/p",
      cuidados: [
        "A HOME e as listagens repetem itemtype=Product nos cards (produto__item--box): lidas como produto, viravam um item sem codigo com a URL da home.",
        '"Cód: 53.00.1463" e o codigo da loja; "Ref:" as vezes e a referencia do fabricante (OBT500-18GM60-E5) e as vezes so o nome cortado em 30 letras ("LAMPADA VAPOR SODIO 250 W E-40").',
        "Descricao e ficha tecnica em abas (#aba5000, #aba5001); a ficha e uma lista de 'Nome: valor'.",
      ],
      catalogo: null,
    },
  },

  // -------------------------------------------------------------------------
  {
    id: "loja-integrada",
    nome: "Loja Integrada",
    familia: "SaaS brasileira",
    conferidaEm: "2026-08-30",
    conferidaEm_lojas: ["eletrogate.com", "impactocnc.com", "baudaeletronica.com.br"],
    sinais: {
      gerador: [/Loja Integrada/i],
      host: [/(^|\.)awsli\.com\.br$/i],
      // ARMADILHA: este cabecalho diz "vtex" e NAO e VTEX. A Loja Integrada foi
      // comprada pela VTEX e hoje roda na infra dela; toda loja LI responde
      // "x-powered-by: vtex-integrated-store". Quem tratar isso como VTEX vai
      // procurar catalogo em vtexcommercestable.com.br e nao achar nada.
      cabecalho: [["x-powered-by", /vtex-integrated-store/i]],
      cookie: [/^segment$/],
      html: [["link para lojaintegrada.com.br", /lojaintegrada\.com\.br/i]],
    },
    entrega: {
      formatos: ["microdata"],
      resumo:
        "Microdata completo na pagina. Nao publica JSON-LD nenhum: procurar so por JSON-LD devolve zero.",
      preco:
        'itemprop="price" dentro de itemprop="offers". O de tabela, quando existe, aparece em data-sell-price.',
      imagens:
        "cdn.awsli.com.br/{largura}x{altura}/{n}/{loja}/produto/{idProduto}/{hash}.jpg — o trecho produto/{id}/ separa as fotos deste produto das dos relacionados. O que vem de /arquivos/ e tema, nao produto.",
      sitemap:
        "/sitemap.xml e indice e aponta para /sitemap/product-N.xml (tambem brand- e category-). O indice lista a HOME como se fosse um sitemap.",
      urlProduto: "slug na raiz, sem id: /nome-do-produto",
      cuidados: [
        'og:type vem como "website" mesmo na pagina de produto — nao serve para reconhecer produto.',
        "A pagina repete itemtype=Product para cada relacionado (cinco numa pagina medida); o recorte no primeiro isRelatedTo e obrigatorio.",
        "A galeria fica FORA do escopo do itemtype=Product — recortar no bloco do produto custa as fotos.",
        "O codigo do produto aparece em twitter:label1/twitter:data1.",
      ],
      catalogo: null,
      notaApi:
        "A API de vitrine (api.awsli.com.br/v1) exige Chave de Aplicacao, so emitida a provedores de solucao, e o robots.txt das lojas costuma bloquear /api/*.",
    },
  },

  // -------------------------------------------------------------------------
  {
    id: "tray",
    nome: "Tray",
    familia: "SaaS brasileira",
    conferidaEm: "2026-08-30",
    conferidaEm_lojas: [
      "casadarobotica.com",
      "smartkits.com.br",
      "arduinobrasilshop.com.br",
    ],
    sinais: {
      host: [/(^|\.)tcdn\.com\.br$/i],
      caminho: [
        ["/loja/arquivos/<idLoja>/", /\/loja\/arquivos\/\d+\//i],
        ["/img/img_prod/<idLoja>/", /\/img\/img_prod\/\d+\//i],
      ],
      html: [
        ["traycheckout", /traycheckout/i],
        ["dataLayerGa4", /dataLayerGa4/],
        ['input id="preco_atual"', /id=["']preco_atual["']/i],
      ],
    },
    entrega: {
      formatos: ["microdata (so o nome)", "opengraph", "campo oculto", "dataLayer"],
      resumo:
        "O Microdata declara SO o nome — sem price, sem offers, sem sku. O preco legivel por maquina esta num input escondido.",
      preco:
        '<input type="hidden" id="preco_atual" value="25.99"> e o preco de tabela. O precoAvista logo abaixo e MENOR: e o do pix. O preco visivel quebra os centavos em <span> aninhados e nao serve.',
      imagens:
        "images.tcdn.com.br/img/img_prod/{idLoja}/[{largura}_]{...}{idProduto}_{indice}_{hash}.jpg. O diretorio e balde da loja inteira — o que separa e o id do produto no NOME do arquivo. categoria_img_* e banner; /commerce/assets/ e tema.",
      sitemap: "/sitemap.xml e indice e aponta para /loja/arquivos/{idLoja}/sitemaps/sitemap_N.xml",
      urlProduto: "slug na raiz: /nome-do-produto",
      cuidados: [
        "Os relacionados ficam DENTRO do escopo do itemtype=Product — o contrario da Loja Integrada. Recortar no bloco do produto nao resolve imagem aqui.",
        "O id do produto sai do dataLayer, e tambem do input ProductComment[product_id].",
        "A ficha tecnica vem com cada item em seu proprio paragrafo.",
        "O codigo visivel na pagina ('REF: SK1244') e o reference do dataLayer. O sku do JSON-LD, quando existe, e o id INTERNO da Tray — nao serve para achar o produto na loja.",
      ],
      // O preco a vista NAO esta na pagina.
      //
      // O bloco "Formas de Pagamento" e preenchido por AJAX: na Smartkits a
      // pagina anuncia 52,15 no pix e a string "52,15" nao aparece uma vez
      // sequer no HTML entregue. Este e o endereco que o proprio tema chama
      // (formas_pagamento.min.js), com os tres parametros que ele passa.
      //
      // FORA do Disallow do robots.txt: o que esta barrado la e o endpoint
      // ANTIGO (/loja/pag_parcelado.php) e os de carrinho. Responde em
      // ISO-8859-1, entao quem le tem que passar por buscarPagina.
      pagamento: {
        caminho: "/mvc/store/product/payment_options",
        conferidoEm: "2026-09-01",
        conferidoEm_lojas: ["smartkits.com.br"],
        // Medido em tres produtos da Smartkits: 59,90 -> 56,90; 8,90 -> 8,45;
        // 54,90 -> 52,15. Os 5% sao da LOJA, nao do produto.
        //
        // Mesmo assim o valor e LIDO, nao calculado: a Tray TRUNCA o centavo em
        // vez de arredondar (56,905 vira 56,90), e reproduzir esse truncamento
        // seria derivar um preco de concorrente a partir de uma regra suposta.
        observacao:
          "Desconto a vista e da loja inteira, mas o valor sai do endpoint porque a Tray trunca o centavo em vez de arredondar.",
      },
      // Medido em duas lojas independentes: responde 200 sem token nenhum.
      // /web_api/categories, na mesma loja, responde 401 — ou seja, e um
      // recorte deliberado da plataforma, nao um vazamento de uma loja so.
      catalogo: {
        caminho: "/web_api/products?limit=50",
        detalhe: "/web_api/products/{id}",
        formato: "json",
        totalEm: ["paging", "total"],
        listaEm: "Products",
        campos:
          "name, price, promotional_price, ean, ncm, brand, model, slug, category_id, available, ProductImage[], Variant[], Properties[]",
        conferidoEm: "2026-08-30",
        observacao:
          "Publico, sem token. Pagina de 50 no maximo. /web_api/categories exige token (401).",
      },
    },
  },

  // -------------------------------------------------------------------------
  {
    id: "prestashop",
    nome: "PrestaShop",
    familia: "Open source (inclui forks: thirty bees)",
    conferidaEm: "2026-08-30",
    conferidaEm_lojas: ["usinainfo.com.br (thirty bees)", "huinfinito.com.br"],
    sinais: {
      gerador: [/PrestaShop/i],
      cookie: [/^PrestaShop-[0-9a-f]{16,}$/i, /^thirtybees-[0-9a-f]{16,}$/i],
      cabecalho: [["powered-by", /thirty bees/i]],
      caminho: [["/themes/<tema>/", /\/themes\/[a-z0-9_-]+\//i]],
      html: [
        ["variavel productPriceWithoutReduction", /productPriceWithoutReduction/],
        ["input product_page_product_id", /id=["']product_page_product_id["']/i],
      ],
    },
    entrega: {
      formatos: ["microdata", "opengraph", "json-ld (1.7 com modulo)"],
      resumo:
        "Microdata completo, com sku, mpn, brand e breadcrumb. A 1.7 costuma somar JSON-LD; a 1.6 e os forks, nao.",
      preco:
        "productPriceWithoutReduction, numa variavel de script, e o preco de TABELA — o unico lugar onde ele aparece. product:price:amount (OpenGraph) traz o preco vigente.",
      imagens:
        "/{idImagem}-{tipo}/{slug}.jpg (tipo: large_default, home_default, cart_default) ou /{d}/{i}/{g}/{idImagem}-{tipo}.jpg. O numero na pasta identifica a foto; o nome do arquivo e o slug e repete entre fotos.",
      sitemap:
        "Frequentemente NAO ha sitemap de produto: o robots.txt pode declarar um sitemap de rotas de busca. Quando falta, a descoberta e por navegacao.",
      urlProduto: "/{categoria}/{slug}-{id}.html — o id fica no fim do slug",
      cuidados: [
        "O id do produto tambem esta no input escondido id_product / product_page_product_id.",
        "O breadcrumb em Microdata da a categoria.",
      ],
      catalogo: null,
      notaApi: "O webservice /api/ existe mas exige chave gerada pelo lojista.",
    },
  },

  // -------------------------------------------------------------------------
  {
    id: "vtex",
    nome: "VTEX",
    familia: "Enterprise brasileira",
    conferidaEm: "2026-08-30",
    conferidaEm_lojas: ["fastshop.com.br", "zeedog.com.br (headless deco.cx)"],
    sinais: {
      host: [
        /(^|\.)vtexassets\.com$/i,
        /(^|\.)vteximg\.com\.br$/i,
        /(^|\.)vtexcommercestable\.com\.br$/i,
        /(^|\.)io\.vtex\.com\.br$/i,
      ],
      // O generico "x-vtex-*" e o sinal bom; "x-powered-by: vtex-integrated-store"
      // NAO entra aqui de proposito — aquele cabecalho e da Loja Integrada.
      cabecalho: [["x-vtex-janus-router-backend-app", /./]],
      html: [
        ["__RUNTIME__ (VTEX IO)", /__RUNTIME__/],
        ["vtexassets.com no HTML", /vtexassets\.com/i],
      ],
    },
    entrega: {
      formatos: ["json-ld", "api publica"],
      resumo:
        "A pagina traz JSON-LD na maioria dos temas, mas o caminho bom e a API de catalogo, que e publica.",
      preco: "JSON-LD offers, e o campo commertialOffer.Price na API.",
      imagens: "{conta}.vtexassets.com/arquivos/ids/{id}-{largura}-{altura}/...",
      sitemap: "/sitemap.xml, com indice por categoria.",
      urlProduto: "/{slug}/p",
      cuidados: [
        "A conta VTEX sai do host do asset: fastshopbr.vtexassets.com => conta fastshopbr.",
        "No dominio da loja a API costuma responder 503 (o CDN barra); no host {conta}.vtexcommercestable.com.br ela responde.",
        'CUIDADO: "x-powered-by: vtex-integrated-store" sozinho e Loja Integrada, nao VTEX.',
      ],
      catalogo: {
        caminho: "/api/catalog_system/pub/products/search?_from=0&_to=49",
        hostAlternativo: "https://{conta}.vtexcommercestable.com.br",
        formato: "json",
        campos:
          "productId, productName, brand, linkText, productReference, items[] com sellers[].commertialOffer (Price, ListPrice, AvailableQuantity)",
        conferidoEm: "2026-08-30",
        observacao:
          "Responde 206 Partial Content; o total vem no cabecalho resources. Sem token.",
      },
    },
  },

  // -------------------------------------------------------------------------
  {
    id: "shopify",
    nome: "Shopify",
    familia: "SaaS internacional",
    conferidaEm: "2026-08-30",
    conferidaEm_lojas: ["allbirds.com"],
    sinais: {
      cabecalho: [
        ["powered-by", /Shopify/i],
        ["x-shopid", /./],
        ["x-shopify-stage", /./],
      ],
      cookie: [/^_shopify_/i],
      host: [/(^|\.)cdn\.shopify\.com$/i, /(^|\.)myshopify\.com$/i],
      html: [["Shopify.theme", /Shopify\.theme/]],
    },
    entrega: {
      formatos: ["json-ld", "api publica"],
      resumo: "Catalogo inteiro em JSON, sem token, no proprio dominio da loja.",
      preco: "variants[].price e compare_at_price (o de tabela) no products.json.",
      imagens: "cdn.shopify.com/s/files/... — o sufixo _{largura}x e a mesma foto redimensionada.",
      sitemap: "/sitemap.xml e indice e aponta para sitemap_products_1.xml",
      urlProduto: "/products/{handle}",
      cuidados: [
        "products.json nao traz descricao completa em todos os temas; a pagina traz.",
      ],
      catalogo: {
        caminho: "/products.json?limit=250",
        detalhe: "/products/{handle}.json",
        formato: "json",
        listaEm: "products",
        campos:
          "id, title, handle, body_html, vendor, product_type, variants[] (price, sku, barcode), images[]",
        conferidoEm: "2026-08-30",
        observacao: "Publico. Pagina com &page=N.",
      },
    },
  },

  // -------------------------------------------------------------------------
  {
    id: "nuvemshop",
    nome: "Nuvemshop (Tiendanube)",
    familia: "SaaS latino-americana",
    conferidaEm: "2026-08-30",
    conferidaEm_lojas: ["lojavirtualnuvem.com.br (loja de demonstracao)"],
    sinais: {
      host: [/(^|\.)mitiendanube\.com$/i, /(^|\.)lojavirtualnuvem\.com\.br$/i],
      html: [
        ["link para nuvemshop.com.br", /nuvemshop\.com\.br/i],
        ["objeto window.LS", /window\.LS\b/],
      ],
    },
    entrega: {
      formatos: ["json-ld"],
      resumo: "JSON-LD na pagina. Nao publica catalogo em JSON: /products.json responde 404.",
      preco: "offers do JSON-LD.",
      imagens: "dcdn.mitiendanube.com / dcdn-us.mitiendanube.com",
      sitemap: "/sitemap.xml plano (sem indice), com as URLs sob o prefixo de idioma /br/.",
      urlProduto: "/produtos/{slug}/",
      cuidados: ["O objeto JS window.LS carrega o produto quando o tema o expoe."],
      catalogo: null,
    },
  },

  // -------------------------------------------------------------------------
  {
    id: "woocommerce",
    nome: "WooCommerce (WordPress)",
    familia: "Open source",
    conferidaEm: "2026-08-30",
    conferidaEm_lojas: ["eletronicamaker.com.br"],
    sinais: {
      gerador: [/WooCommerce/i, /WordPress/i],
      caminho: [["/wp-content/plugins/woocommerce/", /\/wp-content\/plugins\/woocommerce\//i]],
      html: [
        ["classe woocommerce-page", /woocommerce-page/i],
        ["wc-add-to-cart", /wc-add-to-cart/i],
      ],
    },
    entrega: {
      formatos: ["json-ld"],
      resumo: "JSON-LD por padrao. A Store API pode estar aberta, mas muitos hosts a bloqueiam.",
      preco: "offers do JSON-LD; a promocao aparece como <del>/<ins> no HTML.",
      imagens: "/wp-content/uploads/{ano}/{mes}/... — o sufixo -{largura}x{altura} e redimensionamento.",
      sitemap:
        "Depende do plugin de SEO: product-sitemap.xml (Yoast) ou sitemap_index.xml (RankMath).",
      urlProduto: "/produto/{slug}/ ou /?p={id}",
      cuidados: [
        "A Store API (/wp-json/wc/store/v1/products) e publica quando existe, mas foi medida bloqueada por firewall de hospedagem (403). Tentar e cair para o HTML.",
      ],
      catalogo: {
        caminho: "/wp-json/wc/store/v1/products?per_page=100",
        formato: "json",
        conferidoEm: "2026-08-30",
        observacao:
          "Aberta por padrao no WooCommerce, mas medida em 403 numa loja real — nunca contar com ela sem testar.",
        incerto: true,
      },
    },
  },

  // -------------------------------------------------------------------------
  {
    id: "magento2",
    nome: "Magento 2 / Adobe Commerce",
    familia: "Open source / enterprise",
    conferidaEm: "2026-08-30",
    conferidaEm_lojas: ["saravati.com.br"],
    sinais: {
      caminho: [["/static/version<ts>/frontend/", /\/static\/version\d+\/frontend\//i]],
      html: [["modulos Magento_*", /Magento_[A-Z][A-Za-z]+/]],
      cookie: [/^X-Magento-Vary$/i, /^mage-/i],
    },
    entrega: {
      formatos: ["json-ld (ItemPage > mainEntity)", "opengraph", "graphql publico"],
      resumo:
        "O /graphql responde consulta de catalogo sem autenticacao. Na pagina, o JSON-LD " +
        "vem como ItemPage com o Product dentro de mainEntity, e NAO ha Microdata nenhum.",
      preco:
        "TRES precos na mesma pagina, medidos na Saravati: data-price-type=\"finalPrice\" e " +
        "product:price:amount (OpenGraph) trazem o que se paga no cartao (1.499,90); " +
        "data-price-type=\"oldPrice\" e o riscado (1.599,90), que NAO e o preco vigente; e a " +
        "oferta do JSON-LD traz o do pix/boleto (1.349,91). price_range.minimum_price.final_price no GraphQL.",
      codigo: 'sku no JSON-LD e no dataLayer; na tela, <div class="product attribute sku">.',
      estoque:
        'quantidade em <div class="availability only" title="2 itens"> — o schema.org da pagina nao traz inventoryLevel.',
      imagens: "/media/catalog/product/cache/{hash}/{caminho}",
      sitemap: "/sitemap.xml (gerado pelo painel; nem toda loja publica).",
      urlProduto: "/{url_key}.html",
      cuidados: [
        'Muitos robots.txt de Magento trazem "Disallow: /*?*" — a consulta GraphQL por GET cai nessa regra; por POST, nao.',
      ],
      catalogo: {
        // O caminho e a versao por GET, que e a que o teste consegue conferir
        // com buscarPagina. A consulta de verdade vale mais por POST: o GET
        // carrega query string, e muito robots.txt de Magento traz
        // "Disallow: /*?*" — a mesma consulta que passa por POST e recusada por
        // GET, e recusa se respeita.
        caminho: "/graphql?query=%7Bproducts(search%3A%22%22%2CpageSize%3A1)%7Btotal_count%7D%7D",
        metodo: "POST",
        corpo:
          '{"query":"{products(search:\\"\\",pageSize:50){total_count items{sku name url_key price_range{minimum_price{final_price{value currency}}}}}}"}',
        formato: "json",
        totalEm: ["data", "products", "total_count"],
        conferidoEm: "2026-08-30",
        observacao: "Publico para catalogo. Medido: 4225 produtos numa loja real.",
      },
    },
  },

  // -------------------------------------------------------------------------
  {
    id: "magento1",
    nome: "Magento 1",
    familia: "Open source (fim de vida)",
    conferidaEm: "2026-08-30",
    conferidaEm_lojas: ["multcomercial.com.br"],
    sinais: {
      caminho: [
        ["/skin/frontend/", /\/skin\/frontend\//i],
        ["/js/mage/", /\/js\/mage\//i],
      ],
      cookie: [/^frontend$/],
      html: [["mage/cookies", /mage\/cookies/i]],
    },
    entrega: {
      formatos: ["json-ld", "microdata"],
      resumo: "Depende do tema. Sem GraphQL — a versao 1 nao tem.",
      preco: "JSON-LD quando o tema publica; senao, do HTML.",
      imagens: "/media/catalog/product/cache/...",
      sitemap: "/sitemap.xml",
      urlProduto: "/{url_key}.html",
      cuidados: [],
      catalogo: null,
    },
  },

  // -------------------------------------------------------------------------
  {
    id: "opencart",
    nome: "OpenCart",
    familia: "Open source",
    conferidaEm: "2026-08-30",
    conferidaEm_lojas: ["soldafria.com.br"],
    sinais: {
      cookie: [/^OCSESSID$/i],
      caminho: [["/catalog/view/theme/", /\/catalog\/view\/theme\//i]],
      html: [["index.php?route=product/product", /index\.php\?route=product\/product/i]],
    },
    entrega: {
      formatos: ["json-ld"],
      resumo: "JSON-LD nos temas atuais; nas versoes antigas, so o HTML.",
      preco: "offers do JSON-LD.",
      imagens: "/image/cache/catalog/... — o sufixo -{largura}x{altura} e redimensionamento.",
      sitemap: "index.php?route=extension/feed/google_sitemap (quando a extensao esta ligada).",
      urlProduto: "index.php?route=product/product&product_id={id}, ou slug com SEO ligado",
      // O MESMO produto tem um endereco por caminho de categoria (`/x`,
      // `/arduino/x`, `/arduino/acessorios/x`) e o sitemap lista todos. Medido na
      // Solda Fria (19/09/2026): 38.839 enderecos para ~8,6 mil produtos.
      identidadePorProduto: "ultimo-segmento",
      cuidados: [],
      catalogo: null,
    },
  },

  // -------------------------------------------------------------------------
  // Daqui para baixo: impressao digital conhecida, NAO conferida nesta sessao.
  // Serve para reconhecer e avisar o operador; as regras de entrega precisam de
  // uma loja real antes de virarem regra de extracao.
  // -------------------------------------------------------------------------
  {
    id: "wake",
    nome: "Wake Commerce (ex-Fbits / Tray Corp)",
    familia: "Enterprise brasileira",
    conferidaEm: null,
    sinais: {
      host: [/(^|\.)fbitsstatic\.net$/i, /(^|\.)fbits\.net$/i],
      html: [["wake.tech", /wake\.tech/i]],
    },
    entrega: {
      formatos: ["json-ld"],
      resumo: "Plataforma headless. Impressao digital reconhecida; entrega ainda nao conferida.",
      cuidados: ["Nenhuma loja Wake foi aberta ainda — confirmar antes de confiar."],
      catalogo: null,
    },
  },
  {
    id: "linx",
    nome: "Linx Commerce",
    familia: "Enterprise brasileira",
    conferidaEm: null,
    sinais: {
      host: [/(^|\.)linximpulse\.(net|com)$/i, /(^|\.)chaordicsystems\.com$/i],
      html: [["link para linx.com.br", /linx\.com\.br/i]],
    },
    entrega: {
      formatos: ["json-ld"],
      resumo: "Impressao digital reconhecida; entrega ainda nao conferida.",
      cuidados: ["Os hosts da Linx tambem aparecem como VITRINE em loja de outra plataforma."],
      catalogo: null,
    },
  },
  {
    id: "bagy",
    nome: "Bagy / Dooca",
    familia: "SaaS brasileira",
    conferidaEm: null,
    sinais: {
      host: [/(^|\.)dooca\.store$/i, /(^|\.)bagy\.com\.br$/i],
      html: [["__NUXT__", /__NUXT__/]],
    },
    entrega: {
      formatos: ["json-ld"],
      resumo: "Impressao digital reconhecida; entrega ainda nao conferida.",
      cuidados: ["Renderiza no cliente (Nuxt) — o HTML pode vir sem produto."],
      catalogo: null,
    },
  },
  {
    id: "yampi",
    nome: "Yampi",
    familia: "SaaS brasileira",
    conferidaEm: null,
    sinais: {
      host: [/(^|\.)yampi\.io$/i, /(^|\.)yampi\.com\.br$/i],
      html: [["marca yampi", /yampi/i]],
    },
    entrega: {
      formatos: [],
      resumo: "Impressao digital reconhecida; entrega ainda nao conferida.",
      cuidados: [],
      catalogo: null,
    },
  },
  {
    id: "wbuy",
    nome: "Wbuy",
    familia: "SaaS brasileira",
    conferidaEm: null,
    sinais: {
      host: [/(^|\.)wbuy\.com\.br$/i],
      html: [["link para wbuy.com.br", /wbuy\.com\.br/i]],
    },
    entrega: { formatos: [], resumo: "Impressao digital reconhecida; entrega ainda nao conferida.", cuidados: [], catalogo: null },
  },
  {
    id: "irroba",
    nome: "Irroba",
    familia: "SaaS brasileira",
    conferidaEm: null,
    sinais: {
      host: [/(^|\.)irroba\.com\.br$/i],
      html: [["marca irroba", /irroba/i]],
    },
    entrega: {
      formatos: [],
      resumo: "Derivada de OpenCart; entrega ainda nao conferida.",
      cuidados: [],
      catalogo: null,
    },
  },
];

/// Resposta quando nada casa. Nao e erro: loja grande costuma ter front
/// proprio (Next.js, PHP caseiro), e nesses casos o caminho e o de sempre —
/// ler os tres formatos estruturados e ver o que vem.
export const DESCONHECIDA = {
  id: "desconhecida",
  nome: "Nao identificada",
  familia: null,
  conferidaEm: null,
  entrega: {
    formatos: [],
    resumo:
      "Plataforma nao reconhecida — provavelmente front proprio. A leitura segue pelo caminho generico: JSON-LD, Microdata e OpenGraph.",
    cuidados: [],
    catalogo: null,
  },
};

/**
 * Hosts do HTML, separados por quem SERVE a pagina e quem so e citado.
 *
 * A diferenca decidiu a Saravati, em 15/09/2026: a pagina de produto cita UMA
 * vez `cdn.awsli.com.br` — num `<a>` para o PDF do datasheet, hospedado no CDN
 * de outra loja — e isso valia os mesmos 5 pontos de um CDN servindo a loja
 * inteira. Deu empate com o Magento (caminho 3 + marca 2), e no empate venceu
 * quem aparece antes na lista: a loja Magento saiu identificada como Loja
 * Integrada, com os cuidados e os campos errados na tela do operador.
 *
 * `<link href>` conta como servico — folha de estilo e fonte sao da loja. So o
 * `<a href>` e citacao.
 */
function hostsDoHtml(html) {
  const servem = new Set();
  const citados = new Set();

  for (const achado of html.matchAll(/(?:src|data-src)=["']https?:\/\/([a-z0-9.-]+)/gi)) {
    servem.add(achado[1].toLowerCase());
  }
  for (const achado of html.matchAll(/<link\b[^>]+href=["']https?:\/\/([a-z0-9.-]+)/gi)) {
    servem.add(achado[1].toLowerCase());
  }
  for (const achado of html.matchAll(/<a\b[^>]+href=["']https?:\/\/([a-z0-9.-]+)/gi)) {
    citados.add(achado[1].toLowerCase());
  }

  return { servem: [...servem], citados: [...citados] };
}

function generatorDoHtml(html) {
  return /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ?? null;
}

/**
 * Quem serve esta loja.
 *
 * Soma pontos por sinal em vez de parar no primeiro que casa: um sinal sozinho
 * erra. "vtex-integrated-store" no cabecalho aponta VTEX e a loja e Loja
 * Integrada; o nome "prestashop" no HTML aparece em loja de outra plataforma
 * que instalou um modulo migrado. Somando, o CDN proprio mais o meta generator
 * decidem, e o cabecalho isolado nao derruba os dois.
 *
 * @param {object} entrada
 * @param {string} entrada.html
 * @param {Record<string,string>} [entrada.cabecalhos] chaves em minusculas
 * @param {string[]} [entrada.cookies] nomes dos cookies do Set-Cookie
 * @returns {{id: string, nome: string, confianca: "alta"|"media"|"baixa"|"nenhuma",
 *   pontos: number, sinais: string[], entrega: object, alternativas: object[]}}
 */
export function identificarPlataforma({ html = "", cabecalhos = {}, cookies = [] } = {}) {
  const { servem, citados } = hostsDoHtml(html);
  const gerador = generatorDoHtml(html);

  const notas = [];

  for (const plataforma of PLATAFORMAS) {
    const sinais = [];
    let pontos = 0;

    for (const padrao of plataforma.sinais.gerador ?? []) {
      if (gerador && padrao.test(gerador)) {
        pontos += PESOS.gerador;
        sinais.push(`meta generator "${gerador}"`);
      }
    }

    for (const padrao of plataforma.sinais.host ?? []) {
      const servindo = servem.find((host) => padrao.test(host));
      if (servindo) {
        pontos += PESOS.host;
        sinais.push(`CDN ${servindo}`);
        continue;
      }

      // Citado num link, nao servindo a pagina: vale o mesmo que uma marca
      // solta no HTML. Loja hospeda arquivo no CDN de terceiro o tempo todo.
      const citado = citados.find((host) => padrao.test(host));
      if (citado) {
        pontos += PESOS.html;
        sinais.push(`${citado} citado num link`);
      }
    }

    for (const [nome, padrao] of plataforma.sinais.cabecalho ?? []) {
      const valor = cabecalhos[nome];
      if (valor && padrao.test(valor)) {
        pontos += PESOS.cabecalho;
        sinais.push(`cabecalho ${nome}: ${valor}`);
      }
    }

    for (const padrao of plataforma.sinais.cookie ?? []) {
      const casado = cookies.find((nome) => padrao.test(nome));
      if (casado) {
        pontos += PESOS.cookie;
        sinais.push(`cookie ${casado}`);
      }
    }

    // Rotulo, e nao a expressao regular: este detalhe vai para a tela do
    // operador, e "caminho \/img\/img_prod\/\d+\/" nao ajuda quem esta
    // decidindo se cadastra a fonte.
    for (const [rotulo, padrao] of plataforma.sinais.caminho ?? []) {
      if (padrao.test(html)) {
        pontos += PESOS.caminho;
        sinais.push(`caminho ${rotulo}`);
      }
    }

    for (const [rotulo, padrao] of plataforma.sinais.html ?? []) {
      if (padrao.test(html)) {
        pontos += PESOS.html;
        sinais.push(rotulo);
      }
    }

    if (pontos > 0) notas.push({ plataforma, pontos, sinais });
  }

  if (notas.length === 0) {
    return { ...DESCONHECIDA, confianca: "nenhuma", pontos: 0, sinais: [], alternativas: [] };
  }

  notas.sort((a, b) => b.pontos - a.pontos);
  const [melhor, ...resto] = notas;

  return {
    id: melhor.plataforma.id,
    nome: melhor.plataforma.nome,
    familia: melhor.plataforma.familia,
    conferidaEm: melhor.plataforma.conferidaEm,
    entrega: melhor.plataforma.entrega,
    pontos: melhor.pontos,
    sinais: melhor.sinais,
    // Uma pontuacao alta pode vir de um sinal forte so (o meta generator) ou de
    // varios fracos. "alta" exige que dois sinais concordem, porque e a
    // pontuacao que a tela transforma em afirmacao.
    confianca:
      melhor.pontos >= 8 && melhor.sinais.length >= 2
        ? "alta"
        : melhor.pontos >= PESOS.host
          ? "media"
          : "baixa",
    // O que ficou perto. Serve para o operador quando a loja e hibrida — front
    // de uma plataforma e vitrine de outra.
    alternativas: resto
      .filter((nota) => nota.pontos >= PESOS.cookie)
      .map((nota) => ({ id: nota.plataforma.id, nome: nota.plataforma.nome, pontos: nota.pontos })),
  };
}

/** Regras de uma plataforma pelo id, para quem ja sabe qual e. */
export function regrasDaPlataforma(id) {
  return PLATAFORMAS.find((plataforma) => plataforma.id === id) ?? DESCONHECIDA;
}

/**
 * O que identifica o PRODUTO por tras de um endereco, ou null quando a plataforma
 * nao repete produto por caminho de categoria (ou nao foi conferida).
 *
 * Existe por causa da Solda Fria (OpenCart, 19/09/2026): cada produto aparece em
 * varios enderecos que so diferem pelo caminho de categoria, e o sitemap lista
 * todos. O worker abria cada um a 2,3 s — na Solda Fria, 10.647 aberturas para
 * 5.350 produtos — e a segunda abertura REESCREVIA a linha ja gravada (url e
 * coletadoEm trocados pela ultima variante visitada).
 *
 * A chave e o id quando o endereco termina em `-p-<id>.html`; senao, o ULTIMO
 * segmento do caminho, que as variantes de um mesmo produto compartilham. Medido
 * no sitemap dela: 24.505 enderecos de slug puro dao 5.766 ultimos segmentos, e
 * 14.333 com `-p-N.html` dao 2.877 ids. O `?` entra na chave: `/arduino?page=2` e
 * `/arduino` sao paginas diferentes.
 *
 * So vale onde o registro declara `identidadePorProduto`: em loja generica o
 * ultimo segmento pode repetir de verdade (`/produto/1` e `/servico/1`).
 */
export function identidadeDoEndereco(plataforma, endereco) {
  const regra = regrasDaPlataforma(plataforma?.id ?? plataforma).entrega?.identidadePorProduto;
  if (regra !== "ultimo-segmento") return null;

  try {
    const url = new URL(endereco);
    const ultimo = url.pathname.split("/").filter(Boolean).at(-1);
    if (!ultimo) return null;

    const id = /-p-(\d+)\.html?$/i.exec(ultimo)?.[1];
    if (id) return `p:${id}`;

    return `${ultimo.toLowerCase()}${url.search}`;
  } catch {
    return null;
  }
}

/**
 * Conta VTEX a partir do host do asset.
 *
 * "fastshopbr.vtexassets.com" => "fastshopbr". A conta e o que abre a API de
 * catalogo: no dominio da propria loja ela costuma responder 503, porque o CDN
 * da frente barra o caminho /api.
 */
export function contaVtex(html) {
  return (
    /https?:\/\/([a-z0-9-]+)\.vtexassets\.com/i.exec(html)?.[1] ??
    /https?:\/\/([a-z0-9-]+)\.vteximg\.com\.br/i.exec(html)?.[1] ??
    null
  );
}

/**
 * Endereco do catalogo publico desta loja, ou null.
 *
 * Devolve endereco, nao dados: quem visita e buscarPagina, que respeita
 * robots.txt e o ritmo do dominio. Um catalogo publico nao dispensa nenhuma das
 * duas coisas.
 */
export function catalogoPublicoDe(plataforma, urlBase, html = "") {
  const regras = regrasDaPlataforma(plataforma?.id ?? plataforma);
  const catalogo = regras.entrega?.catalogo;
  if (!catalogo) return null;

  const origem = new URL(urlBase).origin;

  if (regras.id === "vtex") {
    const conta = contaVtex(html);
    if (!conta) return null;
    return {
      ...catalogo,
      url: `https://${conta}.vtexcommercestable.com.br${catalogo.caminho}`,
      conta,
    };
  }

  return { ...catalogo, url: `${origem}${catalogo.caminho}` };
}

/**
 * O endereco onde a plataforma publica as formas de pagamento.
 *
 * Mesmo desenho do catalogo: o registro guarda o caminho, quem visita e
 * buscarPagina. Devolve null para plataforma que entrega o preco a vista na
 * propria pagina — nao ha requisicao a fazer.
 */
export function pagamentoDe(plataforma, urlBase) {
  const regras = regrasDaPlataforma(plataforma?.id ?? plataforma);
  const pagamento = regras.entrega?.pagamento;
  if (!pagamento) return null;

  return { ...pagamento, url: `${new URL(urlBase).origin}${pagamento.caminho}` };
}

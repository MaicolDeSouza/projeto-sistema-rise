/**
 * Testes da extracao e da normalizacao, SEM REDE.
 *
 * Recebem HTML de mentira e conferem o produto normalizado. Servem para provar
 * as regras que so aparecem em caso raro — variacao com codigo proprio, preco
 * promocional, pagina que nao e produto — sem depender de o site de ninguem
 * continuar no ar e com o mesmo layout.
 *
 *   npm run teste:extracao
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");

register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { extrairProduto, resumirExtracao } = await import("../src/lib/coleta/extrair.js");
const { doMicrodata } = await import("../src/lib/coleta/microdata.js");
const { comoNumero } = await import("../src/lib/coleta/texto-html.js");
const { normalizarPagina, ehProdutoValido } = await import(
  "../src/lib/coleta/normalizar.js"
);
const { conciliar, quedaSuspeita } = await import("../src/lib/coleta/conciliar.js");
const { produtoDoWooCommerce, colherWooCommerce } = await import("../src/lib/coleta/woocommerce.js");
const { precosDaForseti } = await import("../src/lib/coleta/forseti.js");
const { readFile } = await import("node:fs/promises");

let falhas = 0;

/** Valor de uma especificacao pelo nome, na lista ordenada. */
const espec = (produto, nome) =>
  (produto.specifications ?? []).find((item) => item.nome === nome)?.valor ?? null;
const nomesEspec = (produto) =>
  (produto.specifications ?? []).map((item) => item.nome);

function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${
      ok ? "" : `\n        obtido=${JSON.stringify(obtido)}\n      esperado=${JSON.stringify(esperado)}`
    }`,
  );
}

const woo = produtoDoWooCommerce({
  name: "Placa &#8211; teste", sku: "ABC", permalink: "https://loja.exemplo.com/produto/abc/",
  prices: { regular_price: "12990", price: "10990", currency_minor_unit: 2 },
  is_in_stock: false, images: [{ src: "https://loja.exemplo.com/foto.webp" }],
  attributes: [{ name: "Cor", terms: [{ name: "Azul" }] }],
  description: "<p>Descricao do produto</p>",
}, "https://loja.exemplo.com", { id: "woocommerce", nome: "WooCommerce", confianca: "alta" });
conferir("WooCommerce decodifica o nome", woo.name, "Placa – teste");
conferir("WooCommerce converte centavos em reais", woo.prices, { normal: 129.9, promotional: 109.9, comImpostos: null });
conferir("WooCommerce preserva estoque e atributos", [woo.stock.status, woo.specifications], ["OUT_OF_STOCK", [{ nome: "Cor", valor: "Azul" }]]);
conferir("WooCommerce nao inventa preco zerado", produtoDoWooCommerce({ prices: { price: "0", regular_price: "0", currency_minor_unit: 2 } }, "https://loja.exemplo.com", { id: "woocommerce" }).prices.normal, null);

console.log("\n— Forseti: Store API, ficha na descricao e dois paineis de PIX —");
const lerFixture = (nome) => readFile(new URL(`./fixtures/${nome}`, import.meta.url), "utf8");
const forsetiItem = JSON.parse(await lerFixture("forseti-produto.json"));
const coposItem = JSON.parse(await lerFixture("forseti-copos.json"));
const forsetiHtml = await lerFixture("forseti-preco.html");
const coposHtml = await lerFixture("forseti-copos-preco.html");
const origemForseti = "https://loja.forsetisolucoes.com.br";
const plataformaWoo = { id: "woocommerce" };
const parafuso = produtoDoWooCommerce(forsetiItem, origemForseti, plataformaWoo, forsetiHtml);
conferir("parafuso: normal e PIX lido da pagina", parafuso.prices, { normal: 25, promotional: 22.5, comImpostos: null });
conferir("parafuso: todas as 12 especificacoes, sem marketing", parafuso.specifications.length, 12);
conferir("parafuso: comprimento da rosca", espec(parafuso, "Comprimento da rosca"), "40 mm");
conferir("atributos da API sao preservados sem duplicar a descricao", produtoDoWooCommerce({ ...forsetiItem, attributes: [{ name: "Rosca", terms: [{ name: "M24" }] }] }, origemForseti, plataformaWoo).specifications.length, 12);
conferir("copos: link externo da API recebe PIX da Loja Integrada", produtoDoWooCommerce(coposItem, origemForseti, plataformaWoo, coposHtml).prices, { normal: 125, promotional: 112.5, comImpostos: null });
conferir("sem pagina nao presume desconto", produtoDoWooCommerce(forsetiItem, origemForseti, plataformaWoo).prices.promotional, null);
conferir("nao aplica painel da Forseti a outro dominio", precosDaForseti(forsetiHtml, "https://exemplo.com/produto"), null);
conferir("nao confunde parcelas com PIX", precosDaForseti(coposHtml.replace(/via Pix/g, "no cartao"), coposItem.permalink), null);
conferir("sem desconto no principal nao usa relacionado", precosDaForseti(coposHtml.replace(/via Pix/g, "no cartao") + coposHtml, coposItem.permalink), null);
for (const [item, painel, esperado] of [[forsetiItem, forsetiHtml, 22.5], [coposItem, coposHtml, 112.5]]) {
  const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: item.name, offers: { "@type": "Offer", price: Number(item.prices.price) / 100 } })}</script>${painel}`;
  conferir(`leitura HTML tambem encontra PIX de ${esperado}`, normalizarPagina({ html, url: item.permalink }).produtos[0].prices.promotional, esperado);
}
const chamadasWoo = [];
const guardadosWoo = [];
const entradaWoo = {
  catalogo: { url: `${origemForseti}/wp-json/wc/store/v1/products` }, origem: origemForseti,
  limite: 2, orcamento: 3, fonte: { type: "CONCORRENTE" }, plataforma: plataformaWoo,
  aoGuardar: (produto) => guardadosWoo.push(produto),
  buscar: async (url) => {
    chamadasWoo.push(url);
    return { ok: true, corpo: url.includes("/wp-json/") ? JSON.stringify([forsetiItem, coposItem]) : url === forsetiItem.permalink ? forsetiHtml : coposHtml, cabecalhos: { "x-wp-total": "2" } };
  },
};
const colheitaWoo = await colherWooCommerce(entradaWoo);
conferir("coleta consulta catalogo e as duas paginas antes de salvar", [colheitaWoo.erro, colheitaWoo.visitas, chamadasWoo.length, guardadosWoo.map(p => p.prices.promotional)], [null, 3, 3, [22.5, 112.5]]);
chamadasWoo.length = 0;
await colherWooCommerce({ ...entradaWoo, jaColetadas: new Set([forsetiItem.permalink.replace(/\/+$/, ""), coposItem.permalink.replace(/\/+$/, "")]) });
conferir("retomada nao reabre produtos ja salvos", chamadasWoo.length, 1);
const limitadaWoo = await colherWooCommerce({ ...entradaWoo, orcamento: 1 });
conferir("orcamento nao salva produto antes de conferir PIX", [limitadaWoo.produtos.length, Boolean(limitadaWoo.erro), limitadaWoo.visitas], [0, true, 1]);
const falhouWoo = await colherWooCommerce({ ...entradaWoo, buscar: async (url) => url.includes("/wp-json/") ? { ok: true, corpo: JSON.stringify([forsetiItem]) } : { ok: false, erro: "HTTP 503" } });
conferir("falha na pagina fica retomavel sem salvar preco incompleto", [falhouWoo.produtos.length, falhouWoo.erro], [0, "HTTP 503"]);

// ---------------------------------------------------------------------------
console.log("\n— preco em formato brasileiro —");
conferir("1.299,90 vira 1299.90", comoNumero("R$ 1.299,90"), 1299.9);
conferir("1234.56 continua", comoNumero("1234.56"), 1234.56);
conferir("1,234.56 vira 1234.56", comoNumero("1,234.56"), 1234.56);
conferir("89,90 vira 89.9", comoNumero("89,90"), 89.9);
conferir("texto vira null", comoNumero("sob consulta"), null);
conferir("zero vira null", comoNumero("0"), null);

// ---------------------------------------------------------------------------
console.log("\n— JSON-LD —");
const jsonLd = `<html><head>
<script type="application/ld+json">{ quebrado }</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Mouse Logitech M170",
 "description":"<p>Mouse <b>sem fio</b>.</p>","brand":{"name":"Logitech"},"model":"M170",
 "mpn":"910-004940","sku":"MOU-12","gtin13":"097855102324","image":["/img/a.jpg"],
 "additionalProperty":[{"@type":"PropertyValue","name":"Cor","value":"Cinza"}],
 "offers":{"@type":"Offer","price":"89,90","availability":"https://schema.org/InStock"}}
</script></head></html>`;

const doJson = normalizarPagina({ html: jsonLd, url: "https://loja.com.br/p/mouse" });
const mouse = doJson.produtos[0];
conferir("nome", mouse.name, "Mouse Logitech M170");
conferir("marca", mouse.brand, "Logitech");
conferir("codigo", mouse.code, "MOU-12");
conferir("mpn", mouse.mpn, "910-004940");
conferir("ean", mouse.ean, "097855102324");
conferir("preco normal", mouse.prices.normal, 89.9);
conferir("sem promocional", mouse.prices.promotional, null);
conferir("descricao sem tags", mouse.description, "Mouse sem fio .");
conferir("imagem relativa resolvida", mouse.images[0], "https://loja.com.br/img/a.jpg");
conferir("especificacoes", mouse.specifications, [{ nome: "Cor", valor: "Cinza" }]);
conferir("estoque", mouse.stock, {
  status: "AVAILABLE",
  quantity: null,
  // Vitrine nao informa o que esta por chegar: isso e dado de fornecedor e
  // entra por arquivo. O campo existe nos dois caminhos, vazio aqui.
  aChegar: null,
});
conferir("bloco quebrado nao derruba", ehProdutoValido(mouse), true);

// ---------------------------------------------------------------------------
console.log("\n— Microdata (formato da Usinainfo) —");
const microHtml = `<html><head>
<meta property="og:title" content="Display 14 Segmentos 4 D&iacute;gitos"/>
<meta property="product:price:amount" content="39.97"/>
<meta property="og:image" content="https://loja.com.br/img/d.jpg"/>
</head><body>
<nav><span itemprop="itemListElement"><span itemprop="name">Início</span></span>
<span itemprop="itemListElement"><span itemprop="name">Arduino</span></span>
<span itemprop="itemListElement"><span itemprop="name">Displays e Telas</span></span></nav>
<div itemtype="https://schema.org/Product" itemscope>
  <h1 itemprop="name">Display 14 Segmentos 4 D&iacute;gitos</h1>
  <meta itemprop="mpn" content="10524" />
  <span itemprop="sku">10524</span>
  <div itemprop="description">M&oacute;dulo com display de 14 segmentos.</div>
  <div itemprop="price" content="37.97">R$ 37,97</div>
  <meta itemprop="availability" content="http://schema.org/InStock" />
</div>
<script>var productPriceWithoutReduction = '39.97';</script>
</body></html>`;

const micro = doMicrodata(microHtml);
conferir("microdata: mpn", micro.mpn, "10524");
conferir("microdata: sku", micro.skuFonte, "10524");
conferir("microdata: categoria do breadcrumb", micro.categoria, "Arduino > Displays e Telas");
conferir("microdata: nao pega o nome do site", micro.categoria !== "Loja", true);

const display = normalizarPagina({ html: microHtml, url: "https://loja.com.br/p/display" })
  .produtos[0];
conferir("entidade &iacute; decodificada", display.name, "Display 14 Segmentos 4 Dígitos");
conferir("entidade &oacute; decodificada", display.description, "Módulo com display de 14 segmentos.");
conferir("preco NORMAL e o de tabela", display.prices.normal, 39.97);
conferir("preco PROMOCIONAL e o menor", display.prices.promotional, 37.97);
conferir("categoria", display.category, "Arduino > Displays e Telas");
conferir("status", display.stock.status, "AVAILABLE");

// ---------------------------------------------------------------------------
console.log("\n— codigo e SKU num campo so —");
conferir("existe um campo code", display.code, "10524");
conferir("nao existe mais campo sku separado", "sku" in display, false);
conferir("code foi lido, nao derivado", display.origens.code, "itemprop=sku");
conferir(
  "mpn igual ao codigo e sinalizado como codigo da loja",
  display.origens.mpn.includes("igual ao codigo"),
  true,
);
conferir("nome NAO vem do breadcrumb", display.name !== "Início", true);
conferir("nome NAO vem do breadcrumb (2)", display.name !== "Arduino", true);

const soComMpn = normalizarPagina({
  html: `<script type="application/ld+json">
{"@type":"Product","name":"X","mpn":"FAB-77","offers":{"price":"10"}}
</script>`,
  url: "https://loja.com.br/p/z",
}).produtos[0];
conferir("sem sku, o mpn faz as vezes de codigo", soComMpn.code, "FAB-77");
conferir(
  "e a origem diz que foi recurso",
  soComMpn.origens.code.startsWith("sem codigo proprio"),
  true,
);

// ---------------------------------------------------------------------------
console.log("\n— marca, modelo e NCM da ficha tecnica —");
const comFicha = `<script type="application/ld+json">
{"@type":"Product","name":"Modulo X","sku":"99","offers":{"price":"10"},
 "description":"Placa de desenvolvimento para projetos.\\n\\nESPECIFICAÇÕES:\\n- Marca: Espressif;\\n- Modelo: ESP32C3 Super Mini;\\n- NCM: 8542.31.90;\\n- Clock: 160MHz."}
</script>`;

const daFicha = normalizarPagina({ html: comFicha, url: "https://loja.com.br/p/m" }).produtos[0];
conferir("marca lida da ficha tecnica", daFicha.brand, "Espressif");
conferir("origem da marca", daFicha.origens.brand, "ficha tecnica da descricao");
conferir("modelo lido da ficha tecnica", daFicha.model, "ESP32C3 Super Mini");
conferir("NCM so com digitos", daFicha.ncm, "85423190");
conferir("origem do NCM", daFicha.origens.ncm, "ficha tecnica ou descricao");

conferir(
  "NCM invalido nao entra",
  normalizarPagina({
    html: `<script type="application/ld+json">
{"@type":"Product","name":"X","sku":"1","offers":{"price":"10"},"description":"ESPECIFICAÇÕES:\\n- NCM: 123;\\n- Peso: 1g."}
</script>`,
    url: "https://loja.com.br/p/n",
  }).produtos[0].ncm,
  null,
);

// Usinainfo EMW3080V2: "- RAM: 256KB;" e toda maiuscula e era tomada por titulo,
// encerrando a ficha antes de Dimensoes e Peso.
const fichaComSigla = normalizarPagina({
  html: `<script type="application/ld+json">
{"@type":"Product","name":"Modulo WiFi","sku":"10197","offers":{"price":"45"},
 "description":"ESPECIFICAÇÕES:\\n\\n- Chip: MX1290V2;\\n- RAM: 256KB;\\n- Memória Flash: 2MB;\\n- Dimensões(CxLxA): 18x33x3,2mm;\\n- Peso: 3g.\\n\\nEste conteúdo foi gerado por Inteligência Artificial e pode conter erros."}
</script>`,
  url: "https://loja.com.br/p/wifi",
}).produtos[0];
conferir(
  "item em caixa alta com valor nao encerra a ficha",
  fichaComSigla.specifications.map((item) => item.nome),
  ["Chip", "RAM", "Memória Flash", "Dimensões(CxLxA)", "Peso"],
);

// ---------------------------------------------------------------------------
console.log("\n— Magento: a vista do parcelamento e ficha em lista HTML (Mamute) —");

const paginaMagento = ({ precoJsonLd, precoCartao, descontos }) => `
<script type="application/ld+json">{"@context":"https://schema.org/","@type":"ItemPage","mainEntity":{"@type":"Product","name":"Kit 100 Fusiveis de Vidro 5x20mm","sku":"31739","description":"Kit 100 Fusíveis Kit sortido com 100 fusíveis. Especificações Técnicas Formato: Tubular de vidro Dimensões: 5 x 20 mm Aplicações Indicadas Reposição em fontes de alimentação e mais texto","offers":{"@type":"Offer","price":"${precoJsonLd}","priceCurrency":"BRL","availability":"http://schema.org/InStock"}}}</script>
<meta property="product:price:amount" content="${precoCartao}"/>
<script type="text/x-magento-init">{"*":{"installment":{"enabled":true,"discounts":{${descontos}},"interest":{"1":0}}}}</script>
<table class="data table additional-attributes"><tr><th>Fabricante</th><td>IMP</td></tr></table>
<div class="product attribute description"><div class="value">
<h2>Kit 100 Fusíveis</h2><p>Kit sortido com 100 fusíveis.</p>
<h2 style="margin:16px 0 4px">Especificações Técnicas</h2>
<ul style="padding-left:20px"><li><strong>Formato:</strong> Tubular de vidro</li><li><strong>Dimensões:</strong> 5 x 20 mm</li></ul>
<h2>Aplicações Indicadas</h2><ul><li>Reposição em fontes de alimentação</li></ul>
</div></div>`;

const mamute = normalizarPagina({
  html: paginaMagento({
    precoJsonLd: "48.9",
    precoCartao: "48.9",
    descontos: '"_1":{"name":"PIX, Transfer\\u00eancia ou Dep\\u00f3sito","percentage":"5"}',
  }),
  url: "https://www.mamuteeletronica.com.br/kit-31739",
  fonte: { name: "Mamute", type: "CONCORRENTE" },
}).produtos[0];
conferir("a vista calculado do desconto do parcelamento (48,90 - 5% = 46,46)", mamute.prices, {
  normal: 48.9,
  promotional: 46.46,
  comImpostos: null,
});
conferir(
  "descricao da pagina, com titulo e lista, vence a do JSON-LD numa linha so",
  mamute.description.includes("Especificações Técnicas\n- Formato: Tubular de vidro\n- Dimensões: 5 x 20 mm"),
  true,
);
conferir(
  "ficha da lista HTML soma a tabela de atributos, sem a lista seguinte",
  mamute.specifications.map((item) => item.nome),
  ["Fabricante", "Formato", "Dimensões"],
);

const saravati = normalizarPagina({
  html: paginaMagento({
    precoJsonLd: "13.41",
    precoCartao: "14.9",
    descontos: '"_1":{"name":"Pix","percentage":"10"}',
  }),
  url: "https://www.saravati.com.br/p",
  fonte: { name: "Saravati", type: "CONCORRENTE" },
}).produtos[0];
conferir(
  "desconto aplicado sobre o preco de CARTAO, nao sobre o JSON-LD que ja e o do pix",
  [saravati.prices.normal, saravati.prices.promotional],
  [14.9, 13.41],
);

const semPix = normalizarPagina({
  html: paginaMagento({
    precoJsonLd: "48.9",
    precoCartao: "48.9",
    descontos: '"_1":{"name":"Cupom de primeira compra","percentage":"10"}',
  }),
  url: "https://loja.com.br/p",
  fonte: { name: "Loja", type: "CONCORRENTE" },
}).produtos[0];
conferir("desconto que nao e de pagamento a vista nao vira promocional", semPix.prices.promotional, null);

// ---------------------------------------------------------------------------
console.log("\n— plataforma propria ASP.NET (Eletrus) —");

const cardsEletrus = `<div class="produto__item--box" itemscope itemtype="https://schema.org/Product">
<span itemprop="sku" content=""></span><span itemprop="name" content="Sensor da vitrine"></span>
<div itemprop="offers" itemscope itemtype="http://schema.org/Offer"><span itemprop="price" content="700.00">700,00</span></div>
<img data-src="https://www.eletruscomp.com.br/_uploads/ProdutoDestaque/X_1__thumb.webp"></div>`;

const homeEletrus = normalizarPagina({
  html: `<html><body><ul class="loja__breadcrumb"></ul>${cardsEletrus}</body></html>`,
  url: "https://www.eletruscomp.com.br/",
  fonte: { name: "Eletrus", type: "CONCORRENTE" },
});
conferir("listagem da plataforma nao vira produto", homeEletrus.produtos.length, 0);

const paginaEletrus = (ref) => `<html><body>
<nav><a href="https://www.eletruscomp.com.br/catalogos" class="dropdown-item">Cat&#225;logos</a></nav>
<ul class="loja__breadcrumb"><li><a href="/"><i></i></a></li>
<li><a href="/produtos?segmento1=a"><p class="content ">Automa&#231;&#227;o </p></a></li>
<li><a href="/produtos?segmento1=a&segmento2=b"><p class="content ">Sensores </p></a></li>
<li><a href="/x/p"><p class="content active">Sensor fotoeletrico obt500 </p></a></li></ul>
<div class="container" itemscope itemtype="http://schema.org/Product">
<span itemprop="image" itemscope itemtype="http://schema.org/ImageObject"><meta itemprop="contentUrl" content="https://www.eletruscomp.com.br/_uploads/ProdutoDestaque/ProdutoDestaque_749_3205__orig.jpg"></span>
<img data-src="https://www.eletruscomp.com.br/_uploads/produtoArquivo/749_0_0710_orig.jpg">
<figcaption itemprop="caption description"></figcaption><span>Passe o mouse para dar zoom</span>
<div class="detalhe_informacoes detalhe__produto--info"><h1 class="produto__titulo--detalhe" itemprop="name">Sensor fotoeletrico obt500 </h1>
<div class="detalhe_informacoes_cod_ref mb-3"><p><span>Ref: ${ref}</span> <span>C&#243;d: 53.00.1463</span> <span itemprop="brand" content="Autonics">Marca: Autonics</span></p></div>
<span itemprop="sku" content=""></span>
<div class="produto__valor" itemprop="offers" itemscope itemtype="http://schema.org/Offer"><span itemprop="price" content="320.00">320,00</span></div>
<p class="produto__valor__parcelas">Ou R$ 304,00 &#224; vista ( - 5% ) </p>
<a class="btn detalhe-compra-btn comprar-btn" href="#"><span>comprar</span></a></div>
<div class="detalhe_informacoes_frete"></div>
<ul class="nav nav-tabs"><li><a data-bs-toggle="tab" href="#aba5000" class="nav-link">Descri&#231;&#227;o</a></li>
<li><a data-bs-toggle="tab" href="#aba5001" class="nav-link">Caracteristicas T&#233;cnicas</a></li></ul>
<div class="tab-content"><div id="aba5000" class="tab-pane fade show active conteudo"><div class="categoria-descricao"><p>Sensor difuso M18.</p></div></div>
<div id="aba5001" class="tab-pane fade conteudo"><div class="categoria-descricao"><ul><li> Modelo: <strong>OBT500-18GM60-E5</strong></li><li> Alimenta&#231;&#227;o: <strong>10 a 30 VCC</strong></li></ul></div></div></div>
</div>
<div class="modal" id="avise"><p>Avise-me!</p><p>Informe seu nome, e-mail e telefone</p></div>
<footer><p>CNPJ 04.080.033/0001-40</p></footer></body></html>`;

const eletrus = normalizarPagina({
  html: paginaEletrus("OBT500-18GM60-E5"),
  url: "https://www.eletruscomp.com.br/sensor-fotoeletrico-obt500/p",
  fonte: { name: "Eletrus", type: "CONCORRENTE" },
}).produtos[0];
conferir("codigo e o 'Cod:' do painel", eletrus.code, "53.00.1463");
conferir("Ref: de fabricante vira MPN e modelo", [eletrus.mpn, eletrus.model], ["OBT500-18GM60-E5", "OBT500-18GM60-E5"]);
conferir("marca do painel", eletrus.brand, "Autonics");
conferir("categoria e o ultimo degrau antes do produto", eletrus.category, "Automação > Sensores");
conferir("preco e a vista escrito", [eletrus.prices.normal, eletrus.prices.promotional], [320, 304]);
conferir("botao comprar = em estoque", eletrus.stock.status, "AVAILABLE");
conferir("fotos da galeria nas duas pastas, sem o 'Passe o mouse'", eletrus.images, [
  "https://www.eletruscomp.com.br/_uploads/ProdutoDestaque/ProdutoDestaque_749_3205__orig.jpg",
  "https://www.eletruscomp.com.br/_uploads/produtoArquivo/749_0_0710_orig.jpg",
]);
conferir("link 'Catalogos' do menu do site nao e documento do produto", eletrus.documentos, []);
conferir(
  "ficha da aba, sem o formulario e o rodape que vem depois",
  eletrus.specifications,
  [
    { nome: "Modelo", valor: "OBT500-18GM60-E5" },
    { nome: "Alimentação", valor: "10 a 30 VCC" },
  ],
);
conferir("descricao da aba", eletrus.description, "Sensor difuso M18.");

const refEhNome = normalizarPagina({
  html: paginaEletrus("SENSOR FOTOELETRICO OBT500"),
  url: "https://www.eletruscomp.com.br/sensor-fotoeletrico-obt500/p",
  fonte: { name: "Eletrus", type: "CONCORRENTE" },
}).produtos[0];
conferir("Ref: que e so o nome cortado nao vira MPN", refEhNome.mpn, null);

// ---------------------------------------------------------------------------
console.log("\n— ficha com titulo em caixa normal e bullets sem par —");
const fichaCaixaNormal = [
  "Cantoneira em aluminio 28 x 35 p/ Perfil Estrutural 3030",
  "",
  "Especificações:",
  "- Material: Liga de Alumínio;",
  "- Formato: Canto (90°);",
  "- Indicado para perfil estrutural 3030;",
  "- Não possui acabamento superficial;",
  "- Altura: 35mm;",
  "- Largura: 28mm;",
  "- Comprimento: 35mm.",
  "",
  "Produto contém:",
  "- 1 x Cantoneira em aluminio",
].join("\n");

const cantoneira = normalizarPagina({
  html: `<script type="application/ld+json">
{"@type":"Product","name":"Cantoneira","sku":"1","offers":{"price":"4.10"},"description":${JSON.stringify(fichaCaixaNormal)}}
</script>`,
  url: "https://loja.com.br/p/cant",
}).produtos[0];

conferir(
  "titulo 'Especificações:' em caixa normal e reconhecido",
  cantoneira.specifications.length > 0,
  true,
);
conferir(
  "dois bullets sem dois-pontos no meio nao cortam a ficha",
  espec(cantoneira, "Altura"),
  "35mm",
);
conferir("largura chega ao fim", espec(cantoneira, "Largura"), "28mm");
conferir("comprimento tambem", espec(cantoneira, "Comprimento"), "35mm");
conferir("a ficha inteira, incluindo os bullets sem rotulo", cantoneira.specifications.length, 7);
conferir(
  "a secao seguinte nao entra",
  nomesEspec(cantoneira).includes("Produto contém"),
  false,
);

// ---------------------------------------------------------------------------
console.log("\n— categoria pelo dataLayer e estoque pelo texto —");
const comAnalytics = `<html><head><title>Driver</title></head><body>
<div itemtype="https://schema.org/Product" itemscope>
  <span itemprop="name">Driver TMC2209</span>
  <meta itemprop="sku" content="02030019" />
  <div itemprop="price" content="47.40" data-sell-price="49.90">R$ 47,40</div>
  <span class="estoque estoque-qtd-45 qtd-maior-10"> Estoque: <b class="qtde_estoque">45</b> unidades</span>
</div>
<script>
  var body = { item_id: '62162267', item_sku: '02030019', item_name: 'Driver TMC2209', item_category: 'Drivers de Motor de Passo' };
  var outro = { item_id: '999', item_sku: '99999999', item_name: 'Relacionado', item_category: 'Categoria Errada' };
</script></body></html>`;

const comDados = normalizarPagina({ html: comAnalytics, url: "https://loja.com.br/driver" })
  .produtos[0];

conferir("categoria vem do dataLayer", comDados.category, "Drivers de Motor de Passo");
conferir("origem da categoria", comDados.origens.category, "dataLayer de analytics");
conferir(
  "casa pelo sku: nao pega a categoria do relacionado",
  comDados.category !== "Categoria Errada",
  true,
);
conferir("quantidade lida do texto", comDados.stock.quantity, 45);
conferir("origem da quantidade", comDados.origens.quantidade, "texto da pagina");

// ---------------------------------------------------------------------------
console.log("\n— SEO —");
const comSeo = normalizarPagina({
  html: `<html><head>
<title>Display LCD 16x2 Azul 5V | Loja</title>
<meta name="description" content="Resumo para o buscador."/>
<meta name="keywords" content="display, lcd, arduino"/>
<link rel="canonical" href="/p/display"/>
</head><body><script type="application/ld+json">
{"@type":"Product","name":"Display","sku":"1","offers":{"price":"10"}}
</script></body></html>`,
  url: "https://loja.com.br/p/display?cor=azul",
}).produtos[0];

conferir("titulo de SEO", comSeo.seo.title, "Display LCD 16x2 Azul 5V | Loja");
conferir("descricao de SEO", comSeo.seo.description, "Resumo para o buscador.");
conferir("palavras-chave", comSeo.seo.keywords, "display, lcd, arduino");
conferir("canonica virou absoluta", comSeo.seo.canonical, "https://loja.com.br/p/display");
conferir(
  "SEO nao se confunde com o nome do produto",
  comSeo.name !== comSeo.seo.title,
  true,
);

// ---------------------------------------------------------------------------
console.log("\n— descricao: vence a mais completa, nao a primeira —");
const descricaoLonga = [
  "Descrição",
  "Aplicações",
  "",
  "O Display LCD 16x2 e uma pequena tela com fundo azul empregada em projetos.",
  "",
  "CARACTERÍSTICAS:",
  "- Datasheet LCD16x2: Download AQUI.",
  "",
  "ESPECIFICAÇÕES:",
  "",
  "- Tensão de trabalho: 4.5V ~ 5.5V;",
  "- Corrente de trabalho: 1.0mA ~ 1.5mA;",
  "- Peso: 30g.",
  "",
  "Este conteudo foi gerado por Inteligencia Artificial e pode conter erros.",
  "",
  "🔹 Diferenciais importantes",
  "",
  "Custo baixo: boa solucao quando se quer uma tela funcional sem gastar muito",
].join("\n");

const comDescricao = `<html><head>
<meta property="og:description" content="Resumo curto de SEO com 60 caracteres apenas."/>
<meta property="product:price:amount" content="19.43"/>
<title>Display</title></head><body>
<div itemtype="https://schema.org/Product" itemscope>
  <span itemprop="name">Display LCD 16x2</span>
  <meta itemprop="price" content="18.46" />
  <div itemprop="description">${descricaoLonga.replace(/\n/g, "<br>")}</div>
</div></body></html>`;

const comTexto = normalizarPagina({ html: comDescricao, url: "https://loja.com.br/p/d" })
  .produtos[0];

conferir(
  "descarta o resumo de SEO e fica com a completa",
  comTexto.description.length > 200,
  true,
);
conferir(
  "tira os rotulos das abas do inicio",
  comTexto.description.startsWith("O Display LCD 16x2"),
  true,
);
conferir("le a ficha tecnica da secao ESPECIFICACOES", nomesEspec(comTexto), [
  "Tensão de trabalho",
  "Corrente de trabalho",
  "Peso",
]);
conferir(
  "para no primeiro nao-par: marketing fica de fora",
  nomesEspec(comTexto).includes("Custo baixo"),
  false,
);
conferir(
  "nao pega par de antes da secao",
  nomesEspec(comTexto).includes("Datasheet LCD16x2"),
  false,
);

// A ficha tecnica real tem abreviacao no rotulo, item comprido e bullet sem
// dois-pontos no meio. Cada um desses ja interrompeu a leitura e levou junto
// tudo o que vinha depois — inclusive dimensoes e peso.
const fichaDificil = [
  "ESPECIFICAÇÕES:",
  "",
  "- Modelo: Relay1-485;",
  "- Carga máx.: 10A 220VAC / 10A 30VDC;",
  "- Isolamento óptico;",
  "- Tensão de operação: 3,3V (Pino 3.3) / 5 - 6V (USB ou pino 5V);",
  "- Dimensões (CxLxA): 83x26x17mm;",
  "- Peso: 25g.",
  "",
  "Este conteudo foi gerado por Inteligencia Artificial e pode conter erros e informacoes imprecisas.",
  "",
  "Custo baixo: boa solucao quando se quer uma placa funcional sem gastar muito",
].join("\n");

const difícil = normalizarPagina({
  html: `<script type="application/ld+json">
{"@type":"Product","name":"Rele","sku":"1","offers":{"price":"10"},"description":${JSON.stringify(fichaDificil)}}
</script>`,
  url: "https://loja.com.br/p/rele",
}).produtos[0];

conferir(
  "rotulo com abreviacao ('Carga max.') e aceito",
  espec(difícil, "Carga máx."),
  "10A 220VAC / 10A 30VDC",
);
conferir(
  "bullet sem dois-pontos no meio nao encerra a lista",
  espec(difícil, "Dimensões (CxLxA)"),
  "83x26x17mm",
);
conferir(
  "especificacao comprida nao e confundida com paragrafo",
  espec(difícil, "Tensão de operação"),
  "3,3V (Pino 3.3) / 5 - 6V (USB ou pino 5V)",
);
conferir("peso chega ao fim da lista", espec(difícil, "Peso"), "25g");
conferir("a ficha inteira foi lida, com e sem rotulo", difícil.specifications.length, 6);
conferir(
  "paragrafo encerra: marketing depois dele fica de fora",
  Object.keys(difícil.specifications).includes("Custo baixo"),
  false,
);

const semSecao = normalizarPagina({
  html: `<script type="application/ld+json">
{"@type":"Product","name":"X","sku":"1","description":"Cor: azul. Tamanho: grande.","offers":{"price":"10"}}
</script>`,
  url: "https://loja.com.br/p/y",
}).produtos[0];
conferir("sem secao de especificacoes, nao inventa ficha", semSecao.specifications, []);

// ---------------------------------------------------------------------------
console.log("\n— galeria de imagens —");
const galeria = `<html><head>
<meta property="og:image" content="https://loja.com.br/1019423-large_default/foto.jpg"/>
<meta property="product:price:amount" content="10.00"/>
<title>Produto</title></head><body>
<div itemtype="https://schema.org/Product" itemscope>
  <span itemprop="name">Produto</span>
  <meta itemprop="price" content="10.00" />
  <a itemprop="image" href="https://loja.com.br/1019423-thickbox_default/foto.jpg">1</a>
  <a itemprop="image" href="https://loja.com.br/1019424-thickbox_default/foto.jpg">2</a>
  <img itemprop="image" src="https://loja.com.br/1019425-thickbox_default/foto.jpg" />
</div></body></html>`;

const comGaleria = normalizarPagina({ html: galeria, url: "https://loja.com.br/p/x" }).produtos[0];
conferir("le href de <a itemprop=image>", comGaleria.images.includes("https://loja.com.br/1019424-thickbox_default/foto.jpg"), true);
conferir("le src de <img itemprop=image>", comGaleria.images.includes("https://loja.com.br/1019425-thickbox_default/foto.jpg"), true);
conferir("mesma foto em tamanhos diferentes conta uma vez", comGaleria.images.length, 3);

// A mesma foto servida pelo CDN em dois tamanhos: .../600x450/... e
// .../800x800/... eram contadas como duas imagens do produto.
const cdn = normalizarPagina({
  html: `<html><head>
<meta property="og:image" content="https://cdn.com/800x800/682/produto/62162267/foto.jpg"/>
</head><body><div itemtype="https://schema.org/Product" itemscope>
  <span itemprop="name">Produto</span><meta itemprop="sku" content="1" />
  <div itemprop="price" content="10.00">R$ 10,00</div>
  <img itemprop="image" src="https://cdn.com/600x450/682/produto/62162267/foto.jpg" />
</div></body></html>`,
  url: "https://loja.com.br/p",
}).produtos[0];
conferir("mesma foto do CDN em dois tamanhos conta uma vez", cdn.images.length, 1);
conferir("fica com a maior", cdn.images[0].includes("800x800"), true);
conferir("mantem a versao grande, que vem primeiro", comGaleria.images[0], "https://loja.com.br/1019423-large_default/foto.jpg");

// ---------------------------------------------------------------------------
console.log("\n— produtos relacionados nao contaminam o principal —");
const comRelacionados = `<html><head><title>Driver</title></head><body>
<div itemtype="https://schema.org/Product" itemscope>
  <h1 itemprop="name">Driver TMC2209</h1>
  <meta itemprop="sku" content="02030019" />
  <img itemprop="image" src="https://cdn.com/600x450/produto/driver.jpg" />
  <div itemprop="price" content="47.40" data-sell-price="49.90">R$ 47,40</div>
  <meta itemprop="availability" content="http://schema.org/InStock" />
</div>
<section>
  <div itemprop="isRelatedTo" itemtype="https://schema.org/Product" itemscope>
    <span itemprop="name">Outro Produto Barato</span>
    <meta itemprop="sku" content="99999999" />
    <img itemprop="image" src="https://cdn.com/600x450/produto/outro.jpg" />
    <div itemprop="price" content="20.00" data-sell-price="20.00">R$ 20,00</div>
  </div>
</section></body></html>`;

const principal = normalizarPagina({
  html: comRelacionados,
  url: "https://loja.com.br/driver",
}).produtos[0];

conferir("codigo e do produto principal", principal.code, "02030019");
conferir(
  "imagem do relacionado NAO entra",
  principal.images.some((i) => i.includes("outro.jpg")),
  false,
);
conferir("so a imagem do principal", principal.images.length, 1);
conferir(
  "preco do relacionado (20,00) nao vira o preco",
  principal.prices.promotional !== 20,
  true,
);
conferir("data-sell-price maior vira o preco normal", principal.prices.normal, 49.9);
conferir("o preco marcado vira o promocional", principal.prices.promotional, 47.4);

// data-price tambem aparece em frete e brinde: aceitar valor menor que o preco
// marcado transformava um frete de dois reais em "promocao" de um produto de
// dezenove.
const comFrete = `<html><body><div itemtype="https://schema.org/Product" itemscope>
  <span itemprop="name">Display LCD</span>
  <meta itemprop="sku" content="05622" />
  <div itemprop="price" content="18.46">R$ 18,46</div>
  <span data-price="0"></span><span data-price="2.09"></span><span data-price="4.85"></span>
</div></body></html>`;

const semFreteNoPreco = normalizarPagina({
  html: comFrete,
  url: "https://loja.com.br/display",
}).produtos[0];
conferir("frete em data-price nao vira preco", semFreteNoPreco.prices.normal, 18.46);
conferir("e nao vira promocional", semFreteNoPreco.prices.promotional, null);

// ---------------------------------------------------------------------------
console.log("\n— variacao com codigo proprio vira produto separado —");
const comVariacoes = `<script type="application/ld+json">
{"@type":"ProductGroup","name":"ESP32 NodeMCU","sku":"08240","offers":{"price":"59.90","availability":"https://schema.org/InStock"},
 "hasVariant":[
  {"@type":"Product","name":"ESP32 NodeMCU - USB-C","sku":"08240","offers":{"price":"59.90"}},
  {"@type":"Product","name":"ESP32 NodeMCU - Micro USB","sku":"08241","offers":{"price":"56.81","availability":"https://schema.org/InStock"}}]}
</script>`;

const grupo = normalizarPagina({ html: comVariacoes, url: "https://loja.com.br/p/esp32" });
conferir("virou DOIS produtos", grupo.produtos.length, 2);
conferir("produto 1 mantem o codigo do grupo", grupo.produtos[0].code, "08240");
conferir("produto 2 tem codigo proprio", grupo.produtos[1].code, "08241");
conferir("produto 2 tem nome proprio", grupo.produtos[1].name, "ESP32 NodeMCU - Micro USB");
conferir("produto 2 tem preco proprio", grupo.produtos[1].prices.normal, 56.81);
conferir(
  "variacao de MESMO codigo nao duplica",
  grupo.produtos.filter((p) => p.code === "08240").length,
  1,
);

// ---------------------------------------------------------------------------
console.log("\n— fora de estoque —");
const esgotado = `<script type="application/ld+json">
{"@type":"Product","name":"X","sku":"1","offers":{"price":"10","availability":"http://schema.org/OutOfStock"}}
</script>`;
const semEstoque = normalizarPagina({ html: esgotado, url: "https://loja.com.br/p/x" }).produtos[0];
conferir("status OUT_OF_STOCK", semEstoque.stock.status, "OUT_OF_STOCK");
conferir("quantidade zero quando esgotado", semEstoque.stock.quantity, 0);

// ---------------------------------------------------------------------------
console.log("\n— o que NAO e produto —");
conferir(
  "home com so <title>",
  extrairProduto("<html><head><title>Loja</title></head></html>").encontrado,
  false,
);
conferir(
  "pagina institucional",
  extrairProduto(
    '<html><head><title>Quem somos</title><meta property="og:type" content="website"></head></html>',
  ).encontrado,
  false,
);
conferir(
  "normalizar devolve motivo",
  normalizarPagina({ html: "<html><body>ola</body></html>", url: "https://x.com" }).motivo,
  "sem dados estruturados de produto",
);
conferir(
  "resumo avisa a falha",
  resumirExtracao({ encontrado: false }),
  "extracao falhou (sem dados estruturados)",
);

// ---------------------------------------------------------------------------
// A ficha da Tray: titulo sem dois-pontos, rotulo comprido em item marcado, e
// subtitulos que mudam de assunto sem dois-pontos nem linha em branco. Cada um
// ja devolveu ficha vazia ou ficha com "Downloads" dentro.
console.log("\n— ficha sem dois-pontos em lugar nenhum —");
const fichaTray = [
  "Sensor para medir distancia.",
  "Especificações",
  "- Tensão: 5V DC;",
  "- Diferença mínima entre a entrada e saída: 1. 5 V DC;",
  "- Peso: 50g.",
  "Downloads",
  "- Datasheet .",
  "Acompanha",
  "01 - Sensor.",
  "Garantia",
  "Garantia de 90 dias contra defeitos de fabricação.",
].join("\n");

const tray = normalizarPagina({
  html: `<script type="application/ld+json">
{"@type":"Product","name":"Sensor","sku":"1","offers":{"price":"54.90"},"description":${JSON.stringify(fichaTray)}}
</script>`,
  url: "https://loja.com.br/p/sensor",
}).produtos[0];

conferir(
  "titulo 'Especificações' SEM dois-pontos e reconhecido",
  tray.specifications.length > 0,
  true,
);
conferir(
  "rotulo de sete palavras em item marcado e par",
  espec(tray, "Diferença mínima entre a entrada e saída"),
  "1. 5 V DC",
);
conferir("a ficha para no subtitulo sem dois-pontos", nomesEspec(tray), [
  "Tensão",
  "Diferença mínima entre a entrada e saída",
  "Peso",
]);
conferir(
  "'Downloads' e 'Garantia' nao viram especificacao",
  tray.specifications.some((item) => /Downloads|Garantia|Acompanha/.test(item.valor ?? "")),
  false,
);

// ---------------------------------------------------------------------------
// Curto Circuito: a ficha vem sob "Principais Caracteristicas:", palavra que o
// vocabulario de secao nao conhecia, e a ficha inteira voltava vazia. O item
// "Consumo" vem quebrado no meio de um parentese, com o resto numa linha marcada.
console.log("\n— ficha sob 'Principais Caracteristicas:' —");
const fichaCurto = [
  "O modulo ESP-12E permite transmitir e receber informacoes pela Internet, tais como:",
  "- Estacao meteorologica;",
  "- Sistemas de monitoramento.",
  "",
  "Principais Características:",
  "- Padrões wireless: IEEE 802.11b, IEEE 802.11g, IEEE 802.11n;",
  "- Antena Embutida;",
  "- Tensão de alimentação: 1,8 - 3,3 VDC;",
  "- Consumo: 70 mA (Standby) e Máx 215 mA (802.11b, CCK",
  "- 1Mbps,Pout=+19.5dBm);",
  "- Peso: 3g;",
].join("\n");

const curto = normalizarPagina({
  html: `<script type="application/ld+json">
{"@type":"Product","name":"Modulo WiFi","sku":"WRL0006","offers":{"price":"16.65"},"description":${JSON.stringify(fichaCurto)}}
</script>`,
  url: "https://loja.com.br/p/esp12e",
}).produtos[0];

conferir("titulo 'Principais Características:' e reconhecido", curto.specifications.length, 5);
conferir("o par de dentro da ficha e lido", espec(curto, "Padrões wireless"), "IEEE 802.11b, IEEE 802.11g, IEEE 802.11n");
conferir(
  "item quebrado no parentese volta inteiro",
  espec(curto, "Consumo"),
  "70 mA (Standby) e Máx 215 mA (802.11b, CCK - 1Mbps,Pout=+19.5dBm)",
);
conferir("a lista de aplicacoes antes do titulo nao entra", nomesEspec(curto).includes("Estacao meteorologica"), false);

// "Caracteristicas" so vale quando nao ha "Especificacoes": a primeira linha achada
// venceria, e a ficha de verdade seria trocada pelo texto de venda.
const comAsDuas = normalizarPagina({
  html: `<script type="application/ld+json">
{"@type":"Product","name":"Sensor","sku":"2","offers":{"price":"9.90"},"description":${JSON.stringify(
    "Características:\n- Muito bom: recomendado;\n\nEspecificações:\n- Tensão: 5V;\n- Peso: 10g;",
  )}}
</script>`,
  url: "https://loja.com.br/p/duas",
}).produtos[0];
conferir("com as duas secoes, vale 'Especificacoes'", nomesEspec(comAsDuas), ["Tensão", "Peso"]);

// ---------------------------------------------------------------------------
// O datasheet do concorrente. Os dois casos reais nao se parecem: a Smartkits
// hospeda no Google Drive (fora do dominio, sem extensao) e a Usinainfo serve
// pelo anexo do PrestaShop (no proprio dominio, tambem sem extensao). Junto
// vem o que NAO e documento: rede social, WhatsApp e o blog da loja.
console.log("\n— documentos para download —");
const comLinks = `<html><body>
<div itemtype="https://schema.org/Product" itemscope>
  <span itemprop="name">Sensor</span>
  <meta itemprop="price" content="54.90" />
</div>
<div class="description">
<p>Sensor de distancia.</p>
<p>Veja tambem o <a href="/outro-produto">sensor infravermelho</a> da loja.</p>
<p>ACESSE O PROJETO NO BLOG: <a href="/blog/medindo-distancia/">Blog Loja - MEDINDO DISTANCIA</a></p>
<p>- <a href="https://drive.google.com/file/d/abc/view">Datasheet</a>.</p>
<p>- <a href="/arquivos/manual-do-sensor.pdf">Manual</a>.</p>
</div>
<ul id="idTab9"><li><a href="/index.php?controller=attachment&id_attachment=101">Datasheet DS18B20</a></li></ul>
<a href="https://www.instagram.com/loja/"><img src="/i.png"/></a>
<a href="https://api.whatsapp.com/send?phone=5585">Comprar no WhatsApp</a>
</body></html>`;

const doc = normalizarPagina({
  html: comLinks,
  url: "https://loja.com.br/p/sensor",
}).produtos[0];

conferir("so os documentos entram, e sem repetir", doc.documentos.length, 3);
conferir(
  "link fora do dominio e sem extensao entra pelo TEXTO",
  doc.documentos.find((d) => d.titulo === "Datasheet")?.url,
  "https://drive.google.com/file/d/abc/view",
);
conferir(
  "anexo do PrestaShop entra mesmo sem extensao no endereco",
  doc.documentos.find((d) => d.titulo === "Datasheet DS18B20")?.url,
  "https://loja.com.br/index.php?controller=attachment&id_attachment=101",
);
conferir(
  "arquivo no dominio da propria loja entra pela extensao",
  doc.documentos.find((d) => d.titulo === "Manual")?.url,
  "https://loja.com.br/arquivos/manual-do-sensor.pdf",
);
conferir(
  "rede social, WhatsApp, blog e outro produto NAO sao documento",
  doc.documentos.some((d) => /instagram|whatsapp|\/blog\/|outro-produto/i.test(d.url)),
  false,
);
conferir(
  "o endereco NAO polui a descricao",
  doc.description.includes("https://drive.google.com"),
  false,
);
conferir(
  "pagina sem documento devolve lista vazia, nunca null",
  normalizarPagina({
    html: `<script type="application/ld+json">
{"@type":"Product","name":"X","sku":"1","offers":{"price":"10"},"description":"Sem anexos."}
</script>`,
    url: "https://loja.com.br/p/x",
  }).produtos[0].documentos,
  [],
);

// ---------------------------------------------------------------------------
// Tray em promocao: o `price` do dataLayer e o RISCADO ("de R$ 6,05") e o
// `priceSell` e o que a loja cobra. O WJ Componentes saia 6,05 -> 5,58 quando a
// tela da loja mostra 5,75 e 5,58 no pix.
console.log("\n— Tray: preco riscado nao e o preco normal —");
const paginaTrayPromo = (price, priceSell) => `<html><body>
<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Sensor Joystick</span></div>
<script>var dataLayer = [{"idProduct":"101","reference":"WJ-48","priceSell":"${priceSell}","promotion":"YES","price":"${price}","priceSellDetails":[{"name":"","installment.months":"1","installment.amount":"5.58"}]}];</script>
<input type="hidden" id="preco_atual" value="${priceSell}" />
</body></html>`;

const joystick = normalizarPagina({
  html: paginaTrayPromo("6.05", "5.75"),
  url: "https://loja.com.br/sensor-joystick",
}).produtos[0];
conferir("o normal e o priceSell (5,75), nao o riscado (6,05)", joystick.prices.normal, 5.75);
conferir("o promocional continua sendo o pix (5,58)", joystick.prices.promotional, 5.58);
conferir(
  "a origem diz que o riscado foi descartado",
  /riscado/.test(joystick.origens.precoNormal),
  true,
);

const semPromocao = normalizarPagina({
  html: paginaTrayPromo("5.75", "5.75"),
  url: "https://loja.com.br/sensor-joystick",
}).produtos[0];
conferir("sem riscado (price = priceSell) o normal e o mesmo", semPromocao.prices.normal, 5.75);
conferir("e o pix segue como promocional", semPromocao.prices.promotional, 5.58);
conferir(
  "sem riscado a origem nao fala em riscado",
  /riscado/.test(semPromocao.origens.precoNormal),
  false,
);

// ---------------------------------------------------------------------------
// OpenCart (Solda Fria): tres defeitos na mesma pagina. O estoque vem como
// "Estoque Atual: 317" sem a palavra "unidades"; o JSON-LD traz a descricao
// cortada em ~250 caracteres e o texto inteiro esta na aba "Descrição"; e o
// JavaScript do frete monta uma tabela em string, que virava ficha tecnica.
console.log("\n— OpenCart: estoque, descricao em aba e tabela dentro de script —");
const paginaOpenCart = `<html><head><title>Alojamento</title></head><body>
<script type="application/ld+json">{"@type":"Product","name":"Alojamento KK 10 Vias","sku":"1874",
"description":"Alojamento para Conector\\n\\nIntrodução\\nGarantia de conexão segura. Este alojamento",
"offers":{"price":"0.30","availability":"http://schema.org/InStock"}}</script>
<ul><li class="product-stock in-stock"><b>Estoque Atual:</b> <span>317</span></li></ul>
<ul class="nav"><li><a
href="#tab-desc-x" data-toggle="tab">Descrição</a></li><li><a href="#tab-esp-x" data-toggle="tab">Especificações</a></li></ul>
<div class="tab-content"><div class="tab-pane active" id="tab-desc-x"><div class="block-content ">
<h2>Alojamento KK</h2><h3>Introdução</h3><p>Garantia de conexão segura. Este alojamento robusto e de alta qualidade.</p>
<h3>Conclusão/CTA Final</h3><p>Adquira agora mesmo.</p></div></div>
<div class="tab-pane" id="tab-esp-x"><table><thead><tr><td colspan="2"><strong>Características do produto</strong></td></tr></thead>
<tbody><tr><td>Unidade Venda</td><td>Peça</td></tr></tbody></table></div></div>
<script>var html = '<tr>'; html += '<th scope="col">Métodos de envio</th>'; html += '<th scope="col" width="74">Valor</th>'; html += '</tr>';</script>
</body></html>`;

const opencart = normalizarPagina({
  html: paginaOpenCart,
  url: "https://loja.com.br/alojamento-p-1874.html",
}).produtos[0];
conferir("estoque em 'Estoque Atual: <span>317</span>'", opencart.stock?.quantity, 317);
conferir(
  "a descricao vem da aba, inteira, e nao do JSON-LD cortado",
  opencart.description.includes("Conclusão/CTA Final"),
  true,
);
conferir(
  "tabela montada dentro de <script> NAO vira ficha tecnica",
  opencart.specifications.some((s) => /m[eé]todos de envio|^valor$/i.test(`${s.nome} ${s.valor}`)),
  false,
);
conferir(
  "e a tabela de verdade continua sendo lida",
  opencart.specifications.find((s) => s.nome === "Unidade Venda")?.valor,
  "Peça",
);
// O mesmo produto por varios enderecos (caminho de categoria): a identidade sai
// do registro da plataforma, e so onde ele declara.
console.log("\n— identidade do produto por endereco (OpenCart) —");
const { identidadeDoEndereco } = await import("../src/lib/coleta/plataformas.js");
const oc = { id: "opencart" };
const IDS = "https://www.soldafria.com.br";
conferir(
  "variantes -p-N.html de um produto dao a mesma chave (id)",
  new Set([
    `${IDS}/2-pilhas-pequenas-aa-15v-alkalinas-modelo-lr6-p-5875.html`,
    `${IDS}/componentes-eletronicos/2-pilhas-pequenas-aa-15v-alkalinas-modelo-lr6-p-5875.html`,
    `${IDS}/componentes-eletronicos/bateria-e-pilha/2-pilhas-pequenas-aa-15v-alkalinas-modelo-lr6-p-5875.html`,
  ].map((e) => identidadeDoEndereco(oc, e))).size,
  1,
);
conferir(
  "e a chave e o id",
  identidadeDoEndereco(oc, `${IDS}/x/y-p-5875.html`),
  "p:5875",
);
conferir(
  "slug puro: /x, /arduino/x e /arduino/acessorios-arduino/x sao o mesmo produto",
  new Set(
    ["/attiny85-pu-dip", "/arduino/attiny85-pu-dip", "/arduino/acessorios-arduino/attiny85-pu-dip"].map((c) =>
      identidadeDoEndereco(oc, `${IDS}${c}`),
    ),
  ).size,
  1,
);
conferir(
  "produtos diferentes NAO colidem",
  identidadeDoEndereco(oc, `${IDS}/arduino/uno-r3`) === identidadeDoEndereco(oc, `${IDS}/arduino/nano-v3`),
  false,
);
conferir(
  "paginacao de categoria e outra pagina: o ? entra na chave",
  identidadeDoEndereco(oc, `${IDS}/arduino?page=2`) === identidadeDoEndereco(oc, `${IDS}/arduino`),
  false,
);
conferir("a home nao tem identidade", identidadeDoEndereco(oc, `${IDS}/`), null);
conferir(
  "plataforma que nao declara NAO ganha identidade (o ultimo segmento pode repetir de verdade)",
  identidadeDoEndereco({ id: "tray" }, `${IDS}/arduino/uno-r3`),
  null,
);
conferir("plataforma desconhecida tambem nao", identidadeDoEndereco({ id: "desconhecida" }, `${IDS}/uno-r3`), null);
conferir("endereco invalido nao quebra", identidadeDoEndereco(oc, "nao e url"), null);

// "Características" sozinho: ficha na Solda Fria, lista de marketing noutras.
const listaSobTitulo = (titulo, itens) =>
  normalizarPagina({
    html: `<script type="application/ld+json">{"@type":"Product","name":"X","sku":"1","description":"Curta","offers":{"price":"1"}}</script>
<h3>${titulo}</h3><ul>${itens.map((i) => `<li>${i}</li>`).join("")}</ul>`,
    url: "https://loja.com.br/x",
  }).produtos[0].specifications;

const fichaCurta = listaSobTitulo("Características", [
  "<strong>Tipo de Conector:</strong> KK 11 Vias",
  "<strong>Compatibilidade:</strong> Molex 5051-11",
]);
conferir(
  "'Características' com itens 'Nome: valor' vira ficha",
  fichaCurta.map((s) => `${s.nome}=${s.valor}`),
  ["Tipo de Conector=KK 11 Vias", "Compatibilidade=Molex 5051-11"],
);
conferir(
  "'Características' com lista de marketing NAO vira ficha",
  listaSobTitulo("Características", ["Alta durabilidade", "Fácil de instalar"]),
  [],
);
conferir(
  "uma linha sem rotulo entre os pares tambem recusa a lista",
  listaSobTitulo("Características", ["<strong>Tipo:</strong> KK", "Alta durabilidade"]),
  [],
);
conferir(
  "sob 'Características Técnicas' o item sem rotulo continua entrando",
  listaSobTitulo("Características Técnicas", ["<strong>Tipo:</strong> KK", "Acompanha trava"]).length,
  2,
);
conferir(
  "link '#descricao' sem data-toggle e ancora, nao aba",
  normalizarPagina({
    html: `<script type="application/ld+json">{"@type":"Product","name":"X","sku":"1","description":"Curta","offers":{"price":"1"}}</script>
<a href="#tab-d">Descrição</a><div id="tab-d"><p>Texto que nao deve entrar porque o link nao e uma aba.</p></div>`,
    url: "https://loja.com.br/x",
  }).produtos[0].description,
  "Curta",
);

// ---------------------------------------------------------------------------
// O preco a vista da Tray vem de um endereco proprio, e perguntar item a item
// DOBRAVA a colheita (uma visita a cada 2s por dominio). Como o desconto e da
// loja, a regra e aprendida no primeiro produto e o resto sai de conta — este
// e o caminho derivado, que nao faz requisicao nenhuma e por isso cabe aqui.
console.log("\n— preco a vista derivado da regra da loja —");
const { lerAVista } = await import("../src/lib/coleta/pagamento.js");

const paginaTray = (preco) =>
  `<img src="//images.tcdn.com.br/img/img_prod/751846/foto.jpg">
   <script>var dataLayer = [{"idProduct":"1079","reference":"SK1244"}];</script>
   <input type="hidden" id="preco_atual" value="${preco}" />`;

const endereco = { url: "https://loja.com.br/mvc/store/product/payment_options" };

const truncando = { regra: { percentual: 5, modo: "truncar" } };
const arredondando = { regra: { percentual: 5, modo: "arredondar" } };

const derivado = await lerAVista(endereco, paginaTray("54.9"), truncando);
conferir("aplica o desconto da loja sem nova requisicao", derivado?.aVista, 52.15);
conferir("e diz que foi derivado, nao lido", derivado?.derivado, true);
conferir("sem endereco de origem, porque nao houve visita", derivado?.url, null);

// A Smartkits trunca e a Casa da Robotica arredonda. Supor uma das duas erra a
// outra em um centavo — e foi exatamente o que aconteceu com 4,89.
conferir(
  "loja que TRUNCA: 8,90 -5% = 8,455 vira 8,45",
  (await lerAVista(endereco, paginaTray("8.90"), truncando))?.aVista,
  8.45,
);
conferir(
  "loja que ARREDONDA: 4,89 -5% = 4,6455 vira 4,65",
  (await lerAVista(endereco, paginaTray("4.89"), arredondando))?.aVista,
  4.65,
);
conferir(
  "a mesma loja truncando daria 4,64 — um centavo de diferenca",
  (await lerAVista(endereco, paginaTray("4.89"), truncando))?.aVista,
  4.64,
);
conferir(
  "loja sem desconto a vista nao inventa promocional",
  await lerAVista(endereco, paginaTray("54.9"), { regra: { percentual: 0 } }),
  null,
);

// A regra so pode ser adotada quando a amostra SEPARA os dois modos. 12,99 -5%
// da 12,3405: truncar e arredondar dao 12,34, entao esse produto nao prova
// nada — e foi confiando nele que a Casa da Robotica errou o produto seguinte.
const { aprenderParaTeste } = await import("../src/lib/coleta/pagamento.js");
conferir(
  "amostra que nao separa os modos NAO vira regra",
  aprenderParaTeste([{ precoTabela: 12.99, aVista: 12.34, percentual: 5 }]).regra ?? null,
  null,
);
conferir(
  "amostra que separa vira regra: 4,89 -> 4,65 e arredondamento",
  aprenderParaTeste([{ precoTabela: 4.89, aVista: 4.65, percentual: 5 }]).regra,
  { percentual: 5, modo: "arredondar", conferidoEm: 1 },
);
conferir(
  "as duas juntas continuam dizendo arredondar",
  aprenderParaTeste([
    { precoTabela: 12.99, aVista: 12.34, percentual: 5 },
    { precoTabela: 4.89, aVista: 4.65, percentual: 5 },
  ]).regra,
  // Duas leituras: e o caso real da Casa da Robotica, onde a primeira nao
  // separava os modos. `conferidoEm` acompanha isso na origem do preco.
  { percentual: 5, modo: "arredondar", conferidoEm: 2 },
);
conferir(
  "amostra que separa para o outro lado diz truncar",
  aprenderParaTeste([{ precoTabela: 8.9, aVista: 8.45, percentual: 5 }]).regra,
  { percentual: 5, modo: "truncar", conferidoEm: 1 },
);
conferir(
  "modo nenhum explicando as amostras vira semRegra",
  aprenderParaTeste([{ precoTabela: 10, aVista: 7, percentual: 5 }]).semRegra,
  true,
);
conferir(
  "percentual que muda entre produtos vira semRegra",
  aprenderParaTeste([
    { precoTabela: 8.9, aVista: 8.45, percentual: 5 },
    { precoTabela: 10, aVista: 9, percentual: 10 },
  ]).semRegra,
  true,
);

// ---------------------------------------------------------------------------
// A conciliacao decide o que acontece com produto que sumiu da lista do
// fornecedor. Errar aqui nao quebra a tela: zera saldo de item que existe, em
// silencio. Por isso e testado com lista de mentira, e nao so em arquivo real.
console.log("\n— conciliacao da lista do fornecedor —");

const item = (code, extras = {}) => ({
  code,
  name: `Produto ${code}`,
  url: `https://f/${code}`,
  prices: { normal: 10 },
  stock: { quantity: 5, aChegar: 2, status: "IN_STOCK" },
  ...extras,
});

const conciliacao = conciliar({
  anteriores: [item("A1"), item("A2"), item("A3")],
  novos: [item("A1", { prices: { normal: 12 } }), item("NOVO")],
  dataDaLista: "2026-09-01T00:00:00.000Z",
});

const achar = (code) => conciliacao.produtos.find((p) => p.code === code);

conferir("quem sumiu continua na lista", conciliacao.produtos.length, 4);
conferir("preco novo vence o antigo", achar("A1").prices.normal, 12);
conferir("resumo separa os tres destinos", conciliacao.resumo, {
  novos: 1,
  atualizados: 1,
  ausentes: 2,
});

// O ponto da regra: ausente vai a NULL, nunca a zero. Zero seria o fornecedor
// afirmando "esgotou", e ele nao afirmou nada — so nao mandou a linha.
conferir("saldo do ausente vira null, nao zero", achar("A2").stock.quantity, null);
conferir("a chegar do ausente tambem", achar("A2").stock.aChegar, null);
conferir("ausente guarda desde quando", achar("A2").ausente.desde, "2026-09-01T00:00:00.000Z");
conferir("a origem explica o null", achar("A2").origens.quantidade.includes("nao declarou zero"), true);
conferir("quem veio na lista nao ganha marca de ausente", achar("A1").ausente, undefined);

// Produto sem codigo nao tem chave: nao da para dizer se e o mesmo item da
// lista passada, entao fica fora das contas em vez de virar "novo" toda semana.
conferir(
  "produto sem codigo nao entra na conta",
  conciliar({ anteriores: [], novos: [item("N/A"), item(null)] }).resumo.novos,
  0,
);

// ---------------------------------------------------------------------------
// A trava que recusa a lista inteira. Foi ela que impediu um upload parcial da
// Fortek de zerar 73% de 1911 produtos.
console.log("\n— trava de queda suspeita —");

const queda = (antes, agora, origem = "arquivo") =>
  quedaSuspeita({
    anteriores: Array.from({ length: antes }, (_, i) => item(`A${i}`)),
    novos: Array.from({ length: agora }, (_, i) => item(`A${i}`)),
    origemAnterior: origem,
  });

conferir("lista pela metade ainda passa", queda(1000, 500), null);
conferir("abaixo da metade e recusada", queda(1911, 512)?.percentual, 73);
conferir("a trava diz quantos sumiram", queda(1000, 100)?.sumiram, 900);
// So arquivo contra arquivo: a colheita do site traz 20 produtos e o arquivo
// traz 1900, entao comparar os dois acusaria queda em toda troca de caminho.
conferir("coleta do site nao dispara a trava", queda(1911, 20, "site"), null);
conferir("primeira lista nao dispara a trava", queda(0, 0), null);

// ---------------------------------------------------------------------------
// Magento 2, medido na Saravati: o JSON-LD nao vem solto, vem dentro de um
// ItemPage; a pagina anuncia TRES precos; e a quantidade so existe no texto.
console.log("\n— Magento: produto dentro de ItemPage, tres precos, saldo no texto —");

const magento = `<html><head>
<meta property="product:price:amount" content="1499.9"/>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"ItemPage",
 "publisher":{"@type":"Organization","name":"Saravati"},
 "mainEntity":{"@type":"Product","name":"Placa Raspberry Pi 4 Model B 4GB RAM",
  "sku":"srvt001158","image":"https://loja.com.br/media/catalog/product/4/9/49b3.jpg",
  "offers":{"@type":"Offer","url":"https://loja.com.br/placa.html","price":"1349.91",
   "priceCurrency":"BRL","availability":"http://schema.org/InStock"}}}
</script></head><body>
<div class="price-box">
  <span data-price-amount="1499.9" data-price-type="finalPrice"><span class="price">R$1.499,90</span></span>
  <span data-price-amount="1599.9" data-price-type="oldPrice"><span class="price">R$1.599,90</span></span>
</div>
<div class="product-info-stock-sku">
  <div class="stock available"><span>Em estoque</span></div>
  <div class="availability only" title="2&#x20;itens"><strong>2</strong> itens</div>
  <div class="product attribute sku"><strong class="type">CÓDIGO</strong><div class="value">srvt001158</div></div>
</div>
<img class="gallery-placeholder__image" src="https://loja.com.br/media/catalog/product/cache/ff61517d26ace703648229d56c081b52/4/9/49b3.jpg"/>
<script type="text/x-magento-init">
{"[data-gallery-role=gallery-placeholder]": {"mage/gallery/gallery": {"data": [
 {"thumb":"https:\\/\\/loja.com.br\\/media\\/catalog\\/product\\/cache\\/ddbc\\/4\\/9\\/49b3.jpg","img":"https:\\/\\/loja.com.br\\/media\\/catalog\\/product\\/cache\\/ff61517d26ace703648229d56c081b52\\/4\\/9\\/49b3.jpg","full":"https:\\/\\/loja.com.br\\/media\\/catalog\\/product\\/cache\\/8ba61e6f43935f01927e65d3d5c2ff7a\\/4\\/9\\/49b3.jpg","isMain":true},
 {"thumb":"https:\\/\\/loja.com.br\\/media\\/catalog\\/product\\/cache\\/ddbc\\/e\\/1\\/e190.jpg","full":"https:\\/\\/loja.com.br\\/media\\/catalog\\/product\\/cache\\/8ba61e6f43935f01927e65d3d5c2ff7a\\/e\\/1\\/e190.jpg"},
 {"thumb":"https:\\/\\/loja.com.br\\/media\\/catalog\\/product\\/cache\\/ddbc\\/b\\/d\\/bd62.jpg","full":"https:\\/\\/loja.com.br\\/media\\/catalog\\/product\\/cache\\/8ba61e6f43935f01927e65d3d5c2ff7a\\/b\\/d\\/bd62.jpg"}
]}}}
</script></body></html>`;

const placa = normalizarPagina({
  html: magento,
  // O endereco tem "4gb-ram" no fim: era dali que o codigo saia quando o
  // JSON-LD passava despercebido.
  url: "https://loja.com.br/placa-raspberry-pi-4-model-b-4gb-ram.html",
}).produtos[0];

conferir("produto achado dentro de mainEntity", placa.name, "Placa Raspberry Pi 4 Model B 4GB RAM");
conferir("codigo lido do JSON-LD, nao deduzido do endereco", placa.code, "srvt001158");
conferir("preco integral e o que se paga no cartao", placa.prices.normal, 1499.9);
conferir("preco promocional e o do pix", placa.prices.promotional, 1349.91);
conferir("o preco riscado NAO vira preco normal", placa.prices.normal !== 1599.9, true);
conferir("quantidade lida do bloco de saldo", placa.stock.quantity, 2);
// A galeria do Magento so existe no JSON de inicializacao: das tres fotos, so a
// principal aparece como <img> na pagina.
conferir("as tres fotos da galeria entram", placa.images.length, 3);
conferir(
  "a principal fica em primeiro, na maior versao",
  placa.images[0],
  "https://loja.com.br/media/catalog/product/cache/8ba61e6f43935f01927e65d3d5c2ff7a/4/9/49b3.jpg",
);
// og:image, JSON-LD e galeria trazem a MESMA foto principal com hashes de cache
// diferentes. Sem tirar o hash da identidade, ela contava tres vezes.
conferir(
  "a mesma foto em caches diferentes conta uma vez",
  placa.images.filter((foto) => foto.includes("49b3.jpg")).length,
  1,
);

// ---------------------------------------------------------------------------
// Identificacao da plataforma: o CDN que SERVE a pagina vale 5; o que so
// aparece dentro de um link vale 2, como qualquer marca solta no HTML.
console.log("\n— plataforma: CDN que serve x CDN citado num link —");

const { identificarPlataforma } = await import("../src/lib/coleta/plataformas.js");

const magentoComLinkDeTerceiro = `<html><head>
<script src="https://loja.com.br/static/version1757/frontend/tema/pt_BR/requirejs/require.js"></script>
</head><body>
<script>require(["Magento_Catalog/js/product-view"], function () {});</script>
<p>Datasheet: <a href="https://cdn.awsli.com.br/945/945993/arquivos/RB4B.pdf">RB4B.pdf</a></p>
</body></html>`;

const daSaravati = identificarPlataforma({ html: magentoComLinkDeTerceiro });
conferir("CDN de terceiro num link nao rouba a plataforma", daSaravati.id, "magento2");
// Dois pontos ficam abaixo do piso das alternativas (3): o CDN de terceiro nem
// chega a ser oferecido como "pode ser esta outra plataforma".
conferir("o link nao sustenta nem uma alternativa", daSaravati.alternativas, []);

const lojaIntegrada = `<html><body>
<img src="https://cdn.awsli.com.br/300x300/945/945993/produto/12345/foto.jpg">
</body></html>`;
conferir(
  "CDN servindo a pagina continua identificando a loja",
  identificarPlataforma({ html: lojaIntegrada }).id,
  "loja-integrada",
);

// ---------------------------------------------------------------------------
console.log("\n— campos essenciais —");
conferir(
  "sem preco nao e valido",
  ehProdutoValido({ name: "X", url: "https://x", prices: { normal: null } }),
  false,
);
conferir(
  "sem nome nao e valido",
  ehProdutoValido({ name: null, url: "https://x", prices: { normal: 10 } }),
  false,
);
conferir(
  "sem url nao e valido",
  ehProdutoValido({ name: "X", url: null, prices: { normal: 10 } }),
  false,
);

// ---------------------------------------------------------------------------
console.log("\n— peso, dimensoes e NCM das especificacoes (cadastro de produto) —");

const { pesoEmKg, medidasDaEspecificacao, ncmFormatado } = await import("../src/lib/medidas.js");

conferir("peso em gramas com virgula", pesoEmKg("12,3g"), 0.012);
conferir("peso ja em kg", pesoEmKg("0,049 kg"), 0.049);
conferir("peso abaixo de 1 g nao vira zero no campo", pesoEmKg("0,1g"), null);
conferir("uma medida por campo, mm vira cm", medidasDaEspecificacao("Altura", "32mm"), { altura: 3.2 });
conferir("aproximado (~) e lido", medidasDaEspecificacao("Comprimento", "~28cm"), { comprimento: 28 });
conferir("comprimento do cabo NAO e do produto", medidasDaEspecificacao("Comprimento do cabo", "1m"), null);
conferir(
  "ordem no rotulo (CxLxA), unidade so no fim",
  medidasDaEspecificacao("Dimensões (CxLxA)", "54 x 30,5 x 17mm"),
  { comprimento: 5.4, largura: 3.05, altura: 1.7 },
);
conferir(
  "ordem no rotulo invertida (AxLxC)",
  medidasDaEspecificacao("Dimensões (AxLxC)", "13 x 30 x 46 mm"),
  { altura: 1.3, largura: 3, comprimento: 4.6 },
);
conferir(
  "ordem no valor, palavra entre parenteses; profundidade vale como comprimento",
  medidasDaEspecificacao("Dimensões", "35mm (Altura) x 50mm (Largura) x 15mm (profundidade)"),
  { altura: 3.5, largura: 5, comprimento: 1.5 },
);
conferir(
  "sem ordem declarada: C x L x A presumida, e marcada",
  medidasDaEspecificacao("Dimensões", "31 x 15 x 18mm"),
  { comprimento: 3.1, largura: 1.5, altura: 1.8, presumida: true },
);
conferir("medida da embalagem fica de fora", medidasDaEspecificacao("Dimensões da embalagem", "10 x 10 x 5 cm"), null);
conferir("texto sem numero fica de fora", medidasDaEspecificacao("Tamanho", "Diversos"), null);
conferir("NCM so digitos ganha pontos", ncmFormatado("85423190"), "8542.31.90");
conferir("NCM incompleto e descartado", ncmFormatado("8542"), null);

const { linhaDeDimensoes, linhaDePeso, medidasDaDescricao } = await import("../src/lib/medidas.js");
conferir(
  "linha de dimensoes no padrao da descricao",
  linhaDeDimensoes({ comprimentoCm: 6.8, larguraCm: 5.3, alturaCm: 1 }),
  "Dimensões(CxLxA): 68x53x10mm",
);
conferir(
  "medida faltando sai da letra do rotulo",
  linhaDeDimensoes({ comprimentoCm: 3.05, alturaCm: 1.7 }),
  "Dimensões(CxA): 30,5x17mm",
);
conferir("peso abaixo de 1 kg em gramas", linhaDePeso(0.055), "Peso: 55g");
conferir("peso acima de 1 kg nao perde casa", linhaDePeso(1.25), "Peso: 1,25kg");
conferir(
  "a descricao gerada e lida de volta para os campos",
  medidasDaDescricao(
    "PLACA\n\nTexto.\n\nEspecificações técnicas:\n- Microcontrolador: ATmega328;\n" +
      "- Dimensões(CxLxA): 68x53x10mm;\n- Peso: 55g;\n\nItens inclusos: (Cod:1)\n- 01 PLACA;",
  ),
  { pesoKg: 0.055, alturaCm: 1, larguraCm: 5.3, comprimentoCm: 6.8 },
);
conferir("texto sem as linhas nao inventa medida", medidasDaDescricao("Uma placa.\n- Tensão: 5V;"), {});

// Usinainfo 10179: medida so no TEXTO da descricao, ficha sem nenhuma.
const { medidasDoProdutoColetado } = await import("../src/lib/medidas.js");
const usinainfo = medidasDoProdutoColetado({
  especificacoes: [{ nome: "Tensão", valor: "5V" }],
  descricao: "Especificações:\n- Dimensões (CxLxE): ~54x29x5mm; (ignorando-se os pinos);\n- Peso: 11g.",
});
conferir("peso lido do texto da descricao", usinainfo.peso[0]?.valor, 0.011);
conferir(
  "dimensoes lidas do texto da descricao",
  [usinainfo.comprimento[0]?.valor, usinainfo.largura[0]?.valor, usinainfo.altura[0]?.valor],
  [5.4, 2.9, 0.5],
);
conferir(
  "ficha vem antes da descricao",
  medidasDoProdutoColetado({ especificacoes: [{ nome: "Peso", valor: "6g" }], descricao: "- Peso: 9g;" }).peso.map((p) => p.valor),
  [0.006, 0.009],
);

// ---------------------------------------------------------------------------
console.log("\n— portal com login (Santana, Add Suite) —");
{
  const { ehDoPortal, parametrosDaCategoria, produtosDaVitrine, precoDaPaginaDoProduto } = await import("../src/lib/coleta/portal-addsuite.js");

  // Indisponivel (23/10/2026): a lista vem sem preco; a PAGINA traz o quadro "Detalhes do preco" (medido no 010-0461).
  const paginaIndisponivel =
    '<div class="divPreco"> <h1 id="valor"> R$ 47,25 </h1> <div class="tooltiptext"> <span>PREÇO UNITÁRIO</span> <p id="pPrecoUnitario"> R$ 47,25 </p> ' +
    '<span>IPI</span> <p id="pIPI"> R$ 3,07 <span> (Por unid.)</span> </p> <span>ST</span> <p id="pST"> R$ 0,00 </p> ' +
    '<span>PREÇO UNIT. COM IMP.</span> <p id="pPrecoUnitarioComImposto"> R$ 50,32 </p> </div> </div>';
  conferir("santana pagina: preco unitario sem IPI, IPI e ST em reais e o com impostos do portal", precoDaPaginaDoProduto(paginaIndisponivel), { normal: 47.25, ipi: 3.07, st: 0, comImpostos: 50.32 });
  conferir(
    "santana pagina: sem o com-impostos, soma preco + IPI + ST; so o h1 do valor tambem serve; zero e sem preco",
    [
      precoDaPaginaDoProduto('<p id="pPrecoUnitario"> R$ 6,16 </p><p id="pIPI"> R$ 0,40 </p>')?.comImpostos,
      precoDaPaginaDoProduto('<h1 id="valor"> R$ 1.234,50 </h1>')?.normal,
      precoDaPaginaDoProduto('<h1 id="valor"> R$ 0,00 </h1>'),
    ],
    [6.56, 1234.5, null],
  );

  // O cookie de sessao vai em TODO pedido da sessao: so se segue redirecionamento para o proprio portal.
  const portal = "https://santanaimport.com.br";
  conferir("redirecionamento: o proprio portal", ehDoPortal("https://santanaimport.com.br/PainelCliente", portal), true);
  conferir("redirecionamento: URL ja interpretada", ehDoPortal(new URL("/minhaconta", portal), portal), true);
  conferir("redirecionamento: com ou sem www segue (o portal pode redirecionar entre os dois)", [ehDoPortal("https://www.santanaimport.com.br/x", portal), ehDoPortal("https://santanaimport.com.br/x", "https://www.santanaimport.com.br")], [true, true]);
  conferir("redirecionamento: outro site NAO segue", ehDoPortal("https://atacante.com/x", portal), false);
  conferir("redirecionamento: host que so comeca igual NAO segue", ehDoPortal("https://santanaimport.com.br.atacante.com/x", portal), false);
  conferir("redirecionamento: usuario@ NAO segue", ehDoPortal("https://santanaimport.com.br@atacante.com/x", portal), false);
  conferir("redirecionamento: para http (o cookie iria em claro) NAO segue", ehDoPortal("http://santanaimport.com.br/x", portal), false);
  conferir("redirecionamento: outra porta NAO segue", ehDoPortal("https://santanaimport.com.br:8443/x", portal), false);

  conferir(
    "categoria de um nivel",
    parametrosDaCategoria("https://santanaimport.com.br/componentes.html?p=1"),
    {
      origem: "https://santanaimport.com.br",
      url: "https://santanaimport.com.br/componentes.html",
      caminho: "componentes",
      categoria: "componentes",
      subcategoria: "",
    },
  );
  const doisNiveis = parametrosDaCategoria("santanaimport.com.br/componentes/roboticos.html");
  conferir(
    "subcategoria: o penultimo trecho e a categoria",
    [doisNiveis.categoria, doisNiveis.subcategoria],
    ["componentes", "roboticos"],
  );
  const tresNiveis = parametrosDaCategoria(
    "https://santanaimport.com.br/antenas/amplificadores-de-sinal/satelite-finder.html",
  );
  conferir(
    "tres niveis: so os dois ultimos trechos contam",
    [tresNiveis.categoria, tresNiveis.subcategoria],
    ["amplificadores-de-sinal", "satelite-finder"],
  );
  conferir(
    "link de produto (.htm) nao e categoria",
    parametrosDaCategoria("https://santanaimport.com.br/x-010-0340.htm?sku=010-0340"),
    null,
  );

  // Trecho real da vitrine (17/09/2026), com a foto em base64 encurtada.
  const vitrine = [
    '<li {##CLASSADDCARRINHO##}> <div class="produto"> <div class="imagem duasimagens">',
    ' <a href="https://santanaimport.com.br/motor-30v-10mm-sem-clamp-075-3010.htm?sku=075-3010">',
    ' <img src="https://santanaimport.com.br/imagens/produtos/media/sem_img.jpg" style="background:url(data:image/png;base64,iVBORw0KGgoAAAA=)"> </a> </div>',
    ' <div class="titulo"> <a href="https://santanaimport.com.br/motor-30v-10mm-sem-clamp-075-3010.htm?sku=075-3010" title="Motor">Motor 3,0v 10mm Sem Clamp 075-3010</a>',
    ' <div class="referencia">Ref: 075-3010</div> </div>',
    ' <div class="preco"> <div class="preco-row"> <span class="valor">R$ 6,16</span> </div>',
    ' <div class="tooltip"> <svg><path d="M0"/></svg> <div class="tooltiptext"> <h4>DETALHES DO PREÇO</h4>',
    ' <div class="tooltip-row"> <span>PREÇO UNITÁRIO</span> <p>R$ 6,16</p> </div>',
    ' <div class="tooltip-row"> <span >IPI &nbsp; <font color="#3D3D3D"><strong>7%</strong></font ></span > <p>R$ 0,40&nbsp;(Por unid.)</p> </div>',
    ' <div class="tooltip-row"> <span>ST</span> <p>R$ 0,00&nbsp;(Por unid.)</p> </div>',
    ' <div class="tooltip-row"> <span>PREÇO UNIT. COM IMP.</span> <p>R$ 6,56</p> </div>',
    ' <div class="tooltip-col"> <div class="tooltip-row"> <span>CX. INNER</span> <p>0 Un.</p> </div>',
    ' <div class="tooltip-row"> <span>CX. MASTER</span> <p>100 Un.</p> </div> </div> </div> </div>',
    " <div class='tooltip'> <div class='tooltiptext'> <h4> PREÇOS ESPECIAIS </h4>",
    " <div class='tooltip-row'><span>10 - 19 Unidades </span> <p>R$ 5,85 / Un. <span class='valorPorcentagemDesconto'> 5,03 % Desc. </span></p> </div>",
    " <div class='tooltip-row'><span> >20 Unidades </span> <p>R$ 5,56 / Un. </p> </div></div></div> </div>",
    ' <div class="botao"> <input type="button" value="+" id="lkbMais_075-3010" onclick="adicionarMaisVitrini(\'075-3010\', 5);" />',
    ' <input type="text" value="5" data-sku="075-3010">',
    ' <input type="button" value="Adicionar ao carrinho" id="bt_comprar_075-3010" /> </div> </div> </li>',
    '<li {##CLASSADDCARRINHO##}> <div class="produto"> <div class="titulo">',
    ' <a href="https://santanaimport.com.br/protoboard-1660-furos-010-0461.htm?sku=010-0461" title="Protoboard">Protoboard 1660 Furos 010-0461</a>',
    ' <div class="referencia">Ref: 010-0461</div> </div>',
    ' <div class="preco"> <div class="preco-row"> <span class="valor">R$ 0,00</span> </div> </div> </div> </li>',
  ].join("");

  const [motor, protoboard] = produtosDaVitrine(vitrine, {
    categoria: "componentes",
    fonte: { name: "Santana", type: "FORNECEDOR" },
  });
  conferir("codigo pelo data-sku", motor.code, "075-3010");
  conferir("link com ?sku=", motor.url, "https://santanaimport.com.br/motor-30v-10mm-sem-clamp-075-3010.htm?sku=075-3010");
  conferir("preco e preco com impostos do portal", [motor.prices.normal, motor.prices.comImpostos], [6.16, 6.56]);
  conferir("IPI vira imposto; ST zero fica de fora", motor.taxes, [{ nome: "IPI", percentual: 7 }]);
  conferir("com botao de comprar: em estoque", motor.stock.status, "IN_STOCK");
  conferir("foto sem_img nao entra", motor.images, []);
  // Faixa e multiplo sao regra de compra, NAO caracteristica (o dono, 17/09/2026).
  conferir("so a caixa master fica nas caracteristicas", motor.specifications, [
    { nome: "Caixa master", valor: "100 un." },
  ]);
  conferir("multiplo de venda em campo proprio", motor.multiploVenda, 5);
  conferir("compra em lote em campo proprio, com os limites em numero", motor.precosPorQuantidade, [
    { rotulo: "10 - 19 Unidades", minimo: 10, maximo: 19, preco: 5.85 },
    { rotulo: ">20 Unidades", minimo: 20, maximo: null, preco: 5.56 },
  ]);
  conferir("sem data-sku: codigo pelo Ref", protoboard.code, "010-0461");
  conferir("R$ 0,00 e sem preco, nao gratis", [protoboard.prices.normal, protoboard.prices.comImpostos], [null, null]);
  conferir("sem botao de comprar: esgotado", protoboard.stock.status, "OUT_OF_STOCK");
}

// Tres lojas descrevem a mesma placa com medidas diferentes: nenhuma delas
// pode virar uma unica linha automaticamente na descricao da Rise.
{
  const { identificarDivergencias } = await import("../src/lib/ia/divergencias.js");
  const referencias = [
    { id: "p", nome: "Arduino UNO", fonte: { nome: "Piscaled" }, especificacoes: [{ nome: "Dimensoes Aproximadas", valor: "45 mm x 19 mm" }] },
    { id: "u", nome: "Arduino UNO", fonte: { nome: "Usinainfo" }, especificacoes: [{ nome: "Dimensões (CxLxE)", valor: "68x53x10mm" }] },
    { id: "s", nome: "Arduino UNO", fonte: { nome: "Saravati" }, especificacoes: [{ nome: "Tamanho", valor: "68mm Largura x 53mm Profundidade x 12mm Altura" }] },
  ];
  const dimensoes = identificarDivergencias(referencias).find((item) => item.id === "dimensoes");
  conferir("tres dimensoes divergentes ficam separadas para escolha", dimensoes.opcoes.map((item) => item.valor), ["45x19mm", "68x53x10mm", "53x68x12mm"]);
  conferir("cada medida conserva a loja de origem", dimensoes.opcoes.map((item) => item.fontes[0].nome), ["Piscaled", "Usinainfo", "Saravati"]);
  conferir("medida sem eixos declara a suposicao", Boolean(dimensoes.opcoes[0].aviso), true);
  conferir("medida com eixos declarados nao recebe aviso", dimensoes.opcoes[2].aviso, null);
  // A dica do mouse mostra a loja e a caracteristica COMO ELA PUBLICOU, e nao o titulo do produto (13/10/2026).
  const { dicaDasFontes } = await import("../src/lib/ia/revisaoDescricao.js");
  const micro = identificarDivergencias([
    { id: "h", nome: "Placa Arduino compativel UNO R3", fonte: { nome: "4hobby" }, especificacoes: [{ nome: "Microcontrolador", valor: "Atmega328P" }] },
    { id: "o", nome: "Arduino UNO", fonte: { nome: "Outra loja" }, especificacoes: [{ nome: "Microcontrolador", valor: "Atmega328PB" }] },
  ])[0];
  conferir("dica: loja e caracteristica original, sem o titulo do produto", micro.opcoes.map((opcao) => dicaDasFontes(opcao.fontes)), ["4hobby: Microcontrolador: Atmega328P", "Outra loja: Microcontrolador: Atmega328PB"]);
  conferir("dica de medida: a linha da opcao, sem o marcador", dimensoes.opcoes.map((opcao) => dicaDasFontes(opcao.fontes)), ["Piscaled: Dimensões(CxL): 45x19mm", "Usinainfo: Dimensões(CxLxA): 68x53x10mm", "Saravati: Dimensões(CxLxA): 53x68x12mm"]);
  conferir("dica sem caracteristica cai no titulo do produto, e sem ele so na loja", dicaDasFontes([{ nome: "A", produto: "Titulo" }, { nome: "B" }]), "A: Titulo\nB");
  conferir("valores iguais nao criam escolha falsa", identificarDivergencias([referencias[0], { ...referencias[0], id: "p2", fonte: { nome: "Outra loja" } }]), []);
  const correntes = identificarDivergencias([
    { id: "a", nome: "UNO", fonte: { nome: "Loja A" }, especificacoes: [{ nome: "Corrente por pino I/O", valor: "40 mA" }] },
    { id: "b", nome: "UNO", fonte: { nome: "Loja B" }, especificacoes: [{ nome: "Corrente por pino I/O", valor: "20mA" }] },
  ]);
  conferir("corrente divergente tambem pede escolha", correntes[0].opcoes.map((item) => item.valor), ["40 mA", "20mA"]);
  conferir("mesma memoria com redacoes diferentes nao e conflito", identificarDivergencias([
    { id: "a", nome: "UNO", fonte: { nome: "Loja A" }, especificacoes: [{ nome: "Memória Flash", valor: "32KB (0,5KB usados pelo bootloader)" }] },
    { id: "b", nome: "UNO", fonte: { nome: "Loja B" }, especificacoes: [{ nome: "Memória Flash", valor: "32 KB (ATmega328P)" }] },
  ]), []);
}

{
  const { adicionarEspecificacao, compactarUnidades, garantirSecaoEspecificacoes, inserirEspecificacaoNaPosicao, moverEspecificacao, moverEspecificacaoPorPasso, normalizarTerminologiaEletrica, organizarDescricao, removerEspecificacao } = await import("../src/lib/ia/revisaoDescricao.js");
  const original = "Titulo\n\nTexto introdutorio.\n\nEspecificações técnicas:\n- Clock: 16 MHz\n\n- RAM: 2 KB;\n\nItens inclusos: placa\nGarantia: 90 dias";
  conferir("organizar limpa linhas vazias e termina cada especificacao com ponto e virgula", organizarDescricao(original),
    "Titulo\n\nTexto introdutorio.\n\nEspecificações técnicas:\n- Clock: 16MHz;\n- RAM: 2KB;\n\nItens inclusos: placa\nGarantia: 90 dias");
  const limpa = organizarDescricao(original);
  conferir("seta da fonte insere linha na secao tecnica", adicionarEspecificacao(limpa, "Microcontrolador: ATmega328P"),
    limpa.replace("\n\nItens inclusos", "\n- Microcontrolador: ATmega328P;\n\nItens inclusos"));
  conferir("mesma linha da fonte nao duplica", adicionarEspecificacao(limpa, "Clock: 16MHz"), limpa);
  conferir("arraste reordena somente linhas tecnicas", moverEspecificacao(limpa, 6, 5),
    limpa.replace("- Clock: 16MHz;\n- RAM: 2KB;", "- RAM: 2KB;\n- Clock: 16MHz;"));
  conferir("arraste fora da secao nao altera texto", moverEspecificacao(limpa, 0, 6), limpa);
  conferir("botao subir move linha tecnica", moverEspecificacaoPorPasso(limpa, 6, -1),
    limpa.replace("- Clock: 16MHz;\n- RAM: 2KB;", "- RAM: 2KB;\n- Clock: 16MHz;"));
  conferir("botao descer move linha tecnica", moverEspecificacaoPorPasso(limpa, 5, 1),
    limpa.replace("- Clock: 16MHz;\n- RAM: 2KB;", "- RAM: 2KB;\n- Clock: 16MHz;"));
  conferir("lixeira retira somente linha tecnica", removerEspecificacao(limpa, 5), limpa.replace("- Clock: 16MHz;\n", ""));
  conferir("opcao escolhida entra na posicao dada pelo prompt", inserirEspecificacaoNaPosicao(limpa, "- Microcontrolador: ATmega328P;", 0),
    limpa.replace("- Clock: 16MHz;", "- Microcontrolador: ATmega328P;\n- Clock: 16MHz;"));
  conferir("unidades tecnicas ficam coladas ao valor", compactarUnidades("5 V; 50 mA; 1 KB; 16 MHz; 2 GHz; 68 mm; 25 °C; 5 miliampères"),
    "5V; 50mA; 1KB; 16MHz; 2GHz; 68mm; 25°C; 5miliampères");
  conferir("termos eletricos preferidos preservam a caixa", normalizarTerminologiaEletrica("Voltagem, VOLTAGEM e amperagem; voltagens e Amperagens"),
    "Tensão, TENSÃO e corrente; tensões e Correntes");
  conferir("organizar corrige termos e unidades de linha escolhida", organizarDescricao("Título\n\nEspecificações técnicas:\n- Voltagem: 5 V\n- Amperagem: 50 mA\n\nGarantia:"),
    "Título\n\nEspecificações técnicas:\n- Tensão: 5V;\n- Corrente: 50mA;\n\nGarantia:");
  conferir("secao aparece mesmo se IA omitiu todas as especificacoes", garantirSecaoEspecificacoes("Titulo\n\nItens inclusos: placa"),
    "Titulo\n\nEspecificações técnicas:\n\nItens inclusos: placa");
}

console.log("\n— Descricao: 3 opcoes para cada um dos 2 primeiros paragrafos —");
{
  const { trocarParagrafo } = await import("../src/lib/ia/revisaoDescricao.js");
  const { ajustarAoLimite, LIMITE_PARAGRAFO, OPCOES_DE_PARAGRAFO, opcoesDeParagrafos } = await import("../src/lib/ia/anuncio.js");

  // trocarParagrafo: cada paragrafo e uma LINHA; troca a linha exata e nada mais.
  const descricao = "TITULO\n\nPrimeiro paragrafo.\nSegundo paragrafo.\n\nEspecificações técnicas:\n- Clock: 16MHz;";
  conferir("troca o primeiro paragrafo e mantem o resto", trocarParagrafo(descricao, "Primeiro paragrafo.", "Outro primeiro."),
    "TITULO\n\nOutro primeiro.\nSegundo paragrafo.\n\nEspecificações técnicas:\n- Clock: 16MHz;");
  conferir("troca o segundo sem mexer no primeiro", trocarParagrafo(descricao, "Segundo paragrafo.", "Outro segundo."),
    "TITULO\n\nPrimeiro paragrafo.\nOutro segundo.\n\nEspecificações técnicas:\n- Clock: 16MHz;");
  conferir("espaco sobrando na linha nao atrapalha", trocarParagrafo("A\n  Primeiro paragrafo.  \nB", "Primeiro paragrafo.", "Novo."), "A\nNovo.\nB");
  conferir("paragrafo editado a mao: nao acha e devolve null", trocarParagrafo(descricao.replace("Primeiro paragrafo.", "Primeiro paragrafo EDITADO."), "Primeiro paragrafo.", "Novo."), null);
  conferir("trecho de uma linha maior nao conta (so a linha inteira)", trocarParagrafo("Primeiro paragrafo. Mais texto.", "Primeiro paragrafo.", "Novo."), null);
  conferir("paragrafo atual vazio nao troca nada", trocarParagrafo(descricao, "  ", "Novo."), null);

  // opcoesDeParagrafos: o que a IA devolveu virou ate 3 opcoes limpas por paragrafo.
  conferir("a IA pede 3 opcoes por paragrafo", OPCOES_DE_PARAGRAFO, 3);
  const duasVezesTres = opcoesDeParagrafos([["A1.", "A2.", "A3."], ["B1.", "B2.", "B3."]]);
  conferir("dois grupos de tres", duasVezesTres, { opcoes: [["A1.", "A2.", "A3."], ["B1.", "B2.", "B3."]], longos: [] });
  conferir("tira markdown e emoji de cada opcao", opcoesDeParagrafos([["**Negrito** aqui 😀", "B."], ["C."]]).opcoes,
    [["Negrito aqui", "B."], ["C."]]);
  conferir("compacta a unidade tecnica na opcao", opcoesDeParagrafos([["Opera em 5 V e 16 MHz."], ["B."]]).opcoes[0], ["Opera em 5V e 16MHz."]);
  conferir("opcao repetida sai", opcoesDeParagrafos([["A.", "A.", "B."], ["C."]]).opcoes[0], ["A.", "B."]);
  conferir("opcao em branco sai", opcoesDeParagrafos([["A.", "   ", ""], ["C."]]).opcoes[0], ["A."]);
  conferir("mais de tres opcoes: ficam as tres primeiras", opcoesDeParagrafos([["A.", "B.", "C.", "D."], ["E."]]).opcoes[0], ["A.", "B.", "C."]);
  conferir("so os dois primeiros grupos valem", opcoesDeParagrafos([["A."], ["B."], ["C."]]).opcoes.length, 2);
  conferir("formato antigo (texto solto no lugar do grupo) vira grupo de uma opcao", opcoesDeParagrafos(["A.", "B."]).opcoes, [["A."], ["B."]]);
  conferir("lixo no lugar da lista vira vazio, sem quebrar", opcoesDeParagrafos(null), { opcoes: [], longos: [] });
  conferir("grupo vazio fica vazio", opcoesDeParagrafos([[], ["B."]]).opcoes, [[], ["B."]]);

  // O limite de cada paragrafo vale para CADA opcao.
  const frase = (letra) => `${letra.repeat(98)}. `;
  const longa = (ultima) => `${frase("a")}${frase("b")}${frase(ultima)}`.trim();
  conferir("opcao acima do limite vai para a IA reescrever", opcoesDeParagrafos([["Curta.", longa("c")], ["B."]]).longos, [longa("c")]);
  conferir("opcao exatamente no limite nao e longa", opcoesDeParagrafos([["x".repeat(LIMITE_PARAGRAFO)], ["B."]]).longos, []);
  conferir("so as tres primeiras contam para o limite", opcoesDeParagrafos([["A.", "B.", "C.", longa("d")], ["E."]]).longos, []);

  // Ultimo recurso: ficam as frases inteiras que cabem, e o corte pode igualar duas opcoes.
  const cortadas = ajustarAoLimite([[longa("c"), longa("d"), "Curta."], [longa("e")]]);
  conferir("corta em frases inteiras e nenhuma passa do limite", cortadas.flat().every((opcao) => opcao.length <= LIMITE_PARAGRAFO), true);
  conferir("duas opcoes que o corte igualou viram uma", cortadas[0], [`${frase("a")}${frase("b")}`.trim(), "Curta."]);
}

console.log("\n— Navegacao: so a MESMA origem (e nao o que comeca igual) —");
{
  const { mesmaOrigem } = await import("../src/lib/coleta/descobrir.js");
  const origem = "https://loja.com.br";
  conferir("mesma origem: pagina da loja", mesmaOrigem("https://loja.com.br/produto/1", origem), true);
  conferir("mesma origem: a raiz", mesmaOrigem("https://loja.com.br", origem), true);
  conferir("mesma origem: porta padrao escrita", mesmaOrigem("https://loja.com.br:443/x", origem), true);
  // O defeito: `startsWith` deixava passar um host que so COMECA igual. Um link no HTML de uma loja levava o worker
  // a um host de terceiro (ou a um nome que resolve para a rede interna).
  conferir("host que so comeca igual (loja.com.br.atacante.com) NAO e da origem", mesmaOrigem("https://loja.com.br.atacante.com/x", origem), false);
  conferir("o mesmo, com porta", mesmaOrigem("https://loja.com.br.atacante.com:3000/x", origem), false);
  conferir("host com usuario (loja.com.br@atacante.com) NAO e da origem", mesmaOrigem("https://loja.com.br@atacante.com/x", origem), false);
  conferir("outro esquema NAO e da origem", mesmaOrigem("http://loja.com.br/x", origem), false);
  conferir("outra porta NAO e da origem", mesmaOrigem("https://loja.com.br:8443/x", origem), false);
  conferir("subdominio NAO e da origem", mesmaOrigem("https://www.loja.com.br/x", origem), false);
  conferir("texto que nao e endereco NAO e da origem", mesmaOrigem("nao e url", origem), false);
}

console.log("\n— Navegacao: segue a paginacao das categorias, e nao ordenacao nem filtro —");
{
  const { parametroRuim } = await import("../src/lib/coleta/descobrir.js");
  const base = "https://www.usinainfo.com.br/esp32-611";
  // O caso de 07/10/2026: o ESP32-S3-WROOM-1 so aparecia na pagina 2 da categoria, e a navegacao nunca abria "?p=2".
  conferir("pagina 2 da categoria (?p=2) e seguida", parametroRuim(`${base}?p=2`), false);
  conferir("?page=3 tambem", parametroRuim(`${base}?page=3`), false);
  conferir("paginacao junto de outro parametro inofensivo e seguida", parametroRuim(`https://loja.test/index.php?id_category=11&p=2`), false);
  conferir("endereco sem parametro e seguido", parametroRuim(base), false);
  conferir("p=1 e a propria pagina 1: nao abre de novo", parametroRuim(`${base}?p=1`), true);
  conferir("pagina que nao e numero e recusada", parametroRuim(`${base}?p=abc`), true);
  conferir("pagina absurda e recusada (armadilha de paginas infinitas)", parametroRuim(`${base}?p=5000`), true);
  conferir("ordenacao continua recusada", parametroRuim(`${base}?orderby=price&orderway=asc`), true);
  conferir("paginacao COM ordenacao continua recusada", parametroRuim(`${base}?p=2&orderby=price`), true);
  conferir("itens por pagina (n=) continua recusado", parametroRuim(`${base}?n=60`), true);
  conferir("busca (q=, search_query=) continua recusada", [parametroRuim(`${base}?q=esp32`), parametroRuim(`${base}?search_query=x`)], [true, true]);
  conferir("nome de parametro em caixa alta conta igual", parametroRuim(`${base}?OrderBy=price`), true);
  // Curto Circuito (Magento 2, 22/10/2026): os filtros da camada de navegacao e o "&amp;" que ficou sem decodificar.
  conferir("filtro de categoria do Magento (cat=) e recusado", parametroRuim(`${base}?cat=5`), true);
  conferir("ordenacao da lista do Magento e recusada", parametroRuim(`${base}?product_list_order=price&product_list_dir=asc`), true);
  conferir("faixa de preco e fabricante do Magento sao recusados", [parametroRuim(`${base}?price=10-20`), parametroRuim(`${base}?manufacturer=12`)], [true, true]);
  conferir("'&amp;' sem decodificar (amp;cat=) e recusado", parametroRuim(`${base}?p=2&amp%3Bcat=5`), true);
}

console.log("\n— Navegacao: o href decodifica entidades, e a listagem do Magento nao e produto —");
{
  const { linksDe } = await import("../src/lib/coleta/descobrir.js");
  const { ehListagemDoMagento } = await import("../src/lib/coleta/magento.js");
  const origem = "https://www.curtocircuito.com.br";
  const fonte = { name: "Curto Circuito", type: "CONCORRENTE" };
  const html = `<a href="/modulos.html?p=2&amp;id_category=7">2</a><a href="/modulos.html?p=3&amp;cat=5">3</a><a href="/sensor-x.html">x</a>`;
  conferir(
    "o &amp; do href vira & (e o filtro cat= continua recusado)",
    linksDe(html, `${origem}/modulos.html`, origem),
    [`${origem}/modulos.html?p=2&id_category=7`, `${origem}/sensor-x.html`],
  );
  const categoria =
    `<html><head><meta property="og:type" content="product.group" />` +
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Modulo A","offers":{"@type":"Offer","price":"25.20","priceCurrency":"BRL"}}</script>` +
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Modulo B","offers":{"@type":"Offer","price":"9.90","priceCurrency":"BRL"}}</script>` +
    `</head><body class=" no-js page-products catalog-category-view categorypath-modulos category-modulos"><h1>Módulos</h1></body></html>`;
  conferir("categoria do Magento e listagem", ehListagemDoMagento(categoria), true);
  const lida = normalizarPagina({ html: categoria, url: `${origem}/modulos.html`, fonte });
  conferir("a categoria nao rende produto (antes virava 'Modulos' a R$ 25,20)", [lida.produtos.length, lida.motivo], [0, "listagem do Magento (categoria), nao pagina de produto"]);
  conferir("extrairProduto tambem desiste da categoria", extrairProduto(categoria, `${origem}/modulos.html`).encontrado, false);
  const produto =
    `<html><head><meta property="og:type" content="og:product" />` +
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Sensor X","sku":"SX1","offers":{"@type":"Offer","price":"12.50","priceCurrency":"BRL","availability":"https://schema.org/InStock"}}</script>` +
    `</head><body class=" no-js catalog-product-view product-sensor-x"><h1>Sensor X</h1></body></html>`;
  conferir("pagina de produto do Magento NAO e listagem", ehListagemDoMagento(produto), false);
  const lido = normalizarPagina({ html: produto, url: `${origem}/sensor-x.html`, fonte });
  conferir("a pagina de produto continua rendendo produto", [lido.produtos.length, lido.produtos[0]?.name, lido.produtos[0]?.prices?.normal], [1, "Sensor X", 12.5]);
  conferir("pagina sem marcacao do Magento nao e listagem", ehListagemDoMagento(`<html><body class="home"><p>x</p></body></html>`), false);
}

console.log("\n— Estoque do concorrente e a ordem da aba Concorrentes —");
{
  const { ordenarConcorrentes, situacaoDeEstoque } = await import("../src/lib/estoqueDoConcorrente.js");
  // Mesma leitura do selo da coluna Estoque: a quantidade manda; "ativo" falso e produto que saiu da coleta.
  conferir("sem situacao: nao informado", situacaoDeEstoque(undefined), "nao-informado");
  conferir("quantidade zero: sem estoque", situacaoDeEstoque({ ativo: true, quantidade: 0, estoqueStatus: "AVAILABLE" }), "sem-estoque");
  conferir("OUT_OF_STOCK sem quantidade: sem estoque", situacaoDeEstoque({ ativo: true, quantidade: null, estoqueStatus: "OUT_OF_STOCK" }), "sem-estoque");
  conferir("saiu da coleta: fora da coleta", situacaoDeEstoque({ ativo: false, quantidade: null, estoqueStatus: "AVAILABLE" }), "fora-da-coleta");
  conferir("quantidade positiva: em estoque", situacaoDeEstoque({ ativo: true, quantidade: 5, estoqueStatus: null }), "em-estoque");
  conferir("IN_STOCK: em estoque", situacaoDeEstoque({ ativo: true, quantidade: null, estoqueStatus: "IN_STOCK" }), "em-estoque");
  conferir("status desconhecido: nao informado", situacaoDeEstoque({ ativo: true, quantidade: null, estoqueStatus: null }), "nao-informado");

  // A ordem (pedido do dono em 07/10/2026): com estoque (ou sem informacao) primeiro, sem estoque depois, fora da
  // coleta por ultimo; dentro de cada grupo, do mais barato ao mais caro, sem preco no fim.
  const linhas = [
    { id: "a", preco: 20, produtoColetadoId: "pa" },
    { id: "b", preco: 50, produtoColetadoId: "pb" },
    { id: "c", preco: 10, produtoColetadoId: "pc" },
    { id: "d", preco: null, produtoColetadoId: "pd" },
    { id: "e", preco: 30, produtoColetadoId: null },
    { id: "f", preco: 5, produtoColetadoId: "pf" },
  ];
  const situacoes = {
    pa: { ativo: true, quantidade: 0 },
    pb: { ativo: true, estoqueStatus: "IN_STOCK" },
    pc: { ativo: true, estoqueStatus: "OUT_OF_STOCK" },
    pd: { ativo: true, estoqueStatus: "IN_STOCK" },
    pf: { ativo: false },
  };
  conferir("com estoque primeiro, sem estoque depois, fora da coleta por ultimo", ordenarConcorrentes(linhas, situacoes).map((l) => l.id), ["e", "b", "d", "c", "a", "f"]);
  conferir("sem situacao lida ainda: so pelo preco", ordenarConcorrentes(linhas, {}).map((l) => l.id), ["f", "c", "a", "e", "b", "d"]);
  conferir("nao muda a lista original", linhas.map((l) => l.id), ["a", "b", "c", "d", "e", "f"]);
  // A 4hobby sem estoque fica entre os que vendem, pelo preco (pedido do dono em 23/10/2026).
  const comLoja = [...linhas, { id: "h", preco: 40, produtoColetadoId: "ph", fonte: "4hobby" }];
  conferir("4hobby sem estoque fica na ordem do preco", ordenarConcorrentes(comLoja, { ...situacoes, ph: { ativo: true, quantidade: 0 } }).map((l) => l.id), ["e", "h", "b", "d", "c", "a", "f"]);
}

console.log("\n— Posicao de preco entre os concorrentes (\"2º de 10\") —");
{
  const { posicaoDePreco } = await import("../src/lib/posicaoDePreco.js");
  const lojas = (...pares) => pares.map(([loja, preco]) => ({ loja, preco }));

  const basico = posicaoDePreco(34.9, lojas(["A", 31.5], ["B", 36], ["C", 40]));
  conferir("posicao conta do mais barato: 1 loja abaixo = 2º de 4", [basico.posicao, basico.total], [2, 4]);
  conferir("mais barato e o proximo abaixo, com a loja", [basico.maisBarato, basico.abaixo], [{ loja: "A", preco: 31.5 }, { loja: "A", preco: 31.5 }]);
  conferir("proximo acima", basico.acima, { loja: "B", preco: 36 });
  conferir("nem primeiro nem ultimo", [basico.primeiro, basico.ultimo, basico.empatados], [false, false, 0]);

  const primeiro = posicaoDePreco(30, lojas(["A", 31.5], ["B", 36]));
  conferir("o mais barato e o 1º, sem ninguem abaixo", [primeiro.posicao, primeiro.total, primeiro.primeiro, primeiro.abaixo], [1, 3, true, null]);
  const ultimo = posicaoDePreco(50, lojas(["A", 31.5], ["B", 36]));
  conferir("o mais caro e o ultimo, sem ninguem acima", [ultimo.posicao, ultimo.ultimo, ultimo.acima], [3, true, null]);

  const empate = posicaoDePreco(34.9, lojas(["A", 31.5], ["B", 34.9], ["C", 34.9], ["D", 40]));
  conferir("empate fica na mesma posicao, e conta quantos empatam", [empate.posicao, empate.total, empate.empatados], [2, 5, 2]);
  conferir("empate em centavos: 34.9 e '34,90' sao iguais", posicaoDePreco(34.9, lojas(["A", "34,90"])).empatados, 1);

  const mesmaLoja = posicaoDePreco(34.9, lojas(["A", 31.5], ["A", 29], ["A", 45], ["B", 36]));
  conferir("cada loja conta UMA vez, pelo menor preco dela", [mesmaLoja.posicao, mesmaLoja.total, mesmaLoja.maisBarato], [2, 3, { loja: "A", preco: 29 }]);
  conferir("loja com nome em caixa ou espaco diferente e a mesma", posicaoDePreco(34.9, lojas(["Loja A", 31.5], [" loja a ", 30])).total, 2);

  conferir("concorrente sem preco (ou preco zero) fica de fora", posicaoDePreco(34.9, lojas(["A", null], ["B", ""], ["C", 0], ["D", 36])).total, 2);
  conferir("sem preco do produto: nada", posicaoDePreco(null, lojas(["A", 31.5])), null);
  conferir("preco do produto zero ou texto vazio: nada", [posicaoDePreco(0, lojas(["A", 1])), posicaoDePreco("", lojas(["A", 1]))], [null, null]);
  conferir("nenhum concorrente com preco: nada", posicaoDePreco(34.9, lojas(["A", null])), null);
  conferir("preco do produto em texto com virgula vale", posicaoDePreco("34,90", lojas(["A", 31.5])).posicao, 2);

  // Concorrente SEM ESTOQUE nao conta (pedido do dono em 07/10/2026): ninguem compra dele agora.
  const comIndisponivel = posicaoDePreco(34.9, [
    { loja: "A", preco: 20, indisponivel: true },
    { loja: "B", preco: 31.5 },
    { loja: "C", preco: 40 },
  ]);
  conferir("loja sem estoque fica fora da posicao e do total", [comIndisponivel.posicao, comIndisponivel.total, comIndisponivel.maisBarato], [2, 3, { loja: "B", preco: 31.5 }]);
  conferir("e a conta diz quantas lojas ficaram de fora por estarem sem estoque", comIndisponivel.indisponiveis, 1);
  const lojaMista = posicaoDePreco(34.9, [{ loja: "A", preco: 20, indisponivel: true }, { loja: "A", preco: 33 }]);
  conferir("loja com um produto sem estoque e outro com estoque conta pelo que tem estoque", [lojaMista.total, lojaMista.maisBarato, lojaMista.indisponiveis], [2, { loja: "A", preco: 33 }, 0]);
  conferir("so lojas sem estoque: nada", posicaoDePreco(34.9, [{ loja: "A", preco: 20, indisponivel: true }]), null);
  conferir("sem nenhuma indisponivel, a conta e zero", basico.indisponiveis, 0);
}

console.log("\n— Descricao: o prompt de escrita editavel na janela —");
{
  const { limparPromptDaDescricao, MAXIMO_PROMPT_DESCRICAO, montarPedidoDaDescricao, PROMPT_DESCRICAO_PADRAO } =
    await import("../src/lib/ia/anuncio.js");

  // O padrao e o texto que ia fixo no codigo: as instrucoes, sem os dados do produto.
  conferir("padrao comeca pelas instrucoes", PROMPT_DESCRICAO_PADRAO.startsWith("Escreva o conteúdo da descrição"), true);
  conferir("padrao ja traz os numeros do limite e das opcoes", [PROMPT_DESCRICAO_PADRAO.includes("NO MÁXIMO 230 caracteres"),
    PROMPT_DESCRICAO_PADRAO.includes("exatamente 3 opções")], [true, true]);
  conferir("padrao nao traz dados de produto", PROMPT_DESCRICAO_PADRAO.includes("Referências:\n"), false);
  conferir("padrao cabe no teto", PROMPT_DESCRICAO_PADRAO.length <= MAXIMO_PROMPT_DESCRICAO, true);

  // limparPromptDaDescricao: o que vem da tela.
  conferir("tira espaco das pontas", limparPromptDaDescricao("  Escreva curto.  \n"), { ok: true, texto: "Escreva curto." });
  conferir("vazio e recusado", limparPromptDaDescricao("   ").ok, false);
  conferir("nao-texto e recusado", limparPromptDaDescricao(null).ok, false);
  conferir("no teto passa", limparPromptDaDescricao("x".repeat(MAXIMO_PROMPT_DESCRICAO)).ok, true);
  conferir("acima do teto e recusado, com erro em portugues", limparPromptDaDescricao("x".repeat(MAXIMO_PROMPT_DESCRICAO + 1)),
    { ok: false, erro: `O prompt passa de ${MAXIMO_PROMPT_DESCRICAO} caracteres.` });

  // montarPedidoDaDescricao: so os dados do produto. O prompt (padrao ou editado) vai no `system`, depois do papel e com
  // cache (13/10/2026): o prefixo estavel vem antes do que muda e e lido a 10% do preco nas geracoes seguintes.
  const dados = { titulo: "PLACA X", referencias: "<referencia>a</referencia>", listaDeMedidas: ["- Referência 1 (A): peso 7 g"], divergencias: [] };
  const { blocosDoSistema, blocosDoPedido, configDeSaida, esforcoDaTarefa, MODELO_IA } = await import("../src/lib/ia/anuncio.js");
  const editado = montarPedidoDaDescricao({ ...dados, instrucoes: "Escreva tudo em uma frase." });
  conferir("o prompt editado vai no system (papel, depois o prompt com cache), e nao mais no pedido",
    [editado.includes("Escreva tudo em uma frase."), blocosDoSistema("PAPEL", "Escreva tudo em uma frase.").map((b) => [b.text, Boolean(b.cache_control)])],
    [false, [["PAPEL", false], ["Escreva tudo em uma frase.", true]]]);
  conferir("sem prompt, o system tem so o papel", blocosDoSistema("PAPEL").length, 1);
  conferir("os dados do produto continuam no pedido, sem sobra no fim", [editado.startsWith("Produto que a loja vai anunciar: PLACA X\n\n"),
    editado.includes("Referências:\n\n<referencia>a</referencia>"), editado.includes("Peso e medidas já encontrados"), editado.endsWith("peso 7 g")], [true, true, true, true]);
  const primeiraChamada = blocosDoPedido("PEDIDO", null);
  const retentativa = blocosDoPedido("PEDIDO", "Na tentativa anterior...");
  conferir("cache: o bloco do pedido tem cache e e identico na retentativa; a nota vai depois, sem cache",
    [Boolean(primeiraChamada[0].cache_control), JSON.stringify(retentativa[0]) === JSON.stringify(primeiraChamada[0]), retentativa.length, Boolean(retentativa[1].cache_control)],
    [true, true, 2, false]);
  conferir("effort: a descricao pede low; as outras tarefas nao mandam effort", [esforcoDaTarefa("descricao"), esforcoDaTarefa("titulos"), esforcoDaTarefa("seo-li"), esforcoDaTarefa(undefined)], ["low", null, null, null]);
  conferir("output_config: o formato e o effort juntos na descricao; so o formato nas outras; nada sem nenhum dos dois",
    [configDeSaida("descricao", { type: "json_schema" }), configDeSaida("titulos", { type: "json_schema" }), configDeSaida("titulos", null), configDeSaida("descricao", null)],
    [{ output_config: { format: { type: "json_schema" }, effort: "low" } }, { output_config: { format: { type: "json_schema" } } }, {}, { output_config: { effort: "low" } }]);
  if (!process.env.IA_MODELO) conferir("modelo: o padrao da IA e o Opus 5.5 (IA_MODELO sobrepoe por processo)", MODELO_IA, "claude-opus-5-5");
  conferir("o prompt padrao nao entra junto com o editado", editado.includes("Escreva o conteúdo da descrição"), false);
  conferir("sem titulo, o pedido comeca nas referencias", montarPedidoDaDescricao({ ...dados, titulo: "", instrucoes: "P" }).startsWith("Referências:"), true);

  // Sem fornecedor nem concorrente (pedido do dono em 10/10/2026): a IA escreve a partir do proprio produto, com
  // a regra de nao inventar especificacao.
  const { dadosDoProprioProduto } = await import("../src/lib/ia/anuncio.js");
  conferir("dados do proprio produto: so o que tem valor, na ordem",
    dadosDoProprioProduto({ titulo: " Placa X ", marca: "ACME", modelo: "", descricao: "Texto atual.\nLinha 2" }),
    "Nome: Placa X\nMarca: ACME\nDescrição atual do produto:\nTexto atual.\nLinha 2");
  conferir("dados do proprio produto: so o nome", dadosDoProprioProduto({ titulo: "Placa X" }), "Nome: Placa X");
  const semRefs = montarPedidoDaDescricao({ titulo: "Placa X", referencias: "Nome: Placa X", semReferencias: true, instrucoes: "P" });
  conferir("sem referencias: o pedido diz que nao ha referencias e manda nao inventar especificacao",
    [semRefs.includes("Não há referências de outras lojas"), semRefs.includes("Dados do próprio produto:\n\nNome: Placa X"),
      /NUNCA invente/.test(semRefs), semRefs.includes("Referências:\n\n"), semRefs.endsWith("Nome: Placa X")],
    [true, true, true, false, true]);
  conferir("com referencias, a regra de nao inventar nao entra", montarPedidoDaDescricao({ ...dados, instrucoes: "P" }).includes("Não há referências de outras lojas"), false);

  // A IA SEMPRE recomenda uma opcao (pedido do dono em 10/10/2026): o "Finalizar descricao" usa a recomendada onde o
  // dono nao escolheu, e nunca trava.
  const { recomendacaoDaDivergencia } = await import("../src/lib/ia/divergencias.js");
  const fonte = (n) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, nome: `Loja ${i}`, produto: "P" }));
  const tensao = { campo: "Tensão de Entrada", opcoes: [{ valor: "7-9V", fontes: fonte(1) }, { valor: "5-12V", fontes: fonte(3) }] };
  conferir("decisao valida da IA e mantida, com o motivo", recomendacaoDaDivergencia(tensao, { opcao: 0, motivo: "Faixa da placa" }), { recomendada: 0, motivo: "Faixa da placa" });
  conferir("sem decisao: a opcao com mais lojas", recomendacaoDaDivergencia(tensao, undefined).recomendada, 1);
  conferir("decisao fora da lista conta como sem decisao", recomendacaoDaDivergencia(tensao, { opcao: 7, motivo: "x" }).recomendada, 1);
  conferir("empate de lojas: a primeira", recomendacaoDaDivergencia({ campo: "Pinos", opcoes: [{ valor: "14", fontes: fonte(1) }, { valor: "20", fontes: fonte(1) }] }, null).recomendada, 0);
  const corrente = { campo: "Corrente Pinos I/O", opcoes: [
    { valor: "40mA (pico/curta duração); 20mA (contínua)", fontes: fonte(1) },
    { valor: "40mA", fontes: fonte(2) },
    { valor: "40mA(curta duração) / 20mA(contínua)", fontes: fonte(1) },
  ] };
  const pico = recomendacaoDaDivergencia(corrente, { opcao: 1, motivo: "mais lojas" });
  conferir("pico x continua: a IA escolheu so o pico, e a recomendada passa a ser a que traz a continua",
    [pico.recomendada, /cont[ií]nua/.test(pico.motivo)], [0, true]);
  conferir("pico x continua: a escolha da IA que ja traz a continua fica", recomendacaoDaDivergencia(corrente, { opcao: 2, motivo: "ok" }).recomendada, 2);
  conferir("pico x continua sem decisao: tambem a que traz a continua", recomendacaoDaDivergencia(corrente, null).recomendada, 0);

  // A LOJA de cada especificacao comum (pedido do dono em 10/10/2026): a IA aponta os numeros das referencias, e o
  // Rise so aceita o que o texto da loja confirma. Sem loja confirmada, a linha fica sem nome.
  const { lojasDaCaracteristica } = await import("../src/lib/ia/divergencias.js");
  const refs = [
    { nome: "Placa Uno R3", descricao: "Clock de 16 MHz e tensão de 5V.", especificacoes: [{ nome: "Memória Flash", valor: "32 KB" }], fonte: { nome: "Usinainfo" } },
    { nome: "Arduino Uno", descricao: "Microcontrolador ATmega328P", especificacoes: [{ nome: "Clock", valor: "16MHz" }], fonte: { nome: "Eletrogate" } },
    { nome: "Outro", descricao: "Sem nada", especificacoes: [], fonte: { nome: "Saravati" } },
  ];
  conferir("loja confirmada pelo texto (numero com unidade, espaco e caixa nao atrapalham)",
    lojasDaCaracteristica({ nome: "Clock", valor: "16MHz", referencias: [1, 2] }, refs), ["Usinainfo", "Eletrogate"]);
  conferir("a IA apontou uma referencia que NAO traz o valor: fica sem loja",
    lojasDaCaracteristica({ nome: "Clock", valor: "16MHz", referencias: [3] }, refs), []);
  conferir("so as que confirmam, na ordem dada", lojasDaCaracteristica({ nome: "Chip", valor: "ATmega328P", referencias: [1, 2] }, refs), ["Eletrogate"]);
  conferir("valor so com texto: as palavras precisam estar na referencia", lojasDaCaracteristica({ nome: "Memoria", valor: "Flash 32KB", referencias: [1] }, refs), ["Usinainfo"]);
  conferir("sem numeros, numero inexistente ou lixo: sem loja",
    [lojasDaCaracteristica({ nome: "Clock", valor: "16MHz" }, refs), lojasDaCaracteristica({ nome: "Clock", valor: "16MHz", referencias: [9, 0, "x"] }, refs), lojasDaCaracteristica({ nome: "Clock", valor: "16MHz", referencias: [1] }, [])],
    [[], [], []]);
  conferir("loja repetida entra uma vez", lojasDaCaracteristica({ nome: "Clock", valor: "16MHz", referencias: [1, 1] }, refs), ["Usinainfo"]);

  // Faixas (pedido do dono em 13/10/2026): a loja escreve "7-12V", "7~12V" ou "de 6 ate 20 V", com a unidade so no
  // fim, e a IA escreve "7V a 12V". A conferencia casa os NUMEROS da faixa, nao "numero+unidade": antes a linha de
  // Tensao de Alimentacao voltava sem loja mesmo com tres lojas publicando "7-12V".
  const faixas = [
    { nome: "Uno R3", descricao: "", especificacoes: [{ nome: "Tensão de entrada (recomendada)", valor: "7-12V" }, { nome: "Tensão de entrada (limites)", valor: "6-20V" }], fonte: { nome: "Casa da Robótica" } },
    { nome: "Uno SMD", descricao: "Alimentação de 7~12V pelo jack.", especificacoes: [], fonte: { nome: "Saravati" } },
    { nome: "Nano", descricao: "Funciona de 6 até 20 V no pino VIN.", especificacoes: [], fonte: { nome: "Usinainfo" } },
    { nome: "Mega", descricao: "Consome 7 ampères e aceita 12V.", especificacoes: [], fonte: { nome: "Mamute" } },
  ];
  conferir("faixa: recomendado e limite com hifen na loja casam com 'NV a MV' da IA",
    lojasDaCaracteristica({ nome: "Tensão de Alimentação", valor: "7V a 12V por VIN ou jack (limite 6V a 20V)", referencias: [1] }, faixas), ["Casa da Robótica"]);
  conferir("faixa: hifen e til casam; loja sem o numero inicial nao",
    lojasDaCaracteristica({ nome: "Tensão de Alimentação", valor: "7V a 12V", referencias: [1, 2, 3] }, faixas), ["Casa da Robótica", "Saravati"]);
  conferir("faixa: 'de 6 ate 20 V' casa com '6V a 20V'", lojasDaCaracteristica({ nome: "Tensão de Alimentação", valor: "6V a 20V", referencias: [3] }, faixas), ["Usinainfo"]);
  conferir("faixa: numero seguido de outra palavra ('7 amperes') nao e faixa", lojasDaCaracteristica({ nome: "Tensão de Alimentação", valor: "7V a 12V", referencias: [4] }, faixas), []);
  conferir("faixa: outro numero inicial nao casa", lojasDaCaracteristica({ nome: "Tensão de Alimentação", valor: "9V a 12V", referencias: [1] }, faixas), []);

  // Quadros fundidos pelo campo padronizado (pedido do dono em 13/10/2026): a IA e o motor de sinonimos dos quadros.
  // "Tensao de entrada (recomendada)" e "Tensao de Entrada" viram UM quadro "Tensão de Alimentação".
  {
    const { fundirDivergencias } = await import("../src/lib/ia/decisoes.js");
    const { identificarDivergencias: identificar } = await import("../src/lib/ia/divergencias.js");
    const ref = (numero, nome) => ({ id: "r" + numero, nome, produto: "P" + numero, numero });
    const divs = [
      { id: "spec:tensaodeentradarecomendada", campo: "Tensão de entrada (recomendada)", opcoes: [
        { valor: "7-9V", linha: "- Tensão de entrada (recomendada): 7-9V;", aviso: null, fontes: [ref(1, "Usinainfo")] },
        { valor: "7-12v", linha: "- Tensão de entrada (recomendada): 7-12v;", aviso: null, fontes: [ref(4, "Casa da Robótica"), ref(5, "Smartkits")] } ] },
      { id: "spec:tensaodeentrada", campo: "Tensão de Entrada", opcoes: [
        { valor: "7-9V", linha: "- Tensão de Entrada: 7-9V;", aviso: null, fontes: [ref(3, "Eletrogate")] },
        { valor: "5-12V", linha: "- Tensão de Entrada: 5-12V;", aviso: null, fontes: [ref(11, "Piscaled")] } ] },
      { id: "spec:entradasanalogicas", campo: "Entradas analógicas", opcoes: [
        { valor: "6", linha: "- Entradas analógicas: 6;", aviso: null, fontes: [ref(6, "Easytronics")] },
        { valor: "6 (A0-A5)", linha: "- Entradas analógicas: 6 (A0-A5);", aviso: null, fontes: [ref(7, "Mamute"), ref(10, "4hobby")] } ] },
    ];
    const decisoes = [
      { id: "spec:tensaodeentradarecomendada", opcao: 1, motivo: "3 lojas", campo: "Tensão de Alimentação",
        ids: ["spec:tensaodeentradarecomendada", "spec:tensaodeentrada"], valor: "7V a 12V por VIN ou jack",
        iguais: [[{ id: "spec:tensaodeentradarecomendada", opcao: 0 }, { id: "spec:tensaodeentrada", opcao: 0 }]] },
      { id: "spec:entradasanalogicas", opcao: 1, motivo: "mesmo valor", campo: "Entradas Analógicas", ids: ["spec:entradasanalogicas"],
        valor: "6 (A0-A5)", iguais: [[{ id: "spec:entradasanalogicas", opcao: 0 }, { id: "spec:entradasanalogicas", opcao: 1 }]] },
    ];
    const fundido = fundirDivergencias(divs, decisoes);
    conferir("fusao: dois quadros do mesmo campo viram um, com o nome do prompt",
      [fundido.quadros.length, fundido.quadros[0].campo, fundido.quadros[0].ids],
      [1, "Tensão de Alimentação", ["spec:tensaodeentradarecomendada", "spec:tensaodeentrada"]]);
    conferir("fusao: opcoes unidas (iguais somam as lojas) e linhas com o nome do prompt",
      fundido.quadros[0].opcoes.map((o) => [o.linha, o.fontes.map((f) => f.nome)]),
      [["- Tensão de Alimentação: 7-9V;", ["Usinainfo", "Eletrogate"]],
        ["- Tensão de Alimentação: 7V a 12V por VIN ou jack;", ["Casa da Robótica", "Smartkits"]],
        ["- Tensão de Alimentação: 5-12V;", ["Piscaled"]]]);
    conferir("fusao: a escolhida e a recomendada, com o valor padronizado e o da loja guardado",
      [fundido.quadros[0].recomendada, fundido.quadros[0].opcoes[1].valorDaLoja, fundido.quadros[0].motivo], [1, "7-12v", "3 lojas"]);
    conferir("fusao: quadro em que tudo e igual vira linha resolvida, com lojas e numeros", fundido.resolvidas,
      [{ campo: "Entradas Analógicas", valor: "6 (A0-A5)", linha: "- Entradas Analógicas: 6 (A0-A5);",
        fontes: [ref(6, "Easytronics"), ref(7, "Mamute"), ref(10, "4hobby")], referencias: [6, 7, 10] }]);
    conferir("fusao: dado fora do prompt (foraDoPrompt) sai da descricao",
      fundirDivergencias(divs, [{ id: "spec:entradasanalogicas", opcao: 0, motivo: "", campo: null, ids: [], valor: null, foraDoPrompt: true, iguais: [] }])
        .quadros.map((q) => q.id),
      ["spec:tensaodeentradarecomendada", "spec:tensaodeentrada"]);
    conferir("fusao: decisao no formato antigo deixa o quadro como esta",
      fundirDivergencias(divs.slice(0, 1), [{ id: "spec:tensaodeentradarecomendada", opcao: 0, motivo: "m" }])
        .quadros.map((q) => [q.campo, q.recomendada, q.opcoes[0].linha]),
      [["Tensão de entrada (recomendada)", 0, "- Tensão de entrada (recomendada): 7-9V;"]]);
    conferir("fusao: id desconhecido e opcao fora da lista sao ignorados; sem decisao valida, recomenda a de mais lojas",
      fundirDivergencias(divs.slice(0, 1), [
        { id: "spec:nada", opcao: 0, motivo: "", campo: "X", ids: ["spec:nada"], valor: null, iguais: [] },
        { id: "spec:tensaodeentradarecomendada", opcao: 9, motivo: "", campo: "Tensão de Alimentação", ids: [], valor: null,
          iguais: [[{ id: "spec:tensaodeentradarecomendada", opcao: 7 }]] },
      ]).quadros.map((q) => [q.campo, q.recomendada, q.opcoes.length]),
      [["Tensão de Alimentação", 1, 2]]);
    conferir("fusao: id reivindicado por duas decisoes fica com a primeira",
      fundirDivergencias(divs.slice(0, 2), [
        { id: "spec:tensaodeentradarecomendada", opcao: 1, motivo: "", campo: "A", ids: ["spec:tensaodeentradarecomendada", "spec:tensaodeentrada"], valor: null, iguais: [] },
        { id: "spec:tensaodeentrada", opcao: 0, motivo: "", campo: "B", ids: ["spec:tensaodeentrada"], valor: null, iguais: [] },
      ]).quadros.map((q) => q.campo), ["A"]);
    conferir("fusao: a numeracao das fontes vem de identificarDivergencias", identificar([
      { id: "a", nome: "X", descricao: "", especificacoes: [{ nome: "Clock", valor: "16MHz" }], fonte: { nome: "L1" } },
      { id: "b", nome: "Y", descricao: "", especificacoes: [{ nome: "Clock", valor: "20MHz" }], fonte: { nome: "L2" } },
    ])[0].opcoes.map((o) => o.fontes[0].numero), [1, 2]);
  }

  // Os quadros fundidos entram na posicao que a IA reservou (pedido do dono em 13/10/2026): a reserva e a
  // caracteristica com o nome padronizado e valor "". Quadro sem divergencia vira linha comum.
  {
    const { integrarDecisoes } = await import("../src/lib/ia/decisoes.js");
    const ref = (numero, nome) => ({ id: "r" + numero, nome, produto: "P" + numero, numero });
    const divs = [
      { id: "spec:tensaodeentrada", campo: "Tensão de Entrada", opcoes: [
        { valor: "7-9V", linha: "- Tensão de Entrada: 7-9V;", aviso: null, fontes: [ref(1, "Usinainfo")] },
        { valor: "7-12V", linha: "- Tensão de Entrada: 7-12V;", aviso: null, fontes: [ref(2, "Eletrogate"), ref(3, "4hobby")] } ] },
      { id: "spec:entradasanalogicas", campo: "Entradas analógicas", opcoes: [
        { valor: "6", linha: "- Entradas analógicas: 6;", aviso: null, fontes: [ref(4, "Easytronics")] },
        { valor: "6 (A0-A5)", linha: "- Entradas analógicas: 6 (A0-A5);", aviso: null, fontes: [ref(5, "Mamute")] } ] },
      { id: "dimensoes", campo: "Dimensoes", opcoes: [
        { valor: "68x53x10mm", linha: "- Dimensões(CxLxA): 68x53x10mm;", aviso: null, fontes: [ref(1, "Usinainfo")] },
        { valor: "55x75x13mm", linha: "- Dimensões(CxLxA): 55x75x13mm;", aviso: null, fontes: [ref(6, "Curto Circuito")] } ] },
    ];
    const decisoes = [
      { id: "spec:tensaodeentrada", opcao: 1, motivo: "m", campo: "Tensão de Alimentação", ids: ["spec:tensaodeentrada"], valor: "7V a 12V", iguais: [] },
      { id: "spec:entradasanalogicas", opcao: 1, motivo: "", campo: "Entradas Analógicas", ids: ["spec:entradasanalogicas"], valor: "6 (A0-A5)",
        iguais: [[{ id: "spec:entradasanalogicas", opcao: 0 }, { id: "spec:entradasanalogicas", opcao: 1 }]] },
      { id: "dimensoes", opcao: 0, motivo: "", campo: "Dimensões (CxLxA)", ids: ["dimensoes"], valor: null, iguais: [] },
    ];
    const caracteristicas = [
      { nome: "Microcontrolador", valor: "ATmega328P", referencias: [1] },
      { nome: "Frequência de Clock", valor: "16MHz", referencias: [1] },
      { nome: "Tensão de Alimentação", valor: "", referencias: [] },
      { nome: "Entradas Analógicas", valor: "", referencias: [] },
      { nome: "Chip de Interface USB", valor: "CH340", referencias: [1] },
      { nome: "Pinos PWM", valor: "6", referencias: [1] },
      { nome: "Dimensões", valor: "68x53", referencias: [] },
    ];
    const integrado = integrarDecisoes({ caracteristicas, divergencias: divs, decisoes });
    conferir("integrar: a reserva da IA define a posicao do quadro; as medidas ficam no fim",
      integrado.quadros.map((q) => [q.campo, q.posicao]), [["Tensão de Alimentação", 2], ["Dimensoes", 5]]);
    conferir("integrar: a resolvida entra no lugar da reserva, com as referencias; reserva e medida somem da lista",
      integrado.caracteristicas, [
        { nome: "Microcontrolador", valor: "ATmega328P", referencias: [1] },
        { nome: "Frequência de Clock", valor: "16MHz", referencias: [1] },
        { nome: "Entradas Analógicas", valor: "6 (A0-A5)", referencias: [4, 5] },
        { nome: "Chip de Interface USB", valor: "CH340", referencias: [1] },
        { nome: "Pinos PWM", valor: "6", referencias: [1] },
      ]);
    conferir("integrar: as lojas da resolvida e as chaves substituidas",
      [integrado.resolvidas, [...integrado.substituidas].sort()],
      [[{ campo: "Entradas Analógicas", valor: "6 (A0-A5)", lojas: ["Easytronics", "Mamute"] }],
        ["spec:entradasanalogicas", "spec:tensaodealimentacao"]]);
    const comLinhaComum = integrarDecisoes({
      caracteristicas: [{ nome: "Microcontrolador", valor: "ATmega328P", referencias: [] }, { nome: "Tensão de Alimentação", valor: "7V a 12V", referencias: [2] }, { nome: "Pinos PWM", valor: "6", referencias: [] }],
      divergencias: divs.slice(0, 1), decisoes: decisoes.slice(0, 1),
    });
    conferir("integrar: linha comum com o nome do campo de um quadro sai (nao aparece duas vezes) e marca a posicao",
      [comLinhaComum.caracteristicas.map((c) => c.nome), comLinhaComum.quadros[0].posicao], [["Microcontrolador", "Pinos PWM"], 1]);
    const semReserva = integrarDecisoes({
      caracteristicas: [{ nome: "Microcontrolador", valor: "ATmega328P", referencias: [] }, { nome: "Frequência de Clock", valor: "16MHz", referencias: [] }, { nome: "Pinos PWM", valor: "6", referencias: [] }],
      divergencias: divs.slice(0, 1), decisoes: decisoes.slice(0, 1),
    });
    conferir("integrar: quadro sem reserva da IA entra pela prioridade do nome (tensao antes dos pinos)",
      [semReserva.quadros[0].posicao, semReserva.caracteristicas.length], [2, 3]);
    conferir("integrar: resposta no formato antigo mantem a reserva pelo nome da loja",
      integrarDecisoes({
        caracteristicas: [{ nome: "Microcontrolador", valor: "X", referencias: [] }, { nome: "Tensão de Entrada", valor: "", referencias: [] }, { nome: "Pinos PWM", valor: "6", referencias: [] }],
        divergencias: divs.slice(0, 1), decisoes: [{ id: "spec:tensaodeentrada", opcao: 1, motivo: "m" }],
      }).quadros.map((q) => [q.campo, q.posicao]), [["Tensão de Entrada", 1]]);
  }

  // Editar uma linha comum das especificacoes (pedido do dono em 10/10/2026): volta no formato "- Nome: valor;".
  const { substituirEspecificacao } = await import("../src/lib/ia/revisaoDescricao.js");
  const base = "TITULO\n\nEspecificações técnicas:\n- Clock: 16 MHz;\n- Tensão: 5V;\n\nGarantia:\n- 90 dias;";
  conferir("substituir: formato padrao, unidade colada", substituirEspecificacao(base, 3, "Clock: 20 MHz."),
    "TITULO\n\nEspecificações técnicas:\n- Clock: 20MHz;\n- Tensão: 5V;\n\nGarantia:\n- 90 dias;");
  conferir("substituir: aceita o hifen e o ponto e virgula que ja vieram", substituirEspecificacao(base, 4, "- Tensão: 3,3V;").split("\n")[4], "- Tensão: 3,3V;");
  conferir("substituir: linha fora das especificacoes ou texto vazio nao mexe", [substituirEspecificacao(base, 0, "X"), substituirEspecificacao(base, 3, "  ")], [base, base]);

  // O codigo dos "Itens inclusos" (pedido do dono em 10/10/2026): vem do codigo do produto, mas fica editavel.
  const { codigoDosItensInclusos, substituirCodigoDosItens } = await import("../src/lib/ia/revisaoDescricao.js");
  conferir("codigo lido da linha dos itens inclusos", [codigoDosItensInclusos("Itens inclusos: (Cod:100101)"), codigoDosItensInclusos("Itens inclusos:"), codigoDosItensInclusos("Garantia:")], ["100101", "", null]);
  const comItens = "TITULO\n\nItens inclusos: (Cod:100101)\n- 01 PLACA;\n\nGarantia:\n- 90 dias;";
  conferir("trocar o codigo dos itens inclusos", substituirCodigoDosItens(comItens, 2, "ZZ-9").split("\n")[2], "Itens inclusos: (Cod:ZZ-9)");
  conferir("codigo vazio tira o parenteses", substituirCodigoDosItens(comItens, 2, "   ").split("\n")[2], "Itens inclusos:");
  conferir("parenteses e quebra de linha no codigo sao descartados", substituirCodigoDosItens(comItens, 2, "A(B)\nC").split("\n")[2], "Itens inclusos: (Cod:ABC)");
  conferir("linha que nao e dos itens inclusos nao muda", [substituirCodigoDosItens(comItens, 0, "X"), substituirCodigoDosItens(comItens, 3, "X")], [comItens, comItens]);
  conferir("descricao antiga com 'Cód:' e fim de linha CRLF: le o codigo e mantem a grafia",
    [codigoDosItensInclusos("Itens inclusos: (Cód:100101)\r"), substituirCodigoDosItens("A\n\nItens inclusos: (Cód:100101)\r\n- 01 X;", 2, "ZZ-1").split("\n")[2]],
    ["100101", "Itens inclusos: (Cód:ZZ-1)"]);

  // O titulo da descricao e o 1o item incluso acompanham o Nome (pedido do dono em 25/10/2026), so enquanto a linha ainda
  // for o titulo de antes: quem a editou a mao a mantem.
  const { acompanharTituloNaDescricao } = await import("../src/lib/ia/revisaoDescricao.js");
  const daPlaca = "PLACA PRO MICRO 5V\n\nA Placa Pro Micro e compacta.\n\nEspecificações técnicas:\n- Clock: 16MHz;\n\nItens inclusos: (Cod:100113)\n- 01 PLACA PRO MICRO 5V;\n- 01 CABO USB;\n\nGarantia:\n- 90 dias;";
  const comoLinhas = (texto, ...indices) => texto.split("\n").filter((_, indice) => indices.includes(indice));
  const novaPlaca = acompanharTituloNaDescricao(daPlaca, "Placa Pro Micro 5V", "Placa Pro Micro 5V 16MHz");
  conferir("titulo novo: a primeira linha e o 1o item incluso acompanham", comoLinhas(novaPlaca, 0, 8), ["PLACA PRO MICRO 5V 16MHZ", "- 01 PLACA PRO MICRO 5V 16MHZ;"]);
  conferir("o resto da descricao fica como estava", novaPlaca.split("\n").filter((_, indice) => indice !== 0 && indice !== 8), daPlaca.split("\n").filter((_, indice) => indice !== 0 && indice !== 8));
  conferir("so o primeiro item incluso acompanha", acompanharTituloNaDescricao("T\n\nItens inclusos: (Cod:1)\n- 01 CABO;\n- 01 T;", "T", "NOVO"), "NOVO\n\nItens inclusos: (Cod:1)\n- 01 CABO;\n- 01 T;");
  conferir("titulo da descricao editado a mao: so o item acompanha",
    comoLinhas(acompanharTituloNaDescricao(daPlaca.replace("PLACA PRO MICRO 5V\n", "PLACA PRO MICRO - OFERTA\n"), "Placa Pro Micro 5V", "Placa Nova"), 0, 8),
    ["PLACA PRO MICRO - OFERTA", "- 01 PLACA NOVA;"]);
  conferir("item incluso editado a mao: so o titulo acompanha",
    comoLinhas(acompanharTituloNaDescricao(daPlaca.replace("- 01 PLACA PRO MICRO 5V;", "- 02 PLACA PRO MICRO 5V + CABO;"), "Placa Pro Micro 5V", "Placa Nova"), 0, 8),
    ["PLACA NOVA", "- 02 PLACA PRO MICRO 5V + CABO;"]);
  conferir("a quantidade do item incluso fica", acompanharTituloNaDescricao(daPlaca.replace("- 01 PLACA PRO MICRO 5V;", "- 05 PLACA PRO MICRO 5V;"), "Placa Pro Micro 5V", "X").split("\n")[8], "- 05 X;");
  conferir("nenhuma das duas linhas e o titulo de antes: o texto nao muda", acompanharTituloNaDescricao(daPlaca, "Outro nome", "Placa Nova"), daPlaca);
  conferir("sem mudanca real, ou com o titulo de antes ou de depois vazio: o texto nao muda",
    [acompanharTituloNaDescricao(daPlaca, "Placa Pro Micro 5V", "  placa  pro micro 5v "), acompanharTituloNaDescricao(daPlaca, "", "X"), acompanharTituloNaDescricao(daPlaca, "Placa Pro Micro 5V", "   ")],
    [daPlaca, daPlaca, daPlaca]);
  conferir("descricao vazia, ou sem itens inclusos", [acompanharTituloNaDescricao("", "A", "B"), acompanharTituloNaDescricao("A\n\nGarantia:\n- 90 dias;", "A", "B")], ["", "B\n\nGarantia:\n- 90 dias;"]);
  conferir("descricao antiga com fim de linha CRLF: o \\r fica onde estava", acompanharTituloNaDescricao("A\r\n\r\nItens inclusos: (Cód:1)\r\n- 01 A;\r\n", "A", "B"), "B\r\n\r\nItens inclusos: (Cód:1)\r\n- 01 B;\r\n");
  conferir("linha em branco antes do titulo", acompanharTituloNaDescricao("\nA\n", "A", "B"), "\nB\n");
  let digitando = daPlaca;
  let nomeAntes = "Placa Pro Micro 5V";
  for (const nome of ["Placa Pro Micro 5V ", "Placa Pro Micro 5V A", "Placa Pro Micro 5V AB"]) {
    digitando = acompanharTituloNaDescricao(digitando, nomeAntes, nome);
    nomeAntes = nome;
  }
  conferir("digitando o Nome letra a letra, a descricao acompanha o tempo todo", comoLinhas(digitando, 0, 8), ["PLACA PRO MICRO 5V AB", "- 01 PLACA PRO MICRO 5V AB;"]);

  // Lapis e lixeira em todos os campos (pedido do dono em 10/10/2026).
  const { ehCabecalhoDeSecao, substituirLinha, removerLinha, excluirOpcaoDeParagrafo, editarOpcaoDeParagrafo } = await import("../src/lib/ia/revisaoDescricao.js");
  const modelo = "TITULO\n\nParagrafo um.\nParagrafo dois.\n\nEspecificações técnicas:\n- Clock: 16MHz;\n\nItens inclusos: (Cod:100101)\n- 01 PLACA;\n- 01 CABO;\n\nGarantia:\n- 90 dias;";
  conferir("cabecalhos de secao sao reconhecidos", [ehCabecalhoDeSecao("Garantia:"), ehCabecalhoDeSecao("Itens inclusos: (Cod:1)"), ehCabecalhoDeSecao("Especificações técnicas:"), ehCabecalhoDeSecao("- 90 dias;")], [true, true, true, false]);
  conferir("editar o titulo", substituirLinha(modelo, 0, "  NOVO   TITULO ").split("\n")[0], "NOVO TITULO");
  conferir("editar um paragrafo e um item incluso", [substituirLinha(modelo, 2, "Outro texto.").split("\n")[2], substituirLinha(modelo, 9, "- 01 PLACA UNO;").split("\n")[9]], ["Outro texto.", "- 01 PLACA UNO;"]);
  conferir("editar: cabecalho, linha em branco e texto vazio nao mexem", [substituirLinha(modelo, 5, "X"), substituirLinha(modelo, 1, "X"), substituirLinha(modelo, 0, "   ")], [modelo, modelo, modelo]);
  conferir("editar: quebra de linha vira espaco", substituirLinha(modelo, 2, "a\nb").split("\n")[2], "a b");
  conferir("excluir um item incluso", removerLinha(modelo, 10), modelo.replace("- 01 CABO;\n", ""));
  conferir("excluir o unico paragrafo entre dois espacos nao deixa buraco", removerLinha("A\n\nB\n\nC", 2), "A\n\nC");
  conferir("excluir: cabecalho e linha em branco nao mexem", [removerLinha(modelo, 8), removerLinha(modelo, 1)], [modelo, modelo]);
  const grupos = [["p1a", "p1b", "p1c"], ["p2a", "p2b"]];
  const tirouEscolhida = excluirOpcaoDeParagrafo(grupos, [1, 0], 0, 1);
  conferir("excluir a opcao escolhida: a primeira assume, e a linha do texto troca", [tirouEscolhida.opcoes[0], tirouEscolhida.escolhidos, tirouEscolhida.linhaAntes, tirouEscolhida.linhaDepois], [["p1a", "p1c"], [0, 0], "p1b", "p1a"]);
  const tirouAntes = excluirOpcaoDeParagrafo(grupos, [2, 0], 0, 0);
  conferir("excluir uma opcao antes da escolhida: a escolha acompanha, a linha nao muda", [tirouAntes.escolhidos[0], tirouAntes.linhaAntes, tirouAntes.linhaDepois], [1, "p1c", "p1c"]);
  conferir("excluir ate sobrar uma: a ultima opcao nao se exclui; indice invalido tambem", [excluirOpcaoDeParagrafo(grupos, [0, 0], 1, 0).opcoes[1], excluirOpcaoDeParagrafo([["so"]], [0], 0, 0), excluirOpcaoDeParagrafo(grupos, [0, 0], 0, 9)], [["p2b"], null, null]);
  const editouEscolhida = editarOpcaoDeParagrafo(grupos, [1, 0], 0, 1, "  novo   texto ");
  conferir("editar a opcao escolhida: a linha do texto muda junto", [editouEscolhida.opcoes[0], editouEscolhida.linhaAntes, editouEscolhida.linhaDepois], [["p1a", "novo texto", "p1c"], "p1b", "novo texto"]);
  const editouOutra = editarOpcaoDeParagrafo(grupos, [1, 0], 0, 2, "x");
  conferir("editar outra opcao: a linha do texto nao muda", [editouOutra.linhaAntes, editouOutra.linhaDepois], ["p1b", "p1b"]);
  conferir("editar com texto vazio ou indice invalido: null", [editarOpcaoDeParagrafo(grupos, [0, 0], 0, 0, "  "), editarOpcaoDeParagrafo(grupos, [0, 0], 0, 7, "x")], [null, null]);

  // Mover quadros de parametro: a posicao e a ordem de desempate.
  const { moverQuadroNoEstado } = await import("../src/lib/ia/revisaoDescricao.js");
  const quadros = [{ id: "a", posicao: 2 }, { id: "b", posicao: 2 }, { id: "c", posicao: 5 }];
  const ids = (estado) => estado.divergencias.map((item) => `${item.id}${item.posicao}`).join(",");
  const trocado = moverQuadroNoEstado(quadros, ["a", "b", "c"], "a", { trocarCom: "b" });
  conferir("quadros vizinhos trocam de ordem (mesma posicao)", [ids(trocado), trocado.ordem], ["a2,b2,c5", ["b", "a", "c"]]);
  const trocadoDistante = moverQuadroNoEstado(quadros, ["a", "b", "c"], "b", { trocarCom: "c" });
  conferir("quadros em posicoes diferentes trocam a posicao tambem", [ids(trocadoDistante), trocadoDistante.ordem], ["a2,b5,c2", ["a", "c", "b"]]);
  const paraCima = moverQuadroNoEstado(quadros, ["a", "b", "c"], "c", { posicao: 4, lugar: "fim" });
  conferir("subir por cima de uma linha: posicao nova, depois dos que ja la estao", [ids(paraCima), paraCima.ordem], ["a2,b2,c4", ["a", "b", "c"]]);
  const paraBaixo = moverQuadroNoEstado(quadros, ["a", "b", "c"], "b", { posicao: 3, lugar: "inicio" });
  conferir("descer por cima de uma linha: posicao nova, antes dos que ja la estao", [ids(paraBaixo), paraBaixo.ordem], ["a2,b3,c5", ["b", "a", "c"]]);
  conferir("nao mexe no estado de entrada, nem em id que nao existe",
    [quadros[0].posicao, moverQuadroNoEstado(quadros, ["a"], "z", { posicao: 1 }).divergencias === quadros, moverQuadroNoEstado(quadros, [], "a", { posicao: 9 }).ordem], [2, true, ["b", "c", "a"]]);

  // A dica das lojas de uma opcao (pedido do dono em 13/10/2026): cada loja numa linha, "Loja: produto", e nao tudo
  // corrido separado por " · " (a dica nativa do navegador quebra no "\n").
  const { dicaDasFontes } = await import("../src/lib/ia/revisaoDescricao.js");
  conferir("dica das lojas: uma por linha, loja e produto",
    dicaDasFontes([{ nome: "Usinainfo", produto: "Placa Uno SMD" }, { nome: "Eletrogate", produto: "Uno R3 SMD CH340" }, { nome: "4hobby", produto: "Placa compatível Uno" }]),
    "Usinainfo: Placa Uno SMD\nEletrogate: Uno R3 SMD CH340\n4hobby: Placa compatível Uno");
  conferir("dica das lojas: produto ausente mostra so a loja; lista vazia ou nula, texto vazio",
    [dicaDasFontes([{ nome: "Usinainfo", produto: null }, { nome: "Saravati" }]), dicaDasFontes([]), dicaDasFontes(null)], ["Usinainfo\nSaravati", "", ""]);

  // De onde veio uma linha que NENHUMA loja confirma (pedido do dono em 13/10/2026: "se veio pela IA, deve mostrar de
  // onde veio a fonte"): do titulo/cadastro do proprio produto, ou da IA (com as referencias que ela apontou).
  {
    const { origemSemLoja } = await import("../src/lib/ia/divergencias.js");
    const refsDaOrigem = [
      { nome: "Placa Uno R3", descricao: "", especificacoes: [{ nome: "Clock", valor: "16MHz" }], fonte: { nome: "Usinainfo" } },
      { nome: "Arduino Mega", descricao: "", especificacoes: [], fonte: { nome: "Eletrogate" } },
    ];
    const proprio = "PLACA COMPATIVEL ARDUINO UNO R3 SMD CH340 COM CABO USB";
    conferir("origem: valor que esta no titulo do produto e 'cadastro'",
      origemSemLoja({ nome: "Chip de Interface USB", valor: "CH340", referencias: [] }, refsDaOrigem, proprio), { tipo: "cadastro", apontadas: [] });
    conferir("origem: valor que nada traz e 'ia', sem referencia apontada",
      origemSemLoja({ nome: "Resolução do ADC", valor: "10 bits", referencias: [] }, refsDaOrigem, proprio), { tipo: "ia", apontadas: [] });
    conferir("origem: a IA apontou uma referencia que nao confirma: 'ia', com a loja e o produto apontados",
      origemSemLoja({ nome: "Resolução do ADC", valor: "10 bits", referencias: [2, 9, "x"] }, refsDaOrigem, proprio),
      { tipo: "ia", apontadas: [{ loja: "Eletrogate", produto: "Arduino Mega" }] });
    conferir("origem: numero solto nao vira 'cadastro' so porque o titulo tem esse digito",
      origemSemLoja({ nome: "Pinos PWM", valor: "6", referencias: [] }, refsDaOrigem, "UNO R3 6 SMD"), { tipo: "ia", apontadas: [] });
    conferir("origem: sem texto do produto, e 'ia'", origemSemLoja({ nome: "Microcontrolador", valor: "ATmega328P", referencias: [] }, refsDaOrigem, ""), { tipo: "ia", apontadas: [] });

    // O mesmo valor escrito de outro jeito (13/10/2026): "10 bits" na IA e "10-Bits" na loja. O ADC do 100101 ficava sem
    // fonte porque "10bits" nao aparece em "10-bits", mesmo com a IA citando todas as referencias.
    const refsBits = [
      { nome: "Placa", descricao: "", especificacoes: [{ nome: "Tipos GPIO", valor: "Pinos digitais I/O (14), pinos analógicos 10-Bits (6 canais)" }], fonte: { nome: "Curto Circuito" } },
      { nome: "Outra", descricao: "ADC de 10 bit e 3 canais", especificacoes: [], fonte: { nome: "Saravati" } },
      { nome: "Mega", descricao: "ADC de 110 bits", especificacoes: [{ nome: "Memória Flash", valor: "32KB" }], fonte: { nome: "Eletrogate" } },
    ];
    conferir("hifen e plural: '10 bits' casa com '10-Bits' e com '10 bit', e nao com '110 bits'",
      lojasDaCaracteristica({ nome: "Resolução do ADC", valor: "10 bits", referencias: [1, 2, 3] }, refsBits), ["Curto Circuito", "Saravati"]);
    conferir("numero que e parte de outro numero nao casa: '2KB' nao esta em '32KB'",
      lojasDaCaracteristica({ nome: "Memória RAM", valor: "2KB SRAM", referencias: [3] }, refsBits), []);
    const { lojasQueTrazem } = await import("../src/lib/ia/divergencias.js");
    conferir("busca em todas as referencias quando a IA nao aponta nenhuma",
      lojasQueTrazem({ nome: "Resolução do ADC", valor: "10 bits", referencias: [] }, refsBits), ["Curto Circuito", "Saravati"]);
    conferir("busca em todas: valor curto ('6', '5V') nao e procurado; valor que ninguem traz, vazio",
      [lojasQueTrazem({ nome: "Pinos PWM", valor: "6" }, refsBits), lojasQueTrazem({ nome: "Tensão", valor: "5V" }, refsBits), lojasQueTrazem({ nome: "X", valor: "ATmega328P" }, refsBits), lojasQueTrazem(null, null)],
      [[], [], [], []]);

    // O texto da dica do rotulo "IA" / "Cadastro".
    const { dicaDaOrigem } = await import("../src/lib/ia/revisaoDescricao.js");
    const avisoIA = "Escrito pela IA: nenhuma loja nem o cadastro do produto traz este valor. Confira antes de salvar.";
    conferir("dica da origem: IA sem referencia apontada", dicaDaOrigem({ tipo: "ia", apontadas: [] }), avisoIA);
    conferir("dica da origem: IA com referencias apontadas, uma por linha",
      dicaDaOrigem({ tipo: "ia", apontadas: [{ loja: "Eletrogate", produto: "Arduino Mega" }, { loja: "Saravati", produto: null }] }),
      `${avisoIA}\n\nA IA apontou, mas o texto não confirma:\nEletrogate: Arduino Mega\nSaravati`);
    conferir("dica da origem: cadastro; sem origem, vazio",
      [dicaDaOrigem({ tipo: "cadastro", apontadas: [] }), dicaDaOrigem(null), dicaDaOrigem(undefined)], ["Este valor está no título ou no cadastro do produto.", "", ""]);
  }

  // O adaptador GPT da bancada (13/10/2026): o pedido da `chamar` (formato Anthropic) vira uma chamada a API Chat Completions da
  // OpenAI (a chave cadastrada e restrita e nao tem o escopo da API Responses), e a resposta volta no formato Anthropic.
  // So dev: nada de producao usa.
  {
    const { paraChatDaOpenAI, paraMensagemDaAnthropic, criarFetchDaOpenAI } = await import("../src/lib/ia/gptComoAnthropic.js");
    const { MODELOS_DA_DESCRICAO, MODELO_PADRAO_DA_DESCRICAO, ehModeloGpt, modeloDaDescricao } = await import("../src/lib/ia/modelosDaDescricao.js");
    const corpoAnthropic = {
      model: "gpt-6.1-sol", max_tokens: 16000, fallbacks: "default",
      system: [{ type: "text", text: "PAPEL" }, { type: "text", text: "PROMPT", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: [{ type: "text", text: "PEDIDO", cache_control: { type: "ephemeral" } }, { type: "text", text: "NOTA" }] }],
      output_config: { format: { type: "json_schema", schema: { type: "object" } }, effort: "low" },
    };
    conferir("GPT: o pedido vira Chat Completions (system, user, JSON estrito e effort)", paraChatDaOpenAI(corpoAnthropic),
      { model: "gpt-6.1-sol", messages: [{ role: "system", content: "PAPEL\n\nPROMPT" }, { role: "user", content: "PEDIDO\n\nNOTA" }],
        max_completion_tokens: 16000, store: false,
        response_format: { type: "json_schema", json_schema: { name: "resposta", strict: true, schema: { type: "object" } } }, reasoning_effort: "low" });
    conferir("GPT: modelo que nao raciocina (gpt-4.1-mini) nao leva reasoning_effort", "reasoning_effort" in paraChatDaOpenAI({ ...corpoAnthropic, model: "gpt-4.1-mini" }), false);
    const respostaOpenAI = {
      id: "chatcmpl_1", model: "gpt-6.1-sol",
      choices: [{ finish_reason: "stop", message: { role: "assistant", content: "{\"a\":1}", refusal: null } }],
      usage: { prompt_tokens: 1000, prompt_tokens_details: { cached_tokens: 800 }, completion_tokens: 300, completion_tokens_details: { reasoning_tokens: 120 } },
    };
    conferir("GPT: a resposta volta no formato Anthropic, com o cache e o raciocinio separados",
      paraMensagemDaAnthropic(respostaOpenAI, "gpt-6.1-sol"),
      { id: "chatcmpl_1", type: "message", role: "assistant", model: "gpt-6.1-sol", content: [{ type: "text", text: "{\"a\":1}" }],
        stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 200, cache_read_input_tokens: 800, cache_creation_input_tokens: 0, output_tokens: 300, output_tokens_details: { thinking_tokens: 120 } } });
    conferir("GPT: resposta cortada vira max_tokens e recusa vira refusal",
      [paraMensagemDaAnthropic({ ...respostaOpenAI, choices: [{ finish_reason: "length", message: { content: "{" } }] }, "m").stop_reason,
        paraMensagemDaAnthropic({ ...respostaOpenAI, choices: [{ finish_reason: "stop", message: { content: null, refusal: "nao" } }] }, "m").stop_reason],
      ["max_tokens", "refusal"]);

    // O seletor de modelo da janela "Criar descricao" (14/10/2026): so os dois modelos que o dono escolheu, e o servidor
    // nunca aceita outro id vindo do navegador.
    conferir("modelos da descricao: GPT 6.1 Sol (padrao, o primeiro) e Opus 5.5",
      [MODELOS_DA_DESCRICAO.map((m) => m.id), MODELO_PADRAO_DA_DESCRICAO], [["gpt-6.1-sol", "claude-opus-5-5"], "gpt-6.1-sol"]);
    conferir("modeloDaDescricao: sem escolha vale o padrao, os dois ids passam e outro id e recusado",
      [modeloDaDescricao(undefined), modeloDaDescricao(""), modeloDaDescricao("gpt-6.1-sol"), modeloDaDescricao("claude-opus-5-5"), modeloDaDescricao("gpt-6-astra"), modeloDaDescricao({ id: "x" })],
      ["gpt-6.1-sol", "gpt-6.1-sol", "gpt-6.1-sol", "claude-opus-5-5", null, null]);
    conferir("ehModeloGpt: gpt-* e o* (raciocinio) vao para a OpenAI, claude-* nao",
      [ehModeloGpt("gpt-6.1-sol"), ehModeloGpt("o3"), ehModeloGpt("claude-opus-5-5"), ehModeloGpt(undefined)], [true, true, false, false]);

    // O `fetch` do cliente da IA que fala com a OpenAI: nada do `fetch` global muda, e a chave so vai no cabecalho.
    {
      const chamadas = [];
      const falso = async (url, opcoes) => {
        chamadas.push({ url: String(url), opcoes });
        return new Response(JSON.stringify(respostaOpenAI), { status: 200, headers: { "content-type": "application/json" } });
      };
      const meuFetch = criarFetchDaOpenAI({ obterChave: async () => "sk-de-teste", fetchOriginal: falso });
      const resposta = await meuFetch("https://api.anthropic.com/v1/messages?beta=true", { method: "POST", body: JSON.stringify(corpoAnthropic) });
      const json = await resposta.json();
      conferir("fetch da OpenAI: vai para o chat/completions com a chave no cabecalho e o corpo traduzido",
        [chamadas.length, chamadas[0].url, chamadas[0].opcoes.headers.authorization, JSON.parse(chamadas[0].opcoes.body).model],
        [1, "https://api.openai.com/v1/chat/completions", "Bearer sk-de-teste", "gpt-6.1-sol"]);
      conferir("fetch da OpenAI: a resposta volta como Message da Anthropic, com o modelo PEDIDO (o preco e achado por ele)",
        [resposta.status, json.type, json.model, json.usage.cache_read_input_tokens], [200, "message", "gpt-6.1-sol", 800]);
      const outro = await meuFetch("https://exemplo.invalid/qualquer", { method: "GET" });
      conferir("fetch da OpenAI: o que nao e /v1/messages passa direto", [chamadas.length, chamadas[1].url, outro.status], [2, "https://exemplo.invalid/qualquer", 200]);

      const recusado = criarFetchDaOpenAI({
        obterChave: async () => "sk-ruim",
        fetchOriginal: async () => new Response(JSON.stringify({ error: { message: "Missing scopes" } }), { status: 401, headers: { "content-type": "application/json" } }),
      });
      const negada = await recusado("https://api.anthropic.com/v1/messages", { method: "POST", body: JSON.stringify(corpoAnthropic) });
      const corpoNegado = await negada.json();
      conferir("fetch da OpenAI: erro da OpenAI vira erro no formato da Anthropic, com o mesmo status",
        [negada.status, corpoNegado.type, corpoNegado.error.message], [401, "error", "Missing scopes"]);
    }
  }

  // O pedido manda a IA apontar as referencias de cada caracteristica (so com referencias de verdade).
  conferir("o pedido com referencias pede os numeros de cada caracteristica", montarPedidoDaDescricao({ ...dados, instrucoes: "P" }).includes("campo referencias"), true);
  conferir("sem referencias o pedido nao fala de numeros", montarPedidoDaDescricao({ ...dados, referencias: "Nome: X", semReferencias: true, instrucoes: "P" }).includes("campo referencias"), false);

  // As decisoes da IA nomeiam os quadros (pedido do dono em 13/10/2026): o pedido manda "Referência N" (nunca a loja)
  // e a instrucao das decisoes; o esquema traz campo, ids, valor e iguais.
  const { FORMATO_DESCRICAO, INSTRUCAO_DE_DECISOES } = await import("../src/lib/ia/anuncio.js");
  const comDiv = montarPedidoDaDescricao({
    ...dados, instrucoes: "P",
    divergencias: [{ id: "spec:x", campo: "X", opcoes: [{ valor: "1", aviso: null, fontes: [{ id: "a", nome: "Loja Secreta", produto: "Prod", numero: 2 }] }] }],
  });
  conferir("divergencias no pedido: a fonte e 'Referência N', nunca a loja", [comDiv.includes("Referência 2"), comDiv.includes("Loja Secreta")], [true, false]);
  conferir("divergencias no pedido: a instrucao das decisoes vai junto, e so com divergencia",
    [comDiv.includes(INSTRUCAO_DE_DECISOES), montarPedidoDaDescricao({ ...dados, instrucoes: "P" }).includes(INSTRUCAO_DE_DECISOES)], [true, false]);
  const itemDecisao = FORMATO_DESCRICAO.schema.properties.decisoes.items;
  conferir("esquema das decisoes: campo, ids, valor, foraDoPrompt e iguais, todos obrigatorios",
    [Object.keys(itemDecisao.properties).sort(), itemDecisao.required.slice().sort()],
    [["campo", "foraDoPrompt", "id", "ids", "iguais", "motivo", "opcao", "valor"], ["campo", "foraDoPrompt", "id", "ids", "iguais", "motivo", "opcao", "valor"]]);
  conferir("o prompt padrao do codigo pede o campo padronizado nas decisoes", /campo.*padronizad/i.test(PROMPT_DESCRICAO_PADRAO), true);
}

console.log("\n— Download do arquivo do produto: o nome real no cabecalho, e nao o hash —");
{
  const { cabecalhoDeArquivo, urlDe } = await import("../src/lib/arquivos.js");
  conferir("PDF abre na pagina e leva o nome real", cabecalhoDeArquivo("Datasheet ATmega328P.pdf", "inline"),
    `inline; filename="Datasheet ATmega328P.pdf"; filename*=UTF-8''Datasheet%20ATmega328P.pdf`);
  conferir("ZIP baixa e leva o nome real", cabecalhoDeArquivo("Download do driver para Windows.zip", "attachment"),
    `attachment; filename="Download do driver para Windows.zip"; filename*=UTF-8''Download%20do%20driver%20para%20Windows.zip`);
  conferir("acento: a forma ASCII perde o acento e a UTF-8 o guarda", cabecalhoDeArquivo("Manual técnico.pdf"),
    `inline; filename="Manual tecnico.pdf"; filename*=UTF-8''Manual%20t%C3%A9cnico.pdf`);
  conferir("caractere fora do latim vira _ so na forma ASCII", cabecalhoDeArquivo("Ficha 日本.pdf").includes(`filename="Ficha __.pdf"`), true);
  conferir("quebra de linha no nome nao injeta cabecalho", /[\r\n]/.test(cabecalhoDeArquivo("a.pdf\r\nSet-Cookie: x=1")), false);
  conferir("aspas, barras e dois-pontos saem do nome", cabecalhoDeArquivo(`a"b\\c/d:e.pdf`),
    `inline; filename="a_b_c_d_e.pdf"; filename*=UTF-8''a_b_c_d_e.pdf`);
  conferir("apostrofo e parenteses sao codificados no filename* (RFC 5987)", cabecalhoDeArquivo("Guia (v2) d'água.pdf").split("filename*=UTF-8''")[1],
    "Guia%20%28v2%29%20d%27%C3%A1gua.pdf");
  conferir("sem nome real devolve so a disposicao (o navegador usa o endereco)",
    [cabecalhoDeArquivo(null), cabecalhoDeArquivo("   ", "attachment"), cabecalhoDeArquivo(".."), cabecalhoDeArquivo(undefined, "attachment")],
    ["inline", "attachment", "inline", "attachment"]);

  const hash = "a".repeat(32);
  conferir("documento e certificado mudam de endereco (a resposta antiga ficou um ano no navegador)",
    [urlDe("100103", "DOCUMENTO", `${hash}.pdf`).endsWith("?v=2"), urlDe("100103", "CERTIFICADO", `${hash}.pdf`).endsWith("?v=2")], [true, true]);
  conferir("imagem continua com o endereco limpo", urlDe("100103", "IMAGEM", `${hash}.jpg`), `/api/arquivos/100103/imagens/${hash}.jpg`);
}

console.log("\n— Magento: atributos tecnicos em JSON —");
const { especificacoesDosAtributosMagento } = await import("../src/lib/coleta/magento-pwa.js");
const rotulosMagento = new Map([["comprimento", "Comprimento"], ["atributos_json", "Atributos JSON"]]);
conferir("ficha JSON vira pares de especificacao", especificacoesDosAtributosMagento([
  { code: "comprimento", value: "11,1cm" },
  { code: "atributos_json", value: '[{"name":"Abertura máxima dos terminais","value":"1cm"}]' },
], rotulosMagento), [
  { nome: "Comprimento", valor: "11,1cm" },
  { nome: "Abertura máxima dos terminais", valor: "1cm" },
]);
conferir("JSON invalido nao aparece como texto bruto", especificacoesDosAtributosMagento([
  { code: "atributos_json", value: "[{quebrado}]" },
], rotulosMagento), []);

console.log("\n— Unitel: codigo com rotulo, titulo com placeholder, categoria, aba e ficha sem titulo —");
{
  const unitel = normalizarPagina({
    html: `<html><head>
<title>Transformador - 24 + 24Vac - 10A - Bivolt - Ref. 903 - Nome da empresa</title>
<meta property="og:title" content="Transformador - 24 + 24Vac - 10A - Bivolt - Ref. 903 - Nome da empresa" />
<meta property="og:image" content="https://loja.com.br/up/2021/07/capa-transformador-903.jpg" />
</head><body><img src="https://loja.com.br/logo/logo.png" />
<section itemscope itemtype="https://schema.org/Products">
<ul id="breadcrumb" itemscope itemtype="https://schema.org/BreadcrumbList">
<li itemprop="itemListElement" itemscope><a href="/"><span itemprop="name">Home</span></a></li>
<li itemprop="itemListElement" itemscope><a href="/produtos"><span itemprop="name">Produtos</span></a></li>
<li itemprop="itemListElement" itemscope><a href="/produtos/transformadores"><span itemprop="name">Transformadores</span></a></li>
<li itemprop="itemListElement" itemscope><span itemprop="name" class="bold">Transformador - 24 + 24Vac - 10A - Bivolt - Ref. 903</span></li>
</ul>
<h1>{{SHARE}}</h1>
<h1 class="title">Transformador - 24 + 24Vac - 10A - Bivolt - Ref. 903 </h1>
<a href="https://loja.com.br/up/2021/07/capa-transformador-903.jpg" class="lightbox"><img src="https://loja.com.br/up/2021/07/capa-transformador-903.jpg" /></a>
<div class="prod-tab"><h2 onclick="openAba(event, 'desc')">Descrição</h2><h2 onclick="orcamento()">Orçamento</h2></div>
<div id="desc" class="htmlchars tabcontent"><p>Indicado para uso residencial.</p><p>Produzido com núcleo de silício.<br />Corrente Máxima: 10A</p>
<p>Tensão de saída: 24 + 24Vac<br />Tensão de entrada: 127/220Vac (Bivolt)<br />Peso: 5,072kg</p><p><strong>Observações:</strong></p></div>
<h2 class="titulo">Quem viu Transformador - 24 + 24Vac também viu</h2>
<img src="https://loja.com.br/up/2021/07/capa-outro-produto-1.jpg" /><img src="https://loja.com.br/up/2021/07/capa-outro-produto-2.jpg" />
</section>
<div itemprop="offers" itemscope><meta itemprop="price" content="100.00" /></div>
</body></html>`,
    url: "https://loja.com.br/produtos/transformadores/transformador-24-24vac-10a-bivolt-ref-903",
    fonte: { name: "Unitel", type: "FORNECEDOR" },
  }).produtos[0];

  conferir("titulo sem o placeholder que sobra no og:title", unitel?.name, "Transformador - 24 + 24Vac - 10A - Bivolt - Ref. 903");
  conferir("'ref-903' na URL vira o codigo 903", unitel?.code, "903");
  conferir("categoria e o degrau ANTES do produto no breadcrumb", unitel?.category, "Transformadores");
  conferir("relacionados abaixo de 'Quem viu' nao entram na galeria", unitel?.images, ["https://loja.com.br/up/2021/07/capa-transformador-903.jpg"]);
  conferir(
    "ficha sem titulo: corrida de 'Nome: valor' vira especificacao",
    unitel?.specifications?.map((s) => `${s.nome}=${s.valor}`),
    ["Corrente Máxima=10A", "Tensão de saída=24 + 24Vac", "Tensão de entrada=127/220Vac (Bivolt)", "Peso=5,072kg"],
  );
  conferir("descricao vem da aba (onclick)", /Indicado para uso residencial/.test(unitel?.description ?? ""), true);

  const propaganda = normalizarPagina({
    html: `<script type="application/ld+json">{"@type":"Product","name":"X","sku":"1","description":"Curta","offers":{"price":"1"}}</script>
<div class="description"><p>Custo baixo: boa solução quando o orçamento é apertado e o prazo é curto</p>
<p>Facilidade: ótima para quem está começando a estudar eletrônica</p>
<p>Qualidade: material selecionado com muito cuidado pela equipe</p></div>`,
    url: "https://loja.com.br/x",
  }).produtos[0];
  conferir("propaganda 'Rotulo: frase comprida' NAO vira ficha", propaganda?.specifications, []);

  const curta = normalizarPagina({
    html: `<html><head><title>Cabo USB-C - Ref. 1918</title>
<meta property="og:title" content="Cabo USB-C - Ref. 1918" />
<meta property="og:description" content="Cabo USB-C - Ref. 1918 - A Empresa X é uma empresa do ramo eletroeletrônico fundada em abril...Saiba mais." />
<meta property="og:image" content="https://loja.com.br/up/capa-cabo.jpg" /></head><body>
<div itemprop="offers" itemscope><meta itemprop="price" content="10.00" /></div>
<h1 class="title">Cabo USB-C - Ref. 1918</h1>
<div class="prod-tab"><h2 onclick="openAba(event, 'desc')">Descrição</h2></div>
<div id="desc" class="tabcontent"><p>Peso: 0,060kg</p></div></body></html>`,
    url: "https://loja.com.br/produtos/cabos/cabo-usb-c-ref-1918",
    fonte: { name: "Unitel", type: "FORNECEDOR" },
  }).produtos[0];
  conferir("aba curta vence o og:description generico da empresa", curta?.description, "Peso: 0,060kg");
}

// ---------------------------------------------------------------------------
// Nuvemshop (Oceantech, 09/10/2026): cada variante e um produto
// ---------------------------------------------------------------------------
console.log("\n— Nuvemshop: variantes com codigo, preco, pix e saldo proprios —");
{
  const variantes = [
    { product_id: 1, price_number: 267, compare_at_price_number: 297, price_with_payment_discount_short: "R$253,65", stock: 6, sku: "1156", available: true, option0: "250 mm", option1: null, option2: null, id: 11 },
    { product_id: 1, price_number: 273, compare_at_price_number: null, price_with_payment_discount_short: "R$259,35", stock: 0, sku: "1157", available: false, option0: "300 mm", option1: null, option2: null, id: 12 },
    { product_id: 1, price_number: 1253.5, compare_at_price_number: null, price_with_payment_discount_short: "R$1.190,83", stock: null, sku: "1158", available: true, option0: "350 mm", option1: null, option2: null, id: 13 },
  ];
  const paginaNuvemshop = (variantesDaPagina) => `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemPage","mainEntity":{"@type":"Product","name":"Fuso com Castanha SFU 2005","sku":"1156","description":"Fuso de esfera.","offers":{"@type":"Offer","priceCurrency":"BRL","price":"297","availability":"https://schema.org/InStock","inventoryLevel":{"@type":"QuantitativeValue","value":"178"}}}}</script>
<script>var variants = [{ id: 11, options: [{ name: "Medidas", value: "250\u0020mm" }] }];</script>
<script>LS.variants = ${JSON.stringify(variantesDaPagina)};</script>
</head><body>
<nav><a href="https://drive.google.com/file/d/ABC/view">CATALOGO DE PRODUTOS</a> <a href="#">CATALOGO DE PRODUTOS</a></nav>
<div class="description user-content" data-store="product-description-1"><p>Texto.</p><a href="https://loja.exemplo.com/files/datasheet-fuso.pdf">Datasheet</a></div>
<footer><a href="https://drive.google.com/file/d/ABC/view">CATALOGO DE PRODUTOS</a></footer>
</body></html>`;
  const urlNuvem = "https://loja.exemplo.com/produtos/fuso-com-castanha-sfu-2005/";
  const ler = (html) => normalizarPagina({ html, url: urlNuvem, fonte: { tipo: "CONCORRENTE" } });
  const lido = ler(paginaNuvemshop(variantes));
  const [a, b, c] = lido.produtos;

  conferir("Nuvemshop: uma pagina vira um produto por variante", lido.produtos.length, 3);
  conferir("Nuvemshop: codigo de cada variante, e nao o do JSON-LD", lido.produtos.map((p) => p.code), ["1156", "1157", "1158"]);
  conferir("Nuvemshop: o tamanho entra no nome", lido.produtos.map((p) => p.name), ["Fuso com Castanha SFU 2005 - 250 mm", "Fuso com Castanha SFU 2005 - 300 mm", "Fuso com Castanha SFU 2005 - 350 mm"]);
  conferir("Nuvemshop: preco normal e o cobrado, nao o riscado", [a.prices.normal, b.prices.normal], [267, 273]);
  conferir("Nuvemshop: preco no pix vai como promocional", [a.prices.promotional, b.prices.promotional, c.prices.promotional], [253.65, 259.35, 1190.83]);
  conferir("Nuvemshop: saldo e o da variante, nao a soma do JSON-LD", [a.stock.quantity, b.stock.quantity], [6, 0]);
  conferir("Nuvemshop: variante esgotada", [a.stock.status, b.stock.status], ["AVAILABLE", "OUT_OF_STOCK"]);
  conferir("Nuvemshop: saldo que a loja nao controla fica sem numero", [c.stock.quantity, c.stock.status], [null, "AVAILABLE"]);
  conferir("Nuvemshop: o tamanho entra na ficha com o nome da opcao", espec(a, "Medidas"), "250 mm");
  conferir("Nuvemshop: a origem diz de onde veio o saldo", a.origens.quantidade.includes("LS.variants"), true);
  conferir("Nuvemshop: a origem registra o riscado descartado", a.origens.precoNormal.includes("297,00"), true);
  conferir("Nuvemshop: so o documento da descricao, sem o catalogo do menu", a.documentos.map((d) => d.url), ["https://loja.exemplo.com/files/datasheet-fuso.pdf"]);

  const umaSo = ler(paginaNuvemshop(variantes.slice(0, 1))).produtos;
  conferir("Nuvemshop: variante unica mantem o nome da pagina", umaSo.map((p) => p.name), ["Fuso com Castanha SFU 2005"]);
  conferir("Nuvemshop: variante unica traz pix e saldo proprios", [umaSo[0].prices.promotional, umaSo[0].stock.quantity], [253.65, 6]);

  const semJs = ler(paginaNuvemshop(variantes).replace("LS.variants = ", "LS.outra = "));
  conferir("Nuvemshop: sem o JS de variantes cai no caminho comum", [semJs.produtos.length, semJs.produtos[0].code, semJs.produtos[0].prices.normal], [1, "1156", 297]);
  conferir("Nuvemshop: JS de variantes quebrado cai no caminho comum", ler(paginaNuvemshop(variantes).replace('"id":11', '"id":')).produtos.length, 1);
  const semDescricao = paginaNuvemshop(variantes)
    .replace('data-store="product-description-1"', 'data-x="1"')
    .replace("https://loja.exemplo.com/files/datasheet-fuso.pdf", urlNuvem + "#");
  conferir("Nuvemshop: link para a propria pagina nao e documento", ler(semDescricao).produtos[0].documentos.filter((d) => d.url.startsWith(urlNuvem)), []);
}

console.log("\n— Nuvemshop: acento, foto repetida em tamanhos e categoria (fonte chaveada da Oceantech) —");
{
  const { decodificar } = await import("../src/lib/coleta/texto-html.js");
  conferir("entidade em maiuscula vira letra maiuscula", decodificar("CARACTER&Iacute;STICAS ESPECIFICA&Ccedil;&Otilde;ES"), "CARACTERÍSTICAS ESPECIFICAÇÕES");
  conferir("entidade maiuscula fora da tabela volta em caixa alta", decodificar("&Ucirc;&ucirc;&Ntilde;"), "ÛûÑ");
  conferir("entidade minuscula continua minuscula", decodificar("D&iacute;gitos &amp; 1,8&rdquo;"), "Dígitos & 1,8”");

  const cdn = "acdn-us.mitiendanube.com/stores/001/734/387/products/fonte-chaveada-dc-195136f834a368beee16998997015591";
  const html = `<html><head><meta property="og:type" content="nuvemshop:product" />
<script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemPage","breadcrumb":{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Início"},{"@type":"ListItem","position":2,"name":"ELETRÔNICA"},{"@type":"ListItem","position":3,"name":"FONTES DE ENERGIA"},{"@type":"ListItem","position":4,"name":"Fonte Chaveada 36V 16,6A 600W"}]},"mainEntity":{"@type":"Product","name":"Fonte Chaveada 36V 16,6A 600W","sku":"9287","image":"https://${cdn}-480-0.webp","description":"Fonte.","offers":{"@type":"Offer","price":"229","availability":"https://schema.org/InStock"}}}</script>
<script>LS.variants = [{"price_number":229,"price_with_payment_discount_short":"R$217,55","stock":53,"sku":"9287","available":true,"option0":null,"option1":null,"option2":null,"id":1}];</script>
</head><body><img src="http://${cdn}-640-0.webp"><img src="https://${cdn}-1024-1024.png"></body></html>`;
  const [fonte] = normalizarPagina({ html, url: "https://loja.exemplo.com/produtos/fonte-chaveada/", fonte: { tipo: "CONCORRENTE" } }).produtos;
  conferir("Nuvemshop: a mesma foto em tres tamanhos vira uma, na versao 1024 do CDN, em https", fonte.images, [`https://${cdn}-1024-1024.webp`]);
  conferir("Nuvemshop: categoria e o caminho inteiro do breadcrumb", fonte.category, "ELETRÔNICA > FONTES DE ENERGIA");
  conferir("Nuvemshop: sem breadcrumb no JSON-LD a categoria nao e inventada", normalizarPagina({ html: html.replace(/"breadcrumb":\{[\s\S]*?\]\},/, ""), url: "https://loja.exemplo.com/produtos/fonte-chaveada/", fonte: { tipo: "CONCORRENTE" } }).produtos[0].category, null);
}

console.log("\n— Fotos: a versao grande de cada plataforma (10/10/2026) —");
{
  const fotosDe = (imagens) => {
    const html = `<html><head><meta property="og:type" content="nuvemshop:product" /><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: "X", sku: "1", image: imagens, offers: { "@type": "Offer", price: "10" } })}</script></head><body></body></html>`;
    return normalizarPagina({ html, url: "https://loja.exemplo.com/p/x", fonte: { tipo: "CONCORRENTE" } }).produtos[0].images;
  };
  conferir("Usinainfo: large_default vira thickbox_default",
    fotosDe(["https://www.usinainfo.com.br/1018285-large_default/placa.jpg", "https://www.usinainfo.com.br/1018286-home_default/placa.jpg"]),
    ["https://www.usinainfo.com.br/1018285-thickbox_default/placa.jpg", "https://www.usinainfo.com.br/1018286-thickbox_default/placa.jpg"]);
  conferir("Eletrus: _thumb vira _orig e junta com a original",
    fotosDe(["https://www.eletruscomp.com.br/_uploads/ProdutoDestaque/82_4397_orig.jpg", "https://www.eletruscomp.com.br/_uploads/ProdutoDestaque/82_4397_thumb.jpg"]),
    ["https://www.eletruscomp.com.br/_uploads/ProdutoDestaque/82_4397_orig.jpg"]);
  conferir("Wix: o recorte /v1/ sai e fica o original",
    fotosDe(["https://static.wixstatic.com/media/85f758_3a93~mv2.png/v1/fit/w_500,h_500,q_90/file.png"]),
    ["https://static.wixstatic.com/media/85f758_3a93~mv2.png"]);
  conferir("Tray: a miniatura 90_ sai quando a foto grande esta na lista",
    fotosDe(["https://images.tcdn.com.br/img/img_prod/672486/termostato_985_1_abc.jpg", "https://images.tcdn.com.br/img/img_prod/672486/90_termostato_985_1_abc.jpg"]),
    ["https://images.tcdn.com.br/img/img_prod/672486/termostato_985_1_abc.jpg"]);
  conferir("Tray: miniatura sem a grande na lista continua (nao some foto)",
    fotosDe(["https://images.tcdn.com.br/img/img_prod/672486/90_termostato_985_1_abc.jpg"]),
    ["https://images.tcdn.com.br/img/img_prod/672486/90_termostato_985_1_abc.jpg"]);
  conferir("OpenCart: o mesmo arquivo em 600x315w e 1000x1000 fica o maior",
    fotosDe(["https://www.soldafria.com.br/image/cache/catalog/trafo-600x315w.jpg", "https://www.soldafria.com.br/image/cache/catalog/trafo-1000x1000.jpg"]),
    ["https://www.soldafria.com.br/image/cache/catalog/trafo-1000x1000.jpg"]);
  conferir("Nuvemshop: miniatura -240-0 vira -1024-1024",
    fotosDe(["https://acdn-us.mitiendanube.com/stores/001/products/fuso-240-0.webp"]),
    ["https://acdn-us.mitiendanube.com/stores/001/products/fuso-1024-1024.webp"]);
  conferir("Loja sem regra: endereco fica como veio",
    fotosDe(["https://loja.exemplo.com/img/foto-small_default.jpg"]),
    ["https://loja.exemplo.com/img/foto-small_default.jpg"]);
}

console.log("\n— Nuvemshop: o bloco da descricao vence o resumo do JSON-LD (cone BT30 da Policomp) —");
{
  const { comoTexto } = await import("../src/lib/coleta/texto-html.js");
  conferir("<br> com atributos tambem quebra linha", comoTexto('Modelo: A<br style="x" />Material: aço'), "Modelo: A\nMaterial: aço");
  const resumo = "Descubra o Cone Porta Pinca BT30, ideal para usinagem de precisao com qualidade superior. Adquira ja o seu e eleve sua usinagem a outro nivel!";
  const html = `<html><head><meta property="og:type" content="nuvemshop:product" />
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Cone BT30","sku":"77","image":"https://acdn-us.mitiendanube.com/stores/1/products/cone-640-0.webp","description":"${resumo}","offers":{"@type":"Offer","price":"300","availability":"https://schema.org/InStock"}}</script>
</head><body><div class="user-product-description"><span>Modelo: BT30-ER32-100</span><br style="color:red" /><span>Rotação maxima: 30.000 RPM</span><br /><span>L1: 100 mm</span><br /><span>D: 42 mm</span><br /><span>Material: aço liga</span><br /><span>Precisão: 0,005</span></div></body></html>`;
  const [cone] = normalizarPagina({ html, url: "https://loja.exemplo.com/produtos/cone/", fonte: { tipo: "CONCORRENTE" } }).produtos;
  conferir("descricao e o bloco, nao o resumo de SEO", cone.description.startsWith("Modelo: BT30-ER32-100"), true);
  conferir("ficha com o nome de uma letra maiuscula (D)", cone.specifications.map((e) => e.nome), ["Modelo", "Rotação maxima", "L1", "D", "Material", "Precisão"]);
}

console.log("\n— Ficha sem titulo: nome de 4-5 palavras, legenda solta e propaganda (Policomp, 10/10/2026) —");
{
  const { especificacoesDaDescricao } = await import("../src/lib/coleta/normalizar.js");
  const ficha = (texto) => especificacoesDaDescricao(texto.split("\n").join("<br>"));
  conferir("redutor NEMA 23: nome de 4 palavras nao parte a ficha",
    ficha("REDUTOR PLANETÁRIO NEMA 23 REDUÇÃO 4:1 EIXO 14MM\n\nModelo: PX57N004S0\nRedução: 4:1\nTorque maximo na saída: 50N.m\nRotação maxima na entrada: 3000 RPM\nFolga: < =15 arcmin\nEficiencia: 95%\n\nDATASHEET").map((e) => e.nome),
    ["Modelo", "Redução", "Torque maximo na saída", "Rotação maxima na entrada", "Folga", "Eficiencia"]);
  conferir("esteira: legenda solta entre pares entra sem nome",
    ficha("Raio de curvatura: R125\nAltura x Largura\nMaterial: Nylon PA66\nTemperatura de trabalho: -40 ° c --- + 80 ° c"),
    [{ nome: "Raio de curvatura", valor: "R125" }, { nome: null, valor: "Altura x Largura" }, { nome: "Material", valor: "Nylon PA66" }, { nome: "Temperatura de trabalho", valor: "-40 ° c --- + 80 ° c" }]);
  conferir("legenda solta no FIM nao entra",
    ficha("Modelo: A1\nPeso: 10g\nCor: preta\nVeja tambem").map((e) => e.nome), ["Modelo", "Peso", "Cor"]);
  conferir("valor longo COM numero entra",
    ficha("Modelo: A1\nPeso: 10g\nPotência de saída: 35W sob dissipação natural e 50W com ventilação").length, 3);
  conferir("propaganda de valor longo SEM numero nao entra, nem com hifen",
    ficha("- Leveza: Ideal para projetos portáteis e onde o peso é um fator importante\n- Resistência: Construído para suportar o uso contínuo e garantir a segurança\n- Estudantes: Ideal para projetos escolares e aprendizado prático de robótica"), []);
}

console.log("\n— Nuvemshop: home nao e produto; ficha marcada sem titulo —");
{
  const ld = (nome, sku) => `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"${nome}","sku":"${sku}","offers":{"@type":"Offer","price":"229","availability":"https://schema.org/InStock"}}</script>`;
  const home = `<html><head>${ld("Fonte Chaveada 36V", "9287")}${ld("Fonte Chaveada 48V", "9288")}</head><body class=" template-home"><img src="https://acdn-us.mitiendanube.com/x.png"></body></html>`;
  const daHome = normalizarPagina({ html: home, url: "https://loja.exemplo.com/", fonte: { tipo: "CONCORRENTE" } });
  conferir("Nuvemshop: a home (template-home) nao vira produto", [daHome.produtos.length, daHome.motivo], [0, "listagem da Nuvemshop, nao pagina de produto"]);
  const pagina = home.replace("template-home", "template-product");
  conferir("Nuvemshop: a pagina de produto (template-product) continua lida", normalizarPagina({ html: pagina, url: "https://loja.exemplo.com/produtos/fonte/", fonte: { tipo: "CONCORRENTE" } }).produtos.length > 0, true);
  conferir("loja que nao e Nuvemshop nao e afetada pela classe do body", normalizarPagina({ html: home.replace("mitiendanube", "outrocdn"), url: "https://loja.exemplo.com/", fonte: { tipo: "CONCORRENTE" } }).produtos.length > 0, true);

  const descricao = "Fuso de Esfera Laminado C7 com castanha 20mm passo 05:\n- Tamanho máximo: 2200mm\n- Dureza Superficial: 58 a 62 HRc\n- Rosca Direita\n- Máxima Folga Fuso Axial: 0,05mm\n- Máxima Folga Axial Castanha: 0,025mm\n- Baixo Ruído, Alta Precisão e Rigidez\n\nNão acompanha graxeira de lubrificação!";
  const comFicha = `<html><head><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: "Fuso", sku: "1156", description: descricao, offers: { "@type": "Offer", price: "267" } })}</script></head><body></body></html>`;
  const [fuso] = normalizarPagina({ html: comFicha, url: "https://loja.exemplo.com/produtos/fuso/", fonte: { tipo: "CONCORRENTE" } }).produtos;
  conferir("ficha marcada sem titulo: item sem dois-pontos nao quebra a lista", fuso.specifications, [
    { nome: "Tamanho máximo", valor: "2200mm" },
    { nome: "Dureza Superficial", valor: "58 a 62 HRc" },
    { nome: null, valor: "Rosca Direita" },
    { nome: "Máxima Folga Fuso Axial", valor: "0,05mm" },
    { nome: "Máxima Folga Axial Castanha", valor: "0,025mm" },
    { nome: null, valor: "Baixo Ruído, Alta Precisão e Rigidez" },
  ]);
  const paginaCom = (texto) => `<html><head><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: "Kit", sku: "77", description: texto, offers: { "@type": "Offer", price: "10" } })}</script></head><body></body></html>`;
  const propaganda = ["Produto top:", "- Alta durabilidade", "- Ótimo acabamento", "- Entrega rápida", "- Garantia: 90 dias"].join("\n");
  conferir("lista marcada de propaganda com um par so nao vira ficha", normalizarPagina({ html: paginaCom(propaganda), url: "https://loja.exemplo.com/produtos/kit/", fonte: { tipo: "CONCORRENTE" } }).produtos[0].specifications, []);
}

console.log("\n— WooCommerce com Simulador de Parcelas (Makerhero): o JSON-LD traz so o pix —");
{
  const moeda = '<span class="woocommerce-Price-currencySymbol">&#82;&#36;</span>';
  const valor = (v) => `<span class="woocommerce-Price-amount amount"><bdi>${moeda}${v}</bdi></span>`;
  const pagina = (cobrado, pix, relacionado = "") => `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Capa de Silicone","sku":"8IN07","offers":{"@type":"Offer","price":"12.25","priceCurrency":"BRL"}}</script></head><body>
<p class="price"><span class="electro-price">${cobrado}</span> <span class="wc-simulador-parcelas-parcelamento-info-container"><span class="wc-simulador-parcelas-parcelamento-info">1X DE ${valor("12,90")} sem juros</span> </span><span class="wc-simulador-parcelas-offer"> <span class="wc-simulador-parcelas-detalhes-valor">${valor(pix)} <span>no PIX</span> </span></span></p>
${relacionado}</body></html>`;
  const ler = (html) => normalizarPagina({ html, url: "https://loja.exemplo.com/produto/capa/", fonte: { tipo: "CONCORRENTE" } }).produtos[0];
  const relacionado = `<p class="price"><span class="electro-price">${valor("99,90")}</span><span class="wc-simulador-parcelas-detalhes-valor">${valor("94,90")} <span>no PIX</span></span></p>`;
  conferir("simulador: normal e o cobrado, pix vai como promocional", ler(pagina(valor("12,90"), "12,25", relacionado)).prices, { normal: 12.9, promotional: 12.25, comImpostos: null });
  conferir("simulador: com riscado, vale o <ins>", ler(pagina(`<del>${valor("15,90")}</del> <ins>${valor("12,90")}</ins>`, "12,25")).prices, { normal: 12.9, promotional: 12.25, comImpostos: null });
  conferir("simulador: valor que nao e pix nao e lido como pix", ler(pagina(valor("12,90"), "12,25").replace("no PIX", "no cartao")).origens.precoPromocional.includes("simulador"), false);
}

console.log("\n— Categoria como caminho completo (decisao do dono, 09/10/2026) —");
{
  const { caminhoDeCategoria, caminhoDoJsonLd } = await import("../src/lib/coleta/categoria.js");
  conferir("caminho: tira Inicio e o proprio produto", caminhoDeCategoria(["Início", "Impressão 3D", "Partes", "Capa de Silicone para Hotend"], "Capa de Silicone para Hotend"), "Impressão 3D > Partes");
  conferir("caminho: Home e Produtos no comeco sao raiz", caminhoDeCategoria(["Home", "Produtos", "Transformadores"]), "Transformadores");
  conferir("caminho: Produtos no MEIO fica", caminhoDeCategoria(["Eletrônica", "Produtos", "Fontes"]), "Eletrônica > Produtos > Fontes");
  conferir("caminho: degrau repetido em seguida vira um", caminhoDeCategoria(["Sensores", "Sensores", "Temperatura"]), "Sensores > Temperatura");
  conferir("caminho: so raiz nao inventa categoria", caminhoDeCategoria(["Início", "Loja"]), null);
  const ld = (itens) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: itens.map((name, i) => ({ "@type": "ListItem", position: i + 1, name })) })}</script>`;
  const duas = ld(["Início", "Loja", "Capa"]) + ld(["Início", "Impressão 3D", "Partes", "Capa"]);
  conferir("JSON-LD com duas trilhas: vale a mais longa", caminhoDoJsonLd(duas, "Capa"), "Impressão 3D > Partes");
  const emGraph = `<script type="application/ld+json">${JSON.stringify({ "@graph": [{ "@type": "WebPage" }, { "@type": "BreadcrumbList", itemListElement: [{ position: 2, name: "Motores" }, { position: 1, name: "Home" }, { position: 3, name: "Passo" }] }] })}</script>`;
  conferir("JSON-LD em @graph e fora de ordem: segue o position", caminhoDoJsonLd(emGraph), "Motores > Passo");
  conferir("JSON-LD quebrado nao derruba", caminhoDoJsonLd('<script type="application/ld+json">{quebrado</script>'), null);
}

console.log("\n— WooCommerce Store API: PIX aprendido na pagina e categoria em caminho (Makerhero) —");
{
  const { colherWooCommerce, caminhoDasCategoriasWoo } = await import("../src/lib/coleta/woocommerce.js");
  conferir("Woo: categoria pelo link da mais funda", caminhoDasCategoriasWoo([
    { name: "Impressão 3D", slug: "impressao-3d", link: "https://loja.exemplo.com/categoria/impressao-3d/" },
    { name: "Partes", slug: "partes-impressao-3d", link: "https://loja.exemplo.com/categoria/impressao-3d/partes-impressao-3d/" },
  ]), "Impressão 3D > Partes");
  conferir("Woo: categoria sem link fica com o nome", caminhoDasCategoriasWoo([{ name: "Sensores", slug: "sensores" }]), "Sensores");

  const item = (sku, centavos) => ({ name: `Produto ${sku}`, sku, permalink: `https://loja.exemplo.com/produto/${sku}/`, prices: { price: String(centavos), regular_price: String(centavos), currency_minor_unit: 2 }, is_in_stock: true, categories: [] });
  const itens = [item("A", 1290), item("B", 1490), item("C", 990)];
  const moeda = '<span class="woocommerce-Price-currencySymbol">&#82;&#36;</span>';
  const valor = (v) => `<span class="woocommerce-Price-amount amount"><bdi>${moeda}${v}</bdi></span>`;
  const paginaComPix = `<p class="price"><span class="electro-price">${valor("12,90")}</span><span class="wc-simulador-parcelas-offer"> <span class="wc-simulador-parcelas-detalhes-valor">${valor("12,25")} <span>no PIX</span> </span></span></p>`;
  const colher = async (paginaDoProduto) => {
    let paginasAbertas = 0;
    const buscar = async (url) => {
      if (url.includes("/wp-json/")) return { ok: true, corpo: JSON.stringify(itens), cabecalhos: { "x-wp-total": "3" } };
      paginasAbertas++;
      return { ok: true, corpo: paginaDoProduto };
    };
    const r = await colherWooCommerce({ catalogo: { url: "https://loja.exemplo.com/wp-json/wc/store/v1/products" }, origem: "https://loja.exemplo.com", limite: 10, orcamento: 50, fonte: { type: "CONCORRENTE" }, plataforma: { id: "woocommerce", nome: "WooCommerce" }, buscar });
    return { r, paginasAbertas };
  };
  const comPix = await colher(paginaComPix);
  conferir("Woo: PIX lido na primeira pagina e calculado no resto", comPix.r.produtos.map((p) => p.prices.promotional), [12.25, 14.15, 9.4]);
  conferir("Woo: uma pagina basta quando a amostra separa os modos de arredondar", comPix.paginasAbertas, 1);
  conferir("Woo: a origem diz que o PIX foi calculado", comPix.r.produtos[1].origens.precoPromocional.startsWith("calculado: desconto de 5%"), true);
  const semPix = await colher("<html><body><p class=\"price\">R$ 12,90</p></body></html>");
  conferir("Woo: loja sem o simulador desiste na primeira pagina", [semPix.paginasAbertas, semPix.r.produtos.map((p) => p.prices.promotional)], [1, [null, null, null]]);
}

console.log("\n— WooCommerce Store API: \"Amostra variada\" (evitar) —");
{
  const { colherWooCommerce } = await import("../src/lib/coleta/woocommerce.js");
  const item = (sku) => ({ name: `Produto ${sku}`, sku, permalink: `https://loja.exemplo.com/produto/${sku}/`, prices: { price: "1000", regular_price: "1000", currency_minor_unit: 2 }, is_in_stock: true, categories: [] });
  const itens = ["A", "B", "C", "D", "E"].map(item);
  const buscar = async (url) => url.includes("/wp-json/")
    ? { ok: true, corpo: JSON.stringify(itens), cabecalhos: { "x-wp-total": "5" } }
    : { ok: true, corpo: "<html><body>sem simulador</body></html>" };
  const colher = (evitar) => colherWooCommerce({ catalogo: { url: "https://loja.exemplo.com/wp-json/wc/store/v1/products" }, origem: "https://loja.exemplo.com", limite: 3, orcamento: 50, fonte: { type: "CONCORRENTE" }, plataforma: { id: "woocommerce", nome: "WooCommerce" }, evitar, buscar });
  const primeira = await colher(null);
  conferir("Woo: sem evitar, os tres primeiros", primeira.produtos.map((p) => p.code), ["A", "B", "C"]);
  // A tela manda os `url` COM barra final: o colher.js os normaliza antes de passar; aqui simulamos o normalizado.
  const evitar = new Set(primeira.produtos.map((p) => p.url.replace(/\/+$/, "")));
  const segunda = await colher(evitar);
  conferir("Woo: com evitar, pula os ja mostrados e traz outros", segunda.produtos.map((p) => p.code), ["D", "E"]);
  conferir("Woo: evitado nao conta como retomado", segunda.retomados, 0);
}

console.log("\n— Nuvemshop: tema sem classe no <body> (Policomp, 10/10/2026) —");
{
  const ld = (nome, sku) => `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"${nome}","sku":"${sku}","offers":{"@type":"Offer","price":"229","availability":"https://schema.org/InStock"}}</script>`;
  const home = `<html><head>${ld("Motor de passo", "90125")}${ld("Spindle", "90246")}<meta property="og:type" content="website" /></head><body><img src="https://acdn-us.mitiendanube.com/x.png"></body></html>`;
  conferir("Nuvemshop sem classe no body: home nao vira produto", normalizarPagina({ html: home, url: "https://loja.exemplo.com/", fonte: { tipo: "CONCORRENTE" } }).produtos.length, 0);
  const produto = home.replace('content="website"', 'content="nuvemshop:product"');
  conferir("Nuvemshop sem classe no body: og:type nuvemshop:product e produto", normalizarPagina({ html: produto, url: "https://loja.exemplo.com/produtos/motor/", fonte: { tipo: "CONCORRENTE" } }).produtos.length > 0, true);
  const comVariantes = home.replace("</head>", '<script>LS.variants = [{"price_number":229,"sku":"90125","stock":5,"available":true,"option0":null,"id":1}];</script></head>');
  conferir("Nuvemshop: pagina de erro com LS.variants do destaque (sem og:type) nao vira produto", normalizarPagina({ html: comVariantes.replace("<body>", "<body><h1>A página solicitada não existe</h1><h2>Produtos em destaque</h2>"), url: "https://loja.exemplo.com/produtos/redutor-que-saiu/", fonte: { tipo: "CONCORRENTE" } }).produtos.length, 0);
}

console.log("\n— Ficha com \"NOME = valor\" e datasheet por download.php (Policomp, 10/10/2026) —");
{
  const descricao = ["Redutor Planetário NEMA 34", "Modelo: PLF34-6.25-L1-P2-16MM", "Redução: 6.25: 1", "Folga: = 12 arcmin", "Eficiência: 96%", "", "REDUÇÃO = 6.25:1", "RUÍDO = 60Db", "TORQUE NOMINAL = 50 N.m", "VELOCIDADE NOMINAL DE ENTRADA = 3000 RPM", "", "DATASHEET"].join("\n");
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: "Redutor", sku: "31022", description: "Redutor Planetário NEMA 34", offers: { "@type": "Offer", price: "948.9" } })}</script></head><body><div class="user-product-description user-content">${descricao.split("\n\n").map((grupo) => `<p>${grupo.replace(/\n/g, "<br />")}</p>`).join("\n")}<a href="https://www.institucional.exemplo.com/download.php?f=9fa34319f14d7535a8034d3d72f2650e">DATASHEET</a></div><nav><a href="/catalogo">Catálogo</a></nav></body></html>`;
  const [r] = normalizarPagina({ html, url: "https://loja.exemplo.com/produtos/redutor/", fonte: { tipo: "CONCORRENTE" } }).produtos;
  const { especificacoesDaDescricao } = await import("../src/lib/coleta/normalizar.js");
  const ficha = especificacoesDaDescricao(descricao.split("\n").join("<br>"));
  conferir("ficha: \"NOME = valor\" e lida junto com \"Nome: valor\"", ficha.map((e) => e.nome), ["Modelo", "Redução", "Folga", "Eficiência", "REDUÇÃO", "RUÍDO", "TORQUE NOMINAL", "VELOCIDADE NOMINAL DE ENTRADA"]);
  conferir("ficha: vale o PRIMEIRO separador (\"REDUÇÃO = 6.25:1\" fica inteiro)", ficha.find((e) => e.nome === "REDUÇÃO")?.valor, "6.25:1");
  conferir("ficha: \"Folga: = 12 arcmin\" perde o = sobrando", ficha.find((e) => e.nome === "Folga")?.valor, "12 arcmin");
  conferir("ficha: formula colada (V=IR) nao vira par", normalizarPagina({ html: html.replace("RUÍDO = 60Db", "V=IR").replace("TORQUE NOMINAL = 50 N.m", "P=VI"), url: "https://loja.exemplo.com/produtos/redutor/", fonte: { tipo: "CONCORRENTE" } }).produtos[0].specifications.some((e) => e.nome === "V"), false);
  conferir("documento: download.php?f= e anexo, mesmo na raiz e sem extensao", r.documentos.map((d) => d.titulo), ["DATASHEET"]);
}

console.log("\n— Catalogo em arquivo JavaScript (R&AC, 10/10/2026) —");
{
  const { listaDoCatalogoJs, produtoDoCatalogoJs, familiasDoCatalogoJs } = await import("../src/lib/coleta/catalogo-js.js");
  const { catalogoJsDoEndereco } = await import("../src/lib/coleta/fornecedores.js");
  const { linhaDoProduto } = await import("../src/lib/coleta/linha.js");
  const arquivo = 'window.PRODUTOS=[{"codigo":"RAC4000","descricao":"Chave Gangorra KCD1-101 2A/8A 250V Preta c/ Marcação","imagem":"img/produtos/rac4000.jpg","pagina_pdf":[6],"imagem_compartilhada":false},{"codigo":"RAC4001","descricao":"Chave Gangorra Vermelha","imagem":"img/produtos/rac4000.jpg","pagina_pdf":[6],"imagem_compartilhada":true},{"codigo":"","descricao":"sem codigo"},{"codigo":"RAC9","descricao":"  "}];';
  const lista = listaDoCatalogoJs(arquivo);
  conferir("catalogo-js: le o array de window.PRODUTOS", lista?.length, 4);
  conferir("catalogo-js: arquivo sem a variavel devolve null", listaDoCatalogoJs("var x=[1]"), null);
  conferir("catalogo-js: JSON quebrado devolve null", listaDoCatalogoJs('window.PRODUTOS=[{"codigo":'), null);
  const base = new URL("https://www.rac.tec.br/");
  const produtos = lista.map((item) => produtoDoCatalogoJs(item, { base, fonte: { name: "R&AC" } })).filter(Boolean);
  conferir("catalogo-js: item sem codigo ou sem descricao e descartado", produtos.map((p) => p.code), ["RAC4000", "RAC4001"]);
  conferir("catalogo-js: foto vira endereco absoluto", produtos[0].images, ["https://www.rac.tec.br/img/produtos/rac4000.jpg"]);
  conferir("catalogo-js: sem preco e sem estoque, nunca inventados", [produtos[0].prices.normal, produtos[0].stock.quantity], [null, null]);
  conferir("catalogo-js: foto compartilhada fica registrada na origem", Boolean(produtos[1].origens.imagem), true);
  const familias = familiasDoCatalogoJs("const families=[['Buzzers','BUZZER'],['Chaves gangorra','CHAVE GANGORRA'],['Quebrada','(']];");
  conferir("catalogo-js: le as familias do site e ignora expressao que nao compila", familias?.map(([nome]) => nome), ["Buzzers", "Chaves gangorra"]);
  conferir("catalogo-js: arquivo sem familias devolve null", familiasDoCatalogoJs("var x=1"), null);
  const comFamilia = lista.map((item) => produtoDoCatalogoJs(item, { base, fonte: { name: "R&AC" }, familias })).filter(Boolean);
  conferir("catalogo-js: categoria = primeira familia que casa na descricao", comFamilia[0].category, "Chaves gangorra");
  conferir("catalogo-js: sem familia que case, a do proprio site", produtoDoCatalogoJs({ codigo: "RAC1", descricao: "Resistor 1K" }, { base, familias }).category, "Componente eletrônico");
  conferir("catalogo-js: sem a lista de familias, categoria vazia", produtos[0].category, null);
  const linha = linhaDoProduto(produtos[0], { origem: "site" });
  conferir("catalogo-js: a linha do banco tem chave por codigo", linha.chave, "codigo:RAC4000");
  conferir("catalogo-js: dominio rac.tec.br (com ou sem www) usa o leitor", [Boolean(catalogoJsDoEndereco("www.rac.tec.br")), Boolean(catalogoJsDoEndereco("https://rac.tec.br/index.html"))], [true, true]);
  conferir("catalogo-js: outro dominio nao usa", catalogoJsDoEndereco("https://www.eletrogate.com/"), null);
}

console.log("\n— Orcamento em PDF da R&AC + catalogo do site (10/10/2026) —");
{
  const { orcamentoDoPdf, juntarListas } = await import("../src/lib/coleta/arquivos.js");
  const { produtoDoCatalogoJs } = await import("../src/lib/coleta/catalogo-js.js");
  const texto = [
    "Data 09/10/2026",
    "Qtde \tDescrição \tValor Total",
    "50 RAC4042 - CH.GANGORRA KCD1-202 6T 6A 250V PT C/MAR \t2,65 132,28",
    "300 RAC4136 - CH.TACTIL KFC-A06-6X6X5 4T 180º PT \t0,18 52,91",
    "2.000 RAC5339 - ABRACADEIRA 3,6 (4,0)X200 PT K12L T30L \t0,19 388,01",
    "30 RAC4728 - DIAL 16 METALICO P/3590S \t40,56 1.216,93",
    "50 RAC4042 - REPETIDO \t9,99 499,50",
    "23.406,81",
    "PROPOSTA DE FORNECIMENTO",
  ].join("\n");
  const itens = orcamentoDoPdf(texto);
  conferir("orcamento: le so as linhas de item, sem o repetido", itens.map((i) => i.sku), ["RAC4042", "RAC4136", "RAC5339", "RAC4728"]);
  conferir("orcamento: unitario COMO IMPRESSO (nao total / quantidade)", itens.map((i) => i.preco), [2.65, 0.18, 0.19, 40.56]);
  conferir("orcamento: milhar com ponto na quantidade e no preco", [itens[2].unidades_orcadas, itens[3].preco], [2000, 40.56]);
  conferir("orcamento: texto sem itens devolve lista vazia", orcamentoDoPdf("Catálogo geral\nPágina 1").length, 0);

  const base = new URL("https://www.rac.tec.br/");
  const site = [
    { codigo: "RAC4042", descricao: "Chave Gangorra KCD1-202 20A/8A 250V Preta c/ Marcação", imagem: "img/produtos/rac4042.jpg" },
    { codigo: "RAC4043", descricao: "Chave Gangorra Vermelha", imagem: "img/produtos/rac4043.jpg" },
  ].map((item) => produtoDoCatalogoJs(item, { base, fonte: { name: "R&AC" }, familias: [["Chaves gangorra", /CHAVE GANGORRA/i]] }));
  const arquivo = itens.slice(0, 1).map((i) => ({
    name: i.desc, code: i.sku, prices: { normal: i.preco, promotional: null, reserva: null, comImpostos: null },
    stock: { status: "UNKNOWN", quantity: null, aChegar: null },
  }));
  const juntos = juntarListas([site, arquivo]);
  conferir("mescla: mesmo codigo vira um produto (site + orcamento)", juntos.length, 2);
  conferir("mescla: nome, foto e categoria do site", [juntos[0].name, juntos[0].images.length, juntos[0].category], ["Chave Gangorra KCD1-202 20A/8A 250V Preta c/ Marcação", 1, "Chaves gangorra"]);
  conferir("mescla: preco do orcamento, sem faixa de quantidade", [juntos[0].prices.normal, juntos[0].precosPorQuantidade ?? null], [2.65, null]);
  conferir("mescla: item fora do orcamento continua sem preco", juntos[1].prices.normal, null);
}

// Eletrodex (Tray, 10/10/2026): o bloco `description` abre com um <div class="title">
// e so depois vem o texto; a "Ficha tecnica" traz Codigo, Estoque e Categoria.
console.log("\n— Tray (Eletrodex): descricao com titulo, especificacoes e ficha da loja —");
{
  const htmlEletrodex = `<html><head>
<script type="application/ld+json">{"@type":"Product","name":"DS-8877 - Chave Pentalobe","sku":"1005","description":"DS8877 8877","offers":{"price":"33.76","availability":"http://schema.org/InStock"}}</script>
<script>dataLayer = [{"idProduct":"1005","nameProduct":"DS-8877","category":"Chaves","price":"33.76","reference":"M1B2C11","availability":"YES"}];</script></head><body>
<div data-tab-id="#descricao" class="section-box description"><div class="title">Descri&ccedil;&atilde;o Geral</div>
<div class="board_htm"><h2><strong>DS-8877 - Chave Pentalobe</strong></h2><p>Chave de fenda de precis&atilde;o feita de alum&iacute;nio puro.</p>
<h2><strong>Especifica&ccedil;&otilde;es DS-8877:</strong></h2><ul><li>Material: Cabe&ccedil;a de a&ccedil;o Cr-V</li><li>Tipo: Chave de Fenda de Precis&atilde;o</li><li>Tamanho: 125mm</li></ul></div></div>
<div id="ficha" class="section-box"><div class="title">Ficha t&eacute;cnica</div><div class="board_htm"><table>
<tr><td>C&oacute;digo</td><td>M1B2C11</td></tr><tr><td>Estoque</td><td>5</td></tr><tr><td>Categoria</td><td>Chaves</td></tr></table></div></div>
</body></html>`;
  const e = normalizarPagina({ html: htmlEletrodex, url: "https://www.eletrodex.net/ds-8877", fonte: "Eletrodex" }).produtos[0];
  conferir("eletrodex: descricao e o texto do produto, nao o titulo do bloco", /alum[ií]nio puro/.test(e.description) && !/^Descri/.test(e.description), true);
  conferir("eletrodex: especificacoes da lista da descricao", e.specifications.map((i) => i.nome), ["Material", "Tipo", "Tamanho"]);
  conferir("eletrodex: codigo, estoque e categoria da ficha da loja", [e.code, e.stock.quantity, e.category], ["M1B2C11", 5, "Chaves"]);

  // MC-154A / HDB-882: titulo "Especificacoes <NOME>:", <ul></ul> vazio antes da lista e
  // "RH <80%" sem escapar (o `<` engolia o texto ate o proximo `>`).
  const htmlMc = `<html><head><script type="application/ld+json">{"@type":"Product","name":"MC-154A","sku":"9","offers":{"price":"99.90"}}</script></head><body><div class="section-box description"><div class="title">Descri&ccedil;&atilde;o Geral</div><div class="board_htm">
<p>Capac&iacute;metro digital.</p><h3><strong>Especifica&ccedil;&otilde;es MC-154A Capac&iacute;metro Digital Minipa:</strong></h3>
<ul>
</ul>
<ul><li>Display LCD: 3 1/2 d&iacute;gitos;</li><li>Ambiente: 0&deg;C a 40&deg;C, umidade RH <80% (m&aacute;ximo);</li><li>Alimenta&ccedil;&atilde;o: Uma bateria de 9V;</li></ul>
<h3><strong>Seguran&ccedil;a MC-154A:</strong></h3><ul><li>Use EPI.</li></ul></div></div></body></html>`;
  const mc = normalizarPagina({ html: htmlMc, url: "https://www.eletrodex.net/mc-154a", fonte: "Eletrodex" }).produtos[0];
  conferir("eletrodex: lista depois de <ul> vazio e com '<80%' sem escapar", mc?.specifications.map((i) => i.nome), ["Display LCD", "Ambiente", "Alimentação"]);
  conferir("eletrodex: texto depois do '<80%' continua na descricao", /80% \(m[aá]ximo\)/.test(mc?.description ?? ""), true);
}

// Prado Automacao (11/10/2026): loja Shopify por tras de um site proprio. So o products.json
// responde; o produto inteiro sai dele, sem abrir pagina.
console.log("\n— catalogo do Shopify por tras de site proprio (Prado) —");
{
  const { produtoDoShopify, urlDoProdutoShopify } = await import("../src/lib/coleta/catalogo-shopify.js");
  const { catalogoShopifyDoEndereco } = await import("../src/lib/coleta/fornecedores.js");
  const molde = "https://pradoautomacaoindustrial.com.br/produto/{handle}";
  const item = {
    title: "Patim Com Aba 20mm",
    handle: "patim-com-aba-20mm",
    body_html: "<p>O <strong>Patim com Aba 20mm</strong> move com precis&atilde;o.</p><h3>Especifica&ccedil;&otilde;es:</h3><ul><li>Carga: 1.000 N</li><li>Material: a&ccedil;o</li><li>Fura&ccedil;&atilde;o: M5</li></ul>",
    vendor: "Prado Automação Industrial",
    product_type: "Patim - Padrão",
    tags: [],
    variants: [{ sku: "PPW20", price: "111.06", compare_at_price: null, available: true, grams: 250 }],
    images: [{ src: "https://cdn.shopify.com/s/files/1/0968/9441/9230/files/Foto_5.jpg?v=1" }, { src: "https://cdn.shopify.com/s/files/1/0968/9441/9230/files/Foto_1.jpg?v=1" }],
  };
  const p = produtoDoShopify(item, { urlProduto: molde, fonte: { name: "Prado" } });
  conferir("shopify: nome, codigo, categoria e marca do catalogo", [p.name, p.code, p.category, p.brand], ["Patim Com Aba 20mm", "PPW20", "Patim - Padrão", "Prado Automação Industrial"]);
  conferir("shopify: preco e o price quando nao ha compare_at", [p.prices.normal, p.prices.promotional], [111.06, null]);
  conferir("shopify: endereco e o do site publico, pelo handle", p.url, "https://pradoautomacaoindustrial.com.br/produto/patim-com-aba-20mm");
  conferir("shopify: fotos declaradas, na ordem", p.images.length, 2);
  conferir("shopify: descricao do body_html com acentos", /Patim com Aba 20mm move com precisão/.test(p.description), true);
  conferir("shopify: ficha da lista do body_html, mais o peso em gramas", p.specifications.map((l) => l.nome), ["Carga", "Material", "Furação", "Peso"]);
  conferir("shopify: disponivel sem quantidade", [p.stock.status, p.stock.quantity], ["AVAILABLE", null]);
  conferir("shopify: plataforma Shopify", p.plataforma.id, "shopify");

  const esgotado = produtoDoShopify({ ...item, variants: [{ sku: "X", price: "10.00", available: false, grams: 0 }] }, { urlProduto: molde });
  conferir("shopify: esgotado e zero, e grams 0 nao vira peso", [esgotado.stock.status, esgotado.stock.quantity, esgotado.specifications.some((l) => l.nome === "Peso")], ["OUT_OF_STOCK", 0, false]);

  const deTabela = produtoDoShopify({ ...item, variants: [{ sku: "X", price: "90.00", compare_at_price: "120.00", available: true }] }, { urlProduto: molde });
  conferir("shopify: compare_at maior e o normal; o cobrado vira promocional", [deTabela.prices.normal, deTabela.prices.promotional], [120, 90]);

  const porMm = produtoDoShopify({ ...item, title: "Eixo Suportado T 20mm", tags: ["mm"], variants: [{ sku: "SBR20", price: "0.24", available: true }] }, { urlProduto: molde });
  conferir("shopify: etiqueta mm = preco por milimetro, como a loja publica, com a unidade na ficha e na origem", [porMm.prices.normal, porMm.specifications.at(-1), /POR MILIMETRO/.test(porMm.origens.precoNormal)], [0.24, { nome: "Unidade de venda", valor: "milímetro (preço por mm)" }, true]);

  conferir("shopify: item sem titulo ou sem variante nao vira produto", [produtoDoShopify({ title: "", variants: [{}] }), produtoDoShopify({ title: "X", variants: [] })], [null, null]);
  conferir("shopify: molde sem handle nao inventa endereco", urlDoProdutoShopify(molde, null), null);

  // Documentos e ficha da base do site (Supabase), ligados pelo handle.
  const extras = new Map([[
    "patim-com-aba-20mm",
    {
      documentos: [
        { titulo: "Desenho técnico", url: "https://x.supabase.co/storage/v1/object/public/technical-files/drawings/PPW20.jpg" },
        { titulo: "Ficha Técnica", url: "https://x.supabase.co/storage/v1/object/public/product-pdfs/PPW20.pdf" },
      ],
      especificacoes: [{ nome: "Carga", valor: "9.999 N" }, { nome: "Rosca", valor: "M5" }],
    },
  ]]);
  const comExtras = produtoDoShopify(item, { urlProduto: molde, extras });
  conferir("shopify: documentos da base do site entram pelo handle", comExtras.documentos.map((d) => d.titulo), ["Desenho técnico", "Ficha Técnica"]);
  conferir("shopify: a ficha do body_html vence a da base no mesmo nome; o resto soma", comExtras.specifications.map((l) => `${l.nome}=${l.valor}`), ["Carga=1.000 N", "Material=aço", "Furação=M5", "Peso=250g", "Rosca=M5"]);
  conferir("shopify: handle sem extras fica sem documentos", produtoDoShopify({ ...item, handle: "outro" }, { urlProduto: molde, extras }).documentos, []);
  conferir("shopify: a regra casa o site publico, a loja.* e o myshopify", [
    catalogoShopifyDoEndereco("https://pradoautomacaoindustrial.com.br/")?.loja,
    catalogoShopifyDoEndereco("https://loja.pradoautomacaoindustrial.com.br/x")?.loja,
    catalogoShopifyDoEndereco("https://prado-automacao-industrial.myshopify.com/")?.loja,
    catalogoShopifyDoEndereco("https://www.eletrodex.net/"),
  ], ["prado-automacao-industrial.myshopify.com", "prado-automacao-industrial.myshopify.com", "prado-automacao-industrial.myshopify.com", null]);
}

// Kalatec (12/10/2026): o site institucional aponta a loja em outro dominio pelo robots.txt.
console.log("\n— loja em outro dominio apontada pelo robots.txt —");
{
  const { lojasApontadasPeloRobots } = await import("../src/lib/coleta/sitemap.js");
  const sitemaps = ["https://www.kalatec.com.br/sitemap_index.xml", "https://loja.kalatec.com.br/sitemap.xml", "https://blog.kalatec.com.br/sitemap_index.xml", "lixo"];
  conferir("robots: so a loja, sem o proprio site (com ou sem www) e sem o blog", lojasApontadasPeloRobots(sitemaps, "www.kalatec.com.br"), ["loja.kalatec.com.br"]);
  conferir("robots: cadastrado sem www tambem", lojasApontadasPeloRobots(sitemaps, "kalatec.com.br"), ["loja.kalatec.com.br"]);
  conferir("robots: sitemap no proprio dominio nao sugere nada", lojasApontadasPeloRobots(["https://www.eletrodex.net/sitemap.xml"], "www.eletrodex.net"), []);
  conferir("robots: sem sitemaps", lojasApontadasPeloRobots(null, "x.com"), []);
}

// Kalatec (Tray, 12/10/2026): idProduct 1 casava o indice de toda foto da loja, e a ficha
// "Caracteristicas do Motor de passo" (titulo com nome, sem dois-pontos) ficava de fora.
console.log("\n— Tray (Kalatec): galeria com id pequeno e ficha com nome no titulo —");
{
  const htmlKalatec = `<html><head>
<script type="application/ld+json">{"@type":"Product","name":"Motor de Passo Nema 23","sku":"1","image":"https://images.tcdn.com.br/img/img_prod/706232/motor_nema_23_1_20251016165327_254cce8d4585.jpg","description":"Motor de passo.","offers":{"price":"159.00","availability":"http://schema.org/InStock"}}</script>
<script>dataLayer = [{"idProduct":"1","nameProduct":"Motor de Passo Nema 23","category":"Nema 23","price":"159.00","reference":"3939","availability":"YES"}];</script></head><body>
<div itemscope itemtype="http://schema.org/Product"><h1 itemprop="name">Motor de Passo Nema 23</h1>
<img src="https://images.tcdn.com.br/img/img_prod/706232/90_motor_nema_23_1_4_20190625140319.png">
<img data-src="https://images.tcdn.com.br/img/img_prod/706232/180_rolamento_linear_kh2030_pp_1_20251031162739_ee8c27cf2d8d.jpg" alt="Rolamento Linear">
<img data-src="https://images.tcdn.com.br/img/img_prod/706232/180_curso_de_clp_1_20251108181732_b581455112d6.jpg" alt="Curso">
<table><tr><td>Modelo</td><td>KTC-HT23-400-K</td></tr><tr><td>Marca</td><td>Kalatec</td></tr></table>
<div class="description"><p>Motor de passo de 19 Kg.cm.</p><p>Caracter&iacute;sticas do Motor de passo</p><p>- Motor de Passo Nema 23</p><p>- C&oacute;digo Kalatec: KTC-HT23-400-K</p><p>- Flange: 56,0mm</p><p>- Torque Est&aacute;tico Bipolar: 1.9Nm (19 Kgf.cm)</p><p>- Quantidade de Fios: 08</p></div>
</div></body></html>`;
  const k = normalizarPagina({ html: htmlKalatec, url: "https://loja.kalatec.com.br/motor-de-passo/motor-de-passo-2nm-nema23", fonte: "Kalatec" }).produtos[0];
  const arquivos = k.images.map((u) => u.split("/").pop());
  conferir("kalatec: miniaturas 180_ de outros produtos (indice _1_ + carimbo) ficam de fora", arquivos.some((a) => /rolamento|curso/.test(a)), false);
  conferir("kalatec: a foto principal e a do proprio produto (_1_4_) ficam", [arquivos.some((a) => /^motor_nema_23_1_2025/.test(a)), arquivos.some((a) => /motor_nema_23_1_4_/.test(a))], [true, true]);
  conferir("kalatec: ficha = tabela + lista da descricao com titulo com nome", k.specifications.map((l) => l.nome), ["Modelo", "Marca", null, "Código Kalatec", "Flange", "Torque Estático Bipolar", "Quantidade de Fios"]);
}

// Gasto da geracao com IA (pedido do dono em 12/10/2026): tokens e reais de descricao, titulo, SEO e categorias.
console.log("\n— Gasto da geracao com IA —");
{
  const { novoGasto, somarAoGasto, resumoDoGasto } = await import("../src/lib/ia/gasto.js");
  conferir("gasto: sem chamada nenhuma, nada a mostrar", resumoDoGasto(novoGasto()), null);

  // A descricao com a segunda chamada (o paragrafo longo volta para encurtar): as duas somam.
  const g = novoGasto();
  somarAoGasto(g, { model: "claude-opus-5", usage: { input_tokens: 6000, output_tokens: 1000 } }, "claude-opus-5");
  somarAoGasto(g, { model: "claude-opus-5", usage: { input_tokens: 4000, output_tokens: 1000 } }, "claude-opus-5");
  somarAoGasto(g, null, "claude-opus-5"); // erro de rede: nao custa nada
  const r = resumoDoGasto(g);
  // 10.000 de entrada a US$ 5/milhao + 2.000 de saida a US$ 25/milhao = US$ 0,10; a R$ 6,00 = R$ 0,60.
  conferir("gasto: duas chamadas somam tokens e custo", [r.modelo, r.chamadas, r.entrada, r.saida, r.total, r.usd, r.brl], ["Claude Opus 5", 2, 10000, 2000, 12000, 0.1, 0.6]);

  // Cache: o lido e o gravado entram no total de entrada, mas no custo com o peso da Anthropic (0,1x e 1,25x).
  const c = novoGasto();
  somarAoGasto(c, { model: "claude-opus-5", usage: { input_tokens: 0, cache_read_input_tokens: 1000000, cache_creation_input_tokens: 0, output_tokens: 0 } });
  conferir("gasto: 1 milhao lido do cache custa 0,1x (US$ 0,50)", [resumoDoGasto(c).entrada, resumoDoGasto(c).usd], [1000000, 0.5]);

  // Modelo sem preco cadastrado: a tela diz "preco nao cadastrado", nunca R$ 0,00.
  const s = novoGasto();
  somarAoGasto(s, { model: "claude-modelo-novo", usage: { input_tokens: 10, output_tokens: 10 } });
  conferir("gasto: modelo sem preco devolve reais nulo", [resumoDoGasto(s).modelo, resumoDoGasto(s).brl], ["claude-modelo-novo", null]);

  // Total do produto (12/10/2026): o salvo + o desta edicao, e o que o navegador manda no Salvar.
  const { somarResumos, gastoDoFormulario } = await import("../src/lib/ia/gasto.js");
  const salvo = { modelo: "Claude Opus 5", chamadas: 1, entrada: 100, saida: 50, total: 150, usd: 0.01, brl: 0.06, atualizadoEm: "2026-10-12T10:00:00.000Z" };
  const soma = somarResumos(salvo, r);
  conferir("produto: salvo + edicao somam", [soma.chamadas, soma.entrada, soma.saida, soma.total, soma.usd, soma.brl], [3, 10100, 2050, 12150, 0.11, 0.66]);
  conferir("produto: sem salvo, fica a edicao; sem edicao, fica o salvo", [somarResumos(null, r) === r, somarResumos(salvo, null) === salvo], [true, true]);
  conferir("produto: reais nulo de um lado deixa o total em nulo (nunca soma parcial)", somarResumos(salvo, { ...r, brl: null }).brl, null);
  conferir("produto: o mesmo modelo nao se repete no nome", somarResumos(salvo, r).modelo, "Claude Opus 5");
  conferir("formulario: gasto valido e lido", gastoDoFormulario(JSON.stringify(r)), { modelo: "Claude Opus 5", chamadas: 2, entrada: 10000, saida: 2000, total: 12000, usd: 0.1, brl: 0.6 });
  conferir("formulario: vazio, texto, negativo e absurdo viram nada (o Salvar nao falha)", [
    gastoDoFormulario(""),
    gastoDoFormulario("abc"),
    gastoDoFormulario(JSON.stringify({ ...r, entrada: -5 })),
    gastoDoFormulario(JSON.stringify({ ...r, brl: 1e9 })),
    gastoDoFormulario(JSON.stringify({ ...r, chamadas: 0 })),
    gastoDoFormulario(null),
  ], [null, null, null, null, null, null]);
}

// Neoyama e Karimex (12/10/2026): cadastrada sem www e redirecionada para ele (ou o contrario) nao e outro dominio.
console.log("\n— redirecionamento entre o dominio e o www —");
{
  const { mesmoSiteSemWww } = await import("../src/lib/coleta/http.js");
  const { mesmaOrigem } = await import("../src/lib/coleta/descobrir.js");
  conferir("www: apex e www sao o mesmo site, nos dois sentidos, sem caixa", [mesmoSiteSemWww("neoyama.com.br", "www.neoyama.com.br"), mesmoSiteSemWww("WWW.Karimex.com.br", "karimex.com.br"), mesmoSiteSemWww("loja.com.br", "loja.com.br")], [true, true, true]);
  conferir("www: outro nome continua outro dominio (subdominio, sufixo, outro site, vazio)", [mesmoSiteSemWww("loja.com.br", "loja.com.br.atacante.com"), mesmoSiteSemWww("loja.kalatec.com.br", "www.kalatec.com.br"), mesmoSiteSemWww("a.com.br", "b.com.br"), mesmoSiteSemWww("", "")], [false, false, false, false]);
}

// Eletropecas (ASP.NET, tema novo, 13/10/2026): codigo fora do span do rotulo, descricao sem abas, breadcrumb com
// outras classes, listagem com cards `produto__item` e o menu "Controle Bimanual" que virava documento.
console.log("\n— ASP.NET, tema novo (Eletropecas) —");
{
  const detalhe = `<html><body><nav><a href="/produtos/controladores/controles-diversos/controle--bimanual">Controle Bimanual</a></nav>
<ul class="loja__breadcrumb py-4 d-flex"><li><a href="/">Home</a></li><li><a href="/produtos/resistores"><p class="content ">Resistores </p></a></li><li><a href="/produtos/resistores/resistores-de-fio"><p class="content ">Resistores de Fio </p></a></li><li><p class="content active">Resistor de Fio Axial 20W 15 K</p></li></ul>
<div itemscope itemtype="http://schema.org/Product"><meta itemprop="name" content="Resistor de Fio Axial 20W 15 K">
<img data-src="https://www.eletropecas.com/_uploads/ProdutoDestaque/ProdutoDestaque_2504_orig.jpg" data-zoom-image="x">
<div class="detalhe_informacoes detalhe__produto--info"><h1 itemprop="name" class="t">Resistor de Fio Axial 20W 15 K</h1>
<div class="detalhe_informacoes_cod_ref"><p class="fs-7">
 Cód: <span class="text-dark">2948</span>
</p><p>Marca: <span class="text-dark" itemprop="brand" content="Importado">Importado</span></p></div>
<div itemprop="offers" itemscope itemtype="http://schema.org/Offer"><meta itemprop="price" content="19.80"/><a class="comprar-btn">comprar</a></div></div>
<input type="hidden" value="2948" id="pcod" /></div>
<div class="col-12 produto__descricao"><h2>Descri&#231;&#227;o</h2><p>Resistor de fio axial.</p><p>Marcas Dispon&#237;veis: ROYALOHM, TYOHM.</p></div></body></html>`;
  const e = normalizarPagina({ html: detalhe, url: "https://www.eletropecas.com/resistor-de-fio-axial-20w-15-k/p", fonte: "Eletropecas" }).produtos[0];
  conferir("eletropecas: codigo, marca, preco e categoria do tema novo", [e?.code, e?.brand, e?.prices.normal, e?.category], ["2948", "Importado", 19.8, "Resistores > Resistores de Fio"]);
  conferir("eletropecas: descricao do bloco produto__descricao, sem o titulo", [/Marcas Dispon/.test(e?.description ?? ""), /^Descri/.test(e?.description ?? "")], [true, false]);
  conferir("eletropecas: o menu Controle Bimanual nao e documento", e?.documentos.length, 0);
  conferir("eletropecas: manual de verdade ainda e documento", normalizarPagina({ html: detalhe.replace("</body>", `<a href="/arquivos/manual-do-resistor.pdf">Manual do resistor</a></body>`), url: "https://www.eletropecas.com/resistor-de-fio-axial-20w-15-k/p", fonte: "Eletropecas" }).produtos[0]?.documentos.length, 1);
  const vitrine = `<html><body><div class="produto__item position-relative" itemscope itemtype="https://schema.org/Product"><figure itemprop="image"><meta itemprop="contentUrl" content="https://www.eletropecas.com/_uploads/ProdutoDestaque/ProdutoDestaque_17422_detalhe.jpg"></figure><p>Cód: 24547</p><a href="/suporte-para-bateria-clip-01/p"><h3>Suporte para Bateria CLIP-01</h3></a><meta itemprop="price" content="5.19"></div></body></html>`;
  const l = normalizarPagina({ html: vitrine, url: "https://www.eletropecas.com/produtos/baterias-e-pilhas/suporte-para-pilhas/clip-01", fonte: "Eletropecas" });
  conferir("eletropecas: listagem com cards produto__item nao vira produto", [l.produtos.length, l.motivo], [0, "listagem de produtos, nao pagina de produto"]);
}

// Eletropecas (13/10/2026): "5% de desconto no pix e no boleto" sem o valor, e o "Sobre o produto" na descricao.
console.log("\n— Eletropecas: desconto no pix calculado e Sobre o produto —");
{
  const pagina = (sobre, bloco) => `<html><body><ul class="loja__breadcrumb py-4"><li><p class="content ">Chaves </p></li><li><p class="content active">Chave</p></li></ul>
<div itemscope itemtype="http://schema.org/Product"><meta itemprop="name" content="Chave de Fenda">
<div class="detalhe_informacoes detalhe__produto--info"><h1 itemprop="name">Chave de Fenda</h1>
<div class="detalhe_informacoes_cod_ref"><p>Cód: <span class="text-dark">20375</span></p></div>
<div itemprop="offers" itemscope itemtype="http://schema.org/Offer"><meta itemprop="price" content="141.00"/>
<div class="produto__valor__parcelas"><div class="produto__boleto"></div><div class="produto__pix"></div><p> 5% de desconto no pix e no boleto bancário</p></div>
<a class="comprar-btn">comprar</a></div></div>
<p>Sobre o produto:</p><p itemprop="description" class="fs-7">${sobre}</p></div>
<div class="produto__descricao"><h2>Descri&#231;&#227;o</h2>${bloco}</div></body></html>`;
  const a = normalizarPagina({ html: pagina("Chave de fenda com cabo rotativo em PVC.", "<p>Chave de Fenda Piergiacomi PG1-2</p><p>Cabo anatomico</p>"), url: "https://www.eletropecas.com/chave/p", fonte: "Eletropecas" }).produtos[0];
  conferir("eletropecas: normal e o de tabela; o desconto de 5% do pix vira o promocional calculado (141 -> 133,95)", [a.prices.normal, a.prices.promotional], [141, 133.95]);
  conferir("eletropecas: a origem diz que o a vista foi calculado", /^calculado: 5% de desconto no pix e no boleto/.test(a.origens.precoPromocional ?? ""), true);
  conferir("eletropecas: Sobre o produto abre a descricao, antes do bloco Descricao", [/^Sobre o produto:/.test(a.description), a.description.indexOf("cabo rotativo") < a.description.indexOf("Piergiacomi")], [true, true]);
  const repetido = normalizarPagina({ html: pagina("Chave de Fenda Piergiacomi PG1-2.", "<p>Chave de Fenda Piergiacomi PG1-2</p><p>Cabo anatomico</p>"), url: "https://www.eletropecas.com/chave/p", fonte: "Eletropecas" }).produtos[0];
  conferir("eletropecas: Sobre o produto que o bloco ja repete nao duplica a descricao", [repetido.description.split("Piergiacomi").length - 1, /^Sobre o produto/.test(repetido.description)], [1, false]);
  const centavo = normalizarPagina({ html: pagina("x", "<p>y</p>").replace("141.00", "19.80"), url: "https://www.eletropecas.com/chave/p", fonte: "Eletropecas" }).produtos[0];
  conferir("eletropecas: centavos inteiros, meio para cima (19,80 -> 18,81)", centavo.prices.promotional, 18.81);
}

// Tespo (13/10/2026): catalogo de esteiras porta-cabos em PDF, cada item em DUAS linhas de texto.
console.log("\n— catalogo de esteiras em PDF (Tespo) —");
{
  const { esteirasDoPdf } = await import("../src/lib/coleta/arquivos.js");
  const texto = [
    "MATRIZARIA | INJETADOS", "CÓDIGO DESCRIÇÃO MEDIDA INTERNA	(Li x Ai) MEDIDA EXTERNA (Le x Ae)",
    "03154 ESTEIRA PORTA CABOS", "T10.10.R18mm 10,6X10,6 15X13 46 18 20 49 107gr",
    "04228 ESTEIRA PORTA CABOS", "T75.60.R130 75x60 110x80 97 10 2760gr",
    "03641 ESTEIRA PORTA CABOS", "T100.35 R75mm C/ REFORÇO 100x35 124x50 185 75 56 18 1900gr",
    "04012 ESTEIRA PORTA CABOS", "T15.18.R38 25,3X23 100 38 32 260gr",
    "03155 CJ. TERMINAL T10.10 10,6X10,6 15X13", "Disponível em 3 raios.",
    "03154 ESTEIRA PORTA CABOS", "T10.10.R18mm 10,6X10,6 15X13 46 18 20 49 107gr",
    "Separador de cabos (Cód. 03860)", "99910.2166",
  ].join("\n");
  const itens = esteirasDoPdf(texto);
  const por = (c) => itens.find((i) => i.sku === c);
  const ficha = (c) => Object.fromEntries(por(c).especificacoes.map((l) => [l.nome, l.valor]));
  conferir("tespo: um item por codigo (o repetido entra uma vez; acessorio citado no texto e telefone ficam de fora)", itens.map((i) => i.sku), ["03154", "04228", "03641", "04012", "03155"]);
  conferir("tespo: nome = tipo + modelo, da segunda linha", [por("03154").desc, por("03641").desc], ["ESTEIRA PORTA CABOS T10.10.R18mm", "ESTEIRA PORTA CABOS T100.35 R75mm C/ REFORÇO"]);
  conferir("tespo: 4 numeros = altura, raio, passo e elos; peso por metro", ficha("03154"), { "Medida interna (Li x Ai)": "10,6 x 10,6 mm", "Medida externa (Le x Ae)": "15 x 13 mm", "Altura (H)": "46 mm", "Raio (R)": "18 mm", "Passo (P)": "20 mm", "Elos por metro": "49", "Peso por metro": "107 g" });
  conferir("tespo: 2 numeros = so passo e elos (altura e raio nao inventados)", ficha("04228"), { "Medida interna (Li x Ai)": "75 x 60 mm", "Medida externa (Le x Ae)": "110 x 80 mm", "Passo (P)": "97 mm", "Elos por metro": "10", "Peso por metro": "2760 g" });
  conferir("tespo: uma medida so, o modelo diz se e interna ou externa; 3 numeros sao ambiguos e ficam de fora", ficha("04012"), { "Medida externa (Le x Ae)": "25,3 x 23 mm", "Peso por metro": "260 g" });
  conferir("tespo: terminal numa linha so, sem peso", [por("03155").categoria, ficha("03155")], ["Terminal de fixação", { "Medida interna (Li x Ai)": "10,6 x 10,6 mm", "Medida externa (Le x Ae)": "15 x 13 mm" }]);
  conferir("tespo: o link de cada item e a pagina inicial do site (nao ha pagina por produto)", itens.map((i) => i.urlDoFornecedor), Array(itens.length).fill("https://www.tespoinjetados.com.br/"));
  conferir("tespo: marca Tespo e sem o cabecalho MEDIDA INTERNA nao le (outro catalogo)", [por("03154").marca, esteirasDoPdf("03154 ESTEIRA PORTA CABOS\nT10.10 10,6X10,6 15X13 46 18 20 49 107gr")], ["Tespo", []]);
}

// Kalatec (13/10/2026): mesmo codigo em produtos diferentes e produto montado pelo catalogo quando a pagina nao traz dado.
console.log("\n— Kalatec: codigo repetido e produto do catalogo —");
{
  const { chaveSemColisao } = await import("../src/lib/coleta/linha.js");
  const { produtoDoItemDoCatalogo } = await import("../src/lib/coleta/catalogo.js");
  const a = { url: "https://loja.kalatec.com.br/guia-linear/guia-linear-kalatec-hr-15-300mm", nome: "KR15-300 - GUIA LINEAR" };
  const b = { url: "https://loja.kalatec.com.br/guia-linear/guia-linear-hr-15-600mm", nome: "KR15-600 - GUIA LINEAR" };
  conferir("chave: sem dono, a chave fica", chaveSemColisao("codigo:4560", b, undefined), "codigo:4560");
  conferir("chave: o mesmo produto (mesmo endereco) continua com a chave, com barra no fim e sem caixa", chaveSemColisao("codigo:4560", { ...a, url: a.url.toUpperCase() + "/" }, a), "codigo:4560");
  conferir("chave: endereco e nome diferentes = outro produto, com o ultimo trecho do endereco", chaveSemColisao("codigo:4560", b, a), "codigo:4560#guia-linear-hr-15-600mm");
  conferir("chave: mesmo nome por dois enderecos (Usinainfo) continua um produto so", chaveSemColisao("codigo:09109", { url: "https://x.com/a/p-1", nome: "Sensor X" }, { url: "https://x.com/b/p-1", nome: "SENSOR  x" }), "codigo:09109");
  conferir("chave: sem endereco nao separa; chave que nao e de codigo nao muda", [chaveSemColisao("codigo:1", { url: null, nome: "A" }, a), chaveSemColisao("url:https://x/y", b, a)], ["codigo:1", "url:https://x/y"]);
  const item = { id: "107", name: "G213V- DRIVE GECKO", price: "690.00", promotional_price: "0", available: "1", brand: "Gecko Drive ", model: "G213V", ean: "", ncm: "85044029", url: { https: "https://loja.kalatec.com.br/driver/gecko-g213v" }, ProductImage: [{ https: "https://images.tcdn.com.br/img/a.jpg" }] };
  const p = produtoDoItemDoCatalogo(item, "https://loja.kalatec.com.br");
  conferir("catalogo: nome, preco, marca, NCM, foto e endereco do item", [p.name, p.prices.normal, p.prices.promotional, p.brand, p.ncm, p.images.length, p.url], ["G213V- DRIVE GECKO", 690, null, "Gecko Drive", "85044029", 1, "https://loja.kalatec.com.br/driver/gecko-g213v"]);
  conferir("catalogo: sem codigo vira N/A com a origem dizendo; disponivel no catalogo", [p.code, p.origens.code, p.stock.status], ["N/A", "sem codigo no catalogo nem na pagina — marcado N/A", "AVAILABLE"]);
  // Desativado pela loja (23/10/2026, Opcao 1 do dono): a pagina leva a "Produto nao encontrado", entao nao vira produto.
  conferir("catalogo: produto desativado pela loja (available 0) nao vira produto", produtoDoItemDoCatalogo({ ...item, available: "0" }, "https://loja.kalatec.com.br"), null);
  conferir("catalogo: preco zero fica sem preco (e o teste de validade do concorrente o descarta); sem nome ou endereco nao vira produto", [produtoDoItemDoCatalogo({ ...item, price: "0.00" }, "https://loja.kalatec.com.br").prices.normal, produtoDoItemDoCatalogo({ ...item, name: "" }, "https://x.com"), produtoDoItemDoCatalogo({ name: "X" }, "https://x.com")], [null, null, null]);
}

// Tespo (13/10/2026): documentos de cada esteira no site (desenho da serie em PDF e modelo 3D em STEP).
console.log("\n— Tespo: documentos das esteiras no site —");
{
  const { serieDaEsteira, serieDoItem, documentosDasEsteirasDoSite, juntarDocumentosDasEsteiras } = await import("../src/lib/coleta/tespo.js");
  conferir("tespo: serie pelo nome do arquivo ou do modelo (CR e F. normalizados; outro PDF nao e serie)", [serieDaEsteira("T10.10"), serieDaEsteira("t100.25 cr"), serieDaEsteira("F.T50.35"), serieDaEsteira("T75.35 CR"), serieDaEsteira("TS010"), serieDaEsteira("Prensa-Cabo")], ["T10.10", "T100.25CR", "F.T50.35", "T75.35CR", null, null]);
  conferir("tespo: serie do item: C/ REFORCO e C/R viram CR", [serieDoItem("ESTEIRA PORTA CABOS T100.35 R75mm C/ REFORÇO"), serieDoItem("ESTEIRA PORTA CABOS T50.25 C/R"), serieDoItem("ESTEIRA PORTA CABOS T10.10.R18mm"), serieDoItem("CJ. TERMINAL T10.10"), serieDoItem("CONJUNTO TERMINAL 75X50 103X65")], ["T100.35CR", "T50.25CR", "T10.10", "T10.10", null]);
  const casa = `<h1><strong>LINHA 10</strong></h1><img src="https://www.tespoinjetados.com.br/wp-content/uploads/2021/11/Linha-10.jpg"><a href="https://www.tespoinjetados.com.br/wp-content/uploads/2016/04/T10.10.pdf">T10.10</a>`
    + `<h1>LINHA 25 REFORÇO</h1><img src="/wp-content/uploads/2021/11/Linha-25CR.jpg"><a href="/wp-content/uploads/2023/07/T100.25CR.pdf">x</a><a href="/wp-content/uploads/2022/06/TS20.pdf">caixa</a><a href="/wp-content/uploads/2016/05/corredica-central-03572.pdf">corredica</a>`;
  const baixa = `<table><tr><td><h3>Modelo T10.10</h3></td><td><a href="/wp-content/uploads/2021/11/Elo-T10.10.stp">e</a></td><td><a href="/wp-content/uploads/2022/09/Ponteiras-10.10.stp">p</a></td></tr></table>`
    + `<table><tr><td><h3>Modelo T50.25 e T50.25CR</h3></td><td><a href="/wp-content/uploads/2021/11/Elo-T50.25.stp">e</a></td><td><a href="/wp-content/uploads/2022/09/Ponteiras-50.25.stp">p</a></td></tr></table>`;
  const { series, avisos } = await documentosDasEsteirasDoSite({ paginas: { "/": casa, "/downloads/": baixa } });
  conferir("tespo: so PDF de esteira entra (caixa e corredica ficam de fora); STEP de elo e ponteira por modelo", [[...series.keys()].sort(), series.get("T10.10").desenho.titulo, series.get("T10.10").elo.url.split("/").pop(), series.get("T10.10").ponteira.url.split("/").pop(), avisos], [["T10.10", "T100.25CR", "T50.25", "T50.25CR"], "Desenho da série T10.10 (PDF)", "Elo-T10.10.stp", "Ponteiras-10.10.stp", []]);
  conferir("tespo: Modelo A e B vale para as duas series", [series.get("T50.25").elo.url === series.get("T50.25CR").elo.url, series.get("T100.25CR").elo], [true, undefined]);
  const itens = [
    { sku: "1", desc: "ESTEIRA PORTA CABOS T10.10.R18mm", especificacoes: [] },
    { sku: "2", desc: "CJ. TERMINAL T10.10", especificacoes: [] },
    { sku: "3", desc: "ESTEIRA PORTA CABOS T50.25 C/R", especificacoes: [] },
    { sku: "4", desc: "CONJUNTO TERMINAL", especificacoes: [{ nome: "Medida interna (Li x Ai)", valor: "50 x 25 mm" }] },
    { sku: "5", desc: "ESTEIRA PORTA CABOS T999.99", especificacoes: [] },
  ];
  const comDoc = juntarDocumentosDasEsteiras(itens, series);
  conferir("tespo: esteira leva desenho + elo; terminal, desenho + ponteira; terminal sem modelo usa a medida interna; serie inexistente fica sem", [comDoc, itens.map((i) => (i.documentos ?? []).map((d) => (/desenho/i.test(d.titulo) ? "desenho" : /ponteira/i.test(d.titulo) ? "ponteira" : "elo")).join("+"))], [4, ["desenho+elo", "desenho+ponteira", "elo", "ponteira", ""]]);
  conferir("tespo: a foto da LINHA do site vale para as series do bloco (a primeira imagem, e so ela)", [series.get("T10.10").foto, series.get("T100.25CR").foto], ["https://www.tespoinjetados.com.br/wp-content/uploads/2021/11/Linha-10.jpg", "https://www.tespoinjetados.com.br/wp-content/uploads/2021/11/Linha-25CR.jpg"]);
  const comFoto = [{ sku: "1", desc: "ESTEIRA PORTA CABOS T10.10.R18mm", especificacoes: [] }];
  juntarDocumentosDasEsteiras(comFoto, series);
  conferir("tespo: o item ganha a foto da linha em `imagens`", comFoto[0].imagens, ["https://www.tespoinjetados.com.br/wp-content/uploads/2021/11/Linha-10.jpg"]);
  const { linkDoDocumento } = await import("../src/lib/documentoMercados.js");
  conferir("link: PDF e imagem abrem no endereco da loja; STEP, IGES e ZIP baixam pelo servidor", [linkDoDocumento({ url: "https://x.com/a.pdf" }), linkDoDocumento({ url: "https://x.com/Elo-T10.10.stp", titulo: "Modelo 3D do elo (STEP)" }).baixar, linkDoDocumento({ url: "https://x.com/a.igs?v=2" }).baixar, linkDoDocumento({ url: "https://x.com/a.zip" }).baixar, linkDoDocumento({ url: "https://x.com/a.jpg" }).baixar], [{ href: "https://x.com/a.pdf", baixar: false }, true, true, true, false]);
  conferir("link: o endereco da loja vai codificado no parametro `url` e o titulo junto", linkDoDocumento({ url: "https://x.com/Elo T.stp", titulo: "Modelo 3D" }).href, "/api/mercados/documento?url=https%3A%2F%2Fx.com%2FElo+T.stp&titulo=Modelo+3D");
  const falha = await documentosDasEsteirasDoSite({ paginas: { "/": "", "/downloads/": "" } });
  conferir("tespo: site sem documento de esteira vira aviso, nunca erro", [falha.series.size, falha.avisos.length], [0, 1]);
}

// Easytronics (14/10/2026): o item "Manuais" do menu (categoria do proprio site) virava documento do Arduino Uno.
console.log("\n— link de menu nao e documento —");
{
  const pagina = (links) => `<html><head><script type="application/ld+json">{"@type":"Product","name":"Arduino Uno","sku":"1041","offers":{"price":"79.90"}}</script></head><body>${links}</body></html>`;
  const docs = (links) => normalizarPagina({ html: pagina(links), url: "https://www.easytronics.com.br/arduino-uno", fonte: "Easytronics" }).produtos[0].documentos.map((d) => d.titulo);
  conferir("documento: menu Manuais (categoria do proprio site, sem extensao) nao e documento, com ou sem www", [docs(`<a href="/eletrica-eletronica/ferramentas/manuais">Manuais</a>`), docs(`<a href="https://easytronics.com.br/ferramentas/datasheet-e-manuais">Datasheet</a>`)], [[], []]);
  conferir("documento: arquivo de verdade segue valendo (extensao, anexo e dominio de arquivo)", [docs(`<a href="/arquivos/manual.pdf">Manuais</a>`), docs(`<a href="/index.php?controller=attachment&id_attachment=101">Datasheet</a>`), docs(`<a href="https://drive.google.com/file/d/abc/view">Manual de instrucoes</a>`)], [["Manuais"], ["Datasheet"], ["Manual de instrucoes"]]);
}

// Rascunho automatico do cadastro e preferencia da descricao (13/10/2026): o que vai para o localStorage e o que volta.
console.log("\n— Rascunho do cadastro e preferencia da descricao —");
{
  const { chaveDoRascunho, camposParaRascunho, montarRascunho, lerRascunho, VALIDADE_DO_TEXTO_MS, VALIDADE_DOS_ARQUIVOS_MS } = await import("../src/lib/rascunhoDoCadastro.js");
  const { conferirPreferenciaDaDescricao } = await import("../src/lib/preferenciaDaDescricao.js");
  const agora = Date.parse("2026-10-13T15:00:00.000Z");
  const antes = (ms) => agora - ms;

  conferir("chave: um por produto, um para o novo, um por clone", [
    chaveDoRascunho({ produtoId: "p1" }),
    chaveDoRascunho({}),
    chaveDoRascunho({ cloneId: "c9" }),
    chaveDoRascunho({ produtoId: "p1", cloneId: "c9" }),
  ], ["rise:rascunho:produto:p1", "rise:rascunho:produto:novo", "rise:rascunho:clone:c9", "rise:rascunho:produto:p1"]);

  conferir("campos: so texto e ativo; estado do React, arquivo e lixo ficam de fora", camposParaRascunho({
    tituloBase: "Placa", ativo: true, tipo: "COMPOSICAO", fornecedoresRascunho: "[]", imagensDoLote: "[]",
    loteTemporario: "x", gastoIA: "", arquivo: { name: "a.pdf" }, numero: 5, enorme: "a".repeat(200_001),
  }), { tituloBase: "Placa", ativo: true });

  const estado = {
    tipo: "COMPOSICAO", pecas: [{ componenteId: "a", quantidade: 2 }], fornecedores: [{ id: "f1" }], concorrentes: [],
    lote: "lote-1", imagens: [{ base: "foto1", finalizada: true }], preservadas: [], reservaExcluida: ["r1"],
    temporarios: [{ arquivo: "d.pdf" }], documentosExcluidos: ["x"], gastoDaEdicao: { chamadas: 1 },
  };
  const montado = montarRascunho({ campos: { tituloBase: "Placa", sku: "100" }, estado, baseEm: "2026-10-13T10:00:00.000Z", agora: antes(60_000) });
  const lido = lerRascunho(JSON.stringify(montado), { agora, baseEmAtual: "2026-10-13T10:00:00.000Z" });
  conferir("rascunho: ida e volta guarda tudo o que se edita", [lido.campos, lido.tipo, lido.pecas, lido.fornecedores, lido.fotos.lote, lido.fotos.imagens, lido.fotos.reservaExcluida, lido.temporarios, lido.documentosExcluidos, lido.gastoDaEdicao], [
    { tituloBase: "Placa", sku: "100" }, "COMPOSICAO", [{ componenteId: "a", quantidade: 2 }], [{ id: "f1" }], "lote-1", [{ base: "foto1", finalizada: true }], ["r1"], [{ arquivo: "d.pdf" }], ["x"], { chamadas: 1 },
  ]);
  conferir("rascunho recente: sem aviso de produto mudado nem de arquivo expirado", [lido.produtoMudou, lido.arquivosExpiraram], [false, false]);
  conferir("rascunho: produto salvo de novo depois dele avisa", lerRascunho(JSON.stringify(montado), { agora, baseEmAtual: "2026-10-13T14:00:00.000Z" }).produtoMudou, true);
  conferir("rascunho: cadastro novo (sem baseEm) nunca acusa produto mudado", lerRascunho(JSON.stringify({ ...montado, baseEm: null }), { agora, baseEmAtual: null }).produtoMudou, false);

  // Mais de 20 h: o texto volta, as fotos e os documentos enviados nao (o lote temporario some com 24 h).
  const velho = lerRascunho(JSON.stringify({ ...montado, salvoEm: new Date(antes(VALIDADE_DOS_ARQUIVOS_MS + 60_000)).toISOString() }), { agora });
  conferir("rascunho de mais de 20 h: texto fica, fotos e documentos saem", [velho.campos.tituloBase, velho.arquivosExpiraram, velho.fotos.lote, velho.fotos.imagens, velho.temporarios], ["Placa", true, "", [], []]);

  conferir("rascunho invalido vira nada", [
    lerRascunho(null, { agora }),
    lerRascunho("", { agora }),
    lerRascunho("{nao e json", { agora }),
    lerRascunho(JSON.stringify({ ...montado, v: 2 }), { agora }),
    lerRascunho(JSON.stringify({ ...montado, salvoEm: new Date(antes(VALIDADE_DO_TEXTO_MS + 60_000)).toISOString() }), { agora }),
    lerRascunho(JSON.stringify({ ...montado, salvoEm: new Date(agora + 3_600_000).toISOString() }), { agora }),
    lerRascunho(JSON.stringify({ ...montado, salvoEm: "ontem" }), { agora }),
    lerRascunho(JSON.stringify({ ...montado, campos: {} }), { agora }),
    lerRascunho(JSON.stringify([1, 2]), { agora }),
  ], [null, null, null, null, null, null, null, null, null]);

  const torto = lerRascunho(JSON.stringify({ ...montado, pecas: "x", fornecedores: null, tipo: "OUTRO", fotos: { lote: 5, imagens: [1, { base: "ok" }, { base: 7 }] }, gastoDaEdicao: [1] }), { agora });
  conferir("rascunho com formas erradas: listas viram vazias e o tipo volta a Simples", [torto.pecas, torto.fornecedores, torto.tipo, torto.fotos.lote, torto.fotos.imagens, torto.gastoDaEdicao], [[], [], "SIMPLES", "", [{ base: "ok" }], null]);

  conferir("preferencia: modelo da lista e prompt em texto passam", conferirPreferenciaDaDescricao({ promptId: "abc", modeloId: "claude-opus-5-5" }), { promptId: "abc", modeloId: "claude-opus-5-5" });
  const nada = { promptId: null, modeloId: null };
  conferir("preferencia: modelo que saiu da lista, prompt vazio ou enorme e lixo viram nada", [
    conferirPreferenciaDaDescricao({ promptId: "", modeloId: "gpt-3" }),
    conferirPreferenciaDaDescricao({ promptId: "a".repeat(101), modeloId: 5 }),
    conferirPreferenciaDaDescricao(null),
    conferirPreferenciaDaDescricao("texto"),
    conferirPreferenciaDaDescricao([1]),
  ], [nada, nada, nada, nada, nada]);
}

// Patolastore (VTEX, 20/10/2026): a Secao e o caminho de uma categoria; o filtro de texto nao a achava.
console.log("\n— categoria de loja VTEX —");
{
  const { categoriaDaVtex, totalDoCabecalhoResources } = await import("../src/lib/coleta/vtex.js");
  conferir("vtex: a Secao vira o caminho da categoria (barras, endereco completo, subcategoria)", [categoriaDaVtex("gabinetes"), categoriaDaVtex(" /gabinetes/ "), categoriaDaVtex("https://www.patolastore.com.br/gabinetes"), categoriaDaVtex("gabinetes/linha-pbo")], ["gabinetes", "gabinetes", "gabinetes", "gabinetes/linha-pbo"]);
  conferir("vtex: vazio, produto /p e texto que nao e caminho nao sao categoria", [categoriaDaVtex(""), categoriaDaVtex(null), categoriaDaVtex("/caixa-patola/p"), categoriaDaVtex("gabinete gamer"), categoriaDaVtex("a?b=1")], [null, null, null, null, null]);
  conferir("vtex: total do cabecalho resources", [totalDoCabecalhoResources("0-49/264"), totalDoCabecalhoResources("0-9/10"), totalDoCabecalhoResources(""), totalDoCabecalhoResources(undefined)], [264, 10, null, null]);
}

// Imobras (21/10/2026): catalogo de fabricante sem preco, sem Product e com og:type "website".
console.log("\n— catalogo da Imobras —");
{
  const { codigoDaImobras, caracteristicasDaImobras } = await import("../src/lib/coleta/extrair.js");
  const { baseDaPagina, metaTags } = await import("../src/lib/coleta/texto-html.js");
  const trilha = (degraus) => `<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[${degraus
    .map((item, i) => `{"@type":"ListItem","position":"${i + 1}","name":"N${i}","item":"https://www.imobras.ind.br${item}"}`)
    .join(",")}]}</script>`;
  const produto = `<html><head><base href="https://www.imobras.ind.br/">
    <meta property="og:type" content="website"/>
    <meta property="og:title" content="ELETROVENTILADOR AXIAL 10'' ASPIRANTE 12V ou 24V"/>
    <meta property="og:image" content="https://www.imobras.ind.br/userfiles\\cache\\images\\abc-1024x0.webp"/>
    ${trilha(["/pt-br", "/pt-br/produtos", "/pt-br/produtos/eletroventilador-axial", "/pt-br/produtos/eletroventilador-axial/eletroventilador-axial-108"])}
    </head><body>
    <div class="app-tagline-1">Cod. 10.13.501.12V ou 24V</div>
    <h2 class="app-title-2 mt-5">ELETROVENTILADOR AXIAL 10'' ASPIRANTE 12V ou 24V</h2>
    <div class="text-block mt-5"><p>ELETROVENTILADOR AXIAL 10" ASPIRANTE IP68 - 12V ou 24V</p></div>
    <h3 class="app-title-4">Características do produto</h3>
    <div class="text-block mt-4 font-bold"><p><b>Direção:</b> Aspirante</p><p><b>Grau de proteção:</b> IP68</p>
    <p><b>Aplicações:</b></p><p>• Câmara Fria<br/>• Ar Condicionado Veicular</p></div>
    <a href="userfiles/products-files/abc.PDF">Baixar desenho técnico</a>
    </body></html>`;
  const url = "https://www.imobras.ind.br/pt-br/produtos/eletroventilador-axial/eletroventilador-axial-108";
  const lido = extrairProduto(produto, url);
  conferir("imobras: pagina de produto rende titulo, codigo e foto sem barra invertida", [lido.encontrado, lido.titulo, lido.skuFonte, lido.imagens], [true, "ELETROVENTILADOR AXIAL 10'' ASPIRANTE 12V ou 24V", "10.13.501.12V ou 10.13.501.24V", ["https://www.imobras.ind.br/userfiles/cache/images/abc-1024x0.webp"]]);
  conferir("imobras: caracteristicas em pares e Aplicacoes juntando a lista", lido.atributos, { "Direção": "Aspirante", "Grau de proteção": "IP68", "Aplicações": "Câmara Fria, Ar Condicionado Veicular" });

  const { produtos } = normalizarPagina({ html: produto, url, fonte: { type: "FORNECEDOR" } });
  conferir("imobras: 12V ou 24V viram dois produtos com o codigo inteiro", produtos.map((p) => p.code), ["10.13.501.12V", "10.13.501.24V"]);
  conferir("imobras: o desenho tecnico se resolve pelo <base href>", produtos[0].documentos.map((d) => d.url), ["https://www.imobras.ind.br/userfiles/products-files/abc.PDF"]);

  const categoria = produto.replace(/<script[\s\S]*?<\/script>/, trilha(["/pt-br", "/pt-br/produtos", "/pt-br/produtos/eletroventilador-axial"]));
  conferir("imobras: categoria (3 degraus) nao e produto", extrairProduto(categoria, "https://www.imobras.ind.br/pt-br/produtos/eletroventilador-axial").encontrado, false);
  conferir("imobras: a versao em ingles (/en/) nao vira produto", extrairProduto(produto.replace(/\/pt-br/g, "/en"), url.replace("/pt-br", "/en")).encontrado, false);
  conferir("imobras: a regra vale so para o dominio da Imobras", extrairProduto(produto, "https://www.outraloja.com.br/pt-br/produtos/eletroventilador-axial/eletroventilador-axial-108").encontrado, false);

  conferir("imobras: codigo com 'e' e v minusculo, codigo simples e sem codigo", [
    codigoDaImobras('<div class="app-tagline-1">Cod. 10.05.021.12v e 24v</div>'),
    codigoDaImobras('<div class="app-tagline-1">Cod. 10.13.113.24V</div>'),
    codigoDaImobras("<div>nada</div>"),
  ], ["10.05.021.12V ou 10.05.021.24V", "10.13.113.24V", null]);
  conferir("imobras: 'Nao ha aplicacoes disponiveis' nao vira caracteristica", caracteristicasDaImobras('Características do produto</h3><div><p><b>Torque:</b> 50 Nm</p><p><b>Aplicações:</b> Não há aplicações disponíveis para este produto.</p></div>'), { Torque: "50 Nm" });

  conferir("meta tag: a aspa que fecha e a mesma que abriu", [metaTags(`<meta property="og:title" content="MOTOR 10'' 12V"/>`)["og:title"], metaTags(`<meta property='og:title' content='Tela 7" HD'/>`)["og:title"]], ["MOTOR 10'' 12V", 'Tela 7" HD']);
  conferir("base da pagina: <base href> vence, sem ela fica o endereco", [baseDaPagina('<base href="https://www.imobras.ind.br/">', "https://www.imobras.ind.br/pt-br/x/y"), baseDaPagina("<p>sem base</p>", "https://loja.com.br/a/b"), baseDaPagina('<base href="javascript:alert(1)">', "https://loja.com.br/a")], ["https://www.imobras.ind.br/", "https://loja.com.br/a/b", "https://loja.com.br/a"]);
}

// OBR (22/10/2026, pedido do dono: "o Rise nao conseguiu ler esse fornecedor"): catalogo de fabricante sem
// dado estruturado de produto; o og:title e o og:description sao o texto da empresa e o og:image e o logo.
console.log("\n— catalogo da OBR —");
{
  const { lerTabela, pareceCodigo } = await import("../src/lib/coleta/obr.js");
  const { pareceProduto } = await import("../src/lib/coleta/descobrir.js");
  const { decodificar } = await import("../src/lib/coleta/texto-html.js");
  const EMPRESA = "OBR Equipamentos Industriais Ltda. é referência no mercado de automação industrial, graças à sua melhoria processual diária e à constante preocupação em oferecer produtos e serviços de qualidade.";
  const pagina = ({ titulo, trilha, corpo, foto = "uploads/produtos/image/produtos-1-x-2d2e0425.jpg " }) => `<!DOCTYPE html><html><head>
    <base href="https://www.obr.com.br/" />
    <meta property="og:description" content="${EMPRESA}" />
    <meta property="og:title" content="${EMPRESA}" />
    <meta property="og:image" content="https://www.obr.com.br/libs/images/logo.png" />
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://www.obr.com.br/"},{"@type":"ListItem","position":2,"name":"Produtos","item":"https://www.obr.com.br/produtos"},{"@type":"ListItem","position":3,"name":"Produto","item":"https://www.obr.com.br/produtos/item"},{"@type":"ListItem","position":4,"name":"${titulo}","item":"https://www.obr.com.br/produtos/item/1/x"}]}</script>
    </head><body><header><a href="produtos/item/114/manta-de-fibra-ceramica">Manta</a><img src="libs/images/logo.png"></header>
    <div class="categories-individual"><ol class="breadcrumb">${trilha.map((degrau) => `<li class="breadcrumb-item "><a href="categorias/x">${degrau}</a></li>`).join("")}
    <li class="breadcrumb-item active" aria-current="page">${titulo}</li></ol>
    <div class="container"><div class="conteudo-category "><div class="row"><div class="col-lg-9">
    <h2>
        ${titulo}                    </h2>
    <div>${corpo}
    <p><br /><a class="default-btn" href="https://api.whatsapp.com/send?phone=55">Fale com nossos especialistas</a></p>
    <div class="row"><div class="col-lg-3"><a class="btn-product-category" href="javascript:void(0);" onclick="abrirModalRD('x')"><img src="../../../../uploads/textarea/image/f18264a9095f6d74f6ba8bc84b9df20a.png" width="20" /> Download dos arquivos em 3D: .step</a></div></div>
    </div></div>
    <div class="col-lg-3 height-img"><img src="${foto}" alt=""></div>
    </div></div></div><div id="modal-rd" onclick="fecharModalRD()"></div>
    <div id="newsletter"><h2>Precisando de atendimento?</h2><h5>Solicite o seu or&ccedil;amento.</h5></div></div></body></html>`;
  const url = (slug) => `https://www.obr.com.br/produtos/item/661/${slug}`;
  const ler = (html, endereco) => normalizarPagina({ html, url: endereco, fonte: { type: "FORNECEDOR" } }).produtos;

  // Motor de passo: "Codigo:" escrito e a ficha em dois pares por linha, separados por uma celula vazia.
  const motor = pagina({
    titulo: "Motor de Passo NEMA 23 (12kgf.cm)",
    trilha: ["Automa&ccedil;&atilde;o", "Motor de Passo"],
    corpo: `<p>C&oacute;digo: MPS23CM12-15A08D</p><table><tbody>
      <tr><td>Corrente</td><td>1.5 A</td><td>&nbsp;</td><td>Torque est&aacute;tico</td><td>12 kgf.cm / 1.2 Nm</td></tr>
      <tr><td>Resist&ecirc;ncia por fase</td><td>3.8 +/- 10% &Omega;</td><td>&nbsp;</td><td>Peso</td><td>0.7 Kg</td></tr>
      </tbody></table><p><img src="uploads/produtos/661-motor-de-passo-nema-23-12kgf.cm-99b108f7" /></p>`,
  });
  const [pMotor, ...outrosMotor] = ler(motor, url("motor-de-passo-nema-23-12kgf.cm"));
  conferir("obr: motor sai um produto, com o nome do h2 (e nao o texto da empresa) e o codigo escrito", [outrosMotor.length, pMotor.name, pMotor.code], [0, "Motor de Passo NEMA 23 (12kgf.cm)", "MPS23CM12-15A08D"]);
  conferir("obr: dois pares por linha viram quatro caracteristicas, com o Omega decodificado", pMotor.specifications, [
    { nome: "Corrente", valor: "1.5 A" }, { nome: "Torque estático", valor: "12 kgf.cm / 1.2 Nm" },
    { nome: "Resistência por fase", valor: "3.8 +/- 10% Ω" }, { nome: "Peso", valor: "0.7 Kg" },
  ]);
  conferir("obr: categoria do breadcrumb inteira (o 'Motor de Passo' do nome nao corta o degrau)", pMotor.category, "Automação > Motor de Passo");
  conferir("obr: fotos do painel pelo <base href>, a principal primeiro, sem o logo e sem icone", pMotor.images, [
    "https://www.obr.com.br/uploads/produtos/image/produtos-1-x-2d2e0425.jpg",
    "https://www.obr.com.br/uploads/produtos/661-motor-de-passo-nema-23-12kgf.cm-99b108f7",
  ]);
  conferir("obr: descricao sem o texto da empresa, sem os botoes e sem a tabela que virou ficha", pMotor.description, "Código: MPS23CM12-15A08D");
  conferir("obr: sem preco, sem marca e sem EAN inventados; o teste da fonte ve o produto", [pMotor.prices.normal, pMotor.brand, pMotor.ean, extrairProduto(motor, url("x")).encontrado, extrairProduto(motor, url("x")).skuFonte], [null, null, null, true, "MPS23CM12-15A08D"]);

  // Fuso: o titulo e o modelo, e a tabela de UMA linha vira a ficha (cabecalho -> valor).
  const fuso = pagina({
    titulo: "RFSI5010-4.0P",
    trilha: ["Movimenta&ccedil;&atilde;o Linear", "Fusos de Esferas"],
    corpo: `<p>Fuso de Esfera RFSI5010-4.0P</p><p>Download dos arquivos em 3D:&nbsp; <img src="https://www.obr.com.br/media/step_icon.gif" />&nbsp;<a href="https://b24-oc6774.bitrix24.site/crm_form385/">.step</a></p>
      <table border="1"><tbody><tr><td>Modelo da Porca</td><td>Diam. Fuso</td><td>Passo</td><td>Modelo do Fuso</td></tr>
      <tr><td>RFSI2005-4.0P</td><td>50</td><td>10</td><td>R50-10</td></tr></tbody></table><p>Dimens&otilde;es em mm.</p>`,
  });
  const [pFuso] = ler(fuso, url("rfsi5010-4.0p"));
  conferir("obr: titulo que e o modelo vence a tabela copiada de outra pagina; a linha vira a ficha", [pFuso.code, pFuso.specifications], ["RFSI5010-4.0P", [
    { nome: "Diam. Fuso", valor: "50" }, { nome: "Passo", valor: "10" }, { nome: "Modelo do Fuso", valor: "R50-10" },
  ]]);
  conferir("obr: o 'Download dos arquivos em 3D' (formulario de cadastro) sai da descricao", pFuso.description, "Fuso de Esfera RFSI5010-4.0P\n\nDimensões em mm.");

  // Guia linear: cabecalho em duas linhas (rowspan/colspan) e o titulo com espacos ("OBR A 15 S").
  const guia = lerTabela(`<table><tbody>
    <tr><td rowspan="2">MODELO</td><td colspan="2">CAPACIDADE DE CARGA</td><td colspan="2">PESO</td></tr>
    <tr><td>Din&acirc;mica (kgf)</td><td>Est&aacute;tica (kgf)</td><td>Carro kg</td><td>Guia kg/m</td></tr>
    <tr><td>OBR-A 15 S</td><td>1.138</td><td>1.697</td><td>0,18</td><td>1,45</td></tr></tbody></table>`);
  conferir("obr: cabecalho de duas linhas junta o grupo e a coluna", [guia.tipo, guia.itens[0].codigo, guia.itens[0].campos.map((campo) => `${campo.nome}=${campo.valor}`)], ["codigos", "OBR-A 15 S", [
    "CAPACIDADE DE CARGA - Dinâmica (kgf)=1.138", "CAPACIDADE DE CARGA - Estática (kgf)=1.697", "PESO - Carro kg=0,18", "PESO - Guia kg/m=1,45",
  ]]);

  // Suporte da mola a gas: tabela com varios modelos = um produto por modelo; "x" e "nao se aplica".
  const suporte = pagina({
    titulo: "Suporte MA",
    trilha: ["Mola a G&aacute;s", "Acess&oacute;rios"],
    corpo: `<table><tbody><tr><td>Modelo</td><td>A</td><td>B</td><td>C</td></tr>
      <tr><td>MA5</td><td>&Oslash; 6</td><td>2,5</td><td>18</td></tr>
      <tr><td>MA8</td><td>&Oslash; 8</td><td>x</td><td>18</td></tr>
      <tr><td>MA5-VA</td><td>&Oslash; 6</td><td>2,5</td><td>18</td></tr></tbody></table>`,
  });
  const suportes = ler(suporte, url("suporte-ma"));
  conferir("obr: um produto por modelo da tabela, com o nome do titulo e o modelo", suportes.map((p) => [p.code, p.name]), [["MA5", "Suporte MA - MA5"], ["MA8", "Suporte MA - MA8"], ["MA5-VA", "Suporte MA - MA5-VA"]]);
  conferir("obr: 'x' na tabela de medidas nao vira caracteristica", suportes[1].specifications, [{ nome: "A", valor: "Ø 8" }, { nome: "C", valor: "18" }]);

  // Manta: codigo interno (so numero), secoes no meio da tabela e o mesmo codigo duas vezes.
  const manta = pagina({
    titulo: "Manta de Fibra Cer&acirc;mica",
    trilha: ["Isolamento T&eacute;rmico"],
    corpo: `<p>A Manta de Fibra Cer&acirc;mica isola.</p><table border="1"><tbody>
      <tr><td colspan="3"><strong>Manta de Fibra Cer&acirc;mica 1260&ordm;C</strong></td></tr>
      <tr><td colspan="3">Densidade 80 (kg/m&sup3;)</td></tr>
      <tr><td>C&oacute;digo</td><td>Dimens&atilde;o</td><td>M&sup2; / RL</td></tr>
      <tr><td>7891</td><td>25,4 x 610 x 7.620 mm</td><td>4,65</td></tr>
      <tr><td colspan="3">Densidade 96 (kg/m&sup3;)</td></tr>
      <tr><td>C&oacute;digo</td><td>Dimens&atilde;o</td><td>M&sup2; / RL</td></tr>
      <tr><td>8061</td><td>50,8 x 610 x 3.810 mm</td><td>2,32</td></tr>
      <tr><td colspan="3">Densidade 128 (kg/m&sup3;)</td></tr>
      <tr><td>C&oacute;digo</td><td>Dimens&atilde;o</td><td>M&sup2; / RL</td></tr>
      <tr><td>8061</td><td>50,8 x 610 x 3.810 mm</td><td>2,32</td></tr></tbody></table>`,
  });
  const mantas = ler(manta, url("manta-de-fibra-ceramica"));
  conferir("obr: codigo so de numeros leva ao nome a secao e a medida; a secao seguinte troca a anterior; codigo repetido fica uma vez", mantas.map((p) => [p.code, p.name]), [
    ["7891", "Manta de Fibra Cerâmica 1260ºC - Densidade 80 (kg/m³) - 25,4 x 610 x 7.620 mm"],
    ["8061", "Manta de Fibra Cerâmica 1260ºC - Densidade 96 (kg/m³) - 50,8 x 610 x 3.810 mm"],
  ]);
  conferir("obr: as secoes entram na ficha do codigo, e a tabela sai da descricao", [mantas[0].specifications.slice(0, 3), mantas[0].description], [[
    { nome: null, valor: "Manta de Fibra Cerâmica 1260ºC" }, { nome: null, valor: "Densidade 80 (kg/m³)" }, { nome: "Dimensão", valor: "25,4 x 610 x 7.620 mm" },
  ], "A Manta de Fibra Cerâmica isola."]);

  // Gaxeta: o nome da linha vem num rowspan, e "Nome | Densidade 500" fica sobre o cabecalho.
  const gaxeta = lerTabela(`<table><tbody>
    <tr><td rowspan="2">Nome</td><td colspan="2">Densidade 500 (kg/m&sup3;)</td></tr>
    <tr><td>C&oacute;digo</td><td>Dimens&atilde;o</td></tr>
    <tr><td rowspan="2">CORDA (GAXETA) FG</td><td>8101</td><td>6 mm</td></tr>
    <tr><td>8109</td><td>8 mm</td></tr></tbody></table>`);
  conferir("obr: rowspan da coluna Nome vale para as duas linhas; o grupo sobre o cabecalho vira secao", gaxeta.itens.map((item) => [item.codigo, item.contexto, item.campos]), [
    ["8101", ["Densidade 500 (kg/m³)"], [{ nome: "Nome", valor: "CORDA (GAXETA) FG" }, { nome: "Dimensão", valor: "6 mm" }]],
    ["8109", ["Densidade 500 (kg/m³)"], [{ nome: "Nome", valor: "CORDA (GAXETA) FG" }, { nome: "Dimensão", valor: "8 mm" }]],
  ]);

  // Garra: "Modelo | ISO 30" e um par da ficha, nao cabecalho; o titulo "Garra" nao e codigo.
  const [pGarra] = ler(pagina({ titulo: "Garra", trilha: ["Automa&ccedil;&atilde;o", "Spindle"], corpo: "<table><tr><td>Modelo</td><td>ISO 30</td></tr></table>" }), url("garra"));
  conferir("obr: 'Modelo | ISO 30' vira caracteristica e modelo; sem codigo na pagina = N/A", [pGarra.code, pGarra.model, pGarra.specifications], ["N/A", "ISO 30", [{ nome: "Modelo", valor: "ISO 30" }]]);

  // CLP: dois pares por linha SEM a celula vazia; cremalheira: tabela de numeros fica no texto.
  conferir("obr: quatro celulas sem separador viram dois pares", lerTabela("<table><tr><td>Tens&atilde;o de Entrada</td><td>24 VCC</td><td>N&uacute;mero de Entradas</td><td>16</td></tr></table>").pares, [{ nome: "Tensão de Entrada", valor: "24 VCC" }, { nome: "Número de Entradas", valor: "16" }]);
  const [pCremalheira] = ler(pagina({ titulo: "Cremalheira Helicoidal Q6", trilha: ["Cremalheiras"], corpo: `<p>Dimens&otilde;es em mm.</p><table><tr><td>M&oacute;dulo</td><td>L</td></tr><tr><td>1,0</td><td>1000</td></tr><tr><td>1,5</td><td>1000</td></tr></table>` }), url("precisao-q-6"));
  conferir("obr: tabela de medidas sem codigo fica na descricao, coluna a coluna; nome sem numero nao e codigo", [pCremalheira.code, pCremalheira.description], ["N/A", "Dimensões em mm.\nMódulo | L\n1,0 | 1000\n1,5 | 1000"]);

  conferir("obr: so a pagina /produtos/item/ e produto, e so no dominio da OBR", [
    extrairProduto(motor, "https://www.obr.com.br/subcategoria/37/192/motor-de-passo").encontrado,
    extrairProduto(motor, "https://www.outraloja.com.br/produtos/item/661/motor").encontrado,
    pareceProduto("https://www.obr.com.br/produtos/item/718/obr-sfur-1605-4"),
    pareceProduto("https://www.obr.com.br/subcategoria/30/207/modelo-obr-sfur"),
    pareceProduto("https://www.obr.com.br/produtos/divisao/31/182/322/carro-standard"),
  ], [false, false, true, false, false]);
  conferir("obr: cara de codigo", ["MA5-VA", "8101", "OBR-A 15 S", "Densidade 1000 (kg/m³)", "CORDA (GAXETA) FG", "Corrente", "NMS 12 ..."].map(pareceCodigo), [true, true, true, false, false, false, false]);

  // Adaptador "OL-A OBR": a coluna Modelo lista as GUIAS em que ele serve, e a peca aparece ao lado.
  const adaptador = pagina({
    titulo: "OL-A OBR",
    trilha: ["Movimenta&ccedil;&atilde;o Linear", "Guias Lineares"],
    corpo: `<table class="data-table"><tbody><tr><th colspan="3">Adaptadores</th></tr>
      <tr><th colspan="2">Modelo</th><th>Opcional</th></tr>
      <tr><td>OBR-A 20</td><td>OBR-B 20</td><td rowspan="2">OL-A</td></tr>
      <tr><td>OBR-A 25</td><td>OBR-B 25</td></tr></tbody></table>`,
  });
  const adaptadores = ler(adaptador, url("ol-a-obr"));
  conferir("obr: tabela de compatibilidade e um produto so, o do titulo, com as guias na ficha", adaptadores.map((p) => [p.code, p.name, p.specifications[0]]), [
    ["OL-A OBR", "OL-A OBR", { nome: "Modelo (serve em)", valor: "OBR-A 20, OBR-B 20, OBR-A 25, OBR-B 25" }],
  ]);

  // Mancal BK: a subcategoria mostra a tabela de modelos e nao tem pagina de produto.
  const listagem = (corpo) => `<html><head><base href="https://www.obr.com.br/" /><meta property="og:image" content="https://www.obr.com.br/libs/images/logo.png" /></head><body>
    <header><a href="produtos/item/114/manta-de-fibra-ceramica">Manta</a></header>
    <div class="categories-individual"><ol class="breadcrumb"><li class="breadcrumb-item"><a href="categorias/movimentacao-linear">Movimenta&ccedil;&atilde;o Linear</a></li>
    <li class="breadcrumb-item"><a href="categorias/mancais">Mancais</a></li><li class="breadcrumb-item active">Modelo BK</li></ol></div>
    <div class="title"><div class="container"><h2>Modelo BK</h2></div></div>
    <div class="conteudo-category bg-menu"><div class="container">${corpo}</div></div>
    <div id="newsletter"><h2>Precisando de atendimento?</h2></div></body></html>`;
  const tabelaBk = `<table><tr><th>Item</th><th>Descri&ccedil;&atilde;o</th><th>Quantidade</th></tr><tr><td>1</td><td>Bloco</td><td>1</td></tr></table>
    <p><img src="uploads/produtos/090-modelo-bk-89e4088d" /></p>
    <table><tr><td>MODELO</td><td>&Oslash; EIXO d1</td><td>L</td></tr><tr><td>BK10</td><td>10</td><td>25</td></tr><tr><td>BK12</td><td>12</td><td>25</td></tr></table>`;
  const urlBk = "https://www.obr.com.br/subcategoria/43/224/modelo-bk";
  const mancais = ler(listagem(tabelaBk), urlBk);
  conferir("obr: subcategoria com tabela de modelos e sem pagina de produto vira um produto por modelo", mancais.map((p) => [p.code, p.name, p.category, p.images]), [
    ["BK10", "Modelo BK - BK10", "Movimentação Linear > Mancais", ["https://www.obr.com.br/uploads/produtos/090-modelo-bk-89e4088d"]],
    ["BK12", "Modelo BK - BK12", "Movimentação Linear > Mancais", ["https://www.obr.com.br/uploads/produtos/090-modelo-bk-89e4088d"]],
  ]);
  conferir("obr: a lista de pecas do mancal (Item | Descricao | Quantidade) fica no texto", mancais[0].description, "Item | Descrição | Quantidade\n1 | Bloco | 1");
  conferir("obr: subcategoria que lista produtos, ou sem tabela de modelos, nao e produto", [
    extrairProduto(listagem(`${tabelaBk}<a href="produtos/item/661/motor">Motor</a>`), urlBk).encontrado,
    extrairProduto(listagem("<p>Os mancais sao fabricados...</p>"), urlBk).encontrado,
  ], [false, false]);
  conferir("entidade com numero no nome (&sup3;, &frac12;) e Omega/Oslash", decodificar("kg/m&sup3; 1&frac12; 10 &Omega; &Oslash; 6"), "kg/m³ 1½ 10 Ω Ø 6");
}

// EAN do produto conferido no catalogo do Mercado Livre (pedido do dono em 21/10/2026, opcao 1).
console.log("\n— EAN no Mercado Livre —");
{
  const { digitoVerificadorOk, problemaLocalDoEan, nomesParecidos, avisoDoCatalogo } = await import("../src/lib/eanNoMercadoLivre.js");
  const { conferirEanNoML, itensDoCatalogoPorEan } = await import("../src/lib/canaisDeVenda/ml/eanNoCatalogo.js");
  conferir("ean: digito verificador (EAN-13, EAN-8, UPC-A, GTIN-14) certo e errado", [
    digitoVerificadorOk("7640152110139"), digitoVerificadorOk("7891262495597"), digitoVerificadorOk("96385074"), digitoVerificadorOk("036000291452"), digitoVerificadorOk("17891262495594"),
    digitoVerificadorOk("7640152110138"), digitoVerificadorOk("abc"), digitoVerificadorOk(""),
  ], [true, true, true, true, true, false, false, false]);
  conferir("ean: problemas locais (formato, digito, codigo do produto com zeros) e o que passa", [
    problemaLocalDoEan("12345", "100101")?.tipo, problemaLocalDoEan("7640152110138", "100101")?.tipo,
    problemaLocalDoEan("0000000100106", "100106")?.tipo, problemaLocalDoEan("7640152110139", "100101"), problemaLocalDoEan("", "100101"),
  ], ["formato", "digito", "interno", null, null]);
  conferir("ean: nomes parecidos (sem acento, sem palavras vazias) e diferentes", [
    nomesParecidos("PLACA COMPATIVEL ARDUINO UNO R3 SMD CH340 COM CABO USB", "Unidade Uno R3 Smd com cabo USB compatível com Ide Arduino"),
    nomesParecidos("MÓDULO DIGISPARK ATTINY85 USB TIPO C", "Biobellus - Loção descongestionante, tonificante e refrescante"),
  ], [true, false]);
  conferir("ean: catalogo vazio ou com o mesmo produto nao avisa; so de outro produto avisa com ate 2 nomes", [
    avisoDoCatalogo([], "Placa Uno"),
    avisoDoCatalogo([{ id: "MLB1", nome: "Placa Uno R3 SMD" }], "PLACA UNO R3"),
    avisoDoCatalogo([{ id: "MLB2", nome: "Locao A" }, { id: "MLB3", nome: "Locao B" }, { id: "MLB4", nome: "Locao C" }], "Modulo Digispark")?.itens.map((i) => i.id),
  ], [null, null, ["MLB2", "MLB3"]]);

  const pedidos = [];
  const mlFalso = {
    get: async (caminho, params) => {
      pedidos.push([caminho, params.product_identifier]);
      if (params.product_identifier === "7891262495597") return { ok: false, status: 500, dados: null };
      return { ok: true, status: 200, dados: { results: [{ id: "MLB9", name: "Biobellus - Locao descongestionante" }] } };
    },
  };
  const outro = await conferirEanNoML(mlFalso, { ean: "7640152110139", sku: "X1", titulo: "Placa Uno" }, { agora: 1 });
  await conferirEanNoML(mlFalso, { ean: "7640152110139", sku: "X1", titulo: "Placa Uno" }, { agora: 2 });
  const zeros = await conferirEanNoML(mlFalso, { ean: "0000000100106", sku: "100106", titulo: "Digispark" });
  const semMl = await conferirEanNoML(mlFalso, { ean: "7891262495597", sku: "X2", titulo: "Mega" });
  conferir("ean: consulta o ML so com o EAN, guarda na memoria, nao consulta o codigo com zeros e nao avisa sem o ML", [
    outro.aviso?.tipo, outro.aviso?.itens[0].id, zeros.aviso?.tipo, semMl, pedidos.length, pedidos[0],
  ], ["outro", "MLB9", "interno", { aviso: null, semConsulta: true }, 2, ["/products/search", "7640152110139"]]);
  conferir("ean: EAN invalido nao vai ao ML", await itensDoCatalogoPorEan(mlFalso, "123"), []);
}

// Benser (22/10/2026): a pagina salva do portal traz estoque antigo; o portal troca pelo ao vivo ao abrir.
console.log("\n— estoque ao vivo do portal Benser —");
{
  const { aoVivoDaBenser, aplicarAoVivo, estoqueAoVivoDaBenser, horaDaLeitura } = await import("../src/lib/coleta/benser-ao-vivo.js");
  const portal = `<title>Benser · Portal de Pedidos</title><meta property="og:url" content="https://benser.com.br/">`;
  conferir("benser: endereco e minimo por lista; outro site nao consulta", [
    aoVivoDaBenser(portal, "PRONTA_ENTREGA")?.endereco,
    aoVivoDaBenser(portal, "RESERVA")?.endereco,
    aoVivoDaBenser(portal, "RESERVA")?.minimo,
    aoVivoDaBenser("<title>Nightech</title>", "PRONTA_ENTREGA"),
  ], ["https://benser.com.br/api/estoque", "https://benser.com.br/api/estoque-reserva", 200, null]);

  const brutos = [
    { sku: "64-380", preco: 1.29, estoque: 214, desc: "PRETO" },
    { sku: "64-382", preco: 1.29, estoque: 284 },
    { sku: "65-247", preco: 1.29, estoque: 264 },
    { sku: "01-001", preco: 5, estoque: 7 },
    { sku: "01-002", preco: 5, estoque: 3 },
  ];
  const saldos = { "64-380": 0, "64-382": 284, "65-247": 64, "01-001": 7 };
  const r = aplicarAoVivo(brutos, { ok: true, ts: 1792682209139, saldos, precos: { "64-380": 1.35, "64-382": 0 } }, 3);
  conferir("benser: troca estoque e preco pelo ao vivo (preco zero nao conta)", r.itens.map((i) => [i.sku, i.estoque, i.preco]), [["64-380", 0, 1.35], ["64-382", 284, 1.29], ["65-247", 64, 1.29], ["01-001", 7, 5], ["01-002", 0, 5]]);
  conferir("benser: o resto do item fica e o de entrada nao muda", [r.itens[0].desc, brutos[0].estoque], ["PRETO", 214]);
  conferir("benser: contagens; o ausente zera quando faltam ate 20%", [r.estoqueMudou, r.precoMudou, r.ausentes, r.zerouAusentes], [3, 1, 1, true]);
  const muitos = aplicarAoVivo(brutos, { ok: true, saldos: { "64-380": 0, "64-382": 1, "65-247": 2 } }, 3);
  conferir("benser: faltando mais de 20%, o ausente fica com o numero do arquivo", muitos.itens.map((i) => i.estoque), [0, 1, 2, 7, 3]);
  conferir("benser: resposta ruim ou pequena e recusada", [
    aplicarAoVivo(brutos, { ok: false, saldos }, 3).erro,
    aplicarAoVivo(brutos, null, 3).erro,
    aplicarAoVivo(brutos, { ok: true, saldos: { a: 1 } }, 3).erro,
  ], ["resposta sem saldos", "resposta sem saldos", "resposta com 1 itens (mínimo 3)"]);
  conferir("benser: hora da leitura em Sao Paulo", horaDaLeitura(new Date(1792682209139)), "12:16 de 22/10");

  const falso = (corpo, ok = true) => async () => ({ ok, corpo, erro: ok ? null : "HTTP 503" });
  const vivo = await estoqueAoVivoDaBenser(brutos, portal, "PRONTA_ENTREGA", { buscar: falso(JSON.stringify({ ok: true, saldos: Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`x${i}`, 1]).concat([["64-380", 0]])) })) });
  conferir("benser: busca de verdade com o minimo de 1.000", vivo.itens[0].estoque, 0);
  conferir("benser: falha da rede e JSON quebrado viram erro, sem itens", [
    (await estoqueAoVivoDaBenser(brutos, portal, "PRONTA_ENTREGA", { buscar: falso(null, false) })).erro,
    (await estoqueAoVivoDaBenser(brutos, portal, "PRONTA_ENTREGA", { buscar: falso("<html>") })).erro,
    await estoqueAoVivoDaBenser(brutos, "<title>outro</title>", "PRONTA_ENTREGA", { buscar: falso("{}") }),
  ], ["HTTP 503", "resposta não é JSON", null]);
}

// EAN interno derivado do SKU (spec 2026-10-23-gerador-ean-interno-design.md): sem GS1, a faixa 2 e a de uso interno.
{
  const { calcularDigitoVerificador } = await import("../src/lib/eanNoMercadoLivre.js");
  const { gerarEanDoSku, ehEanInternoDoRise, problemaDoEanInterno } = await import("../src/lib/eanInterno.js");
  conferir("DV: calculo isolado confere com os EANs reais", [calcularDigitoVerificador("764015211013"), calcularDigitoVerificador("9638507"), calcularDigitoVerificador("200000100101")], ["9", "4", "1"]);
  conferir("EAN interno: derivado do SKU, com zeros a esquerda e DV", [gerarEanDoSku("100101"), gerarEanDoSku("250012"), gerarEanDoSku(" 100101 ")], [{ ok: true, ean: "2000001001011" }, { ok: true, ean: "2000002500124" }, { ok: true, ean: "2000001001011" }]);
  conferir("EAN interno: SKU com zeros a esquerda da o mesmo numero que sem eles (o Salvar recusa o repetido)", gerarEanDoSku("000123").ean, gerarEanDoSku("123").ean);
  conferir("EAN interno: 11 digitos cabem, 12 nao", [gerarEanDoSku("12345678901").ok, gerarEanDoSku("123456789012").ok], [true, false]);
  conferir("EAN interno: recusas com motivo", [gerarEanDoSku("").erro, gerarEanDoSku("   ").erro, gerarEanDoSku("ZZ-TESTE-KIT").erro, gerarEanDoSku("920302_1.000").erro, gerarEanDoSku("123456789012").erro], [
    "Preencha o código (SKU) antes de gerar o EAN.",
    "Preencha o código (SKU) antes de gerar o EAN.",
    "O EAN interno só é gerado para código só com dígitos (este tem letras ou símbolos).",
    "O EAN interno só é gerado para código só com dígitos (este tem letras ou símbolos).",
    "O código tem mais de 11 dígitos e não cabe no EAN-13.",
  ]);
  conferir("EAN interno: reconhece a faixa 2 de 13 digitos", [ehEanInternoDoRise("2000001001011"), ehEanInternoDoRise("7640152110139"), ehEanInternoDoRise("20000010"), ehEanInternoDoRise(""), ehEanInternoDoRise(null)], [true, false, false, false, false]);
  conferir("EAN interno: DV conferido so na faixa 2", [problemaDoEanInterno("2000001001011"), problemaDoEanInterno("2000000000008"), problemaDoEanInterno("7640152110138"), problemaDoEanInterno(""), problemaDoEanInterno("2000001001010")], [null, null, null, null, "O dígito verificador do GTIN/EAN interno (prefixo 2) não confere: gere de novo pelo botão ou corrija o código."]);
}

// ---------------------------------------------------------------- custo do fornecedor com impostos (23/10/2026)
{
  const { custoDoFornecedor } = await import("../src/lib/coleta/impostos.js");
  const ipi = [{ nome: "IPI", percentual: 2 }];
  conferir("custo: o com impostos gravado vence", custoDoFornecedor({ normal: 31.9, comImpostos: 32.54 }, ipi), 32.54);
  conferir("custo: sem o gravado, calcula pelas aliquotas", custoDoFornecedor({ normal: 31.9 }, ipi), 32.54);
  conferir("custo: sem imposto, o normal", custoDoFornecedor({ normal: 31.9 }, []), 31.9);
  conferir("custo: sem normal, o promocional", custoDoFornecedor({ promotional: 30 }), 30);
  conferir("custo: sem preco nenhum, null", custoDoFornecedor({}), null);
}

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

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
conferir("microdata: categoria do breadcrumb", micro.categoria, "Displays e Telas");
conferir("microdata: nao pega o nome do site", micro.categoria !== "Loja", true);

const display = normalizarPagina({ html: microHtml, url: "https://loja.com.br/p/display" })
  .produtos[0];
conferir("entidade &iacute; decodificada", display.name, "Display 14 Segmentos 4 Dígitos");
conferir("entidade &oacute; decodificada", display.description, "Módulo com display de 14 segmentos.");
conferir("preco NORMAL e o de tabela", display.prices.normal, 39.97);
conferir("preco PROMOCIONAL e o menor", display.prices.promotional, 37.97);
conferir("categoria", display.category, "Displays e Telas");
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

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

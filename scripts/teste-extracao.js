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

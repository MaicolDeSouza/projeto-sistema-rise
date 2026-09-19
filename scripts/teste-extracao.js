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
conferir("categoria e o ultimo degrau antes do produto", eletrus.category, "Sensores");
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
  const { parametrosDaCategoria, produtosDaVitrine } = await import("../src/lib/coleta/portal-addsuite.js");

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

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

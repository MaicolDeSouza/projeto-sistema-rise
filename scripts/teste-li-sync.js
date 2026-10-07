import "dotenv/config";

/**
 * Testes da sincronizacao Rise -> Loja Integrada (plano de 06/10/2026): o banco, as
 * regras puras (slug, SEO, descricao, campos, corpo, rascunho, validacao, icone) e o
 * envio, sempre contra uma LOJA INTEGRADA FALSA em memoria. Usa o Postgres, SEM rede:
 * nenhum teste fala com a LI real.
 *
 *   npm run teste:li-sync
 *
 * Os produtos de teste levam SKU "ZZ-LI-..."; tudo e apagado no comeco de cada bloco e
 * no fim (anuncios e copias saem junto com o produto, por Cascade).
 *
 * Como ampliar: cada tarefa acrescenta UM bloco `{ ... }` dentro do try, antes do
 * comentario "Blocos das tarefas seguintes". O bloco abre com um console.log do titulo
 * e, se mexe no banco, com `await limpar()`.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("../src/lib/db.js");
const { LIMITE_DO_SLUG, slugDe, slugValido } = await import("../src/lib/canaisDeVenda/li/slug.js");
const { LIMITE_DA_DESCRIPTION_SEO, LIMITE_DO_TITULO_SEO, cortarNaPalavra, descriptionPadrao, tituloSeoPadrao } = await import("../src/lib/canaisDeVenda/li/seo.js");
const { blocoDocumentos, blocoEspecificacoes, montarDescricaoLI, textoParaHtmlLI } = await import("../src/lib/canaisDeVenda/li/descricao.js");
const { htmlParaTexto } = await import("../src/lib/integracoes/normalizacao.js");
const { CAMPOS_DE_ENVIO_LI, CAMPOS_SO_LEITURA_LI, TEXTO_DO_TIPO_PRODUCAO, TIPO_PRODUCAO_DA_LI, assinaturaLI, avisosFiscaisLI, contarDivergencias, diferencasLI, normalizarDaLI, normalizarDoRiseLI } = await import("../src/lib/canaisDeVenda/li/campos.js");
const { CHAVES_SO_LEITURA, formatarNcmLI, mesclarCorpoLI, montarCorpoDeCadastroLI } = await import("../src/lib/canaisDeVenda/li/corpo.js");
const { rascunhoDaLI, rascunhoInicialLI } = await import("../src/lib/canaisDeVenda/li/rascunho.js");
const { LIMITES_LI, RascunhoLISchema } = await import("../src/lib/canaisDeVenda/li/esquema.js");
const { ABAS_LI, validarRascunhoLI } = await import("../src/lib/canaisDeVenda/li/validacao.js");
const { anuncioLIDoProduto, carregarAnuncioLI, contextoDoProduto, documentosDoProduto, listarAnunciosLI, novoRascunhoLI, salvarRascunhoLI, vincularPeloSku } = await import("../src/lib/canaisDeVenda/li/banco.js");
const { gravarFrasesDoCanal, lerConfigCanal } = await import("../src/lib/canaisDeVenda/configuracao.js");
const { config } = await import("../src/lib/integracoes/config.js");
const { clienteLI } = await import("../src/lib/canaisDeVenda/li/cliente.js");
const { estadoDoIconeLI, iconeLIDoProduto, produtoIdValido } = await import("../src/lib/canaisDeVenda/li/estado.js");
const { criarLojaIntegradaFalsa } = await import("./lib/lojaIntegradaFalsa.js");
const { buscarNaLI, lerDetalheDaLI, lerParaPopupLI, listarCategoriasDaLI, listarMarcasDaLI } = await import("../src/lib/canaisDeVenda/li/leitura.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

async function limpar() {
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-LI-" } } });
}

try {
  {
    console.log("\nBanco: tipoProducao e CopiaProdutoCanal");
    await limpar();
    const produto = await prisma.produto.create({ data: { sku: "ZZ-LI-1", tituloBase: "Teste LI" } });
    conferir("produto novo nasce REVENDA", produto.tipoProducao, "REVENDA");
    const fabricado = await prisma.produto.update({ where: { id: produto.id }, data: { tipoProducao: "FABRICACAO_PROPRIA" } });
    conferir("aceita FABRICACAO_PROPRIA", fabricado.tipoProducao, "FABRICACAO_PROPRIA");
    await prisma.copiaProdutoCanal.create({
      data: { canal: "LOJA_INTEGRADA", produtoId: produto.id, conteudo: { nome: "x" }, alteracoes: [{ campo: "nome", de: "x", para: "y" }] },
    });
    conferir("copia por canal gravada", await prisma.copiaProdutoCanal.count({ where: { produtoId: produto.id, canal: "LOJA_INTEGRADA" } }), 1);
    await prisma.produto.delete({ where: { id: produto.id } });
    conferir("copia sai com o produto (Cascade)", await prisma.copiaProdutoCanal.count({ where: { produtoId: produto.id } }), 0);
  }

  {
    console.log("\nRegras puras: slug e SEO");
    conferir("limites do slug e do SEO", [LIMITE_DO_SLUG, LIMITE_DO_TITULO_SEO, LIMITE_DA_DESCRIPTION_SEO], [100, 70, 250]);
    conferir("slug sem acento, minusculo, hifens", slugDe("CLP FX3U-24MR  14 Entradas / Relé RS232"), "clp-fx3u-24mr-14-entradas-rele-rs232");
    conferir("slug de so simbolos e vazio", slugDe("!!! ???"), "");
    conferir("slug corta em 100 sem hifen no fim", slugDe("a".repeat(99) + " bcd").length <= 100 && !slugDe("a".repeat(99) + " bcd").endsWith("-"), true);
    conferir("slugValido aceita", slugValido("kit-reducao-5-1"), true);
    conferir("slugValido recusa maiuscula, acento, barra, hifen duplo", [slugValido("Kit"), slugValido("ré"), slugValido("a/b"), slugValido("a--b")], [false, false, false, false]);
    conferir("slugValido recusa acima de 100", slugValido("a".repeat(101)), false);
    conferir("corta na palavra", cortarNaPalavra("Fonte chaveada 12V 5A bivolt", 18), "Fonte chaveada 12V");
    conferir("palavra unica maior que o limite corta seca", cortarNaPalavra("abcdefghij", 4), "abcd");
    conferir("titulo SEO padrao <= 70", tituloSeoPadrao("x".repeat(60) + " " + "y".repeat(20)), "x".repeat(60));
    conferir("description padrao = primeiro paragrafo colapsado", descriptionPadrao("Linha  1\ncontinua\n\nSegundo paragrafo"), "Linha 1 continua");
    conferir("description padrao <= 250", descriptionPadrao("palavra ".repeat(60)).length <= 250, true);
    conferir("description de vazio e nulo", [descriptionPadrao(""), descriptionPadrao(null)], ["", ""]);
  }

  {
    console.log("\nRegras puras: descricao HTML");
    conferir("escapa tag e e-comercial", textoParaHtmlLI("a <b> & c"), "<p>a &lt;b&gt; &amp; c</p>");
    conferir("escapa aspas", textoParaHtmlLI(`diz "oi" e 'tchau'`), "<p>diz &quot;oi&quot; e &#39;tchau&#39;</p>");
    conferir("quebra simples vira br, dupla vira paragrafo, CRLF vale um", textoParaHtmlLI("l1\r\nl2\r\n\r\nl3"), "<p>l1<br>l2</p><p>l3</p>");
    conferir("vazio nao gera paragrafo", [textoParaHtmlLI("  \n "), textoParaHtmlLI(null)], ["", ""]);
    const prod = { marca: "ARDUINO", modelo: "UNO R3", ean: "7891234567890", pesoKg: 0.5, alturaCm: 2, larguraCm: 12, comprimentoCm: 6, garantiaMeses: 3, numeroHomologacao: null };
    conferir("especificacoes so com os preenchidos", blocoEspecificacoes(prod), "<h2>Especificações</h2><ul><li>Marca: ARDUINO</li><li>Modelo: UNO R3</li><li>GTIN: 7891234567890</li><li>Peso: 0,500 kg</li><li>Medidas: 6 x 12 x 2 cm</li><li>Garantia: 3 meses</li></ul>");
    conferir("medidas so com as tres; decimal com virgula; garantia de 1 mes", blocoEspecificacoes({ alturaCm: 2.5, larguraCm: 12 , garantiaMeses: 1, numeroHomologacao: "0123-45-6789" }), "<h2>Especificações</h2><ul><li>Garantia: 1 mês</li><li>Homologação: 0123-45-6789</li></ul>");
    conferir("medida decimal sem zero a direita", blocoEspecificacoes({ alturaCm: 2.5, larguraCm: 12.25, comprimentoCm: 6.1 }), "<h2>Especificações</h2><ul><li>Medidas: 6,1 x 12,25 x 2,5 cm</li></ul>");
    conferir("especificacoes vazias nao geram bloco", blocoEspecificacoes({}), "");
    conferir("documentos com nome escapado", blocoDocumentos([{ url: "https://x/y.pdf?v=2", nome: "Manual <v2>.pdf" }]), "<h2>Documentos</h2><ul><li><a href=\"https://x/y.pdf?v=2\">Manual &lt;v2&gt;.pdf</a></li></ul>");
    conferir("documento com endereco que nao e http fica de fora", blocoDocumentos([{ url: "javascript:alert(1)", nome: "x" }]), "");
    conferir("sem documentos nao ha bloco", [blocoDocumentos([]), blocoDocumentos(null)], ["", ""]);
    const html = montarDescricaoLI({ descricao: "Texto & tal", especificacoes: false, produto: prod, documentos: [], frases: ["Com nota fiscal", ""] });
    conferir("descricao final: texto e frases", html, "<p>Texto &amp; tal</p><p>Com nota fiscal</p>");
    conferir("descricao final com especificacoes e documentos, na ordem", montarDescricaoLI({ descricao: "T", especificacoes: true, produto: { marca: "X" }, documentos: [{ url: "https://a/b.pdf", nome: "B" }], frases: ["F"] }), "<p>T</p><h2>Especificações</h2><ul><li>Marca: X</li></ul><h2>Documentos</h2><ul><li><a href=\"https://a/b.pdf\">B</a></li></ul><p>F</p>");
    conferir("ida e volta pelo htmlParaTexto", htmlParaTexto(montarDescricaoLI({ descricao: "a <b>\nc\n\nd", especificacoes: false, produto: {}, documentos: [], frases: [] }), { paragrafos: true }), "a <b>\nc\n\nd");
    conferir("ida e volta com aspas, & e CRLF", htmlParaTexto(montarDescricaoLI({ descricao: `Diz "x" & 'y'\r\nfim`, especificacoes: false, produto: {}, documentos: [], frases: [] }), { paragrafos: true }), `Diz "x" & 'y'\nfim`);
    conferir("htmlParaTexto sem a opcao continua como o Bling usa", htmlParaTexto("<p>a</p><p>b</p>"), "a\nb");
  }

  {
    console.log("\nRegras puras: campos, assinatura e diferencas");
    conferir("campos de envio, na ordem, sem os fiscais so de leitura", CAMPOS_DE_ENVIO_LI.map((c) => c.id), ["nome", "slug", "descricao", "ncm", "gtin", "mpn", "peso", "altura", "largura", "comprimento", "marca", "categorias", "video", "destaque", "seoTitulo", "seoDescription"]);
    conferir("campos so de leitura: origem e tipo de producao", CAMPOS_SO_LEITURA_LI.map((c) => c.id), ["origem", "tipoProducao"]);
    conferir("texto do tipo de producao e o medido na LI", TEXTO_DO_TIPO_PRODUCAO, { REVENDA: "Revenda", FABRICACAO_PROPRIA: "Fabricação própria" });
    conferir("tipo de producao da LI pelo texto", [TIPO_PRODUCAO_DA_LI("Revenda"), TIPO_PRODUCAO_DA_LI("Fabricação própria"), TIPO_PRODUCAO_DA_LI("outro"), TIPO_PRODUCAO_DA_LI(null)], ["REVENDA", "FABRICACAO_PROPRIA", null, null]);
    const produtoRise = { tituloBase: "x", ncm: "8537.10.20", ean: "7894972605270", modelo: "FX3U", pesoKg: "0.5", alturaCm: "2.3", larguraCm: "12", comprimentoCm: "6.01", origem: 0, tipoProducao: "REVENDA" };
    const rasc = { titulo: " CLP FX3U ", slug: "clp-fx3u", descricao: "Texto", marca: "Mitsubishi", categorias: ["23983023", "5946305", "23983023"], destaque: false, videoUrl: null, seo: { title: "t".repeat(80), description: "" }, especificacoes: false };
    const rise = normalizarDoRiseLI(produtoRise, rasc, { frases: [], documentos: [] });
    conferir("rise normalizado", rise, { nome: "CLP FX3U", slug: "clp-fx3u", descricao: "Texto", ncm: "85371020", gtin: "7894972605270", mpn: "FX3U", peso: 0.5, altura: 3, largura: 12, comprimento: 7, marca: "MITSUBISHI", categorias: ["23983023", "5946305"], video: null, destaque: false, seoTitulo: "t".repeat(70), seoDescription: null, origem: 0, tipoProducao: "REVENDA" });
    const produtoLI = { id: 1, nome: "CLP FX3U", apelido: "/clp-fx3u", descricao_completa: "<p>Texto</p>", ncm: "8537.10.20", gtin: "7894972605270", mpn: "FX3U", peso: "0.500", altura: 3, largura: 12, profundidade: 7, marca: "/api/v1/marca/16306688", categorias: ["/api/v1/categoria/5946305", "/api/v1/categoria/23983023"], url_video_youtube: null, destaque: false, icms_origin_code: "0", production_type: TEXTO_DO_TIPO_PRODUCAO.REVENDA, seo_title: "", seo_description: "" };
    const li = normalizarDaLI(produtoLI, { title: "t".repeat(70), description: "" }, { marcaNome: "Mitsubishi" });
    conferir("LI normalizada igual ao Rise", li, rise);
    conferir("assinatura estavel e igual", assinaturaLI(rise) === assinaturaLI(li) && assinaturaLI(rise).length === 64, true);
    conferir("assinatura ignora os fiscais so de leitura", assinaturaLI(rise) === assinaturaLI({ ...rise, origem: 5, tipoProducao: "FABRICACAO_PROPRIA" }), true);
    conferir("assinatura muda com um campo de envio", assinaturaLI(rise) === assinaturaLI({ ...rise, nome: "outro" }), false);
    conferir("sem diferencas", diferencasLI(rise, li), []);
    const semMarca = normalizarDaLI({ ...produtoLI, marca: null, ncm: "", categorias: [] }, { title: "t".repeat(70), description: "" }, { marcaNome: null });
    conferir("diferencas: ncm, marca e categorias (so no Rise)", diferencasLI(rise, semMarca).map((d) => [d.campo, d.tipo]), [["ncm", "diferente"], ["marca", "diferente"], ["categorias", "diferente"]]);
    conferir("vazio no Rise nao e divergencia", contarDivergencias(diferencasLI({ ...rise, ncm: null, categorias: [] }, li)), 0);
    conferir("vazio no Rise aparece marcado", diferencasLI({ ...rise, ncm: null }, li).map((d) => [d.campo, d.tipo]), [["ncm", "vazioNoRise"]]);
    conferir("tipo de producao da LI sem acento e caixa", normalizarDaLI({ ...produtoLI, production_type: "fabricacao PROPRIA" }, null, {}).tipoProducao, "FABRICACAO_PROPRIA");
    conferir("origem ausente e null, nao 0", normalizarDaLI({ ...produtoLI, icms_origin_code: null }, null, {}).origem, null);
    conferir("slug atual e o url (o /alias nao muda o apelido)", normalizarDaLI({ ...produtoLI, url: "/clp-novo" }, null, {}).slug, "clp-novo");
    conferir("SEO cai no seo_title do detalhe sem o /seo", normalizarDaLI({ ...produtoLI, seo_title: "Titulo LI" }, null, {}).seoTitulo, "Titulo LI");
    conferir("fiscais diferentes nao contam como divergencia", diferencasLI(rise, { ...li, origem: 5, tipoProducao: "FABRICACAO_PROPRIA" }), []);
    conferir("avisos fiscais: diferente e vazio na LI", avisosFiscaisLI(rise, { ...li, origem: 5, tipoProducao: null }).map((a) => [a.campo, a.tipo]), [["origem", "diferente"], ["tipoProducao", "vazioNaLI"]]);
    conferir("avisos fiscais: iguais nao avisam", avisosFiscaisLI(rise, li), []);
    conferir("medida e peso invalidos viram null", (({ peso, altura }) => ({ peso, altura }))(normalizarDoRiseLI({ pesoKg: "0", alturaCm: "abc" }, { titulo: "x" }, {})), { peso: null, altura: null });
  }

  {
    console.log("\nRegras puras: corpo do cadastro e mesclagem do PUT");
    const rise = normalizarDoRiseLI(
      { ncm: "8537.10.20", ean: "7894972605270", modelo: "FX3U", pesoKg: "0.5", alturaCm: "2.3", larguraCm: "12", comprimentoCm: "6.01", origem: 0, tipoProducao: "REVENDA" },
      { titulo: "CLP FX3U", slug: "clp-fx3u", descricao: "Texto", marca: "Mitsubishi", categorias: ["5946305"], destaque: false, videoUrl: null, seo: { title: "S", description: "" } },
      {},
    );
    const produtoLI = { id: 1, resource_uri: "/api/v1/produto/1", url: "/clp-fx3u", seo: "/api/v1/seo/9", imagens: [{ id: 3 }], preco_cheio: "10.00", estoque_quantidade: 5, nome: "CLP FX3U", apelido: "/clp-fx3u", descricao_completa: "<p>Texto</p>", ncm: "8537.10.20", gtin: "7894972605270", mpn: "FX3U", peso: "0.500", altura: 3, largura: 12, profundidade: 7, marca: "/api/v1/marca/16306688", categorias: ["/api/v1/categoria/5946305", "/api/v1/categoria/23983023"], url_video_youtube: null, destaque: false, icms_origin_code: null, production_type: null, seo_title: "", seo_description: "", tags: [] };
    conferir("NCM no formato da loja", [formatarNcmLI("85371020"), formatarNcmLI("8537"), formatarNcmLI(null)], ["8537.10.20", "8537", null]);
    const corpoPost = montarCorpoDeCadastroLI({ sku: "ZZ-LI-2", rise, descricaoHtml: "<p>Texto</p>", marcaUri: "/api/v1/marca/1", categoriasUris: ["/api/v1/categoria/5946305"] });
    conferir("POST: inativo, normal, slug em apelido, fiscal em texto", [corpoPost.ativo, corpoPost.tipo, corpoPost.usado, corpoPost.apelido, corpoPost.icms_origin_code, corpoPost.production_type, corpoPost.ncm, corpoPost.altura, corpoPost.profundidade, corpoPost.peso], [false, "normal", false, "clp-fx3u", "0", TEXTO_DO_TIPO_PRODUCAO.REVENDA, "8537.10.20", 3, 7, 0.5]);
    conferir("POST: sem chave nula e sem SEO", ["url_video_youtube" in corpoPost, "seo_title" in corpoPost, "preco_cheio" in corpoPost], [false, false, false]);
    conferir("POST: categorias vazias ficam de fora", "categorias" in montarCorpoDeCadastroLI({ sku: "x", rise, descricaoHtml: "", marcaUri: null, categoriasUris: [] }), false);
    const put = mesclarCorpoLI(produtoLI, { ...rise, nome: "Novo", slug: "outro", seoTitulo: "S2" }, ["nome", "slug", "seoTitulo"], { descricaoHtml: "<p>Texto</p>", marcaUri: "/api/v1/marca/16306688", categoriasUris: [] });
    conferir("PUT: troca so o nome; slug e SEO nao entram", [put.nome, put.apelido, "seo_title" in put], ["Novo", "/clp-fx3u", false]);
    conferir("PUT: sem chaves so de leitura (preco, estoque, imagens, url, seo)", [...CHAVES_SO_LEITURA].filter((chave) => chave in put), []);
    conferir("PUT: categorias vazias no Rise mantem as da LI", mesclarCorpoLI(produtoLI, { ...rise, categorias: [] }, ["categorias"], { descricaoHtml: "", marcaUri: null, categoriasUris: [] }).categorias, produtoLI.categorias);
    conferir("PUT: categorias alteradas vao como URIs", mesclarCorpoLI(produtoLI, rise, ["categorias"], { descricaoHtml: "", marcaUri: null, categoriasUris: ["/api/v1/categoria/5946305"] }).categorias, ["/api/v1/categoria/5946305"]);
    conferir("PUT: campo alterado vazio no Rise nao entra", mesclarCorpoLI(produtoLI, { ...rise, gtin: null }, ["gtin"], { descricaoHtml: "", marcaUri: null, categoriasUris: [] }).gtin, "7894972605270");
    conferir("PUT: descricao, medidas e destaque mapeados", (({ descricao_completa, profundidade, destaque, ncm }) => ({ descricao_completa, profundidade, destaque, ncm }))(mesclarCorpoLI(produtoLI, { ...rise, comprimento: 9, destaque: true, ncm: "85371090" }, ["descricao", "comprimento", "destaque", "ncm"], { descricaoHtml: "<p>Novo</p>", marcaUri: null, categoriasUris: [] })), { descricao_completa: "<p>Novo</p>", profundidade: 9, destaque: true, ncm: "8537.10.90" });
    conferir("PUT: marca sem URI mantem a da LI", mesclarCorpoLI(produtoLI, rise, ["marca"], { descricaoHtml: "", marcaUri: null, categoriasUris: [] }).marca, "/api/v1/marca/16306688");
    conferir("PUT: origem e tipo de producao nunca sao trocados", (({ icms_origin_code, production_type }) => ({ icms_origin_code, production_type }))(mesclarCorpoLI(produtoLI, rise, ["origem", "tipoProducao"], { descricaoHtml: "", marcaUri: null, categoriasUris: [] })), { icms_origin_code: null, production_type: null });
    conferir("PUT: nao altera o original", [produtoLI.nome, "preco_cheio" in produtoLI], ["CLP FX3U", true]);
  }

  {
    console.log("\nRegras puras: rascunho, esquema e validacao");
    const ctxProd = { id: "p1", sku: "100404", tituloBase: "CLP FX3U 24MR", descricaoBase: "Linha 1\n\nLinha 2", marca: "MITSUBISHI", conferido: true, ncm: "85371020", origem: 0, tipoProducao: "REVENDA", ean: "x", pesoKg: 0.5, alturaCm: 2, larguraCm: 12, comprimentoCm: 6, videoUrl: null };
    const inicial = rascunhoInicialLI(ctxProd);
    conferir("rascunho inicial", inicial, { produtoId: "p1", titulo: "CLP FX3U 24MR", slug: "clp-fx3u-24mr", descricao: "Linha 1\n\nLinha 2", marca: "MITSUBISHI", categorias: [], destaque: false, videoUrl: null, seo: { title: "CLP FX3U 24MR", description: "Linha 1" }, especificacoes: true });
    conferir("rascunho inicial de produto sem texto", rascunhoInicialLI({ id: "p2" }), { produtoId: "p2", titulo: "", slug: "", descricao: "", marca: "", categorias: [], destaque: false, videoUrl: null, seo: { title: "", description: "" }, especificacoes: true });
    conferir("vinculo traz slug, categorias e destaque da LI", rascunhoDaLI(inicial, { slug: "clp-da-li", categorias: ["1", "2"], destaque: true, nome: "Outro" }), { ...inicial, slug: "clp-da-li", categorias: ["1", "2"], destaque: true });
    conferir("vinculo sem slug na LI mantem o do rascunho", rascunhoDaLI(inicial, { slug: null, categorias: [], destaque: false }).slug, "clp-fx3u-24mr");
    conferir("titulo ate 255 (limite medido na LI)", LIMITES_LI.titulo, 255);
    const lido = RascunhoLISchema.safeParse({ ...inicial, extra: 1 });
    conferir("esquema descarta chave estranha e aceita o rascunho", [lido.success, "extra" in (lido.data ?? {})], [true, false]);
    conferir("esquema recusa categorias que nao sao texto", RascunhoLISchema.safeParse({ ...inicial, categorias: [1] }).success, false);
    conferir("esquema recusa titulo acima de 255", RascunhoLISchema.safeParse({ ...inicial, titulo: "x".repeat(256) }).success, false);
    conferir("esquema completa o que faltar", RascunhoLISchema.parse({ produtoId: "p3" }), { produtoId: "p3", titulo: "", slug: "", descricao: "", marca: "", categorias: [], destaque: false, videoUrl: null, seo: { title: "", description: "" }, especificacoes: true });
    conferir("ABAS_LI", ABAS_LI.map((a) => a.id), ["geral", "seo", "descricao", "fiscal", "envio", "previa"]);
    conferir("rotulo da ultima aba", ABAS_LI.at(-1).rotulo, "Previa e sincronizacao");
    const problemas = validarRascunhoLI({ ...inicial, titulo: "", slug: "Ré", categorias: ["9"], seo: { title: "t".repeat(71), description: "" } }, { produto: { ...ctxProd, conferido: false, ncm: null }, categoriasDaLI: [{ id: "1" }] });
    conferir("bloqueantes: titulo, slug, nao conferido", problemas.filter((p) => p.bloqueante).map((p) => p.campo), ["titulo", "slug", "produto"]);
    conferir("alertas: ncm, categoria inexistente, seo longo", ["ncm", "categorias", "seoTitulo"].every((c) => problemas.some((p) => p.campo === c && !p.bloqueante)), true);
    conferir("todo problema tem aba conhecida", problemas.every((p) => ABAS_LI.some((a) => a.id === p.aba)), true);
    conferir("rascunho completo sem problema", validarRascunhoLI({ ...inicial, categorias: ["1"] }, { produto: ctxProd, categoriasDaLI: [{ id: "1" }] }), []);
    conferir("sem a lista ao vivo nao acusa categoria inexistente", validarRascunhoLI({ ...inicial, categorias: ["9"] }, { produto: ctxProd, categoriasDaLI: null }), []);
    const faltas = validarRascunhoLI({ ...inicial, marca: "", categorias: [] }, { produto: { ...ctxProd, ean: null, pesoKg: null, alturaCm: null }, categoriasDaLI: null }).map((p) => p.campo);
    conferir("alertas: sem gtin, marca, categoria, peso e medida", ["gtin", "marca", "categorias", "peso", "medidas"].every((c) => faltas.includes(c)), true);
  }

  {
    console.log("\nBanco: rascunho, vinculo, lista e frases por canal");
    await limpar();
    const configAntes = await prisma.configCanal.findUnique({ where: { canal: "LOJA_INTEGRADA" } });
    const urlPublicaAntes = config.appUrlPublica;
    try {
      const p = await prisma.produto.create({ data: { sku: "ZZ-LI-3", tituloBase: "Fonte 12V", descricaoBase: "Desc", marca: "ACME", ncm: "85044010", conferido: true, pesoKg: "0.250", tipoProducao: "REVENDA" } });
      const q = await prisma.produto.create({ data: { sku: "ZZ-LI-4", tituloBase: "Nao conferido" } });
      conferir("novo rascunho recusa nao Conferido", (await novoRascunhoLI(q.id)).erro, "O produto ZZ-LI-4 ainda nao foi Conferido. So produto Conferido vira anuncio.");
      conferir("novo rascunho de produto inexistente", (await novoRascunhoLI("nao-existe")).ok, false);
      const ctx = await contextoDoProduto(p.id);
      conferir("contexto com Decimal em Number e fiscais", [ctx.sku, ctx.pesoKg, ctx.tipoProducao, ctx.conferido], ["ZZ-LI-3", 0.25, "REVENDA", true]);
      const novo = await novoRascunhoLI(p.id);
      conferir("novo rascunho nasce do produto", [novo.ok, novo.rascunho.titulo, novo.rascunho.slug, novo.contexto.documentos], [true, "Fonte 12V", "fonte-12v", []]);
      const salvo = await salvarRascunhoLI(null, { ...novo.rascunho, categorias: ["10", "20"], seo: { title: "T", description: "D" } });
      conferir("salva o rascunho", salvo.ok, true);
      const deNovo = await salvarRascunhoLI(null, { ...novo.rascunho, categorias: ["10", "20"], titulo: "Fonte 12V 5A" });
      conferir("segundo salvar sem id atualiza o mesmo anuncio (um por produto)", deNovo.id, salvo.id);
      const carregado = await carregarAnuncioLI(salvo.id);
      conferir("carrega titulo da coluna e categorias do dados", [carregado.rascunho.titulo, carregado.rascunho.categorias, carregado.vinculo.idExterno], ["Fonte 12V 5A", ["10", "20"], null]);
      conferir("categoriaExternaId e a primeira categoria", (await prisma.anuncio.findUnique({ where: { id: salvo.id } })).categoriaExternaId, "10");
      conferir("carregar id inexistente ou vazio", [(await carregarAnuncioLI("x")).ok, (await carregarAnuncioLI("")).ok], [false, false]);
      conferir("anuncio LI do produto", (await anuncioLIDoProduto(p.id))?.id, salvo.id);
      await vincularPeloSku(p.id, { idItemExterno: "401", url: "https://loja/x", ativo: true, slug: "fonte-da-li", categorias: ["30"], destaque: true });
      const vinculado = await carregarAnuncioLI(salvo.id);
      conferir("vinculo grava idExterno, url, ATIVA e traz slug/categorias/destaque da LI", [vinculado.vinculo.idExterno, vinculado.vinculo.situacaoCanal, vinculado.rascunho.slug, vinculado.rascunho.categorias, vinculado.rascunho.destaque, vinculado.rascunho.titulo], ["401", "ATIVA", "fonte-da-li", ["30"], true, "Fonte 12V 5A"]);
      conferir("vinculo deixa o anuncio PUBLICADO", vinculado.status, "PUBLICADO");
      conferir("urlLojaIntegrada preenchida pelo vinculo", (await prisma.produto.findUnique({ where: { id: p.id } })).urlLojaIntegrada, "https://loja/x");
      conferir("anuncio vinculado continua editavel", (await salvarRascunhoLI(salvo.id, { ...vinculado.rascunho, titulo: "Fonte 12V 5A bivolt" })).ok, true);
      conferir("editar nao apaga o vinculo", (await carregarAnuncioLI(salvo.id)).vinculo.idExterno, "401");
      const r = await prisma.produto.create({ data: { sku: "ZZ-LI-5", tituloBase: "Sem rascunho", conferido: true } });
      const { anuncioId } = await vincularPeloSku(r.id, { idItemExterno: "402", url: "https://loja/y", ativo: false, slug: "sem-rascunho-li", categorias: [], destaque: false });
      const criadoNoVinculo = await carregarAnuncioLI(anuncioId);
      conferir("vinculo sem rascunho cria o anuncio a partir do produto, PAUSADA", [criadoNoVinculo.rascunho.titulo, criadoNoVinculo.rascunho.slug, criadoNoVinculo.vinculo.situacaoCanal], ["Sem rascunho", "sem-rascunho-li", "PAUSADA"]);
      conferir("lista acha por sku sem caixa", (await listarAnunciosLI({ busca: "zz-li-3" })).linhas.map((l) => l.sku), ["ZZ-LI-3"]);
      conferir("lista acha por titulo sem caixa", (await listarAnunciosLI({ busca: "BIVOLT" })).linhas.map((l) => [l.sku, l.idExterno]), [["ZZ-LI-3", "401"]]);
      conferir("lista pagina fora do intervalo cai na ultima", (await listarAnunciosLI({ busca: "zz-li-", pagina: 99 })).pagina, 1);
      await prisma.produtoArquivo.create({ data: { produtoId: p.id, tipo: "DOCUMENTO", arquivo: "abc.pdf", nomeOriginal: "Manual.pdf" } });
      conferir("documentos: sem endereco publico, nenhum", await documentosDoProduto({ id: p.id, sku: "ZZ-LI-3" }), []);
      config.appUrlPublica = "https://rise.exemplo.com/";
      conferir("documentos: com endereco publico, url absoluta e nome real", await documentosDoProduto({ id: p.id, sku: "ZZ-LI-3" }), [{ url: "https://rise.exemplo.com/api/arquivos/ZZ-LI-3/documentos/abc.pdf?v=2", nome: "Manual.pdf" }]);
      config.appUrlPublica = urlPublicaAntes;
      await prisma.produto.update({ where: { id: p.id }, data: { conferido: false } });
      conferir("salvar recusa produto que deixou de ser Conferido", (await salvarRascunhoLI(salvo.id, novo.rascunho)).ok, false);
      conferir("salvar recusa rascunho de outro formato", (await salvarRascunhoLI(null, { produtoId: p.id, categorias: [1] })).ok, false);
      conferir("frases por canal: LI e ML separadas", [(await gravarFrasesDoCanal("LOJA_INTEGRADA", "Com nota fiscal")).frases, Array.isArray((await lerConfigCanal("MERCADO_LIVRE")).frases)], [["Com nota fiscal"], true]);
      conferir("frases da LI lidas de volta", (await lerConfigCanal("LOJA_INTEGRADA")).frases, ["Com nota fiscal"]);
      conferir("canal desconhecido e recusado", (await gravarFrasesDoCanal("OUTRO", "x")).ok, false);
    } finally {
      config.appUrlPublica = urlPublicaAntes;
      if (configAntes) {
        await prisma.configCanal.upsert({ where: { canal: "LOJA_INTEGRADA" }, create: { canal: "LOJA_INTEGRADA", frasesFixas: configAntes.frasesFixas }, update: { frasesFixas: configAntes.frasesFixas } });
      } else {
        await prisma.configCanal.deleteMany({ where: { canal: "LOJA_INTEGRADA" } });
      }
    }
  }

  {
    console.log("\nCliente da LI, trava por codigo, LI falsa e icone");
    const cli = clienteLI();
    let recusa = null;
    try { cli.exigirEscrita("100404"); } catch (e) { recusa = e.message; }
    conferir("trava geral fechada recusa citando LI_ESCRITA", /LI_ESCRITA/.test(recusa ?? ""), true);
    const travasAntes = { ...config.travas };
    try {
      config.travas.liEscrita = true;
      config.travas.liCodigosLiberados = ["ZZ-TESTE-LI"];
      let porCodigo = null;
      try { cli.exigirEscrita("100404"); } catch (e) { porCodigo = e.message; }
      conferir("trava por codigo recusa SKU fora da lista citando LI_ESCRITA_CODIGOS", /LI_ESCRITA_CODIGOS/.test(porCodigo ?? ""), true);
      let liberado = "passou";
      try { cli.exigirEscrita("zz-teste-li"); } catch (e) { liberado = e.message; }
      conferir("trava por codigo libera o SKU da lista, sem caixa", liberado, "passou");
    } finally {
      Object.assign(config.travas, travasAntes);
    }
    const falsa = criarLojaIntegradaFalsa({
      produtos: [{ id: 401, sku: "100404", nome: "CLP", apelido: "/clp", url: "/clp", ativo: true, removido: false, categorias: ["/api/v1/categoria/5"], marca: "/api/v1/marca/1", imagens: [{ id: 9 }], seo: "/api/v1/seo/77" }],
      marcas: [{ id: 1, nome: "Mitsubishi" }],
      categorias: [{ id: 5, nome: "CLP" }, { id: 6, nome: "IHM", categoria_pai: "/api/v1/categoria/5" }],
      seos: { 77: { title: "", description: "" } },
    });
    conferir("GET /produto?sku= filtra sem caixa", (await falsa.get("/produto", { sku: "100404" })).dados.objects.map((p) => p.id), [401]);
    conferir("GET /produto/{id} inexistente da 404", (await falsa.get("/produto/9")).status, 404);
    let semTrava = null;
    try { await falsa.put("/produto/401", { nome: "x" }); } catch (e) { semTrava = e.message; }
    conferir("LI falsa recusa escrita sem exigirEscrita", semTrava, "LI falsa: escrita sem exigirEscrita");
    falsa.exigirEscrita("100404");
    conferir("PUT com chave so de leitura da 400", (await falsa.put("/produto/401", { nome: "x", imagens: [] })).status, 400);
    const decimal = await falsa.put("/produto/401", { nome: "x", altura: 2.5 });
    conferir("PUT com medida decimal da 400 sem corpo (como a LI)", [decimal.status, decimal.dados], [400, null]);
    conferir("PUT com nome acima de 255 da 400", (await falsa.put("/produto/401", { nome: "x".repeat(256) })).status, 400);
    const substituido = (await falsa.put("/produto/401", { nome: "Novo", sku: "100404", tipo: "normal", icms_origin_code: "2", production_type: "Revenda" })).dados;
    conferir("PUT inteiro: ausente vira null, mas categorias e marca ausentes ficam (medido)", [substituido.apelido, substituido.categorias, substituido.marca], [null, ["/api/v1/categoria/5"], "/api/v1/marca/1"]);
    conferir("PUT: so leitura ficam (imagens, url); fiscais ignorados", [substituido.imagens.length, substituido.url, substituido.seo_title, substituido.icms_origin_code, substituido.production_type], [1, "/clp", "", null, null]);
    conferir("PUT com seo_title (so de leitura no Rise) da 400", (await falsa.put("/produto/401", { nome: "Novo", seo_title: "x" })).status, 400);
    const limpo = (await falsa.put("/produto/401", { nome: "Novo", categorias: [], marca: null })).dados;
    conferir("PUT com categorias [] e marca null apaga (medido)", [limpo.categorias, limpo.marca], [[], null]);
    conferir("POST com SKU repetido da 400 com error.sku", (await falsa.post("/produto", { sku: "100404", nome: "Dup", tipo: "normal" })).dados?.error?.[0]?.sku?.startsWith("Erro de integridade"), true);
    const criado = await falsa.post("/produto", { sku: "ZZ-NOVO", nome: "Novo produto", tipo: "normal", ativo: false, apelido: "novo-produto" });
    conferir("POST cria com id, url, seo e inativo", [criado.status, typeof criado.dados.id, criado.dados.url, typeof criado.dados.seo, criado.dados.ativo], [201, "number", "/novo-produto", "string", false]);
    const seoId = criado.dados.seo.split("/").filter(Boolean).at(-1);
    await falsa.put(`/seo/${seoId}`, { title: "T", description: "D" });
    conferir("PUT /seo grava e o detalhe mostra", [(await falsa.get(`/seo/${seoId}`)).dados.title, (await falsa.get(`/produto/${criado.dados.id}`)).dados.seo_title], ["T", "T"]);
    await falsa.put(`/produto/${criado.dados.id}/alias?replace_main=true`, { absolute_path: "/outro" });
    const comAlias = (await falsa.get(`/produto/${criado.dados.id}`)).dados;
    conferir("/alias muda o url e mantem o apelido (medido)", [comAlias.url, comAlias.apelido], ["/outro", "/novo-produto"]);
    conferir("POST /marca devolve URI", (await falsa.post("/marca", { nome: "Nova" })).dados.resource_uri.startsWith("/api/v1/marca/"), true);
    conferir("GET /categoria pagina com meta", (await falsa.get("/categoria", { limit: 1 })).dados.meta.next !== null, true);
    conferir("GET /marca lista", (await falsa.get("/marca", { limit: 100 })).dados.objects.map((m) => m.nome), ["Mitsubishi", "Nova"]);
    conferir("chamadas registradas", falsa.chamadas.length >= 5, true);
    let desconhecido = null;
    try { await falsa.get("/qualquer"); } catch (e) { desconhecido = e.message; }
    conferir("endpoint desconhecido lanca", /desconhecido/.test(desconhecido ?? ""), true);
    conferir("icone: nao conferido e cinza sem selo", estadoDoIconeLI({ conferido: false, sincronizadoEm: new Date(), assinaturaGuardada: "a", assinaturaAtual: "b" }), { cor: "cinza", divergente: false, conferido: false });
    conferir("icone: sincronizado e igual e verde", estadoDoIconeLI({ conferido: true, sincronizadoEm: new Date(), assinaturaGuardada: "a", assinaturaAtual: "a" }), { cor: "verde", divergente: false, conferido: true });
    conferir("icone: assinatura mudou acende o selo", estadoDoIconeLI({ conferido: true, sincronizadoEm: new Date(), assinaturaGuardada: "a", assinaturaAtual: "b" }).divergente, true);
    conferir("icone: nunca sincronizado e cinza sem selo", estadoDoIconeLI({ conferido: true, sincronizadoEm: null, assinaturaGuardada: null, assinaturaAtual: "b" }), { cor: "cinza", divergente: false, conferido: true });
    const produtoIcone = { id: "p", sku: "X", conferido: true, ncm: "85371020", pesoKg: 0.5 };
    const anuncioIcone = { produtoId: "p", titulo: "CLP", descricao: "Texto", dados: { slug: "clp", categorias: ["5"] }, sincronizadoEm: new Date() };
    const assinaturaCerta = assinaturaLI(normalizarDoRiseLI(produtoIcone, { produtoId: "p", titulo: "CLP", slug: "clp", descricao: "Texto", marca: "", categorias: ["5"], destaque: false, videoUrl: null, seo: { title: "", description: "" }, especificacoes: true }, { frases: [], documentos: [] }));
    conferir("iconeLIDoProduto: igual ao guardado e verde", iconeLIDoProduto(produtoIcone, { ...anuncioIcone, hashConteudo: assinaturaCerta }, { frases: [], documentos: [] }), { cor: "verde", divergente: false, conferido: true });
    conferir("iconeLIDoProduto: frase nova acende o selo", iconeLIDoProduto(produtoIcone, { ...anuncioIcone, hashConteudo: assinaturaCerta }, { frases: ["Com nota"], documentos: [] }).divergente, true);
    conferir("iconeLIDoProduto: sem anuncio e cinza", iconeLIDoProduto(produtoIcone, null, {}), { cor: "cinza", divergente: false, conferido: true });
    conferir("produtoIdValido reexportado", typeof produtoIdValido, "function");
  }

  {
    console.log("\nLeitura: busca por SKU, detalhe e pop-up");
    await limpar();
    const prodL = await prisma.produto.create({ data: { sku: "ZZ-LI-5", tituloBase: "Sensor", marca: "ACME", ncm: "90261000", conferido: true } });
    const naoConf = await prisma.produto.create({ data: { sku: "ZZ-LI-6", tituloBase: "Outro" } });
    const lixo = await prisma.produto.create({ data: { sku: "ZZ-LI-7", tituloBase: "Lixo", conferido: true } });
    const dup = await prisma.produto.create({ data: { sku: "ZZ-LI-10", tituloBase: "Dup", conferido: true } });
    const novoNaLI = await prisma.produto.create({ data: { sku: "ZZ-LI-8", tituloBase: "Novo", conferido: true } });
    const li2 = criarLojaIntegradaFalsa({
      produtos: [
        { id: 501, sku: "zz-li-5", nome: "Sensor", apelido: "/sensor", ativo: true, removido: false, ncm: "9026.10.00", marca: "/api/v1/marca/7", categorias: ["/api/v1/categoria/3"], seo: "/api/v1/seo/900", production_type: "Revenda", icms_origin_code: "0" },
        { id: 502, sku: "ZZ-LI-7", nome: "Lixo", removido: true },
        { id: 503, sku: "ZZ-LI-10", nome: "Dup A" },
        { id: 504, sku: "zz-li-10", nome: "Dup B" },
      ],
      marcas: [{ id: 7, nome: "Acme" }],
      categorias: [{ id: 3, nome: "Sensores", categoria_pai: null }, { id: 4, nome: "Temperatura", categoria_pai: "/api/v1/categoria/3" }],
      seos: { 900: { title: "", description: "" } },
    });
    conferir("busca acha sem caixa", (await buscarNaLI(li2, "ZZ-LI-5")).situacao, "existe");
    conferir("busca: removido", (await buscarNaLI(li2, "ZZ-LI-7")).situacao, "removido");
    conferir("busca: nao existe", (await buscarNaLI(li2, "ZZ-LI-8")).situacao, "nao_existe");
    conferir("busca: duplicado", (await buscarNaLI(li2, "ZZ-LI-10")).situacao, "duplicado");
    conferir("busca usa o filtro por SKU da API", li2.chamadas.filter((c) => c.caminho === "/produto" && c.params?.sku === "ZZ-LI-5").length, 1);
    const detalheL = await lerDetalheDaLI(li2, 501);
    conferir("detalhe traz seo e nome da marca", [detalheL.marcaNome, detalheL.seo.title, detalheL.produto.id], ["Acme", "", 501]);
    conferir("categorias com caminho", await listarCategoriasDaLI(li2), [{ id: "3", nome: "Sensores", paiId: null, caminho: "Sensores" }, { id: "4", nome: "Temperatura", paiId: "3", caminho: "Sensores > Temperatura" }]);
    conferir("marcas", await listarMarcasDaLI(li2), [{ id: "7", nome: "Acme", uri: "/api/v1/marca/7" }]);
    const chamadasAntes = li2.chamadas.length;
    const popNaoConf = await lerParaPopupLI(naoConf.id, li2);
    conferir("pop-up de nao Conferido nao chama a LI", [popNaoConf.ok, popNaoConf.conferido, li2.chamadas.length - chamadasAntes], [true, false, 0]);
    const popup = await lerParaPopupLI(prodL.id, li2);
    conferir("pop-up vincula na primeira abertura e lista diferencas", [popup.ok, popup.situacao, popup.vinculadoAgora, popup.idExterno, popup.diferencas.length > 0], [true, "existe", true, "501", true]);
    conferir("marca do Rise existe na LI (sem caixa)", popup.marcaExisteNaLI, true);
    conferir("iguais + diferencas = campos de envio", popup.iguais + popup.diferencas.length, CAMPOS_DE_ENVIO_LI.length);
    const segunda = await lerParaPopupLI(prodL.id, li2);
    conferir("segunda abertura nao vincula de novo", segunda.vinculadoAgora, false);
    const aberto = await carregarAnuncioLI(segunda.anuncioId);
    conferir("vinculo trouxe slug e categorias da LI para o rascunho", [aberto.rascunho.slug, aberto.rascunho.categorias], ["sensor", ["3"]]);
    conferir("escrita fechada tem motivo", [popup.escrita.liberada, /LI_ESCRITA/.test(popup.escrita.motivo)], [false, true]);
    const popLixo = await lerParaPopupLI(lixo.id, li2);
    conferir("pop-up de produto na lixeira da LI", [popLixo.ok, popLixo.situacao, popLixo.erro], [false, "removido", "O codigo ZZ-LI-7 esta na lixeira da Loja Integrada: restaure-o la antes de sincronizar."]);
    const popDup = await lerParaPopupLI(dup.id, li2);
    conferir("pop-up de SKU duplicado na LI", [popDup.ok, popDup.situacao, /mais de um/.test(popDup.erro)], [false, "duplicado", true]);
    const popNovo = await lerParaPopupLI(novoNaLI.id, li2);
    conferir("pop-up de produto que nao existe na LI oferece cadastro", [popNovo.ok, popNovo.situacao, popNovo.diferencas], [true, "nao_existe", []]);
    const liFora = criarLojaIntegradaFalsa({ falhas: { "GET /produto": 429 } });
    const popLimite = await lerParaPopupLI(prodL.id, liFora);
    conferir("limite de chamadas vira recado", [popLimite.ok, /100 chamadas por minuto/.test(popLimite.erro)], [false, true]);
    const liToken = criarLojaIntegradaFalsa({ falhas: { "GET /produto": 401 } });
    conferir("token recusado vira recado", /Personal Token/.test((await lerParaPopupLI(prodL.id, liToken)).erro), true);
    await prisma.produto.update({ where: { id: prodL.id }, data: { tipoProducao: "FABRICACAO_PROPRIA" } });
    const popFiscal = await lerParaPopupLI(prodL.id, li2);
    conferir("aviso fiscal: tipo de producao diferente, ajuste no painel", popFiscal.avisos.some((a) => /Tipo de producao/.test(a) && /painel da Loja Integrada/.test(a)), true);
    conferir("aviso fiscal nao entra nas diferencas", popFiscal.diferencas.some((d) => d.campo === "tipoProducao"), false);
  }

  // Blocos das tarefas seguintes entram aqui, antes do finally.
} catch (erro) {
  falhas++;
  console.log(`FALHA inesperada: ${erro.stack ?? erro.message}`);
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTodos os testes da sincronizacao com a Loja Integrada OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);

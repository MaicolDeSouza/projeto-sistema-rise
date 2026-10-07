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
const { LIMITE_DA_DESCRIPTION_SEO, LIMITE_DO_TITULO_SEO, cortarNaFrase, cortarNaPalavra, descriptionPadrao, tituloSeoPadrao } = await import("../src/lib/canaisDeVenda/li/seo.js");
const { montarDescricaoLI } = await import("../src/lib/canaisDeVenda/li/descricao.js");
const { htmlParaTexto } = await import("../src/lib/integracoes/normalizacao.js");
const { CAMPOS_DE_ENVIO_LI, CAMPOS_SO_LEITURA_LI, TEXTO_DO_TIPO_PRODUCAO, TIPO_PRODUCAO_DA_LI, assinaturaLI, avisosFiscaisLI, contarDivergencias, diferencasLI, normalizarDaLI, normalizarDoRiseLI } = await import("../src/lib/canaisDeVenda/li/campos.js");
const { CHAVES_SO_LEITURA, formatarNcmLI, mesclarCorpoLI, montarCorpoDeCadastroLI } = await import("../src/lib/canaisDeVenda/li/corpo.js");
const { rascunhoDaLI, rascunhoInicialLI } = await import("../src/lib/canaisDeVenda/li/rascunho.js");
const { LIMITES_LI, RascunhoLISchema } = await import("../src/lib/canaisDeVenda/li/esquema.js");
const { ABAS_LI, validarRascunhoLI } = await import("../src/lib/canaisDeVenda/li/validacao.js");
const { anuncioLIDoProduto, carregarAnuncioLI, contextoDoProduto, documentosDoProduto, listarAnunciosLI, novoRascunhoLI, rascunhoDoAnuncio, salvarRascunhoLI, vincularPeloSku } = await import("../src/lib/canaisDeVenda/li/banco.js");
const { gravarFrasesDoCanal, lerConfigCanal } = await import("../src/lib/canaisDeVenda/configuracao.js");
const { config } = await import("../src/lib/integracoes/config.js");
const { clienteLI } = await import("../src/lib/canaisDeVenda/li/cliente.js");
const { estadoDoIconeLI, iconeLIDoProduto, produtoIdValido } = await import("../src/lib/canaisDeVenda/li/estado.js");
const { criarLojaIntegradaFalsa } = await import("./lib/lojaIntegradaFalsa.js");
const { buscarNaLI, lerDetalheDaLI, lerParaPopupLI, listarCategoriasDaLI, listarMarcasDaLI } = await import("../src/lib/canaisDeVenda/li/leitura.js");
const { cadastrarNaLI, sincronizarProdutoLI } = await import("../src/lib/canaisDeVenda/li/envio.js");
const { mudouNaLI, resumirEnvioLI, valorParaTela } = await import("../src/lib/canaisDeVenda/li/apresentacao.js");
const { ROTULO_DO_TIPO_PRODUCAO, STATUS_LI } = await import("../src/lib/canaisDeVenda/li/rotulos.js");

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
    conferir("limites do slug e do SEO", [LIMITE_DO_SLUG, LIMITE_DO_TITULO_SEO, LIMITE_DA_DESCRIPTION_SEO], [100, 70, 160]);
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
    conferir("description padrao <= 160 (o limite que o Google mostra)", descriptionPadrao("palavra ".repeat(60)).length <= 160, true);
    const longa = "A Placa Uno R3 usa o ATmega328P e roda a 16 MHz com tensao de 5V. " + "Ela e compativel com os shields do Arduino e com a IDE oficial, e acompanha cabo USB para gravar o codigo. ".repeat(3);
    conferir("description padrao corta na ultima FRASE inteira", descriptionPadrao(longa), "A Placa Uno R3 usa o ATmega328P e roda a 16 MHz com tensao de 5V.");
    conferir("cortarNaFrase: cabe inteiro fica igual", cortarNaFrase("Uma frase. Outra.", 50), "Uma frase. Outra.");
    conferir("cortarNaFrase: nenhuma frase cabe, corta na palavra", cortarNaFrase("Uma frase muito comprida sem ponto nenhum ate o fim", 20), "Uma frase muito");
    conferir("cortarNaFrase: decimal com ponto nao e fim de frase", cortarNaFrase("Tensao de 3.3V e 5V no mesmo modulo. Segunda frase bem longa que nao cabe.", 40), "Tensao de 3.3V e 5V no mesmo modulo.");
    conferir("description de vazio e nulo", [descriptionPadrao(""), descriptionPadrao(null)], ["", ""]);
  }

  {
    console.log("\nRegras puras: descricao HTML");
    const P = (miolo) => `<p><span style="font-size:16px;">${miolo}</span></p>`;
    conferir("escapa tag, e-comercial e aspas", montarDescricaoLI({ descricao: `a <b> & c "x" 'y'` }), P("a &lt;b&gt; &amp; c &quot;x&quot; &#39;y&#39;"));
    conferir("quebra simples vira br, dupla vira paragrafo, CRLF vale um", montarDescricaoLI({ descricao: "l1\r\nl2\r\n\r\nl3" }), P("l1<br>l2") + P("l3"));
    conferir("vazio nao gera nada", [montarDescricaoLI({ descricao: "  \n " }), montarDescricaoLI({ descricao: null })], ["", ""]);
    const texto = "PLACA UNO R3\n\nA Placa faz X.\n\nEspecificações técnicas:\n- SRAM: 2KB;\n- Peso: 24g;\n\nItens inclusos: (Cód:100101)\n- 01 Placa;\n\nGarantia:\n- Garantia Legal de 90 dias;";
    conferir(
      "titulo do produto e titulos de secao em negrito; itens normais",
      montarDescricaoLI({ descricao: texto }),
      P("<strong>PLACA UNO R3</strong>") + P("A Placa faz X.") + P("<strong>Especificações técnicas:</strong><br>- SRAM: 2KB;<br>- Peso: 24g;") + P("<strong>Itens inclusos: (Cód:100101)</strong><br>- 01 Placa;") + P("<strong>Garantia:</strong><br>- Garantia Legal de 90 dias;"),
    );
    const docs = [{ url: "https://rise.exemplo/a.pdf?v=2", nome: "Datasheet <v2>.pdf" }, { url: "javascript:alert(1)", nome: "x" }];
    const blocoDocs = P("<strong>Documentos / Arquivos para download:</strong><br>- <a href=\"https://rise.exemplo/a.pdf?v=2\">Datasheet &lt;v2&gt;.pdf</a>;");
    conferir("documentos logo abaixo das Especificacoes tecnicas (so http)", montarDescricaoLI({ descricao: texto, documentos: docs }).includes(P("<strong>Especificações técnicas:</strong><br>- SRAM: 2KB;<br>- Peso: 24g;") + blocoDocs + P("<strong>Itens inclusos: (Cód:100101)</strong><br>- 01 Placa;")), true);
    conferir("sem Especificacoes, documentos acima de Garantia", montarDescricaoLI({ descricao: "Texto.\n\nGarantia:\n- 90 dias;", documentos: docs }), P("Texto.") + blocoDocs + P("<strong>Garantia:</strong><br>- 90 dias;"));
    conferir("sem as duas secoes, documentos no fim do texto", montarDescricaoLI({ descricao: "Texto.", documentos: docs }), P("Texto.") + blocoDocs);
    conferir("sem documento com http, nao ha secao", montarDescricaoLI({ descricao: "Texto.", documentos: [{ url: "javascript:x", nome: "x" }] }), P("Texto."));
    conferir("frases fixas sairam da LI: passadas, nao entram", montarDescricaoLI({ descricao: "Texto & tal", frases: ["Com nota fiscal"] }), P("Texto &amp; tal"));
    conferir("linha de lista que termina em dois-pontos nao vira titulo", montarDescricaoLI({ descricao: "Uso:\n- Tensao:" }), P("<strong>Uso:</strong><br>- Tensao:"));
    conferir("ida e volta pelo htmlParaTexto", htmlParaTexto(montarDescricaoLI({ descricao: "a <b>\nc\n\nd" }), { paragrafos: true }), "a <b>\nc\n\nd");
    conferir("ida e volta com aspas, & e CRLF", htmlParaTexto(montarDescricaoLI({ descricao: `Diz "x" & 'y'\r\nfim` }), { paragrafos: true }), `Diz "x" & 'y'\nfim`);
    conferir("ida e volta com titulos e documentos", htmlParaTexto(montarDescricaoLI({ descricao: "PLACA\n\nGarantia:\n- 90 dias;", documentos: docs }), { paragrafos: true }), "PLACA\n\nDocumentos / Arquivos para download:\n- Datasheet <v2>.pdf;\n\nGarantia:\n- 90 dias;");
    conferir("htmlParaTexto sem a opcao continua como o Bling usa", htmlParaTexto("<p>a</p><p>b</p>"), "a\nb");
    conferir(
      "a LI regrava <br> como <br />\\r\\n: a quebra crua nao vira paragrafo extra",
      htmlParaTexto('<p><span style="font-size:16px;"><strong>T:</strong><br />\r\n- a;<br />\r\n- b;</span></p>\r\n<p>c</p>', { paragrafos: true }),
      "T:\n- a;\n- b;\n\nc",
    );
  }

  {
    console.log("\nRegras puras: campos, assinatura e diferencas");
    conferir("campos de envio, na ordem, sem os fiscais so de leitura", CAMPOS_DE_ENVIO_LI.map((c) => c.id), ["nome", "descricao", "ncm", "gtin", "mpn", "peso", "altura", "largura", "comprimento", "marca", "categorias", "video", "destaque", "seoTitulo", "seoDescription"]);
    conferir("campos so de leitura: origem e tipo de producao", CAMPOS_SO_LEITURA_LI.map((c) => c.id), ["origem", "tipoProducao"]);
    conferir("texto do tipo de producao e o medido na LI", TEXTO_DO_TIPO_PRODUCAO, { REVENDA: "Revenda", FABRICACAO_PROPRIA: "Fabricação própria" });
    conferir("tipo de producao da LI pelo texto", [TIPO_PRODUCAO_DA_LI("Revenda"), TIPO_PRODUCAO_DA_LI("Fabricação própria"), TIPO_PRODUCAO_DA_LI("outro"), TIPO_PRODUCAO_DA_LI(null)], ["REVENDA", "FABRICACAO_PROPRIA", null, null]);
    const produtoRise = { tituloBase: "x", descricaoBase: "Texto", ncm: "8537.10.20", ean: "7894972605270", modelo: "FX3U", pesoKg: "0.5", alturaCm: "2.3", larguraCm: "12", comprimentoCm: "6.01", origem: 0, tipoProducao: "REVENDA" };
    const rasc = { titulo: " CLP FX3U ", slug: "clp-fx3u", marca: "Mitsubishi", categorias: ["23983023", "5946305", "23983023"], destaque: false, videoUrl: null, seo: { title: "t".repeat(80), description: "" } };
    const rise = normalizarDoRiseLI(produtoRise, rasc, { frases: [], documentos: [] });
    conferir("slug do Rise sai SEMPRE do nome, nao do guardado", normalizarDoRiseLI(produtoRise, { ...rasc, titulo: "Relé 5V", slug: "outro" }, {}).slug, "rele-5v");
    conferir("rise normalizado", rise, { nome: "CLP FX3U", slug: "clp-fx3u", descricao: "Texto", ncm: "85371020", gtin: "7894972605270", mpn: null, peso: 0.5, altura: 3, largura: 12, comprimento: 7, marca: "MITSUBISHI", categorias: ["23983023", "5946305"], video: null, destaque: false, seoTitulo: "t".repeat(70), seoDescription: null, origem: 0, tipoProducao: "REVENDA" });
    const produtoLI = { id: 1, nome: "CLP FX3U", apelido: "/clp-fx3u", descricao_completa: "<p>Texto</p>", ncm: "8537.10.20", gtin: "7894972605270", mpn: null, peso: "0.500", altura: 3, largura: 12, profundidade: 7, marca: "/api/v1/marca/16306688", categorias: ["/api/v1/categoria/5946305", "/api/v1/categoria/23983023"], url_video_youtube: null, destaque: false, icms_origin_code: "0", production_type: TEXTO_DO_TIPO_PRODUCAO.REVENDA, seo_title: "", seo_description: "" };
    const li = normalizarDaLI(produtoLI, { title: "t".repeat(70), description: "" }, { marcaNome: "Mitsubishi" });
    conferir("LI normalizada igual ao Rise", li, rise);
    conferir("MPN nunca sai do Modelo do cadastro (nao se aplica aos produtos da loja)", normalizarDoRiseLI({ ...produtoRise, modelo: "UNO R3" }, rasc, {}).mpn, null);
    conferir("MPN preenchido na loja e diferenca: o Rise o quer em branco", diferencasLI({ ...rise, mpn: null }, { ...li, mpn: "UNO R3 SMD CH340" }).filter((d) => d.campo === "mpn").map((d) => d.tipo), ["diferente"]);
    conferir("MPN em branco dos dois lados nao e diferenca", diferencasLI(rise, li).some((d) => d.campo === "mpn"), false);
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
      { descricaoBase: "Texto", ncm: "8537.10.20", ean: "7894972605270", modelo: "FX3U", pesoKg: "0.5", alturaCm: "2.3", larguraCm: "12", comprimentoCm: "6.01", origem: 0, tipoProducao: "REVENDA" },
      { titulo: "CLP FX3U", slug: "clp-fx3u", marca: "Mitsubishi", categorias: ["5946305"], destaque: false, videoUrl: null, seo: { title: "S", description: "" } },
      {},
    );
    const produtoLI = { id: 1, resource_uri: "/api/v1/produto/1", url: "/clp-fx3u", seo: "/api/v1/seo/9", imagens: [{ id: 3 }], preco_cheio: "10.00", estoque_quantidade: 5, nome: "CLP FX3U", apelido: "/clp-fx3u", descricao_completa: "<p>Texto</p>", ncm: "8537.10.20", gtin: "7894972605270", mpn: null, peso: "0.500", altura: 3, largura: 12, profundidade: 7, marca: "/api/v1/marca/16306688", categorias: ["/api/v1/categoria/5946305", "/api/v1/categoria/23983023"], url_video_youtube: null, destaque: false, icms_origin_code: null, production_type: null, seo_title: "", seo_description: "", tags: [] };
    conferir("NCM no formato da loja", [formatarNcmLI("85371020"), formatarNcmLI("8537"), formatarNcmLI(null)], ["8537.10.20", "8537", null]);
    const corpoPost = montarCorpoDeCadastroLI({ sku: "ZZ-LI-2", rise, descricaoHtml: "<p>Texto</p>", marcaUri: "/api/v1/marca/1", categoriasUris: ["/api/v1/categoria/5946305"] });
    conferir("POST: inativo, normal, slug em apelido, fiscal em texto", [corpoPost.ativo, corpoPost.tipo, corpoPost.usado, corpoPost.apelido, corpoPost.icms_origin_code, corpoPost.production_type, corpoPost.ncm, corpoPost.altura, corpoPost.profundidade, corpoPost.peso], [false, "normal", false, "clp-fx3u", "0", TEXTO_DO_TIPO_PRODUCAO.REVENDA, "8537.10.20", 3, 7, 0.5]);
    conferir("POST: sem chave nula e sem SEO", ["url_video_youtube" in corpoPost, "seo_title" in corpoPost, "preco_cheio" in corpoPost], [false, false, false]);
    conferir("POST: sem MPN", "mpn" in corpoPost, false);
    conferir(
      "PUT: MPN alterado limpa com texto vazio (o valor velho da loja sai)",
      mesclarCorpoLI({ ...produtoLI, mpn: "UNO R3 SMD CH340" }, rise, ["mpn"], { descricaoHtml: "", marcaUri: null, categoriasUris: [] }).mpn,
      "",
    );
    conferir("POST: categorias vazias ficam de fora","categorias" in montarCorpoDeCadastroLI({ sku: "x", rise, descricaoHtml: "", marcaUri: null, categoriasUris: [] }), false);
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
    conferir("rascunho inicial", inicial, { produtoId: "p1", titulo: "CLP FX3U 24MR", slug: "clp-fx3u-24mr", marca: "MITSUBISHI", categorias: [], destaque: false, videoUrl: null, seo: { title: "CLP FX3U 24MR", description: "Linha 1" }, imagens: [] });
    conferir("rascunho inicial de produto sem texto", rascunhoInicialLI({ id: "p2" }), { produtoId: "p2", titulo: "", slug: "", marca: "", categorias: [], destaque: false, videoUrl: null, seo: { title: "", description: "" }, imagens: [] });
    conferir("vinculo traz categorias e destaque da LI; o slug segue o nome", rascunhoDaLI(inicial, { slug: "clp-da-li", categorias: ["1", "2"], destaque: true, nome: "Outro" }), { ...inicial, categorias: ["1", "2"], destaque: true });
    conferir("rascunho guardado: slug refeito do titulo", rascunhoDoAnuncio({ produtoId: "p", titulo: "Fonte 12V 5A", dados: { slug: "velho" } }).slug, "fonte-12v-5a");
    conferir("titulo ate 255 (limite medido na LI)", LIMITES_LI.titulo, 255);
    const lido = RascunhoLISchema.safeParse({ ...inicial, extra: 1 });
    conferir("esquema descarta chave estranha e aceita o rascunho", [lido.success, "extra" in (lido.data ?? {})], [true, false]);
    conferir("esquema recusa categorias que nao sao texto", RascunhoLISchema.safeParse({ ...inicial, categorias: [1] }).success, false);
    conferir("esquema recusa titulo acima de 255", RascunhoLISchema.safeParse({ ...inicial, titulo: "x".repeat(256) }).success, false);
    conferir("esquema completa o que faltar", RascunhoLISchema.parse({ produtoId: "p3" }), { produtoId: "p3", titulo: "", slug: "", marca: "", categorias: [], destaque: false, videoUrl: null, seo: { title: "", description: "" }, imagens: [] });
    conferir("rascunho inicial leva as fotos do produto, a principal na frente", rascunhoInicialLI(ctxProd, { fotos: [{ id: "f2", principal: false }, { id: "f1", principal: true }] }).imagens, ["f1", "f2"]);
    conferir("fotos escolhidas nao mudam a assinatura (o envio de foto espera a VPS)", assinaturaLI(normalizarDoRiseLI(ctxProd, { ...inicial, imagens: ["f1"] }, {})), assinaturaLI(normalizarDoRiseLI(ctxProd, inicial, {})));
    conferir("ABAS_LI na ordem do dono", ABAS_LI.map((a) => a.id), ["geral", "imagens", "descricao", "categorias", "envio", "fiscal", "seo", "previa"]);
    conferir("abas com os nomes do cadastro de Produto", ABAS_LI.filter((a) => ["geral", "envio", "fiscal"].includes(a.id)).map((a) => a.rotulo), ["Características", "Peso e dimensões", "Tributação"]);
    conferir("alerta de categoria mora na aba Categorias", validarRascunhoLI({ ...inicial, categorias: [] }, { produto: ctxProd, categoriasDaLI: null }).find((p) => p.campo === "categorias")?.aba, "categorias");
    conferir("rotulo da ultima aba", ABAS_LI.at(-1).rotulo, "Prévia e sincronização");
    const problemas = validarRascunhoLI({ ...inicial, titulo: "", slug: "Ré", categorias: ["9"], seo: { title: "t".repeat(71), description: "" } }, { produto: { ...ctxProd, conferido: false, ncm: null }, categoriasDaLI: [{ id: "1" }] });
    conferir("bloqueantes: titulo e nao conferido (sem nome nao ha slug a acusar)", problemas.filter((p) => p.bloqueante).map((p) => p.campo), ["titulo", "produto", "seoDescription"]);
    conferir(
      "SEO obrigatorio: title e description vazios bloqueiam, na aba SEO",
      validarRascunhoLI({ ...inicial, categorias: ["1"], seo: { title: " ", description: "" } }, { produto: ctxProd, categoriasDaLI: null }).filter((p) => p.bloqueante).map((p) => [p.campo, p.aba]),
      [["seoTitulo", "seo"], ["seoDescription", "seo"]],
    );
    conferir("nome so de simbolos nao gera endereco", validarRascunhoLI({ ...inicial, titulo: "!!!", categorias: ["1"] }, { produto: ctxProd, categoriasDaLI: null }).map((p) => [p.campo, p.bloqueante]), [["slug", true]]);
    conferir("alertas: ncm, categoria inexistente, seo longo", ["ncm", "categorias", "seoTitulo"].every((c) => problemas.some((p) => p.campo === c && !p.bloqueante)), true);
    conferir("todo problema tem aba conhecida", problemas.every((p) => ABAS_LI.some((a) => a.id === p.aba)), true);
    conferir("rascunho completo sem problema", validarRascunhoLI({ ...inicial, categorias: ["1"] }, { produto: ctxProd, categoriasDaLI: [{ id: "1" }] }), []);
    conferir("sem a lista ao vivo nao acusa categoria inexistente", validarRascunhoLI({ ...inicial, categorias: ["9"] }, { produto: ctxProd, categoriasDaLI: null }), []);
    const faltas = validarRascunhoLI({ ...inicial, marca: "", categorias: [] }, { produto: { ...ctxProd, ean: null, pesoKg: null, alturaCm: null }, categoriasDaLI: null }).map((p) => p.campo);
    const gtinLoja = validarRascunhoLI({ ...inicial, categorias: ["1"] }, { produto: { ...ctxProd, ean: null }, categoriasDaLI: null, gtinDaLI: "7894382766950" }).find((p) => p.campo === "gtin");
    conferir("sem GTIN no Rise mas com GTIN na loja: a nota sai com o da loja", [Boolean(gtinLoja), /7894382766950/.test(gtinLoja?.problema ?? ""), /SEM GTIN/.test(gtinLoja?.problema ?? "")], [true, true, false]);
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
      conferir("novo rascunho recusa nao Conferido", (await novoRascunhoLI(q.id)).erro, "O produto ZZ-LI-4 ainda não foi Conferido. Só produto Conferido vira anúncio.");
      conferir("novo rascunho de produto inexistente", (await novoRascunhoLI("nao-existe")).ok, false);
      const ctx = await contextoDoProduto(p.id);
      conferir("contexto com Decimal em Number e fiscais", [ctx.sku, ctx.pesoKg, ctx.tipoProducao, ctx.conferido], ["ZZ-LI-3", 0.25, "REVENDA", true]);
      const fotoA = await prisma.produtoArquivo.create({ data: { produtoId: p.id, tipo: "IMAGEM", arquivo: "a.jpg", principal: false, ordem: 0 } });
      const fotoB = await prisma.produtoArquivo.create({ data: { produtoId: p.id, tipo: "IMAGEM", arquivo: "b.jpg", principal: true, ordem: 1 } });
      await prisma.produtoArquivo.create({ data: { produtoId: p.id, tipo: "IMAGEM", arquivo: "r.jpg", papel: "RESERVA", ordem: 2 } });
      const novo = await novoRascunhoLI(p.id);
      conferir("novo rascunho: as fotos (sem a reserva), a principal na frente", [novo.rascunho.imagens, novo.contexto.fotos.map((f) => [f.id, f.url.includes("/ZZ-LI-3/")])], [[fotoB.id, fotoA.id], [[fotoB.id, true], [fotoA.id, true]]]);
      conferir("novo rascunho nasce do produto", [novo.ok, novo.rascunho.titulo, novo.rascunho.slug, novo.contexto.documentos], [true, "Fonte 12V", "fonte-12v", []]);
      conferir("contexto do editor traz o dominio da loja (com https)", String(novo.contexto.dominioDaLoja ?? "").startsWith("https://"), true);
      const salvo = await salvarRascunhoLI(null, { ...novo.rascunho, categorias: ["10", "20"], seo: { title: "T", description: "D" } });
      conferir("salva o rascunho", salvo.ok, true);
      const deNovo = await salvarRascunhoLI(null, { ...novo.rascunho, categorias: ["10", "20"], titulo: "Fonte 12V 5A" });
      conferir("segundo salvar sem id atualiza o mesmo anuncio (um por produto)", deNovo.id, salvo.id);
      const carregado = await carregarAnuncioLI(salvo.id);
      conferir("carrega titulo da coluna e categorias do dados", [carregado.rascunho.titulo, carregado.rascunho.categorias, carregado.vinculo.idExterno], ["Fonte 12V 5A", ["10", "20"], null]);
      conferir("categoriaExternaId e a primeira categoria", (await prisma.anuncio.findUnique({ where: { id: salvo.id } })).categoriaExternaId, "10");
      conferir("carregar id inexistente ou vazio", [(await carregarAnuncioLI("x")).ok, (await carregarAnuncioLI("")).ok], [false, false]);
      conferir("anuncio LI do produto", (await anuncioLIDoProduto(p.id))?.id, salvo.id);
      conferir("salvar guarda as fotos escolhidas, na ordem", (await carregarAnuncioLI(salvo.id)).rascunho.imagens, [fotoB.id, fotoA.id]);
      conferir("salvar guarda o slug do titulo, nao o que a tela mandou", (await prisma.anuncio.findUnique({ where: { id: salvo.id } })).dados.slug, "fonte-12v-5a");
      await vincularPeloSku(p.id, { idItemExterno: "401", url: "https://loja/x", ativo: true, slug: "fonte-da-li", categorias: ["30"], destaque: true });
      const vinculado = await carregarAnuncioLI(salvo.id);
      conferir("vinculo grava idExterno, url, ATIVA e traz categorias/destaque da LI (slug do nome)", [vinculado.vinculo.idExterno, vinculado.vinculo.situacaoCanal, vinculado.rascunho.slug, vinculado.rascunho.categorias, vinculado.rascunho.destaque, vinculado.rascunho.titulo], ["401", "ATIVA", "fonte-12v-5a", ["30"], true, "Fonte 12V 5A"]);
      conferir("vinculo deixa o anuncio PUBLICADO", vinculado.status, "PUBLICADO");
      conferir("urlLojaIntegrada preenchida pelo vinculo", (await prisma.produto.findUnique({ where: { id: p.id } })).urlLojaIntegrada, "https://loja/x");
      conferir("anuncio vinculado continua editavel", (await salvarRascunhoLI(salvo.id, { ...vinculado.rascunho, titulo: "Fonte 12V 5A bivolt" })).ok, true);
      conferir("editar nao apaga o vinculo", (await carregarAnuncioLI(salvo.id)).vinculo.idExterno, "401");
      const r = await prisma.produto.create({ data: { sku: "ZZ-LI-5", tituloBase: "Sem rascunho", conferido: true } });
      const { anuncioId } = await vincularPeloSku(r.id, { idItemExterno: "402", url: "https://loja/y", ativo: false, slug: "sem-rascunho-li", categorias: [], destaque: false });
      const criadoNoVinculo = await carregarAnuncioLI(anuncioId);
      conferir("vinculo sem rascunho cria o anuncio a partir do produto, PAUSADA", [criadoNoVinculo.rascunho.titulo, criadoNoVinculo.rascunho.slug, criadoNoVinculo.vinculo.situacaoCanal], ["Sem rascunho", "sem-rascunho", "PAUSADA"]);
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
      conferir("frases fixas so no ML: a LI e recusada", [(await gravarFrasesDoCanal("LOJA_INTEGRADA", "Com nota fiscal")).ok, Array.isArray((await lerConfigCanal("MERCADO_LIVRE")).frases)], [false, true]);
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
    conferir("icone: nao conferido e cinza sem selo", estadoDoIconeLI({ conferido: false, sincronizadoEm: new Date(), assinaturaGuardada: "a", assinaturaAtual: "b", vinculadoAoBling: true }), { cor: "cinza", divergente: false, conferido: false, semBling: false });
    conferir("icone: sincronizado, igual e no Bling e verde", estadoDoIconeLI({ conferido: true, sincronizadoEm: new Date(), assinaturaGuardada: "a", assinaturaAtual: "a", vinculadoAoBling: true }), { cor: "verde", divergente: false, conferido: true, semBling: false });
    conferir(
      "icone: sincronizado mas SEM vinculo com o Bling fica cinza e avisa (o Bling controla estoque e pedidos)",
      estadoDoIconeLI({ conferido: true, sincronizadoEm: new Date(), assinaturaGuardada: "a", assinaturaAtual: "a", vinculadoAoBling: false }),
      { cor: "cinza", divergente: false, conferido: true, semBling: true },
    );
    conferir("icone: assinatura mudou acende o selo", estadoDoIconeLI({ conferido: true, sincronizadoEm: new Date(), assinaturaGuardada: "a", assinaturaAtual: "b", vinculadoAoBling: true }).divergente, true);
    conferir("icone: nunca sincronizado e cinza sem selo", estadoDoIconeLI({ conferido: true, sincronizadoEm: null, assinaturaGuardada: null, assinaturaAtual: "b", vinculadoAoBling: true }), { cor: "cinza", divergente: false, conferido: true, semBling: false });
    const produtoIcone = { id: "p", sku: "X", conferido: true, ncm: "85371020", pesoKg: 0.5, blingId: "16715406765" };
    const anuncioIcone = { produtoId: "p", titulo: "CLP", descricao: "Texto", dados: { slug: "clp", categorias: ["5"] }, sincronizadoEm: new Date() };
    const assinaturaCerta = assinaturaLI(normalizarDoRiseLI(produtoIcone, { produtoId: "p", titulo: "CLP", slug: "clp", marca: "", categorias: ["5"], destaque: false, videoUrl: null, seo: { title: "", description: "" } }, { frases: [], documentos: [] }));
    conferir("iconeLIDoProduto: igual ao guardado e verde", iconeLIDoProduto(produtoIcone, { ...anuncioIcone, hashConteudo: assinaturaCerta }, { frases: [], documentos: [] }), { cor: "verde", divergente: false, conferido: true, semBling: false });
    conferir("iconeLIDoProduto: produto sem blingId fica cinza com o aviso", iconeLIDoProduto({ ...produtoIcone, blingId: null }, { ...anuncioIcone, hashConteudo: assinaturaCerta }, {}), { cor: "cinza", divergente: false, conferido: true, semBling: true });
    conferir("iconeLIDoProduto: documento novo acende o selo", iconeLIDoProduto(produtoIcone, { ...anuncioIcone, hashConteudo: assinaturaCerta }, { documentos: [{ url: "https://x/a.pdf", nome: "a.pdf" }] }).divergente, true);
    conferir("iconeLIDoProduto: frase passada nao muda nada", iconeLIDoProduto(produtoIcone, { ...anuncioIcone, hashConteudo: assinaturaCerta }, { frases: ["Com nota"], documentos: [] }).divergente, false);
    conferir("iconeLIDoProduto: sem anuncio e cinza", iconeLIDoProduto(produtoIcone, null, {}), { cor: "cinza", divergente: false, conferido: true, semBling: false });
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
    conferir("vinculo trouxe as categorias da LI; o slug segue o nome", [aberto.rascunho.slug, aberto.rascunho.categorias], [slugDe(aberto.rascunho.titulo), ["3"]]);
    conferir("escrita fechada tem motivo", [popup.escrita.liberada, /LI_ESCRITA/.test(popup.escrita.motivo)], [false, true]);
    const popLixo = await lerParaPopupLI(lixo.id, li2);
    conferir("pop-up de produto na lixeira da LI", [popLixo.ok, popLixo.situacao, popLixo.erro], [false, "removido", "O código ZZ-LI-7 está na lixeira da Loja Integrada: restaure-o lá antes de sincronizar."]);
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
    conferir("aviso fiscal: tipo de producao diferente, ajuste no painel", popFiscal.avisos.some((a) => /Tipo de produção/.test(a) && /painel da Loja Integrada/.test(a)), true);
    conferir("aviso fiscal nao entra nas diferencas", popFiscal.diferencas.some((d) => d.campo === "tipoProducao"), false);
    conferir("leitura traz os fiscais em lista (para a aba Fiscal)", popFiscal.fiscais.map((f) => [f.campo, f.tipo, f.rise, f.li]), [["tipoProducao", "diferente", "FABRICACAO_PROPRIA", "REVENDA"]]);
    conferir("leitura traz o que a loja tem de GTIN, origem e tipo", Object.keys(popFiscal.daLoja).sort(), ["gtin", "origem", "tipoProducao"]);
  }

  {
    console.log("\nEnvio: sincronizar, cadastrar, marca, categorias e copia");
    await limpar();
    const pe = await prisma.produto.create({ data: { sku: "ZZ-LI-9", tituloBase: "Modulo Rele", marca: "ARDUÍNO", ncm: "85364900", origem: 0, conferido: true, alturaCm: 1.2, larguraCm: 2, comprimentoCm: 3, pesoKg: 0.01 } });
    const li3 = criarLojaIntegradaFalsa({ produtos: [{ id: 601, sku: "ZZ-LI-9", nome: "Rele", apelido: "/rele", ativo: true, removido: false, ncm: "", marca: null, categorias: ["/api/v1/categoria/5"], seo: "/api/v1/seo/61", imagens: [{ id: 1 }], preco_cheio: "10.00", estoque_quantidade: 4 }], marcas: [{ id: 2, nome: "Arduino" }], categorias: [{ id: 5, nome: "Reles" }], seos: { 61: { title: "", description: "" } } });
    conferir("sincronizar sem vinculo pede Cadastrar", /Cadastrar na LI/.test((await sincronizarProdutoLI(pe.id, li3)).erro ?? ""), true);
    await lerParaPopupLI(pe.id, li3); // vincula
    const anuncioAntes = await anuncioLIDoProduto(pe.id);
    await salvarRascunhoLI(anuncioAntes.id, { ...rascunhoDoAnuncio(anuncioAntes), categorias: ["5", "999"], seo: { title: "Rele Arduino", description: "D" } });
    const envio = await sincronizarProdutoLI(pe.id, li3);
    // Origem e tipo de producao NAO entram: a API nao os grava (medido em 07/10/2026).
    conferir("sincronizou; categoria morta ignorada; marca achada sem acento", [envio.ok, envio.alterados.map((a) => a.campo).sort(), envio.marcaCriada, envio.categoriasIgnoradas], [true, ["altura", "comprimento", "largura", "marca", "ncm", "nome", "peso", "seoDescription", "seoTitulo"], null, ["999"]]);
    conferir("produto que ja esta na loja mantem a URL de hoje (nenhum /alias)", [li3.produtos().find((p) => p.id === 601).apelido, li3.chamadas.some((c) => String(c.caminho).includes("/alias"))], ["/rele", false]);
    const naLI = li3.produtos().find((p) => p.id === 601);
    conferir("PUT inteiro preservou imagens, categorias, preco e estoque da LI e trocou o nome", [naLI.imagens.length, naLI.categorias, naLI.nome, naLI.marca, naLI.preco_cheio, naLI.estoque_quantidade], [1, ["/api/v1/categoria/5"], "Modulo Rele", "/api/v1/marca/2", "10.00", 4]);
    conferir("medidas inteiras e NCM com pontos na LI", [naLI.altura, naLI.largura, naLI.profundidade, naLI.ncm], [2, 2, 3, "8536.49.00"]);
    conferir("nenhum POST /marca", li3.chamadas.filter((c) => c.metodo === "POST" && c.caminho === "/marca").length, 0);
    conferir("SEO gravado", li3.seos()["61"].title, "Rele Arduino");
    conferir("trava pedida antes da primeira escrita", li3.chamadas.findIndex((c) => c.metodo === "TRAVA") < li3.chamadas.findIndex((c) => c.metodo === "PUT"), true);
    const dep = await anuncioLIDoProduto(pe.id);
    conferir("assinatura, data e payload gravados; sem erro; PUBLICADO", [typeof dep.hashConteudo, dep.sincronizadoEm !== null, dep.payloadEnviado !== null, dep.erro, dep.status], ["string", true, true, null, "PUBLICADO"]);
    conferir("copia antes do PUT", await prisma.copiaProdutoCanal.count({ where: { produtoId: pe.id, canal: "LOJA_INTEGRADA" } }), 1);
    const putsAntes = li3.chamadas.filter((c) => c.metodo === "PUT").length;
    conferir("segunda sincronizacao nao envia nada", (await sincronizarProdutoLI(pe.id, li3)).alterados, []);
    conferir("segunda sincronizacao nao faz PUT", li3.chamadas.filter((c) => c.metodo === "PUT").length, putsAntes);
    conferir("depois do envio, sem Bling: cinza e sem selo", iconeLIDoProduto(await prisma.produto.findUnique({ where: { id: pe.id } }), await anuncioLIDoProduto(pe.id), { documentos: [] }), { cor: "cinza", divergente: false, conferido: true, semBling: true });
    conferir("depois do envio, com Bling: verde e sem selo", iconeLIDoProduto({ ...(await prisma.produto.findUnique({ where: { id: pe.id } })), blingId: "1" }, await anuncioLIDoProduto(pe.id), { documentos: [] }), { cor: "verde", divergente: false, conferido: true, semBling: false });
    // URL: produto que ja esta na loja nunca muda de URL (decisao do dono em 07/10/2026), nem com nome novo.
    const comSlug = await anuncioLIDoProduto(pe.id);
    await salvarRascunhoLI(comSlug.id, { ...rascunhoDoAnuncio(comSlug), titulo: "Modulo Rele 5V", slug: "ignorado" });
    const envioSlug = await sincronizarProdutoLI(pe.id, li3);
    conferir("nome novo vai so como nome: a URL da loja fica a mesma", [envioSlug.alterados.map((a) => a.campo).sort(), li3.produtos().find((p) => p.id === 601).apelido, li3.chamadas.some((c) => String(c.caminho).includes("/alias"))], [["nome"], "/rele", false]);
    // Falha depois da trava: ERRO, etapa e assinatura intacta.
    const pf = await prisma.produto.create({ data: { sku: "ZZ-LI-12", tituloBase: "Falha", ncm: "85364900", conferido: true } });
    const li4 = criarLojaIntegradaFalsa({ produtos: [{ id: 701, sku: "ZZ-LI-12", nome: "Antigo", apelido: "/antigo", seo: "/api/v1/seo/71" }], seos: { 71: { title: "", description: "" } }, falhas: { "PUT /seo/71": 500 } });
    await lerParaPopupLI(pf.id, li4);
    const anF = await anuncioLIDoProduto(pf.id);
    await salvarRascunhoLI(anF.id, { ...rascunhoDoAnuncio(anF), seo: { title: "Titulo", description: "Resumo" } });
    const falhou = await sincronizarProdutoLI(pf.id, li4);
    const anDepois = await anuncioLIDoProduto(pf.id);
    conferir("falha no SEO: etapa seo, anuncio em ERRO, assinatura intacta", [falhou.ok, falhou.etapa, anDepois.status, anDepois.erro !== null, anDepois.dados.etapa, anDepois.hashConteudo], [false, "seo", "ERRO", true, "seo", null]);
    conferir("falha no SEO: o PUT do produto ja tinha ido (aparece nos alterados)", falhou.alterados.some((a) => a.campo === "nome"), true);
    // Cadastro
    const pc = await prisma.produto.create({ data: { sku: "ZZ-LI-10", tituloBase: "Novo na LI", descricaoBase: "O produto novo na loja.", marca: "NOVAMARCA", ncm: "85364900", conferido: true } });
    const semNcm = await prisma.produto.create({ data: { sku: "ZZ-LI-11", tituloBase: "Sem NCM", conferido: true } });
    conferir("cadastrar sem NCM recusa antes do POST", [/NCM/.test((await cadastrarNaLI(semNcm.id, li3)).erro ?? ""), li3.chamadas.filter((c) => c.metodo === "POST" && c.caminho === "/produto").length], [true, 0]);
    const cad = await cadastrarNaLI(pc.id, li3);
    conferir("cadastro: inativo, marca criada, vinculo gravado", [cad.ok, li3.produtos().at(-1).ativo, li3.marcas().some((m) => m.nome === "NOVAMARCA"), (await anuncioLIDoProduto(pc.id)).idExterno === cad.idExterno], [true, false, true, true]);
    const anCad = await anuncioLIDoProduto(pc.id);
    conferir("cadastro: PAUSADA, PUBLICADO, assinatura e data", [anCad.situacaoCanal, anCad.status, typeof anCad.hashConteudo, anCad.sincronizadoEm !== null], ["PAUSADA", "PUBLICADO", "string", true]);
    conferir("cadastrar de novo recusa (ja existe)", (await cadastrarNaLI(pc.id, li3)).ok, false);
    const naoConfCad = await prisma.produto.create({ data: { sku: "ZZ-LI-13", tituloBase: "Nao conferido", ncm: "85364900" } });
    conferir("cadastrar nao Conferido recusa", (await cadastrarNaLI(naoConfCad.id, li3)).ok, false);
    // Trava fechada: um cliente cuja exigirEscrita lanca (a trava real e a da carga do processo)
    const travada = { ...li3, exigirEscrita: () => { throw new Error("Escrita bloqueada: LI_ESCRITA esta false no .env. Nenhum dado foi enviado."); } };
    const chamadasAntesDaTrava = li3.chamadas.length;
    const recusado = await sincronizarProdutoLI(pe.id, travada);
    conferir("trava fechada: recusa antes de qualquer chamada", [recusado.erro.includes("LI_ESCRITA"), recusado.etapa, li3.chamadas.length - chamadasAntesDaTrava], [true, "trava", 0]);
    conferir("mudouNaLI e resumirEnvioLI", [mudouNaLI("sincronizar", envio), resumirEnvioLI("sincronizar", { ok: true, alterados: [] }).titulo], [true, "Nada para enviar: a Loja Integrada já estava igual ao Rise."]);
    conferir("resumo do sincronizar lista os campos", resumirEnvioLI("sincronizar", { ok: true, alterados: [{ campo: "peso", de: null, para: 0.5 }] }, { peso: "Peso (kg)" }), { titulo: "Sincronizado com a Loja Integrada.", linhas: ["Peso (kg): de vazio para 0,5 kg"] });
    conferir("resumo do cadastro", resumirEnvioLI("cadastrar", { ok: true, idExterno: "9" }).titulo, "Produto cadastrado na Loja Integrada (inativo).");
    conferir("valorParaTela", [valorParaTela("categorias", ["1", "2"]), valorParaTela("destaque", false), valorParaTela("altura", 3), valorParaTela("tipoProducao", "FABRICACAO_PROPRIA"), valorParaTela("ncm", null)], ["1, 2", "nao", "3 cm", "Fabricação própria", null]);
  }

  {
    console.log("\nRotulos");
    conferir("STATUS_LI", Object.keys(STATUS_LI), ["RASCUNHO", "PUBLICADO", "ERRO"]);
    conferir("rotulo do tipo de producao", ROTULO_DO_TIPO_PRODUCAO.FABRICACAO_PROPRIA, "Fabricação própria");
  }

  {
    console.log("\nIcone na lista");
    conferir("iconeLIDoProduto sem anuncio e cinza", iconeLIDoProduto({ conferido: true }, null, { frases: [], documentos: [] }), { cor: "cinza", divergente: false, conferido: true, semBling: true });
    conferir("iconeLIDoProduto de produto nao Conferido e cinza mesmo sincronizado", iconeLIDoProduto({ conferido: false }, { produtoId: "p", dados: {}, sincronizadoEm: new Date(), hashConteudo: "x" }, {}), { cor: "cinza", divergente: false, conferido: false, semBling: false });
  }

  {
    console.log("\nRevisao final: categoria morta no pop-up");
    await limpar();
    const pm = await prisma.produto.create({ data: { sku: "ZZ-LI-14", tituloBase: "Morta", ncm: "85364900", conferido: true } });
    const li5 = criarLojaIntegradaFalsa({ produtos: [{ id: 801, sku: "ZZ-LI-14", nome: "Morta", apelido: "/morta", categorias: ["/api/v1/categoria/5"], seo: "/api/v1/seo/81" }], categorias: [{ id: 5, nome: "Reles" }], seos: { 81: { title: "", description: "" } } });
    await lerParaPopupLI(pm.id, li5); // vincula
    const anM = await anuncioLIDoProduto(pm.id);
    await salvarRascunhoLI(anM.id, { ...rascunhoDoAnuncio(anM), categorias: ["5", "999"] });
    const popM = await lerParaPopupLI(pm.id, li5);
    conferir("pop-up: categoria que sumiu da loja nao vira diferenca eterna", popM.diferencas.some((d) => d.campo === "categorias"), false);
    conferir("pop-up: categoria que sumiu da loja vira aviso", popM.avisos.some((a) => /999/.test(a) && /não existe mais/.test(a)), true);
  }

  {
    console.log("\nRevisao final: description padrao pula o titulo");
    conferir("pula o paragrafo que repete o nome", descriptionPadrao("PLACA UNO R3\n\nA Placa e uma placa de desenvolvimento.", "Placa Uno R3"), "A Placa e uma placa de desenvolvimento.");
    conferir("pula a linha toda em maiusculas (o titulo do padrao da loja)", descriptionPadrao("MODULO RELE 5V\n\nO Modulo aciona cargas.", "Outro nome"), "O Modulo aciona cargas.");
    conferir("paragrafo normal fica", descriptionPadrao("Texto comum.\n\nSegundo.", "Nome"), "Texto comum.");
    conferir("so o titulo: fica o titulo (melhor que vazio)", descriptionPadrao("PLACA UNO R3", "Placa Uno R3"), "PLACA UNO R3");
    conferir("rascunho inicial usa o paragrafo de verdade", rascunhoInicialLI({ id: "x", tituloBase: "PLACA UNO", descricaoBase: "PLACA UNO\n\nA Placa faz X." }).seo.description, "A Placa faz X.");
  }

  {
    console.log("\nPrimeiro envio real: URL antiga /produto/<slug>.html");
    conferir("slug da URL antiga sem produto/ e sem .html", normalizarDaLI({ url: "/produto/placa-compativel-arduino-uno-r3-com-cabo-usb.html", apelido: "placa-compativel-arduino-uno-r3-ch340-com-cabo-usb" }, null, {}).slug, "placa-compativel-arduino-uno-r3-com-cabo-usb");
    conferir("slug da URL nova fica igual", normalizarDaLI({ url: "/zz-teste-li-alias" }, null, {}).slug, "zz-teste-li-alias");
    conferir("slug lido da URL antiga passa na validacao", slugValido(normalizarDaLI({ url: "/produto/rele-5v.html" }, null, {}).slug), true);
  }

  {
    console.log("\nSEO: concorrentes salvos e as opcoes da IA");
    await limpar();
    const { seoDosConcorrentes } = await import("../src/lib/canaisDeVenda/li/seoConcorrentes.js");
    const { FAIXA_DESCRIPTION_SEO, limparDescriptionsSeo, montarPedidoSeo } = await import("../src/lib/ia/anuncio.js");
    const fonte = await prisma.fonteColeta.create({ data: { nome: "ZZ-LI Fonte SEO", dominio: "zz-li-seo.invalid", tipo: "CONCORRENTE", ativa: false, proximaVarreduraEm: new Date(Date.now() + 1e12) } });
    try {
      const p = await prisma.produto.create({ data: { sku: "ZZ-LI-SEO", tituloBase: "Placa Uno R3", conferido: true } });
      const coletadoEm = new Date("2026-10-01T12:00:00Z");
      const comSeo = await prisma.produtoColetado.create({ data: { fonteId: fonte.id, chave: "codigo:A1", origem: "site", nome: "Uno R3 Concorrente", url: "https://zz-li-seo.invalid/uno", coletadoEm, seo: { title: "  Placa Uno R3 |\n Loja  ", description: "Compre a Placa Uno R3.\nFrete rapido.", canonical: "https://zz-li-seo.invalid/uno" } } });
      const semSeo = await prisma.produtoColetado.create({ data: { fonteId: fonte.id, chave: "codigo:A2", origem: "site", nome: "Sem SEO", seo: {} } });
      await prisma.produtoConcorrente.createMany({ data: [{ produtoId: p.id, produtoColetadoId: comSeo.id }, { produtoId: p.id, produtoColetadoId: semSeo.id }, { produtoId: p.id, nomeManual: "Manual", fonteManual: "Outra" }] });
      const lista = await seoDosConcorrentes(p.id);
      conferir("so os concorrentes com SEO, texto sem quebras, loja e data", lista, [{ id: comSeo.id, loja: "ZZ-LI Fonte SEO", nome: "Uno R3 Concorrente", url: "https://zz-li-seo.invalid/uno", title: "Placa Uno R3 | Loja", description: "Compre a Placa Uno R3. Frete rapido.", coletadoEm: coletadoEm.toISOString() }]);
      conferir("produto sem concorrente: lista vazia", await seoDosConcorrentes("nao-existe"), []);
    } finally {
      await prisma.fonteColeta.delete({ where: { id: fonte.id } });
    }
    conferir("faixa da description pedida a IA", FAIXA_DESCRIPTION_SEO, { minimo: 130, maximo: 160 });
    const boa = "Placa Uno R3 com ATmega328P e CH340 para projetos de eletronica: compativel com shields e com a IDE do Arduino, acompanha cabo USB.";
    conferir(
      "limpar: fora da faixa, repetida, com o titulo inteiro e vazia saem",
      limparDescriptionsSeo([`  ${boa}  `, boa, "Curta demais.", "x".repeat(170), "PLACA UNO R3 CH340 e a melhor placa para quem quer aprender eletronica e programacao com Arduino e shields.", ""], "Placa Uno R3 CH340"),
      { aceitas: [boa], recusadas: ["Curta demais.", "x".repeat(170), "PLACA UNO R3 CH340 e a melhor placa para quem quer aprender eletronica e programacao com Arduino e shields."] },
    );
    const pedido = montarPedidoSeo({ titulo: "Placa Uno R3", descricao: "A Placa faz X.", concorrentes: [{ loja: "Loja Secreta", title: "Uno | Loja Secreta", description: "Compre ja." }] });
    conferir("pedido leva titulo, descricao e o SEO dos concorrentes, sem o nome da loja", [pedido.includes("Placa Uno R3"), pedido.includes("A Placa faz X."), pedido.includes("Compre ja."), /Loja Secreta/.test(pedido.replace("Uno | Loja Secreta", ""))], [true, true, true, false]);
  }

  {
    console.log("\nBling: o produto ligado ao canal da Loja Integrada");
    const { LOJA_LI_NO_BLING, vinculoBlingNaLI } = await import("../src/lib/canaisDeVenda/li/blingLoja.js");
    // Bling de mentira so de leitura: a busca por codigo, o produto e os vinculos com as lojas.
    const blingDeLeitura = ({ produtos = {}, vinculos = {}, falha = null }) => ({
      chamadas: [],
      async get(caminho, params) {
        this.chamadas.push([caminho, params]);
        if (falha) return { ok: false, status: falha, dados: {} };
        if (caminho === "/produtos") {
          const codigo = params["codigos[]"][0];
          return { ok: true, status: 200, dados: { data: produtos[codigo] ? [{ id: produtos[codigo], codigo }] : [] } };
        }
        if (caminho.startsWith("/produtos/") && caminho !== "/produtos/lojas") {
          const id = Number(caminho.split("/").pop());
          const codigo = Object.keys(produtos).find((c) => produtos[c] === id);
          return { ok: true, status: 200, dados: { data: { id, codigo } } };
        }
        if (caminho === "/produtos/lojas") return { ok: true, status: 200, dados: { data: vinculos[params.idProduto] ?? [] } };
        throw new Error(`rota inesperada ${caminho}`);
      },
    });
    conferir("o canal da LI no Bling e o 203478870 (medido)", LOJA_LI_NO_BLING, "203478870");
    const ligado = blingDeLeitura({ produtos: { 100101: 3191813308 }, vinculos: { 3191813308: [{ codigo: "MLB1", loja: { id: 203593931 }, preco: 49.9 }, { codigo: "204930845", loja: { id: 203478870 }, preco: 49.0000001 }] } });
    conferir("ligado ao canal da LI, com o id da LI no codigo", await vinculoBlingNaLI(ligado, "100101", "204930845"), { situacao: "ligado", codigo: "204930845", preco: 49 });
    conferir("ligado a OUTRO produto da LI", (await vinculoBlingNaLI(ligado, "100101", "999")).situacao, "codigo_diferente");
    conferir("produto ainda fora da LI: ligado vale (o Bling ja tem o vinculo)", (await vinculoBlingNaLI(ligado, "100101", null)).situacao, "ligado");
    const semLoja = blingDeLeitura({ produtos: { X1: 5 }, vinculos: { 5: [{ codigo: "MLB1", loja: { id: 203593931 } }] } });
    conferir("no Bling, mas sem o canal da LI", await vinculoBlingNaLI(semLoja, "X1", "1"), { situacao: "sem_vinculo" });
    conferir("codigo que nao existe no Bling", await vinculoBlingNaLI(blingDeLeitura({}), "NADA", "1"), { situacao: "sem_produto_no_bling" });
    const fora = await vinculoBlingNaLI(blingDeLeitura({ falha: 401 }), "X1", "1");
    conferir("Bling fora do ar vira erro com recado, sem lancar", [fora.situacao, /Bling/.test(fora.erro ?? "")], ["erro", true]);
  }

  {
    console.log("\nBling: ligar o produto ao canal da Loja Integrada");
    const { LOJA_LI_NO_BLING, ligarNoBlingLI } = await import("../src/lib/canaisDeVenda/li/blingLoja.js");
    // Bling de mentira que le e grava vinculos, com a trava de escrita.
    const blingComVinculos = ({ produtos = {}, vinculos = {}, travaFechada = false, recusa = null }) => ({
      chamadas: [],
      exigirEscrita(codigo) {
        this.chamadas.push(["TRAVA", codigo]);
        if (travaFechada) throw new Error("Escrita bloqueada: BLING_ESCRITA esta false no .env. Nenhum dado foi enviado.");
      },
      async get(caminho, params) {
        this.chamadas.push(["GET", caminho]);
        if (caminho === "/produtos") {
          const codigo = params["codigos[]"][0];
          return { ok: true, status: 200, dados: { data: produtos[codigo] ? [{ id: produtos[codigo].id, codigo }] : [] } };
        }
        if (caminho === "/produtos/lojas") return { ok: true, status: 200, dados: { data: vinculos[params.idProduto] ?? [] } };
        const id = Number(caminho.split("/").pop());
        const codigo = Object.keys(produtos).find((c) => produtos[c].id === id);
        return { ok: true, status: 200, dados: { data: { id, codigo, preco: produtos[codigo].preco } } };
      },
      async post(caminho, corpo) {
        this.chamadas.push(["POST", caminho, corpo]);
        if (recusa) return { ok: false, status: recusa, dados: { error: { description: "Recusado" } } };
        (vinculos[corpo.produto.id] ??= []).push({ id: 1, ...corpo });
        return { ok: true, status: 201, dados: { data: { id: 1 } } };
      },
    });
    const b1 = blingComVinculos({ produtos: { "ZZ-B": { id: 77, preco: 39.9 } }, vinculos: { 77: [{ codigo: "MLB1", loja: { id: 203593931 } }] } });
    const ligou = await ligarNoBlingLI(b1, "ZZ-B", "404334430");
    conferir("liga: ok, e a releitura confirma", [ligou.ok, ligou.situacao], [true, "ligado"]);
    const post = b1.chamadas.find((c) => c[0] === "POST");
    conferir(
      "POST /produtos/lojas com o id da LI no codigo, o preco do BLING, o produto e a loja da LI",
      post && [post[1], post[2]],
      ["/produtos/lojas", { codigo: "404334430", preco: 39.9, produto: { id: 77 }, loja: { id: Number(LOJA_LI_NO_BLING) } }],
    );
    conferir("a trava vem antes do POST", b1.chamadas.findIndex((c) => c[0] === "TRAVA") < b1.chamadas.findIndex((c) => c[0] === "POST"), true);
    const deNovo = await ligarNoBlingLI(b1, "ZZ-B", "404334430");
    conferir("ja ligado: nao grava de novo", [deNovo.ok, deNovo.situacao, b1.chamadas.filter((c) => c[0] === "POST").length], [true, "ligado", 1]);
    const b2 = blingComVinculos({ produtos: { "ZZ-B": { id: 77, preco: 1 } }, vinculos: { 77: [{ codigo: "999", loja: { id: 203478870 } }] } });
    const outro = await ligarNoBlingLI(b2, "ZZ-B", "404334430");
    conferir("ligado a OUTRO produto da LI: recusa e nao mexe", [outro.ok, outro.situacao, b2.chamadas.some((c) => c[0] === "POST")], [false, "codigo_diferente", false]);
    const b3 = blingComVinculos({ produtos: { "ZZ-B": { id: 77, preco: 1 } }, travaFechada: true });
    const travado = await ligarNoBlingLI(b3, "ZZ-B", "404334430");
    conferir("trava fechada: recusa com o motivo e nenhum POST", [travado.ok, /BLING_ESCRITA/.test(travado.erro ?? ""), b3.chamadas.some((c) => c[0] === "POST")], [false, true, false]);
    conferir("sem o produto na LI ainda: recusa antes de ler o Bling", (await ligarNoBlingLI(blingComVinculos({}), "ZZ-B", null)).ok, false);
    conferir("produto fora do Bling: recusa", (await ligarNoBlingLI(blingComVinculos({}), "NADA", "1")).situacao, "sem_produto_no_bling");
    const b4 = blingComVinculos({ produtos: { "ZZ-B": { id: 77, preco: 1 } }, recusa: 400 });
    const recusado = await ligarNoBlingLI(b4, "ZZ-B", "404334430");
    conferir("Bling recusa: ok false com o HTTP e o motivo", [recusado.ok, /HTTP 400/.test(recusado.erro ?? ""), /Recusado/.test(recusado.erro ?? "")], [false, true, true]);
  }

  {
    console.log("\nCategorias: sugestao da IA");
    const { MAXIMO_DE_SUGESTOES, comAncestrais, limparSugestoesDeCategoria, montarPedidoDeCategorias } = await import("../src/lib/canaisDeVenda/li/categorias.js");
    const arvore = [
      { id: "1", nome: "Embarcados", paiId: null, caminho: "Embarcados" },
      { id: "2", nome: "Arduino", paiId: "1", caminho: "Embarcados > Arduino" },
      { id: "3", nome: "Placas Arduino", paiId: "2", caminho: "Embarcados > Arduino > Placas Arduino" },
      { id: "4", nome: "Sensores", paiId: null, caminho: "Sensores" },
    ];
    conferir("no maximo 3 sugestoes", MAXIMO_DE_SUGESTOES, 3);
    conferir(
      "limpar: id que nao existe sai, repetido vira um, motivo fica, e o caminho vem da arvore",
      limparSugestoesDeCategoria([{ id: "3", motivo: "E uma placa" }, { id: 99, motivo: "x" }, { id: "3", motivo: "de novo" }, { id: "4" }], arvore),
      [{ id: "3", caminho: "Embarcados > Arduino > Placas Arduino", motivo: "E uma placa" }, { id: "4", caminho: "Sensores", motivo: "" }],
    );
    conferir("limpar: corta em 3", limparSugestoesDeCategoria([{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }], arvore).length, 3);
    conferir("limpar: resposta torta vira lista vazia", limparSugestoesDeCategoria(null, arvore), []);
    conferir("marcar leva as categorias-pai junto (como o 100101 esta na loja), sem repetir", comAncestrais(["3", "2"], arvore).sort(), ["1", "2", "3"]);
    conferir("pai que sumiu da arvore nao entra", comAncestrais(["3"], arvore.filter((c) => c.id !== "1")).sort(), ["2", "3"]);
    const pedido = montarPedidoDeCategorias({ titulo: "Placa Uno R3", marca: "GENERICA", descricao: "A placa faz X.", categorias: arvore });
    conferir("o pedido leva o produto e a arvore com os ids", [pedido.includes("Placa Uno R3"), pedido.includes("A placa faz X."), pedido.includes("3: Embarcados > Arduino > Placas Arduino")], [true, true, true]);
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

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

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
const { config } = await import("../src/lib/integracoes/config.js");
const { clienteLI } = await import("../src/lib/canaisDeVenda/li/cliente.js");
const { estadoDoIconeLI, iconeLIDoProduto, produtoIdValido } = await import("../src/lib/canaisDeVenda/li/estado.js");
const { criarLojaIntegradaFalsa } = await import("./lib/lojaIntegradaFalsa.js");
const { buscarNaLI, lerDetalheDaLI, lerParaPopupLI, listarCategoriasDaLI, listarMarcasDaLI } = await import("../src/lib/canaisDeVenda/li/leitura.js");
const { cadastrarNaLI, completarCadastroLI, sincronizarProdutoLI } = await import("../src/lib/canaisDeVenda/li/envio.js");
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

/**
 * Bling de mentira para o cadastro automatico (24/10/2026): conhece qualquer codigo, liga o produto a loja da LI
 * (`/produtos/lojas`) e devolve o saldo (`/estoques/saldos`). Sem rede; a trava e conferida antes de escrever.
 */
function criarBlingDaLI({ saldo = 5, saldoAusente = false, travaFechada = false, recusaVinculo = null } = {}) {
  const vinculos = {};
  const codigoDoId = {};
  const idDe = (codigo) => {
    const id = 7000 + [...String(codigo)].reduce((soma, letra) => soma * 31 + letra.charCodeAt(0), 0) % 900000;
    codigoDoId[id] = codigo;
    return id;
  };
  let liberada = false;
  return {
    chamadas: [],
    vinculos,
    exigirEscrita(codigo) {
      this.chamadas.push(["TRAVA", codigo]);
      if (travaFechada) throw new Error("Escrita bloqueada: BLING_ESCRITA esta false no .env. Nenhum dado foi enviado.");
      liberada = true;
    },
    async get(caminho, params) {
      this.chamadas.push(["GET", caminho]);
      if (caminho === "/produtos") {
        const codigo = params["codigos[]"][0];
        return { ok: true, status: 200, dados: { data: [{ id: idDe(codigo), codigo }] } };
      }
      if (caminho === "/produtos/lojas") return { ok: true, status: 200, dados: { data: vinculos[params.idProduto] ?? [] } };
      if (caminho === "/estoques/saldos") {
        const codigo = params["codigos[]"][0];
        return { ok: true, status: 200, dados: { data: saldoAusente ? [] : [{ produto: { id: idDe(codigo), codigo }, saldoVirtualTotal: saldo }] } };
      }
      const id = Number(caminho.split("/").pop());
      return { ok: true, status: 200, dados: { data: { id, codigo: codigoDoId[id], preco: 10 } } };
    },
    async post(caminho, corpo) {
      this.chamadas.push(["POST", caminho, corpo]);
      if (!liberada) throw new Error("Bling falso: escrita sem exigirEscrita");
      if (recusaVinculo) return { ok: false, status: recusaVinculo, dados: { error: { description: "Recusado" } } };
      (vinculos[corpo.produto.id] ??= []).push({ id: 1, ...corpo });
      return { ok: true, status: 201, dados: { data: { id: 1 } } };
    },
  };
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
    // Formato "Normal (DIV)" da LI (24/10/2026): cada linha numa <div>
    const P = (miolo) => miolo.split("<br>").map((linha) => `<div><span style="font-size:16px;">${linha}</span></div>`).join("");
    const E = "<div>&nbsp;</div>"; // a linha em branco entre as secoes (21/10/2026)
    conferir("escapa tag, e-comercial e aspas", montarDescricaoLI({ descricao: `a <b> & c "x" 'y'` }), P("a &lt;b&gt; &amp; c &quot;x&quot; &#39;y&#39;"));
    conferir("quebra simples vira br, dupla vira paragrafo, CRLF vale um", montarDescricaoLI({ descricao: "l1\r\nl2\r\n\r\nl3" }), P("l1<br>l2") + E + P("l3"));
    conferir("vazio nao gera nada", [montarDescricaoLI({ descricao: "  \n " }), montarDescricaoLI({ descricao: null })], ["", ""]);
    const texto = "PLACA UNO R3\n\nA Placa faz X.\n\nEspecificações técnicas:\n- SRAM: 2KB;\n- Peso: 24g;\n\nItens inclusos: (Cód:100101)\n- 01 Placa;\n\nGarantia:\n- Garantia Legal de 90 dias;";
    conferir(
      "titulo do produto e titulos de secao em negrito; itens normais",
      montarDescricaoLI({ descricao: texto }),
      P("<strong>PLACA UNO R3</strong>") + E + P("A Placa faz X.") + E + P("<strong>Especificações técnicas:</strong><br>- SRAM: 2KB;<br>- Peso: 24g;") + E + P("<strong>Itens inclusos: (Cód:100101)</strong><br>- 01 Placa;") + E + P("<strong>Garantia:</strong><br>- Garantia Legal de 90 dias;"),
    );
    const docs = [{ url: "https://rise.exemplo/a.pdf?v=2", nome: "Datasheet <v2>.pdf" }, { url: "javascript:alert(1)", nome: "x" }];
    const blocoDocs = P("<strong>Documentos / Arquivos para download:</strong><br>- <a href=\"https://rise.exemplo/a.pdf?v=2\" target=\"_blank\" rel=\"noopener\">Datasheet &lt;v2&gt;.pdf</a>;");
    conferir("documentos logo abaixo das Especificacoes tecnicas (so http)", montarDescricaoLI({ descricao: texto, documentos: docs }).includes(P("<strong>Especificações técnicas:</strong><br>- SRAM: 2KB;<br>- Peso: 24g;") + E + blocoDocs + E + P("<strong>Itens inclusos: (Cód:100101)</strong><br>- 01 Placa;")), true);
    conferir("sem Especificacoes, documentos acima de Garantia", montarDescricaoLI({ descricao: "Texto.\n\nGarantia:\n- 90 dias;", documentos: docs }), P("Texto.") + E + blocoDocs + E + P("<strong>Garantia:</strong><br>- 90 dias;"));
    conferir("sem as duas secoes, documentos no fim do texto", montarDescricaoLI({ descricao: "Texto.", documentos: docs }), P("Texto.") + E + blocoDocs);
    const lidaComLink = (html) => normalizarDaLI({ descricao_completa: html }, null, {}).descricao;
    conferir("link da loja sem target conta como diferente", lidaComLink('<div>A <a href="x.pdf">doc</a></div>').endsWith("(link abre na mesma aba)"), true);
    conferir("descricao da loja em paragrafos (formato antigo) conta como diferente", lidaComLink("<p>A</p><p>B</p>").endsWith("(formato antigo: parágrafos em vez de Normal (DIV))"), true);
    conferir("formato DIV com a linha em branco (ou o nbsp cru da LI) nao", [lidaComLink(montarDescricaoLI({ descricao: "A\n\nB" })), lidaComLink("<div>A</div><div>" + String.fromCharCode(160) + "</div><div>B</div>")], ["A\n\nB", "A\n\nB"]);
    conferir("um paragrafo so: <p> e antigo, <div> nao", [lidaComLink("<p>A</p>").endsWith("Normal (DIV))"), lidaComLink("<div>A</div>")], [true, "A"]);
    conferir("link da loja com target igual ao do Rise", lidaComLink('<div>A <a href="x.pdf" target="_blank" rel="noopener">doc</a></div>').includes("mesma aba"), false);
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
    conferir("campos de envio, na ordem, sem os fiscais so de leitura", CAMPOS_DE_ENVIO_LI.map((c) => c.id), ["nome", "descricao", "ncm", "gtin", "mpn", "peso", "altura", "largura", "comprimento", "preco", "marca", "categorias", "video", "destaque", "seoTitulo", "seoDescription"]);
    conferir("campos so de leitura: origem e tipo de producao", CAMPOS_SO_LEITURA_LI.map((c) => c.id), ["origem", "tipoProducao"]);
    conferir("texto do tipo de producao e o medido na LI", TEXTO_DO_TIPO_PRODUCAO, { REVENDA: "Revenda", FABRICACAO_PROPRIA: "Fabricação própria" });
    conferir("tipo de producao da LI pelo texto", [TIPO_PRODUCAO_DA_LI("Revenda"), TIPO_PRODUCAO_DA_LI("Fabricação própria"), TIPO_PRODUCAO_DA_LI("outro"), TIPO_PRODUCAO_DA_LI(null)], ["REVENDA", "FABRICACAO_PROPRIA", null, null]);
    // Categorias e SEO sao do PRODUTO (25/10/2026): o rascunho do anuncio nao os leva mais.
    const produtoRise = { tituloBase: "x", descricaoBase: "Texto", ncm: "8537.10.20", ean: "7894972605270", modelo: "FX3U", pesoKg: "0.5", alturaCm: "2.3", larguraCm: "12", comprimentoCm: "6.01", origem: 0, tipoProducao: "REVENDA", categoriasLI: ["23983023", "5946305", "23983023"], seoTituloLI: "t".repeat(80), seoDescricaoLI: "" };
    const rasc = { titulo: " CLP FX3U ", slug: "clp-fx3u", marca: "Mitsubishi", destaque: false, videoUrl: null };
    const rise = normalizarDoRiseLI(produtoRise, rasc, { frases: [], documentos: [] });
    conferir("slug do Rise sai SEMPRE do nome, nao do guardado", normalizarDoRiseLI(produtoRise, { ...rasc, titulo: "Relé 5V", slug: "outro" }, {}).slug, "rele-5v");
    conferir("rise normalizado", rise, { nome: "CLP FX3U", slug: "clp-fx3u", descricao: "Texto", ncm: "85371020", gtin: "7894972605270", mpn: null, peso: 0.5, altura: 3, largura: 12, comprimento: 7, preco: null, marca: "MITSUBISHI", categorias: ["23983023", "5946305"], video: null, destaque: false, seoTitulo: "t".repeat(70), seoDescription: null, origem: 0, tipoProducao: "REVENDA" });
    const produtoLI = { id: 1, nome: "CLP FX3U", apelido: "/clp-fx3u", descricao_completa: "<div>Texto</div>", ncm: "8537.10.20", gtin: "7894972605270", mpn: null, peso: "0.500", altura: 3, largura: 12, profundidade: 7, marca: "/api/v1/marca/16306688", categorias: ["/api/v1/categoria/5946305", "/api/v1/categoria/23983023"], url_video_youtube: null, destaque: false, icms_origin_code: "0", production_type: TEXTO_DO_TIPO_PRODUCAO.REVENDA, seo_title: "", seo_description: "" };
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
      { descricaoBase: "Texto", ncm: "8537.10.20", ean: "7894972605270", modelo: "FX3U", pesoKg: "0.5", alturaCm: "2.3", larguraCm: "12", comprimentoCm: "6.01", origem: 0, tipoProducao: "REVENDA", categoriasLI: ["5946305"], seoTituloLI: "S", seoDescricaoLI: "" },
      { titulo: "CLP FX3U", slug: "clp-fx3u", marca: "Mitsubishi", destaque: false, videoUrl: null },
      {},
    );
    const produtoLI = { id: 1, resource_uri: "/api/v1/produto/1", url: "/clp-fx3u", seo: "/api/v1/seo/9", imagens: [{ id: 3 }], preco_cheio: "10.00", estoque_quantidade: 5, nome: "CLP FX3U", apelido: "/clp-fx3u", descricao_completa: "<div>Texto</div>", ncm: "8537.10.20", gtin: "7894972605270", mpn: null, peso: "0.500", altura: 3, largura: 12, profundidade: 7, marca: "/api/v1/marca/16306688", categorias: ["/api/v1/categoria/5946305", "/api/v1/categoria/23983023"], url_video_youtube: null, destaque: false, icms_origin_code: null, production_type: null, seo_title: "", seo_description: "", tags: [] };
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
    // Categorias e SEO sao do PRODUTO (25/10/2026): este produto ja os tem preenchidos, e o rascunho nao os leva.
    const ctxProd = { id: "p1", sku: "100404", tituloBase: "CLP FX3U 24MR", descricaoBase: "Linha 1\n\nLinha 2", marca: "MITSUBISHI", conferido: true, ncm: "85371020", origem: 0, tipoProducao: "REVENDA", ean: "x", pesoKg: 0.5, alturaCm: 2, larguraCm: 12, comprimentoCm: 6, videoUrl: null, categoriasLI: ["1"], seoTituloLI: "CLP FX3U 24MR", seoDescricaoLI: "Linha 1" };
    const inicial = rascunhoInicialLI(ctxProd);
    conferir("rascunho inicial", inicial, { produtoId: "p1", titulo: "CLP FX3U 24MR", slug: "clp-fx3u-24mr", marca: "MITSUBISHI", destaque: false, videoUrl: null, imagens: [] });
    conferir("rascunho inicial de produto sem texto", rascunhoInicialLI({ id: "p2" }), { produtoId: "p2", titulo: "", slug: "", marca: "", destaque: false, videoUrl: null, imagens: [] });
    conferir("vinculo traz o destaque da LI; o slug segue o nome; as categorias vao para o produto", rascunhoDaLI(inicial, { slug: "clp-da-li", categorias: ["1", "2"], destaque: true, nome: "Outro" }), { ...inicial, destaque: true });
    conferir("rascunho guardado: slug refeito do titulo", rascunhoDoAnuncio({ produtoId: "p", titulo: "Fonte 12V 5A", dados: { slug: "velho" } }).slug, "fonte-12v-5a");
    conferir("titulo ate 255 (limite medido na LI)", LIMITES_LI.titulo, 255);
    const lido = RascunhoLISchema.safeParse({ ...inicial, extra: 1 });
    conferir("esquema descarta chave estranha e aceita o rascunho", [lido.success, "extra" in (lido.data ?? {})], [true, false]);
    conferir("esquema descarta categorias e SEO que a tela mandar (sao do produto)", Object.keys(RascunhoLISchema.parse({ ...inicial, categorias: ["9"], seo: { title: "t", description: "d" } })).filter((chave) => ["categorias", "seo"].includes(chave)), []);
    conferir("esquema recusa titulo acima de 255", RascunhoLISchema.safeParse({ ...inicial, titulo: "x".repeat(256) }).success, false);
    conferir("esquema completa o que faltar", RascunhoLISchema.parse({ produtoId: "p3" }), { produtoId: "p3", titulo: "", slug: "", marca: "", destaque: false, videoUrl: null, imagens: [] });
    conferir("rascunho inicial leva as fotos do produto, a principal na frente", rascunhoInicialLI(ctxProd, { fotos: [{ id: "f2", principal: false }, { id: "f1", principal: true }] }).imagens, ["f1", "f2"]);
    conferir("fotos escolhidas nao mudam a assinatura (o envio de foto espera a VPS)", assinaturaLI(normalizarDoRiseLI(ctxProd, { ...inicial, imagens: ["f1"] }, {})), assinaturaLI(normalizarDoRiseLI(ctxProd, inicial, {})));
    conferir("ABAS_LI na ordem do dono", ABAS_LI.map((a) => a.id), ["geral", "imagens", "descricao", "categorias", "envio", "fiscal", "seo", "previa"]);
    conferir("abas com os nomes do cadastro de Produto", ABAS_LI.filter((a) => ["geral", "envio", "fiscal"].includes(a.id)).map((a) => a.rotulo), ["Características", "Peso e dimensões", "Tributação"]);
    conferir("alerta de categoria mora na aba Categorias", validarRascunhoLI(inicial, { produto: { ...ctxProd, categoriasLI: [] }, categoriasDaLI: null }).find((p) => p.campo === "categorias")?.aba, "categorias");
    conferir("rotulo da ultima aba", ABAS_LI.at(-1).rotulo, "Prévia e sincronização");
    const problemas = validarRascunhoLI({ ...inicial, titulo: "", slug: "Ré" }, { produto: { ...ctxProd, conferido: false, ncm: null, categoriasLI: ["9"], seoTituloLI: "t".repeat(71), seoDescricaoLI: "" }, categoriasDaLI: [{ id: "1" }] });
    conferir("bloqueantes: titulo e nao conferido (sem nome nao ha slug a acusar)", problemas.filter((p) => p.bloqueante).map((p) => p.campo), ["titulo", "produto", "seoDescription"]);
    conferir(
      "SEO obrigatorio (do produto): title e description vazios bloqueiam, na aba SEO, mandando preencher no produto",
      validarRascunhoLI(inicial, { produto: { ...ctxProd, seoTituloLI: " ", seoDescricaoLI: "" }, categoriasDaLI: null }).filter((p) => p.bloqueante).map((p) => [p.campo, p.aba, /no produto|do produto/.test(p.problema)]),
      [["seoTitulo", "seo", true], ["seoDescription", "seo", true]],
    );
    conferir("nome so de simbolos nao gera endereco", validarRascunhoLI({ ...inicial, titulo: "!!!" }, { produto: ctxProd, categoriasDaLI: null }).map((p) => [p.campo, p.bloqueante]), [["slug", true]]);
    conferir("alertas: ncm, categoria inexistente, seo longo", ["ncm", "categorias", "seoTitulo"].every((c) => problemas.some((p) => p.campo === c && !p.bloqueante)), true);
    conferir("todo problema tem aba conhecida", problemas.every((p) => ABAS_LI.some((a) => a.id === p.aba)), true);
    conferir("rascunho completo sem problema", validarRascunhoLI(inicial, { produto: ctxProd, categoriasDaLI: [{ id: "1" }] }), []);
    conferir("sem a lista ao vivo nao acusa categoria inexistente", validarRascunhoLI(inicial, { produto: { ...ctxProd, categoriasLI: ["9"] }, categoriasDaLI: null }), []);
    const faltas = validarRascunhoLI({ ...inicial, marca: "" }, { produto: { ...ctxProd, ean: null, pesoKg: null, alturaCm: null, categoriasLI: [] }, categoriasDaLI: null }).map((p) => p.campo);
    const gtinLoja = validarRascunhoLI(inicial, { produto: { ...ctxProd, ean: null }, categoriasDaLI: null, gtinDaLI: "7894382766950" }).find((p) => p.campo === "gtin");
    conferir("sem GTIN no Rise mas com GTIN na loja: a nota sai com o da loja", [Boolean(gtinLoja), /7894382766950/.test(gtinLoja?.problema ?? ""), /SEM GTIN/.test(gtinLoja?.problema ?? "")], [true, true, false]);
    conferir("alertas: sem gtin, marca, categoria, peso e medida", ["gtin", "marca", "categorias", "peso", "medidas"].every((c) => faltas.includes(c)), true);
  }

  {
    console.log("\nBanco: rascunho, vinculo, lista e frases por canal");
    await limpar();
    const configAntes = await prisma.configCanal.findUnique({ where: { canal: "LOJA_INTEGRADA" } });
    const urlPublicaAntes = config.appUrlPublica;
    try {
      const p = await prisma.produto.create({ data: { sku: "ZZ-LI-3", tituloBase: "Fonte 12V", descricaoBase: "Desc", marca: "ACME", ncm: "85044010", conferido: true, pesoKg: "0.250", tipoProducao: "REVENDA", categoriasLI: ["10", "20"], seoTituloLI: "T", seoDescricaoLI: "D" } });
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
      const salvo = await salvarRascunhoLI(null, { ...novo.rascunho, categorias: ["99"], seo: { title: "X", description: "Y" } });
      conferir("salva o rascunho", salvo.ok, true);
      const deNovo = await salvarRascunhoLI(null, { ...novo.rascunho, titulo: "Fonte 12V 5A" });
      conferir("segundo salvar sem id atualiza o mesmo anuncio (um por produto)", deNovo.id, salvo.id);
      const carregado = await carregarAnuncioLI(salvo.id);
      // Categorias e SEO sao do PRODUTO (25/10/2026): o contexto do editor os traz do cadastro e o que a tela mandar a mais e descartado.
      conferir("carrega titulo da coluna; categorias e SEO vem do produto", [carregado.rascunho.titulo, carregado.contexto.produto.categoriasLI, [carregado.contexto.produto.seoTituloLI, carregado.contexto.produto.seoDescricaoLI], carregado.vinculo.idExterno], ["Fonte 12V 5A", ["10", "20"], ["T", "D"], null]);
      const dadosSalvos = (await prisma.anuncio.findUnique({ where: { id: salvo.id } })).dados;
      conferir("o anuncio nao guarda categorias nem SEO", ["categorias" in dadosSalvos, "seo" in dadosSalvos], [false, false]);
      conferir("carregar id inexistente ou vazio", [(await carregarAnuncioLI("x")).ok, (await carregarAnuncioLI("")).ok], [false, false]);
      conferir("anuncio LI do produto", (await anuncioLIDoProduto(p.id))?.id, salvo.id);
      conferir("salvar guarda as fotos escolhidas, na ordem", (await carregarAnuncioLI(salvo.id)).rascunho.imagens, [fotoB.id, fotoA.id]);
      conferir("salvar guarda o slug do titulo, nao o que a tela mandou", (await prisma.anuncio.findUnique({ where: { id: salvo.id } })).dados.slug, "fonte-12v-5a");
      await vincularPeloSku(p.id, { idItemExterno: "401", url: "https://loja/x", ativo: true, slug: "fonte-da-li", categorias: ["30"], destaque: true });
      const vinculado = await carregarAnuncioLI(salvo.id);
      conferir("vinculo grava idExterno, url, ATIVA e traz o destaque da LI (slug do nome); as categorias do produto ficam", [vinculado.vinculo.idExterno, vinculado.vinculo.situacaoCanal, vinculado.rascunho.slug, vinculado.contexto.produto.categoriasLI, vinculado.rascunho.destaque, vinculado.rascunho.titulo], ["401", "ATIVA", "fonte-12v-5a", ["10", "20"], true, "Fonte 12V 5A"]);
      conferir("vinculo deixa o anuncio PUBLICADO", vinculado.status, "PUBLICADO");
      conferir("urlLojaIntegrada preenchida pelo vinculo", (await prisma.produto.findUnique({ where: { id: p.id } })).urlLojaIntegrada, "https://loja/x");
      conferir("anuncio vinculado continua editavel", (await salvarRascunhoLI(salvo.id, { ...vinculado.rascunho, titulo: "Fonte 12V 5A bivolt" })).ok, true);
      conferir("editar nao apaga o vinculo", (await carregarAnuncioLI(salvo.id)).vinculo.idExterno, "401");
      const r = await prisma.produto.create({ data: { sku: "ZZ-LI-5", tituloBase: "Sem rascunho", conferido: true } });
      const { anuncioId } = await vincularPeloSku(r.id, { idItemExterno: "402", url: "https://loja/y", ativo: false, slug: "sem-rascunho-li", categorias: ["7"], destaque: false });
      const criadoNoVinculo = await carregarAnuncioLI(anuncioId);
      conferir("vinculo leva as categorias da loja para o PRODUTO quando ele nao tem nenhuma", (await prisma.produto.findUnique({ where: { id: r.id }, select: { categoriasLI: true } })).categoriasLI, ["7"]);
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
    conferir("vinculo levou as categorias da LI para o produto (que nao tinha); o slug segue o nome", [aberto.rascunho.slug, (await prisma.produto.findUnique({ where: { id: prodL.id }, select: { categoriasLI: true } })).categoriasLI], [slugDe(aberto.rascunho.titulo), ["3"]]);
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
    // Categorias e SEO sao do PRODUTO (25/10/2026): a "999" e a categoria que nao existe mais na loja.
    const pe = await prisma.produto.create({ data: { sku: "ZZ-LI-9", tituloBase: "Modulo Rele", marca: "ARDUÍNO", ncm: "85364900", origem: 0, conferido: true, alturaCm: 1.2, larguraCm: 2, comprimentoCm: 3, pesoKg: 0.01, categoriasLI: ["5", "999"], seoTituloLI: "Rele Arduino", seoDescricaoLI: "D" } });
    const li3 = criarLojaIntegradaFalsa({ produtos: [{ id: 601, sku: "ZZ-LI-9", nome: "Rele", apelido: "/rele", ativo: true, removido: false, ncm: "", marca: null, categorias: ["/api/v1/categoria/5"], seo: "/api/v1/seo/61", imagens: [{ id: 1 }], preco_cheio: "10.00", estoque_quantidade: 4 }], marcas: [{ id: 2, nome: "Arduino" }], categorias: [{ id: 5, nome: "Reles" }], seos: { 61: { title: "", description: "" } } });
    conferir("sincronizar sem vinculo pede Cadastrar", /Cadastrar na LI/.test((await sincronizarProdutoLI(pe.id, li3)).erro ?? ""), true);
    await lerParaPopupLI(pe.id, li3); // vincula
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
    const pf = await prisma.produto.create({ data: { sku: "ZZ-LI-12", tituloBase: "Falha", ncm: "85364900", conferido: true, seoTituloLI: "Titulo", seoDescricaoLI: "Resumo" } });
    const li4 = criarLojaIntegradaFalsa({ produtos: [{ id: 701, sku: "ZZ-LI-12", nome: "Antigo", apelido: "/antigo", seo: "/api/v1/seo/71" }], seos: { 71: { title: "", description: "" } }, falhas: { "PUT /seo/71": 500 } });
    await lerParaPopupLI(pf.id, li4);
    const falhou = await sincronizarProdutoLI(pf.id, li4);
    const anDepois = await anuncioLIDoProduto(pf.id);
    conferir("falha no SEO: etapa seo, anuncio em ERRO, assinatura intacta", [falhou.ok, falhou.etapa, anDepois.status, anDepois.erro !== null, anDepois.dados.etapa, anDepois.hashConteudo], [false, "seo", "ERRO", true, "seo", null]);
    conferir("falha no SEO: o PUT do produto ja tinha ido (aparece nos alterados)", falhou.alterados.some((a) => a.campo === "nome"), true);
    // Cadastro
    const pc = await prisma.produto.create({ data: { sku: "ZZ-LI-10", tituloBase: "Novo na LI", descricaoBase: "O produto novo na loja.", marca: "NOVAMARCA", ncm: "85364900", conferido: true, categoriasLI: ["5"], seoTituloLI: "Novo na LI", seoDescricaoLI: "O produto novo na loja." } });
    const semSeo = await prisma.produto.create({ data: { sku: "ZZ-LI-14", tituloBase: "Sem SEO", ncm: "85364900", conferido: true } });
    const recusaSeo = await cadastrarNaLI(semSeo.id, li3, criarBlingDaLI());
    conferir("cadastrar de produto sem SEO recusa mandando preencher no produto, antes do POST", [recusaSeo.ok, /produto/.test(recusaSeo.erro ?? ""), li3.chamadas.filter((c) => c.metodo === "POST" && c.caminho === "/produto").length], [false, true, 0]);
    const semNcm = await prisma.produto.create({ data: { sku: "ZZ-LI-11", tituloBase: "Sem NCM", conferido: true } });
    conferir("cadastrar sem NCM recusa antes do POST", [/NCM/.test((await cadastrarNaLI(semNcm.id, li3, criarBlingDaLI())).erro ?? ""), li3.chamadas.filter((c) => c.metodo === "POST" && c.caminho === "/produto").length], [true, 0]);
    const cad = await cadastrarNaLI(pc.id, li3, criarBlingDaLI());
    // Desde 24/10/2026 o cadastro liga no Bling, grava o estoque e ATIVA (era inativo e parava).
    conferir("cadastro: ativo no fim, marca criada, vinculo gravado", [cad.ok, li3.produtos().at(-1).ativo, li3.marcas().some((m) => m.nome === "NOVAMARCA"), (await anuncioLIDoProduto(pc.id)).idExterno === cad.idExterno], [true, true, true, true]);
    const anCad = await anuncioLIDoProduto(pc.id);
    conferir("cadastro: ATIVA, PUBLICADO, assinatura e data", [anCad.situacaoCanal, anCad.status, typeof anCad.hashConteudo, anCad.sincronizadoEm !== null], ["ATIVA", "PUBLICADO", "string", true]);
    conferir("cadastrar de novo recusa (ja existe)", (await cadastrarNaLI(pc.id, li3, criarBlingDaLI())).ok, false);
    const naoConfCad = await prisma.produto.create({ data: { sku: "ZZ-LI-13", tituloBase: "Nao conferido", ncm: "85364900" } });
    conferir("cadastrar nao Conferido recusa", (await cadastrarNaLI(naoConfCad.id, li3, criarBlingDaLI())).ok, false);
    // Trava fechada: um cliente cuja exigirEscrita lanca (a trava real e a da carga do processo)
    const travada = { ...li3, exigirEscrita: () => { throw new Error("Escrita bloqueada: LI_ESCRITA esta false no .env. Nenhum dado foi enviado."); } };
    const chamadasAntesDaTrava = li3.chamadas.length;
    const recusado = await sincronizarProdutoLI(pe.id, travada);
    conferir("trava fechada: recusa antes de qualquer chamada", [recusado.erro.includes("LI_ESCRITA"), recusado.etapa, li3.chamadas.length - chamadasAntesDaTrava], [true, "trava", 0]);
    conferir("mudouNaLI e resumirEnvioLI", [mudouNaLI("sincronizar", envio), resumirEnvioLI("sincronizar", { ok: true, alterados: [] }).titulo], [true, "Nada para enviar: a Loja Integrada já estava igual ao Rise."]);
    conferir("resumo do sincronizar lista os campos", resumirEnvioLI("sincronizar", { ok: true, alterados: [{ campo: "peso", de: null, para: 0.5 }] }, { peso: "Peso (kg)" }), { titulo: "Sincronizado com a Loja Integrada.", linhas: ["Peso (kg): de vazio para 0,5 kg"] });
    conferir("resumo do cadastro", resumirEnvioLI("cadastrar", { ok: true, idExterno: "9", etapas: ["criar", "ativar"] }), { titulo: "Produto cadastrado e ativo na Loja Integrada.", linhas: ["Criar o anúncio pausado: feito.", "Ativar o anúncio: feito."] });
    conferir(
      "resumo do cadastro que parou no Bling: etapa e o que fazer",
      resumirEnvioLI("cadastrar", { ok: false, idExterno: "9", etapa: "ligar_bling", etapas: ["criar"] }).titulo,
      'O cadastro parou em "Ligar à Loja Integrada no Bling". O produto está na Loja Integrada, pausado.',
    );
    conferir("resumo do cadastro que parou antes do conteudo terminar: como era", resumirEnvioLI("cadastrar", { ok: false, idExterno: "9", etapa: "seo", etapas: [] }).titulo, "O produto foi criado na Loja Integrada (id 9), mas o envio não terminou.");
    conferir("completar muda a LI", [mudouNaLI("completar", { ok: true }), mudouNaLI("completar", { ok: false, idExterno: "9" }), mudouNaLI("completar", { ok: false })], [true, true, false]);
    // A aba Divergencias abre com qualquer motivo do "!" (25/10/2026: origem e tipo de producao vazios na loja, inativo).
    {
      const { resumoDasDivergenciasLI } = await import("../src/lib/canaisDeVenda/li/apresentacao.js");
      const lida = { ok: true, situacao: "existe", diferencas: [], fiscais: [], ativoNaLI: true, cadastroFalhou: null };
      conferir("divergencias: loja igual, nada", resumoDasDivergenciasLI(lida).total, 0);
      conferir("divergencias: origem e tipo vazios na loja abrem a aba", resumoDasDivergenciasLI({ ...lida, fiscais: [{ campo: "origem" }, { campo: "tipoProducao" }] }), { diferentes: 0, fiscais: 2, inativo: false, total: 2 });
      conferir("divergencias: produto inativo abre a aba", resumoDasDivergenciasLI({ ...lida, ativoNaLI: false }).total, 1);
      conferir("divergencias: inativo com o cadastro automatico falho nao conta (a faixa ja explica)", resumoDasDivergenciasLI({ ...lida, ativoNaLI: false, cadastroFalhou: { etapa: "estoque" } }).total, 0);
      conferir("divergencias: campo diferente e fotos continuam contando", resumoDasDivergenciasLI({ ...lida, diferencas: [{ tipo: "diferente" }, { tipo: "vazioNoRise" }], fotos: { estado: "faltam" } }).diferentes, 2);
      conferir("divergencias: produto fora da loja ou leitura com erro, nada", [resumoDasDivergenciasLI({ ...lida, situacao: "nao_existe", fiscais: [{}] }).total, resumoDasDivergenciasLI({ ok: false }).total], [0, 0]);
    }
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
    const pm = await prisma.produto.create({ data: { sku: "ZZ-LI-14", tituloBase: "Morta", ncm: "85364900", conferido: true, categoriasLI: ["5", "999"] } });
    const li5 = criarLojaIntegradaFalsa({ produtos: [{ id: 801, sku: "ZZ-LI-14", nome: "Morta", apelido: "/morta", categorias: ["/api/v1/categoria/5"], seo: "/api/v1/seo/81" }], categorias: [{ id: 5, nome: "Reles" }], seos: { 81: { title: "", description: "" } } });
    await lerParaPopupLI(pm.id, li5); // vincula
    const popM = await lerParaPopupLI(pm.id, li5);
    conferir("pop-up: categoria que sumiu da loja nao vira diferenca eterna", popM.diferencas.some((d) => d.campo === "categorias"), false);
    conferir("pop-up: categoria que sumiu da loja vira aviso", popM.avisos.some((a) => /999/.test(a) && /não existe mais/.test(a)), true);
  }

  {
    // 100105 (24/10/2026): o Rise tinha o pai ("Placas Embarcadas") e a filha ("01 - Placas Arduino"), a loja so a filha, e o
    // pop-up mostrava "Categorias: diferente". Pai marcado junto da filha nao conta: a loja agrega as subcategorias sozinha.
    console.log("\nCategorias: o pai marcado junto da filha nao e diferenca nem vai no envio");
    await limpar();
    const arvoreFalsa = [{ id: 5, nome: "Embarcados" }, { id: 6, nome: "Arduino", categoria_pai: "/api/v1/categoria/5" }, { id: 7, nome: "Sensores" }];
    const comLoja = (categorias, extra = {}) =>
      criarLojaIntegradaFalsa({
        produtos: [{ id: 901, sku: "ZZ-LI-15", nome: "Placa", apelido: "/placa", categorias, seo: "/api/v1/seo/91", ...extra }],
        categorias: arvoreFalsa,
        seos: { 91: { title: "", description: "" } },
      });
    const pp = await prisma.produto.create({ data: { sku: "ZZ-LI-15", tituloBase: "Placa", ncm: "85364900", conferido: true } });
    const marcarNoRise = async (categorias, nome) => {
      // Categorias e SEO sao do PRODUTO (25/10/2026); o SEO (title e description) e obrigatorio para sincronizar. O nome e do rascunho.
      await prisma.produto.update({ where: { id: pp.id }, data: { categoriasLI: categorias, seoTituloLI: "Placa", seoDescricaoLI: "Descricao da placa" } });
      if (nome) {
        const an = await anuncioLIDoProduto(pp.id);
        await salvarRascunhoLI(an.id, { ...rascunhoDoAnuncio(an), titulo: nome });
      }
    };
    const diferencaDeCategorias = async (cliente) => (await lerParaPopupLI(pp.id, cliente)).diferencas.find((d) => d.campo === "categorias");

    const so6 = comLoja(["/api/v1/categoria/6"]);
    await lerParaPopupLI(pp.id, so6); // vincula
    await marcarNoRise(["5", "6"]);
    conferir("Rise com pai + filha, loja so com a filha: sem diferenca", await diferencaDeCategorias(so6), undefined);
    const com56 = comLoja(["/api/v1/categoria/5", "/api/v1/categoria/6"]);
    await marcarNoRise(["6"]);
    conferir("Rise so com a filha, loja com pai + filha: sem diferenca", await diferencaDeCategorias(com56), undefined);
    const so7 = comLoja(["/api/v1/categoria/7"]);
    await marcarNoRise(["5", "6"]);
    const verdadeira = await diferencaDeCategorias(so7);
    conferir("categoria de verdade diferente continua sendo diferenca (o pai nao aparece)", [verdadeira?.tipo, verdadeira?.rise, verdadeira?.li], ["diferente", ["6"], ["7"]]);

    // Sincronizar: com o resto mudando, as categorias nao entram no PUT (a loja ja tem a filha) e a loja fica como estava.
    const lojaIgual = comLoja(["/api/v1/categoria/6"]);
    await marcarNoRise(["5", "6"], "Placa Nova");
    const sinc = await sincronizarProdutoLI(pp.id, lojaIgual);
    conferir("sincronizar: o nome muda e as categorias nao vao", [sinc.ok, sinc.alterados.some((a) => a.campo === "nome"), sinc.alterados.some((a) => a.campo === "categorias")], [true, true, false]);
    conferir("sincronizar: a loja continua so com a filha", lojaIgual.produtos().find((p) => p.id === 901).categorias, ["/api/v1/categoria/6"]);
    const lojaComPai = comLoja(["/api/v1/categoria/5", "/api/v1/categoria/6"]);
    await marcarNoRise(["6"], "Placa Nova");
    const sinc2 = await sincronizarProdutoLI(pp.id, lojaComPai);
    conferir("sincronizar: loja com o pai a mais nao e diferenca, e o pai fica (o Rise nao o tira)", [sinc2.alterados.some((a) => a.campo === "categorias"), lojaComPai.produtos().find((p) => p.id === 901).categorias], [false, ["/api/v1/categoria/5", "/api/v1/categoria/6"]]);
    // Categoria diferente de verdade: vai so a filha, sem o pai.
    const lojaOutra = comLoja(["/api/v1/categoria/7"]);
    await marcarNoRise(["5", "6"], "Placa Nova");
    const sinc3 = await sincronizarProdutoLI(pp.id, lojaOutra);
    conferir("sincronizar categoria diferente: vai so a filha", [sinc3.alterados.find((a) => a.campo === "categorias")?.para, lojaOutra.produtos().find((p) => p.id === 901).categorias], [["6"], ["/api/v1/categoria/6"]]);

    // Cadastrar: o produto novo nasce so com a filha.
    const pn = await prisma.produto.create({ data: { sku: "ZZ-LI-16", tituloBase: "Placa Nova na LI", descricaoBase: "Placa nova.", ncm: "85364900", conferido: true, categoriasLI: ["5", "6"], seoTituloLI: "Placa Nova na LI", seoDescricaoLI: "Placa nova." } });
    const lojaNova = criarLojaIntegradaFalsa({ categorias: arvoreFalsa });
    const cadastro = await cadastrarNaLI(pn.id, lojaNova, criarBlingDaLI());
    conferir("cadastrar: nasce so com a filha", [cadastro.ok, lojaNova.produtos().at(-1).categorias], [true, ["/api/v1/categoria/6"]]);
  }

  {
    console.log("\nRevisao final: description padrao pula o titulo");
    conferir("pula o paragrafo que repete o nome", descriptionPadrao("PLACA UNO R3\n\nA Placa e uma placa de desenvolvimento.", "Placa Uno R3"), "A Placa e uma placa de desenvolvimento.");
    conferir("pula a linha toda em maiusculas (o titulo do padrao da loja)", descriptionPadrao("MODULO RELE 5V\n\nO Modulo aciona cargas.", "Outro nome"), "O Modulo aciona cargas.");
    conferir("paragrafo normal fica", descriptionPadrao("Texto comum.\n\nSegundo.", "Nome"), "Texto comum.");
    conferir("so o titulo: fica o titulo (melhor que vazio)", descriptionPadrao("PLACA UNO R3", "Placa Uno R3"), "PLACA UNO R3");
    conferir("a description sugerida usa o paragrafo de verdade", descriptionPadrao("PLACA UNO\n\nA Placa faz X.", "PLACA UNO"), "A Placa faz X.");
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
    const { MAXIMO_DE_SUGESTOES, limparSugestoesDeCategoria, montarPedidoDeCategorias, semAncestraisRedundantes } = await import("../src/lib/canaisDeVenda/li/categorias.js");
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
    // Pai redundante (pedido do dono em 24/10/2026, 100105): marcar a filha NAO marca o pai, e o pai marcado junto da filha
    // nao conta na comparacao nem no envio (a loja agrega as subcategorias sozinha).
    conferir("pai e avo marcados junto da filha saem, a filha fica", semAncestraisRedundantes(["1", "2", "3"], arvore), ["3"]);
    conferir("a ordem de entrada e mantida", semAncestraisRedundantes(["4", "3", "2"], arvore), ["4", "3"]);
    conferir("pai sozinho (sem filha marcada) fica", semAncestraisRedundantes(["1"], arvore), ["1"]);
    conferir("ramos diferentes nao se atrapalham", semAncestraisRedundantes(["3", "4"], arvore), ["3", "4"]);
    conferir("id fora da arvore fica (categoria morta e assunto de outra regra)", semAncestraisRedundantes(["99", "3", "2"], arvore), ["99", "3"]);
    conferir("avo que sumiu da arvore: o pai continua redundante", semAncestraisRedundantes(["3", "2"], arvore.filter((c) => c.id !== "1")), ["3"]);
    conferir("ids em numero tambem valem", semAncestraisRedundantes([3, 2], arvore), [3]);
    conferir("sem arvore ou sem ids nada muda", [semAncestraisRedundantes(["3", "2"], null), semAncestraisRedundantes([], arvore), semAncestraisRedundantes(null, arvore)], [["3", "2"], [], []]);
    conferir("ciclo na arvore nao esvazia a lista", semAncestraisRedundantes(["1", "2"], [{ id: "1", paiId: "2" }, { id: "2", paiId: "1" }]), ["1", "2"]);
    const pedido = montarPedidoDeCategorias({ titulo: "Placa Uno R3", marca: "GENERICA", descricao: "A placa faz X.", categorias: arvore });
    conferir("o pedido leva o produto e a arvore com os ids", [pedido.includes("Placa Uno R3"), pedido.includes("A placa faz X."), pedido.includes("3: Embarcados > Arduino > Placas Arduino")], [true, true, true]);
  }

  {
    console.log("\nPreço: o Rise manda o preço cheio pelo /produto_preco (o estoque segue com o Bling)");
    await limpar();
    conferir("preço é campo de envio", CAMPOS_DE_ENVIO_LI.find((c) => c.id === "preco")?.rotulo, "Preço");
    conferir("Rise: preço de venda com 2 casas", normalizarDoRiseLI({ precoVenda: "16.5" }, {}).preco, 16.5);
    conferir("Rise sem preço: null", normalizarDoRiseLI({ precoVenda: null }, {}).preco, null);
    conferir("LI: preço cheio do detalhe ('49.0000' vira 49)", normalizarDaLI({ preco_cheio: "49.0000" }, null).preco, 49);
    conferir("preço igual com formatos diferentes não é diferença", diferencasLI({ preco: 49 }, { preco: 49 }).some((d) => d.campo === "preco"), false);
    conferir("preço vazio no Rise não apaga o da loja", diferencasLI({ preco: null }, { preco: 10 }).find((d) => d.campo === "preco")?.tipo, "vazioNoRise");
    conferir("preço na loja vazio com preço no Rise é diferença", diferencasLI({ preco: 16 }, { preco: null }).find((d) => d.campo === "preco")?.tipo, "diferente");

    const pp = await prisma.produto.create({ data: { sku: "ZZ-LI-20", tituloBase: "Placa", ncm: "85364900", conferido: true, precoVenda: 16, seoTituloLI: "T", seoDescricaoLI: "D" } });
    const liP = criarLojaIntegradaFalsa({ produtos: [{ id: 801, sku: "ZZ-LI-20", nome: "Placa", apelido: "/placa", ncm: "8536.49.00", seo: "/api/v1/seo/81", preco_cheio: "15.0000", preco_custo: "5.0000", preco_promocional: null, estoque_quantidade: 6 }], seos: { 81: { title: "T", description: "D" } } });
    await lerParaPopupLI(pp.id, liP); // vincula
    const envioP = await sincronizarProdutoLI(pp.id, liP);
    const naLIP = liP.produtos().find((p) => p.id === 801);
    conferir("sincronizar manda só o preço que mudou", [envioP.ok, envioP.alterados.map((a) => [a.campo, a.de, a.para])], [true, [["preco", 15, 16]]]);
    conferir("preço gravado; custo e estoque intactos", [Number(naLIP.preco_cheio), naLIP.preco_custo, naLIP.estoque_quantidade], [16, "5.0000", 6]);
    conferir("preço não passa pelo PUT do produto nem pelo estoque", [liP.chamadas.some((c) => c.metodo === "PUT" && c.caminho === "/produto/801"), liP.chamadas.some((c) => c.metodo === "PUT" && String(c.caminho).startsWith("/produto_estoque"))], [false, false]);
    conferir("lê o preço antes de gravar e guarda cópia", [liP.chamadas.some((c) => c.metodo === "GET" && c.caminho === "/produto_preco/801"), await prisma.copiaProdutoCanal.count({ where: { produtoId: pp.id } })], [true, 1]);
    const putsP = liP.chamadas.filter((c) => c.metodo === "PUT").length;
    conferir("segunda sincronização não manda o preço de novo", [(await sincronizarProdutoLI(pp.id, liP)).alterados, liP.chamadas.filter((c) => c.metodo === "PUT").length], [[], putsP]);

    // Falha no PUT do preço: etapa "preco", anúncio em ERRO, assinatura intacta.
    await prisma.produto.update({ where: { id: pp.id }, data: { precoVenda: 17 } });
    const hashAntes = (await anuncioLIDoProduto(pp.id)).hashConteudo;
    const liFalha = criarLojaIntegradaFalsa({ produtos: [{ ...naLIP, seo: "/api/v1/seo/81" }], seos: { 81: { title: "T", description: "D" } }, falhas: { "PUT /produto_preco/801": 500 } });
    const falhaP = await sincronizarProdutoLI(pp.id, liFalha);
    const anFalha = await anuncioLIDoProduto(pp.id);
    conferir("falha no preço: etapa preco, ERRO, assinatura intacta", [falhaP.ok, falhaP.etapa, anFalha.status, anFalha.hashConteudo === hashAntes], [false, "preco", "ERRO", true]);

    // Cadastro com preço: POST do produto e, em seguida, o preço.
    const pn = await prisma.produto.create({ data: { sku: "ZZ-LI-21", tituloBase: "Novo com preço", descricaoBase: "A placa nova na loja.", ncm: "85364900", conferido: true, precoVenda: 29.9, seoTituloLI: "Novo", seoDescricaoLI: "A placa nova na loja." } });
    const liN = criarLojaIntegradaFalsa({});
    const cadN = await cadastrarNaLI(pn.id, liN, criarBlingDaLI());
    const novoN = liN.produtos().at(-1);
    conferir("preço na tela em reais", /^R\$\s16,00$/.test(valorParaTela("preco", 16)), true);
    conferir("cadastrar grava o preço depois do POST", [cadN.ok, Number(novoN.preco_cheio), liN.chamadas.findIndex((c) => c.metodo === "POST") < liN.chamadas.findIndex((c) => c.metodo === "PUT" && String(c.caminho).startsWith("/produto_preco"))], [true, 29.9, true]);
  }

  {
    console.log("\nFotos: o Sincronizar troca as da loja por TODAS as do produto, na ordem do cadastro (21/10/2026)");
    const { fotosDaLoja, fotosDoAnuncio, planoDasFotosLI } = await import("../src/lib/canaisDeVenda/li/fotos.js");
    conferir("loja: na ordem da posicao (texto), sem posicao no fim", fotosDaLoja({ imagens: [{ id: 9, posicao: null }, { id: 2, posicao: "1" }, { id: 1, posicao: "0" }] }).map((f) => f.id), ["1", "2", "9"]);
    conferir("anuncio: na ordem marcada, so fotos que existem", fotosDoAnuncio(["b", "x", "a", "b"], [{ id: "a", arquivo: "a.jpg" }, { id: "b", arquivo: "b.jpg" }]).map((f) => f.arquivo), ["b.jpg", "a.jpg"]);
    const A = { id: "a", arquivo: "a.jpg" };
    const B = { id: "b", arquivo: "b.jpg" };
    conferir("Rise sem foto nunca apaga as da loja", planoDasFotosLI({ desejadas: [], naLoja: [{ id: "1" }], enviadas: [] }).acao, "nada");
    conferir("loja com fotos que o Rise nao mandou: troca", planoDasFotosLI({ desejadas: [A], naLoja: [{ id: "1" }], enviadas: [] }), { acao: "trocar", motivo: "diferentes", apagar: ["1"], enviar: [A], posicaoInicial: 0 });
    conferir("loja igual ao enviado: nada", planoDasFotosLI({ desejadas: [A, B], naLoja: [{ id: "1" }, { id: "2" }], enviadas: [{ arquivo: "a.jpg", liId: "1" }, { arquivo: "b.jpg", liId: "2" }] }).acao, "nada");
    conferir("envio parou no meio: so acrescenta", planoDasFotosLI({ desejadas: [A, B], naLoja: [{ id: "1" }], enviadas: [{ arquivo: "a.jpg", liId: "1" }] }), { acao: "acrescentar", motivo: "faltam", apagar: [], enviar: [B], posicaoInicial: 1 });
    conferir("ordem trocada no anuncio: troca tudo", planoDasFotosLI({ desejadas: [B, A], naLoja: [{ id: "1" }, { id: "2" }], enviadas: [{ arquivo: "a.jpg", liId: "1" }, { arquivo: "b.jpg", liId: "2" }] }).acao, "trocar");
    conferir("alguem apagou uma foto na loja: troca tudo", planoDasFotosLI({ desejadas: [A, B], naLoja: [{ id: "2" }], enviadas: [{ arquivo: "a.jpg", liId: "1" }, { arquivo: "b.jpg", liId: "2" }] }).acao, "trocar");

    await limpar();
    const urlPublicaAntes = config.appUrlPublica;
    try {
      const pf = await prisma.produto.create({ data: { sku: "ZZ-LI-30", tituloBase: "Placa", ncm: "85364900", conferido: true, seoTituloLI: "T", seoDescricaoLI: "D" } });
      const f1 = await prisma.produtoArquivo.create({ data: { produtoId: pf.id, tipo: "IMAGEM", arquivo: "f1.jpg", principal: true, ordem: 0 } });
      const f2 = await prisma.produtoArquivo.create({ data: { produtoId: pf.id, tipo: "IMAGEM", arquivo: "f2.jpg", ordem: 1 } });
      const liF = criarLojaIntegradaFalsa({ produtos: [{ id: 901, sku: "ZZ-LI-30", nome: "Placa", apelido: "/placa", ncm: "8536.49.00", seo: "/api/v1/seo/91", imagens: [{ id: 50, principal: true, posicao: null }] }], seos: { 91: { title: "T", description: "D" } } });
      await lerParaPopupLI(pf.id, liF); // vincula

      const semUrl = await sincronizarProdutoLI(pf.id, liF);
      conferir("sem endereco publico: nada de foto e o motivo", [semUrl.ok, /APP_URL_PUBLICA/.test(semUrl.fotos ?? ""), liF.chamadas.some((c) => c.caminho?.startsWith("/produto_imagem"))], [true, true, false]);

      config.appUrlPublica = "https://rise.exemplo.com/";
      const popup = await lerParaPopupLI(pf.id, liF);
      conferir("editor: as fotos aparecem como diferentes", popup.fotos?.estado, "diferentes");
      const envio = await sincronizarProdutoLI(pf.id, liF);
      const naLoja = liF.produtos().find((p) => p.id === 901).imagens;
      conferir("troca: apaga a da loja e manda todas as do produto, a principal como capa (o anuncio sem foto marcada nao importa)", [envio.ok, naLoja.map((i) => [i.url, i.principal, i.posicao])], [true, [["https://rise.exemplo.com/api/arquivos/ZZ-LI-30/imagens/f1.jpg", true, "0"], ["https://rise.exemplo.com/api/arquivos/ZZ-LI-30/imagens/f2.jpg", false, "1"]]]);
      conferir("o resumo conta o que fez", envio.fotos, "Fotos: 1 apagada(s) da loja e 2 enviada(s) do Rise, na ordem do cadastro.");
      conferir("o Rise guarda o que mandou", (await anuncioLIDoProduto(pf.id)).dados.fotosLI.map((f) => f.arquivo), ["f1.jpg", "f2.jpg"]);
      const escritas = liF.chamadas.filter((c) => c.caminho?.startsWith("/produto_imagem")).length;
      const deNovo = await sincronizarProdutoLI(pf.id, liF);
      conferir("segundo Sincronizar nao mexe nas fotos", [deNovo.fotos, liF.chamadas.filter((c) => c.caminho?.startsWith("/produto_imagem")).length], [null, escritas]);
      conferir("editor: fotos iguais", (await lerParaPopupLI(pf.id, liF)).fotos?.estado, "iguais");

      // A capa mudou no cadastro: troca tudo. A segunda foto falha; o proximo Sincronizar so acrescenta a que faltou.
      await prisma.produtoArquivo.update({ where: { id: f1.id }, data: { principal: false } });
      await prisma.produtoArquivo.update({ where: { id: f2.id }, data: { principal: true } });
      let postados = 0;
      const postOriginal = liF.post;
      liF.post = async (caminho, corpo) => (caminho === "/produto_imagem" && ++postados === 2 ? { ok: false, status: 500, duracaoMs: 0, dados: null } : postOriginal(caminho, corpo));
      const parou = await sincronizarProdutoLI(pf.id, liF);
      liF.post = postOriginal;
      conferir("falha no meio: etapa fotos e o que foi enviado fica guardado", [parou.ok, parou.etapa, (await anuncioLIDoProduto(pf.id)).dados.fotosLI.map((f) => f.arquivo)], [false, "fotos", ["f2.jpg"]]);
      const retomou = await sincronizarProdutoLI(pf.id, liF);
      conferir("retomar so acrescenta a que faltou", [retomou.ok, retomou.fotos, liF.produtos().find((p) => p.id === 901).imagens.map((i) => i.url.split("/").pop())], [true, "Fotos: 1 acrescentada(s) na loja.", ["f2.jpg", "f1.jpg"]]);

      // Cadastrar: o produto nasce na loja com as fotos do anuncio.
      const pn = await prisma.produto.create({ data: { sku: "ZZ-LI-31", tituloBase: "Novo com foto", descricaoBase: "A placa nova na loja.", ncm: "85364900", conferido: true, seoTituloLI: "Novo", seoDescricaoLI: "A placa nova na loja." } });
      await prisma.produtoArquivo.create({ data: { produtoId: pn.id, tipo: "IMAGEM", arquivo: "n1.jpg", principal: true, ordem: 0 } });
      const liN = criarLojaIntegradaFalsa({});
      const cad = await cadastrarNaLI(pn.id, liN, criarBlingDaLI());
      conferir("cadastrar envia as fotos do produto", [cad.ok, liN.produtos().at(-1).imagens.map((i) => [i.url.split("/").pop(), i.principal])], [true, [["n1.jpg", true]]]);
    } finally {
      config.appUrlPublica = urlPublicaAntes;
    }
  }

  // -------------------------------------------------------------------------
  // Proposta de anuncio (plano 2026-10-23, Tarefa 2): a regra de preenchimento do rascunho (pura)
  // -------------------------------------------------------------------------
  {
    console.log("\nProposta de anúncio: preenchimento");
    const { aplicarProposta, montarProposta, marcaDaProposta } = await import("../src/lib/propostaDeAnuncio/preencher.js");
    const r0 = { marca: "", categorias: [], seo: { title: "T", description: "" } };
    const a = aplicarProposta(r0, { marca: "ARDUINO", categorias: ["10", "11"], "seo.description": "d".repeat(140) });
    conferir("preenche vazios", [a.rascunho.marca, a.rascunho.categorias, a.rascunho.seo.description.length, a.rascunho.seo.title], ["ARDUINO", ["10", "11"], 140, "T"]);
    conferir("campos", [...a.campos].sort(), ["categorias", "marca", "seo.description"]);
    const b = aplicarProposta({ ...r0, marca: "GENÉRICA" }, { marca: "ARDUINO" });
    conferir("não sobrescreve", [b.rascunho.marca, b.campos, b.sugestoes.marca], ["GENÉRICA", [], "ARDUINO"]);
    const c = aplicarProposta({ ...r0, marca: "ARDUINO" }, { marca: "ARDUINO" });
    conferir("igual não marca", [c.campos, c.sugestoes], [[], {}]);
    conferir("não muda o original", [r0.marca, r0.categorias], ["", []]);
    const d = aplicarProposta(r0, { categorias: ["11", "10"] }, { vazio: () => true });
    conferir("vazio próprio decide", d.rascunho.categorias, ["11", "10"]);
    const e = aplicarProposta(r0, { marca: undefined, categorias: [] });
    conferir("proposto vazio não entra", [e.campos, e.sugestoes], [[], {}]);
    const proposta = montarProposta({ versaoDoRoteiro: "1", campos: ["marca"], sugestoes: { "seo.description": "x" }, relatorio: "- a" });
    conferir("montarProposta", [proposta.versaoDoRoteiro, typeof proposta.criadaEm, proposta.relatorio], ["1", "string", "- a"]);
    conferir("valores do que entrou", a.valores.marca, "ARDUINO");
    const { valorProposto } = await import("../src/lib/propostaDeAnuncio/preencher.js");
    conferir("valorProposto", [valorProposto(montarProposta({ campos: ["marca"], valores: { marca: "ARDUINO" } }), "marca"), valorProposto(proposta, "seo.description")], ["ARDUINO", "x"]);
    conferir("marcaDaProposta", [marcaDaProposta(proposta, "seo.description"), marcaDaProposta(proposta, "marca"), marcaDaProposta(proposta, "categorias"), marcaDaProposta(null, "marca")], ["sugestao", "preenchido", null, null]);
  }

  {
    console.log("\nCadastro automatico: regras (24/10/2026)");
    const { ETAPAS_DO_CADASTRO_LI, corpoDoEstoqueInicialLI, faltaNoCadastroLI, ofereceCompletar } = await import("../src/lib/canaisDeVenda/li/etapasCadastro.js");
    conferir("ordem das etapas", ETAPAS_DO_CADASTRO_LI, ["criar", "ligar_bling", "estoque", "ativar", "gravar"]);
    conferir(
      "estoque inicial: saldo arredondado, negativo e vazio viram 0, sempre indisponivel sem estoque",
      [5, -3, null, 2.6, "abc"].map((saldo) => corpoDoEstoqueInicialLI(saldo).quantidade),
      [5, 0, 0, 3, 0],
    );
    conferir("estoque inicial: corpo medido", corpoDoEstoqueInicialLI(5), { gerenciado: true, quantidade: 5, situacao_sem_estoque: -1 });
    const do100108 = faltaNoCadastroLI({ idExterno: "404671257", ativo: true, estoqueGerenciado: false, situacaoNoBling: "ligado" });
    conferir("100108 (ativo, ligado, sem controle de estoque): falta o estoque", do100108, ["estoque"]);
    conferir("sem vinculo no Bling, inativo, sem estoque: falta tudo", faltaNoCadastroLI({ idExterno: "1", ativo: false, estoqueGerenciado: false, situacaoNoBling: "sem_vinculo" }), ["ligar_bling", "estoque", "ativar"]);
    conferir("fora da LI: nada a completar", faltaNoCadastroLI({ idExterno: null, ativo: false, estoqueGerenciado: false, situacaoNoBling: "sem_vinculo" }), []);
    conferir("ligado a outro produto da LI: o vinculo nao entra (o dono corrige no Bling)", faltaNoCadastroLI({ idExterno: "1", ativo: true, estoqueGerenciado: true, situacaoNoBling: "codigo_diferente" }), []);
    const soInativo = faltaNoCadastroLI({ idExterno: "1", ativo: false, estoqueGerenciado: true, situacaoNoBling: "ligado" });
    conferir("so inativo (pausado de proposito?): falta ativar, mas nao oferece", [soInativo, ofereceCompletar({ falta: soInativo })], [["ativar"], false]);
    conferir("oferece com estoque faltando ou com falha gravada", [ofereceCompletar({ falta: do100108 }), ofereceCompletar({ falta: [], falhou: true })], [true, true]);
  }

  {
    console.log("\nCadastro automatico: criar pausado, ligar no Bling, estoque, ativar");
    await limpar();
    const novo = (sku) => prisma.produto.create({ data: { sku, tituloBase: `Auto ${sku}`, descricaoBase: "O produto do cadastro automatico.", ncm: "85364900", conferido: true, seoTituloLI: "Auto", seoDescricaoLI: "O produto do cadastro automatico." } });
    const estoqueNaLI = (li) => { const p = li.produtos().at(-1); return [p.estoque_gerenciado, p.estoque_quantidade, p.estoque_situacao_sem_estoque]; };
    const chamadaDe = (li, metodo, inicio) => li.chamadas.findIndex((c) => c.metodo === metodo && String(c.caminho).startsWith(inicio));

    const p1 = await novo("ZZ-LI-30");
    const li1 = criarLojaIntegradaFalsa({});
    const b1 = criarBlingDaLI({ saldo: 5 });
    const ok1 = await cadastrarNaLI(p1.id, li1, b1);
    const an1 = await anuncioLIDoProduto(p1.id);
    conferir("feliz: todas as etapas, ativo, estoque do Bling", [ok1.ok, ok1.etapas, li1.produtos().at(-1).ativo, estoqueNaLI(li1)], [true, ["criar", "ligar_bling", "estoque", "ativar", "gravar"], true, [true, 5, -1]]);
    conferir("feliz: ligado no Bling com o id da LI", Object.values(b1.vinculos).flat().map((v) => [v.codigo, v.loja.id]), [[ok1.idExterno, 203478870]]);
    conferir("feliz: anuncio ATIVA, PUBLICADO, sem cadastro pendente", [an1.situacaoCanal, an1.status, an1.dados?.cadastroLI ?? null, an1.erro], ["ATIVA", "PUBLICADO", null, null]);
    conferir("ordem na LI: POST do produto, PUT do estoque, PUT do produto (ativar)", chamadaDe(li1, "POST", "/produto") < chamadaDe(li1, "PUT", "/produto_estoque") && chamadaDe(li1, "PUT", "/produto_estoque") < chamadaDe(li1, "PUT", `/produto/${ok1.idExterno}`), true);
    const lido = await lerParaPopupLI(p1.id, li1);
    conferir("editor le o ativo e o estoque da loja", [lido.ativoNaLI, lido.estoqueGerenciado, lido.cadastroFalhou], [true, true, null]);
    const putsAntes = li1.chamadas.filter((c) => c.metodo === "PUT").length;
    const deNovo = await completarCadastroLI(p1.id, li1, b1);
    conferir("completar o que ja esta completo: ok e nenhum PUT", [deNovo.ok, li1.chamadas.filter((c) => c.metodo === "PUT").length - putsAntes, Object.values(b1.vinculos).flat().length], [true, 0, 1]);

    const p2 = await novo("ZZ-LI-31");
    const li2 = criarLojaIntegradaFalsa({});
    const travado = await cadastrarNaLI(p2.id, li2, criarBlingDaLI({ travaFechada: true }));
    conferir("trava do Bling fechada: recusa ANTES do POST da LI", [travado.ok, /BLING_ESCRITA/.test(travado.erro ?? ""), chamadaDe(li2, "POST", "/produto")], [false, true, -1]);

    const falhou = await cadastrarNaLI(p2.id, li2, criarBlingDaLI({ recusaVinculo: 400 }));
    const an2 = await anuncioLIDoProduto(p2.id);
    conferir("Bling recusa o vinculo: para em ligar_bling, produto pausado", [falhou.ok, falhou.etapa, falhou.etapas, li2.produtos().at(-1).ativo], [false, "ligar_bling", ["criar"], false]);
    conferir("falha depois de criar: o '!' fica gravado e o status nao vira ERRO", [an2.dados?.cadastroLI?.etapa, an2.status, an2.situacaoCanal, /HTTP 400/.test(an2.erro ?? "")], ["ligar_bling", "PUBLICADO", "PAUSADA", true]);
    conferir("o editor ve a falha gravada", (await lerParaPopupLI(p2.id, li2)).cadastroFalhou?.etapa, "ligar_bling");
    const iconeFalhou = iconeLIDoProduto({ ...(await prisma.produto.findUnique({ where: { id: p2.id } })), blingId: "1" }, an2, { documentos: [] });
    conferir("o icone acende o '!' com a etapa em que parou", iconeFalhou.incompleto, { etapa: "ligar_bling", rotulo: "Ligar à Loja Integrada no Bling" });
    const completou = await completarCadastroLI(p2.id, li2, criarBlingDaLI({ saldo: -2 }));
    const an2b = await anuncioLIDoProduto(p2.id);
    conferir("completar: termina, sem segundo POST do produto, saldo negativo vira 0", [completou.ok, completou.etapas, li2.chamadas.filter((c) => c.metodo === "POST" && c.caminho === "/produto").length, estoqueNaLI(li2)], [true, ["ligar_bling", "estoque", "ativar", "gravar"], 1, [true, 0, -1]]);
    conferir("completar: '!' apagado e ATIVA", [an2b.dados?.cadastroLI ?? null, an2b.situacaoCanal, an2b.erro, li2.produtos().at(-1).ativo], [null, "ATIVA", null, true]);

    const p3 = await novo("ZZ-LI-32");
    const li3b = criarLojaIntegradaFalsa({});
    const semSaldo = await cadastrarNaLI(p3.id, li3b, criarBlingDaLI({ saldoAusente: true }));
    conferir("Bling sem o saldo do codigo: para no estoque, sem gravar estoque nem ativar", [semSaldo.ok, semSaldo.etapa, li3b.produtos().at(-1).ativo, chamadaDe(li3b, "PUT", "/produto_estoque")], [false, "estoque", false, -1]);

    const p4 = await novo("ZZ-LI-33");
    conferir("completar sem estar na LI: recusa", (await completarCadastroLI(p4.id, criarLojaIntegradaFalsa({}), criarBlingDaLI())).ok, false);
  }

  {
    console.log("\nMonitor da LI: o worker compara a loja com o Rise e o estoque com o Bling");
    await limpar();
    const { relerMonitorLI } = await import("../src/lib/canaisDeVenda/li/monitor.js");
    const { textosDoAlertaNaLoja } = await import("../src/lib/canaisDeVenda/li/alertaNaLoja.js");
    const texto = (estado) => textosDoAlertaNaLoja(estado).join(" e ");
    const p = await prisma.produto.create({ data: { sku: "ZZ-LI-40", tituloBase: "Monitor da loja", descricaoBase: "Texto do monitor.", ncm: "85364900", conferido: true, seoTituloLI: "Monitor", seoDescricaoLI: "Texto do monitor." } });
    const li = criarLojaIntegradaFalsa({});
    const cadastro = await cadastrarNaLI(p.id, li, criarBlingDaLI({ saldo: 5 }));
    await prisma.produto.update({ where: { id: p.id }, data: { blingId: "77", blingSaldo: 5, estoque: 5 } });
    const mudarNaLoja = (campos) => li.mudarProduto(cadastro.idExterno, campos);
    // O POST nao grava o tipo de producao (so o painel): a loja fica como o dono a deixaria, igual ao Rise (REVENDA).
    mudarNaLoja({ production_type: "Revenda" });
    const an = await anuncioLIDoProduto(p.id);
    const monitor = async () => (await prisma.anuncio.findUnique({ where: { id: an.id }, select: { dados: true } })).dados?.monitorLI ?? null;
    const icone = async () => iconeLIDoProduto(await prisma.produto.findUnique({ where: { id: p.id } }), await prisma.anuncio.findUnique({ where: { id: an.id } }), { documentos: [] });
    const rodar = (agora, cliente = li) => relerMonitorLI({ cliente, agora: new Date(agora), anuncioIds: [an.id], espera: 0 });

    const r1 = await rodar("2026-10-25T10:00:00Z");
    const m1 = await monitor();
    conferir("monitor: le o anuncio vinculado (ativo, estoque igual ao Bling)", [r1.conferidos, r1.falhas, m1.situacao, m1.ativo, m1.estoque, m1.estoqueBling, m1.estoqueDiferenteSeguidas], [1, 0, "existe", true, 5, 5, 0]);
    conferir("monitor: logo depois do cadastro, nada diferente na loja", [m1.diferentes, (await icone()).alertaNaLoja], [[], false]);

    mudarNaLoja({ nome: "Nome trocado no painel da loja" });
    await rodar("2026-10-25T11:00:00Z");
    const i2 = await icone();
    conferir("monitor: nome mudado no painel da loja acende o '!' e diz o campo", [(await monitor()).diferentes, i2.alertaNaLoja, texto(i2)], [["Nome"], true, "diferente na loja: Nome"]);

    mudarNaLoja({ nome: "Monitor da loja", ativo: false });
    await rodar("2026-10-25T12:00:00Z");
    const i3 = await icone();
    conferir("monitor: inativo na loja acende o '!' e a situacao vira PAUSADA", [(await monitor()).ativo, i3.alertaNaLoja, (await prisma.anuncio.findUnique({ where: { id: an.id } })).situacaoCanal, texto(i3)], [false, true, "PAUSADA", "inativo na loja"]);
    mudarNaLoja({ ativo: true });

    mudarNaLoja({ estoque_quantidade: 3 });
    await rodar("2026-10-25T13:00:00Z");
    conferir("estoque: 1a leitura diferente conta 1 e nao acende", [(await monitor()).estoqueDiferenteSeguidas, (await icone()).alertaNaLoja], [1, false]);
    await rodar("2026-10-25T14:00:00Z");
    const i5 = await icone();
    conferir("estoque: 2a leitura seguida acende com os numeros", [(await monitor()).estoqueDiferenteSeguidas, i5.alertaNaLoja, texto(i5)], [2, true, "estoque na loja 3, no Bling 5"]);
    mudarNaLoja({ estoque_quantidade: 5 });
    await rodar("2026-10-25T15:00:00Z");
    conferir("estoque: igualou, zera e apaga", [(await monitor()).estoqueDiferenteSeguidas, (await icone()).alertaNaLoja], [0, false]);

    const antes = await monitor();
    const liFora = criarLojaIntegradaFalsa({ falhas: { "GET /produto": 429 } });
    const rFora = await rodar("2026-10-25T16:00:00Z", liFora);
    const depois = await monitor();
    conferir("limite da LI: para a rodada e guarda o erro sem perder o lido", [Boolean(rFora.parou), depois.estoque, depois.ativo, Boolean(depois.erro), depois.diferentes], [true, 5, true, true, antes.diferentes]);

    // Fiscal (opcao 1 do dono em 25/10/2026): origem e tipo de producao so mudam pelo painel da LI. Vazios ou diferentes na
    // loja acendem o "!", e a releitura o apaga sozinha depois de o dono corrigir no painel.
    const fiscal = await prisma.produto.create({ data: { sku: "ZZ-LI-41", tituloBase: "Monitor fiscal", descricaoBase: "Texto fiscal.", ncm: "85364900", conferido: true, origem: 0, seoTituloLI: "Fiscal", seoDescricaoLI: "Texto fiscal." } });
    const cadFiscal = await cadastrarNaLI(fiscal.id, li, criarBlingDaLI({ saldo: 5 }));
    li.mudarProduto(cadFiscal.idExterno, { icms_origin_code: null, production_type: "Revenda" });
    const anFiscal = await anuncioLIDoProduto(fiscal.id);
    const iconeFiscal = async () => iconeLIDoProduto(await prisma.produto.findUnique({ where: { id: fiscal.id } }), await prisma.anuncio.findUnique({ where: { id: anFiscal.id } }), { documentos: [] });
    await relerMonitorLI({ cliente: li, agora: new Date("2026-10-25T17:00:00Z"), anuncioIds: [anFiscal.id], espera: 0 });
    const f1 = await iconeFiscal();
    conferir("fiscal: origem vazia na loja acende o '!' com o texto", [f1.alertaNaLoja, texto(f1)], [true, "fiscal na loja: Origem (NF-e) sem valor (ajuste no painel da LI)"]);
    li.mudarProduto(cadFiscal.idExterno, { icms_origin_code: "0" });
    await relerMonitorLI({ cliente: li, agora: new Date("2026-10-25T18:00:00Z"), anuncioIds: [anFiscal.id], espera: 0 });
    conferir("fiscal: corrigido no painel, a releitura apaga", (await iconeFiscal()).alertaNaLoja, false);
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

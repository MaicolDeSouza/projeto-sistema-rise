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

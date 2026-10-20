// Enderecos varridos por fonte e leitura da listagem de categoria (20/10/2026). SEM rede e SEM banco.
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { enderecoDaLista, conferirEnderecos, listaParaGravar, enderecosDaVarredura, rotuloDoEndereco } = await import(
  "../src/lib/coleta/enderecos.js"
);

let falhas = 0;
function conferir(nome, real, esperado) {
  try {
    assert.deepEqual(real, esperado);
    console.log(`ok  ${nome}`);
  } catch {
    falhas++;
    console.log(`FALHOU ${nome}\n   real:     ${JSON.stringify(real)}\n   esperado: ${JSON.stringify(esperado)}`);
  }
}

conferir("endereco: sem protocolo, barra no fim e ancora saem", enderecoDaLista("loja.com.br/gabinetes/#x")?.url, "https://loja.com.br/gabinetes");
conferir("endereco: so a home = loja inteira", enderecoDaLista("https://www.loja.com.br")?.lojaInteira, true);
conferir("endereco: categoria nao e a loja inteira; a consulta fica", [enderecoDaLista("loja.com.br/x")?.lojaInteira, enderecoDaLista("loja.com.br/c?cat=12")?.url], [false, "https://loja.com.br/c?cat=12"]);
conferir("endereco: texto que nao e site", [enderecoDaLista("abc"), enderecoDaLista(""), enderecoDaLista("ftp://x.com")], [null, null, null]);

conferir("lista: repetido (www, barra, caixa) vira um", conferirEnderecos(["https://loja.com.br/gabinetes", "www.loja.com.br/Gabinetes/"]).enderecos?.length, 1);
conferir("lista: outra loja e recusada", conferirEnderecos(["loja.com.br/a", "outra.com.br/b"]).ok, false);
conferir("lista: vazia e recusada; linha em branco sai", [conferirEnderecos([]).ok, conferirEnderecos(["", "loja.com.br/a"]).enderecos?.length], [false, 1]);

conferir("gravar: so a home = sem lista", listaParaGravar(conferirEnderecos(["loja.com.br"]).enderecos), []);
conferir("gravar: categoria guarda a lista", listaParaGravar(conferirEnderecos(["loja.com.br/a", "loja.com.br"]).enderecos).map((item) => item.url), ["https://loja.com.br/a", "https://loja.com.br/"]);
conferir("varredura: sem lista = a loja inteira de sempre", enderecosDaVarredura([], "https://loja.com.br/"), [{ url: "https://loja.com.br/", categoria: false }]);
conferir("varredura: lista marca categoria", enderecosDaVarredura([{ url: "https://loja.com.br/a" }, { url: "https://loja.com.br/" }], "x"), [
  { url: "https://loja.com.br/a", categoria: true },
  { url: "https://loja.com.br/", categoria: false },
]);
conferir("rotulo", [rotuloDoEndereco("https://loja.com.br/"), rotuloDoEndereco("https://loja.com.br/a/b")], ["loja inteira", "/a/b"]);

// VTEX, pagina de produto (Patolastore): tabela vs a vista e galeria grande.
{
  const { dadosDaPaginaVtex } = await import("../src/lib/coleta/vtex-pagina.js");
  const html = '"productListPriceFrom":"3.59","productPriceFrom":"3.23" <meta property="og:image" content="http://x.vteximg.com.br/arquivos/meta-image.png?v=1"> <img src="https://x.vteximg.com.br/arquivos/ids/1-500-500/A.jpg?v=2"> <a href="https://x.vteximg.com.br/arquivos/ids/1-1000-1000/A.jpg?v=2"> <a href="https://x.vteximg.com.br/arquivos/ids/9-500-500/banner.jpg">';
  const v = dadosDaPaginaVtex(html);
  conferir("vtex pagina: tabela, a vista e so a foto grande da galeria", [v.normal, v.aVista, v.imagens], [3.59, 3.23, ["https://x.vteximg.com.br/arquivos/ids/1-1000-1000/A.jpg?v=2"]]);
  conferir("vtex pagina: pagina de outra plataforma e null", dadosDaPaginaVtex("<html></html>"), null);
}

// Orcamento de venda em PDF (Patola): codigo com mais de uma palavra, descricao em duas linhas, IPI.
{
  const { orcamentoDeVendaDoPdf } = await import("../src/lib/coleta/arquivos.js");
  const texto = [
    "Item 	Qtde Código 	Descrição 	Unit.R$ 	Total R$ 	Subst", "Tributaria", "IPI%",
    "01 	20 PB-108 TE PB-108 TE.CX E TP TE C/ABA EM ABS", "PRETO COMUM. 9,92 	198,40 	0,00 	9,75",
    "03 	20 PB-108 	PB-108.CX EM ABS PRETO COMUM. TP", "LISA S/ABA EM ABS CINZA FILTRO. 9,31 	186,20 	0,00 	9,75",
    "09 	5 PB-211 	PB-211 (ABS ) 	36,50 	182,50 	0,00 	9,75",
    "Total", "Mercadorias", "1.861,90",
  ].join("\n");
  const itens = orcamentoDeVendaDoPdf("Home\n" + texto);
  conferir("orcamento de venda: codigo, preco sem IPI e IPI", itens.map((i) => [i.sku, i.preco, i.ipi, i.unidades_orcadas]), [["PB-108 TE", 9.92, 9.75, 20], ["PB-108", 9.31, 9.75, 20], ["PB-211", 36.5, 9.75, 5]]);
  conferir("orcamento de venda: texto de outro formato nao rende nada", orcamentoDeVendaDoPdf("qualquer texto"), []);
}

// A listagem importa buscar.js sem extensao: precisa do resolvedor de alias do projeto.
try {
  const { produtosDaListagem, paginasSeguintes, numeroDaPagina, dentroDaCategoria, doMaiorBloco } = await import("../src/lib/coleta/listagem.js");
  const html = `<nav><a href="/institucional">Sobre</a><a href="/cat/outra">Outra</a></nav>
    <div class="card"><a href="/motor-a"><img src="a.jpg"></a><a href="/motor-a">Motor A</a><span>R$ 10,00</span></div>
    <div class="card"><a href="/motor-b"><img src="b.jpg"></a><a href="/motor-b">Motor B</a><span>R$ 20,00</span></div>
    <a href="/cat/motores?page=2">2</a><a href="/cat/motores?page=3">3</a><a href="/cat/motores?orderby=x&page=4">4</a>`;
  conferir("listagem: so os links ao lado de preco", produtosDaListagem(html, "https://loja.com.br/cat/motores"), ["https://loja.com.br/motor-a", "https://loja.com.br/motor-b"]);
  conferir("listagem: paginas seguintes, sem ordenacao", paginasSeguintes(html, "https://loja.com.br/cat/motores", "https://loja.com.br/cat/motores"), [
    "https://loja.com.br/cat/motores?page=2",
    "https://loja.com.br/cat/motores?page=3",
  ]);
  conferir("listagem: numero da pagina e dentro da categoria", [numeroDaPagina("https://x.com/c/page/3"), dentroDaCategoria("https://x.com/c", "https://x.com/c/sub"), dentroDaCategoria("https://x.com/c", "https://x.com/d")], [3, true, false]);
  const bloco = (inicio, n) => Array.from({ length: n }, (_, i) => ({ url: `u${inicio}-${i}`, indice: inicio + i * 1000 }));
  conferir("listagem: carrossel (bloco menor e distante) sai", doMaiorBloco([...bloco(0, 12), ...bloco(200000, 4)]).length, 12);
  conferir("listagem: sem bloco claramente maior fica tudo", doMaiorBloco([...bloco(0, 4), ...bloco(200000, 3)]).length, 7);
} catch (erro) {
  console.log("listagem nao testada aqui (precisa do resolvedor de alias):", erro.message);
}

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\ntudo certo");

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

// Patolastore: casa o codigo do orcamento com a referencia do fabricante e completa o item (sem rede: busca simulada).
{
  const { escolherPorReferencia, dadosDoProdutoDaPatolastore, juntarComAPatolastore } = await import("../src/lib/coleta/patolastore.js");
  const produto = (ref, extra = {}) => ({ productReference: ref, productName: `Caixa ${ref}`, brand: "Patola", description: "<p>Caixa <b>ABS</b></p>", categories: ["/Gabinetes/Uso Geral/"], link: "https://www.patolastore.com.br/x/p", allSpecifications: ["MODELO"], MODELO: [ref], items: [{ ean: "", images: [{ imageUrl: "http://l.vteximg.com.br/arquivos/ids/10/a.jpg?v=1" }, { imageUrl: "http://l.vteximg.com.br/arquivos/ids/10-500-500/a.jpg" }] }], ...extra });
  const lista = [produto("PB-108/2"), produto("PB-108 PT"), produto("PB-108 TE")];
  conferir("patolastore: referencia igual vence, sem caixa nem espacos a mais", escolherPorReferencia(lista, "pb-108  te")?.produto.productReference, "PB-108 TE");
  conferir("patolastore: so o sufixo PT casa quando nao ha igual, e vem marcado como aproximado", [escolherPorReferencia(lista, "PB-108")?.produto.productReference, escolherPorReferencia(lista, "PB-108")?.aproximado], ["PB-108 PT", true]);
  conferir("patolastore: sem referencia parecida nao casa (PB-108/2 nao e PB-108)", escolherPorReferencia([produto("PB-108/2")], "PB-108"), null);
  const d = dadosDoProdutoDaPatolastore(produto("PB-114"));
  conferir("patolastore: foto grande sem repetir, categoria, ficha da loja e texto", [d.imagens, d.categoria, d.especificacoes, d.descricao, d.marca], [["https://l.vteximg.com.br/arquivos/ids/10-1000-1000/a.jpg?v=1"], "Gabinetes > Uso Geral", [{ nome: "Modelo", valor: "PB-114" }], "Caixa ABS", "Patola"]);
  const brutos = [{ sku: "PB-114", desc: "PB-114.CX", preco: 1 }, { sku: "XX-1", desc: "XX-1", preco: 2 }];
  const buscar = async (url) => ({ ok: true, corpo: JSON.stringify(url.includes("PB-114") ? [produto("PB-114")] : []) });
  const r = await juntarComAPatolastore(brutos, { buscar });
  conferir("patolastore: completa o item que casou e avisa o que ficou sem casar", [r.casados, brutos[0].desc, brutos[0].imagens.length, brutos[1].desc, r.avisos.length], [1, "Caixa PB-114", 1, "XX-1", 1]);
}

// Relatorio semanal: o sabado 00:00 de Sao Paulo, a janela de 48 h e a situacao de cada loja.
{
  const { rodadaDevida, ultimoSabado, proximoSabado, dataDaChave } = await import("../src/lib/relatorios/semana.js");
  const { situacaoDaLoja } = await import("../src/lib/relatorios/dados.js");
  // 24/10/2026 e sabado. 00:00 em Sao Paulo = 03:00 UTC.
  conferir("semana: sabado 00:01 em SP ja e a rodada do dia", rodadaDevida(new Date("2026-10-24T03:01:00Z"))?.chave, "2026-10-24");
  conferir("semana: sexta 23:59 em SP ainda nao e", rodadaDevida(new Date("2026-10-24T02:59:00Z")), null);
  conferir("semana: domingo 23:00 em SP ainda esta na janela de recuperacao", rodadaDevida(new Date("2026-10-26T02:00:00Z"))?.chave, "2026-10-24");
  conferir("semana: quarta nao dispara (ligar o worker no meio da semana nao varre tudo)", rodadaDevida(new Date("2026-10-28T15:00:00Z")), null);
  conferir("semana: o sabado 00:00 e as 03:00 UTC; o ultimo sabado de uma quarta e o anterior", [ultimoSabado(new Date("2026-10-24T05:00:00Z")).inicio.toISOString(), ultimoSabado(new Date("2026-10-28T15:00:00Z")).chave], ["2026-10-24T03:00:00.000Z", "2026-10-24"]);
  conferir("semana: proximo sabado", [proximoSabado(new Date("2026-10-20T15:00:00Z")).toISOString(), proximoSabado(new Date("2026-10-24T05:00:00Z")).toISOString()], ["2026-10-24T03:00:00.000Z", "2026-10-31T03:00:00.000Z"]);
  conferir("semana: data da chave; a manual nao tem", [dataDaChave("2026-10-24"), dataDaChave("manual-123")], ["24/10/2026", null]);
  conferir("loja: concluida e ok; falha traz o erro; aberta nao terminou", [situacaoDaLoja({ job: { status: "CONCLUIDO" }, fonte: {} }).situacao, situacaoDaLoja({ job: { status: "FALHOU", erro: "HTTP 503" }, fonte: {} }).texto, situacaoDaLoja({ job: { status: "PROCESSANDO" }, fonte: {} }).situacao], ["ok", "HTTP 503", "aberta"]);
  conferir("loja: sem job, a do PC e a pulada se explicam", [situacaoDaLoja({ job: null, fonte: { varridaNoPc: true } }).situacao, situacaoDaLoja({ job: null, fonte: {} }).situacao], ["so-pc", "pulada"]);
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

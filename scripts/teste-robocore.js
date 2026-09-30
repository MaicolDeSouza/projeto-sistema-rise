import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));
const { normalizarPagina } = await import("../src/lib/coleta/normalizar.js");
const { estoqueDaRoboCore, precosDaRoboCore } = await import("../src/lib/coleta/robocore.js");
const { pareceProduto, rastrear } = await import("../src/lib/coleta/descobrir.js");
const { identificarPlataforma } = await import("../src/lib/coleta/plataformas.js");

const origem = "https://www.robocore.net";
const url = `${origem}/acessorios-arduino/case-para-blackboard-mega-2560`;
const html = await readFile(new URL("./fixtures/robocore-case.html", import.meta.url), "utf8");
const produto = normalizarPagina({ html, url }).produtos[0];
assert.deepEqual(produto.prices, { normal: 28.9, promotional: 27.45, comImpostos: null });
// "(92 un. em estoque)" so existe dentro do JS que atualiza o painel — nunca no
// texto visivel nem em inventoryLevel (a RoboCore nao declara).
assert.equal(produto.stock.quantity, 92);
assert.equal(produto.stock.status, "AVAILABLE");
// Categoria vem do <nav> simples do breadcrumb, sem Microdata nem dataLayer —
// o ultimo degrau (mais especifico) e o que fica.
assert.equal(produto.category, "Acessórios");
assert.match(produto.description, /R3\./);
assert.match(produto.description, /\n\nAcompanha 4 parafusos/);
assert.match(produto.description, /\n\nItens Inclusos\n- 1 × Case Mega 2560/);
assert.equal(produto.description.split("\n- ").length - 1, 6);
assert.doesNotMatch(produto.description, /Este Kit|Documentação|Cor da Case/);
// A RoboCore deixa secoes inteiras de outros produtos comentadas no HTML
// (<!-- -->), invisiveis no navegador. Achado no BlackBoard Edge, com um
// bloco de tutorial da "Vespa" vazando pro texto, ate ser filtrado.
assert.doesNotMatch(produto.description, /Por onde come|Secao comentada|-->/);
assert.equal(produto.specifications.length, 4);
assert.equal(produto.documentos.length, 1);
assert.equal(precosDaRoboCore(html, url, "9999"), null);
assert.equal(precosDaRoboCore(html, "https://outra-loja.com/produto", "1180"), null);
assert.equal(precosDaRoboCore(html.replace(/PIX/g, "cartao"), url, "1180"), null);
// Valor maior que mil e centavos divididos em spans; parcela nao vira preco.
const painel = html.replace(/>28<span/g, ">1.028<span").replace(/>27<span/g, ">977<span");
assert.deepEqual(precosDaRoboCore(painel, url, "1180"), { normal: 1028.9, aVista: 977.45 });

// Estoque: variante unica (codigo = id do produto).
assert.equal(estoqueDaRoboCore(html, url, "1180"), 92);
assert.equal(estoqueDaRoboCore(html, "https://outra-loja.com/produto", "1180"), null);
assert.equal(estoqueDaRoboCore(html, url, "9999"), null);

// Estoque: produto com cores (HockeyBot). Varios blocos escrevem no MESMO id
// (`estoque_3388`), um por opcao de `extras.value` — sem isolar pela variante,
// o primeiro bloco da pagina venceria para qualquer cor.
const multivariante = `<script>
function ChecaEstoque(){
if(document.forms['form_3388'].extras.value == '416'){
if(8 <= 0){}
else { document.getElementById('estoque_3388').innerHTML = '(8 un. em estoque)'; }
}
if(document.forms['form_3388'].extras.value == '414'){
if(25 <= 0){}
else { document.getElementById('estoque_3388').innerHTML = "(25 un. em estoque)"; }
}
}
</script>`;
const urlHockeyBot = `${origem}/kits-didaticos/hockeybot/preto`;
assert.equal(estoqueDaRoboCore(multivariante, urlHockeyBot, "3388-416"), 8);
assert.equal(estoqueDaRoboCore(multivariante, urlHockeyBot, "3388-414"), 25);
assert.equal(estoqueDaRoboCore(multivariante, urlHockeyBot, "3388-999"), null);

assert.equal(pareceProduto(url), true);
assert.equal(pareceProduto(`${origem}/kits/kit-iniciante`), true);
assert.equal(pareceProduto(`${origem}/acessorios-arduino`), false);
assert.equal(pareceProduto(`${origem}/tutoriais/arduino`), false);
assert.equal(pareceProduto(`${origem}/modules/GR_LojaVirtual/`), false);
assert.equal(identificarPlataforma({ html: '<link href="/themes/RC/style.css"><script src="/modules/GR_LojaVirtual/loja.js"></script><meta name="application-name" content="RoboCore">' }).id, "robocore");

// Muitas categorias antes dos produtos reproduzem o esgotamento da amostra.
const categorias = Array.from({ length: 40 }, (_, i) => `<a href="/categoria-${i}">Categoria</a>`).join("");
const links = ["case-para-blackboard-mega-2560", "cabo-usb", "kit-iniciante", "pagina-rejeitada"];
const visitadas = [];
const achados = [];
const resultado = await rastrear({
  semente: origem, orcamento: 19, pararApos: 3,
  buscar: async (endereco) => {
    visitadas.push(endereco);
    const corpo = new URL(endereco).pathname === "/" ? categorias :
      new URL(endereco).pathname === "/categoria-0" ? links.map(slug => `<a href="/acessorios-arduino/${slug}">Produto</a>`).join("") : html;
    return { ok: true, corpo, urlFinal: endereco };
  },
  aoAchar: ({ url: endereco }) => {
    if (endereco.endsWith("pagina-rejeitada")) return false;
    achados.push(endereco);
  },
});
assert.equal(resultado.produtos, 3);
assert.equal(visitadas.length, 6);
assert.equal(new Set(achados).size, 3);
console.log("RoboCore: precos, descricao, ficha, documentos e amostra de tres produtos OK.");

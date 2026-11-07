/**
 * Testes do modelo padrao da analise de lista de fornecedor (src/lib/analiseFornecedor/, 07/11/2026): a montagem
 * (formato dos dados, titulo, JSON seguro) e a pagina com um DOM falso, em tres situacoes:
 *   1. lista em US$ dentro do claude.ai (Rise e banco da pagina falsos): ganho, faixas, filtros, fotos, pedido, lista
 *      "criar", erros do Rise e "Copiar escolhas";
 *   2. lista em R$ fora do claude.ai (como no chat de outra LLM): so ver, botoes desligados com o motivo e o "Copiar
 *      escolhas" abrindo o texto quando a area de transferencia falha;
 *   3. lista em R$ com fator.
 * Puro: sem banco, sem rede, sem navegador.
 *
 *   npm run teste:analise-fornecedor
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

import { lerModeloDaAnalise, montarPagina, problemasDosDados } from "../src/lib/analiseFornecedor/montar.js";
import { ESQUEMA_ANALISE, ROTEIRO_ANALISE, VERSAO_ROTEIRO_ANALISE } from "../src/lib/analiseFornecedor/roteiro.js";

let falhas = 0;
function conferir(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${rotulo}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}
const espera = (ms = 40) => new Promise((resolver) => setTimeout(resolver, ms));
const fixture = (nome) => JSON.parse(readFileSync(new URL(`./fixtures/analise-fornecedor/${nome}`, import.meta.url), "utf8"));
const brl = (v) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// --- DOM falso: o bastante para o script do modelo (criar, anexar, trocar, procurar por classe/atributo, eventos)
function abrirPagina(html, { claude = null, clipboard = null, store = {} } = {}) {
  const ids = {};
  class El {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.listeners = {}; this.parent = null; this._text = ""; this.className = ""; this.value = ""; this.disabled = false; this.title = ""; this.hidden = false; }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === "id") ids[v] = this; if (k === "value") this.value = String(v); if (k === "disabled") this.disabled = true; }
    get id() { return this.attrs.id; }
    set textContent(t) { this._text = String(t); this.children = []; }
    get textContent() { return this._text + this.children.map((c) => (typeof c === "string" ? c : c.textContent)).join(""); }
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
    dispatch(t, ev = {}) { for (const f of this.listeners[t] || []) f({ target: this, preventDefault() {}, ...ev }); }
    append(...xs) { for (const x of xs) { if (x == null) continue; if (typeof x === "object") { x.parent = this; registrar(x); } this.children.push(typeof x === "object" ? x : String(x)); } }
    replaceChildren(...xs) { this.children = []; this._text = ""; this.append(...xs); }
    replaceWith(n) { const p = this.parent; const i = p.children.indexOf(this); n.parent = p; p.children[i] = n; registrar(n); }
    focus() { doc.activeElement = this; }
    select() {}
    *todos() { for (const c of this.children) if (typeof c === "object") { yield c; yield* c.todos(); } }
    querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
    querySelectorAll(sel) {
      const m = sel.match(/^(\w+)?(?:\.([\w-]+))?(?:\[([\w-]+)="([^"]*)"\])?$/);
      return [...this.todos()].filter((e) => (!m[1] || e.tagName === m[1].toUpperCase()) && (!m[2] || e.className.split(" ").includes(m[2])) && (!m[3] || e.attrs[m[3]] === m[4]));
    }
  }
  function registrar(e) { if (e.attrs?.id) ids[e.attrs.id] = e; for (const c of e.todos?.() ?? []) if (c.attrs.id) ids[c.attrs.id] = c; }
  const raiz = new El("body");
  for (const id of ["titulo", "meta", "pedido", "pedidoRot", "pedidoLinha1", "pedidoLinha2", "pedidoLinha3", "resumo", "lista", "fBusca", "fRise", "fForn", "fOrdem", "contagem", "bCopiar", "luz", "luzImg", "luzLegenda", "luzFechar", "copia", "copiaTexto", "copiaFechar", "optListaBarata", "optOutroBarato"]) {
    const e = new El("div"); e.setAttribute("id", id); raiz.append(e);
  }
  ids.luz.hidden = true;
  ids.copia.hidden = true;
  const ouvintesDoc = {};
  const doc = {
    title: "", activeElement: null,
    createElement: (t) => new El(t),
    getElementById: (id) => ids[id] ?? null,
    querySelector: (s) => raiz.querySelector(s),
    addEventListener: (t, f) => { (ouvintesDoc[t] ||= []).push(f); },
  };
  const ctx = {
    document: doc, console, setTimeout, clearTimeout, Intl, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise, RegExp, parseInt, Boolean, Error,
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    navigator: clipboard ? { clipboard } : {},
  };
  ctx.window = ctx;
  if (claude) ctx.window.claude = claude;
  vm.createContext(ctx);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  vm.runInContext(scripts, ctx);
  const card = (n) => raiz.querySelector(`.cartao[data-n="${n}"]`);
  return {
    ids, raiz, doc, store, ouvintesDoc, card,
    texto: (n) => card(n).textContent,
    botaoAdd: (n) => card(n).querySelector(".principal"),
    motivo: (n) => card(n).querySelector(".motivo").textContent,
    cartoes: () => raiz.querySelectorAll(".cartao").length,
    mudar: (id, v) => { ids[id].value = v; ids[id].dispatch("change"); },
    digitar: (id, v) => { ids[id].value = v; ids[id].dispatch("input"); },
    esc: () => { for (const f of ouvintesDoc.keydown) f({ key: "Escape" }); },
  };
}

const modelo = await lerModeloDaAnalise(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

// --- 0. roteiro e montagem
conferir("roteiro com versão, os 7 passos e o formato", [VERSAO_ROTEIRO_ANALISE, ["PASSO 1", "PASSO 2", "PASSO 3", "PASSO 4", "PASSO 5", "PASSO 6", "PASSO 7", "NUNCA"].every((p) => ROTEIRO_ANALISE.includes(p)), ESQUEMA_ANALISE.includes('"moeda": "USD"')], ["v1", true, true]);
conferir("o modelo não tem nome de fornecedor fixo", /NexMind|PC-0027|ptax/i.test(modelo.replace(/\/\*[\s\S]*?\*\//g, "")), false);
const usd = fixture("dados-usd.json");
conferir("dados de exemplo em US$ passam", problemasDosDados(usd), []);
conferir("US$ sem câmbio é recusado", problemasDosDados({ ...usd, cambio: null }).includes("lista em US$ sem câmbio"), true);
conferir("moeda fora de USD/BRL é recusada", problemasDosDados({ ...usd, moeda: "EUR" }).some((p) => p.includes("moeda")), true);
conferir("item repetido e oferta fora do formato são recusados", problemasDosDados({ ...usd, itens: [usd.itens[0], usd.itens[0], { ...usd.itens[1], ofertas: [["Loja", "x", "9,90", null, "disp"]] }] }), ["item 1: n repetido", "item 2: oferta fora do formato [loja, nome, preço, endereço, \"disp\"|\"sem\"|null]"]);
let erroMontar = null;
try { montarPagina(modelo, { ...usd, itens: [] }); } catch (erro) { erroMontar = erro.message; }
conferir("montar com dados errados lança com o motivo", erroMontar, "Dados da análise com problema: sem itens");
const comTag = montarPagina(modelo, { ...usd, apelido: "A<b>", itens: [{ ...usd.itens[1], nome: "Placa </script><b>" }] });
conferir("título com o apelido escapado e nome com </script> não fecha a tag", [comTag.includes("<title>A&lt;b&gt; × concorrentes</title>"), comTag.split("</script>").length], [true, 2]);

// --- 1. lista em US$ no claude.ai
const FOTO1 = "data:image/jpeg;base64,AAAA";
const htmlUsd = montarPagina(modelo, usd, { n1: FOTO1 });
const itensNoPedido = [{ sku: "170402", quantidade: 30 }];
const chamadas = [];
let falharProxima = null;
const produtos = {
  "100113": { sku: "100113", nome: "PLACA PRO MICRO", preco: 52.9, estoque: 8, custo: 30, urlRise: "/produtos/jkl", fornecedores: [{ nome: "Nightech", custo: 30, padrao: true }] },
  "190201": { sku: "190201", nome: "SENSOR A HOJE", preco: 21, estoque: 3, custo: 8, urlRise: "/produtos/xyz", fornecedores: [] },
};
const pedidoAtual = () => ({ codigo: "PC-0099", situacao: "RASCUNHO", situacaoTexto: "Rascunho", itens: itensNoPedido.map((i) => ({ ...i })), totais: { total: 1000 + itensNoPedido.length } });
const mcp = {
  async callTool(server, tool, input) {
    chamadas.push([server, tool, input]);
    if (server !== "Rise") throw { code: "not_in_manifest" };
    if (falharProxima && tool === falharProxima.tool) { const e = falharProxima.erro; falharProxima = null; throw e; }
    if (tool === "lerPedidoDeCompra") return { payload: pedidoAtual() };
    if (tool === "consultarProduto") {
      if (!produtos[input.sku]) throw { code: "tool_error", message: `Produto ${input.sku} não encontrado no Rise.` };
      return { payload: produtos[input.sku] };
    }
    if (tool === "montarPedidoDeCompra") {
      for (const it of input.itens) { const j = itensNoPedido.findIndex((i) => i.sku === it.sku); if (j >= 0) itensNoPedido[j].quantidade = it.quantidade; else itensNoPedido.push({ sku: it.sku, quantidade: it.quantidade }); }
      return { payload: { criado: false, avisos: [], pedido: pedidoAtual() } };
    }
    throw { code: "not_in_manifest" };
  },
};
const bancoDocs = new Map([["criar/n7", { n: 7, nome: "Roda E", preco: 0.2, qtd: 12 }]]);
const gravacoesDb = [];
let falharDb = null;
let ouvinteCriar = null;
const entregar = () => ouvinteCriar?.({ docs: [...bancoDocs].filter(([p]) => p.startsWith("criar/")).map(([p, v]) => ({ id: p.split("/")[1], exists: true, data: () => v })) });
const dbFalso = {
  collection: () => ({ onSnapshot: (next) => { ouvinteCriar = next; setTimeout(entregar, 5); return () => {}; } }),
  doc: (p) => ({
    set: async (v) => { gravacoesDb.push(["set", p, v]); if (falharDb) { const e = falharDb; falharDb = null; throw e; } bancoDocs.set(p, v); setTimeout(entregar, 1); },
    delete: async () => { gravacoesDb.push(["delete", p]); bancoDocs.delete(p); setTimeout(entregar, 1); },
  }),
};
const copiados = [];
const CHAVE_USD = "analise-fornecedor:zz-fornecedor-dolar:escolhas";
const p1 = abrirPagina(htmlUsd, {
  claude: { use: async (nome) => (nome === "mcp" ? mcp : nome === "db" ? dbFalso : null) },
  clipboard: { writeText: async (t) => { copiados.push(t); } },
  store: { [CHAVE_USD]: JSON.stringify({ 3: { sku: "", qtd: "7" } }) },
});
await espera(80);
conferir("US$: os 8 itens na tela", [p1.cartoes(), p1.ids.contagem.textContent], [8, "8 de 8 itens"]);
conferir("US$: título e pedido com o nome do fornecedor", [p1.doc.title, p1.ids.titulo.textContent, p1.ids.pedidoRot.textContent, p1.ids.pedidoLinha1.textContent], ["ZZ Dólar × concorrentes", "ZZ Dólar × concorrentes", "Pedido de compra · ZZ Dólar", "PC-0099"]);
conferir("US$: pedido lido ao abrir, só ele", [p1.ids.pedidoLinha2.textContent, chamadas.map((c) => c[1])], ["Rascunho · 1 itens · R$ 1.001,00", ["lerPedidoDeCompra"]]);
conferir("US$: fórmula do custo no cabeçalho", p1.ids.meta.textContent.includes("custo = US$ × câmbio 5,5000 (06/11/2026) × fator 2"), true);
conferir("custo = US$ × câmbio × fator, com o preço da lista embaixo e o código do fornecedor", [p1.texto(1).includes("R$ 11,00"), p1.texto(1).includes("US$ 1,00"), p1.texto(1).includes("ZZ Dólar · item 1 da lista · cód. A-1")], [true, true, true]);
conferir("ganho sobre o menor concorrente", [p1.card(1).querySelector(".pct").textContent, p1.texto(1).includes(`${brl(22)}`) && p1.texto(1).includes("menor de 3 lojas: Loja A")], ["100%", true]);
conferir("comparação com o fornecedor mais barato", p1.texto(1).includes("ZZ Dólar 16% mais caro que Fortek"), true);
conferir("sem fornecedor: diz que nenhum vende", p1.texto(2).includes("Nenhum fornecedor coletado vende."), true);
conferir("produto do Rise preenchido com a data dos dados", [p1.ids["sku-1"].value, p1.texto(1).includes("190201 · SENSOR A") && p1.texto(1).includes("(Rise em 07/11)")], ["190201", true]);
conferir("código sugerido avisa para conferir", p1.texto(2).includes("código sugerido pela análise"), true);
conferir("sem Rise: Pôr na lista para criar, ligado com a quantidade guardada", [p1.botaoAdd(3).textContent, p1.botaoAdd(3).disabled, p1.ids["qtd-3"].value, p1.motivo(3)], ["Pôr na lista para criar", false, "7", "Vai para a lista de itens para criar no Rise, só com a sua permissão."]);
conferir("lista criar carregada ao abrir", [p1.ids.pedidoLinha3.textContent.startsWith("Lista para criar no Rise: 1 item · R$ "), p1.texto(7).includes("Na lista para criar: 12 un."), p1.botaoAdd(7).textContent], [true, true, "Trocar quantidade da lista"]);
p1.botaoAdd(3).dispatch("click");
await espera();
const set1 = gravacoesDb.filter((g) => g[0] === "set").pop();
conferir("Pôr na lista grava o item com preço, moeda, fornecedor e preço de 4 casas", [set1[1], set1[2].n, set1[2].preco, set1[2].moeda, set1[2].fornecedor, set1[2].qtd, set1[2].precoUnitario], ["criar/n3", 3, 2, "USD", "ZZ Fornecedor Dolar", 7, 22]);
conferir("depois de pôr: cartão, mensagem e cabeçalho; nada no pedido", [p1.texto(3).includes("Na lista para criar: 7 un."), p1.texto(3).includes("depois que você permitir"), p1.ids.pedidoLinha3.textContent.startsWith("Lista para criar no Rise: 2 itens"), chamadas.filter((c) => c[1] === "montarPedidoDeCompra").length], [true, true, true, 0]);
p1.mudar("fRise", "criar");
conferir("filtro Na lista para criar", p1.cartoes(), 2);
p1.mudar("fRise", "todos");
p1.card(7).querySelectorAll(".ver").find((b) => b.textContent === "Tirar da lista").dispatch("click");
await espera();
conferir("Tirar da lista apaga o documento", [gravacoesDb.pop(), p1.ids.pedidoLinha3.textContent.startsWith("Lista para criar no Rise: 1 item")], [["delete", "criar/n7"], true]);
p1.digitar("qtd-7", "5");
falharDb = { code: "quota_exceeded", message: "cheio" };
p1.botaoAdd(7).dispatch("click");
await espera();
conferir("lista cheia: avisa", p1.texto(7).includes("A lista da página encheu"), true);
falharDb = { code: "unavailable", message: "x" };
p1.botaoAdd(7).dispatch("click");
await espera(1300);
conferir("lista fora do ar por um instante: tenta de novo e grava", [gravacoesDb.filter((g) => g[1] === "criar/n7" && g[0] === "set").length, p1.texto(7).includes("Na lista para criar: 5 un.")], [3, true]);
conferir("com produto e sem quantidade: pede a quantidade", p1.motivo(1), "Digite a quantidade.");
conferir("item já no pedido e o mesmo SKU em dois itens", [p1.texto(4).includes("No PC-0099: 30 un."), p1.botaoAdd(4).textContent, p1.texto(4).includes("Mesmo produto do Rise do item 5")], [true, "Trocar quantidade", true]);
p1.mudar("fRise", "pedido");
conferir("filtro Já no pedido", p1.cartoes(), 2);
p1.mudar("fRise", "sem");
conferir("filtro Sem produto no Rise", p1.cartoes(), 3);
p1.mudar("fRise", "todos");
p1.mudar("fForn", "semForn");
conferir("filtro Sem fornecedor", p1.cartoes(), 4);
p1.mudar("fForn", "listaBarata");
conferir("filtro lista mais barata que o fornecedor (com o nome)", [p1.cartoes(), p1.ids.optListaBarata.textContent], [2, "ZZ Dólar mais barato que o fornecedor"]);
p1.mudar("fForn", "outroBarato");
conferir("filtro fornecedor mais barato que a lista", p1.cartoes(), 2);
p1.mudar("fForn", "todos");
const faixas = () => p1.raiz.querySelectorAll(".faixa");
conferir("faixas pelo menor concorrente", faixas().map((f) => Number(f.querySelector(".qt").textContent)), [2, 1, 3, 0, 2]);
faixas()[0].dispatch("click");
conferir("faixa Ótimo filtra", p1.cartoes(), 2);
faixas()[0].dispatch("click");
conferir("clicar de novo tira o filtro", p1.cartoes(), 8);
const bFoto = p1.card(1).querySelector(".fotoBtn");
conferir("foto embutida (FOTOS) e foto por endereço (item.foto); sem foto mostra o aviso", [bFoto?.children[0].attrs.src, p1.card(3).querySelector(".fotoBtn")?.children[0].attrs.src, p1.texto(2).includes("sem foto")], [FOTO1, "https://fotos.exemplo/placa-c.jpg", true]);
bFoto.dispatch("click");
conferir("clique abre a foto grande", [p1.ids.luz.hidden, p1.ids.luzImg.attrs.src], [false, FOTO1]);
p1.esc();
conferir("Esc fecha e devolve o foco", [p1.ids.luz.hidden, p1.doc.activeElement === bFoto], [true, true]);
conferir("sem concorrente: ganho —, no fim da ordem de ganho", [p1.card(6).querySelector(".pct").textContent, p1.raiz.querySelectorAll(".cartao").slice(-2).map((c) => c.attrs["data-n"])], ["—", ["6", "7"]]);
p1.card(6).querySelector(".ver").dispatch("click");
conferir("sem concorrente com fornecedor: só a tabela de fornecedores", [p1.card(6).querySelectorAll("table").length, p1.texto(6).includes("Fornecedores · preço com impostos")], [1, true]);
p1.digitar("fBusca", "a-1");
await espera(260);
conferir("busca pelo código do item no fornecedor", [p1.cartoes(), !!p1.card(1)], [1, true]);
p1.digitar("fBusca", "");
await espera(260);
p1.mudar("fOrdem", "lista");
conferir("ordem da lista", p1.raiz.querySelectorAll(".cartao")[0].attrs["data-n"], "1");
p1.mudar("fOrdem", "ganho");
conferir("filtros guardados com a chave do fornecedor", JSON.parse(p1.store["analise-fornecedor:zz-fornecedor-dolar:filtros"]).ordem, "ganho");

p1.digitar("sku-3", "999");
p1.card(3).querySelector(".btn").dispatch("click");
await espera();
conferir("código inexistente: mensagem do Rise", p1.texto(3).includes("Produto 999 não encontrado no Rise."), true);
p1.digitar("sku-3", "100113");
p1.card(3).querySelector(".btn").dispatch("click");
await espera();
conferir("código conferido: produto de hoje e botão ligado", [p1.texto(3).includes("100113 · PLACA PRO MICRO") && !p1.texto(3).includes("(Rise em "), p1.botaoAdd(3).disabled, p1.motivo(3)], [true, false, ""]);
p1.botaoAdd(3).dispatch("click");
await espera();
conferir("grava com o fornecedor do Rise, sku, quantidade e preço de 4 casas", chamadas.filter((c) => c[1] === "montarPedidoDeCompra").pop()[2], { fornecedor: "ZZ Fornecedor Dolar", itens: [{ sku: "100113", quantidade: 7, precoUnitario: 22, ipiPercentual: 0 }] });
conferir("depois de gravar: cabeçalho, cartão e saiu da lista criar", [p1.ids.pedidoLinha2.textContent, p1.texto(3).includes("No PC-0099: 7 un."), bancoDocs.has("criar/n3")], ["Rascunho · 2 itens · R$ 1.002,00", true, false]);
const antes = chamadas.length;
p1.digitar("sku-2", "100113");
p1.digitar("qtd-2", "3");
conferir("código trocado sem conferir: Conferir e adicionar", p1.botaoAdd(2).textContent, "Conferir e adicionar");
p1.botaoAdd(2).dispatch("click");
await espera(80);
conferir("um clique confere e grava o código novo", [chamadas.slice(antes).map((c) => c[1]), chamadas.slice(antes)[1]?.[2].itens[0].sku], [["consultarProduto", "montarPedidoDeCompra"], "100113"]);
p1.digitar("qtd-1", "20");
const leituras = chamadas.filter((c) => c[1] === "lerPedidoDeCompra").length;
falharProxima = { tool: "montarPedidoDeCompra", erro: { code: "server_unavailable", message: "timeout" } };
p1.botaoAdd(1).dispatch("click");
await espera();
conferir("resposta incerta: avisa e lê o pedido de novo", [p1.texto(1).includes("não dá para saber se gravou"), chamadas.filter((c) => c[1] === "lerPedidoDeCompra").length], [true, leituras + 1]);
falharProxima = { tool: "montarPedidoDeCompra", erro: { code: "approval_required", message: "x" } };
p1.botaoAdd(1).dispatch("click");
await espera();
conferir("sem permissão: pede para permitir", p1.texto(1).includes("Clique de novo e escolha Permitir"), true);

conferir("Copiar escolhas conta os itens com quantidade", p1.ids.bCopiar.textContent, "Copiar escolhas (4)");
p1.ids.bCopiar.dispatch("click");
await espera();
const copiado = copiados.pop() ?? "";
conferir("Copiar escolhas: pedido com código, quantidade e preço de 4 casas", ["PEDIDO DE COMPRA (PC-0099)", "190201; 20; 11.0000", "100113; 3; 5.5000", "100113; 7; 22.0000"].every((t) => copiado.includes(t)), true);
conferir("Copiar escolhas: itens para criar e total", [copiado.includes("CRIAR NO RISE (só com a permissão do dono)"), copiado.includes("#7; Roda E; 5; 2.2000"), copiado.includes("4 itens · R$ 401,50")], [true, true, true]);
conferir("depois de copiar o botão avisa", p1.ids.bCopiar.textContent, "Copiado: cole na conversa");
conferir("rascunho local guarda código e quantidade", JSON.parse(p1.store[CHAVE_USD])[3], { sku: "100113", qtd: "7" });
conferir("nenhuma chamada fora das 3 ferramentas declaradas", [...new Set(chamadas.map((c) => c[1]))].every((t) => ["lerPedidoDeCompra", "consultarProduto", "montarPedidoDeCompra"].includes(t)), true);

// --- 2. lista em R$ fora do claude.ai (HTML no chat de outra LLM)
const brlDados = fixture("dados-brl.json");
const p2 = abrirPagina(montarPagina(modelo, brlDados), { clipboard: { writeText: async () => { throw new Error("negado"); } } });
await espera(40);
conferir("R$: custo é o preço da lista, sem US$ e sem linha de preço original", [p2.texto(10).includes("R$ 10,00"), p2.texto(10).includes("US$"), p2.ids.meta.textContent.includes("custo = preço da lista ·")], [true, false, true]);
conferir("R$: título pelo nome (sem apelido) e sem rascunho", [p2.doc.title, p2.ids.pedidoLinha1.textContent], ["ZZ Fornecedor Real × concorrentes", "—"]);
conferir("fora do claude.ai: o cabeçalho manda usar Copiar escolhas", p2.ids.pedidoLinha2.textContent, "Sem conexão com o Rise nesta visualização: use Copiar escolhas e cole na conversa.");
p2.digitar("qtd-10", "5");
p2.digitar("qtd-11", "3");
conferir("fora do claude.ai: botões desligados com o motivo", [p2.botaoAdd(10).disabled, p2.motivo(10), p2.motivo(11)], [true, "Sem conexão com o Rise nesta tela: digite a quantidade e use Copiar escolhas.", "Sem a lista da página nesta tela: digite a quantidade e use Copiar escolhas."]);
p2.digitar("sku-11", "900200");
p2.card(11).querySelector(".btn").dispatch("click");
await espera();
conferir("fora do claude.ai: conferir código explica que é na conversa", p2.texto(11).includes("o código é conferido quando as escolhas forem coladas na conversa"), true);
p2.digitar("sku-11", "");
conferir("Copiar escolhas liga com 2 itens", [p2.ids.bCopiar.disabled, p2.ids.bCopiar.textContent], [false, "Copiar escolhas (2)"]);
p2.ids.bCopiar.dispatch("click");
await espera();
const textoAberto = p2.ids.copiaTexto.value;
conferir("área de transferência negada: o texto abre para copiar", [p2.ids.copia.hidden, textoAberto.includes("PEDIDO DE COMPRA (rascunho novo)"), textoAberto.includes("900100; 5; 10.0000"), textoAberto.includes("#11; Produto Y; 3; 4.0000"), textoAberto.includes("2 itens · R$ 62,00")], [false, true, true, true, true]);
p2.esc();
conferir("Esc fecha o texto", p2.ids.copia.hidden, true);

// --- 3. lista em R$ com fator
const p3 = abrirPagina(montarPagina(modelo, { ...brlDados, fator: 1.5 }));
await espera(20);
conferir("R$ com fator: custo × fator e o preço da lista embaixo", [p3.texto(10).includes("R$ 15,00"), p3.texto(10).includes("R$ 10,00"), p3.ids.meta.textContent.includes("custo = preço da lista × fator 1,5")], [true, true, true]);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);

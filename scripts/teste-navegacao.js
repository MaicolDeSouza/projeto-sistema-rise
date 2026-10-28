import assert from "node:assert/strict";

import { enderecoDaLista, listaComParametros, ultimaListaValida } from "../src/lib/ultimaListaDeProdutos.js";
import { condicoesDoFiltroDeCanais, filtroDeCanaisDaUrl, passaNosCalculados, proximoValorDoFiltro, temFiltroCalculado } from "../src/lib/filtroDeCanais.js";

/**
 * Voltar do produto para a lista de Produtos como ela estava (pedido do dono em 20/10/2026: a pesquisa sumia ao
 * Cancelar). Regras puras do endereco guardado; SEM rede, SEM banco, SEM navegador.
 */

let contagem = 0;
function conferir(nome, condicao) {
  assert.ok(condicao, nome);
  contagem++;
  console.log(`ok    ${nome}`);
}

conferir("sem parametros: a lista limpa", enderecoDaLista("") === "/produtos");
conferir("a pesquisa fica", enderecoDaLista("?q=cabo") === "/produtos?q=cabo");
conferir("pagina, ordem e pesquisa profunda ficam", enderecoDaLista("q=cabo&pagina=2&ordem=preco&ampla=1") === "/produtos?q=cabo&pagina=2&ordem=preco&ampla=1");
conferir("o destaque do produto novo sai", enderecoDaLista("?q=cabo&novo=abc") === "/produtos?q=cabo");
conferir("os avisos do Salvar saem", enderecoDaLista("?fotos=falhou&documentos=falhou&fornecedores=falhou&concorrentes=falhou") === "/produtos");
conferir("acento e espaco passam pela URL", enderecoDaLista("?q=placa%20compat%C3%ADvel") === "/produtos?q=placa+compat%C3%ADvel");

conferir("endereco da lista e valido", ultimaListaValida("/produtos?q=cabo") === "/produtos?q=cabo");
conferir("so /produtos e valido", ultimaListaValida("/produtos") === "/produtos");
conferir("outra tela nao serve", ultimaListaValida("/mercados?q=x") === "/produtos");
conferir("endereco de outro site nao serve", ultimaListaValida("//evil.test/produtos") === "/produtos");
conferir("produto aberto nao serve", ultimaListaValida("/produtos/abc") === "/produtos");
conferir("nada guardado: a lista limpa", ultimaListaValida(null) === "/produtos");

conferir("produto novo: o destaque entra junto da pesquisa", listaComParametros("/produtos?q=cabo", { novo: "id1" }) === "/produtos?q=cabo&novo=id1");
conferir("produto novo sem pesquisa", listaComParametros("/produtos", { novo: "id1", fotos: "falhou" }) === "/produtos?novo=id1&fotos=falhou");

// O filtro da coluna Canais (28/10/2026): os icones avancam desligado -> tem -> nao tem -> desligado.
conferir("filtro: 1o clique liga em 'tem'", proximoValorDoFiltro(null) === "sim");
conferir("filtro: 2o clique vira 'nao tem'", proximoValorDoFiltro("sim") === "nao");
conferir("filtro: 3o clique desliga", proximoValorDoFiltro("nao") === null);
conferir("filtro: a URL traz o ML com catalogo e o aviso", JSON.stringify(filtroDeCanaisDaUrl({ mlc: "sim", div: "nao", bling: "x", shopee: "sim" })) === JSON.stringify({ mlc: "sim", div: "nao" }));
conferir("filtro: catalogo e aviso nao viram condicao do banco", condicoesDoFiltroDeCanais({ mlc: "sim", div: "sim", rise: "sim" }).length === 1);
conferir("filtro: so os calculados pedem os icones", temFiltroCalculado({ div: "sim" }) && !temFiltroCalculado({ bling: "sim" }));
conferir("filtro: 'com aviso' fica com quem tem o !", passaNosCalculados({ div: "sim" }, { aviso: true }) && !passaNosCalculados({ div: "sim" }, { aviso: false }));
conferir("filtro: 'sem aviso' fica com quem nao tem", passaNosCalculados({ div: "nao" }, { aviso: false }) && !passaNosCalculados({ div: "nao" }, { aviso: true }));
conferir("filtro: catalogo e aviso valem juntos", !passaNosCalculados({ mlc: "sim", div: "sim" }, { catalogo: true, aviso: false }) && passaNosCalculados({ mlc: "sim", div: "sim" }, { catalogo: true, aviso: true }));

console.log(`\n${contagem} asserções ok`);

import assert from "node:assert/strict";

import { enderecoDaLista, listaComParametros, ultimaListaValida } from "../src/lib/ultimaListaDeProdutos.js";

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

console.log(`\n${contagem} asserções ok`);

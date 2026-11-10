import assert from "node:assert/strict";

import { enderecoDaLista, listaComParametros, ultimaListaValida } from "../src/lib/ultimaListaDeProdutos.js";
import { enderecoDaTela, listaDaTelaValida, rolagemGuardada, rolagemParaGuardar, voltaPedidaVale } from "../src/lib/ultimaListaDaTela.js";
import { aplicarOrdem, ehOrdemPadrao, moverPara, validarOrdem } from "../src/lib/ordemDosCartoes/regras.js";
import { CANAIS_DO_FILTRO,condicoesDoFiltroDeCanais, estadosDoCanal, filtroDeCanaisDaUrl, passaNosCalculados, proximoValorDoFiltro, temFiltroCalculado } from "../src/lib/filtroDeCanais.js";

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
// 08/11/2026: o ciclo e por icone; o Rise tem "proposta" e o ML (um icone so) tem "proposta" e "catalogo".
const ESTADOS_DO_ML = estadosDoCanal(CANAIS_DO_FILTRO.find((canal) => canal.id === "ml"));
conferir("filtro: o ML e um icone so, com proposta e catalogo no ciclo", JSON.stringify(ESTADOS_DO_ML) === JSON.stringify(["sim", "nao", "proposta", "catalogo"]) && !CANAIS_DO_FILTRO.some((canal) => canal.id === "mlc"));
conferir("filtro: no ML, 'nao tem' vira 'em proposta' e depois 'com catalogo'", proximoValorDoFiltro("nao", ESTADOS_DO_ML) === "proposta" && proximoValorDoFiltro("proposta", ESTADOS_DO_ML) === "catalogo" && proximoValorDoFiltro("catalogo", ESTADOS_DO_ML) === null);
conferir("filtro: o Rise tem 'em proposta' depois do 'nao conferidos'", proximoValorDoFiltro("nao", estadosDoCanal(CANAIS_DO_FILTRO[0])) === "proposta");
conferir("filtro: o '!' fecha o popup ao clicar", CANAIS_DO_FILTRO.find((canal) => canal.id === "div")?.fechaAoClicar === true);
conferir("filtro: a URL traz o ML com catalogo e o aviso (o mlc antigo e ignorado)", JSON.stringify(filtroDeCanaisDaUrl({ ml: "catalogo", mlc: "sim", div: "nao", bling: "x", rise: "proposta", li: "proposta", shopee: "sim" })) === JSON.stringify({ rise: "proposta", ml: "catalogo", div: "nao" }));
conferir("filtro: catalogo, proposta e aviso nao viram condicao do banco", condicoesDoFiltroDeCanais({ ml: "catalogo", div: "sim", rise: "proposta", bling: "sim" }).length === 1);
conferir("filtro: so os calculados pedem os icones", temFiltroCalculado({ div: "sim" }) && temFiltroCalculado({ rise: "proposta" }) && temFiltroCalculado({ ml: "proposta" }) && !temFiltroCalculado({ bling: "sim", ml: "nao" }));
conferir("filtro: 'com aviso' fica com quem tem o !", passaNosCalculados({ div: "sim" }, { aviso: true }) && !passaNosCalculados({ div: "sim" }, { aviso: false }));
conferir("filtro: 'sem aviso' fica com quem nao tem", passaNosCalculados({ div: "nao" }, { aviso: false }) && !passaNosCalculados({ div: "nao" }, { aviso: true }));
conferir("filtro: catalogo e aviso valem juntos", !passaNosCalculados({ ml: "catalogo", div: "sim" }, { catalogo: true, aviso: false }) && passaNosCalculados({ ml: "catalogo", div: "sim" }, { catalogo: true, aviso: true }));
conferir("filtro: 'em proposta' do Rise fica com o P do icone R", passaNosCalculados({ rise: "proposta" }, { propostaDoProduto: true }) && !passaNosCalculados({ rise: "proposta" }, { propostaDoProduto: false, propostaDoML: true }));
conferir("filtro: 'em proposta' do ML fica com o P do icone do ML", passaNosCalculados({ ml: "proposta" }, { propostaDoML: true }) && !passaNosCalculados({ ml: "proposta" }, { propostaDoML: false, propostaDoProduto: true }));

// A ordem dos cartoes e dos botoes do menu lateral (07/11/2026 e 09/11/2026): regras puras, a mesma para os dois.
const BOTOES = ["/", "/indicadores", "/cadastros", "/compras", "/estoque"];
conferir("ordem: sem ordem salva vale a do Rise", JSON.stringify(aplicarOrdem(BOTOES, null)) === JSON.stringify(BOTOES) && JSON.stringify(aplicarOrdem(BOTOES, [])) === JSON.stringify(BOTOES));
conferir("ordem: a salva vale, o que sumiu sai e o botao novo entra no fim", JSON.stringify(aplicarOrdem(BOTOES, ["/estoque", "/sumiu", "/", "/estoque"])) === JSON.stringify(["/estoque", "/", "/indicadores", "/cadastros", "/compras"]));
conferir("ordem: arrastar o ultimo para o primeiro lugar", JSON.stringify(moverPara(BOTOES, "/compras", "/")) === JSON.stringify(["/compras", "/", "/indicadores", "/cadastros", "/estoque"]));
conferir("ordem: soltar no proprio lugar nao muda nada", moverPara(BOTOES, "/cadastros", "/cadastros") === BOTOES && moverPara(BOTOES, "/x", "/") === BOTOES);
conferir("ordem: a padrao nao precisa ser guardada", ehOrdemPadrao(BOTOES, BOTOES) && !ehOrdemPadrao(moverPara(BOTOES, "/compras", "/"), BOTOES));
conferir("ordem: o menu e uma pagina que guarda ordem, e pagina qualquer nao", validarOrdem("menu", BOTOES).ok && validarOrdem("painel", BOTOES).ok && !validarOrdem("outra", BOTOES).ok);
conferir("ordem: lista vazia volta ao padrao, repetido vira um so, id invalido e recusado", validarOrdem("menu", []).ordem.length === 0 && validarOrdem("menu", ["/a", "/a"]).ordem.length === 1 && !validarOrdem("menu", [1]).ok && !validarOrdem("menu", "x").ok);

// A lista de uma tela lembrada na aba (09/11/2026, Vendas: abrir um pedido nao desfaz o "100 por pagina").
conferir("lista da tela: guarda a consulta inteira", enderecoDaTela("/pedidos", "por=100&pagina=2&aviso=1") === "/pedidos?por=100&pagina=2&aviso=1" && enderecoDaTela("/pedidos", "") === "/pedidos");
conferir("lista da tela: so o endereco da propria tela vale", listaDaTelaValida("/pedidos", "/pedidos?por=100") === "/pedidos?por=100" && listaDaTelaValida("/pedidos", "/pedidos/abc") === "/pedidos" && listaDaTelaValida("/pedidos", "https://x.com/pedidos") === "/pedidos" && listaDaTelaValida("/pedidos", null) === "/pedidos");

// A rolagem da lista (10/11/2026, Vendas: voltar do pedido retoma a altura em que a lista estava).
const ROLAGEM = rolagemParaGuardar("/pedidos?por=100", 1834.6);
conferir("rolagem: a altura volta so na mesma lista", rolagemGuardada(ROLAGEM, "/pedidos?por=100") === 1835 && rolagemGuardada(ROLAGEM, "/pedidos") === null && rolagemGuardada(ROLAGEM, "/pedidos?por=100&pagina=2") === null);
conferir("rolagem: nada guardado, texto estragado ou altura invalida abrem no topo", rolagemGuardada(null, "/pedidos") === null && rolagemGuardada("{x", "/pedidos") === null && rolagemGuardada(JSON.stringify({ endereco: "/pedidos", y: "900" }), "/pedidos") === null && rolagemGuardada(rolagemParaGuardar("/pedidos", -50), "/pedidos") === 0);
conferir("rolagem: o pedido de volta vale so para a lista que abre em seguida", voltaPedidaVale("1000", 1500) && voltaPedidaVale("1000", 30999) && !voltaPedidaVale("1000", 31000) && !voltaPedidaVale(null, 1500) && !voltaPedidaVale("abc", 1500) && !voltaPedidaVale("2000", 1500));

console.log(`\n${contagem} asserções ok`);

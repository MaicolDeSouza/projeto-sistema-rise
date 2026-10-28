/**
 * Testes da leitura da extensao "Rise AliExpress" (extensao-aliexpress/leitura.js): as respostas da pagina "Meus
 * pedidos" no formato medido em 28/10/2026 (scripts/fixtures/aliexpress/resposta-*.json) viram o que a extensao manda
 * ao Rise. Puro: sem banco, sem rede, sem Chrome.
 *
 *   npm run teste:extensao-aliexpress
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

// A leitura roda na pagina como script comum (sem export): carregada aqui num contexto proprio, como o Chrome faz.
const contexto = {};
contexto.globalThis = contexto;
vm.runInNewContext(readFileSync(new URL("../extensao-aliexpress/leitura.js", import.meta.url), "utf8"), contexto);
const L = contexto.RiseLeitura;
const fixture = (nome) => JSON.parse(readFileSync(new URL(`./fixtures/aliexpress/${nome}.json`, import.meta.url), "utf8"));
// Objetos criados no outro contexto: passam por JSON para comparar com os daqui.
const puro = (valor) => JSON.parse(JSON.stringify(valor));

console.log("\nLeitura da lista de pedidos");
const lista = puro(L.pedidosDaResposta(fixture("resposta-lista").data));
conferir("dois pedidos, tem mais, pagina 1", [lista.pedidos.length, lista.hasMore, lista.pageIndex], [2, true, 1]);
const [p1, p2] = lista.pedidos;
conferir(
  "pedido 1",
  [p1.orderId, p1.statusCodigo, p1.statusTexto, p1.moeda, p1.loja, p1.lojaId, p1.totalTexto, p1.dataTexto, p1.dataIso],
  ["8215244197193461", 7, "Enviado parcialmente", "BRL", "Lets Deal Store", "1102826724", "R$277,10", "26 out, 2026", "2026-10-26T12:00:00.000Z"],
);
conferir("linha 1", p1.linhas[0], {
  orderLineId: "8215244197203461",
  productId: "1005006891567710",
  skuId: "12000038634693222",
  opcao: "Color Name: 2M",
  titulo: "Cabo impermeável painel traço, USB 3.0 e HDMI-compatível com extensão AUX, 2m",
  urlDoItem: "https://www.aliexpress.com/item/1005006891567710.html",
  urlDaFoto: "https://ae-pic-a1.aliexpress-media.com/kf/S1.jpg",
  quantidade: 4,
  precoTexto: "R$57,49",
});
conferir("pedido em USD mantem a moeda (o Rise recusa)", [p2.moeda, p2.linhas[0].urlDaFoto, p2.linhas[0].opcao], ["USD", null, "Cor: Azul"]);
conferir("so as chaves do Rise", Object.keys(puro(L.limparPedido({ ...p1, destinatario: "x", telefone: "y" }))).sort(), Object.keys(p1).sort());
conferir("resposta sem pedidos", puro(L.pedidosDaResposta({ data: {} })), { pedidos: [], hasMore: false, pageIndex: null });
conferir("resposta vazia", puro(L.pedidosDaResposta(null)), { pedidos: [], hasMore: false, pageIndex: null });

console.log("\nDetalhe e rastreio");
conferir("detalhe", puro(L.detalheDaResposta(fixture("resposta-detalhe").data)), {
  subtotalTexto: "R$ 229,96",
  freteTexto: "R$ 0,12",
  impostoTexto: "R$ 47,14",
  totalTexto: "R$ 277,10",
});
conferir("detalhe sem bloco de preco", puro(L.detalheDaResposta({ data: {} })), { subtotalTexto: null, freteTexto: null, impostoTexto: null, totalTexto: null });
const rastreio = puro(L.rastreioDaResposta(fixture("resposta-rastreio").data.module));
conferir("rastreio", rastreio, {
  pacotes: [
    {
      codigo: "NN446506474BR",
      codigoOrigem: "AP00100095481339",
      transportadora: "AliExpress Selection Standard",
      previsaoTexto: "Nov 09 - 18",
      previsaoInicio: 1794289253053,
      previsaoFim: 1795066853053,
      eventos: [
        { em: 1793134276000, descricao: "Chegou ao armazém de consolidação", nome: "Em trânsito", codigo: "AE_CW_SIGN_IN_SUCCESS" },
        { em: 1793121230000, descricao: "Saiu do centro de distribuição do país/região de partida", nome: "Em trânsito", codigo: "AE_SC_OUTBOUND_SUCCESS" },
      ],
      itens: [{ productId: "1005006891567710", skuId: "12000038634693222", quantidade: 4 }],
    },
  ],
});
const texto = JSON.stringify(rastreio);
conferir("rastreio nao leva endereco nem telefone", texto.includes("54******694") || texto.includes("nao pode sair"), false);
conferir("rastreio sem pacote", puro(L.rastreioDaResposta({})), { pacotes: [] });

console.log("\nCorte da leitura");
conferir(
  "para quando todos sao anteriores ao corte",
  [
    L.devePararDeLer([{ dataIso: "2026-09-01T12:00:00.000Z" }, { dataIso: "2026-09-02T12:00:00.000Z" }], "2026-09-10T00:00:00.000Z"),
    L.devePararDeLer([{ dataIso: "2026-09-01T12:00:00.000Z" }, { dataIso: "2026-09-12T12:00:00.000Z" }], "2026-09-10T00:00:00.000Z"),
    L.devePararDeLer([], "2026-09-10T00:00:00.000Z"),
  ],
  [true, false, false],
);
conferir("data", [L.lerData("3 fev, 2027"), L.lerData("Hoje")], ["2027-02-03T12:00:00.000Z", null]);
conferir(
  "da Ver tudo so seguem os pedidos a partir do corte (sem data lida, segue)",
  puro(L.aPartirDoCorte([{ orderId: "1", dataIso: "2026-08-10T12:00:00.000Z" }, { orderId: "2", dataIso: "2026-10-01T12:00:00.000Z" }, { orderId: "3", dataIso: null }], "2026-09-28T00:00:00.000Z")).map((p) => p.orderId),
  ["2", "3"],
);

console.log(`\n${falhas === 0 ? "Tudo certo." : `${falhas} falha(s).`}`);
process.exit(falhas === 0 ? 0 : 1);

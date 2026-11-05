/**
 * Teste das regras puras da pagina de vinculos Fortek/Nightech (05/11/2026): scripts/vincular-fornecedores-gerar.js
 * (candidatos, dados e a pagina) e scripts/vincular-fornecedores-aplicar.js (o plano a partir do JSON salvo).
 * SEM banco e SEM rede: os scripts recebem VINCULAR_SO_FUNCOES=1 e so exportam as funcoes.
 *
 *   node scripts/teste-vincular-fornecedores.js
 */
import assert from "node:assert/strict";

process.env.VINCULAR_SO_FUNCOES = "1";
const gerar = await import("./vincular-fornecedores-gerar.js");
const aplicar = await import("./vincular-fornecedores-aplicar.js");

let total = 0;
const igual = (a, b, mensagem) => { total++; assert.deepEqual(a, b, mensagem); };
const ok = (valor, mensagem) => { total++; assert.ok(valor, mensagem); };

const FONTES = ["Fortek", "Nightech"];
const linha = (id, fonte, codigo, nome, extra = {}) => ({
  id, fonte: { nome: fonte }, codigo, nome, url: null, precoNormal: "10.00", precoPromocional: null, precoComImpostos: "10.65",
  impostos: [{ nome: "IPI", percentual: 6.5 }], quantidade: 5, aChegar: null, aChegarPrevisao: null, emMontagem: null,
  // O buscaTexto do banco e o texto normalizado (nome, marca, modelo, codigos); aqui basta nome + codigo.
  buscaTexto: gerar.normalizar(`${nome} ${codigo}`),
  ...extra,
});
const acervo = gerar.montarAcervo(FONTES, [
  linha("f1", "Fortek", "04-052", "MOTOR DE PASSO 28BYJ-48 + ULN2003"),
  linha("n1", "Nightech", "ROB0250", "Motor de Passo 28BYJ-48 + Driver ULN2003", { quantidade: 34, url: "https://nightech.com.br/rob0250" }),
  linha("f2", "Fortek", "53-043", "MOTOR DC RF-100 COM ENGRENAGEM"),
  linha("f3", "Fortek", "04-053", "MOTOR DE PASSO 28BYJ-48 ULN2003 5V"),
  linha("f4", "Fortek", "04-054", "MOTOR DE PASSO 28BYJ-48 ULN2003 12V"),
  linha("f5", "Fortek", "04-055", "MOTOR DE PASSO 28BYJ-48 ULN2003 KIT"),
  linha("f6", "Fortek", "04-056", "MOTOR DE PASSO 28BYJ-48 ULN2003 PLACA"),
  linha("f7", "Fortek", "04-057", "MOTOR DE PASSO 28BYJ-48 DRIVER ULN2003"),
  linha("n2", "Nightech", "SEN0001", "Sensor ultrassônico HC-SR04"),
]);
const TITULO = "MOTOR DE PASSO 28BYJ-48 COM DRIVER ULN2003";

// --- codigoDoBling
igual(gerar.codigoDoBling({ nome: "Fortek", codigo: "04-052" }, FONTES), { fonte: "Fortek", codigo: "04-052" }, "rascunho da Fortek");
igual(gerar.codigoDoBling({ nome: "BENSER (Fortek)", codigo: " 04-052 " }, FONTES), { fonte: "Fortek", codigo: "04-052" }, "nome contem a fonte, codigo sem espacos");
igual(gerar.codigoDoBling({ nome: "Benser", codigo: "04-052" }, FONTES), { fonte: "Fortek", codigo: "04-052" }, "Benser e o portal da Fortek");
igual(gerar.codigoDoBling({ nome: "Patola", codigo: "123" }, FONTES), null, "outro fornecedor nao marca");
igual(gerar.codigoDoBling({ nome: "Fortek", codigo: "" }, FONTES), null, "sem codigo nao marca");
igual(gerar.codigoDoBling(null, FONTES), null, "sem rascunho");

// --- candidatosDoProduto: rascunho do Bling primeiro e marcado, teto por fonte, parecido abaixo da nota fica fora
const comBling = gerar.candidatosDoProduto({ sku: "100225", tituloBase: TITULO, fornecedorRascunho: { nome: "Fortek", codigo: "04-052" }, fornecedores: [] }, acervo);
igual(comBling[0].codigo, "04-052", "o codigo do Bling vem primeiro");
igual([comBling[0].origem, comBling[0].marcado, comBling[0].travado], ["bling", true, false], "bling: marcado e nao travado");
igual(comBling.filter((c) => c.fonte === "Fortek").length, 4, "teto de 4 por fonte, o do Bling incluso");
ok(!comBling.some((c) => c.codigo === "53-043"), "o motor DC (so 'motor' em comum) fica fora");
const nightech = comBling.filter((c) => c.fonte === "Nightech");
igual(nightech.map((c) => [c.codigo, c.origem, c.marcado]), [["ROB0250", "parecido", false]], "a Nightech traz so o motor de passo, desmarcado");
igual(nightech[0].preco, 10.65, "preco com impostos");
igual(nightech[0].estoque.pronta, 34, "estoque de pronta entrega");
ok(nightech[0].nota > 0.9 && comBling[1].nota >= 0.5, "notas: a Nightech tem todas as palavras; os parecidos passam da metade");
ok(comBling.every((c) => !("formas" in c) && !("palavrasDoNome" in c)), "o candidato nao carrega o indice de palavras");

// --- vinculo que ja existe: travado, marcado, sem repetir
const comVinculo = gerar.candidatosDoProduto({ sku: "100226", tituloBase: TITULO, fornecedorRascunho: null, fornecedores: [{ fornecedorNome: "Nightech", codigo: "ROB0250", descricao: "x" }] }, acervo);
igual(comVinculo.filter((c) => c.codigo === "ROB0250").map((c) => [c.origem, c.marcado, c.travado]), [["vinculado", true, true]], "vinculado: uma vez, marcado e travado");
ok(!comVinculo.some((c) => c.origem === "bling"), "sem rascunho nao ha candidato do Bling");

// --- rascunho de outro fornecedor: o item ainda aparece como parecido, mas desmarcado
const outro = gerar.candidatosDoProduto({ sku: "100228", tituloBase: TITULO, fornecedorRascunho: { nome: "Patola", codigo: "04-052" }, fornecedores: [] }, acervo);
igual(outro.filter((c) => c.codigo === "04-052").map((c) => [c.origem, c.marcado]), [["parecido", false]], "rascunho da Patola nao marca a Fortek");

// --- sufixo de carga da Fortek: 04-052-A e o 04-052
const sufixo = gerar.candidatosDoProduto({ sku: "100230", tituloBase: "CABO", fornecedorRascunho: { nome: "Fortek", codigo: "04-052-A" }, fornecedores: [] }, acervo);
igual(sufixo.map((c) => [c.codigo, c.origem]), [["04-052", "bling"]], "o codigo com sufixo de carga acha o item base");

// --- titulo de ate 2 palavras exige todas
const curto = gerar.candidatosDoProduto({ sku: "100227", tituloBase: "SENSOR HCSR04", fornecedorRascunho: null, fornecedores: [] }, acervo);
igual(curto.map((c) => c.codigo), ["SEN0001"], "com duas palavras, so quem tem as duas");
igual(gerar.candidatosDoProduto({ sku: "100231", tituloBase: "", fornecedorRascunho: null, fornecedores: [] }, acervo), [], "sem titulo, nada");

// --- sem parecido pela regra da lupa: ate 2 por fonte com 30% ou mais, com o selo "fraco" (so com 3+ palavras)
const fraco = gerar.candidatosDoProduto({ sku: "100232", tituloBase: "MOTOR DC ENGRENAGEM 24V 300RPM", fornecedorRascunho: null, fornecedores: [] }, acervo);
igual(fraco.map((c) => [c.codigo, c.origem, c.marcado]), [["53-043", "fraco", false]], "o motor DC entra como parecido fraco");
ok(!comBling.some((c) => c.origem === "fraco"), "com parecido de verdade nao ha fraco");
igual(gerar.candidatosDoProduto({ sku: "100233", tituloBase: "MOTOR PASSO", fornecedorRascunho: null, fornecedores: [] }, acervo).filter((c) => c.origem === "fraco"), [], "com 2 palavras nao ha fraco");

// --- montarDados: quem nao tem candidato vai para a lista do fim; abaixo do minimo = estoque < minimo
const dados = gerar.montarDados(
  [
    { sku: "100229", tituloBase: "CABO HDMI 2 METROS", estoque: 0, estoqueMinimo: 5, fornecedorRascunho: null, fornecedores: [] },
    { sku: "100225", tituloBase: `${TITULO} </script><b>x`, estoque: 3, estoqueMinimo: 3, fornecedorRascunho: { nome: "Fortek", codigo: "04-052" }, fornecedores: [] },
    { sku: "100226", tituloBase: TITULO, estoque: 0, estoqueMinimo: null, fornecedorRascunho: null, fornecedores: [] },
  ],
  acervo,
  { geradoEm: "05/11/2026 14:00" },
);
igual(dados.semCandidato, [{ sku: "100229", nome: "CABO HDMI 2 METROS" }], "sem candidato");
igual(dados.produtos.map((p) => [p.sku, p.abaixo]), [["100225", false], ["100226", false]], "ordem por SKU; 3 de minimo 3 nao esta abaixo; sem minimo nao esta abaixo");
igual(dados.produtos[0].rascunho, { nome: "Fortek", codigo: "04-052" }, "o rascunho do Bling vai para a pagina");
igual(dados.fontes, FONTES, "as fontes na ordem");

// --- paginaHtml: dados embutidos com `<` escapado, e os textos da barra
const html = gerar.paginaHtml(dados);
ok(html.includes('"sku":"100225"'), "o JSON dos dados esta na pagina");
ok(!html.includes("</script><b>x"), "um nome com </script> nao fecha o script da pagina");
ok(html.includes("\\u003c/script>\\u003cb>x"), "o < do JSON vira \\u003c");
ok(html.includes("Salvar escolhas") && html.includes("Carregar arquivo") && html.includes("Só abaixo do mínimo"), "barra com os botoes");
ok(html.includes("rise:vincular-fornecedores:v1") && html.includes("vinculos-fortek-nightech.json"), "chave do localStorage e nome do arquivo salvo");
// O `display:grid` da linha vence o `hidden` do navegador: sem esta regra os filtros contavam e nao escondiam (visto na tela).
ok(html.includes("[hidden]{display:none!important}"), "linha filtrada some da tela");

// --- planoDasEscolhas: ignora nenhum, vazio, repetido e sem codigo; ordena por SKU
igual(
  aplicar.planoDasEscolhas({
    produtos: {
      "100226": { fornecedores: [{ fonte: "Fortek", codigo: "04-052" }], nenhum: true, revisado: true },
      "100225": { fornecedores: [{ fonte: "Fortek", codigo: "04-052" }, { fonte: "Nightech", codigo: "ROB0250" }, { fonte: "fortek", codigo: "04-052" }, { fonte: "Fortek", codigo: "" }], nenhum: false },
      "100224": { fornecedores: [], nenhum: false, revisado: true },
    },
  }),
  [{ sku: "100225", adicionar: [{ fonte: "Fortek", codigo: "04-052" }, { fonte: "Nightech", codigo: "ROB0250" }] }],
  "plano so com quem tem fornecedor marcado",
);
igual(aplicar.planoDasEscolhas(null), [], "sem escolhas, plano vazio");

console.log(`teste-vincular-fornecedores: ${total} asserções OK`);

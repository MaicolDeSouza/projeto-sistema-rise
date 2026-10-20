import "dotenv/config";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

import { escolherMedidas, escolherNcm, opcoesDePreco, origemFiscal, precoParaMargem } from "../src/lib/proposta/regras.js";
import { calcularMargem } from "../src/lib/margem.js";

/**
 * Proposta automatica de produto (spec 2026-10-16): as regras puras de preco, medidas, NCM e origem fiscal. SEM rede e
 * SEM banco neste bloco; os blocos de banco (tarefas seguintes do plano) limpam o que escrevem (produtos ZZ-PROP-*).
 */

let contagem = 0;
function conferir(nome, condicao) {
  assert.ok(condicao, nome);
  contagem++;
  console.log(`ok    ${nome}`);
}

// ---------------------------------------------------------------------------
// Preco por margem (a margem e a do Rise: lucro liquido, com 6% de imposto, dividido pelo preco de venda)
// ---------------------------------------------------------------------------
{
  conferir("precoParaMargem(18,90; 60%) = 55,59 (18,9 / 0,34, arredondado para cima)", precoParaMargem(18.9, 60) === 55.59);
  conferir("precoParaMargem devolve a margem pedida pela conta do Rise", Math.abs(calcularMargem(precoParaMargem(18.9, 40), 18.9) - 40) < 0.1);
  conferir("precoParaMargem sem custo = null", precoParaMargem(0, 40) === null);
  conferir("precoParaMargem com margem que nao cabe (94%) = null", precoParaMargem(10, 94) === null);
}

{
  const concorrentes = [30, 40, 50, 60, 70, 80].map((preco, i) => ({ loja: `Loja ${"ABCDEF"[i]}`, preco }));
  const resultado = opcoesDePreco(18.9, concorrentes);
  conferir("opcoesDePreco traz as margens 40, 50 e 60", JSON.stringify(resultado.opcoes.map((o) => o.margem)) === "[40,50,60]");
  conferir("cada opcao traz o preco e a posicao", resultado.opcoes.every((o) => o.preco > 0 && o.posicao?.posicao >= 1));
  conferir("a recomendada fica entre os 5 primeiros", resultado.recomendada?.posicao.posicao <= 5);
  const seguinte = precoParaMargem(18.9, resultado.recomendada.margem + 1);
  const lojasMaisBaratas = concorrentes.filter((c) => c.preco < seguinte).length;
  conferir("a margem seguinte a recomendada ja passa do 5º lugar (ou nao cabe)", seguinte === null || lojasMaisBaratas + 1 > 5);
  conferir("com recomendada, sem motivo", resultado.motivoSemRecomendada === null);
}

{
  const semCusto = opcoesDePreco(null, [{ loja: "A", preco: 30 }]);
  conferir("sem custo: sem recomendada", semCusto.recomendada === null);
  conferir("sem custo: o motivo fala do custo", /custo/.test(semCusto.motivoSemRecomendada ?? ""));
}

{
  const baratos = ["A", "B", "C", "D", "E", "F"].map((loja) => ({ loja, preco: 10 }));
  const caro = opcoesDePreco(18.9, baratos);
  conferir("concorrentes abaixo do custo: sem recomendada", caro.recomendada === null);
  conferir("concorrentes abaixo do custo: o motivo fala dos 5 primeiros", /5 primeiros/.test(caro.motivoSemRecomendada ?? ""));
  conferir("concorrentes abaixo do custo: as 3 opcoes continuam", caro.opcoes.length === 3);
}

// ---------------------------------------------------------------------------
// Peso e medidas: a Usinainfo primeiro; sem ela, o valor mais repetido; empate, o do fabricante
// ---------------------------------------------------------------------------
{
  const medida = (loja, pesoKg, extra = {}) => ({ loja, pesoKg, alturaCm: 1.9, larguraCm: 1.8, comprimentoCm: 4.3, ...extra });
  const comUsina = escolherMedidas([medida("Smartkits", 0.007), medida("Usinainfo", 0.006), medida("Saravati", 0.007), medida("Eletrogate", 0.007)]);
  conferir("com a Usinainfo, vale a dela", comUsina.valor.pesoKg === 0.006);
  conferir("com a Usinainfo, a origem diz Usinainfo", /Usinainfo/.test(comUsina.origem));

  const semUsina = escolherMedidas([medida("Smartkits", 0.007), medida("Saravati", 0.007), medida("Robocore", 0.006)]);
  conferir("sem a Usinainfo, vale o mais repetido", semUsina.valor.pesoKg === 0.007);

  const usinaSemPeso = escolherMedidas([medida("Usinainfo", null), medida("Smartkits", 0.007), medida("Saravati", 0.007)]);
  conferir("Usinainfo sem o peso: o peso vem do mais repetido", usinaSemPeso.valor.pesoKg === 0.007);

  const empate = escolherMedidas([medida("Loja A", 0.006), medida("Fabricante X", 0.007, { fabricante: true })]);
  conferir("empate: vale o do fabricante", empate.valor.pesoKg === 0.007);

  conferir("sem nenhuma medida: null", escolherMedidas([]) === null);
}

// ---------------------------------------------------------------------------
// NCM: a Fortek primeiro; sem ela, o mais repetido; origem fiscal 2 com fornecedor, 0 sem
// ---------------------------------------------------------------------------
{
  const comFortek = escolherNcm([{ fornecedor: "Santana", ncm: "8471.80.00" }, { fornecedor: "Fortek", ncm: "8542.31.90" }]);
  conferir("com a Fortek, vale o NCM dela", comFortek.ncm === "8542.31.90");
  conferir("com a Fortek, a origem diz Fortek", /Fortek/.test(comFortek.origem));

  const semFortek = escolherNcm([{ fornecedor: "A", ncm: "8471.80.00" }, { fornecedor: "B", ncm: "8542.31.90" }, { fornecedor: "C", ncm: "8542.31.90" }]);
  conferir("sem a Fortek, vale o mais repetido", semFortek.ncm === "8542.31.90");

  const empate = escolherNcm([{ fornecedor: "A", ncm: "8471.80.00" }, { fornecedor: "B", ncm: "8542.31.90" }]);
  conferir("empate sem Fortek: vale o primeiro da lista", empate.ncm === "8471.80.00");

  conferir("fornecedor sem NCM nao conta", escolherNcm([{ fornecedor: "Fortek", ncm: null }, { fornecedor: "B", ncm: "8542.31.90" }]).ncm === "8542.31.90");
  conferir("sem NCM nenhum: null", escolherNcm([{ fornecedor: "A", ncm: "" }]) === null);

  conferir("origem fiscal com fornecedor = 2", origemFiscal(true) === 2);
  conferir("origem fiscal sem fornecedor = 0", origemFiscal(false) === 0);
}

// ---------------------------------------------------------------------------
// Banco: a tabela PropostaDeProduto (uma por produto, apagada junto com ele). Postgres local; so escreve ZZ-PROP-*.
// ---------------------------------------------------------------------------
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));
const { prisma } = await import("../src/lib/db.js");

// ---------------------------------------------------------------------------
// Disco: a pasta proposta/ (fotos candidatas e PDFs baixados), com nome gerado por nos
// ---------------------------------------------------------------------------
{
  const { PASTA_PROPOSTA, caminhoDaProposta, urlDaProposta, apagarPastaDaProposta } = await import("../src/lib/arquivos.js");
  const nome = "0123456789abcdef0123456789abcdef.jpg";
  conferir("disco: a pasta se chama proposta", PASTA_PROPOSTA === "proposta");
  conferir("disco: nome com ../ e recusado", caminhoDaProposta("100103", "../x.jpg") === null);
  conferir("disco: nome que nao e o do sistema e recusado", caminhoDaProposta("100103", "abc.jpg") === null);
  conferir("disco: extensao fora de jpg/pdf e recusada", caminhoDaProposta("100103", nome.replace(".jpg", ".zip")) === null);
  conferir("disco: SKU invalido e recusado", caminhoDaProposta("../etc", nome) === null);
  conferir("disco: nome valido termina em proposta/<nome>", /[\\/]100103[\\/]proposta[\\/]0123456789abcdef0123456789abcdef\.jpg$/.test(caminhoDaProposta("100103", nome) ?? ""));
  conferir("disco: PDF tambem vale", caminhoDaProposta("100103", nome.replace(".jpg", ".pdf")) !== null);
  conferir("disco: urlDaProposta monta o endereco da rota", urlDaProposta("100103-teste", nome) === `/api/arquivos/100103-teste/proposta/${nome}`);
  // apagarPastaDaProposta com SKU invalido nao apaga nada e nao lanca.
  conferir("disco: apagar com SKU invalido nao faz nada", (await apagarPastaDaProposta("..")) === false);
}

async function limpar() {
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-PROP-" } } });
}

try {
  await limpar();
  {
    const produto = await prisma.produto.create({ data: { sku: "ZZ-PROP-1", tituloBase: "PRODUTO DE TESTE DA PROPOSTA" } });
    const criada = await prisma.propostaDeProduto.create({ data: { produtoId: produto.id, secoes: { titulos: { opcoes: [] } } } });
    conferir("banco: a proposta nasce com aplicadas vazio", JSON.stringify(criada.aplicadas) === "{}");
    conferir("banco: a proposta nasce com a versao 1 do roteiro", criada.versaoDoRoteiro === "1");
    const lida = await prisma.propostaDeProduto.findUnique({ where: { produtoId: produto.id } });
    conferir("banco: a secao volta como foi gravada", Array.isArray(lida?.secoes?.titulos?.opcoes));
    let recusou = false;
    try {
      await prisma.propostaDeProduto.create({ data: { produtoId: produto.id, secoes: {} } });
    } catch {
      recusou = true;
    }
    conferir("banco: uma proposta so por produto", recusou);
    await prisma.produto.delete({ where: { id: produto.id } });
    conferir("banco: apagar o produto apaga a proposta", (await prisma.propostaDeProduto.findUnique({ where: { id: criada.id } })) === null);
  }
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(`\n${contagem} asserções ok`);

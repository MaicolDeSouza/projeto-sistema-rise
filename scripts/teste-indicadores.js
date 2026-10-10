import assert from "node:assert/strict";
import { calcularIndicadoresEstoque, custoDoCadastro, formatarReais } from "../src/lib/indicadores/estoque.js";

const importado = {
  estoque: 10, custo: null, precoVenda: "25.00", fornecedores: [],
  fornecedorRascunho: { nome: "Fornecedor importado", precoCusto: "12.50" },
};
assert.equal(calcularIndicadoresEstoque([
  { ...importado, custo: custoDoCadastro(importado) },
]).custo, "125.00");
assert.equal(custoDoCadastro({ ...importado, fornecedores: [
  { padrao: false, precoCusto: "1.00" }, { padrao: true, precoCusto: "15.00" },
]}), "15.00");
assert.equal(custoDoCadastro({ ...importado, fornecedores: [{ padrao: true, precoCusto: null }] }), null);
assert.equal(custoDoCadastro({ ...importado, fornecedores: [{ padrao: false, precoCusto: "9.00" }] }), null);
assert.equal(custoDoCadastro({ ...importado, fornecedores: [{ padrao: true, precoCusto: "0.00" }] }), "0.00");
assert.equal(custoDoCadastro({ ...importado, fornecedorRascunho: null, custo: "999.00" }), null);

assert.deepEqual(calcularIndicadoresEstoque([]), {
  custo: "0.00", receita: "0.00", produtosComEstoque: 0,
  unidades: 0, semCusto: 0, semPreco: 0, estoqueNegativo: 0, kitsFora: 0,
});
assert.deepEqual(calcularIndicadoresEstoque([
  { estoque: 100, custo: "30.00", precoVenda: "70.00", ativo: false },
  { estoque: 3, custo: "0.10", precoVenda: "0.20" },
  { estoque: 2, custo: null, precoVenda: "10.00" },
  { estoque: 1, custo: "5.00", precoVenda: null },
  { estoque: 4, custo: "0.00", precoVenda: "0.00" },
  { estoque: 0, custo: null, precoVenda: null },
  { estoque: -10, custo: "500.00", precoVenda: "1000.00" },
]), {
  custo: "3005.30", receita: "7020.60", produtosComEstoque: 5,
  unidades: 110, semCusto: 1, semPreco: 1, estoqueNegativo: 1, kitsFora: 0,
});
// Kit fica fora (o estoque dele e o das pecas, que ja estao na soma): 20 placas e um kit de 10, so as placas contam.
assert.deepEqual(calcularIndicadoresEstoque([
  { estoque: 20, custo: "10.00", precoVenda: "40.00", tipo: "SIMPLES" },
  { estoque: 10, custo: null, precoVenda: "77.80", tipo: "COMPOSICAO" },
  { estoque: 0, custo: null, precoVenda: null, tipo: "COMPOSICAO" },
  { estoque: -3, custo: null, precoVenda: null, tipo: "COMPOSICAO" },
]), {
  custo: "200.00", receita: "800.00", produtosComEstoque: 1,
  unidades: 20, semCusto: 0, semPreco: 0, estoqueNegativo: 0, kitsFora: 1,
});
// Confere a soma integral, mesmo quando ultrapassa uma pagina de produtos.
assert.equal(calcularIndicadoresEstoque(Array.from({ length: 60 }, () => ({
  estoque: 3, custo: "0.10", precoVenda: "1.99",
}))).receita, "358.20");
assert.equal(formatarReais("3005.30").replace(/\s/g, " "), "R$ 3.005,30");
console.log("OK: totais, centavos, dados ausentes, valor zero, saldos negativos, inativos, kits fora e lista completa.");

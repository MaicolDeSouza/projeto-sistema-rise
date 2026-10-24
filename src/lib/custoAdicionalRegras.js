/**
 * CUSTO ADICIONAL NA LINHA DO FORNECEDOR (pedido do dono em 24/10/2026): "as vezes meu fornecedor vende arduino sem cabo,
 * mas eu vendo apenas com cabo"; opcao 1 (o adicional mora dentro do preco de custo, sem coluna nova) mais o vinculo a
 * um codigo do Rise ("ao alterar o custo do cabo no Rise automaticamente ja ajusta o preco de custo do arduino + cabo").
 *
 * Regras puras, SEM imports: a tela (o total enquanto se edita) e o servidor (o que se grava) fazem a mesma conta.
 *
 * Um adicional e UM de dois formatos:
 * - valor fixo: `{ descricao, valor }` (ex.: "Cabo USB", 2,50);
 * - produto do Rise: `{ produtoId, quantidade }`, que soma quantidade x o custo DE HOJE daquele produto (a mesma regra
 *   da margem: fornecedor padrao, rascunho do Bling, cadastro). Muda sozinho quando o custo dele muda.
 *
 * O custo do vinculo (`precoCusto`, o que o resto do Rise le) = o preco do fornecedor (`precoFornecedor`) + a soma.
 */

export const MAXIMO_ADICIONAIS = 10;
const MAXIMO_QUANTIDADE = 99;

const numero = (valor) => {
  const lido = Number(typeof valor === "string" ? valor.replace(",", ".") : valor);
  return Number.isFinite(lido) ? lido : null;
};
const centavos = (valor) => Math.round(valor * 100) / 100;

/**
 * A lista no formato gravado: so valores fixos maiores que zero (com descricao) e produtos do Rise com quantidade de 1
 * a 99. Lixo sai; produto repetido vira um so (as quantidades somam); o proprio produto do vinculo (`proprioId`) nunca
 * entra (somaria o custo dele nele mesmo). No maximo `MAXIMO_ADICIONAIS`.
 * @returns {Array<{ descricao: string, valor: number } | { produtoId: string, quantidade: number }>}
 */
export function normalizarAdicionais(lista, proprioId = null) {
  if (!Array.isArray(lista)) return [];
  const saida = [];
  const porProduto = new Map();
  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    if (typeof item.produtoId === "string" && item.produtoId.trim()) {
      const produtoId = item.produtoId.trim();
      if (produtoId === proprioId) continue;
      const quantidade = Math.trunc(numero(item.quantidade ?? 1) ?? 0);
      if (quantidade < 1 || quantidade > MAXIMO_QUANTIDADE) continue;
      const ja = porProduto.get(produtoId);
      if (ja) {
        ja.quantidade = Math.min(MAXIMO_QUANTIDADE, ja.quantidade + quantidade);
        continue;
      }
      const novo = { produtoId, quantidade };
      porProduto.set(produtoId, novo);
      saida.push(novo);
      continue;
    }
    const valor = numero(item.valor);
    const descricao = String(item.descricao ?? "").trim().slice(0, 80);
    if (valor === null || valor <= 0 || valor > 100000 || !descricao) continue;
    saida.push({ descricao, valor: centavos(valor) });
  }
  return saida.slice(0, MAXIMO_ADICIONAIS);
}

/**
 * A soma dos adicionais. `custoDe(produtoId)` devolve o custo de hoje do produto vinculado (ou null). Produto sem custo
 * conta 0 e vai em `semCusto` (a tela avisa): zerar o custo do vinculo inteiro tiraria a margem do produto.
 * @returns {{ total: number, semCusto: string[] }}
 */
export function somaDosAdicionais(adicionais, custoDe = () => null) {
  let total = 0;
  const semCusto = [];
  for (const item of adicionais ?? []) {
    if (item?.produtoId) {
      const custo = numero(custoDe(item.produtoId));
      if (custo === null || custo <= 0) semCusto.push(item.produtoId);
      else total += custo * (item.quantidade ?? 1);
    } else {
      total += numero(item?.valor) ?? 0;
    }
  }
  return { total: centavos(total), semCusto };
}

/** O custo do vinculo: o preco do fornecedor mais a soma. Sem preco do fornecedor, sem custo (null). */
export function custoTotal(precoFornecedor, soma) {
  const base = numero(precoFornecedor);
  if (base === null || precoFornecedor === "" || precoFornecedor === null || precoFornecedor === undefined) return null;
  return centavos(base + (numero(soma) ?? 0));
}

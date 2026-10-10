import { Decimal } from "@prisma/client/runtime/client";

// Mesma origem do custo mostrado no formulario do produto. Um vinculo real
// substitui o rascunho do Bling, mesmo quando seu preco ainda nao foi preenchido.
export function custoDoCadastro(produto) {
  if (produto.fornecedores.length > 0) {
    return produto.fornecedores.find((item) => item.padrao)?.precoCusto ?? null;
  }
  return produto.fornecedorRascunho?.nome
    ? produto.fornecedorRascunho.precoCusto ?? null
    : null;
}

// Mantem a precisao decimal dos valores monetarios durante toda a soma.
//
// KIT FICA FORA (pedido do dono em 10/10/2026): o estoque do produto com composicao e calculado pelas pecas,
// que ja estao na soma. Contar o kit tambem contaria as mesmas pecas duas vezes (20 placas e mais 10 kits de 2
// placas, que sao as mesmas 20). `kitsFora` diz quantos kits com estoque ficaram de fora.
export function calcularIndicadoresEstoque(produtos) {
  let custo = new Decimal(0);
  let receita = new Decimal(0);
  let produtosComEstoque = 0;
  let unidades = 0;
  let semCusto = 0;
  let semPreco = 0;
  let estoqueNegativo = 0;
  let kitsFora = 0;

  for (const produto of produtos) {
    if (produto.tipo === "COMPOSICAO") {
      if (produto.estoque > 0) kitsFora++;
      continue;
    }
    if (produto.estoque < 0) estoqueNegativo++;
    if (produto.estoque <= 0) continue;
    produtosComEstoque++;
    unidades += produto.estoque;
    if (produto.custo == null) semCusto++;
    else custo = custo.plus(new Decimal(produto.custo).times(produto.estoque));
    if (produto.precoVenda == null) semPreco++;
    else receita = receita.plus(new Decimal(produto.precoVenda).times(produto.estoque));
  }

  return {
    custo: custo.toFixed(2),
    receita: receita.toFixed(2),
    produtosComEstoque,
    unidades,
    semCusto,
    semPreco,
    estoqueNegativo,
    kitsFora,
  };
}

export function formatarReais(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

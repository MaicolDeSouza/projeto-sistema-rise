/**
 * Regras do modulo Compras (spec 2026-10-26-modulo-compras-design.md), SEM imports: a tela, o servidor, o PDF e o
 * teste leem as MESMAS contas. Se cada um tivesse a sua, o total da tela poderia divergir do PDF que vai ao fornecedor.
 *
 * Dinheiro em centavos inteiros: em ponto flutuante 21,75 x 215 x 10% perde o meio-centavo e o arredondamento muda.
 */

/** Status em que o pedido ja foi ao fornecedor e o que falta lancar conta como estoque a caminho. */
export const STATUS_A_CAMINHO = ["ENVIADO", "PARCIAL"];
/** Status em que o pedido ainda esta aberto (o produto ganha o carrinho na lista do minimo). */
export const STATUS_ABERTOS = ["RASCUNHO", "ENVIADO", "PARCIAL"];

/** Situacoes em que o pedido pode ser excluido (lixeira da lista): nada foi ao fornecedor, ou foi e voltou cancelado. */
export const PODE_EXCLUIR = ["RASCUNHO", "CANCELADO"];

export const PROXIMOS_STATUS = {
  RASCUNHO: ["ENVIADO", "CANCELADO"],
  ENVIADO: ["PARCIAL", "FINALIZADO", "CANCELADO"],
  // Parcial nao cancela (decisao do dono): ja ha estoque lancado; o caminho e finalizar com o que chegou.
  PARCIAL: ["ENVIADO", "FINALIZADO"],
  FINALIZADO: [],
  CANCELADO: [],
};

const centavos = (valor) => Math.round((Number(valor) || 0) * 100);
const reais = (emCentavos) => emCentavos / 100;

/** "PC-0005"; acima de 9999 cresce sem cortar. */
export function numeroDoPedido(numero) {
  return `PC-${String(numero).padStart(4, "0")}`;
}

/**
 * Um campo so para o desconto: "5%" e percentual, "50" ou "50,5" e valor em reais. Vazio = sem desconto.
 * @returns {{ tipo: "PERCENTUAL"|"VALOR", valor: number } | { erro: string }}
 */
export function lerDesconto(texto) {
  const limpo = String(texto ?? "").trim().replace(/\s+/g, "");
  if (!limpo) return { tipo: "VALOR", valor: 0 };
  const percentual = limpo.endsWith("%");
  const corpo = percentual ? limpo.slice(0, -1) : limpo;
  // Com virgula, o ponto e milhar ("1.000,50"); sem virgula, o ponto e o decimal ("50.5").
  const numero = Number(corpo.includes(",") ? corpo.replace(/\./g, "").replace(",", ".") : corpo);
  if (!Number.isFinite(numero) || numero < 0) return { erro: "Informe o desconto em R$ (50) ou em % (5%)." };
  if (percentual && numero > 100) return { erro: "O desconto em % vai até 100%." };
  return { tipo: percentual ? "PERCENTUAL" : "VALOR", valor: numero };
}

/** O total de uma linha (quantidade x preco unitario), sem o IPI. Item sem preco vale zero. */
export function totalDoItem({ quantidade, precoUnitario }) {
  // O unitario tem ate 4 casas (R$ 0,0385): multiplica antes de arredondar ao centavo.
  return reais(Math.round((Number(quantidade) || 0) * (Number(precoUnitario) || 0) * 100));
}

/**
 * Os totais do pedido. O desconto percentual incide sobre os produtos; o total nunca fica negativo.
 * @returns {{ produtos: number, ipi: number, desconto: number, total: number, numeroDeItens: number, somaDasQuantidades: number }}
 */
export function totaisDoPedido({ itens = [], icmsSt = 0, descontoTipo = null, descontoValor = 0, frete = 0, entrada = 0 }) {
  let produtos = 0;
  let ipi = 0;
  let somaDasQuantidades = 0;
  for (const item of itens) {
    const linha = centavos(totalDoItem(item));
    produtos += linha;
    ipi += Math.round((linha * (Number(item.ipiPercentual) || 0)) / 100);
    somaDasQuantidades += Number(item.quantidade) || 0;
  }
  const desconto =
    descontoTipo === "PERCENTUAL" ? Math.round((produtos * (Number(descontoValor) || 0)) / 100) : centavos(descontoValor);
  const total = Math.max(0, produtos + ipi + centavos(icmsSt) + centavos(frete) - desconto);
  // Entrada: o que ja foi pago ao fazer o pedido (pedido do dono em 26/10/2026). O resto e o "falta pagar".
  const pago = centavos(entrada);
  return {
    produtos: reais(produtos),
    ipi: reais(ipi),
    desconto: reais(desconto),
    total: reais(total),
    entrada: reais(pago),
    faltaPagar: reais(Math.max(0, total - pago)),
    numeroDeItens: itens.length,
    somaDasQuantidades,
  };
}

/** Quanto do item ainda nao foi lancado no estoque. */
export function faltaLancar({ quantidade, quantidadeLancada }) {
  return Math.max(0, (Number(quantidade) || 0) - (Number(quantidadeLancada) || 0));
}

/** O estoque a caminho de UM produto: o que falta lancar dos itens de pedidos enviados ou parciais. */
export function aCaminho(itens = []) {
  return itens.filter((item) => STATUS_A_CAMINHO.includes(item.status)).reduce((soma, item) => soma + faltaLancar(item), 0);
}

/**
 * Entra na lista "abaixo do estoque minimo"? So produto conferido, ativo, simples (o estoque do kit e das pecas) e
 * com minimo cadastrado, cujo estoque mais o que ja esta a caminho fica abaixo do minimo.
 */
export function entraNaListaDeMinimo(produto, aCaminhoDoProduto = 0) {
  if (!produto?.conferido || !produto.ativo || produto.tipo !== "SIMPLES") return false;
  // Produto montado com pecas proprias (26/10/2026) se repoe produzindo, nao comprando; as pecas dele seguem na lista.
  if (produto.pecasProprias) return false;
  if (produto.estoqueMinimo === null || produto.estoqueMinimo === undefined) return false;
  return (Number(produto.estoque) || 0) + (Number(aCaminhoDoProduto) || 0) < produto.estoqueMinimo;
}

/** Quantidade que o popup sugere (decisao do dono em 26/10/2026: o maximo cheio); sem maximo, o minimo. */
export function quantidadeSugerida({ estoqueMinimo, estoqueMaximo }) {
  return estoqueMaximo ?? estoqueMinimo ?? 1;
}

/**
 * O carrinho do produto na lista do minimo: azul se so esta em rascunho, verde se algum pedido ja foi enviado.
 * @param {{ status: string, numero: number, fornecedor: string }[]} itens os itens do produto em pedidos
 */
export function estadoDoCarrinho(itens = []) {
  const abertos = itens.filter((item) => STATUS_ABERTOS.includes(item.status));
  if (abertos.length === 0) return null;
  const enviados = abertos.filter((item) => STATUS_A_CAMINHO.includes(item.status));
  const descreve = (item) => `${numeroDoPedido(item.numero)} (${item.fornecedor})`;
  const pedidos = abertos.map((item) => ({ numero: item.numero, status: item.status, fornecedor: item.fornecedor }));
  if (enviados.length > 0) return { cor: "verde", texto: `Enviado: ${enviados.map(descreve).join(", ")}`, pedidos };
  return { cor: "azul", texto: `No rascunho ${abertos.map(descreve).join(", ")}`, pedidos };
}

/**
 * O preco com que o item nasce. O `precoFornecedor` do vinculo ja vem COM impostos da varredura (23/10/2026): partir
 * dele e somar o IPI cobraria o IPI duas vezes. Quando a coleta traz o IPI, a linha parte do preco SEM imposto dela e
 * guarda o percentual; senao, o preco do vinculo e IPI zero.
 */
export function precoInicialDoItem({ precoFornecedor, coletado }) {
  const ipi = (coletado?.impostos ?? []).find((imposto) => /^ipi$/i.test(String(imposto?.nome ?? "")));
  if (ipi && typeof coletado.precoNormal === "number" && Number.isFinite(coletado.precoNormal)) {
    return { precoUnitario: coletado.precoNormal, ipiPercentual: Number(ipi.percentual) || 0 };
  }
  const preco = precoFornecedor === null || precoFornecedor === undefined ? null : Number(precoFornecedor);
  return { precoUnitario: Number.isFinite(preco) ? preco : null, ipiPercentual: 0 };
}

export function podeIrPara(de, para) {
  return (PROXIMOS_STATUS[de] ?? []).includes(para);
}

/** Depois de lancar ou desfazer: algum item com lancamento deixa o pedido parcial; nenhum, volta a enviado. */
export function statusDepoisDeLancar(status, itensDepois = []) {
  if (!STATUS_A_CAMINHO.includes(status)) return status;
  return itensDepois.some((item) => (Number(item.quantidadeLancada) || 0) > 0) ? "PARCIAL" : "ENVIADO";
}

/** Todos os itens chegaram por inteiro (o editor pergunta se finaliza; nunca finaliza sozinho). */
export function todosLancados(itens = []) {
  return itens.length > 0 && itens.every((item) => faltaLancar(item) === 0);
}

/** A quantidade que chegou: inteiro, ao menos 1, no maximo o que falta lancar. */
export function validarQuantidadeDeLancamento(valor, falta) {
  const texto = String(valor ?? "").trim();
  const numero = Number(texto);
  if (!texto || !Number.isInteger(numero) || numero < 1) return { ok: false, erro: "Informe a quantidade que chegou, em número inteiro." };
  if (numero > falta) return { ok: false, erro: falta === 0 ? "Este item já foi lançado por inteiro." : `Faltam só ${falta} para lançar.` };
  return { ok: true, quantidade: numero };
}

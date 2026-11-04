import { IMPOSTO_PADRAO, lucroLiquido } from "@/lib/margem";
import { custosDoAnuncio } from "@/lib/canaisDeVenda/ml/custos";

/**
 * Lucro estimado, lucro real e a devolucao de um pedido (spec 5.6). Puro: quem le o banco e o ML e a Tarefa 8/10.
 *
 * A formula e a mesma de `custosDoAnuncio`: lucro = receita − comissao − tarifaFixa − frete − imposto − custo, com a
 * receita = total dos produtos (o frete cobrado do comprador nao entra; o frete pago entra como custo). A estimativa e
 * congelada na primeira leitura e nunca recalculada; o real e refeito a cada leitura ate o lucro fechar.
 * Cada parcela sai arredondada a 2 casas, como no editor, para a aba Lucro bater centavo a centavo com ele.
 */

/** Tolerancia da divergencia: R$ 1,00 ou 5% do estimado, o que for maior. */
export const TOLERANCIA = { reais: 1, fracao: 0.05 };

const dinheiro = (valor) => Math.round((Number(valor ?? 0) + Number.EPSILON) * 100) / 100;
const numeroOuNulo = (valor) => (valor === undefined || valor === null || valor === "" || !Number.isFinite(Number(valor)) ? null : Number(valor));

function receitaDe(itens, totais) {
  const doPedido = numeroOuNulo(totais?.totalProdutos);
  if (doPedido !== null) return dinheiro(doPedido);
  if (itens.length > 0) return dinheiro(itens.reduce((soma, item) => soma + Number(item?.total ?? 0), 0));
  return dinheiro(totais?.total ?? 0);
}

/** Soma do custo congelado; null quando algum item nao tem custo (o lucro desse pedido fica em aberto). */
function custoDe(itens) {
  let soma = 0;
  for (const item of itens) {
    const unitario = numeroOuNulo(item?.custoUnitarioCongelado);
    if (unitario === null) return null;
    soma += unitario * Number(item?.quantidade ?? 0);
  }
  return dinheiro(soma);
}

const lista = (valor) => (Array.isArray(valor) ? valor : []);

/**
 * A estimativa (o numero que o editor mostrava no dia da venda). ML: `custosDoAnuncio` por item, com as taxas lidas
 * do anuncio (`custosML = { percentual, tarifaFixa, frete }`), vezes a quantidade. LI e Bling: o "Lucro na loja"
 * (`lucroLiquido`) por item, mais o frete padrao das Taxas quando o dono o configurar.
 */
export function parcelasDaEstimativa({ origem, itens, totais, custosML = null, taxas = null, calculadoEm = new Date() }) {
  const linhas = lista(itens);
  const vazio = { receita: 0, comissao: 0, tarifaFixa: 0, frete: 0, imposto: 0, custo: null, lucro: null, calculadoEm, origem: null };
  if (origem === "MERCADO_LIVRE") {
    if (!custosML) return vazio;
    let comissao = 0;
    let tarifaFixa = 0;
    let frete = 0;
    let imposto = 0;
    let receita = 0;
    let custo = 0;
    let lucro = 0;
    let semCusto = false;
    for (const item of linhas) {
      const quantidade = Number(item?.quantidade ?? 0);
      const unitario = custosDoAnuncio({
        preco: item?.precoUnitario,
        custo: item?.custoUnitarioCongelado,
        percentual: custosML.percentual,
        tarifaFixa: custosML.tarifaFixa,
        frete: custosML.frete,
      });
      if (!unitario) continue;
      receita += Number(item?.precoUnitario ?? 0) * quantidade;
      comissao += unitario.comissao * quantidade;
      tarifaFixa += unitario.tarifaFixa * quantidade;
      frete += unitario.frete * quantidade;
      imposto += unitario.imposto * quantidade;
      if (unitario.lucro === null) semCusto = true;
      else {
        custo += Number(item.custoUnitarioCongelado) * quantidade;
        lucro += unitario.lucro * quantidade;
      }
    }
    return {
      receita: dinheiro(receita),
      comissao: dinheiro(comissao),
      tarifaFixa: dinheiro(tarifaFixa),
      frete: dinheiro(frete),
      imposto: dinheiro(imposto),
      custo: semCusto ? null : dinheiro(custo),
      lucro: semCusto ? null : dinheiro(lucro),
      calculadoEm,
      origem: "editorML",
    };
  }

  // LI e Bling: o "Lucro na loja" do editor (preco liquido de imposto menos o custo), sem taxa.
  const receita = receitaDe(linhas, totais);
  const custo = custoDe(linhas);
  const frete = dinheiro(taxas?.padrao?.frete ?? 0);
  const imposto = dinheiro(receita * IMPOSTO_PADRAO);
  let lucro = 0;
  let semCusto = custo === null;
  for (const item of linhas) {
    const porUnidade = lucroLiquido(Number(item?.precoUnitario), Number(item?.custoUnitarioCongelado));
    if (porUnidade === null) semCusto = true;
    else lucro += porUnidade * Number(item?.quantidade ?? 0);
  }
  return {
    receita,
    comissao: 0,
    tarifaFixa: 0,
    frete,
    imposto,
    custo,
    lucro: semCusto ? null : dinheiro(lucro - frete),
    calculadoEm,
    origem: "lucroNaLoja",
  };
}

/** A taxa de uma forma de pagamento nas Taxas do canal (lista `[{ tipo, percentual, fixa }]` ou objeto por tipo). */
function taxaDoPagamento(taxas, tipo) {
  const chave = String(tipo ?? "").toLowerCase();
  if (!chave) return null;
  const pagamento = taxas?.pagamento;
  if (Array.isArray(pagamento)) return pagamento.find((t) => String(t?.tipo ?? "").toLowerCase() === chave) ?? null;
  if (pagamento && typeof pagamento === "object") return pagamento[chave] ?? pagamento[tipo] ?? null;
  return null;
}

/**
 * O lucro real com o que a origem ja contou: comissao do pedido (ML) ou da taxa cadastrada (LI), frete do envio, da
 * etiqueta ou digitado (Bling). Parcela que a origem ainda nao deu fica "estimado", com o valor da estimativa, e o
 * lucro nao fecha enquanto houver uma.
 */
export function parcelasDoReal({ origem, itens, totais, envio = {}, pagamento = [], custoDoFreteManual = null, taxas = null, estimativa = {} }) {
  const linhas = lista(itens);
  const receita = receitaDe(linhas, totais);
  const custo = custoDe(linhas);
  const imposto = dinheiro(receita * IMPOSTO_PADRAO);
  const fontes = {};
  let comissao = 0;
  let tarifaFixa = 0;
  let frete = 0;

  if (origem === "MERCADO_LIVRE") {
    comissao = dinheiro(linhas.reduce((soma, item) => soma + Number(item?.comissao ?? 0), 0));
    fontes.comissao = "pedido";
    const doEnvio = numeroOuNulo(envio?.custoDoVendedor);
    if (doEnvio !== null && envio?.fonteDoCusto && envio.fonteDoCusto !== "estimado") {
      frete = dinheiro(doEnvio);
      fontes.frete = envio.fonteDoCusto;
    } else {
      frete = dinheiro(estimativa?.frete ?? 0);
      fontes.frete = "estimado";
    }
  } else if (origem === "LOJA_INTEGRADA") {
    const tipo = lista(pagamento)[0]?.tipo ?? lista(pagamento)[0]?.forma ?? null;
    const taxa = taxaDoPagamento(taxas, tipo);
    if (taxa) {
      // A taxa do meio de pagamento incide sobre o que o comprador pagou (produtos + frete).
      comissao = dinheiro(Number(totais?.total ?? receita) * Number(taxa.percentual ?? 0) + Number(taxa.fixa ?? 0));
      fontes.comissao = "config";
    } else {
      comissao = dinheiro(estimativa?.comissao ?? 0);
      fontes.comissao = "estimado";
    }
    const daEtiqueta = numeroOuNulo(envio?.custoDoVendedor);
    if (daEtiqueta !== null && envio?.fonteDoCusto && envio.fonteDoCusto !== "estimado") {
      frete = dinheiro(daEtiqueta);
      fontes.frete = envio.fonteDoCusto;
    } else {
      frete = dinheiro(estimativa?.frete ?? 0);
      fontes.frete = "estimado";
    }
  } else {
    fontes.comissao = "pedido";
    const manual = numeroOuNulo(custoDoFreteManual);
    if (manual !== null) {
      frete = dinheiro(manual);
      fontes.frete = "manual";
    } else {
      frete = dinheiro(estimativa?.frete ?? 0);
      fontes.frete = "estimado";
    }
  }

  const lucro = custo === null ? null : dinheiro(receita - comissao - tarifaFixa - frete - imposto - custo);
  return { receita, comissao, tarifaFixa, frete, imposto, custo, lucro, fontes };
}

/** O real de um pedido devolvido no ML: tudo sai do balanco e so o frete de retorno pago pelo vendedor fica, como prejuizo. */
export function devolvido(custoDoRetorno) {
  const frete = dinheiro(custoDoRetorno ?? 0);
  return { receita: 0, comissao: 0, tarifaFixa: 0, frete, imposto: 0, custo: 0, lucro: dinheiro(-frete), fontes: { frete: "envio" } };
}

/** O real fugiu da estimativa alem da tolerancia; so compara quando os dois existem. */
export function lucroDivergente(estimado, real) {
  const a = numeroOuNulo(estimado);
  const b = numeroOuNulo(real);
  if (a === null || b === null) return false;
  return Math.abs(b - a) > Math.max(TOLERANCIA.reais, TOLERANCIA.fracao * Math.abs(a));
}

/** Fecha quando o pedido chegou (ENTREGUE/FINALIZADO) e nenhuma parcela do real e estimada. */
export function lucroFechado({ status, real }) {
  if (status !== "ENTREGUE" && status !== "FINALIZADO") return false;
  return !Object.values(real?.fontes ?? {}).some((fonte) => fonte === "estimado");
}

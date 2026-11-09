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
      // Por KIT vendido (09/11/2026): a `quantidade` e em unidades do produto (20 no "Kit de 20"), e o preco e o do kit.
      // Multiplicar o preco do kit pelas 20 unidades deu R$ 243,60 de lucro numa venda de R$ 23,90.
      const { kits, custoDoKit } = porKit(item);
      const unitario = custosDoAnuncio({
        preco: item?.precoUnitario,
        custo: custoDoKit,
        percentual: custosML.percentual,
        tarifaFixa: custosML.tarifaFixa,
        frete: custosML.frete,
      });
      if (!unitario) continue;
      receita += Number(item?.precoUnitario ?? 0) * kits;
      comissao += unitario.comissao * kits;
      tarifaFixa += unitario.tarifaFixa * kits;
      frete += unitario.frete * kits;
      imposto += unitario.imposto * kits;
      if (unitario.lucro === null) semCusto = true;
      else {
        custo += custoDoKit * kits;
        lucro += unitario.lucro * kits;
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
      porKit: true,
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
    const { kits, custoDoKit } = porKit(item);
    const doKit = custoDoKit === null ? null : lucroLiquido(Number(item?.precoUnitario), custoDoKit);
    if (doKit === null) semCusto = true;
    else lucro += doKit * kits;
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
    porKit: true,
  };
}

/**
 * Quantos kits a linha vendeu e o custo de um kit (09/11/2026). `quantidadeDoKit` 1 (ou ausente) e o item comum: um kit
 * de uma unidade. Custo nulo continua nulo (o lucro fica em aberto).
 */
function porKit(item) {
  const unidades = Math.max(1, Math.round(Number(item?.quantidadeDoKit ?? 1)) || 1);
  const kits = Number(item?.quantidade ?? 0) / unidades;
  const custo = item?.custoUnitarioCongelado;
  return { kits, custoDoKit: custo === null || custo === undefined || custo === "" ? null : Number(custo) * unidades };
}

/**
 * A estimativa gravada ainda vale? A de um pedido com kit feita antes de 09/11/2026 (sem `porKit`) multiplicava o preco do
 * kit pelas unidades e e refeita na proxima leitura; o resto continua congelado como sempre.
 */
export function estimativaValida(estimativa, itens) {
  if (!estimativa?.origem) return false;
  const temKit = lista(itens).some((item) => Number(item?.quantidadeDoKit ?? 1) > 1);
  return !temKit || estimativa.porKit === true;
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

/**
 * A estimativa do pedido do ML pela CONTA DO EDITOR guardada (pedido do dono em 09/11/2026, Opcao 2: "quero saber se fizemos
 * o calculo do custo errado comparando com o que recebemos"). `contas[i]` e a conta do item i (`ContaDoEditorML`: preco,
 * percentual, tarifaFixa, frete e o custo de um kit), e cada linha conta por KIT vendido. Uma linha sem conta deixa o pedido
 * sem estimativa (null): metade da conta pareceria lucro planejado.
 */
export function estimativaPelasContas({ itens, contas, calculadoEm = new Date() }) {
  const linhas = lista(itens);
  if (linhas.length === 0 || !Array.isArray(contas) || contas.length !== linhas.length || contas.some((conta) => !conta)) return null;
  let receita = 0;
  let comissao = 0;
  let tarifaFixa = 0;
  let frete = 0;
  let imposto = 0;
  let custo = 0;
  let lucro = 0;
  let semCusto = false;
  for (const [indice, item] of linhas.entries()) {
    const conta = contas[indice];
    const { kits } = porKit(item);
    const custoDoKit = numeroOuNulo(conta.custoDoKit);
    const doKit = custosDoAnuncio({
      preco: Number(conta.preco),
      custo: custoDoKit,
      percentual: Number(conta.percentual),
      tarifaFixa: Number(conta.tarifaFixa),
      frete: Number(conta.frete),
    });
    if (!doKit) return null;
    receita += Number(conta.preco) * kits;
    comissao += doKit.comissao * kits;
    tarifaFixa += doKit.tarifaFixa * kits;
    frete += doKit.frete * kits;
    imposto += doKit.imposto * kits;
    if (doKit.lucro === null || custoDoKit === null) semCusto = true;
    else {
      custo += custoDoKit * kits;
      lucro += doKit.lucro * kits;
    }
  }
  const datas = contas.map((conta) => new Date(conta.criadoEm).getTime()).filter(Number.isFinite);
  return {
    receita: dinheiro(receita),
    comissao: dinheiro(comissao),
    tarifaFixa: dinheiro(tarifaFixa),
    frete: dinheiro(frete),
    imposto: dinheiro(imposto),
    custo: semCusto ? null : dinheiro(custo),
    lucro: semCusto ? null : dinheiro(lucro),
    calculadoEm,
    origem: "contaDoEditor",
    porKit: true,
    contaEm: datas.length > 0 ? new Date(Math.max(...datas)).toISOString() : null,
  };
}

/**
 * O aceite da divergencia (Tarefa 7, 09/11/2026) ainda vale? Vale enquanto o lucro estimado, o real e o liquido do Mercado
 * Pago forem os mesmos do momento do aceite (ao centavo); um deles mudou, e divergencia nova e o "!" volta.
 */
export function divergenciaAceitaVale(aceite, { lucroEstimado, lucroReal, liquidoMP }) {
  if (!aceite) return false;
  const igual = (a, b) => {
    const x = numeroOuNulo(a);
    const y = numeroOuNulo(b);
    return x === null || y === null ? x === y : Math.round(x * 100) === Math.round(y * 100);
  };
  return igual(aceite.lucroEstimado, lucroEstimado) && igual(aceite.lucroReal, lucroReal) && igual(aceite.liquidoMP, liquidoMP);
}

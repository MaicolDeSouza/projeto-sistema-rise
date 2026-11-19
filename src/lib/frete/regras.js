/**
 * Regras puras do frete (spec 2026-11-18-modulo-de-frete-design.md, 5.3): nome e medidas da caixa, peso do pacote,
 * caixa sugerida, valor a cobrar e a lista de servicos. Sem banco e sem rede: a tela, a cotacao e os testes usam as
 * mesmas contas.
 *
 * Item: { pesoKg, alturaCm, larguraCm, comprimentoCm, quantidade }. Caixa: a linha de CaixaDeEnvio com numeros.
 */

/** A caixa sugerida usa no maximo 70% do volume interno: o resto e o plastico bolha e o papel. */
export const FATOR_DE_OCUPACAO = 0.7;
/** Sem a medida interna cadastrada, vale a externa menos 0,5 cm de cada lado (a espessura do papelao). */
export const FOLGA_INTERNA_CM = 0.5;

// Ponto flutuante: 0,15 x 1,1 da 0,16500000000000004, e subir no grama direto daria 0,166. Seis casas antes do
// arredondamento final apagam esse resto.
const limpo = (valor) => Number(Number(valor).toFixed(6));
const positivo = (valor) => valor !== null && valor !== "" && Number.isFinite(Number(valor)) && Number(valor) > 0;
const quantidadeDe = (item) => (positivo(item?.quantidade) ? Number(item.quantidade) : 1);
const decimalBr = (numero) => String(limpo(numero)).replace(".", ",");

/** "CX 16x11x3": o nome e a propria medida (comprimento x largura x altura), para nunca ficar ambiguo. */
export function nomeDaCaixa({ comprimentoCm, larguraCm, alturaCm }) {
  return `CX ${decimalBr(comprimentoCm)}x${decimalBr(larguraCm)}x${decimalBr(alturaCm)}`;
}

export function medidasInternas(caixa) {
  const lado = (interno, externo) => (positivo(interno) ? Number(interno) : limpo(Number(externo) - FOLGA_INTERNA_CM));
  return {
    comprimentoCm: lado(caixa.comprimentoInternoCm, caixa.comprimentoCm),
    larguraCm: lado(caixa.larguraInternaCm, caixa.larguraCm),
    alturaCm: lado(caixa.alturaInternaCm, caixa.alturaCm),
  };
}

const completo = (item) => positivo(item?.pesoKg) && positivo(item?.alturaCm) && positivo(item?.larguraCm) && positivo(item?.comprimentoCm);

/** Quantos itens nao tem peso ou alguma das tres medidas: sem eles o Rise nao sugere caixa nem peso. */
export function itensIncompletos(itens) {
  return (itens ?? []).filter((item) => !completo(item)).length;
}

/**
 * (peso dos itens x quantidade + caixa vazia) x (1 + peso extra %), em kg, subindo no grama: cotar um grama a menos
 * pode virar cobranca de diferenca depois. Item sem peso: null (o operador digita).
 */
export function pesoDoPacote({ itens, caixa, percentualDePesoExtra }) {
  const lista = itens ?? [];
  if (lista.some((item) => !positivo(item?.pesoKg))) return null;
  const dosItens = lista.reduce((soma, item) => soma + Number(item.pesoKg) * quantidadeDe(item), 0);
  const total = limpo((dosItens + Number(caixa?.pesoVazioKg ?? 0)) * (1 + Number(percentualDePesoExtra ?? 0) / 100));
  return Math.ceil(limpo(total * 1000)) / 1000;
}

const ordenadas = (a, b, c) => [Number(a), Number(b), Number(c)].sort((x, y) => x - y);

/**
 * A menor caixa ativa em que cada item cabe sozinho (as tres medidas ordenadas contra as internas ordenadas) e em que a
 * soma dos volumes nao passa de 70% do volume interno.
 */
export function sugerirCaixa({ itens, caixas }) {
  const lista = itens ?? [];
  if (lista.length === 0 || itensIncompletos(lista) > 0) return { caixa: null, motivo: "ITENS_INCOMPLETOS" };

  const volumeDosItens = lista.reduce(
    (soma, item) => soma + Number(item.alturaCm) * Number(item.larguraCm) * Number(item.comprimentoCm) * quantidadeDe(item),
    0,
  );
  const candidatas = (caixas ?? [])
    .filter((caixa) => caixa.ativo !== false)
    .map((caixa) => {
      const interna = medidasInternas(caixa);
      return {
        caixa,
        lados: ordenadas(interna.alturaCm, interna.larguraCm, interna.comprimentoCm),
        volume: interna.alturaCm * interna.larguraCm * interna.comprimentoCm,
      };
    })
    .sort((a, b) => a.volume - b.volume);

  for (const { caixa, lados, volume } of candidatas) {
    const todosCabem = lista.every((item) => ordenadas(item.alturaCm, item.larguraCm, item.comprimentoCm).every((lado, i) => lado <= lados[i]));
    if (todosCabem && volumeDosItens <= volume * FATOR_DE_OCUPACAO) return { caixa, motivo: null };
  }
  return { caixa: null, motivo: "NAO_CABE" };
}

/** O preco cotado mais o acrescimo de embalagem (R$ 1,00 por padrao, pedido do dono em 18/11/2026). */
export function valorACobrar(preco, acrescimo) {
  return Math.round(limpo((Number(preco) + Number(acrescimo ?? 0)) * 100)) / 100;
}

/** Os que atendem, do mais barato ao mais caro e com o valor a cobrar; os recusados, com o motivo do provedor. */
export function separarServicos(lista, acrescimo) {
  const atende = (servico) => !servico.motivoDaRecusa && servico.preco !== null && servico.preco !== undefined;
  return {
    atendem: (lista ?? [])
      .filter(atende)
      .sort((a, b) => a.preco - b.preco)
      .map((servico) => ({ ...servico, valorACobrar: valorACobrar(servico.preco, acrescimo) })),
    recusados: (lista ?? []).filter((servico) => !atende(servico)),
  };
}

const moeda = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** O texto que o operador cola no WhatsApp do cliente. */
export function textoDaCotacao({ cidadeDestino, servicos }) {
  const titulo = cidadeDestino ? `Frete para ${cidadeDestino}:` : "Frete:";
  const linhas = (servicos ?? []).map((servico) => {
    const prazo = servico.prazoDias ? `, ${servico.prazoDias} ${servico.prazoDias === 1 ? "dia útil" : "dias úteis"}` : "";
    return `${servico.transportadora} ${servico.servicoNome}: R$ ${moeda.format(servico.valorACobrar ?? servico.preco)}${prazo}`;
  });
  return [titulo, ...linhas].join("\n");
}

/** ENV-0001: o numero do envio que o operador ve. Aqui, e nao em envios.js, porque a tela tambem o usa. */
export function numeroDoEnvio(numero) {
  return `ENV-${String(numero).padStart(4, "0")}`;
}

/** "0,3", "1.250,00" e "0.3" viram numero; vazio, negativo e texto viram null (o campo mostra o erro). */
export function lerDecimal(texto) {
  if (typeof texto === "number") return Number.isFinite(texto) && texto >= 0 ? texto : null;
  const bruto = String(texto ?? "")
    .trim()
    .replace(/^R\$\s*/i, "");
  if (!bruto) return null;
  const normal = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
  if (!/^\d+(\.\d+)?$/.test(normal)) return null;
  return Number(normal);
}

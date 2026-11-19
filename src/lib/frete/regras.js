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

// ---------------------------------------------------------------------------
// Fase 2: compra, rastreio e aviso
// ---------------------------------------------------------------------------

/** O status do Melhor Envio no do Rise. O que nao esta aqui e "desconhecido": o envio fica como estava, com o aviso. */
const STATUS_DO_PROVEDOR = {
  pending: "RASCUNHO",
  released: "A_POSTAR",
  generated: "A_POSTAR",
  posted: "POSTADO",
  delivered: "ENTREGUE",
  undelivered: "NAO_ENTREGUE",
  paused: "COM_PROBLEMA",
  suspended: "COM_PROBLEMA",
  canceled: "CANCELADO",
  expired: "EXPIRADO",
};

export function statusDoProvedor(statusME) {
  const status = STATUS_DO_PROVEDOR[String(statusME ?? "").toLowerCase()] ?? null;
  return { status, desconhecido: status === null };
}

/** A Azul Cargo so se cota pela API (documentacao do Melhor Envio, 19/11/2026): a etiqueta dela sai so pelo painel. */
export function servicoCompravel({ transportadora }) {
  if (/azul/i.test(String(transportadora ?? ""))) return { ok: false, motivo: "A Azul Cargo não se compra pela API: escolha outro serviço." };
  return { ok: true, motivo: null };
}

const reais = (valor) => `R$ ${moeda.format(Number(valor ?? 0))}`;
const chaveValida = (chave) => String(chave ?? "").replace(/\D/g, "").length === 44;

/**
 * Por que a etiqueta ainda nao pode ser comprada, na ordem em que o operador resolve. Lista vazia = pode. A tela usa
 * para desabilitar o botao e o servidor confere de novo antes de gastar o saldo.
 */
export function motivosParaNaoComprar({ envio, saldo, travaLiberada }) {
  if (!travaLiberada) return ["A compra de etiquetas está travada (FRETE_COMPRA)."];
  if (envio?.status !== "RASCUNHO") return ["Esta etiqueta já foi comprada."];
  const motivos = [];
  if (!envio.medidaConferida) motivos.push("Confira a caixa e o peso medidos antes de comprar.");
  if (envio.tipoDeDocumento === "DECLARACAO") {
    if (!Array.isArray(envio.itensDaDeclaracao) || envio.itensDaDeclaracao.length === 0) motivos.push("Declaração de conteúdo sem itens.");
  } else if (envio.tipoDeDocumento !== "NFE" || !chaveValida(envio.chaveNfe)) {
    motivos.push("Informe a chave da NF-e ou use declaração de conteúdo.");
  }
  const compravel = servicoCompravel({ transportadora: envio.transportadoraNome });
  if (!compravel.ok) motivos.push(compravel.motivo);
  if (Number(saldo ?? 0) < Number(envio.precoCotado ?? 0)) motivos.push(`Saldo insuficiente: ${reais(saldo)} na carteira para ${reais(envio.precoCotado)}.`);
  return motivos;
}

export function linkDoRastreio(codigo) {
  const limpo = String(codigo ?? "").trim();
  return limpo ? `https://melhorrastreio.com.br/rastreio/${encodeURIComponent(limpo)}` : null;
}

/** "2026-11-19 14:05:00" do Melhor Envio e horario de Brasilia (sem fuso no texto). */
export function dataDoProvedor(texto) {
  const bruto = String(texto ?? "").trim();
  if (!bruto) return null;
  const data = new Date(`${bruto.replace(" ", "T")}${/[zZ]|[+-]\d\d:?\d\d$/.test(bruto) ? "" : "-03:00"}`);
  return Number.isNaN(data.getTime()) ? null : data;
}

const EVENTOS = [
  ["paid_at", "PAGO", "Etiqueta paga"],
  ["generated_at", "A_POSTAR", "Etiqueta gerada"],
  ["posted_at", "POSTADO", "Postado"],
  ["delivered_at", "ENTREGUE", "Entregue"],
  ["undelivered_at", "NAO_ENTREGUE", "Não entregue"],
  ["canceled_at", "CANCELADO", "Cancelado"],
  ["expired_at", "EXPIRADO", "Expirado"],
];

/** O rastreio do Melhor Envio so traz datas: a linha do tempo do Rise sai delas. */
export function eventosDasDatas(rastreio) {
  return EVENTOS.map(([campo, status, descricao]) => ({ data: dataDoProvedor(rastreio?.[campo]), status, descricao }))
    .filter((evento) => evento.data)
    .sort((a, b) => a.data - b.data)
    .map(({ data, status, descricao }) => ({ em: data.toISOString(), status, descricao }));
}

/** A etiqueta gerada vale 20 dias para postar (documentacao do Melhor Envio). */
export function validadeDaEtiqueta(geradoEm) {
  return new Date(new Date(geradoEm).getTime() + 20 * 24 * 60 * 60 * 1000);
}

/** Usados quando a configuracao tem o campo vazio. Marcadores: {cliente} {pedido} {transportadora} {servico} {rastreio} {link}. */
export const TEXTOS_DO_AVISO = {
  assunto: "Seu pedido {pedido} foi postado",
  email:
    "Olá, {cliente}!\n\nSeu pedido {pedido} foi postado pela {transportadora} ({servico}).\nCódigo de rastreio: {rastreio}\nAcompanhe a entrega: {link}\n\nObrigado pela compra!\nEquipe 4hobby",
  whatsapp: "Olá, {cliente}! Seu pedido {pedido} foi postado pela {transportadora}. Código de rastreio: {rastreio}. Acompanhe: {link}",
};

/** Troca os marcadores; o que nao tem dado some, e o espaco que sobra nao fica dobrado. */
export function preencherTexto(modelo, dados) {
  return String(modelo ?? "")
    .replace(/\{(\w+)\}/g, (_, chave) => String(dados?.[chave] ?? ""))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:!?])/g, "$1")
    .trim();
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

/**
 * Regras das Propostas para cliente (spec 2026-11-12-propostas-para-cliente-design.md). So contas e listas, sem banco:
 * a tela, o servidor, o PDF e o teste leem as MESMAS contas, para o total da tela nunca divergir do PDF do cliente.
 *
 * Dinheiro em centavos inteiros (a mesma razao de compras/regras.js: ponto flutuante perde o meio-centavo).
 */

export { lerDesconto } from "../compras/regras.js";

export const FUSO = "America/Sao_Paulo";

/** Primeiro numero de proposta (decisao do dono: 2026, 2027, 2028... sem prefixo de ano). */
export const PRIMEIRO_NUMERO = 2026;
/** Validade padrao (decisao do dono: 15 dias, editavel em cada proposta). */
export const VALIDADE_PADRAO_DIAS = 15;
export const GARANTIA_PADRAO = "Garantia de 90 dias contra defeito de fabricação.";

export const SITUACOES = {
  RASCUNHO: "Rascunho",
  ENVIADA: "Enviada",
  EM_NEGOCIACAO: "Em negociação",
  APROVADA: "Aprovada",
  RECUSADA: "Recusada",
  VENCIDA: "Vencida",
};

/** Cor do ponto da situacao na lista e no topo. */
export const COR_DA_SITUACAO = {
  RASCUNHO: "bg-zinc-400",
  ENVIADA: "bg-sky-500",
  EM_NEGOCIACAO: "bg-amber-500",
  APROVADA: "bg-emerald-500",
  RECUSADA: "bg-red-500",
  VENCIDA: "bg-zinc-600",
};

/** "Aberta" = ainda pode virar venda: e o que conta para o "!" de contato e para vencer sozinha. */
export const SITUACOES_ABERTAS = ["RASCUNHO", "ENVIADA", "EM_NEGOCIACAO"];

/**
 * Para onde cada situacao pode ir pelos botoes. Aprovada e Recusada so "Reabrir" (volta a Em negociacao); Vencida volta
 * a Em negociacao trocando a validade (mudarValidade) ou pelo Reabrir.
 */
export const PROXIMAS_SITUACOES = {
  RASCUNHO: ["ENVIADA", "EM_NEGOCIACAO", "APROVADA", "RECUSADA"],
  ENVIADA: ["EM_NEGOCIACAO", "APROVADA", "RECUSADA"],
  EM_NEGOCIACAO: ["ENVIADA", "APROVADA", "RECUSADA"],
  APROVADA: ["EM_NEGOCIACAO"],
  RECUSADA: ["EM_NEGOCIACAO"],
  VENCIDA: ["EM_NEGOCIACAO"],
};

/** Situacoes em que a proposta nao se edita (so "Reabrir"). */
export const SO_LEITURA = ["APROVADA", "RECUSADA"];

export const MOTIVOS_DE_RECUSA = {
  PRECO: "Preço",
  PRAZO: "Prazo",
  COMPROU_DE_OUTRO: "Comprou de outro",
  DESISTIU: "Desistiu",
  OUTRO: "Outro",
};

/** O tipo de frete com a explicacao curta entre parenteses (pedido do dono), igual na tela e no PDF. */
export const TEXTO_DO_FRETE = {
  CIF: "CIF (frete por nossa conta)",
  FOB: "FOB (frete por conta do cliente)",
  RETIRA: "Cliente retira",
  A_COMBINAR: "A combinar",
};

export const FORMAS_DE_PAGAMENTO = ["PIX", "Boleto", "Cartão de crédito", "Transferência", "Dinheiro", "A combinar"];

/** Unidades da proposta: as do cadastro (lib/unidades.js) e as que o cliente costuma pedir. */
export const UNIDADES_DA_PROPOSTA = ["UN", "PC", "MT", "KG", "CX", "PAR", "RL", "KIT", "HR"];

const centavos = (valor) => Math.round((Number(valor) || 0) * 100);
const reais = (emCentavos) => emCentavos / 100;

/** "Proposta 2026". */
export function numeroDaProposta(numero) {
  return `Proposta ${numero}`;
}

/** Data de hoje (AAAA-MM-DD) em Sao Paulo: perto da meia-noite o UTC ja e "amanha". */
export function hojeEmSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** Soma dias a uma data AAAA-MM-DD sem depender do fuso da maquina. */
export function somarDias(data, dias) {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** Uma coluna @db.Date (Date em UTC meia-noite) ou texto como AAAA-MM-DD; nulo fica nulo. */
export function dataISO(valor) {
  if (!valor) return null;
  if (typeof valor === "string") return valor.slice(0, 10);
  return valor.toISOString().slice(0, 10);
}

/** "12/11/2026". */
export function dataBR(valor) {
  const iso = dataISO(valor);
  if (!iso) return "";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function validadePadrao(hoje = hojeEmSaoPaulo()) {
  return somarDias(hoje, VALIDADE_PADRAO_DIAS);
}

/** Total da linha: quantidade x unitario x (1 - desconto%). O unitario tem 4 casas: multiplica antes de arredondar. */
export function totalDoItem({ quantidade, precoUnitario, descontoPercentual = 0 }) {
  const bruto = (Number(quantidade) || 0) * (Number(precoUnitario) || 0);
  const desconto = Math.min(100, Math.max(0, Number(descontoPercentual) || 0));
  return reais(Math.round(bruto * (1 - desconto / 100) * 100));
}

/**
 * Os totais da proposta. O frete so soma com CIF (no FOB o cliente paga direto a transportadora; Retira e A combinar
 * nao tem valor). O desconto geral incide sobre o subtotal; o total nunca fica negativo. Custo e lucro (markup) so
 * quando TODO item tem custo: com um item sem custo o lucro do total mentiria.
 */
export function totaisDaProposta({ itens = [], descontoTipo = null, descontoValor = 0, fretePorConta = "A_COMBINAR", frete = 0 }) {
  let subtotal = 0;
  let custo = 0;
  let todosComCusto = itens.length > 0;
  for (const item of itens) {
    subtotal += centavos(totalDoItem(item));
    if (item.custoUnitario === null || item.custoUnitario === undefined || item.custoUnitario === "") todosComCusto = false;
    else custo += Math.round((Number(item.quantidade) || 0) * (Number(item.custoUnitario) || 0) * 100);
  }
  const desconto = Math.min(
    subtotal,
    descontoTipo === "PERCENTUAL" ? Math.round((subtotal * (Number(descontoValor) || 0)) / 100) : centavos(descontoValor),
  );
  const freteNoTotal = fretePorConta === "CIF" ? centavos(frete) : 0;
  const total = Math.max(0, subtotal - desconto + freteNoTotal);
  const vendaSemFrete = subtotal - desconto;
  return {
    subtotal: reais(subtotal),
    desconto: reais(desconto),
    frete: reais(freteNoTotal),
    total: reais(total),
    numeroDeItens: itens.length,
    custo: todosComCusto ? reais(custo) : null,
    lucro: todosComCusto ? reais(vendaSemFrete - custo) : null,
    markup: todosComCusto && custo > 0 ? ((vendaSemFrete - custo) / custo) * 100 : null,
  };
}

/** Markup do item (lucro sobre o custo, regra do Rise), com o desconto do item. Sem custo = null. */
export function markupDoItem(item) {
  const custo = Number(item.custoUnitario);
  if (!(custo > 0)) return null;
  const venda = totalDoItem(item) / (Number(item.quantidade) || 1);
  return ((venda - custo) / custo) * 100;
}

/** "Pronta entrega" ou "10 dias úteis". */
export function textoDoPrazo({ prontaEntrega, prazoDiasUteis }) {
  if (prontaEntrega || !(Number(prazoDiasUteis) > 0)) return "Pronta entrega";
  const dias = Number(prazoDiasUteis);
  return `${dias} ${dias === 1 ? "dia útil" : "dias úteis"}`;
}

/** O prazo geral da proposta = o maior dos itens ("Pronta entrega" quando todos sao). */
export function prazoGeral(itens = []) {
  let maior = 0;
  for (const item of itens) if (!item.prontaEntrega && Number(item.prazoDiasUteis) > maior) maior = Number(item.prazoDiasUteis);
  return textoDoPrazo({ prontaEntrega: maior === 0, prazoDiasUteis: maior });
}

export function estaAberta(situacao) {
  return SITUACOES_ABERTAS.includes(situacao);
}

/** O "!" de contato: aberta e a data de contato chegou (hoje ou ja passou). */
export function precisaContato({ situacao, proximoContato }, hoje = hojeEmSaoPaulo()) {
  const data = dataISO(proximoContato);
  return estaAberta(situacao) && Boolean(data) && data <= hoje;
}

/** Vence sozinha: aberta e a validade ja passou (o dia da validade ainda vale). */
export function deveVencer({ situacao, validadeAte }, hoje = hojeEmSaoPaulo()) {
  const data = dataISO(validadeAte);
  return estaAberta(situacao) && Boolean(data) && data < hoje;
}

export function podeIrPara(de, para) {
  return (PROXIMAS_SITUACOES[de] ?? []).includes(para);
}

/** O resumo do pagamento que vai no PDF: "Boleto · 3x · entrada de 30%" + o texto livre. */
export function textoDoPagamento({ condicaoNome, formaPagamento, parcelas, entradaPercentual, pagamentoTexto }) {
  const partes = [];
  if (condicaoNome) partes.push(condicaoNome);
  if (formaPagamento) partes.push(formaPagamento);
  if (Number(parcelas) > 1) partes.push(`${Number(parcelas)}x`);
  if (Number(entradaPercentual) > 0) partes.push(`entrada de ${String(Number(entradaPercentual)).replace(".", ",")}%`);
  const resumo = partes.join(" · ");
  const livre = String(pagamentoTexto ?? "").trim();
  return [resumo, livre].filter(Boolean).join("\n");
}

/** O que falta para gerar o PDF: item sem a descricao do cliente e proposta sem item (o "!" da linha e o motivo do botao). */
export function pendenciasDoPdf({ clienteNome, itens = [], exigeMarcaModelo = false }) {
  const pendencias = [];
  if (!String(clienteNome ?? "").trim()) pendencias.push("Informe o cliente.");
  if (itens.length === 0) pendencias.push("Inclua ao menos um item.");
  const semDescricao = itens.filter((item) => !String(item.descricaoCliente ?? "").trim()).length;
  if (semDescricao) pendencias.push(`${semDescricao} item(ns) sem a descrição do cliente.`);
  // O padrao do cliente pede marca e modelo (SENAI, 13/11/2026): item sem marca ou sem modelo trava o PDF.
  if (exigeMarcaModelo) {
    const semMarca = itens.filter((item) => !String(item.marca ?? "").trim() || !String(item.modelo ?? "").trim()).length;
    if (semMarca) pendencias.push(`${semMarca} item(ns) sem marca ou modelo (o padrão do cliente exige).`);
  }
  return pendencias;
}

/** "Valor para faturamento mínimo: R$ 50,00" (SENAI pede neste formato; 13/11/2026). Sem valor = null. */
export function textoDoFaturamentoMinimo(valor) {
  const numero = Number(valor);
  if (!(numero > 0)) return null;
  return `Valor para faturamento mínimo: ${numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ")}`;
}

/** Link do WhatsApp: telefone em digitos com DDD (lib/telefone.js) e a mensagem. Sem telefone valido = null. */
export function linkDoWhatsApp(telefone, mensagem) {
  const digitos = String(telefone ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return null;
  return `https://wa.me/55${digitos}?text=${encodeURIComponent(mensagem)}`;
}

export function mensagemDoWhatsApp({ numero, nome, link }) {
  const ola = nome ? `Olá, ${String(nome).split(" ")[0]}!` : "Olá!";
  return `${ola} Segue a ${numeroDaProposta(numero)} da 4hobby: ${link}`;
}

// ---------------------------------------------------------------- padroes de proposta (13/11/2026)

/**
 * O que o padrao preenche no formulario da proposta (os nomes dos campos do editor). A validade conta a partir de hoje.
 * Campo vazio no padrao NAO apaga o da proposta (`undefined`): so o que o padrao define e copiado.
 */
export function camposDoPadrao(padrao, { hoje = hojeEmSaoPaulo() } = {}) {
  if (!padrao) return {};
  const campos = {
    padraoId: padrao.id,
    validadeAte: somarDias(hoje, Number(padrao.validadeDias) || 15),
    fretePorConta: padrao.fretePorConta,
  };
  if (padrao.formaPagamento) campos.formaPagamento = padrao.formaPagamento;
  if (padrao.pagamentoTexto) campos.pagamentoTexto = padrao.pagamentoTexto;
  if (padrao.garantia) campos.garantia = padrao.garantia;
  if (padrao.observacoesCliente) campos.observacoesCliente = padrao.observacoesCliente;
  return campos;
}

/** As exigencias do padrao, uma por linha (o painel do editor). */
export function linhasDasExigencias(exigencias) {
  return String(exigencias ?? "")
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);
}

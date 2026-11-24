import { lerEmails } from "@/lib/formularios";
import { FORMAS_DE_PAGAMENTO } from "@/lib/propostas/regras";

/**
 * A aba "Condicoes comerciais" do cadastro do cliente (24/11/2026, dono: "os dados devem ficar no cadastro do cliente junto
 * com suas peculiaridades"). Puro: le os campos do formulario e confere; quem grava e o `salvarCliente`.
 */

const FRETES = ["CIF", "FOB", "A_COMBINAR"];
const INDICADORES = ["CONTRIBUINTE", "ISENTO", "NAO_CONTRIBUINTE"];

const texto = (valor, maximo) => {
  const limpo = String(valor ?? "").trim();
  return limpo ? limpo.slice(0, maximo) : null;
};
const marcado = (valor) => valor === "on" || valor === true || valor === "true";

/**
 * Os campos da aba, com os nomes das colunas do `Cliente`. Vazio grava nulo: salvar a aba vazia zera as condicoes, e a
 * proposta volta a regra geral.
 */
export function lerCondicoesDoFormulario(campos = {}, formData) {
  const erros = {};
  const dados = {};

  const validade = String(campos.propostaValidadeDias ?? "").trim();
  if (validade) {
    const dias = Number(validade);
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) erros.propostaValidadeDias = "Validade de 1 a 365 dias.";
    else dados.propostaValidadeDias = dias;
  }
  dados.propostaValidadeDias ??= null;

  dados.propostaFormaPagamento = texto(campos.propostaFormaPagamento, 60);
  if (dados.propostaFormaPagamento && !FORMAS_DE_PAGAMENTO.includes(dados.propostaFormaPagamento)) {
    erros.propostaFormaPagamento = "Escolha uma forma da lista.";
  }
  dados.propostaPagamentoTexto = texto(campos.propostaPagamentoTexto, 2000);
  dados.propostaFretePorConta = FRETES.includes(campos.propostaFretePorConta) ? campos.propostaFretePorConta : null;
  // Diluir o frete so existe no CIF (a mesma regra da proposta).
  dados.propostaFreteDiluido = dados.propostaFretePorConta === "CIF" && marcado(campos.propostaFreteDiluido);
  dados.propostaGarantia = texto(campos.propostaGarantia, 200);
  dados.propostaAc = texto(campos.propostaAc, 120);
  dados.propostaMarcaModelo = marcado(campos.propostaMarcaModelo);
  dados.propostaAssinar = marcado(campos.propostaAssinar);
  dados.propostaFaturamentoMinimo = marcado(campos.propostaFaturamentoMinimo);
  dados.propostaObservacoes = texto(campos.propostaObservacoes, 4000);
  dados.propostaExigencias = texto(campos.propostaExigencias, 4000);

  dados.notaFiscalObservacao = texto(campos.notaFiscalObservacao, 2000);
  const rastreio = lerEmails(formData, "emailsRastreio");
  if (rastreio.erro) erros.emailsRastreio = rastreio.erro;
  dados.emailsRastreio = rastreio.emails;

  dados.portalUrl = texto(campos.portalUrl, 200);
  if (dados.portalUrl && !/^https?:\/\/\S+$/i.test(dados.portalUrl)) erros.portalUrl = "Use um endereço que começa com http:// ou https://.";
  dados.portalUsuario = texto(campos.portalUsuario, 120);
  dados.portalObservacao = texto(campos.portalObservacao, 2000);

  return { dados, erros };
}

/**
 * Contribuinte de ICMS: so pessoa juridica escolhe; o `ieIsento` antigo segue gravado por ele (o resto do sistema le).
 */
export function indicadorIeDoFormulario(campos = {}, tipoPessoa) {
  if (tipoPessoa !== "JURIDICA") return { indicadorIe: null, ieIsento: false };
  const indicadorIe = INDICADORES.includes(campos.indicadorIe) ? campos.indicadorIe : null;
  return { indicadorIe, ieIsento: indicadorIe === "ISENTO" };
}

/** O `indicadorIe` do contato do Bling: 1 contribuinte, 2 isento de inscricao, 9 nao contribuinte. */
export function indicadorIeDoBling(indicadorIe) {
  return { CONTRIBUINTE: 1, ISENTO: 2, NAO_CONTRIBUINTE: 9 }[indicadorIe] ?? null;
}

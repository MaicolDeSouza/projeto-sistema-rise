/**
 * Os tipos de aviso do Telegram (Rise AI, Entrega C1) e o rotulo de cada um na aba Canais. Sem imports: a tela, o
 * servidor, o worker e o teste leem a mesma lista. Tipo novo entra aqui, em `mensagemDoAviso` (texto.js) e em
 * `avisosDevidos` (avisos.js).
 */

export const TIPOS_DE_AVISO = ["resumoDoDia", "produtoZerou", "orcamento", "varreduraPeloPc", "varreduraFalhou", "saudeDoRise"];

export const ROTULO_DO_AVISO = {
  resumoDoDia: "Resumo do dia às 20h",
  produtoZerou: "Produto que zerou o estoque",
  orcamento: "Orçamento da IA em 80% e 100%",
  varreduraPeloPc: "Varredura pelo PC esperando",
  varreduraFalhou: "Varredura que falhou",
  saudeDoRise: "Saúde do Rise: item em vermelho",
};

/** O que a configuracao de fabrica traz: bot desligado e todos os avisos marcados (ligar o bot ja manda tudo). */
export function telegramPadrao() {
  return { ligado: false, avisos: Object.fromEntries(TIPOS_DE_AVISO.map((tipo) => [tipo, true])) };
}

/**
 * Os tipos de aviso do Telegram (Rise AI, Entrega C1) e o rotulo de cada um na aba Canais. Sem imports: a tela, o
 * servidor, o worker e o teste leem a mesma lista. Tipo novo entra aqui, em `mensagemDoAviso` (texto.js) e em
 * `avisosDevidos` (avisos.js).
 */

export const TIPOS_DE_AVISO = ["resumoDoDia", "produtoZerou", "orcamento", "varreduraPeloPc", "varreduraFalhou", "saudeDoRise", "catalogoML", "novaVenda", "aguardandoPecas", "reclamacaoML", "notaDevolucao"];

export const ROTULO_DO_AVISO = {
  resumoDoDia: "Resumo do dia às 20h",
  // Desde 22/11/2026 (pedido do dono) a lista vai dentro do resumo das 20h; so sai na hora com o resumo desmarcado.
  produtoZerou: "Produto que zerou o estoque (no resumo das 20h)",
  orcamento: "Orçamento da IA em 80% e 100%",
  varreduraPeloPc: "Varredura pelo PC esperando",
  varreduraFalhou: "Varredura que falhou",
  saudeDoRise: "Saúde do Rise: item em vermelho",
  catalogoML: "Anúncio do ML entrou ou saiu do catálogo",
  novaVenda: "Nova venda",
  aguardandoPecas: "Pedido aguardando peças",
  reclamacaoML: "Reclamação aberta no Mercado Livre",
  notaDevolucao: "Devolução postada: emitir a nota de devolução",
};

/** O que a configuracao de fabrica traz: bot desligado e todos os avisos marcados (ligar o bot ja manda tudo). */
export function telegramPadrao() {
  return { ligado: false, avisos: Object.fromEntries(TIPOS_DE_AVISO.map((tipo) => [tipo, true])) };
}

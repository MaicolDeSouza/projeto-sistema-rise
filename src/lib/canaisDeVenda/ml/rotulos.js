/**
 * Rotulos que o editor, a lista e a aba Geral do anuncio ML mostram. Fica aqui, sem "use client",
 * porque a lista e componente de servidor e nao pode importar valor de um arquivo de cliente; e uma
 * copia por tela divergiria no dia em que um texto mudasse.
 */

export const STATUS_ML = {
  RASCUNHO: { rotulo: "Rascunho", tom: "neutro" },
  VALIDADO: { rotulo: "Validado", tom: "info" },
  PUBLICANDO: { rotulo: "Publicando", tom: "alerta" },
  PUBLICADO: { rotulo: "Publicado", tom: "sucesso" },
  ERRO: { rotulo: "Erro", tom: "erro" },
};

const MLB = /^MLB\d+$/;

/** O anuncio no site do ML: o link gravado na publicacao (`permalink`), ou montado pelo MLB. So http(s). */
export function linkDoAnuncioML(idExterno, urlExterna) {
  if (!MLB.test(String(idExterno ?? ""))) return null;
  if (/^https?:\/\//i.test(String(urlExterna ?? ""))) return urlExterna;
  return `https://produto.mercadolivre.com.br/MLB-${String(idExterno).slice(3)}`;
}

/**
 * O anuncio no painel do vendedor (pedido do dono em 25/10/2026): a lista "Anuncios" da conta ja buscando o MLB. A lista e
 * a tela que o ML mantem estavel; o caminho da edicao de um anuncio muda com o tipo dele.
 */
export function linkDoPainelML(idExterno) {
  return MLB.test(String(idExterno ?? "")) ? `https://www.mercadolivre.com.br/anuncios/lista?search=${idExterno}` : null;
}

/// Anuncio de kit pausado no ML a espera do kit no Bling (status PUBLICANDO, etapa `kit_bling` com erro).
export const AGUARDANDO_BLING = { rotulo: "Aguardando o Bling", tom: "alerta" };

/// Publicado sem estoque: pausado no ML ate o estoque chegar, e o worker o ativa (Opcao 2 do dono em 24/10/2026).
export const AGUARDANDO_ESTOQUE = { rotulo: "Pausado: aguardando estoque", tom: "alerta" };

/** O selo de estado de uma linha de anuncio (lista e janela do produto): o publicado sem estoque diz que esta pausado. */
export function seloDoAnuncioML(anuncio) {
  if (anuncio?.status === "PUBLICADO" && anuncio?.aguardandoEstoque) return AGUARDANDO_ESTOQUE;
  return STATUS_ML[anuncio?.status] ?? STATUS_ML.RASCUNHO;
}

export const TIPOS_DE_ANUNCIO_ML = [
  { valor: "gold_special", rotulo: "Clássico" },
  { valor: "gold_pro", rotulo: "Premium" },
];

// Tipo de logistica do anuncio: muda a tarifa fixa do ML (`listing_prices`) e o frete do vendedor.
// O padrao da conta e coleta/agencia (`xd_drop_off`, investigacao A3).
export const LOGISTICAS_ML = [
  { valor: "xd_drop_off", rotulo: "Mercado Envios (coleta/agência)" },
  { valor: "fulfillment", rotulo: "Full" },
  { valor: "self_service", rotulo: "Flex" },
];

export const ROTULO_DO_TIPO_ML =Object.fromEntries(TIPOS_DE_ANUNCIO_ML.map(({ valor, rotulo }) => [valor, rotulo]));

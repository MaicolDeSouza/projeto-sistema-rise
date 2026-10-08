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

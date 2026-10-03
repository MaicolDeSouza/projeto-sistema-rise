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
  { valor: "gold_special", rotulo: "Classico" },
  { valor: "gold_pro", rotulo: "Premium" },
];

export const ROTULO_DO_TIPO_ML = Object.fromEntries(TIPOS_DE_ANUNCIO_ML.map(({ valor, rotulo }) => [valor, rotulo]));

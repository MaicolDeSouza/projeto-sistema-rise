/**
 * Rotulos que o editor, a lista e o pop-up da Loja Integrada mostram. Sem "use client": a lista e
 * componente de servidor e nao pode importar valor de arquivo de cliente.
 *
 * Na LI o anuncio vinculado e PUBLICADO ("Na loja"): e o mesmo produto da loja, editado aqui.
 */

export const STATUS_LI = {
  RASCUNHO: { rotulo: "Sem vínculo", tom: "neutro" },
  PUBLICADO: { rotulo: "Na loja", tom: "sucesso" },
  ERRO: { rotulo: "Erro", tom: "erro" },
};

export const ROTULO_DO_TIPO_PRODUCAO = { REVENDA: "Revenda", FABRICACAO_PROPRIA: "Fabricação própria" };

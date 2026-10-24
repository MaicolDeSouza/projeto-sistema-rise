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

/**
 * As opcoes da "Origem da mercadoria" com o texto EXATO do painel da Loja Integrada (pedido do dono em 24/10/2026: olhar
 * a aba Tributacao do Rise e saber exatamente o que escolher la). O codigo e o mesmo da NF-e (0 a 8).
 */
export const ORIGENS_DA_LI = {
  0: "0 - 100% produzido nacionalmente",
  1: "1 - Importação feita por você",
  2: "2 - Importado, mas comprado no Brasil",
  3: "3 - Nacional, com mais de 40% e até 70% do conteúdo de origem estrangeira (importado)",
  4: "4 - Nacional, produzida conforme PPB",
  5: "5 - Nacional, com 40% ou menos do conteúdo de origem estrangeira (importado)",
  6: "6 - Importação feita por você, e sem similar nacional",
  7: "7 - Importado, mas comprado no Brasil, e sem similar nacional",
  8: "8 - Nacional, com mais de 70% do conteúdo de origem estrangeira (importado)",
};

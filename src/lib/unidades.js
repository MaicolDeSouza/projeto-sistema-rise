/**
 * Unidades de medida aceitas no cadastro.
 *
 * Fica num modulo proprio porque e usada tanto pelo formulario (cliente) quanto
 * pela validacao (servidor) — e um arquivo "use server" so pode exportar
 * funcoes assincronas, entao a lista nao podia morar nas acoes.
 *
 * Lista fechada porque o Bling valida a unidade ao cadastrar o produto: com
 * texto livre, o mesmo item viraria "un", "UN" e "unidade".
 */
export const UNIDADES = ["UN", "MT", "KIT", "HR"];

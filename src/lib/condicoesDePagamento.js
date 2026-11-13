/**
 * Ordem das condicoes de pagamento na tela (13/11/2026): pelo NUMERO, como se le ("7 dias", "14 dias", "28 dias",
 * "28/56 dias"), e nao como texto, que punha "14 dias" antes de "7 dias". O banco ordena por texto, entao a ordem e
 * feita aqui, em toda lista que mostra as condicoes (o cadastro, o cliente e a proposta).
 */
const COMPARAR = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" }).compare;

export function ordenarCondicoes(condicoes) {
  return [...condicoes].sort((a, b) => COMPARAR(a.nome, b.nome));
}

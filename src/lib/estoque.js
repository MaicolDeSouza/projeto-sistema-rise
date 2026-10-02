/**
 * Regras do ajuste de estoque (entrada, saida e balanco), sem imports: a tela
 * (previa do saldo) e a Server Action (validacao) leem as MESMAS regras — se cada
 * uma tivesse a sua, a previa poderia prometer um saldo que a gravacao recusa.
 */

export const TIPOS_DE_MOVIMENTO = [
  { id: "ENTRADA", rotulo: "Entrada", ajuda: "soma ao saldo", campo: "Quantidade a entrar", botao: "Confirmar entrada" },
  { id: "SAIDA", rotulo: "Saida", ajuda: "tira do saldo", campo: "Quantidade a sair", botao: "Confirmar saida" },
  { id: "BALANCO", rotulo: "Balanco", ajuda: "define o saldo", campo: "Contagem real (novo saldo)", botao: "Confirmar balanco" },
];

/// Motivos oferecidos por tipo; o primeiro e o padrao da tela.
export const MOTIVOS = {
  ENTRADA: ["Compra de fornecedor", "Devolucao de cliente", "Outro"],
  SAIDA: ["Venda fora dos canais", "Perda ou avaria", "Uso interno", "Outro"],
  BALANCO: ["Contagem de inventario"],
};

/// Teto folgado dentro do INTEGER do Postgres (2,1 bilhoes): um zero a mais
/// digitado sem querer nao pode estourar a coluna.
export const MAXIMO_ESTOQUE = 9_999_999;

export function tipoValido(tipo) {
  return TIPOS_DE_MOVIMENTO.some((item) => item.id === tipo);
}

/** O saldo depois da operacao. Pode dar negativo: quem chama decide recusar. */
export function novoSaldo(tipo, saldo, quantidade) {
  if (tipo === "ENTRADA") return saldo + quantidade;
  if (tipo === "SAIDA") return saldo - quantidade;
  return quantidade;
}

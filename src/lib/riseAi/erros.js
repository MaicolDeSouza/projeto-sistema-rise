/**
 * Erro que a PESSOA causou e pode corrigir (pergunta vazia, grande demais, resposta anterior em andamento, limite por
 * minuto, conversa que não é dela): a mensagem vai para a tela como está. Todo outro erro é defeito nosso — a tela
 * recebe um aviso genérico e o detalhe fica só no log do servidor (mensagem de banco não é para quem usa o chat).
 */
export class ErroDeUso extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroDeUso";
  }
}

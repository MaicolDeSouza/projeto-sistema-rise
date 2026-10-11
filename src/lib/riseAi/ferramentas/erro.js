/**
 * Erro ESPERADO de uma ferramenta (código que não existe, pedido que não faz sentido): a mensagem volta ao modelo
 * como está, para ele se corrigir ou avisar o usuário. Qualquer outro erro é falha nossa (banco fora do ar...) e o
 * modelo só recebe um aviso genérico — mensagem de banco não é para ele.
 */
export class ErroDeFerramenta extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroDeFerramenta";
  }
}

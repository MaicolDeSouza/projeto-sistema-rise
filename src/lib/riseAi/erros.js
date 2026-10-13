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

/**
 * O orcamento do mes acabou no meio de uma resposta (spec §3): o laco para antes da proxima chamada paga. NAO e falha de
 * provedor (nao tem `tipo`), entao a reserva de outro provedor nao e tentada: gastaria dinheiro que nao ha. Leva o que a
 * resposta ja custou (`uso`, `custo`), que precisa ser gravado mesmo assim.
 */
export class OrcamentoEsgotado extends Error {
  /** @param {object} estado o `estadoDoOrcamento` na hora da recusa  @param {{ uso?: { entrada: number, saida: number } | null, custo?: { usd: number, brl: number } | null }} gasto */
  constructor(estado, { uso = null, custo = null } = {}) {
    super("O orçamento do mês acabou.");
    this.name = "OrcamentoEsgotado";
    this.estado = estado;
    this.uso = uso;
    this.custo = custo;
  }
}

/**
 * A pessoa apertou Parar (spec §5): o laço termina a resposta com o que já escreveu. NÃO é falha de provedor (a reserva não
 * é tentada). Leva o texto parcial, o que a resposta já gastou e o que foi consultado, para a mensagem ser gravada.
 */
export class RespostaInterrompida extends Error {
  /** @param {{ textoParcial?: string, uso?: { entrada: number, saida: number }, custo?: { usd: number, brl: number } | null, trilha?: object[], cartoes?: object[], fontes?: object[] }} dados */
  constructor({ textoParcial = "", uso = { entrada: 0, saida: 0 }, custo = null, trilha = [], cartoes = [], fontes = [] } = {}) {
    super("A resposta foi interrompida.");
    this.name = "RespostaInterrompida";
    this.textoParcial = textoParcial;
    this.uso = uso;
    this.custo = custo;
    this.trilha = trilha;
    this.cartoes = cartoes;
    this.fontes = fontes;
  }
}

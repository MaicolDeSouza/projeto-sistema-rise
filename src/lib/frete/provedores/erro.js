/**
 * Erro de um provedor de frete, ja com a frase da tela. `codigo` decide o que a tela oferece: NAO_CONECTADO leva o link
 * de Integracoes; CEP_INVALIDO marca o campo; FORA_DO_AR pede para tentar de novo; RECUSADO mostra o texto do provedor.
 * Arquivo proprio para o registro e cada provedor importarem sem um importar o outro.
 */
export class ErroDoProvedor extends Error {
  /** @param {"NAO_CONECTADO" | "CEP_INVALIDO" | "FORA_DO_AR" | "RECUSADO" | "TRAVADO"} codigo */
  constructor(codigo, mensagem) {
    super(mensagem);
    this.name = "ErroDoProvedor";
    this.codigo = codigo;
  }
}

export const MENSAGENS = {
  NAO_CONECTADO: "O Melhor Envio não está conectado. Conecte em Configurações › Integrações.",
  CEP_INVALIDO: "CEP de destino não encontrado.",
  CEP_DE_ORIGEM: "O CEP de origem (Configurações › Dados da empresa) não foi aceito.",
  FORA_DO_AR: "O Melhor Envio não respondeu. Tente de novo em instantes.",
  TRAVADO: "A compra de etiquetas está travada (FRETE_COMPRA).",
};

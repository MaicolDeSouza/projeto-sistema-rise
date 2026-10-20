import { provedorPorId } from "@/lib/riseAi/modelos";

/**
 * Como o chat do Rise AI escreve dinheiro, tempo, provedor e o motivo da reserva. Funções puras (a tela e o teste
 * usam o mesmo arquivo), no padrão da tela: texto com acento, valores em pt-BR.
 */

export const reais = (valor) => `R$ ${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * O custo de uma resposta. Preço de modelo não cadastrado é `null` e NÃO vira "R$ 0,00": zero é o que o modelo local
 * custa, e confundir os dois esconderia gasto de API. Até 4 casas: uma resposta de Haiku custa centésimos de centavo.
 */
export function custoEmTexto(custoBrl, { estimado = false } = {}) {
  if (custoBrl === null || custoBrl === undefined) return "preço não cadastrado";
  if (custoBrl === 0) return "R$ 0,00";
  // "~" quando o provedor não devolveu o uso (resposta cortada pelo Parar): o valor sai dos caracteres, não de uma medida.
  return `${estimado ? "~" : ""}R$ ${custoBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

/** A linha de estado do chat enquanto a IA consulta (o evento `ferramenta` traz o nome). */
const ROTULOS_DAS_FERRAMENTAS = {
  pesquisarNaInternet: "pesquisando na internet…",
  buscarConhecimento: "consultando o conhecimento…",
  buscarProdutos: "consultando produtos…",
  consultarProduto: "consultando produtos…",
  consultarPreco: "consultando produtos…",
  consultarEstoque: "consultando produtos…",
  compararProdutos: "consultando produtos…",
  buscarProdutosSimilares: "consultando produtos…",
};
export const rotuloDaFerramenta = (nome) => ROTULOS_DAS_FERRAMENTAS[nome] ?? "consultando…";

export function duracaoEmTexto(ms) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
}

/** "lido há 20 min": a idade do saldo que o Rise leu do Bling. Sem leitura, o número é o do cadastro. */
export function idadeDoSaldo(minutos) {
  if (minutos === null || minutos === undefined) return "estoque do cadastro";
  if (minutos < 1) return "lido agora há pouco";
  if (minutos < 60) return `lido há ${Math.floor(minutos)} min`;
  if (minutos < 60 * 24) return `lido há ${Math.floor(minutos / 60)} h`;
  return `lido há ${Math.floor(minutos / (60 * 24))} d`;
}

/** Por que a resposta veio da reserva (`motivoDaReserva` da mensagem), em uma frase para a faixa azul. */
const MOTIVOS = {
  conexao: "sem conexão com o modelo padrão",
  tempo: "o modelo padrão demorou demais para começar",
  autenticacao: "a chave do modelo padrão foi recusada",
  limite: "o modelo padrão atingiu o limite de uso",
  resposta: "o modelo padrão devolveu erro",
  ferramenta_malformada: "o modelo padrão errou o formato das ferramentas",
  padrao_indisponivel: "o modelo padrão está fora do ar",
  padrao_sem_modelo: "nenhum modelo padrão foi escolhido",
};
export const rotuloDoMotivo = (motivo) => MOTIVOS[motivo] ?? "o modelo padrão falhou";

/**
 * As respostas que o Claude ou o ChatGPT anotaram pelo MCP (`anotarDuvida`) ficam com o provedor "mcp": foram escritas na
 * conta da própria pessoa, e o Rise não pagou nada por elas.
 */
export const PROVEDOR_DO_MCP = "mcp";

export const rotuloDoProvedor = (id) => (id === PROVEDOR_DO_MCP ? "conta própria" : (provedorPorId(id)?.rotulo ?? id ?? ""));

/** Modelo local (no PC do dono) e a conta própria do MCP custam zero e ganham o selo verde; o de API, o azul. */
export const ehLocal = (id) => id === PROVEDOR_DO_MCP || provedorPorId(id)?.local === true;

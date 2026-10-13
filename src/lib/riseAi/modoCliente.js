import { normalizar } from "@/lib/texto";

/**
 * O modo "texto para o cliente" (spec §4a e §5, decisão 20 da revisão 2): quando a equipe pede "escreva a resposta para o
 * cliente", a IA roda com as ferramentas do perfil cliente e a saída passa por um filtro, mesmo para quem vê custo no
 * chat. Sem o quadro separado da Entrega 1, essa é a única barreira entre o custo e o texto copiado para o cliente.
 *
 * Funções puras (texto entra, texto sai): sem banco e sem rede.
 */

const ALVO = String.raw`(?:para|pra|pro|ao|a)\s+(?:o\s+|a\s+)?cliente`;
// "escreva a resposta para o cliente", "redija uma mensagem pro cliente sobre o Uno", "prepare o texto para o cliente".
const PEDIDO_DE_TEXTO = new RegExp(
  String.raw`\b(?:escreva|escreve|redija|redige|monte|monta|prepare|prepara|faca|faz|gere|gera|elabore|elabora|crie|cria)\b[^.?!\n]{0,60}\b(?:resposta|mensagem|texto|retorno)\b[^.?!\n]{0,40}\b${ALVO}\b`,
);
// "responda ao cliente", "responde para o cliente".
const PEDIDO_DE_RESPOSTA = new RegExp(String.raw`\b(?:responda|responde)\b[^.?!\n]{0,40}\b${ALVO}\b`);

/**
 * A equipe está pedindo um texto para ENVIAR a um cliente? Pergunta sobre o cliente ("o cliente perguntou X, o que
 * respondo?") e pedido de dica ("como escrever para o cliente?") não contam: o modo cliente é só para o texto pronto.
 */
export function pedidoParaOCliente(texto) {
  const limpo = normalizar(texto);
  if (!limpo) return false;
  return PEDIDO_DE_TEXTO.test(limpo) || PEDIDO_DE_RESPOSTA.test(limpo);
}

const ENDERECO = /https?:\/\/[^\s)>\]]+/gi;
const TERMO_INTERNO = /\b(?:custo|margem|fornecedor|concorrente)s?\b/;

/** Compara endereços sem diferença de barra final ou de caixa no domínio. */
const comoEndereco = (url) => String(url).replace(/[.,;:!?]+$/, "").replace(/\/+$/, "").toLowerCase();

/**
 * Deixa o texto como o WhatsApp mostra: sem as marcas de markdown e sem nenhum endereço que o modelo tenha escrito por
 * conta própria (só vale o `urlLoja` que uma ferramenta devolveu).
 *
 * @param {string} texto
 * @param {{ linksPermitidos?: string[] }} [opcoes]
 * @returns {{ texto: string, avisos: string[] }}  `link_removido` e `termo_interno` vão para os avisos da mensagem
 */
export function limparTextoParaOCliente(texto, { linksPermitidos = [] } = {}) {
  const permitidos = new Set(linksPermitidos.filter(Boolean).map(comoEndereco));
  const avisos = [];

  let limpo = String(texto ?? "").replace(/\r\n?/g, "\n");
  // Link em markdown vira "texto (endereço)" para o filtro de endereços olhar o destino.
  limpo = limpo.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/gi, "$1 ($2)");
  limpo = limpo.replace(ENDERECO, (achado) => {
    const sobra = /[.,;:!?]+$/.exec(achado)?.[0] ?? "";
    if (permitidos.has(comoEndereco(achado))) return achado;
    if (!avisos.includes("link_removido")) avisos.push("link_removido");
    return sobra;
  });

  limpo = limpo
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/__(.+?)__/gs, "$1")
    .replace(/`+/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^(\s*)[*•]\s+/gm, "$1- ")
    .replace(/(^|[\s(])\*(\S[^*\n]*?)\*(?=[\s).,;:!?]|$)/g, "$1$2");

  // Linha que ficou só com "Link:" (ou "Veja:") por causa do endereço removido.
  limpo = limpo
    .split("\n")
    .filter((linha) => !/^\s*(?:link|veja|acesse)\s*:?\s*[.,;]*\s*$/i.test(linha))
    .join("\n")
    .replace(/\(\s*\)/g, "") // o "(endereco)" de um link em markdown que foi removido
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (TERMO_INTERNO.test(normalizar(limpo))) avisos.push("termo_interno");
  return { texto: limpo, avisos };
}

/**
 * Le a lista de pecas que o visitante cola no chat ("10 resistor 10k", um item por linha) e devolve quantidade e termos.
 *
 * Puro, sem imports. Serve de PISTA ao cerebro (a mensagem parece uma lista, e de quantas linhas) e de rede para a
 * ferramenta `orcarLista`; quem decide o que e cada item continua sendo a busca no catalogo, nunca este arquivo.
 *
 * O numero so vira quantidade quando esta SOZINHO no comeco ("10 resistor"), colado a um "x" ("2x", "x5") ou a uma
 * unidade ("2 un."). "resistor 220r" e "lm7805" ficam inteiros: ali o numero e parte do nome da peca.
 */

export const MAXIMO_DE_LINHAS = 50;
const MAXIMO_DA_QUANTIDADE = 9999;

// "- ", "* ", "• " e a numeracao "1) " / "1. " de uma lista copiada.
const MARCADOR = /^\s*(?:[-*•]\s+|\d{1,3}[.)]\s+)/;
const UNIDADE = String.raw`(?:x|un\.?|und\.?|unid\.?|unidades?|pcs?\.?|pe[cç]as?)`;
// "10 resistor", "2x arduino", "2 un. capacitor"
const NO_COMECO = new RegExp(String.raw`^(\d{1,4})\s*(?:${UNIDADE}\s+|\s+)(.+)$`, "i");
// "led vermelho x5", "led vermelho 5x", "led vermelho 5 un"
const NO_FIM = new RegExp(String.raw`^(.+?)\s+(?:x\s*(\d{1,4})|(\d{1,4})\s*${UNIDADE})$`, "i");

const quantidadeValida = (texto) => {
  const numero = Number(texto);
  return Number.isInteger(numero) && numero >= 1 && numero <= MAXIMO_DA_QUANTIDADE ? numero : null;
};

/**
 * @param {string} texto  a mensagem como o visitante a colou
 * @returns {{ quantidade: number, termos: string }[]}  até 50 linhas; linha vazia sai
 */
export function lerLinhasDaLista(texto) {
  const linhas = [];
  for (const bruta of String(texto ?? "").split(/\r?\n/)) {
    const linha = bruta.replace(MARCADOR, "").trim().replace(/[;,]+$/, "").trim();
    if (!linha) continue;

    let quantidade = 1;
    let termos = linha;
    const comeco = NO_COMECO.exec(linha);
    const fim = comeco ? null : NO_FIM.exec(linha);
    if (comeco && quantidadeValida(comeco[1]) && comeco[2].trim()) {
      quantidade = quantidadeValida(comeco[1]);
      termos = comeco[2].trim();
    } else if (fim && quantidadeValida(fim[2] ?? fim[3])) {
      quantidade = quantidadeValida(fim[2] ?? fim[3]);
      termos = fim[1].trim();
    }
    linhas.push({ quantidade, termos });
    if (linhas.length >= MAXIMO_DE_LINHAS) break;
  }
  return linhas;
}

/**
 * Regras das frases fixas do canal, SEM imports: o servidor (`configuracao.js`, que fala com o
 * banco) e a tela (`FrasesFixas.jsx`, que avisa antes de enviar) leem este arquivo, e o Prisma
 * nao pode ir para o navegador. Copiar as regras nos dois lados faria o aviso da tela e a recusa
 * do servidor divergirem em silencio (mesmo motivo de `coleta/mesclar.js`).
 */

// A descricao tem que continuar sendo do produto: frase fixa demais ou longa demais a
// transforma em texto da loja.
export const MAXIMO_DE_FRASES = 10;
export const MAXIMO_DA_FRASE = 200;

/** Uma frase por linha. Linha vazia sai e frase repetida vira uma so. */
export function frasesDoTexto(texto) {
  return [
    ...new Set(
      String(texto ?? "")
        .split(/\r?\n/)
        .map((linha) => linha.trim())
        .filter(Boolean),
    ),
  ];
}

/** O motivo de a lista (ja limpa, de `frasesDoTexto`) ser recusada, ou `null` se serve. */
export function avisoDasFrases(frases) {
  if (frases.length > MAXIMO_DE_FRASES) return `Use ate ${MAXIMO_DE_FRASES} frases.`;
  const longa = frases.findIndex((frase) => frase.length > MAXIMO_DA_FRASE);
  if (longa >= 0) {
    return `A frase ${longa + 1} tem ${frases[longa].length} caracteres. O limite e ${MAXIMO_DA_FRASE}.`;
  }
  return null;
}

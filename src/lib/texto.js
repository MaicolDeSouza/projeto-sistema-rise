/**
 * Funcoes de texto sem dependencia nenhuma.
 *
 * Mora aqui, e nao em src/lib/blocos.js onde nasceu, porque aquele arquivo
 * importa lucide-react: o worker de coleta roda em Node puro, fora do Next, e
 * arrastaria componentes React so para tirar acento de uma string. E a mesma
 * razao pela qual src/lib/limites.js foi separado de src/lib/arquivos.js —
 * copiar a funcao resolveria o import, mas duas copias ja nascem podendo
 * divergir.
 */

/** Remove acentos e caixa, para que a busca ignore ambos. */
export function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

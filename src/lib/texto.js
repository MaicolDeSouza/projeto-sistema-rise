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

/**
 * O termo e quebrado em palavras e TODAS sao exigidas. Sem isso, "kingston nv2"
 * devolveria tudo da Kingston mais tudo que tem "nv2" — e o que o operador quer
 * e a intersecao, nao a uniao.
 *
 * `alvo` e o `buscaTexto` do produto coletado, montado na gravacao com nome,
 * marca, modelo e codigos. A descricao fica de fora de proposito: procurar nela
 * devolveria o produto errado toda vez que a loja citasse uma marca concorrente
 * no texto. Usada pela tela Mercados, onde o operador FILTRA. Para achar
 * produtos parecidos com um titulo inteiro, ver `palavrasDoTermo`/`casaPalavra`.
 */
export function combina(alvo, termo) {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return true;

  const texto = alvo ?? "";
  return palavras.every((palavra) => texto.includes(palavra));
}

/// Palavras que nao dizem nada sobre o produto: "com" aparece em 1.613 nomes.
const PALAVRAS_VAZIAS = new Set([
  "a", "o", "as", "os", "e", "de", "da", "do", "das", "dos", "com", "sem", "para", "pra",
  "em", "no", "na", "nos", "nas", "por", "um", "uma", "ou",
]);

const compactar = (texto) => texto.replace(/[^a-z0-9]/g, "");

/**
 * Palavras de um titulo, prontas para `casaPalavra`: sem acento, sem caixa, sem
 * pontuacao e sem palavras vazias. "HC-SR04" vira "hcsr04".
 */
export function palavrasDoTermo(termo) {
  return [
    ...new Set(
      normalizar(termo)
        .split(/\s+/)
        .filter((palavra) => !PALAVRAS_VAZIAS.has(palavra))
        .map(compactar)
        .filter(Boolean),
    ),
  ];
}

/**
 * As formas em que uma palavra pode aparecer no nome de um produto.
 *
 * Cada loja escreve o mesmo modelo de um jeito: a Nightech poe "HCSR04", o
 * concorrente "HC-SR04"; um escreve "5V", outro "5 V". Por isso entram a palavra
 * inteira sem simbolo, cada pedaco dela, e cada par de pedacos vizinhos.
 */
export function indiceDePalavras(alvo) {
  const texto = alvo ?? "";
  const pedacos = texto.split(/[^a-z0-9]+/).filter(Boolean);
  const formas = new Set(pedacos);
  for (const palavra of texto.split(/\s+/)) {
    const inteira = compactar(palavra);
    if (inteira) formas.add(inteira);
  }
  for (let i = 0; i + 1 < pedacos.length; i++) formas.add(pedacos[i] + pedacos[i + 1]);
  return [...formas];
}

/**
 * A palavra do termo aparece no produto?
 *
 * Compara por PALAVRA, nao por trecho de texto: por trecho, o "4" de "4 canais"
 * casava com "RS485" e o "R3" com qualquer codigo que o contivesse. Palavra de
 * ate 3 caracteres precisa ser igual; mais longa pode ser o comeco
 * ("ultrassonico" em "ultrassonicos", "ch340" em "ch340g").
 */
export function casaPalavra(formas, palavra) {
  if (palavra.length <= 3) return formas.includes(palavra);
  return formas.some((forma) => forma.startsWith(palavra));
}

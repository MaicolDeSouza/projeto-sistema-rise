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
export const PALAVRAS_VAZIAS = new Set([
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

/**
 * A nota de cada item (0 a 1): a FRACAO DO PESO do termo que o item tem. Extraida da lupa de referencias
 * (`buscarReferencias`) para a busca do Rise AI usar a mesma conta.
 *
 * PESO PELA RARIDADE. "sensor" esta em centenas de produtos e nao diz qual e a peca; "hcsr04" esta em poucos e diz.
 * Com peso igual, a busca por "SENSOR DE DISTANCIA ULTRASSONICO HC-SR04 5V" punha sensores ToF (sensor + distancia
 * + 5V) no mesmo nivel do HC-SR04. Palavra com digito ganha um bonus a mais: e modelo, CI ou especificacao.
 *
 * A raridade e medida entre os itens recebidos: quem passa so os candidatos tem pesos mais achatados que quem passa o
 * catalogo inteiro (a lupa passa tudo). Sem palavras o peso total e zero e toda nota e zero.
 *
 * @param {string[]} palavras  de `palavrasDoTermo`
 * @param {string[][]} formasPorItem  `indiceDePalavras` do texto de cada item
 * @returns {{ notas: number[], pesos: number[] }}
 */
export function notasDeRelevancia(palavras, formasPorItem) {
  const casamentos = formasPorItem.map((formas) => palavras.map((palavra) => casaPalavra(formas, palavra)));
  const pesos = palavras.map((palavra, indice) => {
    const comEla = casamentos.filter((linha) => linha[indice]).length;
    const raridade = Math.log((formasPorItem.length + 1) / (comEla + 1)) + 1;
    return /d/.test(palavra) ? raridade * 1.5 : raridade;
  });
  const pesoTotal = pesos.reduce((soma, peso) => soma + peso, 0);
  const notas = casamentos.map((linha) => {
    const pesoCasado = linha.reduce((soma, casou, posicao) => soma + (casou ? pesos[posicao] : 0), 0);
    return pesoTotal > 0 ? pesoCasado / pesoTotal : 0;
  });
  return { notas, pesos };
}

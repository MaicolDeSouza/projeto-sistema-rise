/**
 * Conferir o EAN (GTIN) que o produto JA TEM (pedido do dono em 21/10/2026, opcao 1): o codigo e de verdade e e deste
 * produto? Regras puras, sem imports (o cadastro, o script de lista e o teste usam). A consulta ao catalogo do Mercado
 * Livre mora em `canaisDeVenda/ml/eanNoCatalogo.js`.
 *
 * Por que so conferir, e nao BUSCAR o EAN pelo nome (medido em 21/10/2026): em peca generica cada vendedor registra o
 * proprio codigo (o "Uno R3 SMD" aparece no catalogo do ML com 6 GTINs diferentes em 5 cadastros), e usar um deles
 * seria usar o codigo de barras de outra empresa na NF-e.
 */

/** So os digitos, se tiver o tamanho de um GTIN (8, 12, 13 ou 14); senao null. */
export function digitosDoEan(valor) {
  const digitos = String(valor ?? "").replace(/[\s.-]/g, "");
  return /^(\d{8}|\d{12,14})$/.test(digitos) ? digitos : null;
}

/**
 * O digito verificador da conta da GS1 (pesos 3 e 1 a partir da direita) para um corpo so de digitos, de qualquer
 * tamanho. Separado de `digitoVerificadorOk` porque o gerador de EAN interno (`eanInterno.js`) precisa CALCULAR o digito,
 * nao so conferir.
 */
export function calcularDigitoVerificador(corpo) {
  let soma = 0;
  for (let i = 0; i < corpo.length; i++) {
    const peso = (corpo.length - i) % 2 === 1 ? 3 : 1;
    soma += Number(corpo[i]) * peso;
  }
  return String((10 - (soma % 10)) % 10);
}

/** O ultimo digito confere com a conta da GS1? */
export function digitoVerificadorOk(ean) {
  const digitos = digitosDoEan(ean);
  if (!digitos) return false;
  return calcularDigitoVerificador(digitos.slice(0, -1)) === digitos.at(-1);
}

/**
 * O que da para dizer sem consultar ninguem: formato, digito verificador e o codigo do produto completado com zeros
 * (o 100106 tinha "0000000100106": passa no digito verificador e no ML e o codigo de uma locao). Null = nada a dizer.
 *
 * @returns {{ tipo: "formato"|"digito"|"interno", texto: string } | null}
 */
export function problemaLocalDoEan(ean, sku) {
  const texto = String(ean ?? "").trim();
  if (!texto) return null;
  const digitos = digitosDoEan(texto);
  if (!digitos) return { tipo: "formato", texto: "Não parece um código de barras: o GTIN/EAN tem 8, 12, 13 ou 14 dígitos." };
  if (!digitoVerificadorOk(digitos)) return { tipo: "digito", texto: "O dígito verificador não confere: o código de barras está errado." };
  const semZeros = digitos.replace(/^0+/, "");
  const codigo = String(sku ?? "").replace(/\D/g, "");
  if (/^0{4,}/.test(digitos) && codigo && (semZeros === codigo || semZeros.slice(0, -1) === codigo)) {
    return { tipo: "interno", texto: "Parece o código do produto completado com zeros, e não um código de barras de verdade." };
  }
  return null;
}

const PALAVRAS_VAZIAS = new Set(["com", "de", "do", "da", "dos", "das", "e", "para", "por", "em", "no", "na", "o", "a", "os", "as", "um", "uma", "kit", "unidade", "unidades", "pcs", "peca", "pecas"]);

/** As palavras que identificam um nome: sem acento, minusculas, sem as vazias. */
export function palavrasDoNome(nome) {
  return [
    ...new Set(
      String(nome ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((palavra) => palavra.length >= 2 && !PALAVRAS_VAZIAS.has(palavra)),
    ),
  ];
}

/** Os dois nomes falam do mesmo produto? Pelo menos 2 palavras em comum (ou 1, se um dos nomes so tem uma ou duas). */
export function nomesParecidos(a, b) {
  const pa = palavrasDoNome(a);
  const pb = new Set(palavrasDoNome(b));
  if (pa.length === 0 || pb.size === 0) return false;
  const comuns = pa.filter((palavra) => pb.has(palavra)).length;
  return comuns >= Math.min(2, pa.length, pb.size);
}

/**
 * O que o catalogo do ML diz do EAN. `itens` = `{ id, nome }` de `/products/search?product_identifier=`.
 *  - nenhum item: o codigo nao esta no catalogo (comum em peca generica; nao e erro) -> null;
 *  - algum item com nome parecido com o do produto: confere -> null;
 *  - so itens de outro produto: aviso, com ate 2 nomes.
 *
 * @returns {{ tipo: "outro", texto: string, itens: { id: string, nome: string }[] } | null}
 */
export function avisoDoCatalogo(itens, titulo) {
  const lista = (itens ?? []).filter((item) => item?.nome);
  if (lista.length === 0) return null;
  if (lista.some((item) => nomesParecidos(titulo, item.nome))) return null;
  return {
    tipo: "outro",
    texto: "No Mercado Livre este código de barras é de outro produto.",
    itens: lista.slice(0, 2).map(({ id, nome }) => ({ id, nome })),
  };
}

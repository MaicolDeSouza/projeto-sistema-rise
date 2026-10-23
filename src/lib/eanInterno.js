import { calcularDigitoVerificador, digitosDoEan } from "./eanNoMercadoLivre.js";

/**
 * GTIN/EAN interno da 4hobby (spec docs/superpowers/specs/2026-10-23-gerador-ean-interno-design.md).
 *
 * O dono decidiu em 23/10/2026 NAO se associar a GS1 (custo). Sem o prefixo de empresa, o codigo possivel e o EAN-13 da
 * faixa de uso interno que a propria GS1 reserva (prefixo 2, de 200 a 299): todo leitor le, o Bling grava, e nunca colide
 * com produto real de fabricante. O que ele sabe e ficou para depois: o Mercado Livre recusa essa faixa como GTIN e a
 * SEFAZ tende a barrar na NF-e.
 *
 * O numero deriva do SKU (2 + zeros a esquerda + SKU + digito verificador) em vez de um contador: nao precisa de sequencia
 * no banco, nunca repete porque o SKU e unico e nunca reaproveitado, e quem le a etiqueta enxerga o SKU dentro do numero.
 * So vale para SKU so de digitos (ate 11): SKU com letras nao cabe num codigo de barras numerico.
 *
 * Regras puras: a tela, o Salvar e o teste usam as mesmas.
 */

export const PREFIXO_INTERNO = "2";
export const DIGITOS_DO_SKU = 11;

/**
 * O EAN-13 interno do SKU.
 * @returns {{ ok: true, ean: string } | { ok: false, erro: string }}
 */
export function gerarEanDoSku(sku) {
  const codigo = String(sku ?? "").trim();
  if (!codigo) return { ok: false, erro: "Preencha o código (SKU) antes de gerar o EAN." };
  if (!/^\d+$/.test(codigo)) {
    return { ok: false, erro: "O EAN interno só é gerado para código só com dígitos (este tem letras ou símbolos)." };
  }
  if (codigo.length > DIGITOS_DO_SKU) {
    return { ok: false, erro: `O código tem mais de ${DIGITOS_DO_SKU} dígitos e não cabe no EAN-13.` };
  }
  const corpo = PREFIXO_INTERNO + codigo.padStart(DIGITOS_DO_SKU, "0");
  return { ok: true, ean: corpo + calcularDigitoVerificador(corpo) };
}

/** 13 digitos comecando com 2: a faixa interna. Codigo de fabricante (outro prefixo, 8/12/14 digitos) nao e. */
export function ehEanInternoDoRise(ean) {
  const digitos = digitosDoEan(ean);
  return Boolean(digitos && digitos.length === 13 && digitos.startsWith(PREFIXO_INTERNO));
}

/**
 * Motivo para o Salvar recusar um EAN da faixa interna; null quando nao e interno ou o digito confere. Os codigos de
 * fabricante ficam de fora de proposito: ha codigos reais gravados que nao vale arriscar barrar.
 */
export function problemaDoEanInterno(ean) {
  if (!ehEanInternoDoRise(ean)) return null;
  const digitos = digitosDoEan(ean);
  if (calcularDigitoVerificador(digitos.slice(0, -1)) === digitos.at(-1)) return null;
  return "O dígito verificador do GTIN/EAN interno (prefixo 2) não confere: gere de novo pelo botão ou corrija o código.";
}

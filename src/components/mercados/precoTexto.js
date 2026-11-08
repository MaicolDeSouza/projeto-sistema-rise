import { precoComImpostos } from "@/lib/coleta/impostos";
import { simboloDaMoeda } from "@/lib/coleta/moeda";

/**
 * Formatacao de preco compartilhada entre a lista (TabelaMercados) e o
 * detalhe (RegrasDeCompra) — extraida em 22/09/2026 porque as duas telas
 * precisavam do MESMO texto "R$ 8,06 (R$ 7,90 + 2% IPI)", e uma copia em cada
 * arquivo divergiria em silencio na primeira mudanca.
 */

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "R$ 8,06", ou "US$ 11,88" quando o valor esta na moeda do site (faixas de quantidade da Adafruit, 08/11/2026). */
export function comoMoeda(valor, moeda = null) {
  if (valor === null || valor === undefined) return "—";
  if (!moeda) return MOEDA.format(valor);
  return `${simboloDaMoeda(moeda)} ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * "R$ 8,06 (R$ 7,90 + 2% IPI)" — o total primeiro, porque e o que se paga; a
 * conta entre parenteses so aparece quando ha imposto de verdade (base e
 * total diferentes). Sem imposto, so o valor final: "(R$ 7,90 + )" vazio
 * pareceria erro de leitura, nao ausencia de imposto.
 */
export function precoComImpostoTexto(base, total, impostos, moeda = null) {
  const valor = typeof total === "number" ? total : base;
  if (typeof valor !== "number") return null;
  if (typeof base !== "number" || base === total || !impostos?.length) {
    return comoMoeda(valor, moeda);
  }
  const detalhe = impostos
    .map((imposto) => `${String(imposto.percentual).replace(".", ",")}% ${imposto.nome}`)
    .join(" + ");
  return `${comoMoeda(total, moeda)} (${comoMoeda(base, moeda)} + ${detalhe})`;
}

/** "3-4 un." ou "5+ un." — versao curta para caber numa linha da lista. */
export function faixaCompacta(faixa) {
  if (typeof faixa.minimo !== "number") return faixa.rotulo ?? "";
  return typeof faixa.maximo === "number"
    ? `${faixa.minimo}-${faixa.maximo} un.`
    : `${faixa.minimo}+ un.`;
}

/**
 * Preco de UMA faixa, no MESMO formato do preco normal — pedido do dono,
 * 22/09/2026: "mostrar os valores em lote igual o valor normal". Total,
 * parenteses com base + o MESMO imposto cobrado na unidade ("o imposto e o
 * mesmo cobrado para uma peca" — a Santana cobra IPI por fora tambem no
 * lote), e um segundo parenteses so com a quantidade que da direito aquele
 * preco.
 */
export function precoDaFaixaTexto(faixa, impostos) {
  if (typeof faixa.preco !== "number") return null;
  // Faixa na moeda do site (Adafruit): sem imposto por fora e sem conversao, "US$ 11,88 (5-9 un.)".
  const total = faixa.moeda ? faixa.preco : precoComImpostos(faixa.preco, impostos);
  const texto = precoComImpostoTexto(faixa.preco, total, impostos, faixa.moeda ?? null);
  return texto ? `${texto} (${faixaCompacta(faixa)})` : null;
}

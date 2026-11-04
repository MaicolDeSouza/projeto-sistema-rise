/**
 * Formatos da tela de Pedidos de venda: moeda, data e hora em Sao Paulo (o servidor roda em UTC na VPS, e a data do
 * pedido tem de sair igual no PC e la) e a abreviacao do pagamento. Sem imports: serve ao servidor e ao cliente.
 */

export const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const DIA_E_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const DATA_COMPLETA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const DIA_ISO = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });

/** "02/11 10:15" */
export const diaEHora = (data) => (data ? DIA_E_HORA.format(new Date(data)).replace(",", "") : "—");
/** "02/11/2026 10:15" (o `title` da coluna Data). */
export const dataCompleta = (data) => (data ? DATA_COMPLETA.format(new Date(data)).replace(",", "") : "");
/** "2026-11-02": o dia em Sao Paulo, para o campo de data e a URL. */
export const diaIso = (data) => DIA_ISO.format(new Date(data));

/**
 * A forma de pagamento em uma palavra: "Pix", "Boleto", "Cartão 3×", "Débito", "Saldo ML". O ML manda o tipo
 * (`credit_card`, `ticket`, `bank_transfer`) e o meio (`pix`, `visa`); a LI o codigo (`pix`, `cartao_credito`); o Bling
 * so a descricao da forma ("Cartão de crédito").
 */
export function abreviarPagamento(pagamento) {
  const pg = Array.isArray(pagamento) ? pagamento[0] : pagamento;
  if (!pg) return null;
  const texto = `${pg.forma ?? ""} ${pg.tipo ?? ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const parcelas = Number(pg.parcelas) > 1 ? ` ${Number(pg.parcelas)}×` : "";
  if (/pix/.test(texto)) return "Pix";
  if (/bolet|ticket|bolbradesco/.test(texto)) return "Boleto";
  if (/debit/.test(texto)) return "Débito";
  if (/credit|credito|cartao|visa|master|elo|amex|hiper/.test(texto)) return `Cartão${parcelas}`;
  if (/account_money/.test(texto)) return "Saldo ML";
  if (/dinheiro/.test(texto)) return "Dinheiro";
  const original = String(pg.forma ?? pg.tipo ?? "").trim();
  return original ? original.charAt(0).toUpperCase() + original.slice(1) : null;
}

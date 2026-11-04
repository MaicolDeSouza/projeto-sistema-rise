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

const DIA_MES = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
/** "02/11" */
export const diaMes = (data) => (data ? DIA_MES.format(new Date(data)) : "");

/** De onde veio cada parcela do lucro (o `fontes` do real e a `origem` da estimativa), em palavras do operador. */
export const TEXTO_DA_FONTE = {
  pedido: "do pedido",
  envio: "do envio",
  etiqueta: "da etiqueta",
  config: "das taxas cadastradas",
  manual: "digitado",
  estimado: "estimado",
  editorML: "editor do ML",
  lucroNaLoja: "lucro na loja",
};

/** Os nomes dos canais na tela ("Abrir no Mercado Livre"). */
export const NOME_DO_CANAL = { MERCADO_LIVRE: "Mercado Livre", LOJA_INTEGRADA: "Loja Integrada", BLING: "Bling", SHOPEE: "Shopee" };

/** "Abrir no Mercado Livre", "Abrir na Loja Integrada": o artigo acompanha o nome do canal. */
export const abrirNoCanal = (origem) => (origem === "LOJA_INTEGRADA" ? "Abrir na Loja Integrada" : `Abrir no ${NOME_DO_CANAL[origem] ?? origem}`);

/** O endereco do pedido no painel do canal (rodape "Abrir no ..."). */
export function linkNoCanal(pedido) {
  if (pedido.origem === "MERCADO_LIVRE") return `https://www.mercadolivre.com.br/vendas/${encodeURIComponent(pedido.idExterno)}/detalhe`;
  if (pedido.origem === "LOJA_INTEGRADA") return `https://app.lojaintegrada.com.br/painel/pedido/${encodeURIComponent(pedido.idExterno)}`;
  if (pedido.origem === "BLING") return `https://www.bling.com.br/vendas.php#edit/${encodeURIComponent(pedido.blingPedidoId ?? pedido.idExterno)}`;
  return null;
}

/** O endereco do espelho no Bling (pedido do ML ou da LI copiado para la). */
export const linkNoBling = (pedido) => (pedido.blingPedidoId ? `https://www.bling.com.br/vendas.php#edit/${encodeURIComponent(pedido.blingPedidoId)}` : null);

/** O rastreio: o link que o canal deu, o do ML, ou o dos Correios para codigo no formato deles (AA123456789BR). */
export function linkDoRastreio(pedido) {
  const envio = pedido.envio ?? {};
  if (envio.link) return envio.link;
  if (pedido.origem === "MERCADO_LIVRE") return linkNoCanal(pedido);
  const codigo = String(envio.rastreio ?? "").trim().toUpperCase();
  return /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(codigo) ? `https://rastreamento.correios.com.br/app/index.php?objeto=${codigo}` : null;
}

/** Dinheiro com o sinal de menos tipografico ("−R$ 22,50"), o mesmo das parcelas do lucro. */
export const moedaComSinal = (valor) => (Number(valor) < 0 ? `−${moeda.format(-Number(valor))}` : moeda.format(Number(valor) || 0));

/**
 * O acompanhar pedido do chat da loja (fase 3, plano 2026-11-22-chat-da-loja-pedido-e-anexo): as regras PURAS que o servico
 * usa antes e depois de chamar a funcao `ia_situacao_do_pedido` do banco (sqlDoPapel.js). Nao confundir com os
 * `normalizarPedido` de src/lib/pedidos/, que leem os pedidos das APIs dentro do Rise (o servico `ia` nao os carrega).
 *
 * O formulario nunca passa pela IA: o numero e o documento vao direto do visitante a funcao, e o que volta e montado aqui
 * em texto pronto. A conferencia de verdade (e a contagem de erros) e do banco; aqui so se recusa o que nem vale a pena
 * mandar (prova curta), para nao gastar uma tentativa do visitante a toa.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {{ numero?: unknown, prova?: unknown }} entrada
 * @returns {{ numero: string, prova: string } | { erro: "numero" | "prova" }}
 */
export function normalizarPedido({ numero, prova }) {
  const numeroLimpo = String(numero ?? "")
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase();
  if (!numeroLimpo || numeroLimpo.length > 30) return { erro: "numero" };
  const provaDigitada = String(prova ?? "").trim();
  if (provaDigitada.length > 120) return { erro: "prova" };
  if (EMAIL.test(provaDigitada)) return { numero: numeroLimpo, prova: provaDigitada.toLowerCase() };
  const digitos = provaDigitada.replace(/\D/g, "");
  if (digitos.length !== 11 && digitos.length !== 14) return { erro: "prova" };
  return { numero: numeroLimpo, prova: digitos };
}

/** O que o visitante le em cada status do pedido (o mesmo enum de `PedidoDeVenda.status`). */
const TITULOS = {
  AGUARDANDO_PAGAMENTO: "Aguardando o pagamento",
  PAGO: "Pagamento aprovado",
  AGUARDANDO_PECAS: "Em separação",
  EM_SEPARACAO: "Em separação",
  ENVIADO: "Enviado",
  ENTREGUE: "Entregue",
  FINALIZADO: "Entregue",
  CANCELADO: "Cancelado",
  DEVOLVIDO: "Devolvido",
};

const TOM = { ENTREGUE: "ok", FINALIZADO: "ok", CANCELADO: "alerta", DEVOLVIDO: "alerta" };

const EM_SAO_PAULO = { timeZone: "America/Sao_Paulo" };

function diaDaVenda(data) {
  const [ano, mes, dia] = String(data ?? "").split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : null;
}

function quandoAtualizou(iso) {
  const instante = new Date(iso ?? "");
  if (Number.isNaN(instante.getTime())) return null;
  const dia = instante.toLocaleDateString("pt-BR", { ...EM_SAO_PAULO, day: "2-digit", month: "2-digit" });
  const hora = instante.toLocaleTimeString("pt-BR", { ...EM_SAO_PAULO, hour: "2-digit", minute: "2-digit" });
  return `${dia} às ${hora}`;
}

/**
 * O pedido que a funcao do banco devolveu, em texto para a janela. O link de rastreio so passa se for `https:` (o resto
 * vira so o codigo): ele vem da origem do pedido, e a janela poe o link num botao.
 * @param {{ numero: string, data?: string, status: string, transportadora?: string|null, rastreio?: string|null, linkDoRastreio?: string|null, atualizadoEm?: string }} pedido
 */
export function textoDaSituacao(pedido) {
  const linhas = [];
  const dia = diaDaVenda(pedido.data);
  linhas.push(dia ? `Pedido nº ${pedido.numero} de ${dia}` : `Pedido nº ${pedido.numero}`);
  if (pedido.transportadora) linhas.push(`Envio: ${pedido.transportadora}`);
  const atualizado = quandoAtualizou(pedido.atualizadoEm);
  if (atualizado) linhas.push(`Atualizado em ${atualizado}`);
  let link = null;
  try {
    if (pedido.linkDoRastreio && new URL(pedido.linkDoRastreio).protocol === "https:") link = pedido.linkDoRastreio;
  } catch {
    link = null;
  }
  return {
    titulo: TITULOS[pedido.status] ?? "Em andamento",
    tom: TOM[pedido.status] ?? "andamento",
    linhas,
    rastreio: pedido.rastreio ? { codigo: pedido.rastreio, link } : null,
  };
}

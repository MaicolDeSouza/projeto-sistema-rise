/**
 * Regras puras do rastreio da J&T nos pedidos de compra (spec 2026-11-23-rastreio-jt-nas-compras-design.md): quem e da
 * J&T, a leitura da resposta do PacoteVicio, a proxima leitura e a Situacao da lista. Sem banco e sem rede.
 */

const HORA_MS = 60 * 60 * 1000;
/** Pacote a caminho: lido a cada 6 h (spec). Muda poucas vezes por dia, e cada consulta gasta a cota do mes. */
export const INTERVALO_MS = 6 * HORA_MS;
/** A J&T nao achou: o codigo costuma aparecer um dia depois da etiqueta. */
export const ESPERA_NAO_ACHADO_MS = 24 * HORA_MS;
/** PacoteVicio fora do ar ou limite por minuto: nao cobrado, tenta logo. */
export const ESPERA_PASSAGEIRA_MS = HORA_MS;
export const LINK_DO_PACOTEVICIO = "https://pacotevicio.dev";
const MAXIMO_DE_EVENTOS = 50;

// Os dez status normalizados do PacoteVicio (documentacao lida em 23/11/2026). Status novo vira "unknown": a API avisa que
// pode criar outros sem aviso.
const ROTULOS = {
  pending: "Aguardando postagem",
  collected: "Postado",
  in_transit: "Em trânsito",
  out_for_delivery: "Saiu para entrega",
  available_for_pickup: "Aguardando retirada",
  tax: "Aguardando tributo",
  delivered: "Entregue",
  exception: "Problema na entrega",
  returned: "Devolvido",
  unknown: "Sem tradução",
};

export function situacaoConhecida(situacao) {
  return Object.hasOwn(ROTULOS, situacao ?? "") ? situacao : "unknown";
}

export function rotuloDaSituacao(situacao) {
  return ROTULOS[situacaoConhecida(situacao)];
}

/** Entregue ou devolvido: o rastreio acabou e nao e mais lido. */
export function encerrado(situacao) {
  return situacao === "delivered" || situacao === "returned";
}

export function problema(situacao) {
  return situacao === "exception" || situacao === "returned";
}

/** O codigo como a J&T aceita: sem espacos, em maiusculas. */
export function codigoDaJT(rastreio) {
  const codigo = String(rastreio ?? "").replace(/\s+/g, "").toUpperCase();
  return codigo || null;
}

/**
 * O pedido e da J&T? Pelo formato do codigo (15 digitos comecando com 888, o das compras do dono) ou pelo nome da
 * transportadora (do cadastro ou digitada). Os 15 digitos tambem sao do AliExpress/Cainiao, mas o pedido do AliExpress
 * nao passa por aqui (so origem RISE).
 */
export function ehDaJT({ rastreio, transportadora = null }) {
  const codigo = codigoDaJT(rastreio);
  if (!codigo) return false;
  if (/^888\d{12}$/.test(codigo)) return true;
  return /\bj\s*&?\s*t\b/i.test(String(transportadora ?? ""));
}

const data = (valor) => {
  if (!valor) return null;
  const lida = new Date(valor);
  return Number.isNaN(lida.getTime()) ? null : lida;
};

/**
 * A resposta do PacoteVicio no formato que o Rise guarda: a situacao atual (o ultimo evento), quando, a entrega e os
 * eventos do MAIS RECENTE ao mais antigo, com "Cidade (UF)". O evento de atribuicao do plano Basico ("Rastreio fornecido
 * por PacoteVicio.dev") fica: a licenca proibe esconde-lo.
 */
export function lerRespostaDoPacoteVicio(json) {
  const brutos = Array.isArray(json?.events) ? json.events : [];
  const eventos = brutos
    .map((evento) => {
      const cidade = evento?.location?.city ?? null;
      const uf = evento?.location?.state ?? null;
      return {
        em: data(evento?.timestamp)?.toISOString() ?? null,
        situacao: situacaoConhecida(evento?.status),
        descricao: String(evento?.description ?? evento?.courier_status_label ?? "").trim() || rotuloDaSituacao(evento?.status),
        local: cidade ? (uf ? `${cidade} (${uf})` : cidade) : null,
      };
    })
    .reverse()
    .slice(0, MAXIMO_DE_EVENTOS);
  return {
    situacao: json?.status ? situacaoConhecida(json.status) : (eventos[0]?.situacao ?? null),
    situacaoEm: data(json?.status_updated_at) ?? data(eventos[0]?.em),
    entregueEm: data(json?.delivered_at),
    eventos,
  };
}

/** Quando ler de novo: null = acabou (entregue ou devolvido). */
export function proximaLeituraDoRastreio({ situacao, achou, passageira = false, agora = new Date() }) {
  if (achou && encerrado(situacao)) return null;
  const espera = achou ? INTERVALO_MS : passageira ? ESPERA_PASSAGEIRA_MS : ESPERA_NAO_ACHADO_MS;
  return new Date(agora.getTime() + espera);
}

/**
 * A Situacao da lista pelo rastreio da J&T (os mesmos tons do AliExpress). Entregue com itens a lancar = "Aguardando
 * conferencia"; entregue e lancado = sem fase. O evento de atribuicao ("unknown") conta como a caminho.
 */
export function faseDoRastreio({ situacao, faltaLancar = 0 }) {
  switch (situacaoConhecida(situacao)) {
    case "delivered":
      return faltaLancar > 0 ? { rotulo: "Aguardando conferência", tom: "conferencia" } : null;
    case "exception":
    case "returned":
      return { rotulo: rotuloDaSituacao(situacao), tom: "problema" };
    case "pending":
      return { rotulo: "Aguardando envio", tom: "neutro" };
    case "collected":
      return { rotulo: "Postado", tom: "caminho" };
    case "out_for_delivery":
    case "available_for_pickup":
      return { rotulo: rotuloDaSituacao(situacao), tom: "entrega" };
    case "tax":
      return { rotulo: rotuloDaSituacao(situacao), tom: "alfandega" };
    default:
      return { rotulo: "Em trânsito", tom: "caminho" };
  }
}

const diaEMes = (valor) => new Date(valor).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/** O motivo do "!" da lista: so problema (falha na entrega, devolucao); entregue nao e "!" (regra do dono de 04/11/2026). */
export function alertaDoRastreio({ situacao, eventos = [] }) {
  if (!problema(situacao)) return null;
  const ultimo = (Array.isArray(eventos) ? eventos : [])[0];
  const texto = ultimo?.descricao || rotuloDaSituacao(situacao);
  return `Rastreio J&T: ${texto}${ultimo?.em ? ` (${diaEMes(ultimo.em)})` : ""}.`;
}

/** O mes da contagem de consultas, em Sao Paulo ("2026-11"). */
export function mesDaContagem(agora = new Date()) {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

/**
 * Status unificado do pedido e do envio (spec 5.7): as tabelas por origem sao dado, nao `if` espalhado.
 * Codigo que a tabela nao conhece NAO inventa status: mantem o anterior e volta `desconhecido: true`, que vira o
 * aviso `statusDesconhecido` (Tarefa 8). AGUARDANDO_PECAS nao nasce aqui (e a regra das pecas, Tarefa 8, que sobrepoe PAGO).
 * Sem imports: roda no servidor, no worker e no teste.
 */

const DIA_MS = 24 * 60 * 60 * 1000;
/** Entregue ha 30 dias sem reclamacao = finalizado; no Bling, 15 dias depois da saida = entregue. */
const DIAS_PARA_FINALIZAR = 30;
const DIAS_PARA_ENTREGAR_NO_BLING = 15;

export const STATUS = [
  "AGUARDANDO_PAGAMENTO",
  "PAGO",
  "AGUARDANDO_PECAS",
  "EM_SEPARACAO",
  "ENVIADO",
  "ENTREGUE",
  "FINALIZADO",
  "CANCELADO",
  "DEVOLVIDO",
];

export const TEXTO_DO_STATUS = {
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
  PAGO: "Pago",
  AGUARDANDO_PECAS: "Aguardando peças",
  EM_SEPARACAO: "Em separação",
  ENVIADO: "Enviado",
  ENTREGUE: "Entregue",
  FINALIZADO: "Finalizado",
  CANCELADO: "Cancelado",
  DEVOLVIDO: "Devolvido",
};

/** Classe do ponto colorido da lista (o mesmo desenho das listas de anuncios). */
export const COR_DO_STATUS = {
  AGUARDANDO_PAGAMENTO: "bg-amber-500",
  PAGO: "bg-sky-500",
  AGUARDANDO_PECAS: "bg-amber-500",
  EM_SEPARACAO: "bg-sky-500",
  ENVIADO: "bg-sky-500",
  ENTREGUE: "bg-emerald-500",
  FINALIZADO: "bg-emerald-500",
  CANCELADO: "bg-zinc-400",
  DEVOLVIDO: "bg-red-500",
};

export const TEXTO_DO_STATUS_DO_ENVIO = {
  SEM_ENVIO: "Sem envio",
  A_POSTAR: "A postar",
  POSTADO: "Postado",
  EM_TRANSITO: "Em trânsito",
  ENTREGUE: "Entregue",
  NAO_ENTREGUE: "Não entregue",
  DEVOLVIDO: "Devolvido",
  CANCELADO: "Cancelado",
};

export const COR_DO_STATUS_DO_ENVIO = {
  SEM_ENVIO: "bg-zinc-300",
  A_POSTAR: "bg-amber-500",
  POSTADO: "bg-sky-500",
  EM_TRANSITO: "bg-sky-500",
  ENTREGUE: "bg-emerald-500",
  NAO_ENTREGUE: "bg-red-500",
  DEVOLVIDO: "bg-red-500",
  CANCELADO: "bg-zinc-400",
};

// ---- Situacao: o status unico da lista de Vendas ----

/**
 * A coluna Status de Vendas mostra UM status (pedido do dono em 08/11/2026, Opcao 1: "em vendas o status tem 02
 * informacoes. Quero apenas 1"), juntando o do pedido e o do envio. As colunas gravadas (`status`, `statusDoEnvio`)
 * continuam as mesmas; a situacao e calculada delas, na linha (`situacaoDoPedido`) e no filtro (`condicaoDaSituacao`),
 * e as duas regras precisam dar sempre a mesma resposta (o teste:pedidos confere todas as combinacoes).
 */
export const SITUACOES = ["AGUARDANDO_PAGAMENTO", "AGUARDANDO_PECAS", "A_ENVIAR", "EM_TRANSITO", "ENTREGUE", "NAO_ENTREGUE", "DEVOLVIDO", "CANCELADO"];

export const TEXTO_DA_SITUACAO = {
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
  AGUARDANDO_PECAS: "Aguardando peças",
  A_ENVIAR: "A enviar",
  EM_TRANSITO: "Em trânsito",
  ENTREGUE: "Entregue",
  NAO_ENTREGUE: "Não entregue",
  DEVOLVIDO: "Devolvido",
  CANCELADO: "Cancelado",
};

/** Ambar = pede acao do operador, azul = andando, verde = terminou, vermelho = problema. */
export const COR_DA_SITUACAO = {
  AGUARDANDO_PAGAMENTO: "bg-amber-500",
  AGUARDANDO_PECAS: "bg-amber-500",
  A_ENVIAR: "bg-amber-500",
  EM_TRANSITO: "bg-sky-500",
  ENTREGUE: "bg-emerald-500",
  NAO_ENTREGUE: "bg-red-500",
  DEVOLVIDO: "bg-red-500",
  CANCELADO: "bg-zinc-400",
};

/** Envios que ja sairam das maos do operador (ou voltaram): com eles o pedido nao esta mais "a enviar". */
const ENVIO_QUE_SAIU = ["POSTADO", "EM_TRANSITO", "ENTREGUE", "NAO_ENTREGUE", "DEVOLVIDO"];

/** A situacao de um pedido, na ordem: cancelado, devolvido, nao entregue, entregue, em transito, e so entao o que falta fazer. */
export function situacaoDoPedido({ status, statusDoEnvio }) {
  if (status === "CANCELADO") return "CANCELADO";
  if (status === "DEVOLVIDO" || statusDoEnvio === "DEVOLVIDO") return "DEVOLVIDO";
  if (statusDoEnvio === "NAO_ENTREGUE") return "NAO_ENTREGUE";
  if (status === "ENTREGUE" || status === "FINALIZADO" || statusDoEnvio === "ENTREGUE") return "ENTREGUE";
  if (status === "ENVIADO" || statusDoEnvio === "POSTADO" || statusDoEnvio === "EM_TRANSITO") return "EM_TRANSITO";
  if (status === "AGUARDANDO_PAGAMENTO") return "AGUARDANDO_PAGAMENTO";
  if (status === "AGUARDANDO_PECAS") return "AGUARDANDO_PECAS";
  return "A_ENVIAR";
}

/** O `where` do Prisma de uma situacao: a mesma ordem de `situacaoDoPedido`, escrita como condicoes que nao se sobrepoem. */
export function condicaoDaSituacao(situacao) {
  const vivo = { status: { notIn: ["CANCELADO", "DEVOLVIDO"] } };
  switch (situacao) {
    case "CANCELADO":
      return { status: "CANCELADO" };
    case "DEVOLVIDO":
      return { status: { not: "CANCELADO" }, OR: [{ status: "DEVOLVIDO" }, { statusDoEnvio: "DEVOLVIDO" }] };
    case "NAO_ENTREGUE":
      return { ...vivo, statusDoEnvio: "NAO_ENTREGUE" };
    case "ENTREGUE":
      return { ...vivo, statusDoEnvio: { notIn: ["DEVOLVIDO", "NAO_ENTREGUE"] }, OR: [{ status: { in: ["ENTREGUE", "FINALIZADO"] } }, { statusDoEnvio: "ENTREGUE" }] };
    case "EM_TRANSITO":
      return {
        status: { notIn: ["CANCELADO", "DEVOLVIDO", "ENTREGUE", "FINALIZADO"] },
        statusDoEnvio: { notIn: ["DEVOLVIDO", "NAO_ENTREGUE", "ENTREGUE"] },
        OR: [{ status: "ENVIADO" }, { statusDoEnvio: { in: ["POSTADO", "EM_TRANSITO"] } }],
      };
    case "AGUARDANDO_PAGAMENTO":
    case "AGUARDANDO_PECAS":
      return { status: situacao, statusDoEnvio: { notIn: ENVIO_QUE_SAIU } };
    case "A_ENVIAR":
      return { status: { in: ["PAGO", "EM_SEPARACAO"] }, statusDoEnvio: { notIn: ENVIO_QUE_SAIU } };
    default:
      return null;
  }
}

/** Os status em que o pedido ja saiu das maos do operador: "em separacao" manual nao os sobrepoe. */
const FECHADOS = new Set(["ENVIADO", "ENTREGUE", "FINALIZADO", "CANCELADO", "DEVOLVIDO"]);

// ---- Pedido ----

/** ML: `order.status`. `paid` depende do envio (tabela abaixo). */
const PEDIDO_ML = {
  confirmed: "AGUARDANDO_PAGAMENTO",
  payment_required: "AGUARDANDO_PAGAMENTO",
  payment_in_process: "AGUARDANDO_PAGAMENTO",
  partially_paid: "AGUARDANDO_PAGAMENTO",
  paid: "PAGO",
  cancelled: "CANCELADO",
  invalid: "CANCELADO",
  pending_cancel: "CANCELADO",
};

/** ML pago: o `shipments.status` diz em que pe esta. Sem envio lido ou pendente = so pago. */
const PEDIDO_ML_PAGO_PELO_ENVIO = {
  pending: "PAGO",
  handling: "PAGO",
  ready_to_ship: "EM_SEPARACAO",
  shipped: "ENVIADO",
  not_delivered: "ENVIADO",
  delivered: "ENTREGUE",
  cancelled: "PAGO",
};

/** LI: `situacao.codigo` (lista medida em /v1/situacao em 04/11/2026). */
const PEDIDO_LI = {
  pedido_efetuado: "AGUARDANDO_PAGAMENTO",
  aguardando_pagamento: "AGUARDANDO_PAGAMENTO",
  pagamento_em_analise: "AGUARDANDO_PAGAMENTO",
  pedido_pago: "PAGO",
  pedido_em_separacao: "EM_SEPARACAO",
  pedido_pronto_retirada: "EM_SEPARACAO",
  pedido_enviado: "ENVIADO",
  pedido_entregue: "ENTREGUE",
  pedido_cancelado: "CANCELADO",
  pagamento_devolvido: "CANCELADO",
  pedido_devolvido: "DEVOLVIDO",
};

/** Bling: o NOME da situacao do modulo Vendas (sem caixa, sem acento). "Atendido" depende do envio. */
const PEDIDO_BLING = {
  "em aberto": "AGUARDANDO_PAGAMENTO",
  "em digitacao": "AGUARDANDO_PAGAMENTO",
  "em andamento": "PAGO",
  verificado: "PAGO",
  atendido: "ATENDIDO",
  cancelado: "CANCELADO",
};

function semAcento(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function dias(desde, agora) {
  if (!desde) return null;
  const inicio = new Date(desde).getTime();
  if (Number.isNaN(inicio)) return null;
  return (agora.getTime() - inicio) / DIA_MS;
}

/** Entregue ha 30 dias, sem a tag `not_delivered` do ML, vira finalizado. */
function finalizarSeVelho(status, { entregueEm, tags, agora }) {
  if (status !== "ENTREGUE") return status;
  if ((tags ?? []).includes("not_delivered")) return status;
  const passados = dias(entregueEm, agora);
  return passados !== null && passados >= DIAS_PARA_FINALIZAR ? "FINALIZADO" : status;
}

/**
 * ML: substatus do envio `ready_to_ship` em que o pacote JA SAIU das maos da loja (pedido do dono em 11/11/2026: o Rise
 * dizia "Atrasado" e a venda no ML dizia "a caminho"). No envio por agencia (xd_drop_off) o status continua
 * ready_to_ship depois da entrega na agencia; so o substatus muda (medido na VPS: 18195, 18196 e 18201 em
 * `in_packing_list`, o 18223 ainda em `printed`). `ready_to_print` e `printed` continuam a postar.
 */
export const SUBSTATUS_ML_JA_SAIU = new Set(["dropped_off", "picked_up", "in_hub", "in_packing_list"]);

const jaSaiuNoML = (envio) => envio?.statusDaOrigem === "ready_to_ship" && SUBSTATUS_ML_JA_SAIU.has(envio?.substatus);

function basePorOrigem({ origem, statusDaOrigem, tags, envio, agora, entregueEm }) {
  const codigo = statusDaOrigem ?? null;
  if (origem === "MERCADO_LIVRE") {
    const base = PEDIDO_ML[codigo] ?? null;
    if (base !== "PAGO") return base;
    const peloEnvio = jaSaiuNoML(envio) ? "ENVIADO" : (PEDIDO_ML_PAGO_PELO_ENVIO[envio?.statusDaOrigem] ?? "PAGO");
    return finalizarSeVelho(peloEnvio, { entregueEm: envio?.historico?.entregueEm ?? entregueEm, tags, agora });
  }
  if (origem === "LOJA_INTEGRADA") {
    const base = PEDIDO_LI[codigo] ?? null;
    // A LI nao tem "finalizado": o entregue ha 30 dias e finalizado, como no ML.
    return finalizarSeVelho(base, { entregueEm: envio?.historico?.entregueEm ?? entregueEm, tags: [], agora });
  }
  if (origem === "BLING") {
    const base = PEDIDO_BLING[semAcento(codigo)] ?? null;
    if (base !== "ATENDIDO") return base;
    // Atendido: a data de saida diz ha quanto tempo foi; so o rastreio diz que saiu; nada = ainda nas maos do operador.
    const saida = envio?.historico?.postadoEm ?? null;
    const passados = dias(saida, agora);
    if (passados !== null && passados >= DIAS_PARA_FINALIZAR) return "FINALIZADO";
    if (passados !== null && passados >= DIAS_PARA_ENTREGAR_NO_BLING) return "ENTREGUE";
    if (saida || envio?.rastreio) return "ENVIADO";
    return "PAGO";
  }
  return null;
}

/**
 * O status unificado de um pedido. `anterior` e o status gravado (para codigo desconhecido), `emSeparacao` a marca
 * manual do operador, `entregueEm` a data de entrega que o chamador conhece quando o envio nao a traz (a LI so a tem
 * no historico de situacoes), `agora` o relogio (o teste passa um fixo).
 */
export function statusDoPedido({
  origem,
  statusDaOrigem,
  tags = [],
  envio = {},
  devolucao = null,
  anterior = null,
  emSeparacao = false,
  entregueEm = null,
  agora = new Date(),
}) {
  if (origem === "MERCADO_LIVRE" && devolucao) return { status: "DEVOLVIDO", desconhecido: false };
  const base = basePorOrigem({ origem, statusDaOrigem, tags, envio, agora, entregueEm });
  if (!base) return { status: anterior ?? "AGUARDANDO_PAGAMENTO", desconhecido: true };
  if (emSeparacao && !FECHADOS.has(base) && base !== "AGUARDANDO_PAGAMENTO") return { status: "EM_SEPARACAO", desconhecido: false };
  return { status: base, desconhecido: false };
}

// ---- Envio ----

const ENVIO_ML = {
  pending: "A_POSTAR",
  handling: "A_POSTAR",
  ready_to_ship: "A_POSTAR",
  shipped: "EM_TRANSITO",
  delivered: "ENTREGUE",
  not_delivered: "NAO_ENTREGUE",
  cancelled: "CANCELADO",
};

/** LI pelo Enviali (`tracking_status`, ou o `status` da etiqueta quando ainda nao rastreia). */
const ENVIO_ENVIALI = {
  created: "A_POSTAR",
  billed: "A_POSTAR",
  posted: "POSTADO",
  transit: "EM_TRANSITO",
  delayed: "EM_TRANSITO",
  delivering: "EM_TRANSITO",
  pickup: "EM_TRANSITO",
  delivered: "ENTREGUE",
  returned: "NAO_ENTREGUE",
  returning: "NAO_ENTREGUE",
  lost: "NAO_ENTREGUE",
  damaged: "NAO_ENTREGUE",
  seized: "NAO_ENTREGUE",
  disposed: "NAO_ENTREGUE",
  cancelled: "CANCELADO",
  cancelling: "CANCELADO",
};

/** LI sem Enviali: so a situacao do pedido diz onde o pacote esta. */
const ENVIO_LI_PELA_SITUACAO = {
  pedido_enviado: "EM_TRANSITO",
  pedido_entregue: "ENTREGUE",
  pedido_devolvido: "NAO_ENTREGUE",
};

/** Formas de envio da LI que nao tem pacote (a loja escreve o `tipo` da forma). */
const SEM_PACOTE_NA_LI = new Set(["retirada", "combinar", "a_combinar", "sem_envio"]);

/** Onde esta o pacote. `envio` e o do pedido normalizado; `devolucao` so vem do ML. */
export function statusDoEnvio({ origem, envio = {}, devolucao = null }) {
  if (devolucao) return "DEVOLVIDO";
  const codigo = envio?.statusDaOrigem ?? null;
  if (origem === "MERCADO_LIVRE") {
    if (!codigo && !envio?.tipo && !envio?.rastreio) return "SEM_ENVIO";
    if (jaSaiuNoML(envio)) return "POSTADO";
    return ENVIO_ML[codigo] ?? "A_POSTAR";
  }
  if (origem === "LOJA_INTEGRADA") {
    const tipo = String(envio?.tipo ?? "").toLowerCase();
    if (!tipo || SEM_PACOTE_NA_LI.has(tipo)) return "SEM_ENVIO";
    if (tipo === "enviali") return ENVIO_ENVIALI[codigo] ?? "A_POSTAR";
    return ENVIO_LI_PELA_SITUACAO[envio?.situacaoDoPedido] ?? "A_POSTAR";
  }
  if (origem === "BLING") {
    if (envio?.historico?.postadoEm) return "EM_TRANSITO";
    if (envio?.rastreio) return "POSTADO";
    return envio?.tipo ? "A_POSTAR" : "SEM_ENVIO";
  }
  return "SEM_ENVIO";
}

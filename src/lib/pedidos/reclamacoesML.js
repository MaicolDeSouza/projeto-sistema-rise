import { prisma } from "@/lib/db";
import { clienteML } from "@/lib/canaisDeVenda/ml/cliente";

import { GRUPOS, TEXTO_DA_CHEGADA, TEXTO_DA_NOTA, grupoDoMotivo, situacaoDaChegada, situacaoDaNota, textoDoMotivo } from "./reclamacoesTextos";

export { GRUPOS, grupoDoMotivo } from "./reclamacoesTextos";

/**
 * Reclamacoes do Mercado Livre (20/11/2026, Opcao 1 do dono). A rotina `reclamacoesML` do worker le as reclamacoes da conta
 * (so GET), guarda uma linha por reclamacao com o grupo do motivo e se afeta a reputacao, e marca o pedido com reclamacao
 * ABERTA como `emMediacao`: a venda vira "Em mediação", sai do faturamento e do lucro e o lucro nao fecha.
 *
 * API (medida na conta em 20/11/2026): `GET /post-purchase/v1/claims/search?status=opened|closed` (exige um filtro),
 * `/claims/reasons/{reason_id}` (name, detail, flow) e `/claims/{id}/affects-reputation` (affected | not_affected; 403 em
 * algumas antigas). A reclamacao e de um pedido (`resource: order`) ou de um envio (`shipment`, e o pedido sai do envio).
 */

const POR_PAGINA = 50;
/// A devolucao so e procurada nas reclamacoes destes 90 dias (o ML devolve 404 na que nao tem devolucao).
const NOVENTA_DIAS_MS = 90 * 24 * 60 * 60 * 1000;
/// A devolucao nestas situacoes nao muda mais: nao e relida.
const DEVOLUCAO_ENCERRADA = ["delivered", "cancelled", "expired", "closed"];
const DEVOLUCAO_POSTADA = ["shipped", "pending_delivered", "delivered", "not_delivered"];
/// Freio da primeira carga (a conta tinha 346 em 20/11/2026): 40 paginas de 50.
const MAXIMO_DE_PAGINAS = 40;
const SESSENTA_DIAS_MS = 60 * 24 * 60 * 60 * 1000;

const texto = (valor) => (valor === null || valor === undefined || valor === "" ? null : String(valor));
const data = (valor) => {
  const d = valor ? new Date(valor) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

async function buscar(ml, status, { ateConhecidas }) {
  const achadas = [];
  for (let pagina = 0; pagina < MAXIMO_DE_PAGINAS; pagina++) {
    const resposta = await ml.get("/post-purchase/v1/claims/search", { status, limit: POR_PAGINA, offset: pagina * POR_PAGINA, sort: "date_created:desc" });
    if (!resposta?.ok) throw new Error(`o Mercado Livre respondeu ${resposta?.status ?? "erro"} na lista de reclamações`);
    const pagina_ = resposta.dados?.data ?? [];
    achadas.push(...pagina_);
    if (pagina_.length < POR_PAGINA) break;
    // Depois da primeira carga: uma pagina inteira ja conhecida e sem mudanca encerra (as mais novas vem primeiro).
    if (ateConhecidas && pagina_.every(ateConhecidas)) break;
  }
  return achadas;
}

/**
 * Uma volta da rotina. Nunca lanca: `{ ok, lidas, novas, atualizadas, abertas }` ou `{ ok: false, erro }`.
 * `lidas` = reclamacoes que o ML listou nesta volta; `novas`/`atualizadas` = as que foram gravadas.
 */
export async function lerReclamacoesML({ ml = clienteML(), agora = new Date(), prefixo = null } = {}) {
  try {
    const conhecidas = new Map((await prisma.reclamacaoML.findMany({ select: { id: true, status: true, atualizadaEm: true, afetaReputacao: true } })).map((r) => [r.id, r]));
    const igual = (c) => {
      const guardada = conhecidas.get(String(c.id));
      return Boolean(guardada) && guardada.status === c.status && (guardada.atualizadaEm?.getTime() ?? null) === (data(c.last_updated)?.getTime() ?? null);
    };
    const abertas = await buscar(ml, "opened", { ateConhecidas: null });
    const fechadas = await buscar(ml, "closed", { ateConhecidas: conhecidas.size > 0 ? igual : null });
    const listadas = new Map([...abertas, ...fechadas].map((c) => [String(c.id), c]));
    // A que o Rise tem como aberta e o ML nao listou mais (fechou e ficou fora da primeira pagina): le uma a uma.
    for (const [id, guardada] of conhecidas) {
      if (guardada.status !== "opened" || listadas.has(id)) continue;
      const uma = await ml.get(`/post-purchase/v1/claims/${encodeURIComponent(id)}`);
      if (uma?.ok && uma.dados?.id) listadas.set(id, uma.dados);
    }

    const motivos = new Map();
    const motivoDe = async (id) => {
      if (!id) return null;
      if (!motivos.has(id)) {
        const lido = await ml.get(`/post-purchase/v1/claims/reasons/${encodeURIComponent(id)}`);
        motivos.set(id, lido?.ok ? lido.dados : null);
      }
      return motivos.get(id);
    };

    let novas = 0;
    let atualizadas = 0;
    for (const [id, c] of listadas) {
      const guardada = conhecidas.get(id);
      // Sem mudanca e com a reputacao ja lida: nada a fazer (a aberta rele a reputacao, que o ML decide ao longo do caso).
      if (guardada && igual(c) && (c.status !== "opened" || guardada.afetaReputacao !== null)) continue;
      const motivo = await motivoDe(c.reason_id);
      const reputacao = await ml.get(`/post-purchase/v1/claims/${encodeURIComponent(id)}/affects-reputation`);
      const afeta = reputacao?.ok ? (reputacao.dados?.affects_reputation === "affected" ? true : reputacao.dados?.affects_reputation === "not_affected" ? false : null) : null;
      let pedidoNumero = c.resource === "order" ? texto(c.resource_id) : null;
      if (!pedidoNumero && c.resource === "shipment" && c.resource_id) {
        const envio = await ml.get(`/shipments/${encodeURIComponent(c.resource_id)}`);
        pedidoNumero = envio?.ok ? texto(envio.dados?.order_id) : null;
      }
      const pedido = pedidoNumero ? await prisma.pedidoDeVenda.findFirst({ where: { origem: "MERCADO_LIVRE", idExterno: pedidoNumero }, select: { id: true } }) : null;
      const dados = {
        recurso: String(c.resource ?? ""),
        recursoId: String(c.resource_id ?? ""),
        pedidoNumero,
        pedidoId: pedido?.id ?? null,
        tipo: String(c.type ?? ""),
        etapa: texto(c.stage),
        status: String(c.status ?? ""),
        motivoId: texto(c.reason_id),
        motivoNome: texto(motivo?.name),
        motivoDetalhe: texto(motivo?.detail),
        grupo: grupoDoMotivo({ nome: motivo?.name, fluxo: motivo?.flow }),
        // A reputacao que o ML deixou de responder (403 numa antiga) nao apaga a que ja estava lida.
        afetaReputacao: afeta ?? guardada?.afetaReputacao ?? null,
        resolucao: texto(c.resolution?.reason),
        abertaEm: data(c.date_created) ?? agora,
        atualizadaEm: data(c.last_updated),
        lidoEm: agora,
      };
      await prisma.reclamacaoML.upsert({ where: { id }, create: { id, ...dados }, update: dados });
      if (guardada) atualizadas++;
      else novas++;
    }

    // A venda que entrou no Rise depois da reclamacao (ou a reclamacao lida antes do pedido): liga agora.
    const soltas = await prisma.reclamacaoML.findMany({ where: { pedidoId: null, pedidoNumero: { not: null }, abertaEm: { gte: new Date(agora.getTime() - SESSENTA_DIAS_MS) } }, select: { id: true, pedidoNumero: true } });
    for (const solta of soltas) {
      const pedido = await prisma.pedidoDeVenda.findFirst({ where: { origem: "MERCADO_LIVRE", idExterno: solta.pedidoNumero }, select: { id: true } });
      if (pedido) await prisma.reclamacaoML.update({ where: { id: solta.id }, data: { pedidoId: pedido.id } });
    }

    const devolucoes = await lerDevolucoes(ml, agora, prefixo);
    const emAberto = await marcarPedidosEmMediacao();
    await marcarNotasDeDevolucao();
    return { ok: true, lidas: listadas.size, novas, atualizadas, abertas: emAberto, devolucoes };
  } catch (erro) {
    console.error("[reclamacoes ML]", erro?.message ?? erro);
    return { ok: false, erro: String(erro?.message ?? erro) };
  }
}

/**
 * Deixa `PedidoDeVenda.emMediacao` igual ao que as reclamacoes dizem: ligado em quem tem reclamacao ABERTA (o lucro reabre e
 * o aviso entra), desligado nos outros (o aviso sai; a proxima leitura do pedido volta a fechar o lucro). Devolve quantos
 * pedidos estao em mediacao.
 */
export async function marcarPedidosEmMediacao() {
  const abertas = await prisma.reclamacaoML.findMany({ where: { status: "opened", pedidoId: { not: null } }, select: { pedidoId: true }, distinct: ["pedidoId"] });
  const ids = abertas.map((r) => r.pedidoId);
  const aLigar = ids.length ? await prisma.pedidoDeVenda.findMany({ where: { id: { in: ids }, emMediacao: false }, select: { id: true, avisos: true } }) : [];
  for (const pedido of aLigar) {
    await prisma.pedidoDeVenda.update({ where: { id: pedido.id }, data: { emMediacao: true, lucroFechado: false, avisos: [...new Set([...(pedido.avisos ?? []), "emMediacao"])] } });
  }
  const aDesligar = await prisma.pedidoDeVenda.findMany({ where: { emMediacao: true, id: { notIn: ids } }, select: { id: true, avisos: true } });
  for (const pedido of aDesligar) {
    await prisma.pedidoDeVenda.update({ where: { id: pedido.id }, data: { emMediacao: false, avisos: (pedido.avisos ?? []).filter((aviso) => aviso !== "emMediacao") } });
  }
  return ids.length;
}

const filtroDoPeriodo = ({ desde, ate, prefixo, grupo, afeta, status, nota } = {}) => ({
  ...(desde || ate ? { abertaEm: { ...(desde ? { gte: desde } : {}), ...(ate ? { lt: ate } : {}) } } : {}),
  // `prefixo` e do teste (so as reclamacoes dele).
  ...(prefixo ? { id: { startsWith: prefixo } } : {}),
  ...(GRUPOS.includes(grupo) ? { grupo } : {}),
  ...(afeta === "sim" ? { afetaReputacao: true } : afeta === "nao" ? { afetaReputacao: false } : {}),
  ...(status === "opened" || status === "closed" ? { status } : {}),
  // A nota de devolucao: "falta" = postada sem a nota marcada; "emitida" = com a nota.
  ...(nota === "falta" ? { devolucaoStatus: { in: DEVOLUCAO_POSTADA }, notaDevolucaoEm: null } : nota === "emitida" ? { notaDevolucaoEm: { not: null } } : {}),
});

/**
 * As reclamacoes do periodo por grupo de motivo, separadas pelo efeito na reputacao (o numero que o dono pediu).
 * @returns {Promise<{ total: number, abertas: number, afetam: number, grupos: Array<{ grupo, naoAfeta, afeta, semDado, total }> }>}
 */
export async function resumoDasReclamacoes(filtro = {}) {
  const where = filtroDoPeriodo({ desde: filtro.desde, ate: filtro.ate, prefixo: filtro.prefixo });
  const [porGrupo, abertas, faltaNota, notaEmitida] = await Promise.all([
    prisma.reclamacaoML.groupBy({ by: ["grupo", "afetaReputacao"], where, _count: { _all: true } }),
    prisma.reclamacaoML.count({ where: { ...where, status: "opened" } }),
    prisma.reclamacaoML.count({ where: { ...where, ...filtroDoPeriodo({ nota: "falta" }) } }),
    prisma.reclamacaoML.count({ where: { ...where, ...filtroDoPeriodo({ nota: "emitida" }) } }),
  ]);
  const grupos = GRUPOS.map((grupo) => ({ grupo, naoAfeta: 0, afeta: 0, semDado: 0, total: 0 }));
  for (const linha of porGrupo) {
    const alvo = grupos.find((g) => g.grupo === linha.grupo) ?? grupos.at(-1);
    const quantos = linha._count._all;
    if (linha.afetaReputacao === true) alvo.afeta += quantos;
    else if (linha.afetaReputacao === false) alvo.naoAfeta += quantos;
    else alvo.semDado += quantos;
    alvo.total += quantos;
  }
  return { total: grupos.reduce((soma, g) => soma + g.total, 0), abertas, afetam: grupos.reduce((soma, g) => soma + g.afeta, 0), grupos, faltaNota, notaEmitida };
}

const ORDENACOES = { data: "abertaEm", grupo: "grupo", tipo: "tipo", status: "status", reputacao: "afetaReputacao" };

/** A lista da tela: da mais nova para a mais antiga (ou pelo cabecalho), com o pedido do Rise quando ele existe. */
export async function listarReclamacoes({ pagina = 1, porPagina = 25, ordenar = null, direcao = null, ...filtro } = {}) {
  const where = filtroDoPeriodo(filtro);
  const campo = ORDENACOES[ordenar];
  const orderBy = campo ? [{ [campo]: direcao === "asc" ? "asc" : "desc" }, { abertaEm: "desc" }] : [{ abertaEm: "desc" }];
  const [total, linhas] = await Promise.all([
    prisma.reclamacaoML.count({ where }),
    prisma.reclamacaoML.findMany({ where, orderBy, skip: (Math.max(1, pagina) - 1) * porPagina, take: porPagina, include: { pedido: { select: { id: true, numero: true, nomeDoComprador: true, total: true } } } }),
  ]);
  return {
    total,
    linhas: linhas.map((r) => ({
      id: r.id,
      abertaEm: r.abertaEm,
      tipo: r.tipo,
      status: r.status,
      grupo: r.grupo,
      motivo: textoDoMotivo({ nome: r.motivoNome, detalhe: r.motivoDetalhe }) ?? r.motivoId ?? null,
      afetaReputacao: r.afetaReputacao,
      resolucao: r.resolucao,
      pedidoNumero: r.pedidoNumero,
      pedido: r.pedido ? { id: r.pedido.id, numero: r.pedido.numero, cliente: r.pedido.nomeDoComprador, total: Number(r.pedido.total) } : null,
      devolucao: {
        id: r.id,
        nota: situacaoDaNota({ status: r.devolucaoStatus, notaEm: r.notaDevolucaoEm }),
        notaNumero: r.notaDevolucaoNumero,
        chegada: situacaoDaChegada(r.devolucaoStatus),
        postadaEm: r.devolucaoPostadaEm,
        entregueEm: r.devolucaoEntregueEm,
      },
    })),
  };
}

/**
 * Le a devolucao de cada reclamacao destes 90 dias que ainda pode mudar: a nunca lida, a aberta (a mediacao ganha devolucao
 * no meio do caso) e a devolucao em andamento. A reclamacao nao muda o `last_updated` quando o cliente posta, por isso a
 * devolucao e relida por conta propria. Postada, as datas vem do envio de volta (`/shipments/{id}`: date_shipped e
 * date_delivered, medidos em 20/11/2026). Devolve quantas foram lidas.
 */
async function lerDevolucoes(ml, agora, prefixo) {
  const candidatas = await prisma.reclamacaoML.findMany({
    where: {
      abertaEm: { gte: new Date(agora.getTime() - NOVENTA_DIAS_MS) },
      // `prefixo` e do teste: com um ML falso, as reclamacoes de verdade do banco responderiam 404 e seriam marcadas sem devolucao.
      ...(prefixo ? { id: { startsWith: prefixo } } : {}),
      OR: [{ devolucaoLidaEm: null }, { status: "opened" }, { devolucaoStatus: { not: null, notIn: DEVOLUCAO_ENCERRADA } }],
    },
    select: { id: true, devolucaoPostadaEm: true, devolucaoEntregueEm: true },
  });
  let lidas = 0;
  for (const r of candidatas) {
    const resposta = await ml.get(`/post-purchase/v2/claims/${encodeURIComponent(r.id)}/returns`);
    if (resposta?.status === 404) {
      await prisma.reclamacaoML.update({ where: { id: r.id }, data: { devolucaoLidaEm: agora } });
      continue;
    }
    // 401/403/500: tenta de novo na proxima volta, sem marcar como lida.
    if (!resposta?.ok || !resposta.dados) continue;
    const d = resposta.dados;
    const status = texto(d.status);
    const envioDeVolta = (d.shipments ?? []).find((e) => e?.type === "return") ?? d.shipments?.[0] ?? null;
    let postadaEm = r.devolucaoPostadaEm;
    let entregueEm = r.devolucaoEntregueEm;
    const postada = DEVOLUCAO_POSTADA.includes(status);
    if (postada && envioDeVolta?.shipment_id && (!postadaEm || (status === "delivered" && !entregueEm))) {
      const envio = await ml.get(`/shipments/${encodeURIComponent(envioDeVolta.shipment_id)}`);
      if (envio?.ok) {
        postadaEm = postadaEm ?? data(envio.dados?.status_history?.date_shipped);
        entregueEm = entregueEm ?? data(envio.dados?.status_history?.date_delivered);
      }
    }
    // Postada sem a data do envio (o ML nao respondeu): a hora em que o Rise viu, para o aviso sair mesmo assim.
    if (postada && !postadaEm) postadaEm = agora;
    await prisma.reclamacaoML.update({
      where: { id: r.id },
      data: { devolucaoStatus: status, devolucaoSubtipo: texto(d.subtype), devolucaoPostadaEm: postadaEm, devolucaoEntregueEm: entregueEm, devolucaoLidaEm: agora },
    });
    lidas++;
  }
  return lidas;
}

/**
 * Deixa `PedidoDeVenda.notaDeDevolucao` igual ao que as devolucoes dizem: "FALTA" no pedido com devolucao postada sem a nota
 * marcada (liga o aviso `notaDeDevolucao`), "EMITIDA" quando todas as postadas tem a nota, nulo nos outros. Com a nota em
 * jogo, o aviso antigo `nfACancelar` sai: a NF de venda nao se cancela depois que a mercadoria circulou (168 h no RS e so sem
 * circulacao), o certo e a nota de devolucao. `soDoPedido` restringe a um pedido (o botao da tela).
 */
export async function marcarNotasDeDevolucao({ soDoPedido = null } = {}) {
  const postadas = await prisma.reclamacaoML.findMany({
    where: { pedidoId: soDoPedido ?? { not: null }, devolucaoStatus: { in: DEVOLUCAO_POSTADA } },
    select: { pedidoId: true, notaDevolucaoEm: true },
  });
  const devido = new Map();
  for (const r of postadas) {
    if (!r.notaDevolucaoEm) devido.set(r.pedidoId, "FALTA");
    else if (!devido.has(r.pedidoId)) devido.set(r.pedidoId, "EMITIDA");
  }
  const pedidos = await prisma.pedidoDeVenda.findMany({
    where: soDoPedido ? { id: soDoPedido } : { OR: [{ id: { in: [...devido.keys()] } }, { notaDeDevolucao: { not: null } }] },
    select: { id: true, notaDeDevolucao: true, avisos: true },
  });
  for (const pedido of pedidos) {
    const valor = devido.get(pedido.id) ?? null;
    const antes = pedido.avisos ?? [];
    const avisos = new Set(antes);
    if (valor === "FALTA") avisos.add("notaDeDevolucao");
    else avisos.delete("notaDeDevolucao");
    if (valor) avisos.delete("nfACancelar");
    const mudou = valor !== pedido.notaDeDevolucao || avisos.size !== antes.length || [...avisos].some((a) => !antes.includes(a));
    if (mudou) await prisma.pedidoDeVenda.update({ where: { id: pedido.id }, data: { notaDeDevolucao: valor, avisos: [...avisos] } });
  }
}

/**
 * O operador marca (ou desmarca, `emitida: false`) a nota de devolucao de uma reclamacao. So vale para a devolucao postada:
 * antes de o cliente postar nao ha o que emitir. Devolve `{ ok, pedidoId }` ou `{ ok: false, erro }`.
 */
export async function marcarNotaDeDevolucao({ reclamacaoId, numero = null, por = null, emitida = true, agora = new Date() } = {}) {
  const r = reclamacaoId ? await prisma.reclamacaoML.findUnique({ where: { id: String(reclamacaoId) }, select: { id: true, pedidoId: true, devolucaoStatus: true } }) : null;
  if (!r) return { ok: false, erro: "Reclamação não encontrada." };
  if (!DEVOLUCAO_POSTADA.includes(r.devolucaoStatus)) return { ok: false, erro: "A devolução ainda não foi postada." };
  const numeroLimpo = texto(String(numero ?? "").trim().slice(0, 20));
  await prisma.reclamacaoML.update({
    where: { id: r.id },
    data: emitida ? { notaDevolucaoEm: agora, notaDevolucaoNumero: numeroLimpo, notaDevolucaoPor: texto(por) } : { notaDevolucaoEm: null, notaDevolucaoNumero: null, notaDevolucaoPor: null },
  });
  if (r.pedidoId) await marcarNotasDeDevolucao({ soDoPedido: r.pedidoId });
  return { ok: true, pedidoId: r.pedidoId };
}

const DIA_SP = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
const celula = (valor) => {
  const t = valor === null || valor === undefined ? "" : String(valor);
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/**
 * A lista das devolucoes POSTADAS no mes (em Sao Paulo), para o contador abater a receita: pedido, data da venda, valor, NF
 * de venda, a nota de devolucao e se o produto chegou. Tambem em CSV (separado por ";", que o Excel em portugues abre).
 * `mes` = "AAAA-MM". `prefixo` e do teste.
 */
export async function devolucoesDoMes({ mes, prefixo = null } = {}) {
  const partes = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(mes ?? ""));
  if (!partes) return { ok: false, erro: "Mês inválido." };
  const ano = Number(partes[1]);
  const m = Number(partes[2]);
  // Meia-noite de Sao Paulo e 03:00 em UTC (sem horario de verao desde 2019).
  const desde = new Date(Date.UTC(ano, m - 1, 1, 3));
  const ate = new Date(Date.UTC(m === 12 ? ano + 1 : ano, m === 12 ? 0 : m, 1, 3));
  const linhas = await prisma.reclamacaoML.findMany({
    where: { devolucaoPostadaEm: { gte: desde, lt: ate }, ...(prefixo ? { id: { startsWith: prefixo } } : {}) },
    orderBy: { devolucaoPostadaEm: "asc" },
    include: { pedido: { select: { id: true, numero: true, dataDaVenda: true, total: true, nf: true } } },
  });
  const lista = linhas.map((r) => ({
    id: r.id,
    postadaEm: r.devolucaoPostadaEm,
    pedidoNumero: r.pedido?.numero ?? r.pedidoNumero,
    pedidoId: r.pedido?.id ?? null,
    dataDaVenda: r.pedido?.dataDaVenda ?? null,
    valor: r.pedido ? Number(r.pedido.total) : null,
    parcial: r.devolucaoSubtipo === "return_partial",
    nfDeVenda: r.pedido?.nf?.numero ? `${r.pedido.nf.numero}${r.pedido.nf.serie ? `-${r.pedido.nf.serie}` : ""}` : null,
    nota: situacaoDaNota({ status: r.devolucaoStatus, notaEm: r.notaDevolucaoEm }),
    notaNumero: r.notaDevolucaoNumero,
    chegada: situacaoDaChegada(r.devolucaoStatus),
    entregueEm: r.devolucaoEntregueEm,
  }));
  const cabecalho = ["Postada em", "Pedido", "Data da venda", "Valor da venda", "Devolução parcial", "NF de venda", "Nota de devolução", "Nº da nota de devolução", "Produto", "Chegou em"];
  const corpo = lista.map((l) =>
    [
      DIA_SP.format(l.postadaEm),
      l.pedidoNumero,
      l.dataDaVenda ? DIA_SP.format(l.dataDaVenda) : "",
      l.valor === null ? "" : l.valor.toFixed(2).replace(".", ","),
      l.parcial ? "Sim" : "Não",
      l.nfDeVenda,
      TEXTO_DA_NOTA[l.nota] ?? "",
      l.notaNumero,
      TEXTO_DA_CHEGADA[l.chegada] ?? "",
      l.entregueEm ? DIA_SP.format(l.entregueEm) : "",
    ]
      .map(celula)
      .join(";"),
  );
  return { ok: true, linhas: lista, csv: [cabecalho.join(";"), ...corpo].join("\n") };
}

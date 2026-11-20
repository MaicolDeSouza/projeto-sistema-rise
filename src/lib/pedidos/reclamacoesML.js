import { prisma } from "@/lib/db";
import { clienteML } from "@/lib/canaisDeVenda/ml/cliente";

import { GRUPOS, grupoDoMotivo, textoDoMotivo } from "./reclamacoesTextos";

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
export async function lerReclamacoesML({ ml = clienteML(), agora = new Date() } = {}) {
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

    const emAberto = await marcarPedidosEmMediacao();
    return { ok: true, lidas: listadas.size, novas, atualizadas, abertas: emAberto };
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

const filtroDoPeriodo = ({ desde, ate, prefixo, grupo, afeta, status } = {}) => ({
  ...(desde || ate ? { abertaEm: { ...(desde ? { gte: desde } : {}), ...(ate ? { lt: ate } : {}) } } : {}),
  // `prefixo` e do teste (so as reclamacoes dele).
  ...(prefixo ? { id: { startsWith: prefixo } } : {}),
  ...(GRUPOS.includes(grupo) ? { grupo } : {}),
  ...(afeta === "sim" ? { afetaReputacao: true } : afeta === "nao" ? { afetaReputacao: false } : {}),
  ...(status === "opened" || status === "closed" ? { status } : {}),
});

/**
 * As reclamacoes do periodo por grupo de motivo, separadas pelo efeito na reputacao (o numero que o dono pediu).
 * @returns {Promise<{ total: number, abertas: number, afetam: number, grupos: Array<{ grupo, naoAfeta, afeta, semDado, total }> }>}
 */
export async function resumoDasReclamacoes(filtro = {}) {
  const where = filtroDoPeriodo({ desde: filtro.desde, ate: filtro.ate, prefixo: filtro.prefixo });
  const [porGrupo, abertas] = await Promise.all([
    prisma.reclamacaoML.groupBy({ by: ["grupo", "afetaReputacao"], where, _count: { _all: true } }),
    prisma.reclamacaoML.count({ where: { ...where, status: "opened" } }),
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
  return { total: grupos.reduce((soma, g) => soma + g.total, 0), abertas, afetam: grupos.reduce((soma, g) => soma + g.afeta, 0), grupos };
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
    })),
  };
}

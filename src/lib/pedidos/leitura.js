import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { config } from "@/lib/integracoes/config";
import { clienteML } from "@/lib/canaisDeVenda/ml/cliente";
import { clienteLI } from "@/lib/canaisDeVenda/li/cliente";
import { clienteBling } from "@/lib/blingSync/cliente";
import { normalizarPedidoML } from "@/lib/pedidos/ml";
import { normalizarPedidoLI } from "@/lib/pedidos/li";
import { classificarLojaDoBling, normalizarPedidoBling } from "@/lib/pedidos/bling";
import { adiarConferenciaDoMercadoPago, aplicarPedidoLido, espelharNoBling, marcarFalhaDoMercadoPago, pedidosParaConferirNoMercadoPago, pedidosParaReconferir, reabrirLucroDoPedido } from "@/lib/pedidos/banco";

/**
 * A leitura dos pedidos por origem (spec 5.2): a rotina `pedidos` do worker, a cada 5 min, pede a cada origem so o que
 * mudou desde o cursor dela e passa cada pedido por `aplicarPedidoLido`. Falha numa origem nao para as outras; falha
 * num pedido nao para a origem. O Bling nao vira pedido quando e a copia de uma venda do ML ou da LI (so o espelho), e
 * uma loja que o Rise nao le (Shopee) e contada, nao gravada.
 */

export const ROTINA_PEDIDOS = "pedidos";
const ORIGENS = ["MERCADO_LIVRE", "LOJA_INTEGRADA", "BLING"];
const DEZ_MINUTOS_MS = 10 * 60 * 1000;
const UMA_HORA_MS = 60 * 60 * 1000;
const UM_DIA_MS = 24 * 60 * 60 * 1000;
const PAGINA_ML = 50;
// A busca de pedidos da LI recusa mais de 50 por pagina (medido na VPS em 04/11/2026: 400 "entre 0 e 50").
const PAGINA_LI = 50;
const PAGINA_BLING = 100;
const TETO_DE_PAGINAS = 200;
const TETO_DE_ESPELHOS_PENDENTES = 500;

// ---- Datas no fuso de Sao Paulo (as tres origens filtram em hora local) ----

const formatoSP = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const naiveSP = (data) => formatoSP.format(new Date(data)).replace(" ", "T");
const diaSP = (data) => naiveSP(data).slice(0, 10);
// O ML quer o deslocamento explicito; o Brasil nao tem horario de verao desde 2019, entao Sao Paulo e sempre -03:00.
const isoSP = (data) => `${naiveSP(data)}.000-03:00`;
const antes = (data, ms) => new Date(new Date(data).getTime() - ms);

// ---- Respostas ----

function deuCerto(resposta) {
  if (!resposta) return false;
  if (typeof resposta.ok === "boolean") return resposta.ok;
  return Number(resposta.status) >= 200 && Number(resposta.status) < 300;
}

function recusa(resposta, rota) {
  const detalhe = resposta?.dados?.message ?? resposta?.dados?.error ?? resposta?.dados?.erro ?? "";
  return new Error(`${rota} respondeu ${resposta?.status ?? "sem status"}${detalhe ? ` (${String(detalhe).slice(0, 120)})` : ""}`);
}

/** O `dados` de uma resposta que tem de dar certo. */
async function exigir(promessa, rota) {
  const resposta = await promessa;
  if (!deuCerto(resposta)) throw recusa(resposta, rota);
  return resposta.dados;
}

/** O `dados` de uma resposta em que 404 (e 403, no ML) significa "nao existe" e vira null. */
async function opcional(promessa, rota, { codigos = [404] } = {}) {
  const resposta = await promessa;
  if (deuCerto(resposta)) return resposta.dados;
  if (codigos.includes(Number(resposta?.status))) return null;
  throw recusa(resposta, rota);
}

// ---- Um pedido por origem ----

async function lerPedidoML(ml, idExterno) {
  const id = String(idExterno);
  const order = await exigir(ml.get(`/orders/${id}`), `GET /orders/${id}`);
  // O documento do comprador nem sempre e liberado (403): o pedido entra sem cliente, com o aviso.
  const billing = await opcional(ml.get(`/orders/${id}/billing_info`), `GET /orders/${id}/billing_info`, { codigos: [403, 404] });
  const shipments = (await opcional(ml.get(`/orders/${id}/shipments`), `GET /orders/${id}/shipments`)) ?? [];
  const lista = Array.isArray(shipments) ? shipments : [];
  const idDaIda = lista.find((e) => e?.type !== "return")?.id ?? order?.shipping?.id ?? null;
  const idDoRetorno = lista.find((e) => e?.type === "return")?.id ?? null;
  const lerEnvio = (envioId) =>
    envioId ? opcional(ml.get(`/shipments/${envioId}`, { views: "destination" }, { headers: { "X-Api-Version": "2" } }), `GET /shipments/${envioId}`) : null;
  const shipment = await lerEnvio(idDaIda);
  const retorno = await lerEnvio(idDoRetorno);
  // O frete da loja mora nos custos do envio (o `order_cost` do envio e o valor do pedido, medido em 04/11/2026).
  const lerCustos = (envioId) => (envioId ? opcional(ml.get(`/shipments/${envioId}/costs`), `GET /shipments/${envioId}/costs`) : null);
  const custos = await lerCustos(idDaIda);
  const custosDoRetorno = await lerCustos(idDoRetorno);
  const usuario = await ml.usuarioId();
  const invoice = await opcional(ml.get(`/users/${usuario}/invoices/orders/${id}`), `GET /users/${usuario}/invoices/orders/${id}`);
  // O prazo de deixar na agencia, so enquanto a postar (08/11/2026). 404 = envio sem prazo ainda (ex.: "manufacturing");
  // qualquer falha deixa o pedido sem o prazo, nunca sem o pedido.
  const aPostar = ["pending", "handling", "ready_to_ship"].includes(String(shipment?.status ?? ""));
  const sla = aPostar && idDaIda ? await opcional(ml.get(`/shipments/${idDaIda}/sla`), `GET /shipments/${idDaIda}/sla`).catch(() => null) : null;
  const mercadoPago = await lerMercadoPago(ml, order, idDaIda);
  return normalizarPedidoML({ order, billing, shipments: lista, shipment, retorno, invoice, custos, custosDoRetorno, sla, mercadoPago });
}

/**
 * Os pagamentos da venda no Mercado Pago e o do frete pago pelo comprador (achado pelo id do envio), com o token do ML
 * (09/11/2026; ver lib/pedidos/mercadoPago.js). Falha aqui nunca derruba a leitura do pedido: sem o Mercado Pago, o
 * pedido entra como antes e a conferencia tenta de novo depois.
 */
async function lerMercadoPago(ml, order, envioId) {
  if (typeof ml?.mp !== "function") return null;
  try {
    const pagamentos = [];
    for (const pagamento of Array.isArray(order?.payments) ? order.payments : []) {
      if (!pagamento?.id) continue;
      const lido = await opcional(ml.mp(`/v1/payments/${pagamento.id}`), `GET mercadopago /v1/payments/${pagamento.id}`);
      if (lido) pagamentos.push(lido);
    }
    const busca = envioId ? await opcional(ml.mp("/v1/payments/search", { external_reference: String(envioId) }), `GET mercadopago /v1/payments/search?external_reference=${envioId}`) : null;
    const frete = Array.isArray(busca?.results) ? busca.results : [];
    // A venda tem pagamento e o Mercado Pago nao achou nenhum (404): falha, nao "venda sem pagamento".
    const esperados = (Array.isArray(order?.payments) ? order.payments : []).filter((p) => p?.id).length;
    if (esperados > 0 && pagamentos.length === 0) return { pagamentos, frete, erro: `nenhum dos ${esperados} pagamento(s) achado no Mercado Pago (404)` };
    return { pagamentos, frete };
  } catch (erro) {
    // A falha aparece no log do worker (conferirMercadoPagoPendentes); o pedido segue sem o Mercado Pago.
    return { pagamentos: [], frete: [], erro: erro?.message ?? String(erro) };
  }
}

async function lerPedidoLI(li, idExterno) {
  const numero = String(idExterno);
  const pedido = await exigir(li.get(`/pedido/${numero}`), `GET /pedido/${numero}`);
  const historico = (await exigir(li.get("/situacao_historico/search", { numero, limit: 50 }), `GET /situacao_historico/search?numero=${numero}`))?.objects ?? [];
  // A etiqueta do Enviali e outro servico (a raiz, fora do /v1): fora do ar, o frete fica "estimado" ate a proxima volta.
  let etiquetas = [];
  try {
    const lidas = await exigir(li.get("/enviali/v2/postage", { search: numero }, { base: "raiz", headers: { "x-correlation-id": randomUUID() } }), `GET /enviali/v2/postage?search=${numero}`);
    etiquetas = Array.isArray(lidas) ? lidas : (lidas?.results ?? lidas?.objects ?? []);
  } catch {
    etiquetas = [];
  }
  // A NF da LI nao vem no pedido: ele so aponta para ela (`/api/v1/pedido_nf/{id}`, o nome do campo e medido na 1a NF;
  // por isso a procura e no JSON inteiro). Sem NF ou fora do ar, o pedido entra sem ela e a proxima leitura tenta de novo.
  const idDaNota = JSON.stringify(pedido ?? {}).match(/\/api\/v1\/pedido_nf\/(\d+)/)?.[1] ?? null;
  const nf = idDaNota ? await opcional(li.get(`/pedido_nf/${idDaNota}`), `GET /pedido_nf/${idDaNota}`).catch(() => null) : null;
  return normalizarPedidoLI({ pedido, historico, etiquetas, nf });
}

/** As listas do Bling que todo pedido usa (formas de pagamento e situacoes de Vendas), lidas uma vez por volta. */
async function apoioDoBling(bling) {
  const formas = (await exigir(bling.get("/formas-pagamentos"), "GET /formas-pagamentos"))?.data ?? [];
  const modulos = (await exigir(bling.get("/situacoes/modulos"), "GET /situacoes/modulos"))?.data ?? [];
  const vendas = modulos.find((m) => String(m?.nome ?? "").toLowerCase() === "vendas") ?? null;
  const situacoes = vendas ? ((await exigir(bling.get(`/situacoes/modulos/${vendas.id}`), `GET /situacoes/modulos/${vendas.id}`))?.data ?? []) : [];
  return { formas, situacoes };
}

async function lerPedidoBling(bling, idExterno, apoio, pedidoJaLido = null) {
  const id = String(idExterno);
  const pedido = pedidoJaLido ?? (await exigir(bling.get(`/pedidos/vendas/${id}`), `GET /pedidos/vendas/${id}`))?.data;
  if (!pedido) throw new Error(`GET /pedidos/vendas/${id} veio sem data`);
  const { formas, situacoes } = apoio ?? (await apoioDoBling(bling));
  const notaId = Number(pedido?.notaFiscal?.id ?? 0);
  const nfe = notaId > 0 ? ((await opcional(bling.get(`/nfe/${notaId}`), `GET /nfe/${notaId}`))?.data ?? null) : null;
  return normalizarPedidoBling({ pedido, formas, situacoes, nfe });
}

/** Um pedido da origem, normalizado (as chamadas da spec 5.2). `apoio` e o das listas do Bling, quando ja lidas. */
export async function lerPedidoDaOrigem(origem, idExterno, { ml = null, li = null, bling = null, apoio = null } = {}) {
  if (origem === "MERCADO_LIVRE") return lerPedidoML(ml ?? clienteML(), idExterno);
  if (origem === "LOJA_INTEGRADA") return lerPedidoLI(li ?? clienteLI(), idExterno);
  if (origem === "BLING") return lerPedidoBling(bling ?? clienteBling(), idExterno, apoio);
  throw new Error(`Origem desconhecida: ${origem}`);
}

// ---- A lista do que mudou, por origem ----

async function listarIdsML(ml, { cursor, desde, agora }) {
  const seller = await ml.usuarioId();
  const filtro = cursor ? { "order.date_last_updated.from": isoSP(antes(cursor, DEZ_MINUTOS_MS)) } : { "order.date_created.from": isoSP(desde) };
  const ids = [];
  for (let pagina = 0; pagina < TETO_DE_PAGINAS; pagina += 1) {
    const offset = pagina * PAGINA_ML;
    const dados = await exigir(ml.get("/orders/search", { seller, ...filtro, sort: "date_asc", limit: PAGINA_ML, offset }), "GET /orders/search");
    const resultados = Array.isArray(dados?.results) ? dados.results : [];
    for (const order of resultados) if (order?.id !== undefined && order?.id !== null) ids.push(String(order.id));
    const total = Number(dados?.paging?.total ?? 0);
    if (resultados.length < PAGINA_ML || offset + PAGINA_ML >= total) break;
  }
  void agora;
  return [...new Set(ids)];
}

async function listarIdsLI(li, { cursor, desde }) {
  const filtro = cursor ? { since_atualizado: naiveSP(antes(cursor, DEZ_MINUTOS_MS)) } : { since_criado: naiveSP(desde) };
  const ids = [];
  for (let pagina = 0; pagina < TETO_DE_PAGINAS; pagina += 1) {
    const offset = pagina * PAGINA_LI;
    const dados = await exigir(li.get("/pedido/search", { ...filtro, limit: PAGINA_LI, offset }), "GET /pedido/search");
    const objetos = Array.isArray(dados?.objects) ? dados.objects : [];
    for (const pedido of objetos) if (pedido?.numero !== undefined && pedido?.numero !== null) ids.push(String(pedido.numero));
    const total = Number(dados?.meta?.total_count ?? 0);
    if (objetos.length < PAGINA_LI || offset + PAGINA_LI >= total) break;
  }
  return [...new Set(ids)];
}

async function listarResumosBling(bling, { cursor, desde, agora }) {
  // A granularidade do filtro de alteracao do Bling e o dia: um dia para tras cobre a volta anterior com folga.
  const filtro = cursor
    ? { dataAlteracaoInicial: diaSP(antes(cursor, UM_DIA_MS)), dataAlteracaoFinal: diaSP(agora) }
    : { dataInicial: diaSP(desde), dataFinal: diaSP(agora) };
  const resumos = [];
  for (let pagina = 1; pagina <= TETO_DE_PAGINAS; pagina += 1) {
    const dados = await exigir(bling.get("/pedidos/vendas", { ...filtro, pagina, limite: PAGINA_BLING }), "GET /pedidos/vendas");
    const lista = Array.isArray(dados?.data) ? dados.data : [];
    resumos.push(...lista);
    if (lista.length < PAGINA_BLING) break;
  }
  return resumos;
}

async function nomesDasLojasDoBling(bling) {
  try {
    const dados = await exigir(bling.get("/canais-venda"), "GET /canais-venda");
    return new Map((Array.isArray(dados?.data) ? dados.data : []).map((canal) => [String(canal?.id), canal?.descricao ?? null]));
  } catch {
    return new Map();
  }
}

/**
 * Tudo o que mudou numa origem desde o cursor (ou desde o corte, na carga inicial), ja normalizado. Devolve tambem os
 * espelhos do Bling (pedidos de la que sao copia de uma venda do ML/LI), as lojas ignoradas e as falhas por pedido.
 */
export async function lerPedidosDaOrigem(origem, { ml = null, li = null, bling = null, cursor = null, desde = config.pedidos.desde, agora = new Date() } = {}) {
  const resultado = { normalizados: [], espelhos: [], ignorados: {}, cursorNovo: new Date(agora), falhas: [] };
  const tentar = async (idExterno, leitura) => {
    try {
      resultado.normalizados.push(await leitura());
    } catch (erro) {
      resultado.falhas.push({ idExterno: String(idExterno), erro: erro?.message ?? String(erro) });
    }
  };

  if (origem === "MERCADO_LIVRE") {
    const cliente = ml ?? clienteML();
    for (const id of await listarIdsML(cliente, { cursor, desde, agora })) await tentar(id, () => lerPedidoML(cliente, id));
    return resultado;
  }
  if (origem === "LOJA_INTEGRADA") {
    const cliente = li ?? clienteLI();
    for (const numero of await listarIdsLI(cliente, { cursor, desde })) await tentar(numero, () => lerPedidoLI(cliente, numero));
    return resultado;
  }
  if (origem === "BLING") {
    const cliente = bling ?? clienteBling();
    const resumos = await listarResumosBling(cliente, { cursor, desde, agora });
    let apoio = null;
    let nomes = null;
    for (const resumo of resumos) {
      const id = resumo?.id;
      if (id === undefined || id === null) continue;
      const classe = classificarLojaDoBling(resumo?.loja?.id);
      if (classe === "bling") {
        apoio = apoio ?? (await apoioDoBling(cliente));
        await tentar(id, () => lerPedidoBling(cliente, id, apoio));
      } else if (classe === "espelhoML" || classe === "espelhoLI") {
        resultado.espelhos.push({
          origem: classe === "espelhoML" ? "MERCADO_LIVRE" : "LOJA_INTEGRADA",
          numeroLoja: String(resumo?.numeroLoja ?? ""),
          blingPedidoId: String(id),
          blingNumero: resumo?.numero === undefined || resumo?.numero === null ? null : String(resumo.numero),
        });
      } else {
        nomes = nomes ?? (await nomesDasLojasDoBling(cliente));
        const nome = nomes.get(String(resumo?.loja?.id)) ?? `loja ${resumo?.loja?.id}`;
        resultado.ignorados[nome] = (resultado.ignorados[nome] ?? 0) + 1;
      }
    }
    return resultado;
  }
  throw new Error(`Origem desconhecida: ${origem}`);
}

// ---- A rotina ----

async function lerMemoria() {
  const linha = await prisma.rotinaDoWorker.findUnique({ where: { id: ROTINA_PEDIDOS }, select: { dados: true } });
  const dados = linha?.dados && typeof linha.dados === "object" ? linha.dados : {};
  return {
    cursores: dados.cursores && typeof dados.cursores === "object" ? { ...dados.cursores } : {},
    espelhosPendentes: Array.isArray(dados.espelhosPendentes) ? [...dados.espelhosPendentes] : [],
  };
}

async function gravarMemoria(dados) {
  await prisma.rotinaDoWorker.upsert({ where: { id: ROTINA_PEDIDOS }, create: { id: ROTINA_PEDIDOS, dados }, update: { dados } });
}

async function marcarLeituraFalhou(origem, idExterno) {
  const pedido = await prisma.pedidoDeVenda.findUnique({ where: { origem_idExterno: { origem, idExterno: String(idExterno) } }, select: { id: true, avisos: true } });
  if (!pedido || pedido.avisos.includes("leituraFalhou")) return;
  await prisma.pedidoDeVenda.update({ where: { id: pedido.id }, data: { avisos: [...pedido.avisos, "leituraFalhou"] } });
}

/**
 * Pedido do ML ou da LI vendido ha mais de 1 h e ainda sem a copia no Bling ganha o aviso `espelhoNoBlingAusente`
 * (spec 5.9): o Bling e quem emite a NF, entao venda que nao chegou la e venda sem nota. `espelharNoBling` o tira.
 */
export async function marcarEspelhosAusentes(agora = new Date()) {
  const pedidos = await prisma.pedidoDeVenda.findMany({
    where: {
      origem: { in: ["MERCADO_LIVRE", "LOJA_INTEGRADA"] },
      blingPedidoId: null,
      status: { not: "CANCELADO" },
      dataDaVenda: { lt: antes(agora, UMA_HORA_MS) },
      NOT: { avisos: { has: "espelhoNoBlingAusente" } },
    },
    select: { id: true, avisos: true },
  });
  for (const pedido of pedidos) {
    await prisma.pedidoDeVenda.update({ where: { id: pedido.id }, data: { avisos: [...pedido.avisos, "espelhoNoBlingAusente"] } });
  }
  return pedidos.length;
}

/**
 * Uma volta da rotina: le as tres origens, aplica cada pedido, casa os espelhos do Bling, marca os espelhos ausentes
 * e guarda o cursor por origem. Nunca lanca por uma origem so; `motivo: "erro"` so quando nenhuma origem respondeu.
 */
export async function rodarLeituraDePedidos({ ml = null, li = null, bling = null, agora = new Date(), taxas = null, origens = ORIGENS } = {}) {
  const clientes = { ml: ml ?? clienteML(), li: li ?? clienteLI(), bling: bling ?? clienteBling() };
  const memoria = await lerMemoria();
  const cursores = { ...memoria.cursores };
  let espelhos = [...memoria.espelhosPendentes];
  const ignorados = {};
  const detalhes = [];
  let lidos = 0;
  let criados = 0;
  let origensForaDoAr = 0;

  for (const origem of origens) {
    let leitura;
    try {
      leitura = await lerPedidosDaOrigem(origem, { ...clientes, cursor: memoria.cursores[origem] ? new Date(memoria.cursores[origem]) : null, agora });
    } catch (erro) {
      origensForaDoAr += 1;
      detalhes.push({ origem, idExterno: null, erro: erro?.message ?? String(erro) });
      continue;
    }
    let falhasDaOrigem = leitura.falhas.length;
    for (const falha of leitura.falhas) {
      detalhes.push({ origem, ...falha });
      await marcarLeituraFalhou(origem, falha.idExterno).catch(() => {});
    }
    for (const normalizado of leitura.normalizados) {
      try {
        const aplicado = await aplicarPedidoLido(normalizado, { cliente: clientes.ml, taxas, agora });
        if (aplicado?.ignorado) continue;
        lidos += 1;
        if (aplicado?.criado) criados += 1;
      } catch (erro) {
        falhasDaOrigem += 1;
        detalhes.push({ origem, idExterno: String(normalizado?.idExterno ?? ""), erro: erro?.message ?? String(erro) });
        await marcarLeituraFalhou(origem, normalizado?.idExterno).catch(() => {});
      }
    }
    espelhos.push(...leitura.espelhos);
    for (const [loja, n] of Object.entries(leitura.ignorados)) ignorados[loja] = (ignorados[loja] ?? 0) + n;
    // O cursor so avanca quando a origem inteira foi lida: um pedido que falhou volta na proxima volta.
    if (falhasDaOrigem === 0) cursores[origem] = leitura.cursorNovo.toISOString();
  }

  // Espelhos do Bling: casa com o pedido do ML/LI; o que ainda nao chegou fica pendente para a proxima volta.
  const pendentes = [];
  for (const espelho of espelhos) {
    const casou = espelho?.numeroLoja ? await espelharNoBling(espelho.origem, espelho.numeroLoja, espelho).catch(() => false) : false;
    if (!casou) pendentes.push(espelho);
  }
  espelhos = pendentes.slice(-TETO_DE_ESPELHOS_PENDENTES);

  const reconferidos = await reconferirPedidosPendentes({ ...clientes, agora, taxas }).catch((erro) => ({ conferidos: 0, falhas: 1, erros: [erro?.message ?? String(erro)] }));
  // O Mercado Pago (09/11/2026): os pedidos do ML sem o que foi creditado ou com o dinheiro ainda nao liberado.
  const doMercadoPago = origens.includes("MERCADO_LIVRE") ? await conferirMercadoPagoPendentes({ ml: clientes.ml, agora, taxas }).catch((erro) => ({ conferidos: 0, falhas: 1, erros: [erro?.message ?? String(erro)] })) : { conferidos: 0, falhas: 0, erros: [] };
  const espelhosAusentes = await marcarEspelhosAusentes(agora);
  const erros = detalhes.length;
  await gravarMemoria({ cursores, espelhosPendentes: espelhos, ignoradosPorLoja: ignorados, lidos, criados, erros, ultimaVoltaEm: new Date(agora).toISOString() });

  if (origensForaDoAr === origens.length) {
    return { ok: false, motivo: "erro", erro: detalhes.map((d) => `${d.origem}: ${d.erro}`).join("; "), lidos, criados, erros, ignorados, detalhes };
  }
  return {
    lidos,
    criados,
    erros,
    falhas: erros,
    ignorados,
    espelhosPendentes: espelhos.length,
    espelhosAusentes,
    reconferidos: reconferidos.conferidos,
    reconferirErros: reconferidos.erros,
    mercadoPagoConferidos: doMercadoPago.conferidos,
    mercadoPagoErros: doMercadoPago.erros,
    aviso: erros > 0 ? `${erros} falha(s)` : null,
    detalhes,
  };
}

// ---- A fila dos webhooks (fase 2) ----

const TENTATIVAS_DA_FILA = 5;

/**
 * Le e aplica um recurso notificado. Devolve sem lancar quando o aviso nao pede leitura (loja que o Rise ignora, NF de
 * um pedido que nao esta aqui, pedido apagado no Bling); lanca quando a leitura falha, para a linha tentar de novo.
 */
async function tratarRecurso(origem, recurso, clientes, memoria, agora) {
  const aplicar = (normalizado) => aplicarPedidoLido(normalizado, { cliente: clientes.ml, agora });

  if (origem === "MERCADO_LIVRE") {
    const [, tipo, id] = String(recurso).split("/");
    if (!id) return;
    if (tipo === "orders") return aplicar(await lerPedidoML(clientes.ml, id));
    if (tipo === "shipments") {
      // O aviso do envio traz so o id dele: o pedido sai do proprio envio.
      const envio = await exigir(clientes.ml.get(`/shipments/${id}`), `GET /shipments/${id}`);
      if (!envio?.order_id) throw new Error(`GET /shipments/${id} veio sem order_id`);
      return aplicar(await lerPedidoML(clientes.ml, envio.order_id));
    }
    return;
  }

  if (origem === "BLING") {
    const separador = String(recurso).lastIndexOf(":");
    const evento = String(recurso).slice(0, separador);
    const id = String(recurso).slice(separador + 1);
    // Apagado no Bling: nao ha o que reler (a rotina de 5 min nao o traz mais).
    if (evento.endsWith(".deleted")) return;
    if (evento.startsWith("invoice.")) {
      const pedido = await prisma.pedidoDeVenda.findFirst({ where: { origem: "BLING", nf: { path: ["idExterno"], equals: id } }, select: { idExterno: true } });
      if (!pedido) return;
      memoria.apoio = memoria.apoio ?? (await apoioDoBling(clientes.bling));
      return aplicar(await lerPedidoBling(clientes.bling, pedido.idExterno, memoria.apoio));
    }
    if (!evento.startsWith("order.")) return;
    const lido = (await exigir(clientes.bling.get(`/pedidos/vendas/${id}`), `GET /pedidos/vendas/${id}`))?.data;
    if (!lido) throw new Error(`GET /pedidos/vendas/${id} veio sem data`);
    const classe = classificarLojaDoBling(lido?.loja?.id);
    if (classe === "bling") {
      memoria.apoio = memoria.apoio ?? (await apoioDoBling(clientes.bling));
      return aplicar(await lerPedidoBling(clientes.bling, id, memoria.apoio, lido));
    }
    if (classe === "espelhoML" || classe === "espelhoLI") {
      // A copia que o Bling fez da venda do canal: so anota o espelho. O pedido do canal que ainda nao chegou e
      // casado pela rotina de 5 min (ela guarda o espelho pendente).
      const blingNumero = lido?.numero === undefined || lido?.numero === null ? null : String(lido.numero);
      await espelharNoBling(classe === "espelhoML" ? "MERCADO_LIVRE" : "LOJA_INTEGRADA", String(lido?.numeroLoja ?? ""), { blingPedidoId: id, blingNumero });
    }
    return;
  }

  if (origem === "LOJA_INTEGRADA") {
    const numero = String(recurso).replace(/^pedido:/, "");
    // A LI pode avisar sem dizer o numero (o formato real e medido na 1a notificacao): le pelo cursor, so a LI.
    if (!numero || numero === "?") {
      const volta = await rodarLeituraDePedidos({ ...clientes, agora, origens: ["LOJA_INTEGRADA"] });
      if (volta?.motivo === "erro") throw new Error(volta.erro);
      return;
    }
    return aplicar(await lerPedidoLI(clientes.li, numero));
  }
}

/**
 * Esvazia a fila das notificacoes dos canais (spec 5.11), a cada volta do worker. Agrupa pelo recurso (dez avisos do
 * mesmo pedido = uma leitura). Sucesso marca todas as linhas do grupo; falha soma uma tentativa e, na 5a, desiste (a
 * rotina de 5 min continua cobrindo o pedido). `ids` restringe a linhas certas (o teste, para nao tocar a fila real).
 */
export async function processarNotificacoes({ ml = null, li = null, bling = null, limite = 20, agora = new Date(), ids = null } = {}) {
  const linhas = await prisma.notificacaoDePedido.findMany({
    where: { processadaEm: null, tentativas: { lt: TENTATIVAS_DA_FILA }, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: { recebidaEm: "asc" },
    take: limite * 10,
    select: { id: true, origem: true, recurso: true, tentativas: true },
  });
  if (linhas.length === 0) return { processadas: 0, erros: 0 };

  const grupos = new Map();
  for (const linha of linhas) {
    const chave = `${linha.origem} ${linha.recurso}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(linha);
  }

  const clientes = { ml: ml ?? clienteML(), li: li ?? clienteLI(), bling: bling ?? clienteBling() };
  const memoria = { apoio: null };
  let processadas = 0;
  let erros = 0;
  for (const grupo of [...grupos.values()].slice(0, limite)) {
    const { origem, recurso } = grupo[0];
    try {
      await tratarRecurso(origem, recurso, clientes, memoria, agora);
      await prisma.notificacaoDePedido.updateMany({ where: { id: { in: grupo.map((l) => l.id) } }, data: { processadaEm: new Date(agora), erro: null } });
      processadas += grupo.length;
    } catch (erro) {
      erros += 1;
      const texto = String(erro?.message ?? erro).slice(0, 200);
      for (const linha of grupo) {
        const tentativas = linha.tentativas + 1;
        await prisma.notificacaoDePedido.update({
          where: { id: linha.id },
          data: { tentativas, erro: texto, ...(tentativas >= TENTATIVAS_DA_FILA ? { processadaEm: new Date(agora) } : {}) },
        });
      }
    }
  }
  return { processadas, erros };
}

/**
 * Relê da origem os pedidos que ja tinham aviso (sem custo, produto nao conferido, sem estimativa) e cujo produto ou
 * anuncio mudou no Rise depois (pedido do dono em 09/11/2026). Sem isso o pedido antigo nunca saia do aviso: a rotina so
 * le o que mudou na origem. Nunca lanca; uma falha deixa o pedido para a proxima volta.
 */
export async function reconferirPedidosPendentes({ ml = null, li = null, bling = null, agora = new Date(), taxas = null, idsExternos = null } = {}) {
  const resultado = { conferidos: 0, falhas: 0, erros: [] };
  let lista;
  try {
    lista = await pedidosParaReconferir({ idsExternos });
  } catch (erro) {
    resultado.erros.push(`lista: ${erro?.message ?? erro}`);
    return resultado;
  }
  for (const pedido of lista) {
    try {
      // A versao de 09/11/2026 chamava a leitura sem o numero do pedido e o erro sumia no catch: nenhum pedido era relido.
      const normalizado = await lerPedidoDaOrigem(pedido.origem, pedido.idExterno, { ml, li, bling });
      // O lucro fechado sem custo nunca se refaz sozinho; aqui ele ainda esta em aberto de verdade (so depois de ler a origem).
      if (pedido.semCusto) await reabrirLucroDoPedido(pedido.id);
      await aplicarPedidoLido(normalizado, { cliente: ml ?? clienteML(), taxas, agora });
      resultado.conferidos += 1;
    } catch (erro) {
      resultado.falhas += 1;
      if (resultado.erros.length < 5) resultado.erros.push(`${pedido.origem} ${pedido.idExterno}: ${erro?.message ?? erro}`);
    }
  }
  return resultado;
}

/**
 * Relê os pedidos do ML que ainda nao tem o Mercado Pago ou cujo dinheiro nao foi liberado (09/11/2026; ver
 * `pedidosParaConferirNoMercadoPago`). A releitura e a do pedido inteiro, que ja traz o Mercado Pago e refaz a conferencia
 * com o Real. Nunca lanca; os erros voltam no resultado para o log do worker.
 */
export async function conferirMercadoPagoPendentes({ ml = null, agora = new Date(), taxas = null, idsExternos = null, limite = 10 } = {}) {
  const resultado = { conferidos: 0, falhas: 0, erros: [] };
  let lista;
  try {
    lista = await pedidosParaConferirNoMercadoPago({ agora, idsExternos, limite });
  } catch (erro) {
    resultado.erros.push(`lista: ${erro?.message ?? erro}`);
    return resultado;
  }
  const cliente = ml ?? clienteML();
  for (const pedido of lista) {
    try {
      const normalizado = await lerPedidoDaOrigem(pedido.origem, pedido.idExterno, { ml: cliente });
      await aplicarPedidoLido(normalizado, { cliente, taxas, agora });
      // O pedido foi relido, mas o Mercado Pago nao respondeu: vai para o log e a proxima tentativa e em 6 h.
      if (normalizado.mercadoPagoErro) {
        await marcarFalhaDoMercadoPago(pedido.id, normalizado.mercadoPagoErro, agora);
        resultado.falhas += 1;
        if (resultado.erros.length < 5) resultado.erros.push(`${pedido.idExterno}: ${normalizado.mercadoPagoErro}`);
        continue;
      }
      resultado.conferidos += 1;
    } catch (erro) {
      resultado.falhas += 1;
      if (resultado.erros.length < 5) resultado.erros.push(`${pedido.idExterno}: ${erro?.message ?? erro}`);
      await adiarConferenciaDoMercadoPago(pedido.id, agora).catch(() => {});
    }
  }
  return resultado;
}

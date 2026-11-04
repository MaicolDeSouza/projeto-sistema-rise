import { createHmac, timingSafeEqual } from "node:crypto";

import { prisma } from "@/lib/db";
import { lerSegredo } from "@/lib/integracoes/conexoes";
import { config } from "@/lib/integracoes/config";

/**
 * As notificacoes dos canais (webhooks, fase 2 dos Pedidos de venda, spec 5.11). A rota publica confere QUEM mandou e
 * grava a linha na fila; quem le o pedido e o worker, com o proprio token (uma notificacao falsa so faz o Rise reler um
 * pedido que ele ja le a cada 5 min).
 *
 * - ML: nao ha assinatura; confere `user_id` = o vendedor conectado e `application_id` = o app do Rise.
 * - Bling: `X-Bling-Signature-256` = "sha256=" + HMAC-SHA256 do corpo CRU com o client secret do app do Rise.
 * - LI: o token que o Rise gerou ao ligar as notificacoes, em algum header (o nome real e medido na 1a notificacao).
 */

export const ORIGEM_DA_ROTA = { "mercado-livre": "MERCADO_LIVRE", "loja-integrada": "LOJA_INTEGRADA", bling: "BLING" };

const TOPICOS_DO_ML = new Set(["orders_v2", "shipments"]);
const HEADERS_DO_TOKEN_DA_LI = ["token", "x-token", "x-webhook-token", "authorization", "x-li-token"];

const recusa = (erro) => ({ ok: false, status: 401, erro });

function iguaisSemVazar(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Confere uma notificacao. Devolve `{ ok: true, recurso, payload }` (recurso null = aviso que o Rise nao usa, ignorado)
 * ou `{ ok: false, status, erro }`. Pura: os segredos vem de fora (`segredosDosWebhooks`).
 */
export function conferirNotificacao({ origem, corpoTexto, headers, segredos }) {
  let payload;
  try {
    payload = JSON.parse(corpoTexto || "null");
  } catch {
    return { ok: false, status: 400, erro: "O corpo não é JSON." };
  }
  if (!payload || typeof payload !== "object") return { ok: false, status: 400, erro: "O corpo não é um objeto JSON." };

  if (origem === "MERCADO_LIVRE") {
    if (!segredos?.mlUsuarioId || !segredos?.mlClientId) return recusa("O Mercado Livre não está conectado.");
    if (String(payload.user_id) !== String(segredos.mlUsuarioId)) return recusa("Notificação de outra conta do ML.");
    if (String(payload.application_id) !== String(segredos.mlClientId)) return recusa("Notificação de outro app do ML.");
    const recurso = TOPICOS_DO_ML.has(payload.topic) && typeof payload.resource === "string" ? payload.resource : null;
    return { ok: true, recurso, payload };
  }

  if (origem === "BLING") {
    if (!segredos?.blingClientSecret) return recusa("O Bling não está configurado.");
    const recebida = String(headers.get("x-bling-signature-256") ?? "").trim();
    const esperada = "sha256=" + createHmac("sha256", segredos.blingClientSecret).update(corpoTexto).digest("hex");
    if (!iguaisSemVazar(recebida, esperada)) return recusa("Assinatura do Bling inválida.");
    const evento = typeof payload.event === "string" ? payload.event : null;
    const id = payload.data?.id;
    const recurso = evento && id !== undefined && id !== null ? `${evento}:${id}` : null;
    return { ok: true, recurso, payload };
  }

  if (origem === "LOJA_INTEGRADA") {
    if (!segredos?.liToken) return recusa("As notificações da LI não foram ligadas pelo Rise.");
    const valores = HEADERS_DO_TOKEN_DA_LI.map((nome) => String(headers.get(nome) ?? "").replace(/^Bearer\s+/i, "").trim());
    if (!valores.some((valor) => iguaisSemVazar(valor, segredos.liToken))) return recusa("Token da LI inválido.");
    const numero = payload.numero ?? payload.pedido_numero ?? payload.pedido?.numero ?? payload.id ?? null;
    return { ok: true, recurso: numero !== null && numero !== undefined && numero !== "" ? `pedido:${numero}` : "pedido:?", payload };
  }

  return { ok: false, status: 404, erro: "Canal desconhecido." };
}

/** Os segredos que a conferencia usa, lidos do banco e do .env SEM rede (a rota tem de responder em milissegundos). */
export async function segredosDosWebhooks() {
  const [ml, li] = await Promise.all([lerSegredo("MERCADO_LIVRE").catch(() => null), lerSegredo("LOJA_INTEGRADA").catch(() => null)]);
  return {
    mlUsuarioId: ml?.userId ? String(ml.userId) : null,
    mlClientId: config.mercadoLivre.clientId || null,
    blingClientSecret: config.bling.clientSecret || null,
    liToken: li?.webhookToken || null,
  };
}

/** Grava a notificacao na fila; recurso nulo (aviso que o Rise nao usa) nao grava. */
export async function registrarNotificacao({ origem, recurso, payload }) {
  if (!recurso) return { id: null };
  const linha = await prisma.notificacaoDePedido.create({ data: { origem, recurso, payload: payload ?? {} }, select: { id: true } });
  return { id: linha.id };
}

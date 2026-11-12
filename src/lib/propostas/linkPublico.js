import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/db";
import { config } from "@/lib/integracoes/config";
import { lerProposta } from "@/lib/propostas/banco";

/**
 * O LINK PUBLICO da proposta (spec 2026-11-12, extra C), no molde do pedido de compra (`compras/linkPublico.js`): uma
 * chave aleatoria de 43 caracteres por proposta, criada no primeiro clique e nunca trocada, e o endereco
 * `/p/proposta/<chave>` que o cliente abre sem login. A pagina le a proposta a cada visita.
 * O formato e conferido aqui E no Caddy, antes de qualquer consulta.
 */

export const FORMATO_DA_CHAVE = /^[A-Za-z0-9_-]{43}$/;

export async function linkPublicoDaProposta(numeroDaProposta) {
  const proposta = await prisma.propostaParaCliente.findUnique({ where: { numero: Number(numeroDaProposta) || 0 }, select: { id: true, linkPublico: true } });
  if (!proposta) return { ok: false, erro: "Proposta não encontrada." };
  let chave = proposta.linkPublico;
  if (!chave) {
    // updateMany com linkPublico null: dois cliques ao mesmo tempo nao trocam a chave que o primeiro ja copiou.
    await prisma.propostaParaCliente.updateMany({ where: { id: proposta.id, linkPublico: null }, data: { linkPublico: randomBytes(32).toString("base64url") } });
    chave = (await prisma.propostaParaCliente.findUnique({ where: { id: proposta.id }, select: { linkPublico: true } })).linkPublico;
  }
  const base = (config.appUrlPublica || config.appUrl || "").replace(/\/+$/, "");
  return { ok: true, url: `${base}/p/proposta/${chave}` };
}

/** A proposta de uma chave publica, ou null. */
export async function propostaPelaChavePublica(chave) {
  if (!FORMATO_DA_CHAVE.test(String(chave ?? ""))) return null;
  const achada = await prisma.propostaParaCliente.findUnique({ where: { linkPublico: chave }, select: { numero: true } });
  return achada ? lerProposta(achada.numero) : null;
}

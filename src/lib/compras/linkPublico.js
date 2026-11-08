import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/db";
import { config } from "@/lib/integracoes/config";
import { lerPedido } from "@/lib/compras/banco";

/**
 * O LINK PUBLICO do pedido de compra (pedido do dono em 07/11/2026, Opcao 1 sem baixar PDF e sem trocar o link): uma
 * chave aleatoria por pedido, criada no primeiro clique em "Link publico" e nunca trocada, e o endereco
 * `/p/compra/<chave>` que o fornecedor abre sem login. A pagina le o pedido do banco a cada visita, entao todo Salvar ja
 * aparece no link.
 *
 * 32 bytes aleatorios em base64url = 43 caracteres: adivinhar uma chave e impraticavel, e por isso a chave e o unico
 * controle de quem le. O formato e conferido aqui E no Caddy (a regra do caminho publico), antes de qualquer consulta.
 */

export const FORMATO_DA_CHAVE = /^[A-Za-z0-9_-]{43}$/;

/** O endereco publico do pedido, criando a chave na primeira vez. @returns {Promise<{ok:true,url:string}|{ok:false,erro:string}>} */
export async function linkPublicoDoPedido(pedidoId) {
  const pedido = await prisma.pedidoDeCompra.findUnique({ where: { id: String(pedidoId ?? "") }, select: { id: true, linkPublico: true } });
  if (!pedido) return { ok: false, erro: "Pedido não encontrado." };
  let chave = pedido.linkPublico;
  if (!chave) {
    // updateMany com linkPublico null: dois cliques ao mesmo tempo nao trocam a chave que o primeiro ja copiou.
    await prisma.pedidoDeCompra.updateMany({ where: { id: pedido.id, linkPublico: null }, data: { linkPublico: randomBytes(32).toString("base64url") } });
    chave = (await prisma.pedidoDeCompra.findUnique({ where: { id: pedido.id }, select: { linkPublico: true } })).linkPublico;
  }
  // No PC o APP_URL_PUBLICA fica vazio: o link sai com o endereco local (serve para conferir, nao para mandar).
  const base = (config.appUrlPublica || config.appUrl || "").replace(/\/+$/, "");
  return { ok: true, url: `${base}/p/compra/${chave}` };
}

/** O pedido de uma chave publica, ou null (chave fora do formato ou que nao existe). */
export async function pedidoPelaChavePublica(chave) {
  if (!FORMATO_DA_CHAVE.test(String(chave ?? ""))) return null;
  const achado = await prisma.pedidoDeCompra.findUnique({ where: { linkPublico: chave }, select: { id: true } });
  return achado ? lerPedido(achado.id) : null;
}

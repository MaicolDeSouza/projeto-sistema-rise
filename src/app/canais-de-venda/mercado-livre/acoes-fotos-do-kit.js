"use server";

import { negarSemAcessos } from "@/lib/acessos/servidor";
import { excluirFotoDoKit, gravarFotoDoKit } from "@/lib/canaisDeVenda/ml/fotosDoKit";

/**
 * Enviar e excluir as fotos proprias do anuncio de kit (pedido do dono em 27/10/2026; regras em
 * `lib/canaisDeVenda/ml/fotosDoKit.js`). Pedem editar o Mercado Livre. A foto vai num `FormData` (o `next dev` imprime
 * os argumentos de uma Server Action, e bytes ali encheriam o log).
 */

const ehId = (valor) => typeof valor === "string" && /^[a-z0-9]{10,40}$/i.test(valor);

export async function enviarFotoDoKitML(produtoId, formData) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "editar"]);
  if (negado) return negado;
  if (!ehId(produtoId)) return { ok: false, erro: "Pedido inválido." };
  const arquivo = formData?.get?.("arquivo");
  if (!arquivo || typeof arquivo.arrayBuffer !== "function" || !arquivo.size) return { ok: false, erro: "Nenhum arquivo enviado." };
  try {
    return await gravarFotoDoKit(produtoId, Buffer.from(await arquivo.arrayBuffer()), arquivo.name ?? null);
  } catch (erro) {
    console.error("[ml] foto do kit", erro);
    return { ok: false, erro: "Não foi possível gravar a foto. Tente de novo." };
  }
}

export async function excluirFotoDoKitML(produtoId, arquivoId, anuncioId = null) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "editar"]);
  if (negado) return negado;
  if (!ehId(produtoId) || !ehId(arquivoId) || (anuncioId !== null && !ehId(anuncioId))) return { ok: false, erro: "Pedido inválido." };
  try {
    return await excluirFotoDoKit(produtoId, arquivoId, anuncioId);
  } catch (erro) {
    console.error("[ml] excluir foto do kit", erro);
    return { ok: false, erro: "Não foi possível excluir a foto. Tente de novo." };
  }
}

"use server";

import { revalidatePath } from "next/cache";

import { gravarFrasesDoCanal } from "@/lib/canaisDeVenda/configuracao";
import { anuncioLIDoProduto, carregarAnuncioLI, contextoDoProduto, novoRascunhoLI, salvarRascunhoLI } from "@/lib/canaisDeVenda/li/banco";
import { clienteLI } from "@/lib/canaisDeVenda/li/cliente";
import { listarCategoriasDaLI, listarMarcasDaLI, textoDoErroLI } from "@/lib/canaisDeVenda/li/leitura";

/**
 * Acoes do servidor do canal Loja Integrada (Canais de Venda): o editor do anuncio, as frases fixas e
 * as listas ao vivo de categorias e marcas da loja (so leitura). Finas, no molde das do Mercado Livre:
 * a regra mora em `lib/canaisDeVenda/li`, onde o teste a alcanca sem o Next.
 *
 * Nada daqui escreve na LI: Salvar grava so o rascunho no banco local. Quem escreve na loja e o
 * Sincronizar/Cadastrar (`produtos/acoes-li.js`), sob as travas.
 */

const PEDIDO_INVALIDO = { ok: false, erro: "Pedido invalido." };

// O Prisma le `where: { id: undefined }` como "sem filtro": id ausente nunca chega a consulta.
const ehId = (valor) => typeof valor === "string" && valor !== "";
const ehIdOuNulo = (valor) => valor === null || ehId(valor);

async function protegendo(trabalho) {
  try {
    return await trabalho();
  } catch (erro) {
    console.error("[loja integrada]", erro);
    return { ok: false, erro: "Nao foi possivel concluir. Tente de novo." };
  }
}

function revalidando(resultado) {
  if (resultado.ok) {
    revalidatePath("/canais-de-venda/loja-integrada");
    revalidatePath("/produtos");
  }
  return resultado;
}

/** Rascunho novo para o produto. Nao grava: so o Salvar cria o anuncio. */
export async function abrirNovoAnuncioLI(produtoId) {
  if (!ehId(produtoId)) return PEDIDO_INVALIDO;
  return protegendo(() => novoRascunhoLI(produtoId));
}

export async function abrirAnuncioLI(id) {
  if (!ehId(id)) return PEDIDO_INVALIDO;
  return protegendo(() => carregarAnuncioLI(id));
}

/** O produto (para o titulo da janela) e o anuncio da LI dele, se ja houver (um por produto). */
export async function anuncioDoProdutoLI(produtoId) {
  if (!ehId(produtoId)) return PEDIDO_INVALIDO;
  return protegendo(async () => {
    const [produto, anuncio] = await Promise.all([contextoDoProduto(produtoId), anuncioLIDoProduto(produtoId)]);
    if (!produto) return { ok: false, erro: "Produto nao encontrado. Ele pode ter sido excluido." };
    const { id, sku, tituloBase, conferido } = produto;
    return { ok: true, produto: { id, sku, tituloBase, conferido }, anuncioId: anuncio?.id ?? null };
  });
}

/** `id` e o anuncio que ja existe, ou `null` (o produto sem anuncio ganha um; com anuncio, atualiza esse). */
export async function salvarAnuncioLI(id, rascunho) {
  if (!ehIdOuNulo(id)) return PEDIDO_INVALIDO;
  return protegendo(async () => revalidando(await salvarRascunhoLI(id, rascunho)));
}

export async function salvarFrasesFixasLI(texto) {
  // Vem do navegador: um objeto viraria "[object Object]" e seria gravado.
  if (typeof texto !== "string") return PEDIDO_INVALIDO;
  return protegendo(async () => revalidando(await gravarFrasesDoCanal("LOJA_INTEGRADA", texto)));
}

/** As categorias da loja, ao vivo (o dono esta renovando a arvore). So leitura. */
export async function listarCategoriasLI() {
  try {
    return { ok: true, categorias: await listarCategoriasDaLI(clienteLI()) };
  } catch (erro) {
    console.error("[loja integrada]", erro);
    return { ok: false, erro: textoDoErroLI(erro) };
  }
}

/** As marcas da loja, ao vivo. So leitura. */
export async function listarMarcasLI() {
  try {
    return { ok: true, marcas: await listarMarcasDaLI(clienteLI()) };
  } catch (erro) {
    console.error("[loja integrada]", erro);
    return { ok: false, erro: textoDoErroLI(erro) };
  }
}

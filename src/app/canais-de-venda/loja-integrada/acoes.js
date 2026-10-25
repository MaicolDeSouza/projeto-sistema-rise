"use server";

import { negarSemAcessos, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { acessosDoEditorLI } from "@/lib/acessos/projecoes";

import { revalidatePath } from "next/cache";

import { anuncioLIDoProduto, carregarAnuncioLI, contextoDoProduto, novoRascunhoLI, salvarRascunhoLI } from "@/lib/canaisDeVenda/li/banco";
import { clienteBling } from "@/lib/blingSync/cliente";
import { ligarNoBlingLI, vinculoBlingNaLI } from "@/lib/canaisDeVenda/li/blingLoja";
import { clienteLI } from "@/lib/canaisDeVenda/li/cliente";
import { listarCategoriasDaLI, listarMarcasDaLI, textoDoErroLI } from "@/lib/canaisDeVenda/li/leitura";

/**
 * Acoes do servidor do canal Loja Integrada (Canais de Venda): o editor do anuncio e
 * as listas ao vivo de categorias e marcas da loja (so leitura). Finas, no molde das do Mercado Livre:
 * a regra mora em `lib/canaisDeVenda/li`, onde o teste a alcanca sem o Next.
 *
 * Nada daqui escreve na LI: Salvar grava so o rascunho no banco local. Quem escreve na loja e o
 * Sincronizar/Cadastrar (`produtos/acoes-li.js`), sob as travas.
 */

const PEDIDO_INVALIDO = { ok: false, erro: "Pedido inválido." };

// O Prisma le `where: { id: undefined }` como "sem filtro": id ausente nunca chega a consulta.
const ehId = (valor) => typeof valor === "string" && valor !== "";
const ehIdOuNulo = (valor) => valor === null || ehId(valor);

async function protegendo(trabalho) {
  try {
    return await trabalho();
  } catch (erro) {
    console.error("[loja integrada]", erro);
    return { ok: false, erro: "Não foi possível concluir. Tente de novo." };
  }
}

function revalidando(resultado) {
  if (resultado.ok) {
    revalidatePath("/canais-de-venda/loja-integrada");
    revalidatePath("/produtos");
  }
  return resultado;
}

/** O que o editor recebe ao abrir: os acessos dele (somente leitura, sincronizar, SEO dos concorrentes). */
async function comAcessosDoEditor(resultado) {
  if (!resultado?.ok) return resultado;
  const { pode } = await sessaoDeAcessos();
  return { ...resultado, acessos: acessosDoEditorLI(pode) };
}

/** Rascunho novo para o produto. Nao grava: so o Salvar cria o anuncio. */
export async function abrirNovoAnuncioLI(produtoId) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.lojaIntegrada", "ver"]);
  if (negado) return negado;
  if (!ehId(produtoId)) return PEDIDO_INVALIDO;
  return protegendo(async () => comAcessosDoEditor(await novoRascunhoLI(produtoId)));
}

export async function abrirAnuncioLI(id) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.lojaIntegrada", "ver"]);
  if (negado) return negado;
  if (!ehId(id)) return PEDIDO_INVALIDO;
  return protegendo(async () => comAcessosDoEditor(await carregarAnuncioLI(id)));
}

/** O produto (para o titulo da janela) e o anuncio da LI dele, se ja houver (um por produto). */
export async function anuncioDoProdutoLI(produtoId) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.lojaIntegrada", "ver"]);
  if (negado) return negado;
  if (!ehId(produtoId)) return PEDIDO_INVALIDO;
  return protegendo(async () => {
    const [produto, anuncio] = await Promise.all([contextoDoProduto(produtoId), anuncioLIDoProduto(produtoId)]);
    if (!produto) return { ok: false, erro: "Produto não encontrado. Ele pode ter sido excluído." };
    const { id, sku, tituloBase, conferido } = produto;
    return { ok: true, produto: { id, sku, tituloBase, conferido }, anuncioId: anuncio?.id ?? null };
  });
}

/** `id` e o anuncio que ja existe, ou `null` (o produto sem anuncio ganha um; com anuncio, atualiza esse). */
export async function salvarAnuncioLI(id, rascunho) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.lojaIntegrada", "editar"]);
  if (negado) return negado;
  if (!ehIdOuNulo(id)) return PEDIDO_INVALIDO;
  return protegendo(async () => revalidando(await salvarRascunhoLI(id, rascunho)));
}

/**
 * O produto esta ligado, no Bling, ao canal da Loja Integrada? So le o Bling (3 GETs: busca pelo SKU,
 * o produto e os vinculos com as lojas). O editor chama ao abrir.
 */
export async function vinculoBlingLI(produtoId) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.lojaIntegrada", "ver"]);
  if (negado) return negado;
  if (!ehId(produtoId)) return PEDIDO_INVALIDO;
  return protegendo(async () => {
    const [produto, anuncio] = await Promise.all([contextoDoProduto(produtoId), anuncioLIDoProduto(produtoId)]);
    if (!produto) return { ok: false, erro: "Produto não encontrado." };
    return { ok: true, ...(await vinculoBlingNaLI(clienteBling(), produto.sku, anuncio?.idExterno ?? null)) };
  });
}

/**
 * "Ligar no Bling": cria no Bling o vinculo do produto com a loja Loja_Integrada (escreve no Bling, sob
 * BLING_ESCRITA e BLING_ESCRITA_CODIGOS). A regra mora em `blingLoja.js`.
 */
export async function ligarNoBlingDaLI(produtoId) {
  const negado = await negarSemAcessos(["acao.lojaIntegrada.sincronizar", "executar"]);
  if (negado) return negado;
  if (!ehId(produtoId)) return PEDIDO_INVALIDO;
  try {
    const [produto, anuncio] = await Promise.all([contextoDoProduto(produtoId), anuncioLIDoProduto(produtoId)]);
    if (!produto) return { ok: false, erro: "Produto não encontrado." };
    return await ligarNoBlingLI(clienteBling(), produto.sku, anuncio?.idExterno ?? null);
  } catch (erro) {
    console.error("[loja integrada] ligar no Bling", erro);
    return { ok: false, erro: "A resposta se perdeu. O Bling pode ter gravado o vínculo: confira no Bling antes de tentar de novo." };
  }
}

/** As categorias da loja, ao vivo (o dono esta renovando a arvore). So leitura. */
export async function listarCategoriasLI() {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.lojaIntegrada", "ver"]);
  if (negado) return negado;
  try {
    return { ok: true, categorias: await listarCategoriasDaLI(clienteLI()) };
  } catch (erro) {
    console.error("[loja integrada]", erro);
    return { ok: false, erro: textoDoErroLI(erro) };
  }
}

/** As marcas da loja, ao vivo. So leitura. */
export async function listarMarcasLI() {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.lojaIntegrada", "ver"]);
  if (negado) return negado;
  try {
    return { ok: true, marcas: await listarMarcasDaLI(clienteLI()) };
  } catch (erro) {
    console.error("[loja integrada]", erro);
    return { ok: false, erro: textoDoErroLI(erro) };
  }
}

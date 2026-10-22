"use server";

import { negarSemAcessos, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { acessosDoEditorLI } from "@/lib/acessos/projecoes";

import { revalidatePath } from "next/cache";

import { anuncioLIDoProduto, carregarAnuncioLI, contextoDoProduto, novoRascunhoLI, salvarRascunhoLI } from "@/lib/canaisDeVenda/li/banco";
import { clienteBling } from "@/lib/blingSync/cliente";
import { ligarNoBlingLI, vinculoBlingNaLI } from "@/lib/canaisDeVenda/li/blingLoja";
import { clienteLI } from "@/lib/canaisDeVenda/li/cliente";
import { listarCategoriasDaLI, listarMarcasDaLI, textoDoErroLI } from "@/lib/canaisDeVenda/li/leitura";
import { seoDosConcorrentes } from "@/lib/canaisDeVenda/li/seoConcorrentes";
import { gerarDescriptionsSeo, sugerirCategoriasIA } from "@/lib/ia/anuncio";
import { novoGasto, resumoDoGasto } from "@/lib/ia/gasto";

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

/** O SEO (title e description) dos concorrentes salvos no produto, para comparar na aba SEO. */
export async function seoConcorrentesLI(produtoId) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.lojaIntegrada", "ver"], ["dado.concorrentes", "ver"]);
  if (negado) return negado;
  if (!ehId(produtoId)) return PEDIDO_INVALIDO;
  return protegendo(async () => ({ ok: true, concorrentes: await seoDosConcorrentes(produtoId) }));
}

/**
 * Tres opcoes de meta description pela IA (Anthropic, como os titulos do cadastro). O texto do
 * produto e o SEO dos concorrentes sao lidos aqui, do banco; do navegador vem so o nome que esta na
 * tela (pode nao estar salvo ainda), conferido no tamanho.
 */
export async function gerarSeoIALI(produtoId, titulo) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.lojaIntegrada", "editar"], ["acao.produtos.gerarTextoComIA", "executar"]);
  if (negado) return negado;
  if (!ehId(produtoId) || typeof titulo !== "string" || titulo.length > 255) return PEDIDO_INVALIDO;
  // O gasto volta tambem no erro: a chamada que falhou no meio ja foi cobrada.
  const gasto = novoGasto();
  try {
    const [produto, concorrentes] = await Promise.all([contextoDoProduto(produtoId), seoDosConcorrentes(produtoId)]);
    if (!produto) return { ok: false, erro: "Produto não encontrado." };
    const opcoes = await gerarDescriptionsSeo({ titulo: titulo.trim() || produto.tituloBase, descricao: produto.descricaoBase ?? "", concorrentes, gasto });
    return { ok: true, opcoes, gasto: resumoDoGasto(gasto) };
  } catch (erro) {
    console.error("[loja integrada] seo com IA", erro);
    return { ok: false, erro: erro.message || "Não foi possível gerar com a IA. Tente de novo.", gasto: resumoDoGasto(gasto) };
  }
}

/**
 * Categoria pela IA (pedido do dono em 07/10/2026): le a arvore ao vivo da loja e o produto do banco; do
 * navegador vem so o nome que esta na tela. Devolve as sugestoes; quem marca e a tela, no "Marcar estas".
 */
export async function sugerirCategoriasLI(produtoId, titulo) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.lojaIntegrada", "editar"], ["acao.produtos.gerarTextoComIA", "executar"]);
  if (negado) return negado;
  if (!ehId(produtoId) || typeof titulo !== "string" || titulo.length > 255) return PEDIDO_INVALIDO;
  const gasto = novoGasto();
  try {
    const [produto, categorias] = await Promise.all([contextoDoProduto(produtoId), listarCategoriasDaLI(clienteLI())]);
    if (!produto) return { ok: false, erro: "Produto não encontrado." };
    const sugestoes = await sugerirCategoriasIA({ titulo: titulo.trim() || produto.tituloBase, marca: produto.marca ?? "", descricao: produto.descricaoBase ?? "", categorias, gasto });
    return { ok: true, sugestoes, gasto: resumoDoGasto(gasto) };
  } catch (erro) {
    console.error("[loja integrada] categoria com IA", erro);
    return { ok: false, erro: erro.message || "Não foi possível sugerir com a IA. Tente de novo.", gasto: resumoDoGasto(gasto) };
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

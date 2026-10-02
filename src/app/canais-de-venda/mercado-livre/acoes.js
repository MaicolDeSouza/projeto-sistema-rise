"use server";

import { revalidatePath } from "next/cache";

import {
  adicionarVersiculo,
  gravarFrases,
  removerVersiculo,
  sortearVersiculoDoBanco,
} from "@/lib/canaisDeVenda/configuracao";
import {
  anunciosMLDoProduto,
  buscarProdutoParaAnuncio,
  carregarAnuncioML,
  codigoEmUso,
  contextoDosProdutos,
  novoRascunhoML,
  salvarRascunhoML,
  sugerirCodigoDeKit,
} from "@/lib/canaisDeVenda/ml/banco";

/**
 * Acoes do servidor do canal Mercado Livre (Canais de Venda). Finas, no molde de
 * `produtos/acoes-edicao-rapida.js`: a regra e a gravacao moram em `lib/canaisDeVenda`, onde o
 * teste (scripts/teste-anuncios-ml.js) as alcanca sem o Next, e aqui ficam so o que depende
 * do servidor do Next: conferir o que vem do navegador, revalidar a tela e nao deixar
 * excecao nenhuma chegar ao cliente.
 *
 * Toda acao devolve `{ ok, ... }`. Acao que so le nao revalida. Fase 1: nada daqui escreve
 * no Mercado Livre nem no Bling; as acoes gravam so no banco local.
 */

const PEDIDO_INVALIDO = { ok: false, erro: "Pedido invalido." };

// Um id e texto que o navegador manda: tipo errado ou vazio nao pode chegar a consulta.
// O Prisma le `where: { id: undefined }` como "sem filtro", entao um id ausente nao e so um
// "nao achou": poderia devolver o registro de qualquer um.
const ehId = (valor) => typeof valor === "string" && valor !== "";

// O anuncio novo ainda nao tem id: a tela manda `null` (nunca `undefined`).
const ehIdOuNulo = (valor) => valor === null || ehId(valor);

/**
 * Cobre a chamada inteira: o que a lib deixa subir (falha de banco ao ler, bug) vira recado
 * generico, com o erro no log do servidor. Excecao solta chegaria ao navegador como uma tela
 * de erro do Next, e o que o operador digitou no editor se perderia.
 */
async function protegendo(trabalho) {
  try {
    return await trabalho();
  } catch (erro) {
    console.error("[canais de venda]", erro);
    return { ok: false, erro: "Nao foi possivel concluir. Tente de novo." };
  }
}

/**
 * Acao que grava. A lista do canal e a de Produtos (o icone do canal na linha do produto
 * sai dos anuncios) mostram o que acabou de mudar.
 */
function revalidando(resultado) {
  if (resultado.ok) {
    revalidatePath("/canais-de-venda/mercado-livre");
    revalidatePath("/produtos");
  }
  return resultado;
}

/** Rascunho novo de anuncio simples para o produto. Nao grava: so o Salvar cria o anuncio. */
export async function abrirNovoAnuncioML(produtoId) {
  if (!ehId(produtoId)) return PEDIDO_INVALIDO;
  return protegendo(() => novoRascunhoML(produtoId));
}

export async function abrirAnuncioML(id) {
  if (!ehId(id)) return PEDIDO_INVALIDO;
  return protegendo(() => carregarAnuncioML(id));
}

/**
 * Os anuncios ML do produto, com o que a janela da lista precisa saber dele: se ainda e
 * Conferido (so Conferido vira anuncio) e o nome para o titulo da janela.
 */
export async function listarAnunciosDoProdutoML(produtoId) {
  if (!ehId(produtoId)) return PEDIDO_INVALIDO;
  return protegendo(async () => {
    const [produtos, anuncios] = await Promise.all([contextoDosProdutos([produtoId]), anunciosMLDoProduto(produtoId)]);
    // Excluido depois de a lista de Produtos ter carregado: a janela diz isso em vez de abrir vazia.
    // `hasOwn` porque o id vem do navegador: "constructor" acharia a funcao do objeto, nao um produto.
    if (!Object.hasOwn(produtos, produtoId)) return { ok: false, erro: "Produto nao encontrado. Ele pode ter sido excluido." };

    const { id, sku, tituloBase, conferido } = produtos[produtoId];
    return { ok: true, produto: { id, sku, tituloBase, conferido }, anuncios };
  });
}

/** `id` e o anuncio que ja existe, ou `null` para criar um novo. */
export async function salvarAnuncioML(id, rascunho) {
  if (!ehIdOuNulo(id)) return PEDIDO_INVALIDO;
  return protegendo(async () => revalidando(await salvarRascunhoML(id, rascunho)));
}

/** Acha o produto pelo codigo para entrar na composicao do kit. Devolve o resultado da lib como esta. */
export async function buscarItemDeComposicao(codigo) {
  return protegendo(() => buscarProdutoParaAnuncio(codigo));
}

/** Quem ja usa o codigo do kit, ou `null` se esta livre. `anuncioId` e o anuncio aberto (ou `null`). */
export async function conferirCodigoDeKit(codigo, anuncioId, itens) {
  if (!ehIdOuNulo(anuncioId)) return PEDIDO_INVALIDO;
  return protegendo(async () => ({ ok: true, codigoEmUso: await codigoEmUso(codigo, { anuncioId, itens }) }));
}

export async function sugerirCodigoKit() {
  return protegendo(async () => {
    const codigo = await sugerirCodigoDeKit();
    if (codigo === null) return { ok: false, erro: "A faixa 25xxxx acabou." };
    return { ok: true, codigo };
  });
}

/**
 * Sorteia outro versiculo. `excluir` sao as referencias que o operador ja recusou nesta tela
 * e `resto` e a descricao sem o versiculo (a citacao tem que ficar abaixo de 25% do texto).
 * Sortear nao grava nem consome nada.
 */
export async function outroVersiculo(excluir, resto) {
  const recusados = Array.isArray(excluir) ? excluir.filter((referencia) => typeof referencia === "string") : [];
  return protegendo(async () => ({ ok: true, ...(await sortearVersiculoDoBanco({ excluir: recusados, resto })) }));
}

export async function salvarFrasesFixas(texto) {
  return protegendo(async () => revalidando(await gravarFrases(texto)));
}

export async function incluirVersiculo(dados) {
  return protegendo(async () => revalidando(await adicionarVersiculo(dados)));
}

export async function excluirVersiculo(id) {
  if (!ehId(id)) return PEDIDO_INVALIDO;
  return protegendo(async () => revalidando(await removerVersiculo(id)));
}

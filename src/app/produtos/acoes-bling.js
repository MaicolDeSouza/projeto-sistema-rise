"use server";

import { revalidatePath } from "next/cache";

import { depositoIdValido, produtoIdValido } from "@/lib/blingSync/estado";
import { mudouNoBling } from "@/lib/blingSync/apresentacao";
import { cadastrarNoBling, enviarAjustesDeEstoque, sincronizarProduto } from "@/lib/blingSync/envio";
import { lerParaPopup } from "@/lib/blingSync/leitura";
import { sincronizarEstoqueDoBling } from "@/lib/blingSync/saldos";

/**
 * Acoes do icone do Bling na lista de Produtos (sincronizacao Rise <-> Bling). Finas, no molde de
 * `acoes-edicao-rapida.js`: a regra, a leitura e o envio moram em `lib/blingSync`, onde o teste
 * (scripts/teste-bling-sync.js) os alcanca com o Bling falso, e aqui ficam so o que depende do
 * servidor do Next: conferir o que vem do navegador, revalidar a lista e nao deixar excecao
 * nenhuma chegar a tela.
 *
 * Toda acao devolve `{ ok, ... }`. A que so le (`abrirJanelaBling`) nao revalida. Quem escreve no
 * Bling passa pelas duas travas (BLING_ESCRITA e a lista de codigos liberados) dentro da lib: com
 * elas fechadas, a acao devolve o motivo e nada sai.
 *
 * Arquivo "use server": so exporta funcao assincrona. A conferencia de id (`produtoIdValido`,
 * `depositoIdValido`) mora em `lib/blingSync/estado.js`, onde o teste a alcanca sem o Next.
 */

const PEDIDO_INVALIDO = { ok: false, erro: "Pedido invalido." };
const DEPOSITO_INVALIDO = { ok: false, erro: "Deposito invalido." };

/**
 * Cobre a chamada inteira: o que a lib deixa subir (a leitura do banco antes de tudo, um bug) vira
 * recado, com o erro so no log do servidor. A excecao solta chegaria ao navegador como uma tela de
 * erro do Next, e a mensagem crua de um erro inesperado pode trazer o que nao e para a tela (texto
 * de consulta, endereco). `recado` diz o que fazer em seguida: quem ESCREVE no Bling nunca manda
 * "tente de novo" as cegas, porque o Bling pode ter gravado e a resposta e que se perdeu.
 */
async function protegendo(recado, trabalho) {
  try {
    return await trabalho();
  } catch (erro) {
    console.error("[bling]", erro);
    return { ok: false, erro: recado };
  }
}

/// Acao que grava: a lista de Produtos (icone, estoque) mostra o que acabou de mudar.
function revalidando(resultado, gravou) {
  if (gravou) revalidatePath("/produtos");
  return resultado;
}

/**
 * O que o Bling tem sob o codigo do produto, comparado campo a campo com o Rise, para a janela do
 * icone. So le: o Bling nao e escrito e nada e gravado no Rise (o saldo lido nao e guardado aqui).
 */
export async function abrirJanelaBling(produtoId) {
  if (!produtoIdValido(produtoId)) return PEDIDO_INVALIDO;
  return protegendo("Nao foi possivel ler o Bling. Tente de novo.", () => lerParaPopup(produtoId));
}

/** Envia ao Bling os campos que mudaram e os fornecedores de um produto que ja existe la. */
export async function sincronizarComBling(produtoId) {
  if (!produtoIdValido(produtoId)) return PEDIDO_INVALIDO;
  return protegendo(
    "Nao foi possivel concluir a sincronizacao. O Bling pode ter recebido parte do envio: confira no Bling antes de tentar de novo.",
    async () => {
      const resultado = await sincronizarProduto(produtoId);
      return revalidando(resultado, resultado.ok);
    },
  );
}

/** Cadastra no Bling o produto que ainda nao existe la (e envia os fornecedores). */
export async function cadastrarProdutoNoBling(produtoId) {
  if (!produtoIdValido(produtoId)) return PEDIDO_INVALIDO;
  return protegendo(
    "Nao foi possivel concluir o cadastro. O produto pode ter sido criado no Bling: confira la antes de tentar de novo.",
    async () => {
      const resultado = await cadastrarNoBling(produtoId);
      // Revalida tambem quando o cadastro falhou DEPOIS de criar o produto no Bling (`blingId`): o id
      // ja foi gravado no Rise, e a lista tem que mostra-lo. A regra e a de `mudouNoBling`, testada.
      return revalidando(resultado, mudouNoBling("cadastrar", resultado));
    },
  );
}

/**
 * Envia ao Bling os ajustes de estoque pendentes do produto. `depositoId` e opcional: so a janela o
 * manda, depois de a lib responder `precisaDeposito` (o Bling tem mais de um deposito e nenhum
 * padrao). Vem do navegador, entao tem que ser inteiro positivo: a lib ainda confere que ele esta
 * entre os depositos que o Bling devolve agora.
 */
export async function enviarEstoqueAoBling(produtoId, depositoId) {
  if (!produtoIdValido(produtoId)) return PEDIDO_INVALIDO;
  if (!depositoIdValido(depositoId)) return DEPOSITO_INVALIDO;
  return protegendo(
    "Nao foi possivel concluir o envio do estoque. Parte dos ajustes pode ter ido ao Bling: confira o saldo la antes de tentar de novo.",
    async () => {
      // O 2o parametro da lib e o cliente do Bling: `undefined` deixa o padrao (o cliente real).
      const opcoes = depositoId === undefined || depositoId === null ? {} : { depositoId };
      const resultado = await enviarAjustesDeEstoque(produtoId, undefined, opcoes);
      // O envio para na primeira falha e o que ja foi fica gravado (ajuste marcado como enviado e
      // `blingSaldo`): com `ok: false` e `enviados > 0` a lista tambem precisa refletir. A regra e a de
      // `mudouNoBling`, testada.
      return revalidando(resultado, mudouNoBling("estoque", resultado));
    },
  );
}

/**
 * Le no Bling o saldo de todos os produtos do Rise e recalcula o estoque de cada um (o botao da lista).
 * Nao recebe nada do navegador: a lib so restringe a alguns produtos pela opcao `produtoIds`, que e do
 * teste, e uma acao que a repassasse deixaria qualquer chamada atualizar so os ids que mandasse.
 *
 * `ok: true` quer dizer que a leitura aconteceu; o que nao deu certo vem em `falhas` (um item por
 * produto, com o motivo), e a tela mostra os tres numeros.
 */
export async function sincronizarEstoqueComBling() {
  return protegendo("Nao foi possivel atualizar o estoque. Tente de novo.", async () => {
    const resultado = await sincronizarEstoqueDoBling();
    return revalidando({ ok: true, ...resultado }, resultado.atualizados > 0);
  });
}

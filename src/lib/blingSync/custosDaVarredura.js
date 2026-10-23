import { prisma } from "@/lib/db";

import { enviarCustoDoFornecedor } from "./envio";
import { INCLUDE_DO_ICONE_BLING, iconeBlingDoProduto } from "./estado";

/**
 * O CUSTO DA VARREDURA VAI AO BLING SOZINHO (pedido do dono em 23/10/2026, Opcao 1: "atualizar o custo no Bling apos
 * cada varredura, para nao ficar ! no Bling").
 *
 * A varredura de um fornecedor atualiza o custo dos vinculos (`atualizarCustosDosVinculos`, coleta/banco.js). Isso
 * mudaria a assinatura e acenderia o "!" do Bling. Para o produto que estava EM DIA com o Bling antes da varredura, o
 * unico conteudo novo e o custo: ele vai ao Bling sozinho (so os vinculos de fornecedor) e o "!" nao aparece. O produto
 * que ja tinha outra diferenca pendente NAO e tocado: o "!" continua e o dono decide no Sincronizar, como sempre.
 */

/**
 * Dos produtos pedidos, os que estao em dia com o Bling AGORA: ja sincronizados e sem diferenca de campos ou
 * fornecedores (ajuste de estoque pendente nao importa aqui: o custo nao mexe no estoque). Chamado ANTES de o custo
 * mudar. Falha de leitura devolve vazio: nenhum envio automatico no escuro.
 *
 * @param {string[]} produtoIds
 * @returns {Promise<Set<string>>}
 */
export async function produtosEmDiaComOBling(produtoIds) {
  const ids = [...new Set((produtoIds ?? []).filter(Boolean))];
  if (ids.length === 0) return new Set();
  try {
    const produtos = await prisma.produto.findMany({ where: { id: { in: ids } }, include: INCLUDE_DO_ICONE_BLING });
    return new Set(
      produtos
        .filter((produto) => {
          const icone = iconeBlingDoProduto(produto);
          return icone.cor === "verde" && !icone.motivos.includes("campos");
        })
        .map((produto) => produto.id),
    );
  } catch (erro) {
    console.error(`[custos ao Bling] nao foi possivel conferir quem estava em dia: ${erro.message}`);
    return new Set();
  }
}

/**
 * Manda o custo de cada produto ao Bling, um de cada vez (o Bling aceita 3 chamadas por segundo, e a fila do cliente ja
 * respeita isso). Falha de um nao para os outros: o que falhou fica com o "!" e sai no Sincronizar normal.
 *
 * @param {string[]} produtoIds
 * @param {{ enviar?: (produtoId: string) => Promise<{ok: boolean, erro?: string}> }} [opcoes] o teste troca o envio
 * @returns {Promise<{enviados: number, falhas: {produtoId: string, erro: string}[]}>}
 */
export async function enviarCustosAoBling(produtoIds, { enviar = enviarCustoDoFornecedor } = {}) {
  const resultado = { enviados: 0, falhas: [] };
  for (const produtoId of produtoIds ?? []) {
    let saida;
    try {
      saida = await enviar(produtoId);
    } catch (erro) {
      saida = { ok: false, erro: erro.message };
    }
    if (saida?.ok) resultado.enviados++;
    else resultado.falhas.push({ produtoId, erro: saida?.erro ?? "falha sem motivo" });
  }
  if (resultado.falhas.length > 0) {
    console.error(
      `[custos ao Bling] ${resultado.falhas.length} produto(s) ficaram com o "!" do Bling: ` +
        resultado.falhas.slice(0, 5).map((falha) => `${falha.produtoId}: ${falha.erro}`).join(" | "),
    );
  }
  return resultado;
}

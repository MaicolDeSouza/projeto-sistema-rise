import { prisma } from "@/lib/db";
import { indisponivel } from "@/lib/estoqueDoConcorrente";

import { opcoesDePreco } from "./regras";

/**
 * O preco da proposta CALCULADO PELO RISE (roteiro unico de 21/10/2026: a conversa fazia a conta a mao e uma gravou a
 * margem como 0,46). Ao gravar a secao `preco`, os numeros que a LLM mandar sao trocados por estes; so a `observacao`
 * dela fica.
 *
 * - Custo: o do fornecedor PADRAO; sem vinculo confirmado, o do rascunho do Bling.
 * - Concorrentes: os vinculados, pelo preco NORMAL (o promocional so na falta dele, a regra do sistema); saem os sem
 *   estoque ou fora da coleta e a propria loja (fonte com "4hobby" no nome ou no dominio, que o dono vincula para
 *   comparar). Concorrente digitado a mao entra pelo preco dele.
 */
const DA_PROPRIA_LOJA = /4hobby/i;
const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

export async function precoCalculadoDaProposta(produtoId) {
  const produto = await prisma.produto.findUnique({
    where: { id: produtoId },
    select: {
      fornecedorRascunho: true,
      fornecedores: { where: { padrao: true }, select: { precoCusto: true, fornecedor: { select: { nome: true } } } },
      concorrentes: {
        select: {
          fonteManual: true,
          precoManual: true,
          produtoColetado: {
            select: { precoNormal: true, precoPromocional: true, quantidade: true, estoqueStatus: true, ausenteDesde: true, fonte: { select: { nome: true, dominio: true } } },
          },
        },
      },
    },
  });
  const padrao = produto?.fornecedores?.[0];
  const custo = numero(padrao?.precoCusto) ?? numero(produto?.fornecedorRascunho?.precoCusto);
  const origemDoCusto = padrao ? `fornecedor padrão (${padrao.fornecedor.nome})` : produto?.fornecedorRascunho ? "rascunho do Bling" : null;

  const usados = [];
  const foraDaConta = [];
  for (const vinculo of produto?.concorrentes ?? []) {
    const coletado = vinculo.produtoColetado;
    const loja = coletado ? coletado.fonte.nome : (vinculo.fonteManual ?? "concorrente sem loja");
    const preco = coletado ? (numero(coletado.precoNormal) ?? numero(coletado.precoPromocional)) : numero(vinculo.precoManual);
    if (DA_PROPRIA_LOJA.test(loja) || DA_PROPRIA_LOJA.test(coletado?.fonte?.dominio ?? "")) {
      foraDaConta.push({ loja, preco, motivo: "a própria loja" });
    } else if (!(preco > 0)) {
      foraDaConta.push({ loja, preco: null, motivo: "sem preço" });
    } else if (coletado && indisponivel({ quantidade: coletado.quantidade, estoqueStatus: coletado.estoqueStatus, ativo: !coletado.ausenteDesde })) {
      foraDaConta.push({ loja, preco, motivo: "sem estoque" });
    } else {
      usados.push({ loja, preco });
    }
  }
  return { custo, origemDoCusto, ...opcoesDePreco(custo, usados), concorrentesUsados: usados, foraDaConta };
}

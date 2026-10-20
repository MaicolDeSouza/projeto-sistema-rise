import { apagarPastaDaProposta } from "@/lib/arquivos";
import { prisma } from "@/lib/db";

import { propostaParaFormulario } from "./banco";

/**
 * O Conferido e a APROVACAO da proposta automatica (spec 2026-10-16, Aprovacao e limpeza): marcar Conferido apaga a
 * proposta inteira (a linha e a pasta proposta/). Antes de apagar, se ha secao NAO aplicada, devolve `pendentes` e nao
 * confere: a tela pergunta "Ha N itens da proposta nao aplicados" e so repete com `apagarProposta` se o dono confirmar.
 * Desmarcar o Conferido nunca recria nada. Mora aqui (e nao na Server Action) para o teste rodar fora do Next.
 *
 * @returns {Promise<{ ok: true } | { ok: false, pendentes: string[] } | { ok: false, erro: string }>}
 */
export async function conferirComProposta(id, valor, { apagarProposta = false } = {}) {
  const produto = await prisma.produto.findUnique({ where: { id: String(id ?? "") }, select: { id: true, sku: true } });
  if (!produto) return { ok: false, erro: "Produto não encontrado." };

  const marcar = Boolean(valor);
  if (marcar && !apagarProposta) {
    const proposta = await propostaParaFormulario(produto.id);
    if (proposta && proposta.naoAplicadas.length > 0) return { ok: false, pendentes: proposta.naoAplicadas };
  }

  await prisma.$transaction(async (tx) => {
    await tx.produto.update({ where: { id: produto.id }, data: { conferido: marcar } });
    if (marcar) await tx.propostaDeProduto.deleteMany({ where: { produtoId: produto.id } });
  });
  // A pasta sai depois do banco: se o disco falhar, o pior e sobrar uma pasta sem dono (o produto ja esta conferido).
  if (marcar) await apagarPastaDaProposta(produto.sku).catch(() => {});
  return { ok: true };
}

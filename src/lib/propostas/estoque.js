import { prisma } from "@/lib/db";
import { calcularPecas } from "@/lib/pedidos/pecas";

/**
 * O "i" de estoque de cada item da proposta (pedido do dono em 17/11/2026: "igual ao Bling", verde com estoque e
 * vermelho sem, mostrando o estoque e quanto comprar para atender o cliente). Reaproveita a conta das pecas dos Pedidos
 * de venda (`calcularPecas`): o estoque e o saldo de agora, os pedidos abertos reservam o deles primeiro (a proposta e a
 * mais nova de todas), o kit e aberto nas pecas e a falta traz a compra ou a ordem de producao a caminho.
 *
 * Cada item e contado sozinho (o mesmo produto em duas linhas nao soma): o "i" responde "esta linha esta coberta?".
 *
 * @param {{ produtoId?: string|null, quantidade?: number|string }[]} itens
 * @returns {Promise<({ atende: boolean, pecas: object[] } | null)[]>} na ordem dos itens; null = sem produto ou sem quantidade
 */
export async function estoqueDosItens(itens, { tx = prisma, agora = new Date() } = {}) {
  const lista = Array.isArray(itens) ? itens.slice(0, 300) : [];
  return Promise.all(
    lista.map(async (item) => {
      const produtoId = typeof item?.produtoId === "string" ? item.produtoId : null;
      const quantidade = Number(String(item?.quantidade ?? "").replace(",", "."));
      if (!produtoId || !(quantidade > 0)) return null;
      // Um pedido de mentira, o mais novo de todos e sem copia no Bling (nada foi baixado do saldo por ele).
      const { pecas } = await calcularPecas(tx, {
        id: "proposta-para-cliente",
        origem: "PROPOSTA",
        blingPedidoId: null,
        dataDaVenda: agora,
        criadoEm: agora,
        itens: [{ produtoId, quantidade }],
      });
      if (pecas.length === 0) return null;
      return { atende: pecas.every((peca) => peca.falta === 0), pecas };
    }),
  );
}

/**
 * O custo da etiqueta do Rise que entra no lucro real do pedido (modulo de frete, fase 2). Arquivo sem import de pedidos:
 * `pedidos/banco.js` usa esta funcao em toda leitura do pedido, e o import ao contrario faria um ciclo.
 */

/** Etiqueta paga e nao devolvida: o cancelado (o valor volta a carteira) e o expirado nao contam. */
const STATUS_COM_CUSTO = ["A_POSTAR", "POSTADO", "ENTREGUE", "NAO_ENTREGUE", "COM_PROBLEMA"];

/** O custo da etiqueta do envio de ida do pedido, ou null sem etiqueta comprada. `db`: o prisma ou a transacao. */
export async function custoDaEtiquetaDoPedido(db, pedidoDeVendaId) {
  if (!pedidoDeVendaId) return null;
  const envio = await db.envio.findFirst({
    where: { pedidoDeVendaId, direcao: "IDA", status: { in: STATUS_COM_CUSTO }, custo: { not: null } },
    orderBy: { compradoEm: "desc" },
    select: { custo: true },
  });
  return envio ? Number(envio.custo) : null;
}

import { prisma } from "@/lib/db";
import { STATUS_A_CAMINHO, faltaLancar, fatorDoItem, numeroDoPedido } from "@/lib/compras/regras";

/**
 * O "estoque virtual" de cada produto (pedido do dono em 07/11/2026: ao passar o mouse no estoque da lista de Produtos,
 * "quantos produtos estao no estoque virtual, ou seja que tem pedido de compra e logo abaixo a previsao de entrega
 * mostrando dias faltando para chegar"): o que falta lancar dos pedidos de compra ENVIADOS ou PARCIAIS (a mesma conta do
 * "a caminho" do Compras, em unidades do Rise: caixas x fator) e, por pedido, a previsao = envio + prazo em dias.
 */

const DIA_MS = 24 * 60 * 60 * 1000;
const DIA_ISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const DIA_MES = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/** Dias de calendario (Sao Paulo) de `agora` ate `data`: 0 = hoje, negativo = atrasado. */
export function diasAte(data, agora = new Date()) {
  const dia = (valor) => Date.parse(`${DIA_ISO.format(valor)}T00:00:00Z`);
  return Math.round((dia(data) - dia(agora)) / DIA_MS);
}

/** "Em 10 dias", "Amanhã", "Hoje", "Atrasada 3 dias"; sem previsao, null. */
export function textoDaPrevisao(dias) {
  if (dias === null || dias === undefined) return null;
  if (dias > 1) return `Em ${dias} dias`;
  if (dias === 1) return "Amanhã";
  if (dias === 0) return "Hoje";
  return `Atrasada ${-dias} ${dias === -1 ? "dia" : "dias"}`;
}

/**
 * @param {string[]} ids os produtos da pagina
 * @returns {Promise<Map<string, { quantidade: number, pedidos: { codigo: string, quantidade: number, previsao: string|null, data: string|null, dias: number|null }[] }>>}
 *   so os produtos com algo a caminho; os pedidos na ordem da previsao (sem prazo por ultimo).
 */
export async function estoqueVirtualDosProdutos(ids, agora = new Date()) {
  const resultado = new Map();
  if (!ids?.length) return resultado;
  const itens = await prisma.itemDoPedidoDeCompra.findMany({
    where: { produtoId: { in: ids }, pedido: { status: { in: STATUS_A_CAMINHO } } },
    select: { produtoId: true, quantidade: true, quantidadeLancada: true, fator: true, prazoDias: true, pedido: { select: { numero: true, enviadoEm: true } } },
  });
  for (const item of itens) {
    const unidades = faltaLancar(item) * fatorDoItem(item);
    if (unidades <= 0) continue;
    const enviadoEm = item.pedido.enviadoEm;
    const chegada = enviadoEm && item.prazoDias !== null && item.prazoDias !== undefined ? new Date(enviadoEm.getTime() + Number(item.prazoDias) * DIA_MS) : null;
    const dias = chegada ? diasAte(chegada, agora) : null;
    const atual = resultado.get(item.produtoId) ?? { quantidade: 0, pedidos: [] };
    atual.quantidade += unidades;
    atual.pedidos.push({ codigo: numeroDoPedido(item.pedido.numero), quantidade: unidades, previsao: textoDaPrevisao(dias), data: chegada ? DIA_MES.format(chegada) : null, dias });
    resultado.set(item.produtoId, atual);
  }
  for (const valor of resultado.values()) valor.pedidos.sort((a, b) => (a.dias ?? Infinity) - (b.dias ?? Infinity));
  return resultado;
}

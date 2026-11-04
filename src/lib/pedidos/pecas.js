/**
 * "Aguardando pecas" (spec 5.5): o que cada pedido aberto precisa de cada produto, o que o estoque tem depois de
 * descontar os pedidos abertos mais antigos (dois pedidos nao podem achar que a ultima unidade e deles), a falta e de
 * onde ela vem (compra enviada, ordem de producao, nada). Quem muda o status para AGUARDANDO_PECAS e a Tarefa 9.
 */

export const STATUS_ABERTOS_PARA_PECAS = ["PAGO", "AGUARDANDO_PECAS", "EM_SEPARACAO"];

const SELECAO_DO_PRODUTO = {
  id: true,
  sku: true,
  tituloBase: true,
  estoque: true,
  tipo: true,
  pecasProprias: true,
  componentes: { select: { componenteId: true, quantidade: true } },
  pecasDoProduto: { select: { componenteId: true, quantidade: true } },
};

function somar(mapa, produtoId, quantidade) {
  if (!produtoId || !(quantidade > 0)) return;
  mapa.set(produtoId, (mapa.get(produtoId) ?? 0) + quantidade);
}

/**
 * Quantas unidades de cada produto um pedido consome (Map produtoId → quantidade). Kit = cada componente x quantidade;
 * produto com pecas proprias = cada peca com produto (`componenteId`) x quantidade, arredondada para cima (meia peca
 * nao existe na prateleira). `produtosPorId` e um Map (ou objeto) dos produtos ja lidos com `componentes` e `pecasDoProduto`.
 */
export function necessidadeDoPedido(itens, produtosPorId) {
  const ler = (id) => (produtosPorId instanceof Map ? produtosPorId.get(id) : produtosPorId?.[id]) ?? null;
  const necessidade = new Map();
  for (const item of Array.isArray(itens) ? itens : []) {
    const quantidade = Number(item?.quantidade ?? 0);
    const produto = ler(item?.produtoId);
    if (!produto || !(quantidade > 0)) continue;
    if (produto.tipo === "COMPOSICAO") {
      for (const peca of produto.componentes ?? []) somar(necessidade, peca.componenteId, Number(peca.quantidade ?? 0) * quantidade);
    } else if (produto.pecasProprias) {
      for (const peca of produto.pecasDoProduto ?? []) {
        if (!peca.componenteId) continue;
        somar(necessidade, peca.componenteId, Math.ceil(Number(peca.quantidade ?? 0) * quantidade));
      }
    } else {
      somar(necessidade, produto.id, quantidade);
    }
  }
  return necessidade;
}

const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const DIA_MS = 24 * 60 * 60 * 1000;

/** A previsao de uma peca em falta: a compra enviada, senao a ordem de producao aberta, senao nada. */
function previsaoDaPeca(produtoId, compras, ordens) {
  const compra = compras.find((item) => item.produtoId === produtoId);
  if (compra) {
    const numero = `PC-${String(compra.pedido.numero).padStart(4, "0")}`;
    const enviadoEm = compra.pedido.enviadoEm ? new Date(compra.pedido.enviadoEm) : null;
    if (enviadoEm && compra.prazoDias !== null && compra.prazoDias !== undefined) {
      return { previsao: diaMes.format(new Date(enviadoEm.getTime() + Number(compra.prazoDias) * DIA_MS)), previsaoOrigem: "compra" };
    }
    return { previsao: `pedido ${numero}${enviadoEm ? ` enviado em ${diaMes.format(enviadoEm)}` : ""}, sem prazo`, previsaoOrigem: "compra" };
  }
  const ordem = ordens.find((o) => o.produtoId === produtoId);
  if (ordem) return { previsao: `em produção, ordem OP-${String(ordem.numero).padStart(4, "0")}`, previsaoOrigem: "producao" };
  return { previsao: null, previsaoOrigem: null };
}

/**
 * As pecas de um pedido (`pedido` = a linha de PedidoDeVenda com `itens`): necessario, disponivel (estoque menos a
 * reserva dos pedidos abertos mais antigos), falta e previsao. `falta` e true quando alguma peca falta.
 */
export async function calcularPecas(tx, pedido) {
  const itens = Array.isArray(pedido?.itens) ? pedido.itens : [];
  const idsDoPedido = [...new Set(itens.map((item) => item?.produtoId).filter(Boolean))];
  if (idsDoPedido.length === 0) return { pecas: [], falta: false };

  // Os pedidos abertos vendidos antes deste reservam as pecas deles primeiro.
  const abertos = await tx.pedidoDeVenda.findMany({
    where: { id: { not: pedido.id }, status: { in: STATUS_ABERTOS_PARA_PECAS }, dataDaVenda: { lt: pedido.dataDaVenda } },
    select: { itens: { select: { produtoId: true, quantidade: true } } },
  });
  const idsDosAbertos = abertos.flatMap((p) => p.itens.map((item) => item.produtoId)).filter(Boolean);

  const produtos = await tx.produto.findMany({ where: { id: { in: [...new Set([...idsDoPedido, ...idsDosAbertos])] } }, select: SELECAO_DO_PRODUTO });
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const necessidade = necessidadeDoPedido(itens, porId);
  if (necessidade.size === 0) return { pecas: [], falta: false };

  const reservas = new Map();
  for (const aberto of abertos) {
    for (const [produtoId, quantidade] of necessidadeDoPedido(aberto.itens, porId)) somar(reservas, produtoId, quantidade);
  }

  // As pecas em si podem nao estar na lista (sao componentes de um kit): le as que faltam.
  const idsDasPecas = [...necessidade.keys()].filter((id) => !porId.has(id));
  if (idsDasPecas.length > 0) {
    for (const p of await tx.produto.findMany({ where: { id: { in: idsDasPecas } }, select: SELECAO_DO_PRODUTO })) porId.set(p.id, p);
  }

  const emFalta = [...necessidade.entries()].filter(([produtoId, necessario]) => {
    const estoque = Number(porId.get(produtoId)?.estoque ?? 0);
    return necessario > Math.max(0, estoque - (reservas.get(produtoId) ?? 0));
  });
  const idsEmFalta = emFalta.map(([produtoId]) => produtoId);
  const [compras, ordens] =
    idsEmFalta.length > 0
      ? await Promise.all([
          tx.itemDoPedidoDeCompra.findMany({
            where: { produtoId: { in: idsEmFalta }, pedido: { status: { in: ["ENVIADO", "PARCIAL"] } } },
            select: { produtoId: true, quantidade: true, quantidadeLancada: true, prazoDias: true, pedido: { select: { numero: true, enviadoEm: true } } },
            orderBy: { pedido: { enviadoEm: "asc" } },
          }),
          tx.ordemDeProducao.findMany({
            where: { produtoId: { in: idsEmFalta }, situacao: { in: ["ABERTA", "EM_PRODUCAO"] } },
            select: { produtoId: true, numero: true },
            orderBy: { numero: "asc" },
          }),
        ])
      : [[], []];
  const comprasPendentes = compras.filter((item) => Number(item.quantidade) > Number(item.quantidadeLancada ?? 0));

  const pecas = [...necessidade.entries()].map(([produtoId, necessario]) => {
    const produto = porId.get(produtoId);
    const disponivel = Math.max(0, Number(produto?.estoque ?? 0) - (reservas.get(produtoId) ?? 0));
    const falta = Math.max(0, necessario - disponivel);
    const previsao = falta > 0 ? previsaoDaPeca(produtoId, comprasPendentes, ordens) : { previsao: null, previsaoOrigem: null };
    return { produtoId, sku: produto?.sku ?? null, nome: produto?.tituloBase ?? null, necessario, disponivel, falta, ...previsao };
  });
  return { pecas, falta: pecas.some((peca) => peca.falta > 0) };
}

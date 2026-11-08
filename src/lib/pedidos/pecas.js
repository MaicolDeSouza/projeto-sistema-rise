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
  blingSaldo: true,
  blingSaldoLidoEm: true,
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
 * `soOQueOBlingBaixa`: so o produto simples e as pecas do kit, que o Bling tira do saldo na venda; a peca propria (ordem de
 * producao) o Bling nao conhece, ele baixa o produto pronto.
 */
export function necessidadeDoPedido(itens, produtosPorId, { soOQueOBlingBaixa = false } = {}) {
  const ler = (id) => (produtosPorId instanceof Map ? produtosPorId.get(id) : produtosPorId?.[id]) ?? null;
  const necessidade = new Map();
  for (const item of Array.isArray(itens) ? itens : []) {
    const quantidade = Number(item?.quantidade ?? 0);
    const produto = ler(item?.produtoId);
    if (!produto || !(quantidade > 0)) continue;
    if (produto.tipo === "COMPOSICAO") {
      for (const peca of produto.componentes ?? []) somar(necessidade, peca.componenteId, Number(peca.quantidade ?? 0) * quantidade);
    } else if (produto.pecasProprias) {
      if (soOQueOBlingBaixa) continue;
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

/** Folga entre a venda e a copia dela no Bling (o aviso `espelhoNoBlingAusente` so sai com 1 h). */
const FOLGA_DA_COPIA_MS = 15 * 60 * 1000;

/**
 * O saldo do produto SEM o corte em zero: o `estoque` do Rise para em 0, mas o saldo virtual do Bling fica negativo
 * quando se vendeu mais do que havia (-2 = duas unidades vendidas sem ter). Com estoque > 0 os dois sao iguais; com 0, vale
 * o negativo do Bling (os ajustes do Rise ainda nao enviados ficam de fora nesse caso, e sao raros).
 */
export function saldoSemCorte(produto) {
  const estoque = Number(produto?.estoque ?? 0);
  if (estoque > 0) return estoque;
  const doBling = Number(produto?.blingSaldo);
  return Number.isFinite(doBling) ? Math.min(0, doBling) : 0;
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

  // TODOS os pedidos abertos entram: os mais antigos reservam as pecas deles primeiro, e o que o Bling ja tirou do saldo
  // por qualquer um deles (inclusive os mais novos) volta para a conta (abaixo).
  const outros = await tx.pedidoDeVenda.findMany({
    where: { id: { not: pedido.id }, status: { in: STATUS_ABERTOS_PARA_PECAS } },
    select: { id: true, origem: true, dataDaVenda: true, criadoEm: true, blingPedidoId: true, itens: { select: { produtoId: true, quantidade: true } } },
  });
  const esteAntes = (outro) => {
    const a = new Date(outro.dataDaVenda).getTime();
    const b = new Date(pedido.dataDaVenda).getTime();
    // Mesma hora: o id desempata, para os dois pedidos nao acharem que a ultima unidade e de cada um.
    return a < b || (a === b && String(outro.id) < String(pedido.id));
  };
  const idsDosAbertos = outros.flatMap((p) => p.itens.map((item) => item.produtoId)).filter(Boolean);

  const produtos = await tx.produto.findMany({ where: { id: { in: [...new Set([...idsDoPedido, ...idsDosAbertos])] } }, select: SELECAO_DO_PRODUTO });
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const necessidade = necessidadeDoPedido(itens, porId);
  if (necessidade.size === 0) return { pecas: [], falta: false };

  const reservas = new Map();
  for (const aberto of outros.filter(esteAntes)) {
    for (const [produtoId, quantidade] of necessidadeDoPedido(aberto.itens, porId)) somar(reservas, produtoId, quantidade);
  }

  // As pecas em si podem nao estar na lista (sao componentes de um kit): le as que faltam.
  const idsDasPecas = [...necessidade.keys()].filter((id) => !porId.has(id));
  if (idsDasPecas.length > 0) {
    for (const p of await tx.produto.findMany({ where: { id: { in: idsDasPecas } }, select: SELECAO_DO_PRODUTO })) porId.set(p.id, p);
  }

  // O que o Bling JA tirou do saldo por estes pedidos abertos (pergunta do dono em 08/11/2026: "a venda pode ter sido
  // justamente da ultima peca, ai vc olha que esta zerado o estoque, mas e que foi dado baixa da ultima peca devido a
  // ultima venda"). O estoque do Rise e o saldo do Bling lido de hora em hora, e o Bling baixa na venda: contar o pedido
  // de novo deixava "Aguardando pecas" com a peca na prateleira.
  const devolvido = new Map();
  for (const aberto of [pedido, ...outros]) {
    // O pedido do ML ou da LI sem copia no Bling nao baixou o saldo; o digitado no Bling e a propria venda de la (a coluna
    // `blingPedidoId` so e gravada na copia dos canais).
    if (!aberto.blingPedidoId && aberto.origem !== "BLING") continue;
    const vendaEm = new Date(aberto.dataDaVenda).getTime();
    // A copia do canal chega ao Bling minutos depois da venda: so conta como baixado o saldo lido com folga depois dela.
    // O pedido digitado no Bling ja estava la quando o Rise o viu (`criadoEm`).
    const baixadoDesde = aberto.origem === "BLING" && aberto.criadoEm ? new Date(aberto.criadoEm).getTime() : vendaEm + FOLGA_DA_COPIA_MS;
    for (const [produtoId, quantidade] of necessidadeDoPedido(aberto.itens, porId, { soOQueOBlingBaixa: true })) {
      const lidoEm = porId.get(produtoId)?.blingSaldoLidoEm;
      if (lidoEm && new Date(lidoEm).getTime() >= baixadoDesde) somar(devolvido, produtoId, quantidade);
    }
  }

  /** As unidades livres antes dos pedidos abertos: o saldo de agora mais o que o Bling ja tirou por eles. */
  const livre = (produtoId) => saldoSemCorte(porId.get(produtoId)) + (devolvido.get(produtoId) ?? 0);
  const disponivelPara = (produtoId) => Math.max(0, livre(produtoId) - (reservas.get(produtoId) ?? 0));

  const emFalta = [...necessidade.entries()].filter(([produtoId, necessario]) => necessario > disponivelPara(produtoId));
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
    const disponivel = disponivelPara(produtoId);
    const falta = Math.max(0, necessario - disponivel);
    const previsao = falta > 0 ? previsaoDaPeca(produtoId, comprasPendentes, ordens) : { previsao: null, previsaoOrigem: null };
    return { produtoId, sku: produto?.sku ?? null, nome: produto?.tituloBase ?? null, necessario, disponivel, falta, ...previsao };
  });
  return { pecas, falta: pecas.some((peca) => peca.falta > 0) };
}

import { ajustarEstoqueNaTransacao } from "@/lib/ajusteRapido";
import { clienteBling } from "@/lib/blingSync/cliente";
import { enviarAjustesDeEstoque } from "@/lib/blingSync/envio";
import { prisma } from "@/lib/db";
import { faltaLancar, numeroDoPedido, statusDepoisDeLancar, validarQuantidadeDeLancamento } from "@/lib/compras/regras";

/**
 * Lancar no estoque o que chegou de um item do pedido de compra, e desfazer (spec §7.5). Nenhum caminho novo de escrita
 * no Bling: a entrada (ou a saida do desfazer) e um MovimentoEstoque do Rise, e o envio e o `enviarAjustesDeEstoque` de
 * sempre (deposito padrao, travas de escrita, uma tentativa, marca `enviadoAoBlingEm`).
 *
 * A trava do "duas vezes": o item e o pedido sao travados (`FOR UPDATE`) e a quantidade que ainda cabe e lida DEPOIS
 * da trava; o segundo clique de um clique duplo espera o primeiro e encontra o item ja lancado. O Bling e chamado so
 * depois do commit: se ele recusar, a entrada fica no Rise como ajuste pendente (o "!" do Bling na lista de Produtos) e
 * nada repete sozinho.
 */

async function travarItem(tx, itemId) {
  const [linha] = await tx.$queryRaw`
    SELECT i."produtoId", i."quantidade", i."quantidadeLancada", i."pedidoId", p."status"::text AS "status", p."numero"
    FROM "ItemDoPedidoDeCompra" i JOIN "PedidoDeCompra" p ON p."id" = i."pedidoId"
    WHERE i."id" = ${String(itemId ?? "")}
    FOR UPDATE OF i, p`;
  return linha ?? null;
}

/** Regrava a soma do item e a situacao do pedido (PARCIAL se algum item tem lancamento vivo, senao ENVIADO). */
async function acertarItemEPedido(tx, itemId, pedidoId, status) {
  const soma = await tx.lancamentoDoItemDeCompra.aggregate({ where: { itemId, desfeitoEm: null }, _sum: { quantidade: true } });
  await tx.itemDoPedidoDeCompra.update({ where: { id: itemId }, data: { quantidadeLancada: soma._sum.quantidade ?? 0 } });
  const itens = await tx.itemDoPedidoDeCompra.findMany({ where: { pedidoId }, select: { quantidade: true, quantidadeLancada: true } });
  const novo = statusDepoisDeLancar(status, itens);
  if (novo !== status) await tx.pedidoDeCompra.update({ where: { id: pedidoId }, data: { status: novo } });
  return novo;
}

/** Manda ao Bling os ajustes pendentes do produto; nunca lanca (o resultado so vira o aviso da tela). */
async function enviarAoBling(produtoId, cliente, depositoId) {
  try {
    const resultado = await enviarAjustesDeEstoque(produtoId, cliente, depositoId ? { depositoId } : {});
    if (resultado.ok) return { ok: true };
    return { ok: false, erro: resultado.erro, precisaDeposito: resultado.precisaDeposito ?? null };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/**
 * @returns {Promise<{ ok: true, lancamentoId: string, saldoNovo: number, status: string, bling: { ok: boolean, erro?: string, precisaDeposito?: any } } | { ok: false, erro: string }>}
 */
export async function lancarEstoqueDoItem(itemId, quantidade, { cliente = clienteBling(), depositoId } = {}) {
  let gravado;
  try {
    gravado = await prisma.$transaction(async (tx) => {
      const item = await travarItem(tx, itemId);
      if (!item) return { ok: false, erro: "Item não encontrado. Recarregue a página." };
      if (!["ENVIADO", "PARCIAL"].includes(item.status)) return { ok: false, erro: "Só se lança estoque de pedido enviado." };
      const falta = faltaLancar(item);
      const valida = validarQuantidadeDeLancamento(quantidade, falta);
      if (!valida.ok) {
        return { ok: false, erro: falta === 0 ? `Já lançado ${item.quantidadeLancada} de ${item.quantidade}.` : valida.erro };
      }

      const ajuste = await ajustarEstoqueNaTransacao(tx, item.produtoId, {
        tipo: "ENTRADA",
        quantidade: valida.quantidade,
        motivo: "Compra de fornecedor",
        observacao: numeroDoPedido(item.numero),
      });
      if (!ajuste.ok) return ajuste;

      const lancamento = await tx.lancamentoDoItemDeCompra.create({
        data: { itemId: String(itemId), quantidade: valida.quantidade, movimentoId: ajuste.movimentoId },
        select: { id: true },
      });
      const status = await acertarItemEPedido(tx, String(itemId), item.pedidoId, item.status);
      return { ok: true, lancamentoId: lancamento.id, saldoNovo: ajuste.saldoNovo, status, produtoId: item.produtoId };
    });
  } catch (erro) {
    return { ok: false, erro: `Não foi possível lançar: ${erro.message}` };
  }
  if (!gravado.ok) return gravado;

  const { produtoId, ...resto } = gravado;
  return { ...resto, bling: await enviarAoBling(produtoId, cliente, depositoId) };
}

/** Desfaz o ULTIMO lancamento vivo do item (saida da mesma quantidade). So em pedido parcial. */
export async function desfazerUltimoLancamento(itemId, { cliente = clienteBling(), depositoId } = {}) {
  let gravado;
  try {
    gravado = await prisma.$transaction(async (tx) => {
      const item = await travarItem(tx, itemId);
      if (!item) return { ok: false, erro: "Item não encontrado. Recarregue a página." };
      if (item.status !== "PARCIAL") return { ok: false, erro: "Só se desfaz lançamento de pedido em entrega parcial." };
      const ultimo = await tx.lancamentoDoItemDeCompra.findFirst({
        where: { itemId: String(itemId), desfeitoEm: null },
        orderBy: { lancadoEm: "desc" },
      });
      if (!ultimo) return { ok: false, erro: "Este item não tem lançamento para desfazer." };

      const ajuste = await ajustarEstoqueNaTransacao(tx, item.produtoId, {
        tipo: "SAIDA",
        quantidade: ultimo.quantidade,
        motivo: "Outro",
        observacao: `Desfazer lançamento ${numeroDoPedido(item.numero)}`,
      });
      if (!ajuste.ok) {
        // O saldo de hoje e menor que o lancado: parte ja foi vendida. Desfazer deixaria o estoque negativo.
        if (/maior que o saldo/.test(ajuste.erro)) {
          return { ok: false, erro: "Já saíram unidades deste produto depois do lançamento; ajuste pela lista de Produtos." };
        }
        return ajuste;
      }

      await tx.lancamentoDoItemDeCompra.update({ where: { id: ultimo.id }, data: { desfeitoEm: new Date() } });
      const status = await acertarItemEPedido(tx, String(itemId), item.pedidoId, item.status);
      return { ok: true, lancamentoId: ultimo.id, saldoNovo: ajuste.saldoNovo, status, produtoId: item.produtoId };
    });
  } catch (erro) {
    return { ok: false, erro: `Não foi possível desfazer: ${erro.message}` };
  }
  if (!gravado.ok) return gravado;

  const { produtoId, ...resto } = gravado;
  return { ...resto, bling: await enviarAoBling(produtoId, cliente, depositoId) };
}

/** "Enviar neste deposito" / "Reenviar": so manda ao Bling o que o produto tem pendente. */
export async function reenviarPendentes(produtoId, depositoId, { cliente = clienteBling() } = {}) {
  return enviarAoBling(String(produtoId ?? ""), cliente, depositoId);
}

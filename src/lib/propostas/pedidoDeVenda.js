import { prisma } from "@/lib/db";
import { clienteBling } from "@/lib/blingSync/cliente";
import { lerProposta } from "@/lib/propostas/banco";
import { enviarClienteAoBling } from "@/lib/propostas/cliente";
import { hojeEmSaoPaulo, prazoGeral, textoDoPagamento, TEXTO_DO_FRETE } from "@/lib/propostas/regras";

/**
 * A proposta APROVADA vira pedido de venda no Bling (spec 2026-11-12, extra B). O pedido volta sozinho para Vendas pela
 * leitura do Bling a cada 5 min (lib/pedidos/), e a proposta guarda o id para nunca duplicar.
 *
 * Exige o cliente com CPF/CNPJ (e o contato no Bling, criado aqui se faltar) e TODO item com produto do Rise que exista
 * no Bling (`blingId`): item avulso e recusado com o motivo, para o operador cadastrar o produto antes.
 *
 * NUNCA MEDIDO: o corpo exato que o Bling aceita em `POST /pedidos/vendas`. O primeiro envio real e no produto de teste
 * (ZZ-TESTE-BLING), com o OK do dono. As parcelas NAO vao (a forma de pagamento do Bling tem id da conta e a soma das
 * parcelas tem de bater com o total): o pagamento combinado vai nas observacoes internas.
 */

/** fretePorConta do Bling: 0 remetente (CIF), 1 destinatario (FOB), 9 sem transporte (cliente retira). */
const FRETE_NO_BLING = { CIF: 0, FOB: 1, RETIRA: 9 };

export function montarCorpoDoPedido(proposta, { blingContatoId, produtosNoBling, hoje = hojeEmSaoPaulo() }) {
  const totais = proposta.totais;
  const pagamento = textoDoPagamento(proposta);
  const internas = [
    `Gerado pela Proposta ${proposta.numero} do Rise.`,
    pagamento ? `Pagamento: ${pagamento.replace(/\n/g, " · ")}` : null,
    `Prazo: ${prazoGeral(proposta.itens)}`,
    `Frete: ${TEXTO_DO_FRETE[proposta.fretePorConta]}`,
    proposta.observacoesInternas,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    data: hoje,
    contato: { id: Number(blingContatoId) },
    ...(proposta.ocCliente ? { numeroPedidoCompra: proposta.ocCliente } : {}),
    itens: proposta.itens.map((item) => ({
      produto: { id: Number(produtosNoBling.get(item.produtoId)) },
      codigo: item.sku ?? item.codigoInterno,
      descricao: item.nomeInterno ?? item.descricaoCliente,
      unidade: item.unidade,
      quantidade: item.quantidade,
      valor: item.precoUnitario,
      // No Bling o desconto do item e percentual (o mesmo que a leitura dos pedidos usa).
      desconto: item.descontoPercentual || 0,
    })),
    ...(totais.desconto > 0 ? { desconto: { valor: totais.desconto, unidade: "REAL" } } : {}),
    ...(FRETE_NO_BLING[proposta.fretePorConta] !== undefined
      ? {
          transporte: {
            fretePorConta: FRETE_NO_BLING[proposta.fretePorConta],
            ...(totais.frete > 0 ? { frete: totais.frete } : {}),
            ...(proposta.transportadoraNome ? { contato: { nome: proposta.transportadoraNome } } : {}),
          },
        }
      : {}),
    ...(proposta.observacoesNf ? { observacoes: proposta.observacoesNf } : {}),
    observacoesInternas: internas,
  };
}

/** O que impede o envio, em frases para a tela (o popup lista antes de o operador confirmar). */
export function impedimentosDoPedido(proposta, produtosNoBling) {
  const motivos = [];
  if (proposta.situacao !== "APROVADA") motivos.push("A proposta precisa estar aprovada.");
  if (!proposta.clienteId) motivos.push("O cliente não está cadastrado: informe o CPF/CNPJ e salve.");
  if (!proposta.itens.length) motivos.push("A proposta não tem itens.");
  const avulsos = proposta.itens.filter((item) => !item.produtoId).length;
  if (avulsos) motivos.push(`${avulsos} item(ns) sem produto do Rise: cadastre o produto e troque o item.`);
  const foraDoBling = proposta.itens.filter((item) => item.produtoId && !produtosNoBling.get(item.produtoId)).map((item) => item.sku ?? item.codigoInterno);
  if (foraDoBling.length) motivos.push(`Sem cadastro no Bling: ${foraDoBling.join(", ")}.`);
  return motivos;
}

async function produtosNoBlingDa(proposta, db) {
  const ids = proposta.itens.map((item) => item.produtoId).filter(Boolean);
  const produtos = await db.produto.findMany({ where: { id: { in: ids } }, select: { id: true, blingId: true } });
  return new Map(produtos.map((p) => [p.id, p.blingId || null]));
}

/** O que a janela mostra antes de confirmar: os impedimentos (vazio = pode enviar). */
export async function conferirPedidoDeVenda(numero, { db = prisma } = {}) {
  const proposta = await lerProposta(numero);
  if (!proposta) return { ok: false, erro: "Proposta não encontrada." };
  return { ok: true, impedimentos: impedimentosDoPedido(proposta, await produtosNoBlingDa(proposta, db)) };
}

/**
 * Gera o pedido no Bling. Clique duplo e repetir nao duplicam: a proposta e marcada "em envio" (`pedidoDeVendaEm` sem id)
 * antes do POST, e quem chega depois recusa. Falha antes do POST solta a marca; falha DEPOIS do POST (rede, 5xx) deixa
 * a marca e pede para conferir no Bling, porque ele pode ter gravado.
 */
export async function gerarPedidoDeVenda(numero, { bling = clienteBling(), db = prisma, exigirEscrita, agora = new Date() } = {}) {
  const proposta = await lerProposta(numero);
  if (!proposta) return { ok: false, erro: "Proposta não encontrada." };
  if (proposta.pedidoDeVendaBlingId) return { ok: true, blingPedidoId: proposta.pedidoDeVendaBlingId, jaExistia: true };
  const produtosNoBling = await produtosNoBlingDa(proposta, db);
  const impedimentos = impedimentosDoPedido(proposta, produtosNoBling);
  if (impedimentos.length) return { ok: false, erro: impedimentos.join(" ") };

  const marca = await db.propostaParaCliente.updateMany({
    where: { id: proposta.id, pedidoDeVendaBlingId: null, pedidoDeVendaEm: null },
    data: { pedidoDeVendaEm: agora },
  });
  if (marca.count === 0) {
    return { ok: false, erro: "O pedido desta proposta já está sendo gerado (ou ficou sem resposta do Bling). Confira no Bling antes de tentar de novo." };
  }
  const soltar = () => db.propostaParaCliente.update({ where: { id: proposta.id }, data: { pedidoDeVendaEm: null } });

  try {
    for (const item of proposta.itens) (exigirEscrita ?? ((codigo) => bling.exigirEscrita(codigo)))(item.sku ?? item.codigoInterno);
  } catch (erro) {
    await soltar();
    return { ok: false, erro: erro.message };
  }
  const contato = await enviarClienteAoBling(proposta.clienteId, { bling, db, exigirEscrita: () => {} });
  if (!contato.ok) {
    await soltar();
    return { ok: false, erro: contato.erro };
  }

  const corpo = montarCorpoDoPedido(proposta, { blingContatoId: contato.blingContatoId, produtosNoBling });
  let resposta;
  try {
    resposta = await bling.post("/pedidos/vendas", corpo);
  } catch (erro) {
    return { ok: false, erro: `Falha ao criar o pedido no Bling: ${erro?.message ?? erro}. Ele pode ter sido criado: confira no Bling antes de tentar de novo.` };
  }
  if (!resposta?.ok) {
    if ((resposta?.status ?? 0) < 500) await soltar();
    const detalhe = resposta?.dados?.error?.description ?? resposta?.dados?.error?.message ?? "";
    return { ok: false, erro: `O Bling recusou o pedido (HTTP ${resposta?.status ?? "?"}${detalhe ? `: ${detalhe}` : ""}).` };
  }
  const id = String(resposta.dados?.data?.id ?? "");
  if (!/^\d+$/.test(id)) return { ok: false, erro: "O Bling aceitou o pedido mas não devolveu o id. Confira no Bling." };
  await db.propostaParaCliente.update({ where: { id: proposta.id }, data: { pedidoDeVendaBlingId: id, pedidoDeVendaEm: agora } });
  return { ok: true, blingPedidoId: id };
}

import { z } from "zod";

import { prisma } from "@/lib/db";
import { marcarEmSeparacao, vincularCliente } from "@/lib/pedidos/banco";
import { marcarNotaDeDevolucao } from "@/lib/pedidos/reclamacoesML";
import { TEXTO_DO_STATUS } from "@/lib/pedidos/status";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

import { CONFIRMO, ESCRITA, acharCliente, clienteParaMostrar, exigir, exigirOk, previa } from "./doisPassos.js";
import { acharPedido } from "./pedidosDeVenda.js";

/**
 * Pedidos de venda pelo MCP, a escrita (26/11/2026, grupo "Pedidos de venda"): as tres acoes da tela do pedido que a
 * conversa pede (em separacao, vincular o cliente e a nota de devolucao do ML emitida), pelas MESMAS funcoes de
 * `lib/pedidos` e com o acesso de cada uma (`acao.pedidos.*` em executar). Nada daqui escreve no ML, na LI ou no Bling.
 */

const TEXTO = (maximo) => z.string().trim().max(maximo);
const PEDIDO = TEXTO(60).min(1).describe("O número do pedido (o do canal ou o do Bling)");

async function lerResumo(id) {
  const pedido = await prisma.pedidoDeVenda.findUnique({
    where: { id },
    select: { id: true, numero: true, canal: true, status: true, emSeparacao: true, total: true, nomeDoComprador: true, cliente: { select: { nome: true, documento: true } } },
  });
  return pedido;
}

const status = (codigo) => TEXTO_DO_STATUS[codigo] ?? codigo;

export async function marcarPedidoEmSeparacao({ pedido, ligado = true, confirmo }, { pode }) {
  exigir(pode, "acao.pedidos.marcarSeparacao", "executar", "marcar pedidos em separação");
  const atual = await lerResumo(await acharPedido(pedido));
  if (Boolean(atual.emSeparacao) === Boolean(ligado)) throw new ErroDeFerramenta(`O pedido ${atual.numero} ${ligado ? "já está" : "não está"} em separação.`);
  const resumo = { pedido: atual.numero, canal: atual.canal, statusAtual: status(atual.status), emSeparacao: ligado ? "liga" : "desliga" };
  if (!confirmo) return previa(resumo);
  const feito = exigirOk(await marcarEmSeparacao(atual.id, Boolean(ligado)));
  return { gravado: true, ...resumo, statusNovo: status(feito.status) };
}

export async function vincularClienteAoPedido({ pedido, cliente, confirmo }, { pode }) {
  exigir(pode, "acao.pedidos.vincularCliente", "executar", "vincular cliente a pedidos");
  const atual = await lerResumo(await acharPedido(pedido));
  const escolhido = await acharCliente(cliente);
  const resumo = {
    pedido: atual.numero,
    canal: atual.canal,
    nomeNoPedido: atual.nomeDoComprador ?? null,
    clienteAtual: atual.cliente ? clienteParaMostrar(atual.cliente, pode) : null,
    clienteNovo: clienteParaMostrar(escolhido, pode),
  };
  if (!confirmo) return previa(resumo);
  exigirOk(await vincularCliente(atual.id, escolhido.id));
  return { gravado: true, ...resumo };
}

export async function marcarNotaDeDevolucaoEmitida({ pedido, numeroDaNota, emitida = true, confirmo }, { pode, usuario }) {
  exigir(pode, "acao.pedidos.marcarNotaDeDevolucao", "executar", "marcar a nota de devolução");
  const atual = await lerResumo(await acharPedido(pedido));
  const reclamacoes = await prisma.reclamacaoML.findMany({
    where: { pedidoId: atual.id },
    orderBy: { abertaEm: "desc" },
    select: { id: true, devolucaoStatus: true, notaDevolucaoEm: true, notaDevolucaoNumero: true },
  });
  if (!reclamacoes.length) throw new ErroDeFerramenta(`O pedido ${atual.numero} não tem reclamação do Mercado Livre com devolução.`);
  const reclamacao = reclamacoes.find((r) => (emitida ? !r.notaDevolucaoEm : r.notaDevolucaoEm)) ?? reclamacoes[0];
  if (emitida && reclamacao.notaDevolucaoEm) throw new ErroDeFerramenta(`A nota de devolução do pedido ${atual.numero} já está marcada (nº ${reclamacao.notaDevolucaoNumero ?? "sem número"}).`);
  const resumo = { pedido: atual.numero, notaDeDevolucao: emitida ? `marcar como emitida${numeroDaNota ? ` (nº ${numeroDaNota})` : ""}` : "desfazer a marcação" };
  if (!confirmo) return previa(resumo);
  exigirOk(await marcarNotaDeDevolucao({ reclamacaoId: reclamacao.id, numero: numeroDaNota ?? null, por: usuario ?? null, emitida }));
  return { gravado: true, ...resumo };
}

export const FERRAMENTAS_DE_PEDIDOS_DE_VENDA_ESCRITA = [
  {
    nome: "marcarPedidoEmSeparacao",
    descricao:
      "Liga (ligado: true) ou desliga a marca 'Em separação' de um pedido de venda pago, como o botão da tela do pedido. Dois passos: sem confirmo devolve a prévia; com confirmo: true grava. Não escreve no canal.",
    esquema: z.object({ pedido: PEDIDO, ligado: z.boolean().optional().describe("Padrão true"), confirmo: CONFIRMO }),
    anotacoes: ESCRITA,
    executar: marcarPedidoEmSeparacao,
  },
  {
    nome: "vincularClienteAoPedido",
    descricao:
      "Liga um pedido de venda a um cliente do Rise (pelo CPF/CNPJ ou nome), como o 'Vincular cliente' da tela. Dois passos: sem confirmo devolve o cliente de hoje e o novo; com confirmo: true grava.",
    esquema: z.object({ pedido: PEDIDO, cliente: TEXTO(200).min(1).describe("CPF/CNPJ ou nome do cliente"), confirmo: CONFIRMO }),
    anotacoes: ESCRITA,
    executar: vincularClienteAoPedido,
  },
  {
    nome: "marcarNotaDeDevolucaoEmitida",
    descricao:
      "Marca como emitida (ou desfaz, com emitida: false) a nota fiscal de devolução de um pedido do Mercado Livre com devolução postada, com o número da nota. Dois passos: sem confirmo devolve a prévia; com confirmo: true grava. Não emite nota: só registra a que foi emitida.",
    esquema: z.object({
      pedido: PEDIDO,
      numeroDaNota: TEXTO(20).optional(),
      emitida: z.boolean().optional().describe("Padrão true; false desfaz"),
      confirmo: CONFIRMO,
    }),
    anotacoes: ESCRITA,
    executar: marcarNotaDeDevolucaoEmitida,
  },
];

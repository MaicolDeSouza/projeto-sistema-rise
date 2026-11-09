import { prisma } from "@/lib/db";
import { custoDaComposicao } from "@/lib/canaisDeVenda/composicao";
import { carregarAnuncioML } from "@/lib/canaisDeVenda/ml/banco";
import { freteQueConta } from "@/lib/canaisDeVenda/ml/custos";
import { lerCustosDoAnuncio } from "@/lib/canaisDeVenda/ml/leitura";
import { preencherEstimativasDoProduto } from "@/lib/pedidos/banco";

/**
 * Guarda a CONTA DO EDITOR do ML de um anuncio (pedido do dono em 09/11/2026, Tarefa 8, Opcao 2: "quero saber se fizemos o
 * calculo do custo errado comparando com o que recebemos"): o preco, a comissao, a tarifa fixa e o frete do vendedor lidos do
 * ML como o editor le (`lerCustosDoAnuncio`), e o custo de um kit (o do produto ou a soma das pecas, como o editor). Chamada
 * no fim do Publicar, no Reaproveitar e em cada envio de preco; a estimativa do pedido e a ultima conta antes da venda.
 * Depois de guardar, preenche a estimativa das vendas desse produto e desse kit que ainda estavam sem.
 *
 * So le o ML; falha aqui nunca derruba a publicacao (quem chama so registra). Devolve `{ ok, conta, preenchidos }`.
 */
export async function guardarContaDoEditor(anuncioId, { ml, motivo }) {
  const carregado = await carregarAnuncioML(anuncioId);
  if (!carregado?.ok || !carregado.rascunho) return { ok: false, erro: "Anúncio não encontrado." };
  const { rascunho, contexto } = carregado;
  const preco = Number(rascunho.preco);
  if (!(preco > 0) || !rascunho.produtoId) return { ok: false, erro: "Anúncio sem preço ou sem produto." };

  const custos = await lerCustosDoAnuncio(ml, rascunho);
  const itens = Array.isArray(rascunho.composicao?.itens) ? rascunho.composicao.itens : [];
  // O tamanho do kit e a soma das quantidades da composicao, a mesma conta do casamento do pedido (`unidadesDoKit` em
  // lib/pedidos/itens.js); fora do kit, 1.
  const unidadesDoKit = rascunho.composicao ? Math.max(1, itens.reduce((soma, item) => soma + (Number(item?.quantidade) || 0), 0)) : 1;
  const produtos = contexto?.produtos ?? {};
  const custoDoKit = rascunho.composicao
    ? custoDaComposicao(itens, Object.fromEntries(itens.map((item) => [item.produtoId, produtos[item.produtoId]?.custo?.valor]))).valor
    : (produtos[rascunho.produtoId]?.custo?.valor ?? null);

  const conta = await prisma.contaDoEditorML.create({
    data: {
      anuncioId,
      produtoId: rascunho.produtoId,
      unidadesDoKit,
      motivo,
      preco,
      percentual: Number(custos.percentual ?? 0),
      tarifaFixa: Number(custos.tarifaFixa ?? 0),
      frete: freteQueConta(custos, rascunho),
      custoDoKit: custoDoKit === null || custoDoKit === undefined || !Number.isFinite(Number(custoDoKit)) ? null : Number(custoDoKit),
    },
  });
  const { preenchidos } = await preencherEstimativasDoProduto(rascunho.produtoId, unidadesDoKit);
  return { ok: true, conta, preenchidos };
}

/** O mesmo, sem nunca lancar: para o fim do Publicar, do Reaproveitar e do envio de preco. */
export async function guardarContaDoEditorSemFalhar(anuncioId, opcoes) {
  try {
    return await guardarContaDoEditor(anuncioId, opcoes);
  } catch (erro) {
    console.error("[ml conta do editor]", anuncioId, erro?.message ?? erro);
    return { ok: false, erro: erro?.message ?? String(erro) };
  }
}

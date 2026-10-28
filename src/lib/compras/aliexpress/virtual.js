import { clienteBling } from "@/lib/blingSync/cliente";

/**
 * O deposito "Virtual" do Bling (spec 2026-10-28, §6.3b; decisao do dono em 28/10/2026): a compra do AliExpress entra
 * nele na importacao e sai na chegada. Ele tem `desconsiderarSaldo`, entao nao muda o saldo de venda do produto; o
 * estoque a caminho da lista do minimo vem do proprio pedido de compra, nao daqui.
 *
 * Os ids dos depositos sao da conta (medido em 28/10/2026: "Fisico" 1423545090 padrao, "Virtual" 1432737444): o
 * Virtual e achado PELO NOME a cada envio, nunca por id fixo. As travas de escrita valem (`exigirEscrita` antes de
 * qualquer chamada), e a recusa volta como `{ ok: false, erro }` para a importacao seguir com as outras linhas.
 */

/** O deposito cuja descricao e "Virtual" (sem caixa), ou null. */
export async function depositoVirtual(cliente = clienteBling()) {
  const resposta = await cliente.get("/depositos");
  if (!resposta?.ok) throw new Error(`O Bling recusou a leitura dos depósitos (${motivo(resposta)}).`);
  const lista = Array.isArray(resposta?.dados?.data) ? resposta.dados.data : [];
  const achado = lista.find((deposito) => String(deposito?.descricao ?? "").trim().toLowerCase() === "virtual");
  return achado ? { id: Number(achado.id) } : null;
}

function motivo(resposta) {
  const erro = resposta?.dados?.error;
  const descricao = erro?.description ?? erro?.message ?? null;
  return `HTTP ${resposta?.status ?? "sem status"}${descricao ? `: ${descricao}` : ""}`;
}

async function lancarNoVirtual(operacao, { sku, blingId, quantidade, observacao }, { cliente = clienteBling() } = {}) {
  const qtde = Number(quantidade);
  if (!Number.isInteger(qtde) || qtde < 0) return { ok: false, erro: "Quantidade inválida." };
  if (qtde === 0) return { ok: true, depositoId: null };
  if (!blingId) return { ok: false, erro: "Produto sem cadastro no Bling." };
  try {
    cliente.exigirEscrita(sku);
    const deposito = await depositoVirtual(cliente);
    if (!deposito) return { ok: false, erro: "Sem depósito Virtual no Bling." };
    const corpo = { produto: { id: Number(blingId) }, deposito: { id: deposito.id }, operacao, quantidade: qtde };
    if (observacao) corpo.observacoes = String(observacao).slice(0, 200);
    const resposta = await cliente.post("/estoques", corpo);
    if (!resposta?.ok) return { ok: false, erro: `O Bling recusou o depósito Virtual (${motivo(resposta)}).` };
    return { ok: true, depositoId: deposito.id };
  } catch (erro) {
    return { ok: false, erro: erro?.message ?? String(erro) };
  }
}

/** Entrada ("E") no deposito Virtual: a compra que esta a caminho. */
export const entradaNoVirtual = (dados, opcoes) => lancarNoVirtual("E", dados, opcoes);

/** Saida ("S") do deposito Virtual: a caixa chegou (o Lancar estoque poe no Fisico) ou o pedido foi cancelado. */
export const saidaDoVirtual = (dados, opcoes) => lancarNoVirtual("S", dados, opcoes);

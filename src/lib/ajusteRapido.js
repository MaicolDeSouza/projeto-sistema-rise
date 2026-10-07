import { prisma } from "@/lib/db";
import { MAXIMO_ESTOQUE, MOTIVOS, novoSaldo, tipoValido } from "@/lib/estoque";

/**
 * A logica de banco da edicao rapida da lista de Produtos (pedido do dono em
 * 30/09/2026). Fica aqui, e nao dentro das Server Actions, porque `revalidatePath`
 * so existe dentro do Next: o teste (scripts/teste-estoque.js) chama estas funcoes
 * direto, e as acoes so acrescentam a revalidacao da tela.
 *
 * SO NO BANCO LOCAL. Nada disto chega ao Bling nem aos canais: a escrita neles esta
 * desligada, e o Mercado Livre e a Loja Integrada leem estoque e preco pelo Bling.
 */

const MAXIMO_LOCALIZACAO = 40;
const MAXIMO_OBSERVACAO = 200;
const MAXIMO_PRECO = 9_999_999.99;

function falha(erro) {
  if (erro?.code === "P2025") {
    return { ok: false, erro: "Produto não encontrado. Ele pode ter sido excluído." };
  }
  console.error("[edicao rapida]", erro);
  return { ok: false, erro: "Não foi possível salvar. Tente de novo." };
}

/** Texto vazio limpa a localizacao. */
export async function gravarLocalizacao(id, texto) {
  const valor = String(texto ?? "").trim();
  if (valor.length > MAXIMO_LOCALIZACAO) {
    return { ok: false, erro: `Use até ${MAXIMO_LOCALIZACAO} caracteres.` };
  }

  try {
    await prisma.produto.update({ where: { id }, data: { localizacao: valor || null } });
    return { ok: true };
  } catch (erro) {
    return falha(erro);
  }
}

/**
 * O preco de venda e UM SO por produto: os conectores leem `Produto.precoVenda`, nao
 * ha preco por canal no banco. Vazio nao limpa aqui (o cadastro completo faz isso).
 */
export async function gravarPrecoVenda(id, valor) {
  const numero = Number(String(valor ?? "").trim().replace(",", "."));
  if (!Number.isFinite(numero) || numero <= 0) {
    return { ok: false, erro: "Informe o preço de venda." };
  }
  if (numero > MAXIMO_PRECO) {
    return { ok: false, erro: "Preço acima do limite permitido." };
  }

  try {
    await prisma.produto.update({ where: { id }, data: { precoVenda: numero.toFixed(2) } });
    return { ok: true };
  } catch (erro) {
    return falha(erro);
  }
}

/**
 * Entrada, saida ou balanco, gravando o movimento junto.
 *
 * A linha do produto e TRAVADA (`FOR UPDATE`) antes de ler o saldo: dois ajustes ao
 * mesmo tempo (duas abas, dois cliques) leriam o mesmo saldo e o segundo apagaria o
 * primeiro. Numa transacao so, o saldo novo e o movimento nascem juntos ou nao nascem.
 *
 * @param {string} id
 * @param {{tipo: string, quantidade: number|string, motivo?: string, observacao?: string}} dados
 */
export async function gravarAjusteDeEstoque(id, dados = {}) {
  const { tipo, quantidade, motivo, observacao } = dados;

  if (!tipoValido(tipo)) return { ok: false, erro: "Escolha entrada, saída ou balanço." };

  const numero = Number(quantidade);
  if (quantidade === "" || quantidade === null || !Number.isInteger(numero) || numero < 0) {
    return { ok: false, erro: "Informe a quantidade, em número inteiro." };
  }
  if (numero > MAXIMO_ESTOQUE) {
    return { ok: false, erro: `Quantidade acima do limite de ${MAXIMO_ESTOQUE}.` };
  }
  if (tipo !== "BALANCO" && numero === 0) {
    return { ok: false, erro: "A quantidade precisa ser maior que zero." };
  }

  const motivoLimpo = String(motivo ?? "").trim();
  if (motivoLimpo && !MOTIVOS[tipo].includes(motivoLimpo)) {
    return { ok: false, erro: "Motivo inválido para esta operação." };
  }
  const observacaoLimpa = String(observacao ?? "").trim();
  if (observacaoLimpa.length > MAXIMO_OBSERVACAO) {
    return { ok: false, erro: `A observação aceita até ${MAXIMO_OBSERVACAO} caracteres.` };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const linhas = await tx.$queryRaw`SELECT "estoque" FROM "Produto" WHERE "id" = ${id} FOR UPDATE`;
      if (linhas.length === 0) {
        return { ok: false, erro: "Produto não encontrado. Ele pode ter sido excluído." };
      }

      const anterior = linhas[0].estoque;
      const novo = novoSaldo(tipo, anterior, numero);
      if (novo < 0) {
        return { ok: false, erro: `A saída (${numero}) é maior que o saldo (${anterior}).` };
      }
      if (novo > MAXIMO_ESTOQUE) {
        return { ok: false, erro: `O saldo passaria do limite de ${MAXIMO_ESTOQUE}.` };
      }

      await tx.produto.update({ where: { id }, data: { estoque: novo } });
      await tx.movimentoEstoque.create({
        data: {
          produtoId: id,
          tipo,
          quantidade: numero,
          saldoAnterior: anterior,
          saldoNovo: novo,
          motivo: motivoLimpo || null,
          observacao: observacaoLimpa || null,
        },
      });

      return { ok: true, saldoAnterior: anterior, saldoNovo: novo };
    });
  } catch (erro) {
    return falha(erro);
  }
}

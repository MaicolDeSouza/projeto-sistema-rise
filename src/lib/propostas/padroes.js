import { prisma } from "@/lib/db";
import { FORMAS_DE_PAGAMENTO, TEXTO_DO_FRETE } from "@/lib/propostas/regras";

/**
 * Padroes de proposta por tipo de cliente (pedido do dono em 13/11/2026: "um padrao agora para o Senai ... um padrao
 * para Instituto Federal ... e o padrao para cliente comum. Desta forma, garantimos que a nossa proposta saira sempre
 * padronizada conforme o padrao do cliente").
 *
 * O padrao e um molde: ao ser aplicado, COPIA validade, pagamento, frete, garantia e observacoes para a proposta (o
 * operador pode mudar cada um depois). As `exigencias` (a lista do cliente) ficam a vista no editor e nunca vao ao PDF;
 * `exigeMarcaModelo` liga a coluna Marca / Modelo no PDF e o "!" do item sem marca.
 */

const texto = (valor, maximo) => {
  const limpo = String(valor ?? "").trim();
  return limpo ? limpo.slice(0, maximo) : null;
};

export function conferirPadrao(entrada = {}) {
  const erros = {};
  const nome = texto(entrada.nome, 80);
  if (!nome) erros.nome = "Informe o nome do padrão.";
  const dias = Number(String(entrada.validadeDias ?? "").trim());
  if (!Number.isInteger(dias) || dias < 1 || dias > 365) erros.validadeDias = "Validade de 1 a 365 dias.";
  const forma = texto(entrada.formaPagamento, 60);
  if (forma && !FORMAS_DE_PAGAMENTO.includes(forma)) erros.formaPagamento = "Forma de pagamento inválida.";
  if (Object.keys(erros).length) return { erros };
  return {
    dados: {
      nome,
      ativo: entrada.ativo === undefined ? true : entrada.ativo === true || entrada.ativo === "on" || entrada.ativo === "true",
      validadeDias: dias,
      formaPagamento: forma,
      pagamentoTexto: texto(entrada.pagamentoTexto, 2000),
      fretePorConta: TEXTO_DO_FRETE[entrada.fretePorConta] ? entrada.fretePorConta : "A_COMBINAR",
      garantia: texto(entrada.garantia, 2000),
      observacoesCliente: texto(entrada.observacoesCliente, 4000),
      exigeMarcaModelo: entrada.exigeMarcaModelo === true || entrada.exigeMarcaModelo === "on" || entrada.exigeMarcaModelo === "true",
      exigencias: texto(entrada.exigencias, 6000),
    },
  };
}

const SELECAO = {
  id: true,
  nome: true,
  ativo: true,
  validadeDias: true,
  formaPagamento: true,
  pagamentoTexto: true,
  fretePorConta: true,
  garantia: true,
  observacoesCliente: true,
  exigeMarcaModelo: true,
  exigencias: true,
  atualizadoEm: true,
  _count: { select: { clientes: true, propostas: true } },
};

const paraTela = ({ _count, ...padrao }) => ({ ...padrao, clientes: _count.clientes, propostas: _count.propostas });

export async function listarPadroes({ soAtivos = false } = {}) {
  const padroes = await prisma.padraoDeProposta.findMany({
    where: soAtivos ? { ativo: true } : {},
    orderBy: { nome: "asc" },
    select: SELECAO,
  });
  return padroes.map(paraTela);
}

export async function lerPadrao(id) {
  const padrao = await prisma.padraoDeProposta.findUnique({ where: { id: String(id ?? "") }, select: SELECAO });
  return padrao ? paraTela(padrao) : null;
}

/** Cria (`id` nulo) ou atualiza. Nome repetido volta no campo. */
export async function salvarPadrao(id, entrada) {
  const { dados, erros } = conferirPadrao(entrada);
  if (erros) return { ok: false, erros };
  try {
    const salvo = id
      ? await prisma.padraoDeProposta.update({ where: { id }, data: dados, select: { id: true } })
      : await prisma.padraoDeProposta.create({ data: dados, select: { id: true } });
    return { ok: true, id: salvo.id };
  } catch (erro) {
    if (erro?.code === "P2002") return { ok: false, erros: { nome: "Já existe um padrão com este nome." } };
    if (erro?.code === "P2025") return { ok: false, erro: "Este padrão não existe mais." };
    throw erro;
  }
}

/** Padrao em uso por cliente nao sai (o cliente perderia o padrao sem ninguem ver): desative. */
export async function excluirPadrao(id) {
  const padrao = await prisma.padraoDeProposta.findUnique({ where: { id: String(id ?? "") }, select: { id: true, nome: true, _count: { select: { clientes: true } } } });
  if (!padrao) return { ok: true };
  if (padrao._count.clientes) {
    return { ok: false, erro: `${padrao.nome} é o padrão de ${padrao._count.clientes} cliente(s): desative em vez de excluir.` };
  }
  await prisma.padraoDeProposta.delete({ where: { id: padrao.id } });
  return { ok: true };
}

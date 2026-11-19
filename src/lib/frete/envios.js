import { lerDadosDaEmpresa } from "@/lib/compras/empresa";
import { prisma } from "@/lib/db";

/**
 * O envio do Rise (spec 5.1). Fase 1: so o RASCUNHO do pedido de venda, a cotacao escolhida guardada para a compra da
 * etiqueta (fase 2). Remetente e destinatario sao COPIA da hora: o cadastro e o pedido mudam, o envio nao.
 */

export { numeroDoEnvio } from "./regras";

const VIVOS = { notIn: ["CANCELADO", "EXPIRADO"] };
const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

function paraTela(envio) {
  if (!envio) return null;
  return {
    ...envio,
    comprimentoCm: numero(envio.comprimentoCm),
    larguraCm: numero(envio.larguraCm),
    alturaCm: numero(envio.alturaCm),
    pesoKg: numero(envio.pesoKg),
    valorDeclarado: numero(envio.valorDeclarado),
    precoCotado: numero(envio.precoCotado),
    custo: numero(envio.custo),
  };
}

/** O envio de ida vivo (nao cancelado nem expirado) do pedido: no maximo um. */
export async function lerEnvioDoPedido(pedidoDeVendaId, db = prisma) {
  const envio = await db.envio.findFirst({
    where: { pedidoDeVendaId, direcao: "IDA", status: VIVOS },
    orderBy: { criadoEm: "desc" },
    include: { caixaDeEnvio: { select: { nome: true } } },
  });
  return paraTela(envio);
}

const positivo = (valor) => Number.isFinite(Number(valor)) && Number(valor) > 0;

function remetenteDaEmpresa(empresa) {
  return {
    nome: empresa?.nomeFantasia || empresa?.razaoSocial || null,
    documento: empresa?.cnpj ?? null,
    email: empresa?.email ?? null,
    telefone: empresa?.telefone ?? null,
    endereco: {
      cep: String(empresa?.cep ?? "").replace(/\D/g, ""),
      logradouro: empresa?.endereco ?? null,
      numero: empresa?.numero ?? null,
      complemento: empresa?.complemento ?? null,
      bairro: empresa?.bairro ?? null,
      cidade: empresa?.cidade ?? null,
      uf: empresa?.uf ?? null,
    },
  };
}

function destinatarioDoPedido(pedido) {
  const entrega = pedido.enderecoDeEntrega ?? {};
  return {
    nome: entrega.nome || pedido.nomeDoComprador || null,
    documento: pedido.documentoDoComprador ?? null,
    email: pedido.emailDoComprador ?? null,
    telefone: pedido.telefoneDoComprador ?? null,
    endereco: {
      cep: String(entrega.cep ?? "").replace(/\D/g, ""),
      logradouro: entrega.endereco ?? null,
      numero: entrega.numero ?? null,
      complemento: entrega.complemento ?? null,
      bairro: entrega.bairro ?? null,
      cidade: entrega.cidade ?? null,
      uf: entrega.uf ?? null,
    },
  };
}

/**
 * Cria ou atualiza o rascunho do envio de ida do pedido com a cotacao escolhida. Sob a trava do pedido: dois cliques ao
 * mesmo tempo dao um envio so. Envio ja comprado (fora do rascunho) nao volta a ser rascunho.
 * @returns {Promise<{ ok: true, envio } | { ok: false, erro: string }>}
 */
export async function salvarRascunhoDoPedido(pedidoDeVendaId, { pacote, servico, cotadoEm }, login) {
  if (!pacote || !servico) return { ok: false, erro: "Cotação incompleta." };
  if (!["comprimentoCm", "larguraCm", "alturaCm", "pesoKg"].every((campo) => positivo(pacote[campo]))) return { ok: false, erro: "Caixa ou peso inválido." };
  if (!servico.servicoId || !Number.isFinite(Number(servico.preco))) return { ok: false, erro: "Serviço inválido." };
  const quando = new Date(cotadoEm);

  const pedido = await prisma.pedidoDeVenda.findUnique({ where: { id: String(pedidoDeVendaId ?? "") } });
  if (!pedido) return { ok: false, erro: "Pedido não encontrado." };
  const empresa = await lerDadosDaEmpresa();
  const caixa = pacote.caixaId ? await prisma.caixaDeEnvio.findUnique({ where: { id: String(pacote.caixaId) }, select: { id: true } }) : null;

  const dados = {
    caixaDeEnvioId: caixa?.id ?? null,
    comprimentoCm: Number(pacote.comprimentoCm),
    larguraCm: Number(pacote.larguraCm),
    alturaCm: Number(pacote.alturaCm),
    pesoKg: Number(pacote.pesoKg),
    valorDeclarado: Number(pacote.valorDeclarado ?? 0),
    medidaConferida: false,
    servicoId: String(servico.servicoId),
    servicoNome: String(servico.servicoNome ?? ""),
    transportadoraNome: servico.transportadora ? String(servico.transportadora) : null,
    prazoDias: Number.isFinite(Number(servico.prazoDias)) ? Math.round(Number(servico.prazoDias)) : null,
    precoCotado: Number(servico.preco),
    cotadoEm: Number.isNaN(quando.getTime()) ? new Date() : quando,
    remetente: remetenteDaEmpresa(empresa),
    destinatario: destinatarioDoPedido(pedido),
  };

  const resultado = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`envio.pedido.${pedido.id}`}))`;
    const atual = await tx.envio.findFirst({ where: { pedidoDeVendaId: pedido.id, direcao: "IDA", status: VIVOS }, orderBy: { criadoEm: "desc" } });
    if (atual && atual.status !== "RASCUNHO") return { ok: false, erro: "A etiqueta deste pedido já foi comprada: cancele antes de cotar de novo." };
    if (atual) return { ok: true, id: (await tx.envio.update({ where: { id: atual.id }, data: dados })).id };
    // O numero sai sob a trava do Postgres, como o do pedido de compra: dois envios ao mesmo tempo nao repetem numero.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('envio.numero'))`;
    const maior = await tx.envio.aggregate({ _max: { numero: true } });
    const criado = await tx.envio.create({
      data: { ...dados, numero: (maior._max.numero ?? 0) + 1, direcao: "IDA", status: "RASCUNHO", pedidoDeVendaId: pedido.id, compradoPor: null },
    });
    return { ok: true, id: criado.id };
  });
  if (!resultado.ok) return resultado;
  // login: quem cotou fica no log do servidor; quem COMPRA fica no envio (compradoPor, fase 2).
  console.info(`[frete] rascunho do envio do pedido ${pedido.numero} por ${login ?? "?"}`);
  return { ok: true, envio: await lerEnvioDoPedido(pedido.id) };
}

/** A cotacao gravada na proposta que gerou este pedido do Bling (para a janela abrir com a mesma caixa e peso). */
export async function cotacaoDaPropostaDoPedido(pedido) {
  if (!pedido?.blingPedidoId) return null;
  const proposta = await prisma.propostaParaCliente.findFirst({
    where: { pedidoDeVendaBlingId: String(pedido.blingPedidoId) },
    select: { cotacaoDoFrete: true },
    orderBy: { atualizadoEm: "desc" },
  });
  return proposta?.cotacaoDoFrete ?? null;
}

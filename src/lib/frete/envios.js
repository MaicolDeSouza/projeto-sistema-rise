import { lerDadosDaEmpresa } from "@/lib/compras/empresa";
import { prisma } from "@/lib/db";
import { config } from "@/lib/integracoes/config";

import { cotarFrete } from "./cotacao";
import { obterProvedor } from "./provedores/registro";
import { linkDoRastreio, motivosParaNaoComprar } from "./regras";

/**
 * O envio do Rise (spec 5.1). Fase 1: o RASCUNHO do pedido de venda, com a cotacao escolhida. Fase 2: conferir o pacote
 * medido e comprar a etiqueta. Remetente e destinatario sao COPIA da hora: o cadastro e o pedido mudam, o envio nao.
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
    // Com NF-e o carrinho do Melhor Envio exige a inscricao estadual do remetente (state_register).
    inscricaoEstadual: empresa?.inscricaoEstadual ?? null,
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

/** O pedido do Bling muitas vezes vem sem e-mail ou telefone do comprador: o cadastro do cliente completa (o aviso precisa). */
function destinatarioDoPedido(pedido) {
  const entrega = pedido.enderecoDeEntrega ?? {};
  return {
    nome: entrega.nome || pedido.nomeDoComprador || null,
    documento: pedido.documentoDoComprador ?? pedido.cliente?.documento ?? null,
    email: pedido.emailDoComprador || pedido.cliente?.email || null,
    telefone: pedido.telefoneDoComprador || pedido.cliente?.telefone || null,
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

/** Cada item do pedido como linha da declaracao: o valor unitario ja com o desconto do item (o total dividido). */
function itensDoPedido(itens) {
  return (itens ?? []).map((item) => {
    const quantidade = Math.max(1, Number(item.quantidade ?? 1));
    return { descricao: String(item.titulo ?? "").slice(0, 100), quantidade, valorUnitario: Math.round((Number(item.total ?? 0) / quantidade) * 100) / 100 };
  });
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

  const pedido = await prisma.pedidoDeVenda.findUnique({
    where: { id: String(pedidoDeVendaId ?? "") },
    include: { itens: { orderBy: { ordem: "asc" } }, cliente: { select: { documento: true, email: true, telefone: true } } },
  });
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
    // Os produtos vao no carrinho mesmo com NF-e (a DC-e da SEFAZ, desde 06/04/2026); com declaracao, sao ela.
    itensDaDeclaracao: itensDoPedido(pedido.itens),
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

/**
 * O envio como vai ao navegador: sem remetente e destinatario (CPF, endereco). A aba Envio nao os mostra, e a pagina do
 * pedido corta o dado pessoal no servidor para quem nao tem `dado.pessoalDoCliente` (revisao final, 18/11/2026).
 */
export function envioParaATela(envio) {
  if (!envio) return null;
  const { remetente: _remetente, destinatario: _destinatario, ...resto } = envio;
  return resto;
}

/** Da cotacao da proposta, a janela do pedido so usa a caixa e o peso. */
export function cotacaoParaATela(cotacao) {
  if (!cotacao) return null;
  return { caixaId: cotacao.caixaId ?? null, pesoKg: cotacao.pesoKg ?? null };
}

// ---------------------------------------------------------------------------
// Fase 2: conferir o pacote medido e comprar a etiqueta
// ---------------------------------------------------------------------------

/** Um envio pelo id, com o pedido vinculado (numero e nota) e a caixa. */
export async function lerEnvio(id, db = prisma) {
  const envio = await db.envio.findUnique({
    where: { id: String(id ?? "") },
    include: { caixaDeEnvio: { select: { nome: true } }, pedidoDeVenda: { select: { id: true, numero: true, nf: true } } },
  });
  return paraTela(envio);
}

/**
 * COMPRANDO parado ha mais que isto e uma compra que caiu no meio (o servidor reiniciou, a rede caiu): pode ser retomada
 * pelo `idNoProvedor`. Menos que isto e outra aba comprando agora.
 */
const COMPRA_PARADA_MS = 2 * 60 * 1000;
const compraParada = (envio, agora) => envio.status === "COMPRANDO" && agora - new Date(envio.atualizadoEm).getTime() > COMPRA_PARADA_MS;

const provedorDo = (envio) => obterProvedor(envio.provedor);
const travaLiberada = () => Boolean(config.travas.freteCompra);

/** O saldo da carteira, ou null quando nao se le (a compra entao e recusada: nunca comprar as cegas). */
async function lerSaldo(envio) {
  try {
    return (await provedorDo(envio).saldo()).saldo;
  } catch {
    return null;
  }
}

/**
 * O operador mediu e pesou: cota de novo o MESMO servico com o pacote real, grava o pacote, o documento e o preco novo,
 * e devolve o saldo e o que ainda impede a compra (a janela mostra antes do botao Comprar).
 * @returns {Promise<{ ok: true, envio, preco, saldo, motivos } | { ok: false, erro?, erros? }>}
 */
export async function conferirPacote(envioId, entrada, login) {
  const envio = await prisma.envio.findUnique({ where: { id: String(envioId ?? "") } });
  if (!envio) return { ok: false, erro: "Envio não encontrado." };
  if (envio.status !== "RASCUNHO") return { ok: false, erro: "Esta etiqueta já foi comprada." };

  const tipoDeDocumento = entrada?.tipoDeDocumento === "NFE" ? "NFE" : entrada?.tipoDeDocumento === "DECLARACAO" ? "DECLARACAO" : null;
  if (!tipoDeDocumento) return { ok: false, erros: { tipoDeDocumento: "Escolha NF-e ou declaração de conteúdo." } };
  const chaveNfe = tipoDeDocumento === "NFE" ? String(entrada?.chaveNfe ?? "").replace(/\D/g, "") : null;
  if (tipoDeDocumento === "NFE" && chaveNfe.length !== 44) return { ok: false, erros: { chaveNfe: "A chave da NF-e tem 44 dígitos." } };
  const itensDaDeclaracao = Array.isArray(entrada?.itensDaDeclaracao) ? entrada.itensDaDeclaracao : envio.itensDaDeclaracao;

  const cotacao = await cotarFrete({
    cepDestino: envio.destinatario?.endereco?.cep,
    caixaId: entrada?.caixaId || null,
    comprimentoCm: entrada?.comprimentoCm,
    larguraCm: entrada?.larguraCm,
    alturaCm: entrada?.alturaCm,
    pesoKg: entrada?.pesoKg,
    valorDeclarado: envio.valorDeclarado,
  });
  if (!cotacao.ok) return cotacao.erros ? { ok: false, erros: cotacao.erros } : { ok: false, erro: cotacao.erro };
  const servico = cotacao.atendem.find((item) => item.servicoId === envio.servicoId);
  if (!servico) return { ok: false, erro: "O serviço escolhido não atende o pacote medido: cote de novo." };

  const p = cotacao.pacote;
  await prisma.envio.update({
    where: { id: envio.id },
    data: {
      caixaDeEnvioId: p.caixaId,
      comprimentoCm: p.comprimentoCm,
      larguraCm: p.larguraCm,
      alturaCm: p.alturaCm,
      pesoKg: p.pesoKg,
      medidaConferida: true,
      tipoDeDocumento,
      chaveNfe,
      itensDaDeclaracao: itensDaDeclaracao ?? [],
      precoCotado: servico.preco,
      prazoDias: servico.prazoDias ?? envio.prazoDias,
      cotadoEm: new Date(cotacao.cotadoEm),
    },
  });
  const atualizado = await lerEnvio(envio.id);
  const saldo = await lerSaldo(envio);
  const motivos = saldo === null ? ["Não foi possível ler o saldo do Melhor Envio."] : motivosParaNaoComprar({ envio: atualizado, saldo, travaLiberada: travaLiberada() });
  console.info(`[frete] pacote do envio ${envio.numero} conferido por ${login ?? "?"}`);
  return { ok: true, envio: atualizado, preco: servico.preco, saldo, motivos };
}

const mensagemDe = (erro) => (erro?.name === "ErroDoProvedor" ? erro.message : "O Melhor Envio não respondeu. Tente de novo em instantes.");

/**
 * Compra a etiqueta: carrinho -> pagamento -> geracao. A passagem para COMPRANDO e uma escrita condicional: o segundo
 * clique (ou outra aba) nao acha a linha em RASCUNHO e nao compra. O id do carrinho e gravado ANTES do pagamento, entao a
 * falha no meio volta a RASCUNHO com ele, e a proxima tentativa continua de onde parou, sem outro carrinho.
 * @returns {Promise<{ ok: true, envio } | { ok: false, erro }>}
 */
export async function comprarEtiqueta(envioId, login, { aoComprar } = {}) {
  const agora = Date.now();
  const envio = await prisma.envio.findUnique({
    where: { id: String(envioId ?? "") },
    include: { pedidoDeVenda: { select: { numero: true } } },
  });
  if (!envio) return { ok: false, erro: "Envio não encontrado." };
  if (!["RASCUNHO", "COMPRANDO"].includes(envio.status)) return { ok: false, erro: "Esta etiqueta já foi comprada." };
  const retomando = compraParada(envio, agora);
  if (envio.status === "COMPRANDO" && !retomando) return { ok: false, erro: "Esta etiqueta já está sendo comprada." };

  // Com o carrinho ja criado (`idNoProvedor`), o pagamento pode ja ter saido da carteira: o saldo nao e conferido de novo.
  const saldo = envio.idNoProvedor ? Number.POSITIVE_INFINITY : await lerSaldo(envio);
  if (saldo === null) return { ok: false, erro: "Não foi possível ler o saldo do Melhor Envio." };
  const motivos = motivosParaNaoComprar({ envio: { ...envio, status: "RASCUNHO", precoCotado: Number(envio.precoCotado ?? 0) }, saldo, travaLiberada: travaLiberada() });
  if (motivos.length) return { ok: false, erro: motivos[0] };

  const tomada = await prisma.envio.updateMany({
    where: retomando ? { id: envio.id, status: "COMPRANDO", atualizadoEm: envio.atualizadoEm } : { id: envio.id, status: "RASCUNHO" },
    data: { status: "COMPRANDO", ultimoErro: null },
  });
  if (tomada.count === 0) return { ok: false, erro: "Esta etiqueta já está sendo comprada." };

  try {
    const compra = await provedorDo(envio).comprar(
      { ...envio, pedidoNumero: envio.pedidoDeVenda?.numero ?? null },
      {
        aoCriarNoCarrinho: (idNoProvedor, protocolo) => prisma.envio.update({ where: { id: envio.id }, data: { idNoProvedor, protocolo } }),
      },
    );
    await prisma.envio.update({
      where: { id: envio.id },
      data: {
        status: "A_POSTAR",
        idNoProvedor: compra.idNoProvedor,
        protocolo: compra.protocolo,
        custo: compra.custo,
        compradoEm: new Date(),
        compradoPor: login ?? null,
        rastreio: compra.rastreio,
        linkDoRastreio: linkDoRastreio(compra.rastreio),
        validoAte: compra.validoAte,
        eventos: compra.eventos,
        ultimoErro: null,
      },
    });
  } catch (erro) {
    const mensagem = mensagemDe(erro);
    await prisma.envio.update({ where: { id: envio.id }, data: { status: "RASCUNHO", ultimoErro: mensagem } });
    console.error(`[frete] compra do envio ${envio.numero} falhou:`, erro?.message ?? erro);
    return { ok: false, erro: mensagem };
  }
  console.info(`[frete] etiqueta do envio ${envio.numero} comprada por ${login ?? "?"}`);
  if (envio.pedidoDeVendaId && aoComprar) await aoComprar(envio.pedidoDeVendaId).catch((erro) => console.error("[frete] lucro do pedido:", erro?.message ?? erro));
  return { ok: true, envio: await lerEnvio(envio.id) };
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

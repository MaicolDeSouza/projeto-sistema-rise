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
const COMPRA_PELA_METADE = "Há uma compra pela metade neste envio: use Comprar etiqueta para continuar.";
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
    // Carrinho criado (talvez pago) no Melhor Envio: cotar de novo faria a retomada comprar o servico velho, ou perder o pago.
    if (atual?.idNoProvedor) return { ok: false, erro: COMPRA_PELA_METADE };
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
  if (envio.idNoProvedor) return { ok: false, erro: COMPRA_PELA_METADE };

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
    // O carrinho expirou (7 dias) ou foi cancelado: o id nao serve mais, e guarda-lo prenderia o envio para sempre.
    const soltar = erro?.codigo === "PEDIDO_ENCERRADO" ? { idNoProvedor: null, protocolo: null } : {};
    await prisma.envio.update({ where: { id: envio.id }, data: { status: "RASCUNHO", ultimoErro: mensagem, ...soltar } });
    console.error(`[frete] compra do envio ${envio.numero} falhou:`, erro?.message ?? erro);
    return { ok: false, erro: mensagem };
  }
  console.info(`[frete] etiqueta do envio ${envio.numero} comprada por ${login ?? "?"}`);
  if (envio.pedidoDeVendaId && aoComprar) await aoComprar(envio.pedidoDeVendaId).catch((erro) => console.error("[frete] lucro do pedido:", erro?.message ?? erro));
  return { ok: true, envio: await lerEnvio(envio.id) };
}

/** O link da pagina de impressao do provedor, pedido a cada clique (o Rise nao guarda a etiqueta). */
export async function linkDaEtiqueta(envioId) {
  const envio = await prisma.envio.findUnique({ where: { id: String(envioId ?? "") } });
  if (!envio) return { ok: false, erro: "Envio não encontrado." };
  if (!["A_POSTAR", "POSTADO"].includes(envio.status) || !envio.idNoProvedor) return { ok: false, erro: "A etiqueta ainda não foi comprada." };
  try {
    return { ok: true, url: (await provedorDo(envio).imprimir(envio)).url };
  } catch (erro) {
    return { ok: false, erro: mensagemDe(erro) };
  }
}

/**
 * Cancela a etiqueta ainda nao postada: o valor volta a carteira (em ate 12 h quando ja gerada) e o pedido volta a aceitar
 * cotacao. `aoMudarCusto(pedidoId)` refaz o lucro do pedido (a action passa `recalcularLucroDoPedido`).
 */
export async function cancelarEtiqueta(envioId, motivo, login, { aoMudarCusto } = {}) {
  const envio = await prisma.envio.findUnique({ where: { id: String(envioId ?? "") } });
  if (!envio) return { ok: false, erro: "Envio não encontrado." };
  if (envio.status !== "A_POSTAR" || !envio.idNoProvedor) return { ok: false, erro: "Só a etiqueta a postar pode ser cancelada." };
  try {
    await provedorDo(envio).cancelar(envio, motivo);
  } catch (erro) {
    return { ok: false, erro: mensagemDe(erro) };
  }
  await prisma.envio.update({ where: { id: envio.id }, data: { status: "CANCELADO", canceladoEm: new Date(), ultimoErro: null } });
  console.info(`[frete] etiqueta do envio ${envio.numero} cancelada por ${login ?? "?"}`);
  if (envio.pedidoDeVendaId && aoMudarCusto) await aoMudarCusto(envio.pedidoDeVendaId).catch((erro) => console.error("[frete] lucro do pedido:", erro?.message ?? erro));
  return { ok: true, envio: await lerEnvio(envio.id) };
}

// ---------------------------------------------------------------------------
// Envio avulso (sem pedido: garantia, troca, amostra, devolucao a fornecedor)
// ---------------------------------------------------------------------------

const enderecoDoCliente = (enderecos) => {
  // O de entrega vale mais que o geral: e para onde o pacote vai.
  const endereco = enderecos.find((item) => item.tipo === "ENTREGA") ?? enderecos.find((item) => item.tipo === "GERAL") ?? null;
  if (!endereco) return null;
  return {
    cep: String(endereco.cep ?? "").replace(/\D/g, ""),
    logradouro: endereco.logradouro ?? null,
    numero: endereco.numero ?? null,
    complemento: endereco.complemento ?? null,
    bairro: endereco.bairro ?? null,
    cidade: endereco.cidade ?? null,
    uf: endereco.uf ?? null,
  };
};

/**
 * Clientes e fornecedores do cadastro para o destinatario do envio avulso. O cliente traz o endereco (o de entrega, ou o
 * geral); o fornecedor nao tem endereco no cadastro, e o operador digita.
 */
export async function buscarDestinatarios(texto) {
  const termo = String(texto ?? "").trim();
  if (termo.length < 2) return [];
  const contem = { contains: termo, mode: "insensitive" };
  const [clientes, fornecedores] = await Promise.all([
    prisma.cliente.findMany({
      where: { OR: [{ nome: contem }, { nomeFantasia: contem }, { documento: { contains: termo } }] },
      select: { id: true, nome: true, documento: true, email: true, telefone: true, enderecos: true },
      orderBy: { nome: "asc" },
      take: 8,
    }),
    prisma.fornecedor.findMany({
      where: { OR: [{ nome: contem }, { cnpj: { contains: termo } }] },
      select: { id: true, nome: true, cnpj: true, email: true, telefone: true },
      orderBy: { nome: "asc" },
      take: 5,
    }),
  ]);
  return [
    ...clientes.map((c) => ({ tipo: "CLIENTE", id: c.id, nome: c.nome, documento: c.documento, email: c.email, telefone: c.telefone, endereco: enderecoDoCliente(c.enderecos) })),
    ...fornecedores.map((f) => ({ tipo: "FORNECEDOR", id: f.id, nome: f.nome, documento: f.cnpj, email: f.email, telefone: f.telefone, endereco: null })),
  ];
}

const CAMPOS_DO_ENDERECO = { cep: "CEP com 8 dígitos.", logradouro: "Informe a rua.", numero: "Informe o número.", bairro: "Informe o bairro.", cidade: "Informe a cidade.", uf: "UF com 2 letras." };

/**
 * Cria o envio avulso em RASCUNHO, com a cotacao escolhida e a declaracao de conteudo (sem pedido nao ha nota). Daqui em
 * diante e o mesmo caminho do envio do pedido: conferir o pacote, comprar, imprimir.
 * @returns {Promise<{ ok: true, envio } | { ok: false, erro?, erros? }>}
 */
export async function criarEnvioAvulso({ destinatario, pacote, servico, cotadoEm, itensDaDeclaracao }, login) {
  const erros = {};
  const endereco = destinatario?.endereco ?? {};
  if (!String(destinatario?.nome ?? "").trim()) erros.nome = "Informe o nome.";
  for (const [campo, mensagem] of Object.entries(CAMPOS_DO_ENDERECO)) {
    const valor = String(endereco[campo] ?? "").trim();
    const ok = campo === "cep" ? valor.replace(/\D/g, "").length === 8 : campo === "uf" ? /^[A-Za-z]{2}$/.test(valor) : valor.length > 0;
    if (!ok) erros[campo] = mensagem;
  }
  const itens = (Array.isArray(itensDaDeclaracao) ? itensDaDeclaracao : [])
    .map((item) => ({ descricao: String(item?.descricao ?? "").trim().slice(0, 100), quantidade: Math.round(Number(item?.quantidade)), valorUnitario: Number(item?.valorUnitario) }))
    .filter((item) => item.descricao);
  if (!itens.length || itens.some((item) => !(item.quantidade > 0) || !(item.valorUnitario >= 0))) erros.itensDaDeclaracao = "Informe ao menos um item com quantidade e valor.";
  if (!pacote || !["comprimentoCm", "larguraCm", "alturaCm", "pesoKg"].every((campo) => positivo(pacote[campo]))) erros.pacote = "Cote o frete antes.";
  if (!servico?.servicoId || !Number.isFinite(Number(servico.preco))) erros.servico = "Escolha um serviço.";
  if (Object.keys(erros).length) return { ok: false, erros };

  const empresa = await lerDadosDaEmpresa();
  const caixa = pacote.caixaId ? await prisma.caixaDeEnvio.findUnique({ where: { id: String(pacote.caixaId) }, select: { id: true } }) : null;
  const quando = new Date(cotadoEm ?? Date.now());
  const valorDeclarado = Math.round(itens.reduce((soma, item) => soma + item.quantidade * item.valorUnitario, 0) * 100) / 100;

  const criado = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('envio.numero'))`;
    const maior = await tx.envio.aggregate({ _max: { numero: true } });
    return tx.envio.create({
      data: {
        numero: (maior._max.numero ?? 0) + 1,
        direcao: "IDA",
        status: "RASCUNHO",
        remetente: remetenteDaEmpresa(empresa),
        destinatario: {
          nome: String(destinatario.nome).trim().slice(0, 100),
          documento: destinatario.documento ? String(destinatario.documento) : null,
          email: destinatario.email ? String(destinatario.email).trim() : null,
          telefone: destinatario.telefone ? String(destinatario.telefone).replace(/\D/g, "") : null,
          endereco: {
            cep: String(endereco.cep).replace(/\D/g, ""),
            logradouro: String(endereco.logradouro).trim(),
            numero: String(endereco.numero).trim(),
            complemento: endereco.complemento ? String(endereco.complemento).trim() : null,
            bairro: String(endereco.bairro).trim(),
            cidade: String(endereco.cidade).trim(),
            uf: String(endereco.uf).trim().toUpperCase(),
          },
        },
        caixaDeEnvioId: caixa?.id ?? null,
        comprimentoCm: Number(pacote.comprimentoCm),
        larguraCm: Number(pacote.larguraCm),
        alturaCm: Number(pacote.alturaCm),
        pesoKg: Number(pacote.pesoKg),
        valorDeclarado,
        medidaConferida: false,
        tipoDeDocumento: "DECLARACAO",
        itensDaDeclaracao: itens,
        servicoId: String(servico.servicoId),
        servicoNome: String(servico.servicoNome ?? ""),
        transportadoraNome: servico.transportadora ? String(servico.transportadora) : null,
        prazoDias: Number.isFinite(Number(servico.prazoDias)) ? Math.round(Number(servico.prazoDias)) : null,
        precoCotado: Number(servico.preco),
        cotadoEm: Number.isNaN(quando.getTime()) ? new Date() : quando,
      },
    });
  });
  console.info(`[frete] envio avulso ${criado.numero} criado por ${login ?? "?"}`);
  return { ok: true, envio: await lerEnvio(criado.id) };
}

// ---------------------------------------------------------------------------
// Lista de Envios
// ---------------------------------------------------------------------------

export const COLUNAS_DOS_ENVIOS = ["numero", "data", "status", "custo", "postado"];
const ORDEM_DA_COLUNA = { numero: "numero", data: "criadoEm", status: "status", custo: "custo", postado: "postadoEm" };
const COM_ACENTO = "áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ";
const SEM_ACENTO = "aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC";
const semAcento = (texto) => [...String(texto)].map((letra) => SEM_ACENTO[COM_ACENTO.indexOf(letra)] ?? letra).join("");
const POSTADOS = ["POSTADO", "ENTREGUE", "NAO_ENTREGUE", "COM_PROBLEMA"];

/**
 * Os ids que casam com a busca: o numero (ENV-0012 ou 12), o rastreio, o nome de quem recebe (sem acento nem caixa), o
 * servico e o numero do pedido vinculado. SQL cru porque o nome mora dentro do JSON do destinatario.
 */
async function idsDaBusca(busca) {
  const termo = semAcento(busca.trim()).toLowerCase();
  const padrao = `%${termo.replace(/[\\%_]/g, (letra) => `\\${letra}`)}%`;
  const numero = /^(?:env-?)?0*(\d{1,9})$/i.exec(busca.trim())?.[1];
  const linhas = await prisma.$queryRaw`
    SELECT e.id FROM "Envio" e LEFT JOIN "PedidoDeVenda" p ON p.id = e."pedidoDeVendaId"
    WHERE lower(coalesce(e.rastreio, '')) LIKE ${padrao}
       OR lower(translate(coalesce(e.destinatario->>'nome', ''), ${COM_ACENTO}, ${SEM_ACENTO})) LIKE ${padrao}
       OR lower(translate(coalesce(e."servicoNome", ''), ${COM_ACENTO}, ${SEM_ACENTO})) LIKE ${padrao}
       OR lower(coalesce(p.numero, '')) LIKE ${padrao}
       OR e.numero = ${numero ? Number(numero) : -1}`;
  return linhas.map((linha) => linha.id);
}

/**
 * A lista de Envios, com o filtro, a ordem e a pagina feitos no banco. `contagemPorStatus` conta com a busca e a direcao,
 * sem o filtro de situacao (os chips mostram quantos ha em cada uma).
 */
export async function listarEnvios({ status = [], direcao = null, busca = "", ordenar = null, sentido = "desc", pagina = 1, por = 25 } = {}) {
  const base = {};
  if (direcao === "IDA" || direcao === "REVERSO") base.direcao = direcao;
  if (String(busca ?? "").trim()) base.id = { in: await idsDaBusca(String(busca)) };
  const onde = { ...base, ...(status.length ? { status: { in: status } } : {}) };

  const campo = ORDEM_DA_COLUNA[ordenar] ?? "numero";
  const lado = ordenar ? (sentido === "asc" ? "asc" : "desc") : "desc";
  const orderBy = campo === "custo" || campo === "postadoEm" ? [{ [campo]: { sort: lado, nulls: "last" } }, { numero: "desc" }] : [{ [campo]: lado }, { numero: "desc" }];

  const [total, envios, porStatus] = await Promise.all([
    prisma.envio.count({ where: onde }),
    prisma.envio.findMany({
      where: onde,
      orderBy,
      skip: (Math.max(1, pagina) - 1) * por,
      take: por,
      include: { pedidoDeVenda: { select: { id: true, numero: true } } },
    }),
    prisma.envio.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
  ]);

  const linhas = envios.map((envio) => {
    // No reverso quem importa e quem manda (o fornecedor ou o cliente); na ida, quem recebe.
    const parte = envio.direcao === "REVERSO" ? envio.remetente : envio.destinatario;
    return {
      id: envio.id,
      numero: envio.numero,
      criadoEm: envio.criadoEm,
      direcao: envio.direcao,
      status: envio.status,
      nome: parte?.nome ?? null,
      cidade: parte?.endereco?.cidade ? `${parte.endereco.cidade}${parte.endereco.uf ? ` (${parte.endereco.uf})` : ""}` : null,
      pedido: envio.pedidoDeVenda ? { id: envio.pedidoDeVenda.id, numero: envio.pedidoDeVenda.numero } : null,
      transportadoraNome: envio.transportadoraNome,
      servicoNome: envio.servicoNome,
      rastreio: envio.rastreio,
      linkDoRastreio: envio.linkDoRastreio,
      custo: envio.custo === null ? null : Number(envio.custo),
      postadoEm: envio.postadoEm,
      avisoEmailEm: envio.avisoEmailEm,
      avisoEmailErro: envio.avisoEmailErro,
      avisoWhatsappEm: envio.avisoWhatsappEm,
      pendenteDeAviso: POSTADOS.includes(envio.status) && !envio.avisoEmailEm && !envio.avisoWhatsappEm,
    };
  });
  return { linhas, total, contagemPorStatus: Object.fromEntries(porStatus.map((linha) => [linha.status, linha._count._all])) };
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

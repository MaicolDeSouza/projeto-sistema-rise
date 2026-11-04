import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { urlDe } from "@/lib/arquivos";
import { config } from "@/lib/integracoes/config";
import { clienteML } from "@/lib/canaisDeVenda/ml/cliente";
import { clienteDoPedido } from "@/lib/pedidos/cliente";
import { casarItens } from "@/lib/pedidos/itens";
import { statusDoEnvio, statusDoPedido } from "@/lib/pedidos/status";
import { devolvido, lucroDivergente, lucroFechado, parcelasDaEstimativa, parcelasDoReal } from "@/lib/pedidos/lucro";
import { estimativaDoAnuncioML } from "@/lib/pedidos/estimativaML";
import { calcularPecas } from "@/lib/pedidos/pecas";

/**
 * O pedido de venda no banco (spec 5.8): aplicar uma leitura (ML, LI ou Bling) sem duplicar, a lista, a leitura de um
 * pedido e as acoes do operador. Tudo o que vem da origem e recalculado a cada leitura; o que o Rise decidiu uma vez
 * (estimativa, custo congelado, frete manual, cliente vinculado) nunca e apagado por uma releitura.
 */

const STATUS_QUE_SEPARAM = new Set(["PAGO", "AGUARDANDO_PECAS", "EM_SEPARACAO"]);
const STATUS_COM_PECAS = new Set(["PAGO", "EM_SEPARACAO"]);

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));
const jsonOuNulo = (valor) => (valor === null || valor === undefined ? Prisma.DbNull : valor);
const dataOuNula = (valor) => (valor ? new Date(valor) : null);

/** Uma transacao serializavel; o conflito de serializacao (P2034) e repetido uma vez. */
async function transacao(corpo) {
  for (let tentativa = 0; ; tentativa += 1) {
    try {
      // Folga de tempo: o padrao do Prisma (5 s) fecha a transacao de um pedido com muitos itens no meio da gravacao. A
      // leitura do ML (a estimativa) fica FORA daqui, em `custosMLDaEstimativa`, para a rede nunca segurar a transacao.
      return await prisma.$transaction(corpo, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 });
    } catch (erro) {
      if (erro?.code === "P2034" && tentativa === 0) continue;
      throw erro;
    }
  }
}

function cabecalhoDe(n) {
  const comprador = n.comprador ?? {};
  return {
    canal: n.canal ?? n.origem,
    numero: n.numero ?? n.idExterno,
    packId: n.packId ?? null,
    dataDaVenda: new Date(n.dataDaVenda),
    atualizadoNaOrigemEm: dataOuNula(n.atualizadoNaOrigemEm),
    nomeDoComprador: comprador.nome ?? null,
    documentoDoComprador: comprador.documento ?? null,
    emailDoComprador: comprador.email ?? null,
    telefoneDoComprador: comprador.telefone ?? null,
    enderecoDeEntrega: jsonOuNulo(n.enderecoDeEntrega),
    statusDaOrigem: n.statusDaOrigem ?? null,
    statusDaOrigemDetalhe: n.statusDaOrigemDetalhe ?? null,
    pagamento: n.pagamento ?? [],
    envio: n.envio ?? {},
    totalProdutos: n.totais?.totalProdutos ?? 0,
    desconto: n.totais?.desconto ?? 0,
    freteCobrado: n.totais?.freteCobrado ?? 0,
    total: n.totais?.total ?? 0,
    nf: jsonOuNulo(n.nf),
  };
}

/** O historico gravado e o lido, unidos pelo instante (uma origem que esqueceu um passo nao o apaga). */
function unirHistorico(gravado, lido) {
  const porInstante = new Map();
  for (const passo of [...(Array.isArray(gravado) ? gravado : []), ...(Array.isArray(lido) ? lido : [])]) {
    const em = passo?.em ? new Date(passo.em) : null;
    if (!em || Number.isNaN(em.getTime())) continue;
    porInstante.set(em.toISOString(), { em: em.toISOString(), statusDaOrigem: passo.statusDaOrigem ?? null });
  }
  return [...porInstante.values()].sort((a, b) => a.em.localeCompare(b.em));
}

async function taxasDoCanal(tx, origem) {
  const linha = await tx.configCanal.findUnique({ where: { canal: origem }, select: { taxas: true } }).catch(() => null);
  return linha?.taxas ?? null;
}

/**
 * Recalcula o real, a estimativa (so quando ainda nao existe), o status, as pecas, o envio e os avisos de um pedido ja
 * gravado com itens. E o miolo de `aplicarPedidoLido` e das acoes que mudam uma entrada do calculo (frete manual).
 */
async function recalcular(tx, pedido, { normalizado, custosMLLidos = null, taxas, agora, avisosDosItens = [], criado = false }) {
  const n = normalizado;
  const origem = pedido.origem;
  const itens = pedido.itens;
  const avisos = new Set(avisosDosItens);

  // Estimativa: congelada na primeira leitura, nunca refeita. As taxas do ML vem lidas de antes da transacao.
  let estimativa = pedido.estimativa ?? null;
  if (!estimativa) {
    let custosML = null;
    if (origem === "MERCADO_LIVRE") {
      custosML = custosMLLidos ?? null;
      if (!custosML) avisos.add("semEstimativa");
    }
    estimativa = parcelasDaEstimativa({ origem, itens, totais: n.totais, custosML, taxas, calculadoEm: agora });
    estimativa = { ...estimativa, calculadoEm: new Date(estimativa.calculadoEm).toISOString() };
  }

  // Real: refeito ate o lucro fechar; a devolucao do ML reabre e zera (so o frete de retorno fica, como prejuizo).
  let real = pedido.real ?? null;
  let fechado = Boolean(pedido.lucroFechado);
  const devolucao = origem === "MERCADO_LIVRE" ? (n.devolucao ?? null) : null;
  if (devolucao) {
    real = devolvido(devolucao.custoDoRetorno);
    fechado = false;
  } else if (!fechado) {
    real = parcelasDoReal({
      origem,
      itens,
      totais: n.totais,
      envio: n.envio,
      pagamento: n.pagamento,
      custoDoFreteManual: numero(pedido.custoDoFreteManual),
      taxas,
      estimativa,
    });
  }

  // Status do pedido, depois as pecas (so sobre PAGO e EM_SEPARACAO), depois o envio.
  const decisao = statusDoPedido({
    origem,
    statusDaOrigem: n.statusDaOrigem,
    tags: n.tags ?? [],
    envio: n.envio ?? {},
    devolucao,
    anterior: criado ? null : pedido.status,
    emSeparacao: pedido.emSeparacao,
    entregueEm: n.envio?.historico?.entregueEm ?? null,
    agora,
  });
  let status = decisao.status;
  if (decisao.desconhecido) avisos.add("statusDesconhecido");
  let pecas = null;
  if (STATUS_COM_PECAS.has(status)) {
    pecas = await calcularPecas(tx, { ...pedido, itens, status });
    if (pecas.falta) status = "AGUARDANDO_PECAS";
  }
  const envio = statusDoEnvio({ origem, envio: n.envio ?? {}, devolucao });

  if (!devolucao && !fechado) fechado = lucroFechado({ status, real });

  if ((n.tags ?? []).includes("fraud_risk_detected")) avisos.add("fraude");
  if (!devolucao && lucroDivergente(estimativa?.lucro, real?.lucro)) avisos.add("lucroDivergente");
  if (status === "DEVOLVIDO" && n.nf?.status === "authorized") avisos.add("nfACancelar");
  if (!pedido.clienteId) avisos.add("clienteSemDocumento");

  const dados = {
    status,
    statusDoEnvio: envio,
    estimativa,
    real: jsonOuNulo(real),
    lucroEstimado: estimativa?.lucro ?? null,
    lucroReal: real?.lucro ?? null,
    lucroFechado: fechado,
    pecas: jsonOuNulo(pecas),
    avisos: [...avisos],
    historico: unirHistorico(pedido.historico, n.historico),
  };
  await tx.pedidoDeVenda.update({ where: { id: pedido.id }, data: dados });
  return { status, avisos: dados.avisos };
}

/**
 * As taxas do anuncio do ML para a estimativa (`{ percentual, tarifaFixa, frete }`), lidas FORA da transacao: so para
 * pedido do ML que ainda nao tem estimativa gravada; null quando nao ha anuncio casado ou o ML nao respondeu (aviso
 * `semEstimativa`). O casamento aqui e so leitura; quem grava os itens e a transacao.
 */
async function custosMLDaEstimativa(n, cliente) {
  if (n.origem !== "MERCADO_LIVRE" || !cliente) return null;
  const gravado = await prisma.pedidoDeVenda.findUnique({
    where: { origem_idExterno: { origem: n.origem, idExterno: String(n.idExterno) } },
    select: { estimativa: true },
  });
  if (gravado?.estimativa) return null;
  const { itens } = await casarItens(prisma, n);
  const casado = itens.find((item) => item.anuncioId);
  if (!casado) return null;
  const lida = await estimativaDoAnuncioML(cliente, { id: casado.anuncioId }, numero(casado.custoUnitarioCongelado)).catch(() => null);
  return lida ? { percentual: lida.percentual, tarifaFixa: lida.tarifaFixa, frete: lida.frete } : null;
}

/**
 * Grava (ou atualiza) um pedido normalizado. Devolve `{ id, criado, status, avisos }`, ou `{ ignorado: true }` para
 * pedido vendido antes do corte (`config.pedidos.desde`). `cliente` e o cliente do ML (a estimativa le as taxas do
 * anuncio); `taxas` sao as Taxas do canal (lidas de ConfigCanal quando nao vierem).
 */
export async function aplicarPedidoLido(normalizado, { cliente = null, taxas = null, agora = new Date() } = {}) {
  const n = normalizado;
  if (!n?.origem || !n?.idExterno) throw new Error("Pedido sem origem ou sem idExterno.");
  const dataDaVenda = new Date(n.dataDaVenda);
  if (Number.isNaN(dataDaVenda.getTime())) throw new Error(`Pedido ${n.idExterno} sem data da venda.`);
  if (dataDaVenda < config.pedidos.desde) return { ignorado: true };

  // A estimativa do ML le o anuncio no ML (rede): so na primeira leitura do pedido, e antes de abrir a transacao.
  const custosMLLidos = await custosMLDaEstimativa(n, cliente ?? (n.origem === "MERCADO_LIVRE" ? clienteML() : null));

  return transacao(async (tx) => {
    const chave = { origem_idExterno: { origem: n.origem, idExterno: String(n.idExterno) } };
    const existente = await tx.pedidoDeVenda.findUnique({ where: chave, select: { id: true, clienteId: true } });
    const cabecalho = cabecalhoDe(n);
    const gravado = existente
      ? await tx.pedidoDeVenda.update({ where: { id: existente.id }, data: cabecalho })
      : await tx.pedidoDeVenda.create({ data: { ...cabecalho, origem: n.origem, idExterno: String(n.idExterno), status: "AGUARDANDO_PAGAMENTO", historico: [] } });

    // Cliente: so quando o pedido ainda nao tem um (a vinculacao manual do operador vence a leitura).
    const avisos = [];
    let clienteId = gravado.clienteId;
    if (!clienteId) {
      const resultado = await clienteDoPedido(tx, n);
      clienteId = resultado.clienteId;
      avisos.push(...resultado.avisos.filter((aviso) => aviso !== "clienteSemDocumento"));
      if (clienteId) await tx.pedidoDeVenda.update({ where: { id: gravado.id }, data: { clienteId } });
    }

    // Itens: regravados a cada leitura (a origem pode mudar quantidade e preco), com o custo congelado preservado.
    const anteriores = await tx.itemDoPedidoDeVenda.findMany({ where: { pedidoId: gravado.id }, select: { idNaOrigem: true, codigoNaOrigem: true, custoUnitarioCongelado: true, custoOrigem: true } });
    const custoAnterior = new Map(anteriores.map((item) => [`${item.idNaOrigem ?? ""}|${item.codigoNaOrigem ?? ""}`, item]));
    const casados = await casarItens(tx, n);
    avisos.push(...casados.avisos);
    await tx.itemDoPedidoDeVenda.deleteMany({ where: { pedidoId: gravado.id } });
    const itens = casados.itens.map((item, indice) => {
      const antes = custoAnterior.get(`${item.idNaOrigem ?? ""}|${item.codigoNaOrigem ?? ""}`);
      const custo = antes?.custoUnitarioCongelado !== null && antes?.custoUnitarioCongelado !== undefined ? numero(antes.custoUnitarioCongelado) : item.custoUnitarioCongelado;
      return {
        pedidoId: gravado.id,
        ordem: indice,
        produtoId: item.produtoId ?? null,
        anuncioId: item.anuncioId ?? null,
        codigoNaOrigem: item.codigoNaOrigem ?? null,
        idNaOrigem: item.idNaOrigem === null || item.idNaOrigem === undefined ? null : String(item.idNaOrigem),
        titulo: item.titulo ?? "",
        quantidade: Math.max(0, Math.round(Number(item.quantidade ?? 0))),
        precoUnitario: item.precoUnitario ?? 0,
        desconto: item.desconto ?? 0,
        total: item.total ?? 0,
        comissao: item.comissao ?? null,
        custoUnitarioCongelado: custo,
        custoOrigem: antes?.custoOrigem ?? item.custoOrigem ?? null,
        conferido: Boolean(item.conferido),
      };
    });
    if (itens.length > 0) await tx.itemDoPedidoDeVenda.createMany({ data: itens });

    const pedido = await tx.pedidoDeVenda.findUnique({ where: { id: gravado.id }, include: { itens: { orderBy: { ordem: "asc" } } } });
    const resultado = await recalcular(tx, pedido, {
      normalizado: n,
      custosMLLidos,
      taxas: taxas ?? (await taxasDoCanal(tx, n.origem)),
      agora,
      avisosDosItens: avisos,
      criado: !existente,
    });
    return { id: gravado.id, criado: !existente, ...resultado };
  });
}

// ---- Leitura ----

const FOTO_PRINCIPAL = { where: { tipo: "IMAGEM", papel: "FOTO" }, orderBy: { ordem: "asc" }, take: 1, select: { arquivo: true } };
const PRODUTO_DA_LINHA = { select: { id: true, sku: true, tituloBase: true, localizacao: true, arquivos: FOTO_PRINCIPAL } };

function fotoDe(produto) {
  const arquivo = produto?.arquivos?.[0]?.arquivo;
  return arquivo ? urlDe(produto.sku, "IMAGEM", arquivo) : null;
}

const ORDENACOES = {
  canal: (d) => ({ canal: d }),
  numero: (d) => ({ numero: d }),
  data: (d) => ({ dataDaVenda: d }),
  cliente: (d) => ({ nomeDoComprador: d }),
  total: (d) => ({ total: d }),
  status: (d) => ({ status: d }),
  lucro: (d) => ({ lucroReal: d }),
};

function filtroDaLista({ busca, desde, ate, canais, status, envio, soComAviso, clienteId }) {
  const where = {};
  // A aba Pedidos do cadastro do cliente lista so os dele.
  if (clienteId) where.clienteId = clienteId;
  const e = [];
  if (desde || ate) where.dataDaVenda = { ...(desde ? { gte: new Date(desde) } : {}), ...(ate ? { lte: new Date(ate) } : {}) };
  if (Array.isArray(canais) && canais.length > 0) where.canal = { in: canais };
  if (Array.isArray(status) && status.length > 0) where.status = { in: status };
  else if (typeof status === "string" && status) where.status = status;
  if (Array.isArray(envio) && envio.length > 0) where.statusDoEnvio = { in: envio };
  if (soComAviso) where.avisos = { isEmpty: false };
  const texto = String(busca ?? "").trim();
  if (texto) {
    const contem = { contains: texto, mode: "insensitive" };
    const ou = [
      { numero: contem },
      { nomeDoComprador: contem },
      { itens: { some: { OR: [{ codigoNaOrigem: contem }, { titulo: contem }, { produto: { sku: contem } }] } } },
    ];
    const digitos = texto.replace(/\D/g, "");
    if (digitos.length >= 3) ou.push({ documentoDoComprador: { contains: digitos.replace(/(\d{3})(?=\d)/g, "$1") } }, { documentoDoComprador: { contains: digitos } });
    e.push({ OR: ou });
  }
  if (e.length > 0) where.AND = e;
  return where;
}

/** A lista de pedidos: `{ linhas, total }`, com o cliente, o primeiro item (com foto) e quantos itens ha. */
export async function listarPedidosDeVenda({ busca, desde, ate, canais, status, envio, soComAviso = false, clienteId, ordenar, direcao, pagina = 1, porPagina = 25 } = {}) {
  const where = filtroDaLista({ busca, desde, ate, canais, status, envio, soComAviso, clienteId });
  const sentido = direcao === "asc" ? "asc" : "desc";
  const orderBy = ORDENACOES[ordenar] ? [ORDENACOES[ordenar](sentido), { dataDaVenda: "desc" }] : [{ dataDaVenda: "desc" }];
  const take = Math.max(1, Number(porPagina) || 25);
  const skip = Math.max(0, (Math.max(1, Number(pagina) || 1) - 1) * take);
  const [total, pedidos] = await Promise.all([
    prisma.pedidoDeVenda.count({ where }),
    prisma.pedidoDeVenda.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        cliente: { select: { id: true, nome: true, nivel: true } },
        itens: { orderBy: { ordem: "asc" }, take: 1, include: { produto: PRODUTO_DA_LINHA } },
        _count: { select: { itens: true } },
      },
    }),
  ]);
  const linhas = pedidos.map((p) => {
    const primeiro = p.itens[0] ?? null;
    return {
      id: p.id,
      origem: p.origem,
      canal: p.canal,
      numero: p.numero,
      idExterno: p.idExterno,
      blingNumero: p.blingNumero,
      blingPedidoId: p.blingPedidoId,
      dataDaVenda: p.dataDaVenda,
      cliente: p.cliente ? { id: p.cliente.id, nome: p.cliente.nome, nivel: p.cliente.nivel } : null,
      nomeDoComprador: p.nomeDoComprador,
      status: p.status,
      statusDaOrigem: p.statusDaOrigem,
      statusDoEnvio: p.statusDoEnvio,
      emSeparacao: p.emSeparacao,
      // So o que a linha mostra: a forma e as parcelas do 1o pagamento, o tipo e o rastreio do envio, as pecas em falta.
      pagamento: (Array.isArray(p.pagamento) ? p.pagamento : []).slice(0, 1).map((pg) => ({ forma: pg?.forma ?? null, tipo: pg?.tipo ?? null, parcelas: pg?.parcelas ?? 1 })),
      envio: { tipo: p.envio?.tipo ?? null, servico: p.envio?.servico ?? null, transportadora: p.envio?.transportadora ?? null, rastreio: p.envio?.rastreio ?? null },
      faltas: (p.pecas?.pecas ?? []).filter((peca) => peca.falta > 0).map((peca) => ({ sku: peca.sku, falta: peca.falta, previsao: peca.previsao ?? null })),
      total: numero(p.total),
      lucroEstimado: numero(p.lucroEstimado),
      lucroReal: numero(p.lucroReal),
      lucroFechado: p.lucroFechado,
      avisos: p.avisos,
      quantidadeDeItens: p._count.itens,
      item: primeiro
        ? { titulo: primeiro.titulo, quantidade: primeiro.quantidade, sku: primeiro.produto?.sku ?? primeiro.codigoNaOrigem ?? null, localizacao: primeiro.produto?.localizacao ?? null, produtoId: primeiro.produtoId, foto: fotoDe(primeiro.produto) }
        : null,
    };
  });
  return { linhas, total };
}

const ORDEM_DO_STATUS = ["AGUARDANDO_PAGAMENTO", "PAGO", "AGUARDANDO_PECAS", "EM_SEPARACAO", "ENVIADO", "ENTREGUE", "FINALIZADO", "CANCELADO", "DEVOLVIDO"];
const ORDEM_DO_ENVIO = ["SEM_ENVIO", "A_POSTAR", "POSTADO", "EM_TRANSITO", "ENTREGUE", "NAO_ENTREGUE", "DEVOLVIDO", "CANCELADO"];

/**
 * As opcoes do filtro das colunas Status e Envio (pedido do dono em 04/11/2026: cada clique no cabecalho passa para a
 * proxima): os valores que EXISTEM na lista com os outros filtros, sem o da propria coluna, na ordem da tabela.
 */
export async function opcoesDasColunas(filtro = {}) {
  const [porStatus, porEnvio] = await Promise.all([
    prisma.pedidoDeVenda.groupBy({ by: ["status"], where: filtroDaLista({ ...filtro, status: undefined }) }),
    prisma.pedidoDeVenda.groupBy({ by: ["statusDoEnvio"], where: filtroDaLista({ ...filtro, envio: undefined }) }),
  ]);
  const status = new Set(porStatus.map((g) => g.status));
  const envio = new Set(porEnvio.map((g) => g.statusDoEnvio));
  return { status: ORDEM_DO_STATUS.filter((v) => status.has(v)), envio: ORDEM_DO_ENVIO.filter((v) => envio.has(v)) };
}

/**
 * O lucro do periodo (pedido do dono em 04/11/2026), sobre a lista filtrada inteira (nao so a pagina), pela regra da
 * coluna Lucro: cancelado nao entra; devolvido e fechado entram com o real; os outros com o estimado (ou o real).
 * `semLucro` conta os pedidos sem lucro calculado (item sem custo).
 */
export async function resumoDaLista(filtro = {}) {
  const pedidos = await prisma.pedidoDeVenda.findMany({
    where: filtroDaLista(filtro),
    select: { status: true, lucroFechado: true, lucroEstimado: true, lucroReal: true },
  });
  let lucro = 0;
  let semLucro = 0;
  for (const p of pedidos) {
    if (p.status === "CANCELADO") continue;
    const valor = p.lucroFechado || p.status === "DEVOLVIDO" ? numero(p.lucroReal) : (numero(p.lucroEstimado) ?? numero(p.lucroReal));
    if (valor === null) semLucro += 1;
    else lucro += valor;
  }
  return { lucro: Math.round(lucro * 100) / 100, pedidos: pedidos.length, semLucro };
}

function itemParaTela(item) {
  return {
    ...item,
    precoUnitario: numero(item.precoUnitario),
    desconto: numero(item.desconto),
    total: numero(item.total),
    comissao: numero(item.comissao),
    custoUnitarioCongelado: numero(item.custoUnitarioCongelado),
    produto: item.produto ? { id: item.produto.id, sku: item.produto.sku, tituloBase: item.produto.tituloBase, localizacao: item.produto.localizacao ?? null, foto: fotoDe(item.produto) } : null,
  };
}

/** Um pedido inteiro para a tela (Decimal vira numero); null quando nao existe. */
export async function lerPedidoDeVenda(id) {
  const p = await prisma.pedidoDeVenda.findUnique({
    where: { id },
    include: {
      // Os enderecos do cadastro (a aba Dados do cliente mostra o GERAL e, quando a entrega e outra, as duas).
      cliente: {
        select: {
          id: true,
          nome: true,
          nivel: true,
          documento: true,
          telefone: true,
          email: true,
          enderecos: { select: { tipo: true, cep: true, uf: true, cidade: true, bairro: true, logradouro: true, numero: true, complemento: true } },
        },
      },
      itens: { orderBy: { ordem: "asc" }, include: { produto: PRODUTO_DA_LINHA } },
    },
  });
  if (!p) return null;
  return {
    ...p,
    totalProdutos: numero(p.totalProdutos),
    desconto: numero(p.desconto),
    freteCobrado: numero(p.freteCobrado),
    total: numero(p.total),
    lucroEstimado: numero(p.lucroEstimado),
    lucroReal: numero(p.lucroReal),
    custoDoFreteManual: numero(p.custoDoFreteManual),
    itens: p.itens.map(itemParaTela),
  };
}

// ---- Acoes do operador ----

/** Liga ou desliga "em separacao" (so em PAGO, AGUARDANDO_PECAS e EM_SEPARACAO). */
export async function marcarEmSeparacao(id, ligado) {
  const pedido = await prisma.pedidoDeVenda.findUnique({ where: { id }, select: { status: true, pecas: true } });
  if (!pedido) return { ok: false, erro: "Pedido não encontrado." };
  if (!STATUS_QUE_SEPARAM.has(pedido.status)) return { ok: false, erro: "Só um pedido pago pode entrar em separação." };
  let status = pedido.status;
  if (ligado) status = "EM_SEPARACAO";
  else if (status === "EM_SEPARACAO") status = pedido.pecas?.falta ? "AGUARDANDO_PECAS" : "PAGO";
  await prisma.pedidoDeVenda.update({ where: { id }, data: { emSeparacao: Boolean(ligado), status } });
  return { ok: true, status };
}

/** So no Bling: grava o frete que o operador pagou e refaz o lucro real. */
export async function salvarCustoDoFreteManual(id, valor) {
  const custo = valor === null || valor === undefined || valor === "" ? null : Number(valor);
  if (custo !== null && !(Number.isFinite(custo) && custo >= 0)) return { ok: false, erro: "Informe um valor em reais." };
  return transacao(async (tx) => {
    const pedido = await tx.pedidoDeVenda.findUnique({ where: { id }, include: { itens: { orderBy: { ordem: "asc" } } } });
    if (!pedido) return { ok: false, erro: "Pedido não encontrado." };
    if (pedido.origem !== "BLING") return { ok: false, erro: "O frete manual só vale para pedido do Bling." };
    const real = parcelasDoReal({
      origem: pedido.origem,
      itens: pedido.itens,
      totais: { totalProdutos: numero(pedido.totalProdutos), total: numero(pedido.total) },
      envio: pedido.envio,
      pagamento: pedido.pagamento,
      custoDoFreteManual: custo,
      taxas: await taxasDoCanal(tx, pedido.origem),
      estimativa: pedido.estimativa ?? {},
    });
    const avisos = new Set(pedido.avisos.filter((aviso) => aviso !== "lucroDivergente"));
    if (lucroDivergente(pedido.estimativa?.lucro, real.lucro)) avisos.add("lucroDivergente");
    await tx.pedidoDeVenda.update({
      where: { id },
      data: { custoDoFreteManual: custo, real, lucroReal: real.lucro, lucroFechado: lucroFechado({ status: pedido.status, real }), avisos: [...avisos] },
    });
    return { ok: true, real };
  });
}

/** Liga o pedido a um cliente do cadastro (tira o aviso de cliente sem documento). */
export async function vincularCliente(id, clienteId) {
  const [pedido, cliente] = await Promise.all([
    prisma.pedidoDeVenda.findUnique({ where: { id }, select: { avisos: true } }),
    clienteId ? prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true } }) : null,
  ]);
  if (!pedido) return { ok: false, erro: "Pedido não encontrado." };
  if (!cliente) return { ok: false, erro: "Cliente não encontrado." };
  await prisma.pedidoDeVenda.update({
    where: { id },
    data: { clienteId: cliente.id, avisos: pedido.avisos.filter((aviso) => aviso !== "clienteSemDocumento") },
  });
  return { ok: true };
}

/**
 * Os clientes que a janela Vincular cliente oferece: pelo nome (sem caixa) ou pelo CPF/CNPJ (com ou sem pontos; o
 * documento e gravado formatado, entao os digitos digitados sao procurados nas duas formas). Ate 10, por nome.
 */
export async function buscarClientesParaVincular(texto) {
  const termo = String(texto ?? "").trim();
  if (!termo) return [];
  const digitos = termo.replace(/\D/g, "");
  const ou = [{ nome: { contains: termo, mode: "insensitive" } }, { documento: { contains: termo } }];
  if (digitos.length >= 3) {
    const formatado = digitos.length === 11 ? `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}` : null;
    const cnpj = digitos.length === 14 ? `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}` : null;
    for (const forma of [formatado, cnpj].filter(Boolean)) ou.push({ documento: forma });
  }
  return prisma.cliente.findMany({ where: { OR: ou }, orderBy: { nome: "asc" }, take: 10, select: { id: true, nome: true, documento: true, nivel: true } });
}

/**
 * "Criar com este nome" (janela Vincular cliente): cria o cliente com o nome, o contato e o endereco de entrega do
 * pedido, mesmo sem CPF/CNPJ, e o liga ao pedido. Recusa quando o pedido ja tem cliente.
 */
export async function criarClienteDoPedido(id) {
  return transacao(async (tx) => {
    const pedido = await tx.pedidoDeVenda.findUnique({ where: { id } });
    if (!pedido) return { ok: false, erro: "Pedido não encontrado." };
    if (pedido.clienteId) return { ok: false, erro: "Este pedido já tem cliente." };
    const normalizado = {
      origem: pedido.origem,
      canal: pedido.canal,
      numero: pedido.numero,
      comprador: { nome: pedido.nomeDoComprador, documento: pedido.documentoDoComprador, email: pedido.emailDoComprador, telefone: pedido.telefoneDoComprador },
      enderecoDeEntrega: pedido.enderecoDeEntrega ?? {},
    };
    const { clienteId } = await clienteDoPedido(tx, normalizado, { semDocumento: true });
    if (!clienteId) return { ok: false, erro: "Não foi possível criar o cliente." };
    await tx.pedidoDeVenda.update({
      where: { id },
      data: { clienteId, avisos: pedido.avisos.filter((aviso) => aviso !== "clienteSemDocumento") },
    });
    return { ok: true, clienteId };
  });
}

/** Anota no pedido do ML ou da LI o espelho dele no Bling (o numero e o id de la). false quando o pedido nao existe. */
export async function espelharNoBling(origem, numeroNaLoja, { blingPedidoId, blingNumero }) {
  const pedido = await prisma.pedidoDeVenda.findFirst({
    // O Bling grava no numeroLoja o numero do carrinho (pack) quando o pedido do ML tem um, senao o do pedido (medido na
    // VPS em 04/11/2026: 14 dos 15 eram o pack).
    where: { origem, OR: [{ idExterno: String(numeroNaLoja) }, { numero: String(numeroNaLoja) }, { packId: String(numeroNaLoja) }] },
    select: { id: true, avisos: true },
  });
  if (!pedido) return false;
  await prisma.pedidoDeVenda.update({
    where: { id: pedido.id },
    data: {
      blingPedidoId: blingPedidoId === null || blingPedidoId === undefined ? null : String(blingPedidoId),
      blingNumero: blingNumero === null || blingNumero === undefined ? null : String(blingNumero),
      // A copia chegou ao Bling: o aviso de espelho ausente (rotina de leitura) sai junto.
      avisos: pedido.avisos.filter((aviso) => aviso !== "espelhoNoBlingAusente"),
    },
  });
  return true;
}

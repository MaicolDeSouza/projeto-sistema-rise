import { z } from "zod";

import { prisma } from "@/lib/db";
import { listarPedidosDeVenda as listarDoBanco, lerPedidoDeVenda as lerDoBanco, lucroQueConta } from "@/lib/pedidos/banco";
import { TEXTO_DO_STATUS, TEXTO_DO_STATUS_DO_ENVIO } from "@/lib/pedidos/status";
import { RESTRITO } from "@/lib/riseAi/busca";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

/**
 * Pedidos de venda pelo MCP (pedido do dono em 04/11/2026, Opcao 1: "relatorio + consulta de pedidos"). Tudo leitura,
 * com o acesso da tela Pedidos (`tela.pedidos`); lucro e custo so com `dado.custo`.
 *
 * Dado pessoal do comprador (documento, telefone, e-mail, endereco) NUNCA sai daqui, nem para quem pode ve-lo na tela:
 * a resposta vai para o Claude/ChatGPT da pessoa, fora do Rise, e o relatorio nao precisa dele. Fica o nome e a cidade.
 */

const LEITURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const CANAIS = ["MERCADO_LIVRE", "LOJA_INTEGRADA", "BLING", "SHOPEE"];
const NOME_DO_CANAL = { MERCADO_LIVRE: "Mercado Livre", LOJA_INTEGRADA: "Loja Integrada", BLING: "Bling", SHOPEE: "Shopee" };
const STATUS = Object.keys(TEXTO_DO_STATUS);
const FUSO = "America/Sao_Paulo";
const DIA_MS = 24 * 60 * 60 * 1000;

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));
const centavos = (valor) => Math.round(valor * 100) / 100;
const emTexto = (data) => (data instanceof Date ? data.toISOString() : data ?? null);
/** O dia de Sao Paulo de um instante, "AAAA-MM-DD". */
const diaDeSaoPaulo = (data) => new Date(data).toLocaleDateString("sv-SE", { timeZone: FUSO });

function exigirAcesso(pode) {
  if (typeof pode !== "function" || !pode("tela.pedidos", "ver")) throw new ErroDeFerramenta("Este login não pode ver os pedidos de venda.");
}

const DIA = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a data como AAAA-MM-DD");

/**
 * O periodo em dias de Sao Paulo (o Brasil nao tem horario de verao desde 2019: -03:00 fixo). Sem `desde`, 30 dias ate
 * `ate`; sem `ate`, hoje.
 */
function periodo({ desde, ate }) {
  const fim = ate ?? diaDeSaoPaulo(Date.now());
  const inicio = desde ?? diaDeSaoPaulo(new Date(`${fim}T12:00:00-03:00`).getTime() - 29 * DIA_MS);
  if (inicio > fim) throw new ErroDeFerramenta(`O início (${inicio}) é depois do fim (${fim}).`);
  return { desde: inicio, ate: fim, de: new Date(`${inicio}T00:00:00.000-03:00`), atePor: new Date(`${fim}T23:59:59.999-03:00`) };
}

// ---------------------------------------------------------------------------
// Relatorio
// ---------------------------------------------------------------------------

export async function relatorioDeVendas({ desde, ate, canais } = {}, { pode }) {
  exigirAcesso(pode);
  const veCusto = pode("dado.custo", "ver");
  const p = periodo({ desde, ate });
  const pedidos = await prisma.pedidoDeVenda.findMany({
    where: { dataDaVenda: { gte: p.de, lte: p.atePor }, ...(canais?.length ? { canal: { in: canais } } : {}) },
    select: {
      canal: true,
      status: true,
      dataDaVenda: true,
      total: true,
      totalProdutos: true,
      freteCobrado: true,
      lucroFechado: true,
      lucroEstimado: true,
      lucroReal: true,
      itens: { select: { titulo: true, codigoNaOrigem: true, quantidade: true, total: true, produto: { select: { sku: true, tituloBase: true } } } },
    },
  });

  const validos = pedidos.filter((pedido) => pedido.status !== "CANCELADO");
  const cancelados = pedidos.filter((pedido) => pedido.status === "CANCELADO");
  const soma = (lista, campo) => centavos(lista.reduce((total, pedido) => total + (numero(pedido[campo]) ?? 0), 0));
  const lucroDe = (lista) => {
    let lucro = 0;
    let sem = 0;
    for (const pedido of lista) {
      const valor = lucroQueConta(pedido);
      if (valor === null) sem += 1;
      else lucro += valor;
    }
    return { lucro: centavos(lucro), sem };
  };

  const porCanal = new Map();
  const porDia = new Map();
  const porStatus = {};
  const produtos = new Map();
  for (const pedido of pedidos) {
    const rotulo = TEXTO_DO_STATUS[pedido.status] ?? pedido.status;
    porStatus[rotulo] = (porStatus[rotulo] ?? 0) + 1;
  }
  for (const pedido of validos) {
    const canal = porCanal.get(pedido.canal) ?? [];
    canal.push(pedido);
    porCanal.set(pedido.canal, canal);
    const dia = diaDeSaoPaulo(pedido.dataDaVenda);
    const doDia = porDia.get(dia) ?? { dia, pedidos: 0, faturamento: 0 };
    doDia.pedidos += 1;
    doDia.faturamento = centavos(doDia.faturamento + numero(pedido.total));
    porDia.set(dia, doDia);
    for (const item of pedido.itens) {
      // O item fora do Rise entra pelo codigo da origem (ou o titulo), para nao sumir do ranking.
      const sku = item.produto?.sku ?? item.codigoNaOrigem ?? null;
      const chave = sku ?? `titulo:${item.titulo}`;
      const linha = produtos.get(chave) ?? { sku, nome: item.produto?.tituloBase ?? item.titulo, quantidade: 0, faturamento: 0, pedidos: 0 };
      linha.quantidade += item.quantidade;
      linha.faturamento = centavos(linha.faturamento + numero(item.total));
      linha.pedidos += 1;
      produtos.set(chave, linha);
    }
  }

  const geral = lucroDe(validos);
  const faturamento = soma(validos, "total");
  return {
    periodo: { desde: p.desde, ate: p.ate, canais: canais?.length ? canais.map((c) => NOME_DO_CANAL[c]) : "todos" },
    pedidos: validos.length,
    faturamento,
    faturamentoProdutos: soma(validos, "totalProdutos"),
    freteCobrado: soma(validos, "freteCobrado"),
    ticketMedio: validos.length ? centavos(faturamento / validos.length) : 0,
    lucro: veCusto ? geral.lucro : RESTRITO,
    pedidosSemLucro: geral.sem,
    cancelados: { pedidos: cancelados.length, valor: soma(cancelados, "total") },
    porCanal: [...porCanal.entries()]
      .map(([canal, lista]) => ({ canal: NOME_DO_CANAL[canal] ?? canal, pedidos: lista.length, faturamento: soma(lista, "total"), lucro: veCusto ? lucroDe(lista).lucro : RESTRITO }))
      .sort((a, b) => b.faturamento - a.faturamento),
    porStatus,
    porDia: [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
    maisVendidos: [...produtos.values()].sort((a, b) => b.faturamento - a.faturamento || b.quantidade - a.quantidade).slice(0, 15),
    observacao: geral.sem ? `${geral.sem} pedido(s) sem lucro calculado (item sem custo no Rise): o lucro do período não os inclui.` : null,
  };
}

// ---------------------------------------------------------------------------
// Lista e pedido
// ---------------------------------------------------------------------------

export async function listarPedidosDeVenda({ desde, ate, canais, status, termos, limite = 25 } = {}, { pode }) {
  exigirAcesso(pode);
  const veCusto = pode("dado.custo", "ver");
  const p = periodo({ desde, ate });
  const { linhas, total } = await listarDoBanco({ desde: p.de, ate: p.atePor, canais, status, busca: termos, porPagina: limite });
  return {
    periodo: { desde: p.desde, ate: p.ate },
    total,
    pedidos: linhas.map((linha) => ({
      numero: linha.numero,
      canal: NOME_DO_CANAL[linha.canal] ?? linha.canal,
      dataDaVenda: emTexto(linha.dataDaVenda),
      cliente: linha.cliente?.nome ?? linha.nomeDoComprador ?? null,
      status: linha.status,
      statusTexto: TEXTO_DO_STATUS[linha.status] ?? linha.status,
      envio: TEXTO_DO_STATUS_DO_ENVIO[linha.statusDoEnvio] ?? linha.statusDoEnvio,
      total: linha.total,
      lucro: veCusto ? lucroQueConta(linha) : RESTRITO,
      itens: linha.quantidadeDeItens,
      primeiroItem: linha.item ? { sku: linha.item.sku, titulo: linha.item.titulo, quantidade: linha.item.quantidade } : null,
      pecasEmFalta: linha.faltas,
      avisos: linha.avisos,
      blingNumero: linha.blingNumero,
    })),
  };
}

/** O pedido pelo numero que o operador ve, o id na origem ou o numero no Bling (sem caixa). */
async function acharPedido(referencia) {
  const texto = String(referencia ?? "").trim();
  if (!texto) throw new ErroDeFerramenta("Informe o número do pedido.");
  const igual = { equals: texto, mode: "insensitive" };
  const achados = await prisma.pedidoDeVenda.findMany({ where: { OR: [{ numero: igual }, { idExterno: igual }, { blingNumero: igual }] }, select: { id: true, numero: true }, take: 3 });
  if (achados.length === 0) throw new ErroDeFerramenta(`Pedido ${texto} não encontrado.`);
  // O mesmo numero como venda e como espelho do Bling de outra: o numero da venda vence.
  return (achados.find((a) => a.numero.toLowerCase() === texto.toLowerCase()) ?? achados[0]).id;
}

export async function lerPedidoDeVenda({ pedido }, { pode }) {
  exigirAcesso(pode);
  const veCusto = pode("dado.custo", "ver");
  const p = await lerDoBanco(await acharPedido(pedido));
  const entrega = p.enderecoDeEntrega ?? {};
  const cidade = entrega.cidade ? `${entrega.cidade}${entrega.uf ? ` (${entrega.uf})` : ""}` : null;
  return {
    numero: p.numero,
    canal: NOME_DO_CANAL[p.canal] ?? p.canal,
    blingNumero: p.blingNumero,
    dataDaVenda: emTexto(p.dataDaVenda),
    cliente: { nome: p.cliente?.nome ?? p.nomeDoComprador ?? null, nivel: p.cliente?.nivel ?? null, cidade },
    status: p.status,
    statusTexto: TEXTO_DO_STATUS[p.status] ?? p.status,
    statusNaOrigem: p.statusDaOrigem,
    emSeparacao: p.emSeparacao,
    itens: p.itens.map((item) => ({
      sku: item.produto?.sku ?? item.codigoNaOrigem ?? null,
      titulo: item.titulo,
      noRise: Boolean(item.produto),
      quantidade: item.quantidade,
      precoUnitario: item.precoUnitario,
      desconto: item.desconto,
      total: item.total,
      comissao: veCusto ? item.comissao : RESTRITO,
      custoUnitario: veCusto ? item.custoUnitarioCongelado : RESTRITO,
    })),
    totais: { produtos: p.totalProdutos, desconto: p.desconto, frete: p.freteCobrado, total: p.total },
    pagamento: (Array.isArray(p.pagamento) ? p.pagamento : []).map((pg) => ({ forma: pg?.forma ?? null, parcelas: pg?.parcelas ?? 1, valor: numero(pg?.valor), status: pg?.status ?? null, aprovadoEm: pg?.aprovadoEm ?? null })),
    envio: {
      status: TEXTO_DO_STATUS_DO_ENVIO[p.statusDoEnvio] ?? p.statusDoEnvio,
      tipo: p.envio?.tipo ?? null,
      servico: p.envio?.servico ?? null,
      transportadora: p.envio?.transportadora ?? null,
      rastreio: p.envio?.rastreio ?? null,
      link: p.envio?.link ?? null,
      postadoEm: p.envio?.historico?.postadoEm ?? null,
      entregueEm: p.envio?.historico?.entregueEm ?? null,
    },
    nf: p.nf ? { numero: p.nf.numero ?? null, serie: p.nf.serie ?? null, chave: p.nf.chave ?? null, emitidaEm: p.nf.emitidaEm ?? null, status: p.nf.status ?? null } : null,
    lucro: veCusto ? { estimado: p.lucroEstimado, real: p.lucroReal, fechado: p.lucroFechado, parcelasEstimadas: p.estimativa ?? null, parcelasReais: p.real ?? null } : RESTRITO,
    pecasEmFalta: (p.pecas?.pecas ?? []).filter((peca) => peca.falta > 0).map((peca) => ({ sku: peca.sku, falta: peca.falta, previsao: peca.previsao ?? null })),
    avisos: p.avisos,
  };
}

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

const PERIODO = {
  desde: DIA.optional().describe("Primeiro dia (AAAA-MM-DD, horário de Brasília). Sem ele: 30 dias até o fim"),
  ate: DIA.optional().describe("Último dia, incluído (AAAA-MM-DD). Sem ele: hoje"),
  canais: z.array(z.enum(CANAIS)).max(4).optional().describe("MERCADO_LIVRE, LOJA_INTEGRADA, BLING (venda digitada no Bling); vazio = todos"),
};

export const FERRAMENTAS_DE_PEDIDOS_DE_VENDA = [
  {
    nome: "relatorioDeVendas",
    descricao: [
      "Relatório das vendas de um período (pedidos de venda do Mercado Livre, da Loja Integrada e do Bling, desde 01/11/2026):",
      "quantidade de pedidos, faturamento (com e sem frete), ticket médio, lucro, os cancelados à parte, e a divisão por canal, por status e por dia,",
      "mais os produtos mais vendidos. Cancelado não entra nos totais. O lucro é o real quando o pedido fechou e o estimado antes disso.",
    ].join(" "),
    esquema: z.object(PERIODO),
    anotacoes: LEITURA,
    executar: relatorioDeVendas,
  },
  {
    nome: "listarPedidosDeVenda",
    descricao: "Lista os pedidos de venda de um período, do mais novo ao mais antigo: número, canal, data, cliente (só o nome), status, envio, total, lucro, o primeiro item, peças em falta e avisos. Filtra por canal, status e por número, cliente, SKU ou título do item.",
    esquema: z.object({
      ...PERIODO,
      status: z.array(z.enum(STATUS)).max(9).optional().describe("AGUARDANDO_PAGAMENTO, PAGO, AGUARDANDO_PECAS, EM_SEPARACAO, ENVIADO, ENTREGUE, FINALIZADO, CANCELADO, DEVOLVIDO; vazio = todos"),
      termos: z.string().trim().max(120).optional().describe("Número do pedido, nome do cliente, SKU ou título do item"),
      limite: z.number().int().min(1).max(100).optional().describe("Quantos devolver (padrão 25). O total vem junto"),
    }),
    anotacoes: LEITURA,
    executar: listarPedidosDeVenda,
  },
  {
    nome: "lerPedidoDeVenda",
    descricao: "Lê um pedido de venda inteiro pelo número (o do canal ou o do Bling): itens com preço e custo, totais, pagamento, envio com rastreio, nota fiscal, lucro estimado e real com as parcelas, peças em falta e avisos. Do cliente vêm só o nome e a cidade.",
    esquema: z.object({ pedido: z.string().trim().min(1).max(60).describe("O número do pedido (ex.: 2000019299804380, 5001 ou o número no Bling)") }),
    anotacoes: LEITURA,
    executar: lerPedidoDeVenda,
  },
];

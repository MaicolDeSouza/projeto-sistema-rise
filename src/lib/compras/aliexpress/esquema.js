import { z } from "zod";

/**
 * O que a extensao "Rise AliExpress" manda ao Rise (spec 2026-10-28, §6.1), em duas fases: `lista` (os pedidos lidos
 * da pagina) e `detalhes` (frete/imposto e rastreio dos pedidos que o Rise pediu). Chave desconhecida e descartada (o
 * z.object padrao): dado pessoal que escape da extensao (destinatario, endereco, telefone) nao chega ao banco.
 */

const texto = (maximo) => z.string().trim().max(maximo);
const textoOuNulo = (maximo) => texto(maximo).nullable().optional().transform((valor) => valor ?? null);
const numeroDoAliExpress = z.string().regex(/^\d{1,20}$/);
const ms = z.number().int().nonnegative();

const Linha = z.object({
  orderLineId: numeroDoAliExpress,
  productId: numeroDoAliExpress,
  skuId: numeroDoAliExpress.nullable().optional().transform((valor) => valor ?? null),
  opcao: textoOuNulo(300),
  titulo: texto(500).min(1),
  urlDoItem: textoOuNulo(500),
  urlDaFoto: textoOuNulo(500),
  quantidade: z.number().int().min(1).max(99999),
  precoTexto: texto(40),
});

const Pedido = z.object({
  orderId: z.string().regex(/^\d{10,20}$/),
  dataTexto: texto(40),
  dataIso: z.string().datetime().nullable().optional().transform((valor) => valor ?? null),
  statusTexto: texto(80),
  statusCodigo: z.number().int().nullable().optional().transform((valor) => valor ?? null),
  loja: textoOuNulo(200),
  lojaId: textoOuNulo(40),
  totalTexto: texto(40),
  moeda: texto(8),
  linhas: z.array(Linha).min(1).max(100),
});

const FaseLista = z.object({
  fase: z.literal("lista"),
  lidoEm: z.string().datetime(),
  pedidos: z.array(Pedido).max(500),
});

const Detalhe = z.object({
  orderId: z.string().regex(/^\d{10,20}$/),
  subtotalTexto: textoOuNulo(40),
  freteTexto: textoOuNulo(40),
  impostoTexto: textoOuNulo(40),
  totalTexto: textoOuNulo(40),
});

const Pacote = z.object({
  codigo: texto(60).min(1),
  codigoOrigem: textoOuNulo(60),
  transportadora: textoOuNulo(120),
  previsaoTexto: textoOuNulo(60),
  previsaoInicio: ms.nullable().optional().transform((valor) => valor ?? null),
  previsaoFim: ms.nullable().optional().transform((valor) => valor ?? null),
  eventos: z
    .array(z.object({ em: ms, descricao: texto(300), nome: textoOuNulo(100), codigo: textoOuNulo(80) }))
    .max(30),
  itens: z
    .array(z.object({ productId: numeroDoAliExpress, skuId: numeroDoAliExpress.nullable().optional().transform((valor) => valor ?? null), quantidade: z.number().int().min(0) }))
    .max(100),
});

const FaseDetalhes = z.object({
  fase: z.literal("detalhes"),
  detalhes: z.array(Detalhe).max(200),
  rastreios: z.array(z.object({ orderId: z.string().regex(/^\d{10,20}$/), pacotes: z.array(Pacote).max(20) })).max(200),
});

const Corpo = z.discriminatedUnion("fase", [FaseLista, FaseDetalhes]);

/** O corpo conferido, ou o motivo da recusa ("pedidos.0.orderId: ..."), que a extensao mostra no popup. */
export function lerCorpo(json) {
  const resultado = Corpo.safeParse(json);
  if (!resultado.success) {
    const problema = resultado.error.issues[0];
    const caminho = problema?.path?.length ? `${problema.path.join(".")}: ` : "";
    return { ok: false, erro: `${caminho}${problema?.message ?? "formato inválido"}` };
  }
  const { fase, ...dados } = resultado.data;
  return { ok: true, fase, dados };
}

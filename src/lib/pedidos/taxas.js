import { z } from "zod";

import { prisma } from "@/lib/db";

/**
 * As taxas de venda de um canal (spec 5.6): a Loja Integrada cobra pelo meio de pagamento, e o lucro real do pedido da
 * LI tira a taxa do tipo que o comprador usou. O ML informa a comissao no proprio pedido e o Bling nao cobra nada, por
 * isso so a LI tem taxas cadastradas. Percentual em fracao (0,0099 = 0,99%), fixa e frete em reais.
 */

export const TIPOS_DE_PAGAMENTO_LI = ["pix", "boleto", "cartao_credito", "cartao_debito", "outro"];
export const CANAIS_COM_TAXA = ["LOJA_INTEGRADA"];

const reais = z.number({ error: "Informe um valor em reais." }).finite().min(0, "O valor não pode ser negativo.");
const fracao = z.number({ error: "Informe o percentual." }).finite().min(0, "O percentual não pode ser negativo.").max(1, "O percentual passa de 100%.");

const EsquemaDasTaxas = z.object({
  pagamento: z
    .array(z.object({ tipo: z.enum(TIPOS_DE_PAGAMENTO_LI, { error: "Forma de pagamento desconhecida." }), percentual: fracao.default(0), fixa: reais.default(0) }))
    .default([])
    .refine((lista) => new Set(lista.map((linha) => linha.tipo)).size === lista.length, "Cada forma de pagamento aparece uma vez só."),
  padrao: z.object({ percentual: fracao.default(0), fixa: reais.default(0), frete: reais.default(0) }).default({ percentual: 0, fixa: 0, frete: 0 }),
});

const numero = (valor) => (Number.isFinite(Number(valor)) ? Number(valor) : 0);

/**
 * As taxas gravadas do canal, ou null quando nunca foram cadastradas. Remontadas na ordem fixa das chaves: o JSONB do
 * Postgres devolve as chaves em outra ordem, e a tela e quem compara o JSON contam com a forma do esquema.
 */
export async function lerTaxas(canal) {
  const linha = await prisma.configCanal.findUnique({ where: { canal }, select: { taxas: true } });
  const taxas = linha?.taxas;
  if (!taxas || typeof taxas !== "object") return null;
  return {
    pagamento: (Array.isArray(taxas.pagamento) ? taxas.pagamento : []).map((t) => ({ tipo: t?.tipo ?? "outro", percentual: numero(t?.percentual), fixa: numero(t?.fixa) })),
    padrao: { percentual: numero(taxas.padrao?.percentual), fixa: numero(taxas.padrao?.fixa), frete: numero(taxas.padrao?.frete) },
  };
}

/** Confere e grava as taxas do canal. `{ ok: true, taxas }` ou `{ ok: false, erro }` com a primeira recusa. */
export async function salvarTaxas(canal, taxas) {
  if (!CANAIS_COM_TAXA.includes(canal)) return { ok: false, erro: "Este canal não tem taxas cadastradas no Rise." };
  const conferido = EsquemaDasTaxas.safeParse(taxas ?? {});
  if (!conferido.success) return { ok: false, erro: conferido.error.issues[0]?.message ?? "Taxas inválidas." };
  const dados = conferido.data;
  await prisma.configCanal.upsert({ where: { canal }, create: { canal, taxas: dados }, update: { taxas: dados } });
  return { ok: true, taxas: dados };
}

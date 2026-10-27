import { z } from "zod";

import { lerDesconto } from "@/lib/compras/regras";

/**
 * O que a tela do pedido manda ao Salvar. Os campos chegam como texto (o operador digita "10,50"): o esquema converte
 * e devolve numero ou null. Mensagens com acento: vao para a tela.
 */

/** "10,50", "10.5", 10.5 -> 10.5; vazio -> null; texto -> NaN (o refine recusa). */
function numeroDoTexto(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return valor;
  const texto = String(valor).trim().replace(/\s+/g, "");
  if (!texto) return null;
  return Number(texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto);
}

const numero = (mensagem, { minimo = 0, maximo = Number.MAX_SAFE_INTEGER, inteiro = false, casas = 2 } = {}) =>
  z.preprocess(
    numeroDoTexto,
    z
      .number({ invalid_type_error: mensagem })
      .nullable()
      .refine((valor) => valor === null || Number.isFinite(valor), mensagem)
      .refine((valor) => valor === null || (valor >= minimo && valor <= maximo), mensagem)
      .refine((valor) => valor === null || !inteiro || Number.isInteger(valor), mensagem)
      .refine((valor) => valor === null || Math.abs(Math.round(valor * 10 ** casas) - valor * 10 ** casas) < 1e-6, mensagem),
  );

const textoOpcional = (maximo) =>
  z.preprocess((valor) => (valor === undefined || valor === null || String(valor).trim() === "" ? null : String(valor).trim()), z.string().max(maximo).nullable());

const EsquemaDoItem = z.object({
  id: z.string().min(1),
  quantidade: numero("Informe um número inteiro maior que zero.", { minimo: 1, maximo: 9_999_999, inteiro: true }).refine((valor) => valor !== null, "Informe a quantidade."),
  precoUnitario: numero("Preço inválido (até 4 casas).", { maximo: 9_999_999, casas: 4 }).optional(),
  ipiPercentual: numero("IPI entre 0 e 100%.", { maximo: 100 }).optional(),
  prazoDias: numero("Prazo em dias inteiros.", { maximo: 3650, inteiro: true }).optional(),
  nomeNoFornecedor: textoOpcional(300).optional(),
  codigoNoFornecedor: textoOpcional(120).optional(),
});

export const EsquemaDoPedido = z.object({
  itens: z.array(EsquemaDoItem).max(500).optional(),
  icmsSt: numero("Valor inválido.", { maximo: 99_999_999 }).optional(),
  desconto: z.preprocess((valor) => (valor === undefined ? undefined : String(valor ?? "")), z.string().max(30).optional()),
  frete: numero("Valor inválido.", { maximo: 99_999_999 }).optional(),
  entrada: numero("Valor inválido.", { maximo: 99_999_999 }).optional(),
  formaPagamento: z.enum(["PIX", "BOLETO", "CARTAO"]).nullable().optional(),
  parcelas: numero("De 1 a 24 parcelas.", { minimo: 1, maximo: 24, inteiro: true }).optional(),
  transportadoraId: textoOpcional(40).optional(),
  transportadoraNome: textoOpcional(120).optional(),
  fretePorConta: z.enum(["CIF", "FOB"]).optional(),
  rastreio: textoOpcional(80).optional(),
  propostaNumero: textoOpcional(60).optional(),
  observacoes: textoOpcional(4000).optional(),
});

/**
 * Confere o que veio da tela. Devolve `{ ok, dados }` ou `{ ok: false, erros }` com a chave do campo como a tela a
 * conhece ("itens.0.quantidade", "desconto").
 */
export function conferirPedido(entrada) {
  const resultado = EsquemaDoPedido.safeParse(entrada ?? {});
  const erros = {};
  if (!resultado.success) {
    for (const problema of resultado.error.issues) {
      const chave = problema.path.join(".");
      if (!erros[chave]) erros[chave] = problema.message;
    }
  }
  const dados = resultado.success ? resultado.data : null;
  let desconto;
  if (entrada && entrada.desconto !== undefined) {
    desconto = lerDesconto(entrada.desconto);
    if ("erro" in desconto) erros.desconto = desconto.erro;
  }
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, dados, desconto };
}

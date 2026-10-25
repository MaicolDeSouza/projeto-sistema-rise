import { z } from "zod";

import { marcarReferencias } from "@/lib/referencias/marcar";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";
import { exigirProposta } from "./proposta.js";

/**
 * A marcacao das referencias de um produto pelo MCP (pedido do dono em 25/10/2026; regras em
 * src/lib/referencias/roteiro.js, servido pela roteiroDaProposta com canal "referencias"). Diferente da proposta, ESTA
 * ferramenta grava no produto: os vinculos de fornecedor e concorrente. Por isso pede, alem do acesso da proposta
 * (custo e concorrentes), o de editar o cadastro de produtos. Fornecedor nunca vira padrao; nada vai ao Bling.
 */

export function exigirReferencias(contexto) {
  exigirProposta(contexto);
  if (!contexto.pode("tela.produtos.cadastro", "editar")) {
    throw new ErroDeFerramenta("Este login não pode marcar referências (precisa editar o cadastro de Produtos).");
  }
}

const ITEM = z
  .object({
    fonte: z.string().trim().min(1).max(120).describe("A loja, como buscarNoMercado devolve em 'fonte' (ex.: 'Fortek', '4hobby')"),
    codigo: z.string().trim().max(120).optional().describe("O código do produto na loja, como buscarNoMercado devolve"),
    url: z.string().trim().max(1000).optional().describe("O endereço do produto, só quando a loja não tem código"),
  })
  .refine((item) => Boolean(item.codigo || item.url), { message: "Informe o código (ou o endereço, sem código)." });

const LADO = z
  .object({
    adicionar: z.array(ITEM).max(30).optional(),
    remover: z.array(ITEM).max(30).optional(),
  })
  .optional();

const MARCAR_REFERENCIAS = {
  nome: "marcarReferencias",
  descricao: [
    "Marca (vincula) ou desmarca os fornecedores e concorrentes de um produto, para o dono conferir na lupa e na aba Fornecedores / Concorrentes. Siga o roteiro da roteiroDaProposta com canal 'referencias'.",
    "Cada item pela loja e código que buscarNoMercado devolveu. Fornecedor nunca vira padrão (o custo do produto não muda e o fornecedor que veio do Bling continua valendo). Nada vai ao Bling.",
    "Devolve o que foi feito, os recusados com o motivo e quantos ficaram vinculados.",
  ].join(" "),
  esquema: z.object({
    sku: z.string().trim().min(1).max(60).describe("O código (SKU) do produto no Rise, ex.: '170113'"),
    concorrentes: LADO,
    fornecedores: LADO,
  }),
  // Escreve no produto; marcar de novo o mesmo item nao muda nada.
  anotacoes: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async executar({ sku, concorrentes, fornecedores }, contexto) {
    exigirReferencias(contexto);
    const resultado = await marcarReferencias(sku, { concorrentes, fornecedores });
    if (!resultado.ok) throw new ErroDeFerramenta(resultado.erro);
    const { ok: _ok, ...resto } = resultado;
    return resto;
  },
};

export const FERRAMENTAS_DE_REFERENCIAS = [MARCAR_REFERENCIAS];

import { z } from "zod";

import { lerSituacaoDoProduto, proximoPasso } from "@/lib/propostaDeAnuncio/situacao";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

/**
 * As ferramentas da proposta automatica de ANUNCIO pelo MCP (spec 2026-10-23): a situacao do produto (o proximo passo) e,
 * por canal, ler e gravar a proposta. Gravam so no rascunho do `Anuncio` do Rise; nunca no canal nem no Bling. Sem o
 * lembrete de `anotarDuvida`, como as da proposta de produto.
 */

const SKU = z.string().trim().min(1).max(60).describe("O código (SKU) do produto no Rise, ex.: '100103'");
const SO_LEITURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

const TELA_DO_CANAL = { li: "tela.canaisDeVenda.lojaIntegrada", ml: "tela.canaisDeVenda.mercadoLivre" };
const NOME_DO_CANAL = { li: "Loja Integrada", ml: "Mercado Livre" };

/** A acao Propor anuncio, editar a tela do canal e, no ML, custo e concorrentes (o preco usa os dois). */
export function exigirPropostaDeAnuncio(contexto, canal) {
  const pode = contexto?.pode;
  const recusa = (motivo) => new ErroDeFerramenta(`Este login não pode montar proposta de anúncio (${motivo}).`);
  if (typeof pode !== "function" || !pode("acao.canaisDeVenda.proporAnuncio", "executar")) throw recusa("precisa da ação Propor anúncio");
  if (!pode(TELA_DO_CANAL[canal], "editar")) throw recusa(`precisa editar ${NOME_DO_CANAL[canal]}`);
  if (canal === "ml") {
    if (!pode("dado.custo", "ver")) throw recusa("precisa do acesso a custo e fornecedores");
    if (!pode("dado.concorrentes", "ver")) throw recusa("precisa do acesso a concorrentes e seus preços");
  }
}

const SITUACAO_DO_PRODUTO = {
  nome: "situacaoDoProduto",
  descricao: [
    "Diz onde o produto está no caminho do anúncio: Rise Conferido, Bling em dia, anúncio da Loja Integrada e do Mercado Livre (e se há proposta esperando o dono),",
    "e o próximo passo (proximoPasso) com o motivo em texto. Chame ANTES de qualquer proposta de anúncio e diga à pessoa, no chat, o que vai fazer.",
  ].join(" "),
  esquema: z.object({ sku: SKU }),
  anotacoes: SO_LEITURA,
  async executar({ sku }, contexto) {
    if (typeof contexto?.pode !== "function" || !contexto.pode("tela.produtos", "ver")) {
      throw new ErroDeFerramenta("Este login não pode ver Produtos.");
    }
    const situacao = await lerSituacaoDoProduto(sku);
    if (!situacao) throw new ErroDeFerramenta(`Produto ${sku} não encontrado.`);
    const { passo, motivo } = proximoPasso(situacao);
    return { ...situacao, proximoPasso: passo, motivo };
  },
};

export const FERRAMENTAS_DA_PROPOSTA_DE_ANUNCIO = [SITUACAO_DO_PRODUTO];

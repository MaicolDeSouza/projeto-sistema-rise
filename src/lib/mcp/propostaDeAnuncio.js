import { z } from "zod";

import { clienteLI } from "@/lib/canaisDeVenda/li/cliente";
import { gravarPropostaLI, lerParaPropostaLI } from "@/lib/propostaDeAnuncio/li";
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

// O cliente da LI vem do contexto so no teste (a LI falsa); no ar e o de verdade, e aqui so le.
const clienteDaLI = (contexto) => contexto?.mcp?.clienteLI ?? clienteLI();

const LER_PARA_PROPOSTA_LI = {
  nome: "lerParaPropostaLI",
  descricao:
    "Primeiro passo da proposta do anúncio da Loja Integrada: traz o produto, a árvore de categorias da loja (id e caminho), as marcas da loja, o SEO dos concorrentes salvos, o rascunho atual do anúncio e os limites (a Meta Tag Description tem de 130 a 160 caracteres). Só lê.",
  esquema: z.object({ sku: SKU }),
  anotacoes: { ...SO_LEITURA, openWorldHint: true },
  async executar({ sku }, contexto) {
    exigirPropostaDeAnuncio(contexto, "li");
    return lerParaPropostaLI(clienteDaLI(contexto), sku);
  },
};

const GRAVAR_PROPOSTA_LI = {
  nome: "gravarPropostaLI",
  descricao: [
    "Grava a proposta do anúncio da Loja Integrada no rascunho do Rise: categorias (ids da árvore; o Rise marca as pais), marca e a Meta Tag Description (130 a 160 caracteres), com o relatório.",
    "Campo vazio no rascunho recebe o valor; campo já preenchido vira sugestão para o dono. Nada vai à loja: o dono revisa e sincroniza. Gravar de novo substitui a proposta.",
  ].join(" "),
  esquema: z.object({
    sku: SKU,
    categorias: z.array(z.string().trim().min(1).max(20)).min(1).max(10).describe("Ids das categorias da loja, como vieram em lerParaPropostaLI"),
    marca: z.string().trim().max(80).optional().describe("A marca, como está na lista da loja (vazio: sem marca)"),
    seoDescription: z.string().trim().min(1).max(200).describe("A Meta Tag Description, de 130 a 160 caracteres"),
    relatorio: z.string().trim().max(8000).optional().describe("O relatório em tópicos: por que cada categoria, de onde veio a marca"),
  }),
  // Escreve so no rascunho do Rise; gravar de novo da o mesmo resultado.
  anotacoes: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async executar(argumentos, contexto) {
    exigirPropostaDeAnuncio(contexto, "li");
    return gravarPropostaLI(clienteDaLI(contexto), argumentos.sku, argumentos);
  },
};

export const FERRAMENTAS_DA_PROPOSTA_DE_ANUNCIO = [SITUACAO_DO_PRODUTO, LER_PARA_PROPOSTA_LI, GRAVAR_PROPOSTA_LI];

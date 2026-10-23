import { z } from "zod";

import { clienteLI } from "@/lib/canaisDeVenda/li/cliente";
import { clienteML } from "@/lib/canaisDeVenda/ml/cliente";
import { gravarPropostaLI, lerParaPropostaLI } from "@/lib/propostaDeAnuncio/li";
import { gravarPropostaML, lerCategoriaML, lerParaPropostaML } from "@/lib/propostaDeAnuncio/ml";
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

// O cliente do ML vem do contexto so no teste (o ML falso); no ar e o de verdade, e aqui so le.
const clienteDoML = (contexto) => contexto?.mcp?.clienteML ?? clienteML();

const LER_PARA_PROPOSTA_ML = {
  nome: "lerParaPropostaML",
  descricao:
    "Primeiro passo da proposta do anúncio do Mercado Livre: traz o produto (com o custo), as categorias candidatas, os atributos da categoria mais provável, os catálogos candidatos (total de anúncios e o 1º colocado de cada um), os catálogos dos anúncios do dono e as referências do produto. Só lê.",
  esquema: z.object({ sku: SKU }),
  anotacoes: { ...SO_LEITURA, openWorldHint: true },
  async executar({ sku }, contexto) {
    exigirPropostaDeAnuncio(contexto, "ml");
    return lerParaPropostaML(clienteDoML(contexto), sku);
  },
};

const LER_CATEGORIA_ML = {
  nome: "lerCategoriaML",
  descricao: "A ficha de uma categoria do Mercado Livre (se é folha, o limite do título e os atributos com os obrigatórios e as listas), para quando a categoria escolhida não for a mais provável. Só lê.",
  esquema: z.object({ categoriaId: z.string().trim().min(3).max(20).describe("O código da categoria, ex.: 'MLB99779'") }),
  anotacoes: { ...SO_LEITURA, openWorldHint: true },
  async executar({ categoriaId }, contexto) {
    exigirPropostaDeAnuncio(contexto, "ml");
    return lerCategoriaML(clienteDoML(contexto), categoriaId);
  },
};

const LINK = z.object({
  url: z.string().trim().url().refine((url) => /^https?:\/\//i.test(url), "Só endereço http(s)."),
  titulo: z.string().trim().max(200).optional(),
  preco: z.number().positive(),
});

const GRAVAR_PROPOSTA_ML = {
  nome: "gravarPropostaML",
  descricao: [
    "Grava a proposta do anúncio do Mercado Livre no rascunho do Rise (sempre um Clássico): categoria folha, título, ficha (atributos), até 10 catálogos do mesmo produto e, sem catálogo, até 5 links com preço.",
    "O Rise lê o 1º de cada catálogo, descarta os de menos de 5 anúncios e CALCULA O PREÇO (30% de margem e o top 5). Nada é publicado e nada entra no ranking: o dono revisa, adiciona os catálogos e publica. Gravar de novo substitui a proposta.",
  ].join(" "),
  esquema: z.object({
    sku: SKU,
    categoriaId: z.string().trim().min(3).max(20).describe("A categoria FOLHA, ex.: 'MLB99779'"),
    titulo: z.string().trim().min(1).max(120).describe("O título, no limite da categoria"),
    atributos: z.record(z.string(), z.string().max(300)).optional().describe("A ficha: id do atributo -> valor (sem GTIN)"),
    catalogos: z.array(z.string().trim().min(3).max(30)).max(10).optional().describe("Ids dos catálogos do mesmo produto"),
    linksSemCatalogo: z.array(LINK).max(5).optional().describe("Só sem catálogo: 5 anúncios do mesmo produto com o preço"),
    relatorio: z.string().trim().max(8000).optional().describe("O relatório em tópicos"),
  }),
  // Escreve so no rascunho do Rise; gravar de novo atualiza o mesmo Classico.
  anotacoes: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async executar(argumentos, contexto) {
    exigirPropostaDeAnuncio(contexto, "ml");
    return gravarPropostaML(clienteDoML(contexto), argumentos.sku, argumentos);
  },
};

export const FERRAMENTAS_DA_PROPOSTA_DE_ANUNCIO = [SITUACAO_DO_PRODUTO, LER_PARA_PROPOSTA_LI, GRAVAR_PROPOSTA_LI, LER_PARA_PROPOSTA_ML, LER_CATEGORIA_ML, GRAVAR_PROPOSTA_ML];

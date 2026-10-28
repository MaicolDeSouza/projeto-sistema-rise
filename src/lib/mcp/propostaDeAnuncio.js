import { z } from "zod";

import { clienteML } from "@/lib/canaisDeVenda/ml/cliente";
import { gravarPropostaML, lerCategoriaML, lerParaPropostaML } from "@/lib/propostaDeAnuncio/ml";
import { lerSituacaoDoProduto, proximoPasso } from "@/lib/propostaDeAnuncio/situacao";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

/**
 * As ferramentas da proposta automatica de ANUNCIO pelo MCP (spec 2026-10-23): a situacao do produto (o proximo passo) e
 * ler e gravar a proposta do Mercado Livre. Gravam so no rascunho do `Anuncio` do Rise; nunca no canal nem no Bling. Sem o
 * lembrete de `anotarDuvida`, como as da proposta de produto. A proposta da Loja Integrada NAO existe mais (25/10/2026):
 * categorias e SEO da loja sao do produto e vem na proposta de produto.
 */

const SKU = z.string().trim().min(1).max(60).describe("O código (SKU) do produto no Rise, ex.: '100103'");
// O kit no ML (pedido do dono em 28/10/2026): montado no editor do ML, ligado ao produto base; nunca um produto novo no Rise.
// Numero OU texto de digitos: o cliente que guardou a lista de ferramentas de antes deste campo o manda como texto ("10"), e
// so numero recusava a chamada (visto no primeiro uso, 28/10/2026). O valor e conferido no Rise (`kitNoML`).
const QUANTIDADE_DO_KIT = z
  .union([z.number().int().min(2).max(9999), z.string().trim().regex(/^\d{1,4}$/)])
  .optional()
  .describe("Só quando o dono pede o anúncio em kit (ex.: 'kit de 10 peças'): quantas unidades do produto base o anúncio vende. O kit é montado no editor do ML, ligado ao produto base (o estoque é o dele); nenhum produto novo no Rise. Sem ela, o anúncio é de 1 unidade");
const comoNumero = (valor) => (valor === undefined ? undefined : Number(valor));
const SO_LEITURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

const TELA_DO_CANAL = { ml: "tela.canaisDeVenda.mercadoLivre" };
const NOME_DO_CANAL = { ml: "Mercado Livre" };

/** A acao Propor anuncio, editar a tela do canal e, no ML, custo e concorrentes (o preco usa os dois). */
export function exigirPropostaDeAnuncio(contexto, canal) {
  const pode = contexto?.pode;
  const recusa = (motivo) => new ErroDeFerramenta(`Este login não pode montar proposta de anúncio (${motivo}).`);
  if (typeof pode !== "function" || !pode("acao.canaisDeVenda.proporAnuncio", "executar")) throw recusa("precisa da ação Propor anúncio");
  if (!TELA_DO_CANAL[canal]) throw recusa(`canal desconhecido: ${canal}`);
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

// O cliente do ML vem do contexto so no teste (o ML falso); no ar e o de verdade, e aqui so le.
const clienteDoML = (contexto) => contexto?.mcp?.clienteML ?? clienteML();

const LER_PARA_PROPOSTA_ML = {
  nome: "lerParaPropostaML",
  descricao:
    "Primeiro passo da proposta do anúncio do Mercado Livre: traz o produto (com o custo), as categorias candidatas, os atributos da categoria mais provável, os catálogos candidatos (total de anúncios e o 1º colocado de cada um), os catálogos dos anúncios do dono e as referências do produto. Com quantidade (kit no ML), o custo já é o das N unidades e vem o código e o título de partida do kit. Só lê.",
  esquema: z.object({ sku: SKU, quantidade: QUANTIDADE_DO_KIT }),
  anotacoes: { ...SO_LEITURA, openWorldHint: true },
  async executar({ sku, quantidade }, contexto) {
    exigirPropostaDeAnuncio(contexto, "ml");
    return lerParaPropostaML(clienteDoML(contexto), sku, { quantidade: comoNumero(quantidade) });
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
    "Grava a proposta do anúncio do Mercado Livre no rascunho do Rise (sempre um Clássico): categoria folha, ficha (atributos), até 10 catálogos do mesmo produto e, sem catálogo, até 5 links com preço. O título do anúncio é o nome do produto base e o Rise o põe sozinho: só o produto com composição (kit) e o kit no ML aceitam o título que você mandar.",
    "Kit no ML: com quantidade N o anúncio é o do próprio produto com o Kit de N ligado (código {sku}_{N}, estoque do produto base, custo, peso e medidas das N unidades); nenhum produto novo no Rise.",
    "O Rise lê o 1º de cada catálogo, descarta os de menos de 5 anúncios e CALCULA O PREÇO (no mínimo 40% de markup, lucro sobre o total dos custos com as taxas do ML, e o top 5). Nada é publicado e nada entra no ranking: o dono revisa, adiciona os catálogos e publica. Gravar de novo substitui a proposta.",
  ].join(" "),
  esquema: z.object({
    sku: SKU,
    categoriaId: z.string().trim().min(3).max(20).describe("A categoria FOLHA, ex.: 'MLB99779'"),
    titulo: z.string().trim().max(120).optional().describe("Só para produto com composição (kit) e para o kit no ML (com quantidade): o título, no limite da categoria. Nos demais não mande: o título é o nome do produto"),
    quantidade: QUANTIDADE_DO_KIT,
    atributos: z.record(z.string(), z.string().max(300)).optional().describe("A ficha: id do atributo -> valor (sem GTIN)"),
    catalogos: z.array(z.string().trim().min(3).max(30)).max(10).optional().describe("Ids dos catálogos do mesmo produto"),
    linksSemCatalogo: z.array(LINK).max(5).optional().describe("Só sem catálogo: 5 anúncios do mesmo produto com o preço"),
    relatorio: z.string().trim().max(8000).optional().describe("O relatório em tópicos"),
  }),
  // Escreve so no rascunho do Rise; gravar de novo atualiza o mesmo Classico.
  anotacoes: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async executar(argumentos, contexto) {
    exigirPropostaDeAnuncio(contexto, "ml");
    return gravarPropostaML(clienteDoML(contexto), argumentos.sku, { ...argumentos, quantidade: comoNumero(argumentos.quantidade) });
  },
};

export const FERRAMENTAS_DA_PROPOSTA_DE_ANUNCIO = [SITUACAO_DO_PRODUTO, LER_PARA_PROPOSTA_ML, LER_CATEGORIA_ML, GRAVAR_PROPOSTA_ML];

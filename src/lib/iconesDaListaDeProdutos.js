/**
 * Os icones da coluna Canais da lista de Produtos (Bling, Loja Integrada, Mercado Livre e o "!" do kit no Rise),
 * calculados num lugar so: a pagina desenha a linha com eles e o filtro da coluna (o "!" e o "ML com catalogo", 28/10/2026)
 * decide por eles. Duas copias da regra deixariam o filtro achar um "!" que a linha nao mostra. So servidor: as
 * assinaturas do Bling e da LI usam node:crypto. So banco: nada aqui chama o Bling, o ML ou a LI.
 */

import { INCLUDE_DO_ICONE_BLING, iconeBlingDoProduto } from "@/lib/blingSync/estado";
import { estadoDoIconeML } from "@/lib/canaisDeVenda/ml/icone";
import { mudancasDosAnunciosML } from "@/lib/canaisDeVenda/ml/banco";
import { documentosDoProduto } from "@/lib/canaisDeVenda/li/banco";
import { iconeLIDoProduto } from "@/lib/canaisDeVenda/li/estado";
import { mudancasDosKits } from "@/lib/composicaoBanco";

/** O que cada produto precisa trazer do banco para os icones. */
export const INCLUDE_DOS_ICONES = {
  anuncios: {
    select: {
      id: true,
      canal: true,
      status: true,
      situacaoCanal: true,
      idExterno: true,
      // Para o icone da Loja Integrada: o rascunho e a assinatura do ultimo envio.
      produtoId: true,
      titulo: true,
      descricao: true,
      dados: true,
      hashConteudo: true,
      sincronizadoEm: true,
    },
  },
  // Para o icone do Bling: os fornecedores (entram na assinatura dos campos), as fotos e quantos ajustes de estoque
  // ainda nao foram ao Bling.
  ...INCLUDE_DO_ICONE_BLING,
};

// Os documentos so pesam no icone de quem tem anuncio na LI; em lotes pequenos, para o filtro sobre o acervo inteiro
// nao fazer milhares de consultas uma atras da outra.
async function documentosDaLI(produtos) {
  const porProduto = new Map();
  const comLI = produtos.filter((produto) => produto.anuncios.some((anuncio) => anuncio.canal === "LOJA_INTEGRADA"));
  for (let inicio = 0; inicio < comLI.length; inicio += 10) {
    const lote = comLI.slice(inicio, inicio + 10);
    const documentos = await Promise.all(lote.map((produto) => documentosDoProduto(produto)));
    lote.forEach((produto, indice) => porProduto.set(produto.id, documentos[indice]));
  }
  return porProduto;
}

/** Algum dos icones da linha tem o selo "!" (a mesma conta de `ConferidoProduto`, `IconeBling`, `IconeLojaIntegrada` e `LinhaProduto`). */
export function temSeloDeAviso({ pecasAlteradas, iconeBling, iconeLI, iconeML }) {
  return (
    pecasAlteradas > 0 ||
    Boolean(iconeBling?.divergente) ||
    Boolean(iconeLI?.divergente || iconeLI?.incompleto || iconeLI?.alertaNaLoja || iconeLI?.fotosMudaram) ||
    Boolean(iconeML?.erro || iconeML?.desatualizado || iconeML?.precisaAgirNoML || iconeML?.estoqueDivergenteNoML || iconeML?.catalogoMudouNoML)
  );
}

/**
 * Os icones de cada produto: `Map<id, { pecasAlteradas, iconeBling, iconeLI, iconeML }>`. Cada parte que falha fica sem
 * o selo dela e nao derruba a lista (era assim na pagina).
 * @param {object[]} produtos lidos com `INCLUDE_DOS_ICONES`
 */
export async function iconesDosProdutos(produtos) {
  const lista = Array.isArray(produtos) ? produtos : [];

  // O "!" do kit (10/10/2026): quantas pecas mudaram desde o ultimo Salvar de cada kit.
  let alteracoesDosKits = new Map();
  try {
    const kits = lista.filter((produto) => produto.tipo === "COMPOSICAO").map((produto) => produto.id);
    if (kits.length > 0) alteracoesDosKits = await mudancasDosKits(kits);
  } catch (excecao) {
    console.error("[produtos] pecas alteradas dos kits", excecao);
  }

  // O "!" do ML quando um anuncio publicado ficou para tras do produto (spec 2026-10-24).
  let mudancasML = new Map();
  try {
    mudancasML = await mudancasDosAnunciosML(lista.flatMap((produto) => produto.anuncios));
  } catch (excecao) {
    console.error("[ml] anuncio publicado x produto", excecao);
  }

  // Loja Integrada: os documentos entram na assinatura so quando ha endereco publico.
  let documentosLI = new Map();
  try {
    documentosLI = await documentosDaLI(lista);
  } catch (excecao) {
    console.error("[loja integrada] icone", excecao);
  }

  return new Map(
    lista.map((produto) => [
      produto.id,
      {
        pecasAlteradas: alteracoesDosKits.get(produto.id)?.length ?? 0,
        iconeML: {
          ...estadoDoIconeML(produto.anuncios.map((anuncio) => ({ ...anuncio, mudancas: mudancasML.get(anuncio.id) }))),
          // O "P" da proposta de anuncio do ML (spec 2026-10-23): so o booleano vai a lista.
          proposta: produto.anuncios.some((anuncio) => anuncio.canal === "MERCADO_LIVRE" && Boolean(anuncio.dados?.proposta)),
        },
        iconeBling: iconeBlingDoProduto(produto),
        iconeLI: iconeLIDoProduto(produto, produto.anuncios.find((anuncio) => anuncio.canal === "LOJA_INTEGRADA") ?? null, {
          documentos: documentosLI.get(produto.id) ?? [],
        }),
      },
    ]),
  );
}

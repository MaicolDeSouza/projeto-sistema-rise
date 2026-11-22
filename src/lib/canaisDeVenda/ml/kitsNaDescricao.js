/**
 * Quais kits entram no bloco "Compre em kit e economize" da descricao de um anuncio (spec 2026-11-20, pedido do dono: o
 * anuncio de 1 peca mostra os kits de 3 e de 5, o de 3 mostra o de 5 e o de 5 nao mostra nada). Funcoes puras, sem banco:
 * a lista de Produtos, o editor, o envio e o teste leem o mesmo arquivo. Quem escreve o texto e `blocoDosKits` (`descricao.js`).
 *
 * Um "irmao" e outro anuncio do MESMO produto base que esta no ML: `{ unidades, preco, link, freteGratis }`.
 */

import { LIMITE_DO_FRETE_GRATIS } from "./custos";
import { linkDoAnuncioML } from "./rotulos";

const dinheiro = (valor) => Math.round((Number(valor) + Number.EPSILON) * 100) / 100;

// Ativo ou pausado (a pausa por falta de estoque volta sozinha; tirar o link a cada pausa acenderia o "!" nos irmaos a toda
// hora). Encerrado sai.
const SITUACOES_NO_ML = new Set(["ATIVA", "PAUSADA"]);

/**
 * Quantas unidades do produto base o anuncio vende: 1 no simples, N no kit de um produto so (`{sku}_{N}`). Kit misto (ou
 * de outro produto) nao tem "unidade" para comparar: `null`, sem bloco e fora do bloco dos outros.
 */
export function unidadesDoAnuncio({ produtoId, composicao } = {}) {
  const itens = Array.isArray(composicao?.itens) ? composicao.itens : [];
  if (itens.length === 0) return 1;
  if (itens.length !== 1 || itens[0]?.produtoId !== produtoId) return null;
  const quantidade = Number(itens[0].quantidade);
  return Number.isInteger(quantidade) && quantidade >= 1 ? quantidade : null;
}

/**
 * Em que bloco do popup do produto o anuncio entra (pedido do dono em 22/11/2026): "produto" (o anuncio simples), "kit" (o
 * Kit de N do MESMO produto, montado no editor) ou "composicao" (o anuncio de um produto kit do cadastro, ou o legado do
 * editor com produtos diferentes, que o editor nao aceita mais).
 * @returns {"produto" | "kit" | "composicao"}
 */
export function grupoDoAnuncioML({ produtoId, composicao, tipoDoProduto } = {}) {
  if (tipoDoProduto === "COMPOSICAO") return "composicao";
  const itens = Array.isArray(composicao?.itens) ? composicao.itens : [];
  if (itens.length === 0) return "produto";
  return itens.length === 1 && itens[0]?.produtoId === produtoId ? "kit" : "composicao";
}

/**
 * Kit de produtos DIFERENTES no editor do ML (dois ou mais produtos na composicao). Desde 22/11/2026 o editor nao aceita:
 * a venda entrava como o produto principal vezes a soma das quantidades e o kit nao tinha codigo nem localizacao no Rise
 * (pedido do dono: "o kit deve sempre ser montado no rise antes"). Item ainda sem produto nao conta.
 */
export function ehKitMisto(composicao) {
  const itens = Array.isArray(composicao?.itens) ? composicao.itens : [];
  return new Set(itens.map((item) => item?.produtoId).filter(Boolean)).size > 1;
}

export const RECUSA_DO_KIT_MISTO = 'Kit de produtos diferentes se monta em Produtos (tipo "Com composição"). No anúncio só entra o kit de N unidades do mesmo produto.';

/**
 * O irmao a partir da linha do anuncio no banco (`produtoId`, `status`, `situacaoCanal`, `idExterno`, `urlExterna`, `dados`).
 * So o publicado, ativo ou pausado, com MLB (rascunho nao tem link). O preco e o que ESTA no ML (o ultimo enviado), nao um
 * digitado e ainda nao sincronizado: o bloco nao pode prometer um preco que o cliente nao vai achar.
 */
export function irmaoDoAnuncio(anuncio) {
  if (anuncio?.status !== "PUBLICADO" || !SITUACOES_NO_ML.has(anuncio.situacaoCanal)) return null;
  const link = linkDoAnuncioML(anuncio.idExterno, anuncio.urlExterna);
  const unidades = unidadesDoAnuncio({ produtoId: anuncio.produtoId, composicao: anuncio.dados?.composicao });
  const preco = Number(anuncio.dados?.publicacao?.enviado?.preco ?? anuncio.dados?.preco);
  if (!link || unidades === null || !(preco > 0)) return null;
  return { unidades, preco: dinheiro(preco), link, freteGratis: Boolean(anuncio.dados?.envio?.freteGratis) || preco >= LIMITE_DO_FRETE_GRATIS };
}

const unitarioDe = (kit) => Number(kit.preco) / Number(kit.unidades);
const valido = (irmao) => Number.isInteger(irmao?.unidades) && irmao.unidades >= 1 && Number(irmao.preco) > 0 && Boolean(irmao.link);

// Um irmao por quantidade: com Classico e Premium do mesmo kit, o mais barato.
function maisBaratoPorQuantidade(irmaos) {
  const porQuantidade = new Map();
  for (const irmao of (Array.isArray(irmaos) ? irmaos : []).filter(valido)) {
    const atual = porQuantidade.get(irmao.unidades);
    if (!atual || Number(irmao.preco) < Number(atual.preco)) porQuantidade.set(irmao.unidades, irmao);
  }
  return [...porQuantidade.values()].sort((a, b) => a.unidades - b.unidades);
}

/**
 * As linhas do bloco de um anuncio de `unidades` pecas a `preco`: os kits maiores, do menor para o maior, e SO o que sai mais
 * barato por unidade que o proprio anuncio e que o kit anterior ja listado (pedido do dono: "o kit com maior unidade seja
 * sempre mais competitivo"; o Rise nao mexe no preco, so deixa de fora quem nao e). Sem preco proprio, a regra vale entre os kits.
 */
export function kitsParaOBloco({ unidades, preco, irmaos }) {
  if (!Number.isInteger(unidades) || unidades < 1) return [];
  let teto = Number(preco) > 0 ? Number(preco) / unidades : Infinity;
  const linhas = [];
  for (const kit of maisBaratoPorQuantidade(irmaos)) {
    if (kit.unidades <= unidades) continue;
    const unitario = unitarioDe(kit);
    // Em centavos: R$ 20,00 por unidade nao "ganha" de R$ 20,00.
    if (!(dinheiro(unitario) < dinheiro(teto))) continue;
    linhas.push({ unidades: kit.unidades, preco: dinheiro(kit.preco), link: kit.link, freteGratis: Boolean(kit.freteGratis) });
    teto = unitario;
  }
  return linhas;
}

/**
 * O aviso do editor do KIT que nao e mais barato por unidade que um anuncio menor do mesmo produto (ele fica fora do bloco
 * dos menores): devolve o menor que ganha dele, `{ unidades, unitario }`, ou `null` quando esta tudo certo.
 */
export function kitForaDoBloco({ unidades, preco, irmaos }) {
  if (!Number.isInteger(unidades) || unidades <= 1 || !(Number(preco) > 0)) return null;
  const meu = dinheiro(Number(preco) / unidades);
  const menores = maisBaratoPorQuantidade(irmaos).filter((irmao) => irmao.unidades < unidades);
  const melhor = menores.reduce((achado, irmao) => (!achado || unitarioDe(irmao) < unitarioDe(achado) ? irmao : achado), null);
  return melhor && dinheiro(unitarioDe(melhor)) <= meu ? { unidades: melhor.unidades, unitario: dinheiro(unitarioDe(melhor)) } : null;
}

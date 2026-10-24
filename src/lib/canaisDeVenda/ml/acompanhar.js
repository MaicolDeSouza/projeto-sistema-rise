/**
 * Anuncio publicado do ML acompanha o produto (spec 2026-10-24): o que o produto mandaria ao anuncio AGORA e o que
 * mudou desde o ultimo envio. Funcoes puras, sem `node:crypto`: a lista de Produtos, o editor e o teste leem o mesmo
 * arquivo. O md5 da descricao (a "impressao") mora em `impressao.js`, so no servidor.
 *
 * Tres partes acompanham o produto (decisao do dono): a descricao, as fotos validadas e o peso e as medidas. Duas sao do
 * PROPRIO anuncio e se editam nele depois de publicado (pedido do dono em 24/10/2026): o preco e a ficha tecnica.
 * O kit montado no editor acompanha so a descricao: as fotos (das pecas) e o pacote (somado e ajustado na aba Envio)
 * sao do anuncio, nao de um produto.
 */

import { montarDescricaoML } from "./descricao";
import { atributosDaFicha } from "./payload";
import { descricaoDoRise, fotosDoRise } from "./rascunho";
import { medidasFaltando } from "./validacao";

// As do produto primeiro (a ordem do envio): o preco e a ficha so mudam no proprio anuncio.
export const PARTES_DO_PRODUTO = ["descricao", "fotos", "pacote"];
export const PARTES_DO_ANUNCIO = ["preco", "ficha"];
export const PARTES = [...PARTES_DO_PRODUTO, ...PARTES_DO_ANUNCIO];

const ehKit = (rascunho) => Array.isArray(rascunho?.composicao?.itens) && rascunho.composicao.itens.length > 0;

/**
 * O pacote no formato dos `SELLER_PACKAGE_*` (cm para cima, gramas arredondados, como `atributosDaEmbalagem`), para
 * a comparacao ver o que o ML ve: 10,15 cm e 10,9 cm sao os mesmos 11 cm la. Sem uma das quatro medidas nao ha pacote.
 */
function pacoteDoProduto(produto) {
  if (!produto || medidasFaltando(produto).length > 0) return null;
  return {
    alturaCm: Math.ceil(Number(produto.alturaCm)),
    larguraCm: Math.ceil(Number(produto.larguraCm)),
    comprimentoCm: Math.ceil(Number(produto.comprimentoCm)),
    pesoG: Math.round(Number(produto.pesoKg) * 1000),
  };
}

/** O preco do anuncio para a impressao: vazio ou zero = sem preco. */
export function precoDoAnuncio(rascunho) {
  return Number(rascunho?.preco) > 0 ? Number(rascunho.preco) : null;
}

/** A ficha como vai ao ML, em ordem de id (a ordem nao muda nada la e nao pode acender o "!"). */
export function fichaDoAnuncio(rascunho) {
  return [...atributosDaFicha(rascunho)].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * O que o produto mandaria ao anuncio agora: `{ descricao, fotos, pacote, preco, ficha, kit }`. `descricao` e o texto exato do ML
 * (`plain_text`), ou `null` quando falta produto no contexto (produto excluido: sem descricao para comparar, a parte
 * fica de fora em vez de acender o "!"). `fotos` sao os NOMES de arquivo: foto trocada ganha nome novo, entao o nome
 * basta. Kit: `fotos` e `pacote` nulos.
 */
export function conteudoAtualDoAnuncio(rascunho, produtosPorId) {
  const kit = ehKit(rascunho);
  const texto = descricaoDoRise(rascunho, produtosPorId);
  const produto = produtosPorId?.[rascunho?.produtoId];
  let fotos = null;
  if (!kit && produto) {
    const porId = new Map((produto.imagens ?? []).map((imagem) => [imagem.id, imagem.arquivo]));
    fotos = (fotosDoRise(rascunho, produtosPorId) ?? []).map((id) => porId.get(id)).filter(Boolean);
  }
  return {
    descricao: texto === null ? null : montarDescricaoML({ descricao: texto }),
    fotos,
    pacote: kit ? null : pacoteDoProduto(produto),
    // Do proprio anuncio: o preco do rascunho e a ficha no formato que vai ao ML (em ordem de id: a ordem nao muda nada la).
    preco: precoDoAnuncio(rascunho),
    ficha: rascunho ? fichaDoAnuncio(rascunho) : null,
    kit,
  };
}

// O JSONB do Postgres reordena as chaves de um objeto: o pacote gravado volta {alturaCm, pesoG, ...} em outra ordem, e
// um JSON.stringify comum o daria por diferente. Chaves em ordem fixa; a ordem dos ITENS (fotos) continua valendo.
const comChavesEmOrdem = (valor) =>
  valor && typeof valor === "object" && !Array.isArray(valor)
    ? Object.fromEntries(Object.keys(valor).sort().map((chave) => [chave, comChavesEmOrdem(valor[chave])]))
    : valor;
const iguais = (a, b) => JSON.stringify(comChavesEmOrdem(a ?? null)) === JSON.stringify(comChavesEmOrdem(b ?? null));

// Parte que o produto nao tem como mandar (descricao ou pacote nulos, kit, ou nenhuma foto validada) nunca entra:
// o envio nunca manda `pictures: []`, e o "!" nao pode acender dizendo que o anuncio "mudou" para nada.
function temParaMandar(atual, parte) {
  const valor = atual?.[parte];
  if (valor === null || valor === undefined) return false;
  return parte === "fotos" || parte === "ficha" ? valor.length > 0 : true;
}

/**
 * As partes em que o anuncio ficou para tras. `enviado` e a impressao gravada no anuncio (`dados.publicacao.enviado`)
 * e `atual` a impressao de agora, no mesmo formato. Sem nenhuma parte do produto na impressao (anuncio publicado antes
 * de 24/10/2026), `naoConferido` e toda parte do produto que ele tem conta.
 *
 * Preco e ficha so contam quando a impressao os tem: o anuncio publicado ficou travado ate 24/10/2026, entao o rascunho
 * e o que esta no ML, e uma impressao antiga sem eles nao pode acender o "!" sozinha. O primeiro Salvar do publicado
 * grava a base de antes (`salvarPublicadoML`).
 * @returns {{ partes: string[], naoConferido: boolean }}
 */
export function mudancasDoAnuncio(enviado, atual) {
  const tem = (parte) => Boolean(enviado) && Object.hasOwn(enviado, parte);
  const naoConferido = !PARTES_DO_PRODUTO.some(tem);
  const doProduto = PARTES_DO_PRODUTO.filter((parte) => temParaMandar(atual, parte) && (naoConferido || !iguais(enviado[parte], atual[parte])));
  const doAnuncio = PARTES_DO_ANUNCIO.filter((parte) => temParaMandar(atual, parte) && tem(parte) && !iguais(enviado[parte], atual[parte]));
  return { partes: [...doProduto, ...doAnuncio], naoConferido };
}

/** Nomes das partes para a tela ("descrição, fotos e peso e medidas"). */
export const NOMES_DAS_PARTES = { descricao: "descrição", fotos: "fotos", pacote: "peso e medidas", preco: "preço", ficha: "ficha técnica" };

/** "descrição", "descrição e fotos", "descrição, fotos e peso e medidas". */
export function textoDasPartes(partes) {
  const nomes = (partes ?? []).map((parte) => NOMES_DAS_PARTES[parte] ?? parte);
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}` : (nomes[0] ?? "");
}

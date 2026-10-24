/**
 * Anuncio publicado do ML acompanha o produto (spec 2026-10-24): o que o produto mandaria ao anuncio AGORA e o que
 * mudou desde o ultimo envio. Funcoes puras, sem `node:crypto`: a lista de Produtos, o editor e o teste leem o mesmo
 * arquivo. O md5 da descricao (a "impressao") mora em `impressao.js`, so no servidor.
 *
 * So tres partes acompanham o produto (decisao do dono): a descricao, as fotos validadas e o peso e as medidas.
 * O kit montado no editor acompanha so a descricao: as fotos (das pecas) e o pacote (somado e ajustado na aba Envio)
 * sao do anuncio, nao de um produto.
 */

import { montarDescricaoML } from "./descricao";
import { descricaoDoRise, fotosDoRise } from "./rascunho";
import { medidasFaltando } from "./validacao";

export const PARTES = ["descricao", "fotos", "pacote"];

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

/**
 * O que o produto mandaria ao anuncio agora: `{ descricao, fotos, pacote, kit }`. `descricao` e o texto exato do ML
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
  return parte === "fotos" ? valor.length > 0 : true;
}

/**
 * As partes em que o anuncio ficou para tras do produto. `enviado` e a impressao gravada no anuncio
 * (`dados.publicacao.enviado`) e `atual` a impressao do produto de agora, no mesmo formato. Sem impressao (anuncio
 * publicado antes de 24/10/2026), `naoConferido` e toda parte que o produto tem conta.
 * @returns {{ partes: string[], naoConferido: boolean }}
 */
export function mudancasDoAnuncio(enviado, atual) {
  const naoConferido = !enviado;
  const partes = PARTES.filter((parte) => temParaMandar(atual, parte) && (naoConferido || !iguais(enviado[parte], atual[parte])));
  return { partes, naoConferido };
}

/** Nomes das partes para a tela ("descrição, fotos e peso e medidas"). */
export const NOMES_DAS_PARTES = { descricao: "descrição", fotos: "fotos", pacote: "peso e medidas" };

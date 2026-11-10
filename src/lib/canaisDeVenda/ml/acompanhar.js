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

import { impressaoDoAtacado } from "./atacado";
import { montarDescricaoML } from "./descricao";
import { atributosDaFicha } from "./payload";
import { descricaoDoRise, fotosDoKitDoRise, fotosDoRise } from "./rascunho";
import { medidasFaltando } from "./validacao";

// As do produto primeiro (a ordem do envio): o preco e a ficha so mudam no proprio anuncio.
export const PARTES_DO_PRODUTO = ["descricao", "fotos", "pacote"];
// O prazo de disponibilidade (28/10/2026) tambem e do proprio anuncio: vai nos termos de venda (sale_terms).
// O preco da loja (08/11/2026, definicao 2 do dono): o "!" acende quando o preco de venda do produto muda, para o dono refazer
// o preco do ML pelo lucro da loja; nada vai ao ML sozinho (o Enviar so registra a base nova). O custo que muda nao acende.
// `titulo` (08/11/2026): so o anuncio REAPROVEITADO da conta o tem na impressao; o publicado pelo Rise nao (o ML gera o titulo
// pelo family_name) e por isso nunca acende.
// `atacado` por ultimo: o envio manda o preco antes, e a recomendacao do ML depende do preco (08/11/2026).
export const PARTES_DO_ANUNCIO = ["titulo", "preco", "ficha", "prazo", "precoDaLoja", "atacado"];
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

/** O prazo de disponibilidade em dias para a impressao (0 = pronta entrega). */
export function prazoDoAnuncio(rascunho) {
  const dias = Number(rascunho?.prazoDisponibilidadeDias);
  return Number.isInteger(dias) && dias >= 0 ? dias : null;
}

/** O preco do anuncio para a impressao: vazio ou zero = sem preco. */
export function precoDoAnuncio(rascunho) {
  return Number(rascunho?.preco) > 0 ? Number(rascunho.preco) : null;
}

/**
 * O preco de venda do produto na loja (a base do preco do ML pelo lucro da loja): kit = a soma de preco x quantidade das
 * pecas. `null` sem preco (ou com uma peca sem preco): a parte fica de fora em vez de acender o "!".
 */
export function precoDaLojaDoAnuncio(rascunho, produtosPorId) {
  const precoDe = (id) => Number(produtosPorId?.[id]?.precoVenda);
  if (!ehKit(rascunho)) return precoDe(rascunho?.produtoId) > 0 ? precoDe(rascunho.produtoId) : null;
  let soma = 0;
  for (const item of rascunho.composicao.itens) {
    const quantidade = Number(item?.quantidade);
    if (!(precoDe(item?.produtoId) > 0) || !(quantidade > 0)) return null;
    soma += precoDe(item.produtoId) * quantidade;
  }
  return Math.round(soma * 100) / 100;
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
  } else if (kit) {
    // Kit (28/10/2026): as fotos sao do proprio anuncio (das pecas e as do kit), editaveis depois de publicado.
    const porId = new Map(
      Object.values(produtosPorId ?? {}).flatMap((outro) => [...(outro?.imagens ?? []), ...(outro?.fotosDoKit ?? [])].map((imagem) => [imagem.id, imagem.arquivo])),
    );
    // Desde 28/10/2026 acompanham o produto base e as pecas: foto nova entra, a que saiu sai, e o publicado acende o "!".
    fotos = (fotosDoKitDoRise(rascunho, produtosPorId) ?? []).map((id) => porId.get(id)).filter(Boolean);
  }
  return {
    descricao: texto === null ? null : montarDescricaoML({ descricao: texto }),
    fotos,
    pacote: kit ? null : pacoteDoProduto(produto),
    // Do proprio anuncio: o preco do rascunho e a ficha no formato que vai ao ML (em ordem de id: a ordem nao muda nada la).
    preco: precoDoAnuncio(rascunho),
    ficha: rascunho ? fichaDoAnuncio(rascunho) : null,
    prazo: prazoDoAnuncio(rascunho),
    precoDaLoja: precoDaLojaDoAnuncio(rascunho, produtosPorId),
    // O titulo do editor (08/11/2026): so conta no anuncio reaproveitado, cuja impressao nasce com o titulo do ML.
    titulo: typeof rascunho?.titulo === "string" ? rascunho.titulo : null,
    // Os precos de atacado do rascunho (08/11/2026): so conta quando a impressao enviada tem a chave (anuncio antigo nao acende).
    atacado: impressaoDoAtacado(rascunho?.atacado),
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
// Exportada (09/11/2026): o Publicar do reutilizado manda todas as partes que o anuncio tem (`atualizar.js`).
export function temParaMandar(atual, parte) {
  const valor = atual?.[parte];
  if (valor === null || valor === undefined) return false;
  if (parte === "prazo") return true;
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
  // As fotos do KIT so contam quando a impressao as tem (kit publicado antes de 28/10/2026 guardou `fotos: null`): senao
  // todo kit publicado acenderia o "!" sozinho. O primeiro Salvar do publicado grava a base (`salvarPublicadoML`).
  const fotosDoKitSemBase = (parte) => parte === "fotos" && atual?.kit && !(tem("fotos") && enviado.fotos !== null);
  const doProduto = PARTES_DO_PRODUTO.filter((parte) => temParaMandar(atual, parte) && !fotosDoKitSemBase(parte) && (naoConferido || !iguais(enviado[parte], atual[parte])));
  // O prazo gravado vazio (impressao de antes dele, 28/10/2026) nao e base: nao acende nada sozinho.
  const doAnuncio = PARTES_DO_ANUNCIO.filter(
    (parte) => temParaMandar(atual, parte) && tem(parte) && !(parte === "prazo" && enviado.prazo === null) && !iguais(enviado[parte], atual[parte]),
  );
  return { partes: [...doProduto, ...doAnuncio], naoConferido };
}

/** Nomes das partes para a tela ("descrição, fotos e peso e medidas"). */
export const NOMES_DAS_PARTES = { descricao: "descrição", fotos: "fotos", pacote: "peso e medidas", preco: "preço", ficha: "ficha técnica", prazo: "prazo de disponibilidade", precoDaLoja: "preço da loja", atacado: "preços de atacado", titulo: "título", bling: "vínculo do Bling" };

/** "descrição", "descrição e fotos", "descrição, fotos e peso e medidas". */
export function textoDasPartes(partes) {
  const nomes = (partes ?? []).map((parte) => NOMES_DAS_PARTES[parte] ?? parte);
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}` : (nomes[0] ?? "");
}

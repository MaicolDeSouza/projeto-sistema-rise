/**
 * Rascunho de um anuncio do Mercado Livre: o estado do editor e a entrada do Salvar.
 * Funcoes puras, sem banco nem rede: a tela, as acoes e o teste leem o mesmo arquivo.
 *
 * Os produtos chegam como "contexto de produto" (`{ id, sku, tituloBase, descricaoBase,
 * marca, modelo, ean, precoVenda, estoque, pesoKg, alturaCm, larguraCm, comprimentoCm,
 * imagens: [{ id, url, principal }] ... }`), ja com Decimal convertido em Number. O rascunho
 * guarda as fotos so pelo `id`: o endereco e lido de novo no servidor.
 *
 * A tela chama estas funcoes a cada mudanca da lista de itens, entao um produto que falta
 * em `produtosPorId` conta como "sem dado" em vez de quebrar.
 */

import {
  blocoItensInclusos,
  codigoDaComposicao,
  estoqueDaComposicao,
  pesoDaComposicao,
  trocarItensInclusos,
  unidadesDaComposicao,
} from "../composicao";
import { pesoEMedidasDoKit } from "../../composicao";

const texto = (valor) => String(valor ?? "").trim();

function itensDaComposicao(composicao) {
  return Array.isArray(composicao?.itens) ? composicao.itens : [];
}

// Valor de um campo de cada item, indexado pelo id do produto, no formato que as contas
// de `composicao.js` pedem (`estoquePorId`, `pesoPorId`, `tituloPorId`).
function campoPorId(itens, produtosPorId, campo) {
  return Object.fromEntries(itens.map((item) => [item.produtoId, produtosPorId?.[item.produtoId]?.[campo]]));
}

// O produto principal vem primeiro, depois os demais itens; dentro de cada produto, a foto
// marcada como principal vem na frente. A mesma foto nao entra duas vezes.
// As fotos proprias do kit (papel KIT do produto principal, `fotosDoKit` do contexto) que o anuncio ja usa, na ordem dele.
function fotosDoKitMarcadas(imagensAtuais, principal) {
  const doKit = new Set((principal?.fotosDoKit ?? []).map((foto) => foto.id));
  return (Array.isArray(imagensAtuais) ? imagensAtuais : []).filter((id) => doKit.has(id));
}

function fotosEmOrdem(idsDosProdutos, produtosPorId) {
  const vistas = new Set();
  const fotos = [];
  for (const produtoId of idsDosProdutos) {
    const imagens = produtosPorId?.[produtoId]?.imagens ?? [];
    for (const imagem of [...imagens.filter((i) => i.principal), ...imagens.filter((i) => !i.principal)]) {
      if (vistas.has(imagem.id)) continue;
      vistas.add(imagem.id);
      fotos.push(imagem.id);
    }
  }
  return fotos;
}

function atributosDoProduto(produto, { comGtin }) {
  const atributos = {};
  // O EAN identifica a peca avulsa: um kit e outro produto, e herdar o GTIN dela o
  // apresentaria ao Mercado Livre como a peca avulsa.
  const valores = { BRAND: produto.marca, MODEL: produto.modelo, ...(comGtin ? { GTIN: produto.ean } : {}) };
  for (const [id, valor] of Object.entries(valores)) {
    if (texto(valor)) atributos[id] = texto(valor);
  }
  return atributos;
}

// O GTIN e o codigo de barras da peca avulsa. Ao virar kit ele sai dos atributos; ao voltar a
// ser anuncio simples, volta o do principal (ou nenhum, se o produto nao tem EAN). O motivo de nao
// ter GTIN (`EMPTY_GTIN_REASON`, fase 2) e do estado anterior ("kit ou pack" no kit, "nao tem
// codigo" no avulso) e sai junto: a ficha poe o certo de novo. Os demais atributos sao do dono.
const DO_CODIGO_DE_BARRAS = new Set(["GTIN", "EMPTY_GTIN_REASON"]);

function atributosSemGtin(atributos) {
  return Object.fromEntries(Object.entries(atributos ?? {}).filter(([id]) => !DO_CODIGO_DE_BARRAS.has(id)));
}

function atributosComGtinDoProduto(atributos, produto) {
  const ean = texto(produto.ean);
  const resto = atributosSemGtin(atributos);
  return ean ? { ...resto, GTIN: ean } : resto;
}

// O que um anuncio simples herda do produto: estoque, fotos, descricao inteira e as medidas
// do envio. Serve ao anuncio novo e a quem desliga a composicao, para os dois nunca divergirem.
// Peso e medidas do kit pela quantidade (pedido do dono em 27/10/2026: "quando for kit os pesos e medidas devem ser
// ajustados para a quantidade do kit; isso ja foi implementado ao criar kit no Rise"): a MESMA regra do kit do cadastro
// de Produto (`pesoEMedidasDoKit`): comprimento e largura da maior peca, altura somada (pecas empilhadas).
const MEDIDAS_DO_KIT = ["comprimentoCm", "larguraCm", "alturaCm"];

function sugestaoDeMedidas(composicao, produtosPorId) {
  const pecas = itensDaComposicao(composicao)
    .filter((item) => item?.produtoId)
    .map((item) => {
      const produto = produtosPorId?.[item.produtoId] ?? {};
      return { sku: produto.sku, quantidade: item.quantidade, pesoKg: produto.pesoKg, comprimentoCm: produto.comprimentoCm, larguraCm: produto.larguraCm, alturaCm: produto.alturaCm };
    });
  return pesoEMedidasDoKit(pecas);
}

const mesmoNumero = (a, b) =>
  a !== null && a !== undefined && a !== "" && b !== null && b !== undefined && Math.abs(Number(a) - Number(b)) < 0.005;

/**
 * As medidas do pacote do kit refeitas pela composicao. O que o dono digitou nao e apagado: o campo so recebe a
 * sugestao quando esta vazio, quando ainda tem a sugestao da composicao anterior ou quando tem a medida de UMA unidade
 * do produto principal (o kit nascia com ela ate 27/10/2026). Peca sem a medida deixa o campo como esta.
 */
export function medidasDoKit(envio, composicao, produtosPorId, composicaoAnterior = null) {
  const nova = sugestaoDeMedidas(composicao, produtosPorId);
  const anterior = composicaoAnterior ? sugestaoDeMedidas(composicaoAnterior, produtosPorId) : {};
  const principal = produtosPorId?.[itensDaComposicao(composicao).find((item) => item?.produtoId)?.produtoId];
  const resultado = { ...envio };
  for (const campo of MEDIDAS_DO_KIT) {
    const sugerido = nova[campo];
    if (sugerido === null || sugerido === undefined) continue;
    const atual = envio?.[campo];
    const vazio = atual === null || atual === undefined || atual === "";
    if (vazio || mesmoNumero(atual, anterior[campo]) || mesmoNumero(atual, principal?.[campo])) resultado[campo] = sugerido;
  }
  return resultado;
}

function estadoDoProdutoSimples(produto, produtosPorId) {
  return {
    estoque: produto.estoque ?? 0,
    imagens: fotosEmOrdem([produto.id], produtosPorId),
    descricao: produto.descricaoBase ?? "",
    pesoKg: produto.pesoKg ?? null,
    alturaCm: produto.alturaCm ?? null,
    larguraCm: produto.larguraCm ?? null,
    comprimentoCm: produto.comprimentoCm ?? null,
  };
}

// `family_name` e obrigatorio no modelo User Products do ML. Sem marca nem modelo,
// o proprio titulo base serve de nome da familia.
function familyNameDoProduto(produto) {
  return [texto(produto.marca), texto(produto.modelo)].filter(Boolean).join(" ") || texto(produto.tituloBase);
}

// Sugestao de partida; o dono edita (a IA melhora isso na fase 2).
function tituloDoKit(principal, itens) {
  const titulo = texto(principal.tituloBase).toUpperCase();
  const unidades = unidadesDaComposicao(itens);
  return itens.length === 1 && unidades > 0 ? `KIT COM ${unidades} ${titulo}` : `KIT ${titulo}`;
}

/**
 * O que deriva dos itens da composicao: estoque, peso, fotos, codigo e o bloco "Itens
 * inclusos" da descricao. Titulo, preco, categoria, atributos e medidas ficam de fora:
 * o dono pode ja te-los editado, e as medidas do pacote de um kit nao saem da soma das pecas.
 */
function camposDaComposicao({ composicao, principalId, produtosPorId, descricaoAtual, imagensAtuais = [] }) {
  const itens = itensDaComposicao(composicao);

  // Kit de um produto so tem codigo certo (`{sku}_{N}`), entao e sempre recalculado. Kit
  // misto nao tem regra: o codigo e o que o dono digitou (e do Bling), vazio ate la.
  const codigo = itens.length === 1
    ? codigoDaComposicao(produtosPorId?.[itens[0].produtoId]?.sku, itens[0].quantidade)
    : texto(composicao.codigo);

  const bloco = blocoItensInclusos(codigo, itens, campoPorId(itens, produtosPorId, "tituloBase"));
  return {
    estoque: estoqueDaComposicao(itens, campoPorId(itens, produtosPorId, "estoque")),
    pesoKg: pesoDaComposicao(itens, campoPorId(itens, produtosPorId, "pesoKg")),
    // As fotos PROPRIAS do kit ja marcadas (enviadas na aba Imagens, 27/10/2026) ficam na frente; as dos itens sao refeitas.
    imagens: [...fotosDoKitMarcadas(imagensAtuais, produtosPorId?.[principalId]), ...fotosEmOrdem([principalId, ...itens.map((item) => item.produtoId)], produtosPorId)],
    // Kit: a descricao e EDITAVEL no anuncio (pedido do dono em 27/10/2026: "quando for KIT a area da descricao pode ser
    // editada"; ate ali era sempre a do principal). O texto do anuncio fica, e so o bloco "Itens inclusos" e refeito com o
    // codigo e as quantidades do kit; vazio, parte da descricao do produto principal.
    descricao: trocarItensInclusos(String(descricaoAtual ?? "").trim() ? descricaoAtual : (produtosPorId?.[principalId]?.descricaoBase ?? ""), bloco),
    composicao: {
      itens: itens.map(({ produtoId, quantidade }) => ({ produtoId, quantidade })),
      codigo,
      blingProdutoId: composicao.blingProdutoId ?? null,
    },
  };
}

/**
 * As fotos do anuncio SIMPLES sao SEMPRE as validadas do produto, a principal primeiro e depois a ordem do cadastro
 * (decisao do dono em 24/10/2026, "igual a LI"). Kit montado no editor: `null`, as fotos sao do anuncio.
 */
export function fotosDoRise(rascunho, produtosPorId) {
  if (itensDaComposicao(rascunho?.composicao).length > 0) return null;
  return fotosEmOrdem([rascunho?.produtoId], produtosPorId);
}

/**
 * O estoque do anuncio e SEMPRE o do Rise (pedido do dono em 22/10/2026: o campo saiu da tela): o do produto ou,
 * no kit, o que as pecas montam. Negativo conta zero. `null` quando o produto nao esta em `produtosPorId`.
 * Abrir e salvar o anuncio usam esta conta, para o numero nunca ficar o de quando o rascunho foi criado.
 */
/**
 * O peso e as medidas do pacote do anuncio SIMPLES sao sempre os do produto (pedido do dono em 26/10/2026, no molde da
 * Loja Integrada: a aba so os mostra, e o cadastro e onde se mudam). O kit monta os dele, editaveis: devolve null e o
 * rascunho fica como esta.
 */
export function pacoteDoRise(rascunho, produtosPorId) {
  if (rascunho?.composicao) return null;
  const produto = produtosPorId?.[rascunho?.produtoId];
  if (!produto) return null;
  return { pesoKg: produto.pesoKg ?? null, alturaCm: produto.alturaCm ?? null, larguraCm: produto.larguraCm ?? null, comprimentoCm: produto.comprimentoCm ?? null };
}

export function estoqueDoRise(rascunho, produtosPorId) {
  const itens = itensDaComposicao(rascunho?.composicao);
  if (itens.length > 0) {
    if (itens.some((item) => !produtosPorId?.[item.produtoId])) return null;
    return estoqueDaComposicao(itens, campoPorId(itens, produtosPorId, "estoque"));
  }
  const produto = produtosPorId?.[rascunho?.produtoId];
  if (!produto) return null;
  return Math.max(0, Math.trunc(Number(produto.estoque) || 0));
}

/**
 * A descricao do anuncio SIMPLES e SEMPRE a do produto (pedido do dono em 22/10/2026: o editor nao a altera). No kit
 * (desde 27/10/2026) e a do proprio anuncio, editavel, com o bloco "Itens inclusos" refeito pelo codigo e pelas
 * quantidades do kit; vazia, parte da do principal. `null` quando falta algum produto em `produtosPorId`. Abrir e
 * salvar usam esta conta, como o estoque.
 */
export function descricaoDoRise(rascunho, produtosPorId) {
  const principal = produtosPorId?.[rascunho?.produtoId];
  if (!principal) return null;
  const itens = itensDaComposicao(rascunho.composicao);
  if (itens.length === 0) return principal.descricaoBase ?? "";
  if (itens.some((item) => !produtosPorId?.[item.produtoId])) return null;
  return camposDaComposicao({ composicao: rascunho.composicao, principalId: principal.id ?? rascunho.produtoId, produtosPorId, descricaoAtual: rascunho.descricao }).descricao;
}

/**
 * Rascunho de um anuncio novo. `principal` e o produto que abriu o anuncio (o primeiro item,
 * numa composicao); `composicao` e `{ itens, codigo, blingProdutoId }` ou `null` (simples).
 * O preco do kit nasce em branco: nao sai da soma das pecas, e o dono decide pela margem.
 */
export function rascunhoInicial({ principal, produtosPorId, composicao }) {
  // O principal e sempre conhecido, mesmo que o chamador nao o tenha posto no mapa.
  const produtos = { ...produtosPorId, [principal.id]: principal };
  const { estoque, imagens, descricao, ...medidas } = estadoDoProdutoSimples(principal, produtos);

  const rascunho = {
    produtoId: principal.id,
    titulo: principal.tituloBase ?? "",
    familyName: familyNameDoProduto(principal),
    tipoAnuncio: "gold_special",
    condicao: "new",
    // Prazo de disponibilidade (pedido do dono em 26/10/2026): 1 dia de padrao.
    prazoDisponibilidadeDias: 1,
    categoriaId: null,
    // So para mostrar: o nome que veio com a sugestao. Digitar o codigo a mao apaga o nome.
    categoriaNome: null,
    preco: composicao ? null : (principal.precoVenda ?? null),
    estoque,
    imagens,
    descricao,
    atributos: atributosDoProduto(principal, { comGtin: !composicao }),
    envio: {
      ...medidas,
      modo: "me2",
      logistica: "xd_drop_off",
      freteGratis: false,
      retirada: false,
    },
    composicao: null,
  };
  if (!composicao) return rascunho;

  const { pesoKg, ...derivados } = camposDaComposicao({
    composicao,
    principalId: principal.id,
    produtosPorId: produtos,
    descricaoAtual: rascunho.descricao,
  });
  return {
    ...rascunho,
    ...derivados,
    titulo: tituloDoKit(principal, itensDaComposicao(composicao)),
    envio: medidasDoKit({ ...rascunho.envio, pesoKg }, composicao, produtos),
  };
}

// O dono desligou a composicao: o texto do kit falava de outro conteudo, entao a descricao
// volta inteira da base do principal, junto com estoque, fotos, peso, medidas e GTIN dele.
function voltarAoPrincipal(rascunho, produtosPorId) {
  const principal = produtosPorId?.[rascunho.produtoId];
  // Sem o produto nao ha o que restaurar; ao menos o anuncio deixa de ser kit.
  if (!principal) return { ...rascunho, composicao: null };

  const { estoque, imagens, descricao, ...medidas } = estadoDoProdutoSimples(principal, produtosPorId);
  return {
    ...rascunho,
    estoque,
    imagens,
    descricao,
    atributos: atributosComGtinDoProduto(rascunho.atributos, principal),
    envio: { ...rascunho.envio, ...medidas },
    composicao: null,
  };
}

/**
 * Aplica ao rascunho uma composicao nova (a lista de itens mudou) e devolve outro rascunho.
 * O produto do anuncio passa a ser o primeiro item que ja tem produto, e o kit perde o GTIN.
 * Com `composicao` `null`, o anuncio volta a ser simples, do produto que ele tinha, com o GTIN dele.
 */
export function aplicarComposicao(rascunho, composicao, produtosPorId) {
  if (!composicao) return voltarAoPrincipal(rascunho, produtosPorId);

  // A tela chama a cada tecla, e a linha 1 pode estar sem produto por um instante: o anuncio
  // nao pode ficar sem produto, senao desligar a composicao depois nao teria a que voltar.
  const principalId = itensDaComposicao(composicao).find((item) => item?.produtoId)?.produtoId ?? rascunho.produtoId;
  const { pesoKg, ...derivados } = camposDaComposicao({
    composicao,
    principalId,
    produtosPorId,
    descricaoAtual: rascunho.descricao,
    imagensAtuais: rascunho.imagens,
  });
  return {
    ...rascunho,
    ...derivados,
    produtoId: principalId,
    atributos: atributosSemGtin(rascunho.atributos),
    envio: medidasDoKit({ ...rascunho.envio, pesoKg }, composicao, produtosPorId, rascunho.composicao),
  };
}

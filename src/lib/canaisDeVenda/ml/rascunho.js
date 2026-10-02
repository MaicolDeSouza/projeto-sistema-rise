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
// ser anuncio simples, volta o do principal (ou nenhum, se o produto nao tem EAN). Os demais
// atributos sao do dono e ficam como estao.
function atributosSemGtin(atributos) {
  return Object.fromEntries(Object.entries(atributos ?? {}).filter(([id]) => id !== "GTIN"));
}

function atributosComGtinDoProduto(atributos, produto) {
  const ean = texto(produto.ean);
  const resto = atributosSemGtin(atributos);
  return ean ? { ...resto, GTIN: ean } : resto;
}

// O que um anuncio simples herda do produto: estoque, fotos, descricao inteira e as medidas
// do envio. Serve ao anuncio novo e a quem desliga a composicao, para os dois nunca divergirem.
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

// O versiculo do banco traz `id` e `ordem`; o rascunho guarda so o que a descricao usa.
function versiculoDoRascunho(versiculo) {
  if (!versiculo) return null;
  return {
    livro: versiculo.livro,
    capitulo: versiculo.capitulo,
    inicio: versiculo.inicio,
    fim: versiculo.fim ?? versiculo.inicio,
    texto: versiculo.texto,
  };
}

/**
 * O que deriva dos itens da composicao: estoque, peso, fotos, codigo e o bloco "Itens
 * inclusos" da descricao. Titulo, preco, categoria, atributos e medidas ficam de fora:
 * o dono pode ja te-los editado, e as medidas do pacote de um kit nao saem da soma das pecas.
 */
function camposDaComposicao({ composicao, principalId, produtosPorId, descricaoAtual }) {
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
    imagens: fotosEmOrdem([principalId, ...itens.map((item) => item.produtoId)], produtosPorId),
    descricao: trocarItensInclusos(descricaoAtual, bloco),
    composicao: {
      itens: itens.map(({ produtoId, quantidade }) => ({ produtoId, quantidade })),
      codigo,
      blingProdutoId: composicao.blingProdutoId ?? null,
    },
  };
}

/**
 * Rascunho de um anuncio novo. `principal` e o produto que abriu o anuncio (o primeiro item,
 * numa composicao); `composicao` e `{ itens, codigo, blingProdutoId }` ou `null` (simples).
 * O preco do kit nasce em branco: nao sai da soma das pecas, e o dono decide pela margem.
 */
export function rascunhoInicial({ principal, produtosPorId, composicao, versiculo }) {
  // O principal e sempre conhecido, mesmo que o chamador nao o tenha posto no mapa.
  const produtos = { ...produtosPorId, [principal.id]: principal };
  const { estoque, imagens, descricao, ...medidas } = estadoDoProdutoSimples(principal, produtos);

  const rascunho = {
    produtoId: principal.id,
    titulo: principal.tituloBase ?? "",
    familyName: familyNameDoProduto(principal),
    tipoAnuncio: "gold_special",
    condicao: "new",
    categoriaId: null,
    preco: composicao ? null : (principal.precoVenda ?? null),
    estoque,
    imagens,
    descricao,
    versiculo: versiculoDoRascunho(versiculo),
    atributos: atributosDoProduto(principal, { comGtin: !composicao }),
    envio: {
      ...medidas,
      modo: "me2",
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
    envio: { ...rascunho.envio, pesoKg },
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
  });
  return {
    ...rascunho,
    ...derivados,
    produtoId: principalId,
    atributos: atributosSemGtin(rascunho.atributos),
    envio: { ...rascunho.envio, pesoKg },
  };
}

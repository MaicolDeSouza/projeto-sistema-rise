/**
 * Validacao do rascunho de um anuncio do Mercado Livre: o que impede publicar
 * (`bloqueante: true`) e o que e so alerta. Funcao pura, sem banco nem rede: a aba Previa,
 * os pontos vermelhos das abas e o botao Publicar leem a mesma lista.
 *
 * Problema nao impede SALVAR: rascunho incompleto e permitido. So impede publicar.
 *
 * Cada problema e `{ campo, aba, problema, bloqueante }`. `aba` e um id de `ABAS_ML`;
 * `campo` diz qual campo da aba acusa (o editor mostra a mensagem embaixo dele).
 */

import { LIMITE_TITULO } from "../../anuncios/canais/mercadolivre";
import { errosDaComposicao } from "../composicao";
import { problemasDosAtributos } from "./atributos";

export const ABAS_ML = [
  { id: "geral", rotulo: "Geral" },
  { id: "preco", rotulo: "Preço e estoque" },
  { id: "imagens", rotulo: "Imagens" },
  { id: "descricao", rotulo: "Descrição" },
  { id: "ficha", rotulo: "Ficha técnica" },
  { id: "envio", rotulo: "Envio" },
  { id: "previa", rotulo: "Prévia e validação" },
];

// Categoria do ML e o codigo (MLB1234), digitado nesta fase.
const FORMATO_DA_CATEGORIA = /^MLB\d+$/;

const texto = (valor) => String(valor ?? "").trim();

// Ausente, zerado ou quebrado vale como "nao informado".
function positivo(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

/**
 * Nomes das medidas do envio que faltam, na ordem altura, largura, comprimento, peso. A
 * validacao acusa a falta e `payload.js` so monta `shipping.dimensions` quando a lista e
 * vazia: as duas leem esta regra, para a previa nunca discordar da aba Envio.
 */
export function medidasFaltando(envio) {
  return [
    ["altura", envio?.alturaCm],
    ["largura", envio?.larguraCm],
    ["comprimento", envio?.comprimentoCm],
    ["peso", envio?.pesoKg],
  ]
    .filter(([, valor]) => positivo(valor) === null)
    .map(([nome]) => nome);
}

/**
 * A categoria lida do ML (`contexto.categoria`, fase 2) so vale se for a do codigo que esta no
 * rascunho: o dono pode ter trocado o codigo e a leitura nova ainda nao ter chegado.
 */
function categoriaLida(rascunho, contexto) {
  const categoria = contexto?.categoria;
  return categoria && categoria.id === texto(rascunho.categoriaId) ? categoria : null;
}

/** Limite do titulo: o da categoria lida do ML, ou os 60 de sempre enquanto ela nao chega. */
export function limiteDoTitulo(rascunho, contexto) {
  const limite = Number(categoriaLida(rascunho, contexto)?.limiteTitulo);
  return limite > 0 ? limite : LIMITE_TITULO;
}

const emTexto = (numero) => String(numero).replace(".", ",");
// 0,035 kg * 1000 da 35,00000000000001: comparar com folga, e nao com `Number.isInteger`.
const quebrado = (numero) => Math.abs(numero - Math.round(numero)) > 1e-9;

/**
 * O Mercado Envios recebe as medidas do pacote em inteiros (cm e g, investigacao A7): a
 * publicacao arredonda os cm para cima e o peso para o grama mais perto. A lista diz o que muda.
 */
function arredondamentosDoEnvio(envio) {
  const mudancas = [];
  for (const [nome, valor] of [["altura", envio?.alturaCm], ["largura", envio?.larguraCm], ["comprimento", envio?.comprimentoCm]]) {
    const numero = positivo(valor);
    if (numero !== null && quebrado(numero)) mudancas.push(`${nome} ${emTexto(numero)} cm → ${Math.ceil(numero)} cm`);
  }
  const quilos = positivo(envio?.pesoKg);
  if (quilos !== null && quebrado(quilos * 1000)) mudancas.push(`peso ${emTexto(quilos)} kg → ${Math.round(quilos * 1000)} g`);
  return mudancas;
}

/**
 * @param {object} rascunho rascunho do anuncio (ver `rascunho.js`)
 * @param {{produtos: object, codigoEmUso: string|null, categoria?: object, categoriaErro?: string|null}} contexto
 *   `produtos`: contexto de produto por id; `codigoEmUso`: quem ja usa o codigo do kit
 *   (a acao do servidor confere no banco), ou `null`. `categoria` e a categoria lida do ML
 *   (`lerCategoriaCompleta`), e `categoriaErro` o motivo de ela nao ter sido lida.
 * @returns {{campo: string, aba: string, problema: string, bloqueante: boolean}[]}
 */
export function validarRascunhoML(rascunho, contexto) {
  const problemas = [];
  const acrescentar = (campo, aba, problema, bloqueante = true) => problemas.push({ campo, aba, problema, bloqueante });
  const composicao = rascunho.composicao ?? null;
  const envio = rascunho.envio ?? {};
  const lida = categoriaLida(rascunho, contexto);

  // Geral
  const titulo = texto(rascunho.titulo);
  const limite = limiteDoTitulo(rascunho, contexto);
  if (!titulo) {
    acrescentar("titulo", "geral", "O título é obrigatório.");
  } else if (titulo.length > limite) {
    acrescentar("titulo", "geral", `O título tem ${titulo.length} caracteres; o limite do Mercado Livre é ${limite}.`);
  }

  // `family_name` e obrigatorio no modelo User Products, que e o desta conta.
  if (!texto(rascunho.familyName)) {
    acrescentar("familyName", "geral", "Informe o nome da família (family_name), obrigatório no modelo User Products.");
  }

  const categoria = texto(rascunho.categoriaId);
  if (!categoria) {
    acrescentar("categoria", "geral", "Escolha a categoria do Mercado Livre.");
  } else if (!FORMATO_DA_CATEGORIA.test(categoria)) {
    acrescentar("categoria", "geral", "A categoria deve ser o código do Mercado Livre: MLB seguido de números (por exemplo, MLB1234).");
  } else if (lida?.folha === false) {
    // O ML so aceita anuncio em categoria final (sem subcategorias).
    acrescentar("categoria", "geral", "Esta categoria não é final: escolha uma subcategoria.");
  } else if (!lida && texto(contexto?.categoriaErro)) {
    acrescentar("categoria", "geral", `Categoria não conferida no Mercado Livre: ${texto(contexto.categoriaErro)}`, false);
  }

  // So produto Conferido entra num anuncio. Numa composicao o que conta sao os itens (o
  // principal e o primeiro deles); no anuncio simples, o proprio produto do anuncio.
  const aVerificar = composicao
    ? (Array.isArray(composicao.itens) ? composicao.itens : []).filter((item) => item?.produtoId).map((item) => item.produtoId)
    : [rascunho.produtoId];
  for (const produtoId of aVerificar) {
    const produto = contexto?.produtos?.[produtoId];
    const campoDoProduto = composicao ? `item:${produtoId}` : "produto";
    const campoDoBling = composicao ? `item:${produtoId}` : "blingId";
    // Nome para a frase: o item de um kit precisa dizer qual e, o anuncio simples nao.
    const quem = composicao ? `O item ${produto?.sku ?? ""}`.trim() : "Este produto";

    if (!produto) {
      acrescentar(campoDoProduto, "geral", `${composicao ? "Um dos produtos da composição" : "O produto do anúncio"} não foi encontrado: ele pode ter sido excluído.`);
      continue;
    }
    if (produto.conferido !== true) {
      acrescentar(campoDoProduto, "geral", `${quem} não está Conferido. Só produto Conferido vira anúncio.`);
    }
    if (!texto(produto.blingId)) {
      acrescentar(
        campoDoBling,
        "geral",
        composicao ? `${quem} está sem blingId: o anúncio não poderá ser publicado.` : "Produto sem blingId: o anúncio não poderá ser publicado.",
      );
    }
  }

  if (composicao) {
    for (const erro of errosDaComposicao(composicao.itens)) acrescentar("composicao", "geral", erro);

    const codigo = texto(composicao.codigo);
    if (!codigo) {
      acrescentar("codigoKit", "geral", "Informe o código do kit.");
    } else if (contexto?.codigoEmUso) {
      acrescentar("codigoKit", "geral", `O código ${codigo} já está em uso: ${contexto.codigoEmUso}.`);
    }
  }

  // Preco e estoque
  if (positivo(rascunho.preco) === null) {
    acrescentar("preco", "preco", "Informe o preço de venda.");
  }

  // Campo em branco nao e estoque zero: `Number("")` daria 0 e passaria como alerta.
  const estoque = texto(rascunho.estoque) === "" ? NaN : Number(rascunho.estoque);
  if (!Number.isInteger(estoque) || estoque < 0) {
    acrescentar("estoque", "preco", "O estoque deve ser um número inteiro, zero ou maior.");
  } else if (estoque === 0) {
    acrescentar("estoque", "preco", "Estoque zerado: o anúncio seria publicado sem disponibilidade.", false);
  }

  // Imagens
  const quantasFotos = Array.isArray(rascunho.imagens) ? rascunho.imagens.length : 0;
  if (quantasFotos === 0) {
    acrescentar("imagens", "imagens", "O anúncio precisa de ao menos uma imagem.");
  } else if (Number(lida?.maxFotos) > 0 && quantasFotos > lida.maxFotos) {
    acrescentar("imagens", "imagens", `O anúncio tem ${quantasFotos} fotos; esta categoria aceita até ${lida.maxFotos}.`);
  }
  if (composicao) {
    // O envio de fotos proprias do kit e da fase 3; ate la o kit mostra as dos itens.
    acrescentar("fotosDoKit", "imagens", "O kit está usando as fotos dos itens. O Mercado Livre pede fotos próprias do kit; o envio delas entra na fase 3.", false);
  }

  // Descricao
  if (!texto(rascunho.descricao)) {
    acrescentar("descricao", "descricao", "A descrição é obrigatória.");
  }

  // Ficha tecnica. Com a categoria lida, valem os atributos DELA (obrigatorios, listas, GTIN ou o
  // motivo de nao ter). Sem ela, so o aviso da fase 1: o GTIN e da peca avulsa, e o kit nao o tem.
  if (lida) {
    for (const item of problemasDosAtributos(rascunho.atributos, lida.atributos ?? [], { kit: Boolean(composicao) })) {
      acrescentar(item.campo, "ficha", item.problema, item.bloqueante);
    }
  } else if (!composicao && !texto(rascunho.atributos?.GTIN)) {
    acrescentar("GTIN", "ficha", "Sem GTIN (código de barras). A maioria das categorias de eletrônicos exige o código universal.", false);
  }

  // Envio
  const faltando = medidasFaltando(envio);
  if (faltando.includes("peso")) {
    acrescentar("peso", "envio", "Informe o peso do pacote em kg: o Mercado Envios precisa dele.");
  }
  const semMedida = faltando.filter((nome) => nome !== "peso");
  if (semMedida.length > 0) {
    acrescentar("dimensoes", "envio", `Informe as medidas do pacote em cm. Faltam: ${semMedida.join(", ")}.`);
  }
  const arredondamentos = arredondamentosDoEnvio(envio);
  if (arredondamentos.length > 0) {
    acrescentar("arredondamento", "envio", `O Mercado Envios recebe inteiros: ${arredondamentos.join(", ")}.`, false);
  }

  return problemas;
}

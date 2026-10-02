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
import { cabeNaDescricao, linhaDoVersiculo } from "../versiculos";
import { restoDaDescricao } from "./descricao";

export const ABAS_ML = [
  { id: "geral", rotulo: "Geral" },
  { id: "preco", rotulo: "Preco e estoque" },
  { id: "imagens", rotulo: "Imagens" },
  { id: "descricao", rotulo: "Descricao" },
  { id: "ficha", rotulo: "Ficha tecnica" },
  { id: "envio", rotulo: "Envio" },
  { id: "previa", rotulo: "Previa e validacao" },
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
 * @param {object} rascunho rascunho do anuncio (ver `rascunho.js`)
 * @param {{produtos: object, frases: string[], codigoEmUso: string|null}} contexto
 *   `produtos`: contexto de produto por id; `codigoEmUso`: quem ja usa o codigo do kit
 *   (a acao do servidor confere no banco), ou `null`.
 * @returns {{campo: string, aba: string, problema: string, bloqueante: boolean}[]}
 */
export function validarRascunhoML(rascunho, contexto) {
  const problemas = [];
  const acrescentar = (campo, aba, problema, bloqueante = true) => problemas.push({ campo, aba, problema, bloqueante });
  const composicao = rascunho.composicao ?? null;
  const envio = rascunho.envio ?? {};

  // Geral
  const titulo = texto(rascunho.titulo);
  if (!titulo) {
    acrescentar("titulo", "geral", "O titulo e obrigatorio.");
  } else if (titulo.length > LIMITE_TITULO) {
    acrescentar("titulo", "geral", `O titulo tem ${titulo.length} caracteres; o limite do Mercado Livre e ${LIMITE_TITULO}.`);
  }

  // `family_name` e obrigatorio no modelo User Products, que e o desta conta.
  if (!texto(rascunho.familyName)) {
    acrescentar("familyName", "geral", "Informe o nome da familia (family_name), obrigatorio no modelo User Products.");
  }

  const categoria = texto(rascunho.categoriaId);
  if (!categoria) {
    acrescentar("categoria", "geral", "Escolha a categoria do Mercado Livre.");
  } else if (!FORMATO_DA_CATEGORIA.test(categoria)) {
    acrescentar("categoria", "geral", "A categoria deve ser o codigo do Mercado Livre: MLB seguido de numeros (por exemplo, MLB1234).");
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
      acrescentar(campoDoProduto, "geral", `${composicao ? "Um dos produtos da composicao" : "O produto do anuncio"} nao foi encontrado: ele pode ter sido excluido.`);
      continue;
    }
    if (produto.conferido !== true) {
      acrescentar(campoDoProduto, "geral", `${quem} nao esta Conferido. So produto Conferido vira anuncio.`);
    }
    if (!texto(produto.blingId)) {
      acrescentar(
        campoDoBling,
        "geral",
        composicao ? `${quem} esta sem blingId: o anuncio nao podera ser publicado.` : "Produto sem blingId: o anuncio nao podera ser publicado.",
      );
    }
  }

  if (composicao) {
    for (const erro of errosDaComposicao(composicao.itens)) acrescentar("composicao", "geral", erro);

    const codigo = texto(composicao.codigo);
    if (!codigo) {
      acrescentar("codigoKit", "geral", "Informe o codigo do kit.");
    } else if (contexto?.codigoEmUso) {
      acrescentar("codigoKit", "geral", `O codigo ${codigo} ja esta em uso: ${contexto.codigoEmUso}.`);
    }
  }

  // Preco e estoque
  if (positivo(rascunho.preco) === null) {
    acrescentar("preco", "preco", "Informe o preco de venda.");
  }

  // Campo em branco nao e estoque zero: `Number("")` daria 0 e passaria como alerta.
  const estoque = texto(rascunho.estoque) === "" ? NaN : Number(rascunho.estoque);
  if (!Number.isInteger(estoque) || estoque < 0) {
    acrescentar("estoque", "preco", "O estoque deve ser um numero inteiro, zero ou maior.");
  } else if (estoque === 0) {
    acrescentar("estoque", "preco", "Estoque zerado: o anuncio seria publicado sem disponibilidade.", false);
  }

  // Imagens
  if (!Array.isArray(rascunho.imagens) || rascunho.imagens.length === 0) {
    acrescentar("imagens", "imagens", "O anuncio precisa de ao menos uma imagem.");
  }
  if (composicao) {
    // O envio de fotos proprias do kit e da fase 3; ate la o kit mostra as dos itens.
    acrescentar("fotosDoKit", "imagens", "O kit esta usando as fotos dos itens. O Mercado Livre pede fotos proprias do kit; o envio delas entra na fase 3.", false);
  }

  // Descricao
  if (!texto(rascunho.descricao)) {
    acrescentar("descricao", "descricao", "A descricao e obrigatoria.");
  }
  if (!rascunho.versiculo) {
    acrescentar("versiculo", "descricao", "O anuncio esta sem versiculo na descricao.", false);
  } else {
    const resto = restoDaDescricao({ descricao: rascunho.descricao, frases: contexto?.frases });
    if (!cabeNaDescricao(linhaDoVersiculo(rascunho.versiculo), resto)) {
      acrescentar("versiculo", "descricao", "O versiculo passa de 25% da descricao: a NVI pede que a citacao fique abaixo disso. Aumente o texto ou troque o versiculo.");
    }
  }

  // Ficha tecnica. O GTIN e o codigo de barras da peca avulsa: o kit nao o tem.
  if (!composicao && !texto(rascunho.atributos?.GTIN)) {
    acrescentar("GTIN", "ficha", "Sem GTIN (codigo de barras). A maioria das categorias de eletronicos exige o codigo universal.", false);
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

  return problemas;
}

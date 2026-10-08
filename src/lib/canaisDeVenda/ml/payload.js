/**
 * Previa do que seria enviado ao Mercado Livre: o corpo do item, a descricao, o preco e os
 * nomes das fotos. Funcoes puras, sem rede: o editor mostra o resultado na aba Previa e a
 * publicacao (fase 3) parte do mesmo objeto, entao tela e envio nunca divergem.
 *
 * Segue o `montarPayload` de `src/lib/anuncios/canais/mercadolivre.js` (o menu Anuncios
 * ainda o usa) e acrescenta o que o editor novo guarda: SKU, envio e fotos por nome.
 */

import { LIMITE_TITULO } from "../../anuncios/canais/mercadolivre";
import { montarDescricaoML } from "./descricao";
import { medidasFaltando } from "./validacao";

const LIMITE_DO_NOME_DA_FOTO = 60;

const texto = (valor) => String(valor ?? "").trim();
const maiusculas = (valor) => texto(valor).toLocaleUpperCase("pt-BR");

// Marca e Modelo sao sempre MAIUSCULAS no sistema (padrao de dado do CLAUDE.md). A aba Ficha
// tecnica ja converte ao digitar; aqui e a segunda barreira, para o que nao veio da tela (um
// rascunho gravado antes, um produto que trouxe "Arduino") nunca seguir ao ML em caixa mista.
const EM_MAIUSCULAS = new Set(["BRAND", "MODEL"]);

/**
 * Nome legivel da foto no envio ao ML: o titulo sem acento, em minusculas, com `-` no lugar
 * de tudo que nao e letra ou numero, e `-{n}.jpg` no fim (n conta a partir de 1).
 */
export function nomeDaFoto(titulo, indice) {
  const nome = texto(titulo)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITE_DO_NOME_DA_FOTO)
    // O corte pode ter parado logo depois de um `-`.
    .replace(/-+$/, "");
  // Titulo so de simbolos nao pode virar "-1.jpg".
  return `${nome || "anuncio"}-${indice + 1}.jpg`;
}

// "{altura}x{largura}x{comprimento},{gramas}" em `shipping.dimensions`: so no ME1, e so em INTEIROS (cm
// para cima, gramas arredondados). No primeiro Publicar real (08/10/2026) o validador do ML recusou o
// campo com decimais ("Dimensions do not follow the pattern 20x30x40,50") e avisou que a conta nao tem
// ME1: no ME2, o modo da conta, as medidas vao so nos SELLER_PACKAGE_* (investigacao A7).
// Sem uma das quatro medidas o campo fica de fora: um valor pela metade seria recusado.
function dimensoesDoEnvio(envio) {
  if (envio?.modo !== "me1" || medidasFaltando(envio).length > 0) return null;
  const cm = (valor) => Math.ceil(Number(valor));
  return `${cm(envio.alturaCm)}x${cm(envio.larguraCm)}x${cm(envio.comprimentoCm)},${Math.round(Number(envio.pesoKg) * 1000)}`;
}

/**
 * As medidas do pacote para o ME2 em coleta/agencia (`SELLER_PACKAGE_*`, investigacao A7): so
 * inteiros, em cm e g, e o ML recusa decimal. Os cm sobem (uma caixa de 5,5 cm nao cabe em 5) e o
 * peso vai ao grama mais perto. Sem uma das quatro medidas nao vai nenhuma, como `dimensions`.
 */
function atributosDaEmbalagem(envio) {
  if (medidasFaltando(envio).length > 0) return [];
  return [
    { id: "SELLER_PACKAGE_HEIGHT", value_name: `${Math.ceil(Number(envio.alturaCm))} cm` },
    { id: "SELLER_PACKAGE_WIDTH", value_name: `${Math.ceil(Number(envio.larguraCm))} cm` },
    { id: "SELLER_PACKAGE_LENGTH", value_name: `${Math.ceil(Number(envio.comprimentoCm))} cm` },
    { id: "SELLER_PACKAGE_WEIGHT", value_name: `${Math.round(Number(envio.pesoKg) * 1000)} g` },
  ];
}

/**
 * @param {object} rascunho rascunho do anuncio (ver `rascunho.js`)
 * @param {{produtos: object, frases: string[]}} contexto produtos por id e frases fixas do canal
 */
export function montarPayloadML(rascunho, contexto) {
  const titulo = texto(rascunho.titulo);
  const envio = rascunho.envio ?? {};
  const dimensions = dimensoesDoEnvio(envio);

  // O SKU do anuncio e o codigo do kit, quando ha composicao; senao, o do produto.
  const sku = rascunho.composicao ? texto(rascunho.composicao.codigo) : texto(contexto?.produtos?.[rascunho.produtoId]?.sku);

  // GTIN e o codigo de barras da peca avulsa, e kit nao o leva: a tela o tira ao virar kit, mas o
  // servidor grava o que chegar, e a previa e o envio saem daqui.
  // Com GTIN, o motivo de nao ter GTIN nao vai: os dois juntos se contradizem.
  const levaGtin = !rascunho.composicao && Boolean(texto(rascunho.atributos?.GTIN));
  const atributos = Object.entries(rascunho.atributos ?? {})
    .filter(
      ([id, valor]) =>
        id !== "SELLER_SKU" &&
        !id.startsWith("SELLER_PACKAGE_") &&
        !(rascunho.composicao && id === "GTIN") &&
        !(levaGtin && id === "EMPTY_GTIN_REASON") &&
        texto(valor),
    )
    .map(([id, valor]) => ({ id, value_name: EM_MAIUSCULAS.has(id) ? maiusculas(valor) : texto(valor) }));
  if (sku) atributos.push({ id: "SELLER_SKU", value_name: sku });
  atributos.push(...atributosDaEmbalagem(envio));

  const fotos = (rascunho.imagens ?? []).map((arquivoId, indice) => ({ arquivoId, nome: nomeDaFoto(titulo, indice) }));

  return {
    item: {
      // Modelo User Products (a conta tem a tag `user_product_seller`): o ML RECUSA `title` no POST e
      // gera o titulo a partir do `family_name` e dos atributos. Por decisao do dono (08/10/2026), o
      // "Titulo" do editor e o que vai como `family_name`, no limite de titulo da categoria.
      family_name: titulo.slice(0, LIMITE_TITULO),
      category_id: texto(rascunho.categoriaId) || null,
      // O preco vai na criacao: a documentacao (26/02/2026) diz que criar e editar continua pela
      // `/items`; o "editar preco standard" ainda nao existe.
      price: Number(rascunho.preco ?? 0),
      available_quantity: Number(rascunho.estoque ?? 0),
      currency_id: "BRL",
      buying_mode: "buy_it_now",
      listing_type_id: rascunho.tipoAnuncio ?? "gold_special",
      condition: rascunho.condicao ?? "new",
      // Publica pausado: falha no meio da sequencia nao deixa anuncio incompleto no ar.
      status: "paused",
      // A previa mostra os nomes; a publicacao sobe as fotos ANTES de criar o item e troca os nomes
      // pelos ids que o ML devolveu (`corpoDaCriacao`, em respostas.js).
      pictures: fotos.map(({ nome }) => ({ nome })),
      attributes: atributos,
      shipping: {
        mode: envio.modo ?? "me2",
        logistic_type: envio.logistica ?? "xd_drop_off",
        free_shipping: Boolean(envio.freteGratis),
        local_pick_up: Boolean(envio.retirada),
        ...(dimensions ? { dimensions } : {}),
      },
    },
    descricao: {
      plain_text: montarDescricaoML({ descricao: rascunho.descricao, frases: contexto?.frases }),
    },
    preco: { amount: Number(rascunho.preco ?? 0), currency_id: "BRL" },
    fotos,
  };
}

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

// "{altura}x{largura}x{comprimento},{gramas}", como o ML pede em `shipping.dimensions`.
// Sem uma das quatro medidas o campo fica de fora: um valor pela metade seria recusado.
// Quem diz o que falta e a validacao (aba Envio), para a previa nunca discordar dela.
function dimensoesDoEnvio(envio) {
  if (medidasFaltando(envio).length > 0) return null;
  return `${Number(envio.alturaCm)}x${Number(envio.larguraCm)}x${Number(envio.comprimentoCm)},${Math.round(Number(envio.pesoKg) * 1000)}`;
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

  const atributos = Object.entries(rascunho.atributos ?? {})
    .filter(([id, valor]) => id !== "SELLER_SKU" && texto(valor))
    .map(([id, valor]) => ({ id, value_name: texto(valor) }));
  if (sku) atributos.push({ id: "SELLER_SKU", value_name: sku });

  const fotos = (rascunho.imagens ?? []).map((arquivoId, indice) => ({ arquivoId, nome: nomeDaFoto(titulo, indice) }));

  return {
    item: {
      title: titulo.slice(0, LIMITE_TITULO),
      category_id: texto(rascunho.categoriaId) || null,
      family_name: texto(rascunho.familyName),
      available_quantity: Number(rascunho.estoque ?? 0),
      currency_id: "BRL",
      listing_type_id: rascunho.tipoAnuncio ?? "gold_special",
      condition: rascunho.condicao ?? "new",
      // Publica pausado: falha no meio da sequencia nao deixa anuncio incompleto no ar.
      status: "paused",
      // Por enquanto so os nomes: o envio binario das fotos e da fase 3, e o ML devolve
      // o id de cada uma, que entra aqui no lugar do nome.
      pictures: fotos.map(({ nome }) => ({ nome })),
      attributes: atributos,
      shipping: {
        mode: envio.modo ?? "me2",
        free_shipping: Boolean(envio.freteGratis),
        local_pick_up: Boolean(envio.retirada),
        ...(dimensions ? { dimensions } : {}),
      },
      // Sem `price`: desde marco de 2026 o preco vai em `POST /items/{id}/prices/standard`.
    },
    descricao: {
      plain_text: montarDescricaoML({ descricao: rascunho.descricao, frases: contexto?.frases, versiculo: rascunho.versiculo }),
    },
    preco: { amount: Number(rascunho.preco ?? 0), currency_id: "BRL" },
    fotos,
  };
}

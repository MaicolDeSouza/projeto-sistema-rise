import path from "node:path";

import sharp from "sharp";

import { prisma } from "@/lib/db";
import { estoqueDosFornecedores } from "@/lib/estoqueDoFornecedor";
import { bytesDe } from "@/lib/imagensImportadas";

/**
 * O que o PDF do pedido precisa alem do banco do pedido (pedido do dono em 06/11/2026): o logo da 4hobby, a FOTO do
 * produto na lista do fornecedor (a miniatura da coleta, a mesma da aba Fornecedores do produto) e, no fornecedor
 * estrangeiro, o preco em DOLAR sem o fator de importacao.
 *
 * Nada aqui derruba o PDF: foto que nao baixa sai em branco, e sem cotacao o preco em dolar cai na cotacao fixa.
 */

const LADO_DA_FOTO = 96;
const PARALELO = 6;

let logoEmCache = null;

/** O logo (engrenagem com o "4") em PNG, lido uma vez do mesmo SVG da tela. */
export async function logoDaEmpresa() {
  if (logoEmCache) return logoEmCache;
  try {
    logoEmCache = await sharp(path.join(process.cwd(), "public", "marcas", "4hobby.svg"), { density: 300 })
      .resize(240, 240, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
  } catch {
    logoEmCache = null;
  }
  return logoEmCache;
}

/** A foto em JPEG pequeno sobre branco: o pdfkit so desenha JPEG e PNG, e a lista traz WebP e fotos de 1 MB. */
async function fotoParaPdf(endereco) {
  try {
    const bytes = await bytesDe({ tipo: "endereco", endereco });
    return await sharp(bytes)
      .resize(LADO_DA_FOTO, LADO_DA_FOTO, { fit: "contain", background: "#ffffff" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    return null;
  }
}

async function emParalelo(lista, tarefa) {
  const resultados = new Array(lista.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < lista.length) {
      const posicao = proximo++;
      resultados[posicao] = await tarefa(lista[posicao]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALELO, lista.length) }, trabalhador));
  return resultados;
}

/**
 * Preco em dolar SEM o fator: o item guarda o custo em reais (dolar x cotacao x fator, a conversao da lista); volta-se
 * pela cotacao e pelo fator da propria linha da lista. Quando a conta da o dolar da lista (o preco nao foi mexido), vale
 * o dolar da lista, sem arredondamento de ida e volta.
 */
export function dolarSemFator(precoEmReais, { cotacao, fator, valorDaLista = null }) {
  if (precoEmReais === null || precoEmReais === undefined || !(cotacao > 0)) return null;
  const divisor = cotacao * (fator > 0 ? fator : 1);
  const dolar = Number(precoEmReais) / divisor;
  if (typeof valorDaLista === "number" && Math.abs(dolar - valorDaLista) < 0.006) return valorDaLista;
  return Math.round(dolar * 10000) / 10000;
}

/**
 * @param {object} pedido o retorno de `lerPedido`
 * @returns {Promise<{ logo: Buffer|null, estrangeiro: boolean, moeda: string, cotacao: number|null,
 *   fotos: Record<string, Buffer|null>, dolar: Record<string, number|null> }>}
 */
export async function dadosDoPdf(pedido) {
  const fornecedor = pedido.fornecedor ?? {};
  const moeda = fornecedor.moedaLista && fornecedor.moedaLista !== "BRL" ? fornecedor.moedaLista : "BRL";
  const estrangeiro = moeda !== "BRL";
  const fatorDoCadastro = fornecedor.fatorImportacao != null ? Number(fornecedor.fatorImportacao) : 1;

  // O item da lista do fornecedor de cada linha: pelo link, pelo codigo ou pela descricao (vinculo sem codigo, NexMind).
  const coletadoDoItem = {};
  for (let inicio = 0; inicio < pedido.itens.length; inicio += 100) {
    const lote = pedido.itens.slice(inicio, inicio + 100);
    const achados = await estoqueDosFornecedores(lote.map((item) => ({
      id: item.id, nome: fornecedor.nome ?? "", codigo: item.codigoNoFornecedor, link: item.link, descricao: item.nomeNoFornecedor,
    })));
    if (achados.ok) for (const [id, achado] of Object.entries(achados.itens)) if (achado?.coletadoId) coletadoDoItem[id] = achado.coletadoId;
  }
  const ids = [...new Set(Object.values(coletadoDoItem))];
  const coletados = ids.length
    ? await prisma.produtoColetado.findMany({ where: { id: { in: ids } }, select: { id: true, miniatura: true, precoOriginal: true } })
    : [];
  const porId = new Map(coletados.map((linha) => [linha.id, linha]));

  const comFoto = pedido.itens.filter((item) => porId.get(coletadoDoItem[item.id])?.miniatura);
  const imagens = await emParalelo(comFoto, (item) => fotoParaPdf(porId.get(coletadoDoItem[item.id]).miniatura));
  const fotos = Object.fromEntries(comFoto.map((item, posicao) => [item.id, imagens[posicao]]));

  const dolar = {};
  let cotacao = null;
  if (estrangeiro) {
    // A cotacao do dia so entra para a linha que nao achou a lista (sem a cotacao com que ela foi convertida).
    let doDia = null;
    for (const item of pedido.itens) {
      const original = porId.get(coletadoDoItem[item.id])?.precoOriginal;
      if (original?.cotacao > 0) {
        cotacao ??= original.cotacao;
        dolar[item.id] = dolarSemFator(item.precoUnitario, { cotacao: original.cotacao, fator: original.fator, valorDaLista: original.valor });
      } else {
        doDia ??= (await (await import("@/lib/cotacaoDoDia")).garantirCotacaoDoDia())?.valor ?? null;
        dolar[item.id] = dolarSemFator(item.precoUnitario, { cotacao: doDia, fator: fatorDoCadastro });
      }
    }
    cotacao ??= doDia;
  }

  return { logo: await logoDaEmpresa(), estrangeiro, moeda, cotacao, fotos, dolar };
}

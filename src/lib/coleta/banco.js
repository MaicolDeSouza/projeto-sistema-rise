import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

import { linhaDePreco, linhaDoProduto, mudouPreco, produtoDaLinha } from "./linha";

/**
 * Gravacao e leitura da coleta no Postgres.
 *
 * Substituiu os dados/coleta/<dominio>/produtos.json em 15/09/2026. A regra que
 * sustenta a estrutura: SO ESCREVE O QUE MUDOU. O produto tem uma linha so,
 * atualizada no lugar; o preco tem serie propria, que ganha registro apenas
 * quando o valor muda.
 */

/// Linhas por insercao. O Postgres aceita 65.535 parametros por comando, e a
/// linha tem uns 35 campos: 500 fica longe do teto.
const LOTE = 500;

/// Campos Json da linha. O Prisma recusa `null` puro neles — exige dizer se e
/// NULL do banco ou o valor JSON null —, e o que se quer e NULL do banco.
const CAMPOS_JSON = [
  "impostos",
  "imagens",
  "especificacoes",
  "documentos",
  "variantes",
  "seo",
  "plataforma",
  "origens",
];

function paraGravar(linha) {
  const dados = { ...linha };
  for (const campo of CAMPOS_JSON) {
    if (dados[campo] === null || dados[campo] === undefined) dados[campo] = Prisma.DbNull;
  }
  return dados;
}

function emLotes(itens, tamanho = LOTE) {
  const lotes = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/**
 * Grava uma coleta inteira de uma fonte.
 *
 * Produto que nao veio nesta coleta NAO e apagado nem alterado: na lista do
 * fornecedor quem marca ausente e a conciliacao, antes de chegar aqui; na
 * vitrine, ficar fora de uma amostra de 20 nao prova que o produto saiu do ar.
 *
 * @param {object} entrada
 * @param {{id: string}} entrada.fonte
 * @param {object[]} entrada.produtos   na forma de normalizar.js
 * @param {"site"|"arquivo"} entrada.origem
 * @param {string} [entrada.resumo]
 * @param {number} [entrada.duracaoMs]
 * @param {Date}   [entrada.coletadoEm] quando a coleta aconteceu (a carga dos
 *   JSON antigos passa a data deles, e nao a de hoje)
 */
export async function gravarColeta({
  fonte,
  produtos,
  origem,
  resumo = null,
  duracaoMs = null,
  coletadoEm = new Date(),
}) {
  // Quem chega primeiro vence, a mesma regra de juntarListas: a pronta entrega
  // antes da reserva, o site antes da planilha.
  const porChave = new Map();
  let semChave = 0;

  for (const produto of produtos) {
    const linha = linhaDoProduto(produto, { origem });
    if (!linha.chave) {
      semChave++;
      continue;
    }
    if (!porChave.has(linha.chave)) porChave.set(linha.chave, linha);
  }

  const guardadas = await prisma.produtoColetado.findMany({
    where: { fonteId: fonte.id },
    select: {
      id: true,
      chave: true,
      hashConteudo: true,
      precoNormal: true,
      precoPromocional: true,
      precoReserva: true,
      estoqueStatus: true,
      ausenteDesde: true,
      quantidade: true,
      vistoEm: true,
    },
  });
  const guardadaPorChave = new Map(guardadas.map((guardada) => [guardada.chave, guardada]));

  const novas = [];
  const alteradas = [];
  const inalteradas = [];

  for (const linha of porChave.values()) {
    const guardada = guardadaPorChave.get(linha.chave);

    if (!guardada) {
      novas.push(linha);
      continue;
    }

    /*
      AUSENTE DESDE A PRIMEIRA LISTA EM QUE FALTOU, nao desde a ultima.

      A conciliacao carimba a data da lista de agora em todo ausente. Sem guardar
      a primeira, um produto fora da lista ha dois meses apareceria como "ausente
      desde a semana passada" — e a data e o que diz se vale cobrar o fornecedor.
    */
    if (linha.ausenteDesde && guardada.ausenteDesde) {
      linha.ausenteDesde = guardada.ausenteDesde;
      linha.hashConteudo = linhaDoProduto(
        { ...produtoDaLinha(linha), ausente: { desde: guardada.ausenteDesde, motivo: linha.ausenteMotivo } },
        { origem },
      ).hashConteudo;
    }

    if (guardada.hashConteudo === linha.hashConteudo) inalteradas.push(guardada.id);
    else alteradas.push({ guardada, linha });
  }

  let precosMudaram = 0;

  await prisma.$transaction(
    async (tx) => {
      const serie = [];

      for (const lote of emLotes(novas)) {
        const criadas = await tx.produtoColetado.createManyAndReturn({
          data: lote.map((linha) => ({
            ...paraGravar(linha),
            fonteId: fonte.id,
            vistoEm: coletadoEm,
          })),
          select: { id: true, chave: true },
        });

        // A primeira linha da serie e a base: sem ela, a primeira mudanca de
        // preco nao teria com o que ser comparada.
        for (const criada of criadas) {
          serie.push({
            produtoId: criada.id,
            coletadoEm,
            ...linhaDePreco(porChave.get(criada.chave)),
          });
        }
      }

      for (const { guardada, linha } of alteradas) {
        const dados = { ...paraGravar(linha), vistoEm: coletadoEm };

        /*
          O SALDO ANTERIOR, com a data em que ele foi visto.

          E a base do historico de venda: sem a data, "de 20 para 10" nao diz se
          saiu em uma semana ou em seis meses. So se escreve quando o numero
          MUDOU e os dois lados existem — saldo nao informado (o produto que nao
          veio na lista do fornecedor) nao apaga o que ja estava guardado, pela
          mesma razao de sempre: "nao veio" nao e uma quantidade nova.
        */
        if (
          linha.quantidade !== null &&
          guardada.quantidade !== null &&
          linha.quantidade !== guardada.quantidade
        ) {
          dados.quantidadeAnterior = guardada.quantidade;
          dados.quantidadeAnteriorEm = guardada.vistoEm;
        }

        await tx.produtoColetado.update({ where: { id: guardada.id }, data: dados });

        if (mudouPreco(guardada, linha)) {
          precosMudaram++;
          serie.push({ produtoId: guardada.id, coletadoEm, ...linhaDePreco(linha) });
        }
      }

      for (const lote of emLotes(serie)) {
        await tx.precoHistorico.createMany({ data: lote });
      }

      // Sem mudanca, so a data de "visto" avanca — um comando por lote, e nao
      // uma escrita por produto.
      for (const lote of emLotes(inalteradas, 5000)) {
        await tx.produtoColetado.updateMany({
          where: { id: { in: lote } },
          data: { vistoEm: coletadoEm },
        });
      }

      await tx.fonteColeta.update({
        where: { id: fonte.id },
        data: {
          ultimaColetaEm: coletadoEm,
          ultimaColetaOrigem: origem,
          ultimaColetaTotal: porChave.size,
          ultimaColetaDuracaoMs: duracaoMs,
          ultimaColetaResumo: resumo,
        },
      });
    },
    // A lista da Fortek na primeira carga sao 1.911 insercoes com foto em
    // base64; o padrao de 5 s do Prisma derrubaria a transacao no meio.
    { maxWait: 30 * 1000, timeout: 10 * 60 * 1000 },
  );

  return {
    gravados: porChave.size,
    novos: novas.length,
    atualizados: alteradas.length,
    inalterados: inalteradas.length,
    precosMudaram,
    semChave,
  };
}

/** Todos os produtos guardados de uma fonte, na forma de normalizar.js. */
export async function lerProdutosDaFonte(fonteId) {
  const linhas = await prisma.produtoColetado.findMany({
    where: { fonteId },
    orderBy: { criadoEm: "asc" },
  });
  return linhas.map(produtoDaLinha);
}

/**
 * A lista para a tela, SEM os campos pesados.
 *
 * Fica fora: galeria, descricao, ficha, documentos, SEO — e ate a miniatura,
 * que vem so para as cem linhas da pagina (`miniaturas`). Filtrar e ordenar
 * alguns milhares de linhas leves em memoria responde em milissegundos, e
 * mantem a busca por todas as palavras que a tela ja fazia.
 *
 * MOSTRA SO A ULTIMA COLETA DE CADA FONTE — decidido pelo dono em 15/09/2026.
 * Loja sem sitemap de produto e varrida por navegacao, e cada varredura cai numa
 * amostra diferente: a Usinainfo trouxe 19 produtos em 02/09 e outros 19 hoje,
 * sem repetir um endereco. Guardar todos e certo (ficar fora de uma amostra de
 * 20 nao prova que o produto saiu do ar, e o historico de preco deles continua
 * valendo), mas listar todos faria a loja crescer vinte linhas por varredura,
 * misturando preco de hoje com preco de duas semanas atras.
 */
export async function produtosParaLista() {
  const fontes = await prisma.fonteColeta.findMany({
    where: { ultimaColetaEm: { not: null } },
    select: { id: true, ultimaColetaEm: true },
  });

  if (fontes.length === 0) return [];

  const linhas = await prisma.produtoColetado.findMany({
    where: {
      OR: fontes.map((fonte) => ({
        fonteId: fonte.id,
        vistoEm: { gte: fonte.ultimaColetaEm },
      })),
    },
    select: {
      id: true,
      origem: true,
      codigo: true,
      nome: true,
      marca: true,
      modelo: true,
      mpn: true,
      ean: true,
      url: true,
      precoNormal: true,
      precoPromocional: true,
      precoComImpostos: true,
      impostos: true,
      estoqueStatus: true,
      quantidade: true,
      aChegar: true,
      buscaTexto: true,
      vistoEm: true,
      fonte: { select: { nome: true, tipo: true, dominio: true } },
    },
  });

  return linhas.map((linha) => ({
    id: linha.id,
    origem: linha.origem,
    name: linha.nome,
    code: linha.codigo,
    brand: linha.marca,
    model: linha.modelo,
    mpn: linha.mpn,
    ean: linha.ean,
    url: linha.url,
    prices: {
      normal: linha.precoNormal === null ? null : Number(linha.precoNormal),
      promotional: linha.precoPromocional === null ? null : Number(linha.precoPromocional),
      comImpostos: linha.precoComImpostos === null ? null : Number(linha.precoComImpostos),
    },
    taxes: linha.impostos ?? [],
    stock: { status: linha.estoqueStatus, quantity: linha.quantidade, aChegar: linha.aChegar },
    buscaTexto: linha.buscaTexto ?? "",
    coletadoEm: linha.vistoEm.toISOString(),
    fonte: linha.fonte,
  }));
}

/** A primeira foto de cada produto pedido, para as linhas da pagina atual. */
export async function miniaturas(ids) {
  if (ids.length === 0) return new Map();

  const linhas = await prisma.produtoColetado.findMany({
    where: { id: { in: ids } },
    select: { id: true, miniatura: true },
  });
  return new Map(linhas.map((linha) => [linha.id, linha.miniatura]));
}

/**
 * Um produto completo, com a fonte e o preco anterior.
 *
 * O PRECO ANTERIOR e o ultimo DIFERENTE do atual, e nao a penultima linha da
 * serie: a serie tambem ganha linha quando so o estoque muda, e a penultima
 * pode ter o mesmo preco — a seta diria "sem variacao" com o preco tendo caido
 * na semana anterior.
 */
export async function detalheDoProduto(id) {
  const linha = await prisma.produtoColetado.findUnique({
    where: { id },
    include: {
      fonte: { select: { nome: true, tipo: true, dominio: true } },
      precos: { orderBy: { coletadoEm: "desc" }, take: 50 },
    },
  });
  if (!linha) return null;

  const atual = linha.precoNormal === null ? null : Number(linha.precoNormal);
  const indice = linha.precos.findIndex(
    (preco) => (preco.precoNormal === null ? null : Number(preco.precoNormal)) !== atual,
  );

  return {
    id: linha.id,
    origem: linha.origem,
    fonte: linha.fonte,
    vistoEm: linha.vistoEm,
    produto: produtoDaLinha(linha),
    precoAnterior:
      indice > 0 && linha.precos[indice].precoNormal !== null
        ? Number(linha.precos[indice].precoNormal)
        : null,
    // A mudanca aconteceu na linha MAIS NOVA que ainda tinha o preco atual.
    mudouEm: indice > 0 ? linha.precos[indice - 1].coletadoEm : null,
  };
}

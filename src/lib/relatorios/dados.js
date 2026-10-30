import { prisma } from "@/lib/db";

import { dataDaChave } from "./semana";

/**
 * Os numeros do relatorio semanal (20/10/2026): o que a rodada achou. So leitura do banco.
 *
 * 1) COMO FOI A LEITURA de cada loja da rodada (erro e o motivo, o que nao terminou);
 * 2) PRODUTOS NOVOS dos concorrentes, com o link (a loja que nasceu nesta rodada nao lista: seria a loja inteira);
 * 3) OS 10 MAIS VENDIDOS DE CADA CONCORRENTE que informa a quantidade em estoque (pedido do dono em 30/10/2026; ate ali
 *    eram os 10 do geral, e uma loja grande escondia as outras) — uma ESTIMATIVA: nenhuma loja publica vendas, entao o que
 *    se conta e a QUEDA do saldo entre a leitura anterior e a desta rodada.
 */

export const LIMITE_DE_NOVOS_POR_LOJA = 100;
/** Quantos mais vendidos por concorrente. */
export const TOTAL_DOS_MAIS_VENDIDOS = 10;

/** Um erro de varredura cabe numa linha do PDF; o resto fica no log do worker. */
function resumirErro(texto) {
  const limpo = String(texto ?? "").replace(/\s+/g, " ").trim();
  return limpo.length > 220 ? `${limpo.slice(0, 217)}...` : limpo;
}

/** Decide a situacao de uma loja a partir do ultimo job dela na rodada. Pura. */
export function situacaoDaLoja({ job, fonte }) {
  if (!job) {
    return fonte.varridaNoPc
      ? { situacao: "so-pc", texto: "Só varrida pelo PC: não entrou nesta rodada da VPS." }
      : { situacao: "pulada", texto: "Não foi varrida nesta rodada (já havia uma varredura aberta, ou a fonte foi pausada)." };
  }
  if (job.status === "CONCLUIDO") return { situacao: "ok", texto: "Lida sem erro." };
  if (job.status === "FALHOU") return { situacao: "erro", texto: resumirErro(job.erro) || "A varredura falhou, sem mensagem registrada." };
  if (job.status === "CANCELADO") return { situacao: "erro", texto: "A varredura foi cancelada." };
  return { situacao: "aberta", texto: "A varredura não terminou até a geração do relatório." };
}

/**
 * @param {object} entrada
 * @param {Date} entrada.inicioEm  quando a rodada comecou
 * @param {{id: string, nome: string}[]} entrada.fontes  as lojas que a rodada enfileirou
 * @param {string} [entrada.semana] chave da rodada ("2026-10-24"); a manual ("manual-...") compara o saldo de agora com o ultimo
 *   sabado guardado
 */
export async function montarDadosDoRelatorio({ inicioEm, fontes, semana = null }) {
  const ids = fontes.map((fonte) => fonte.id);

  const [cadastradas, jobs, pcs] = await Promise.all([
    prisma.fonteColeta.findMany({
      where: { id: { in: ids } },
      select: { id: true, nome: true, dominio: true, tipo: true, criadoEm: true, varridaNoPc: true, ultimaColetaTotal: true, ultimaColetaEm: true },
    }),
    prisma.job.findMany({
      where: { tipo: "coleta", fonteId: { in: ids }, criadoEm: { gte: inicioEm } },
      orderBy: { criadoEm: "desc" },
      select: { fonteId: true, status: true, erro: true, criadoEm: true },
    }),
    prisma.fonteColeta.findMany({
      where: { varridaNoPc: true, ativa: true, id: { notIn: ids } },
      select: { id: true, nome: true, dominio: true, tipo: true, criadoEm: true, varridaNoPc: true, ultimaColetaTotal: true, ultimaColetaEm: true },
    }),
  ]);

  const ultimoJob = new Map();
  for (const job of jobs) if (!ultimoJob.has(job.fonteId)) ultimoJob.set(job.fonteId, job);

  const lojas = [...cadastradas, ...pcs]
    .map((fonte) => ({
      id: fonte.id,
      nome: fonte.nome,
      dominio: fonte.dominio,
      tipo: fonte.tipo,
      produtos: fonte.ultimaColetaTotal ?? null,
      ultimaColetaEm: fonte.ultimaColetaEm,
      ...situacaoDaLoja({ job: ultimoJob.get(fonte.id) ?? null, fonte }),
    }))
    .sort((a, b) => (a.situacao === "erro" ? 0 : 1) - (b.situacao === "erro" ? 0 : 1) || a.nome.localeCompare(b.nome, "pt-BR"));

  // Concorrentes ja existentes antes da rodada: so deles se lista o que e novo. A loja que nasceu agora entra com a contagem.
  const concorrentes = cadastradas.filter((fonte) => fonte.tipo === "CONCORRENTE");
  const existentes = concorrentes.filter((fonte) => fonte.criadoEm < inicioEm);
  const lojasNovas = concorrentes.filter((fonte) => fonte.criadoEm >= inicioEm).map((fonte) => fonte.nome);

  const novosDaRodada = existentes.length
    ? await prisma.produtoColetado.findMany({
        where: { fonteId: { in: existentes.map((fonte) => fonte.id) }, criadoEm: { gte: inicioEm } },
        orderBy: [{ fonteId: "asc" }, { criadoEm: "asc" }],
        select: { fonteId: true, codigo: true, nome: true, url: true, precoNormal: true, precoPromocional: true },
      })
    : [];

  const nomeDaFonte = new Map(existentes.map((fonte) => [fonte.id, fonte.nome]));
  const porLoja = new Map();
  for (const produto of novosDaRodada) {
    const lista = porLoja.get(produto.fonteId) ?? [];
    lista.push(produto);
    porLoja.set(produto.fonteId, lista);
  }
  const novos = [...porLoja.entries()]
    .map(([fonteId, lista]) => ({
      loja: nomeDaFonte.get(fonteId),
      total: lista.length,
      itens: lista.slice(0, LIMITE_DE_NOVOS_POR_LOJA).map((produto) => ({
        codigo: produto.codigo,
        nome: produto.nome,
        url: produto.url,
        preco: produto.precoNormal !== null ? Number(produto.precoNormal) : produto.precoPromocional !== null ? Number(produto.precoPromocional) : null,
      })),
    }))
    .sort((a, b) => a.loja.localeCompare(b.loja, "pt-BR"));

  const nomeDeConcorrente = new Map(concorrentes.map((fonte) => [fonte.id, fonte.nome]));
  const vendidos = await estimarMaisVendidos({ idsDosConcorrentes: concorrentes.map((fonte) => fonte.id), nomeDeConcorrente, inicioEm, semana });

  const comQuantidade = new Set(
    (
      await prisma.produtoColetado.groupBy({
        by: ["fonteId"],
        where: { fonteId: { in: concorrentes.map((fonte) => fonte.id) }, quantidade: { not: null } },
      })
    ).map((linha) => linha.fonteId),
  );
  const informamEstoque = concorrentes.filter((fonte) => comQuantidade.has(fonte.id));

  return {
    lojas,
    lojasNovas,
    novos,
    maisVendidosPorLoja: maisVendidosPorLoja(vendidos, informamEstoque.map((fonte) => fonte.nome)),
    lojasQueInformamEstoque: informamEstoque.map((fonte) => fonte.nome),
    totais: {
      lojas: lojas.length,
      comErro: lojas.filter((loja) => loja.situacao === "erro").length,
      naoTerminaram: lojas.filter((loja) => loja.situacao === "aberta").length,
      novos: novos.reduce((soma, loja) => soma + loja.total, 0),
    },
  };
}

const comoPreco = (normal, promocional) => (normal !== null ? Number(normal) : promocional !== null ? Number(promocional) : null);

/**
 * Os mais vendidos em grupos, um por concorrente que informa estoque, cada um com os `TOTAL_DOS_MAIS_VENDIDOS` de maior
 * queda. A loja que informa estoque e nao teve queda medida aparece com a lista vazia (o PDF diz isso), para nao parecer
 * esquecida. Ordem: por nome da loja, como as outras secoes do relatorio. Pura (exportada para o teste).
 *
 * @param {{ loja: string, vendidos: number }[]} itens
 * @param {string[]} lojasQueInformam
 * @returns {{ loja: string, itens: object[] }[]}
 */
export function maisVendidosPorLoja(itens, lojasQueInformam) {
  const porLoja = new Map(lojasQueInformam.map((loja) => [loja, []]));
  for (const item of itens) {
    if (!item.loja) continue;
    if (!porLoja.has(item.loja)) porLoja.set(item.loja, []);
    porLoja.get(item.loja).push(item);
  }
  return [...porLoja.entries()]
    .map(([loja, lista]) => ({
      loja,
      // Empate na queda: o de maior preco primeiro (vendeu mais em dinheiro), depois o nome, para a ordem nao variar.
      itens: lista
        .sort((a, b) => b.vendidos - a.vendidos || (b.preco ?? 0) - (a.preco ?? 0) || String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR"))
        .slice(0, TOTAL_DOS_MAIS_VENDIDOS),
    }))
    .sort((a, b) => a.loja.localeCompare(b.loja, "pt-BR"));
}

/**
 * Os mais vendidos, ESTIMADOS pela queda do saldo (nenhuma loja publica vendas). Duas fontes, nesta ordem:
 *
 * 1) SABADO COM SABADO (`QuantidadeSemanal`): o saldo desta rodada contra o da rodada anterior guardada (a mais recente com
 *    semana menor). Na rodada manual, o saldo de agora contra o ultimo sabado guardado. E o que enxerga semanas e nao se
 *    confunde com varredura manual no meio da semana;
 * 2) o saldo anterior que a propria coleta guarda (`quantidadeAnterior`), so para o produto que ainda NAO tem sabado anterior
 *    guardado (as primeiras semanas): vale a queda que aconteceu nesta rodada.
 *
 * Reposicao de estoque na semana faz a estimativa ficar abaixo do real (ou sumir).
 */
async function estimarMaisVendidos({ idsDosConcorrentes, nomeDeConcorrente, inicioEm, semana }) {
  if (idsDosConcorrentes.length === 0) return [];
  const real = Boolean(semana && dataDaChave(semana));

  const dosSabados = real
    ? await prisma.$queryRaw`
        SELECT p."id", p."fonteId", p."codigo", p."nome", p."url", p."precoNormal", p."precoPromocional",
               b."quantidade" AS "de", a."quantidade" AS "para", b."semana" AS "deSemana"
        FROM "QuantidadeSemanal" a
        JOIN "ProdutoColetado" p ON p."id" = a."produtoId"
        JOIN LATERAL (
          SELECT "quantidade", "semana" FROM "QuantidadeSemanal"
          WHERE "produtoId" = a."produtoId" AND "semana" < a."semana" ORDER BY "semana" DESC LIMIT 1
        ) b ON true
        WHERE a."semana" = ${semana} AND p."fonteId" = ANY(${idsDosConcorrentes}::text[]) AND b."quantidade" > a."quantidade"
        ORDER BY (b."quantidade" - a."quantidade") DESC`
    : await prisma.$queryRaw`
        SELECT p."id", p."fonteId", p."codigo", p."nome", p."url", p."precoNormal", p."precoPromocional",
               b."quantidade" AS "de", p."quantidade" AS "para", b."semana" AS "deSemana"
        FROM "ProdutoColetado" p
        JOIN LATERAL (
          SELECT "quantidade", "semana" FROM "QuantidadeSemanal" WHERE "produtoId" = p."id" ORDER BY "semana" DESC LIMIT 1
        ) b ON true
        WHERE p."fonteId" = ANY(${idsDosConcorrentes}::text[]) AND p."quantidade" IS NOT NULL AND p."ausenteDesde" IS NULL
          AND b."quantidade" > p."quantidade"
        ORDER BY (b."quantidade" - p."quantidade") DESC`;
  // Sem LIMIT de proposito: o corte e por loja (maisVendidosPorLoja). Um LIMIT geral deixava a loja com as maiores quedas
  // tomar todas as vagas e as outras sumirem do relatorio. So entram produtos com queda, que sao poucos por semana.

  const itens = dosSabados.map((linha) => ({
    id: linha.id,
    loja: nomeDeConcorrente.get(linha.fonteId),
    codigo: linha.codigo,
    nome: linha.nome,
    url: linha.url,
    de: linha.de,
    para: linha.para,
    vendidos: linha.de - linha.para,
    preco: comoPreco(linha.precoNormal, linha.precoPromocional),
    desde: linha.deSemana,
  }));

  // Sem sabado anterior guardado: a queda que a coleta registrou nesta rodada.
  const candidatos = await prisma.produtoColetado.findMany({
    where: {
      fonteId: { in: idsDosConcorrentes },
      quantidade: { not: null },
      quantidadeAnterior: { not: null },
      atualizadoEm: { gte: inicioEm },
      ausenteDesde: null,
    },
    select: { id: true, fonteId: true, codigo: true, nome: true, url: true, quantidade: true, quantidadeAnterior: true, precoNormal: true, precoPromocional: true },
  });
  const comHistorico = candidatos.length
    ? new Set(
        (
          await prisma.quantidadeSemanal.findMany({
            where: { produtoId: { in: candidatos.map((produto) => produto.id) }, ...(real ? { semana: { lt: semana } } : {}) },
            select: { produtoId: true },
            distinct: ["produtoId"],
          })
        ).map((linha) => linha.produtoId),
      )
    : new Set();
  for (const produto of candidatos) {
    if (comHistorico.has(produto.id) || produto.quantidadeAnterior - produto.quantidade <= 0) continue;
    itens.push({
      id: produto.id,
      loja: nomeDeConcorrente.get(produto.fonteId),
      codigo: produto.codigo,
      nome: produto.nome,
      url: produto.url,
      de: produto.quantidadeAnterior,
      para: produto.quantidade,
      vendidos: produto.quantidadeAnterior - produto.quantidade,
      preco: comoPreco(produto.precoNormal, produto.precoPromocional),
      desde: null,
    });
  }

  return itens;
}

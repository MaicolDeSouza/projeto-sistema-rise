import { prisma } from "@/lib/db";

/**
 * Os numeros do relatorio semanal (20/10/2026): o que a rodada achou. So leitura do banco.
 *
 * 1) COMO FOI A LEITURA de cada loja da rodada (erro e o motivo, o que nao terminou);
 * 2) PRODUTOS NOVOS dos concorrentes, com o link (a loja que nasceu nesta rodada nao lista: seria a loja inteira);
 * 3) OS 10 MAIS VENDIDOS dos concorrentes que informam a quantidade em estoque — uma ESTIMATIVA: nenhuma loja publica
 *    vendas, entao o que se conta e a QUEDA do saldo entre a leitura anterior e a desta rodada.
 */

export const LIMITE_DE_NOVOS_POR_LOJA = 100;
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
 */
export async function montarDadosDoRelatorio({ inicioEm, fontes }) {
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

  // Estimativa de vendas: queda do saldo, so onde a loja informa a quantidade (`quantidade` e `quantidadeAnterior` ao
  // mesmo tempo). O saldo anterior e o da leitura de antes; so conta o que MUDOU nesta rodada.
  const candidatos = concorrentes.length
    ? await prisma.produtoColetado.findMany({
        where: {
          fonteId: { in: concorrentes.map((fonte) => fonte.id) },
          quantidade: { not: null },
          quantidadeAnterior: { not: null },
          atualizadoEm: { gte: inicioEm },
          ausenteDesde: null,
        },
        select: { fonteId: true, codigo: true, nome: true, url: true, quantidade: true, quantidadeAnterior: true, precoNormal: true, precoPromocional: true },
      })
    : [];
  const nomeDeConcorrente = new Map(concorrentes.map((fonte) => [fonte.id, fonte.nome]));
  const maisVendidos = candidatos
    .map((produto) => ({
      loja: nomeDeConcorrente.get(produto.fonteId),
      codigo: produto.codigo,
      nome: produto.nome,
      url: produto.url,
      de: produto.quantidadeAnterior,
      para: produto.quantidade,
      vendidos: produto.quantidadeAnterior - produto.quantidade,
      preco: produto.precoNormal !== null ? Number(produto.precoNormal) : produto.precoPromocional !== null ? Number(produto.precoPromocional) : null,
    }))
    .filter((item) => item.vendidos > 0)
    .sort((a, b) => b.vendidos - a.vendidos)
    .slice(0, TOTAL_DOS_MAIS_VENDIDOS);

  const comQuantidade = new Set(
    (
      await prisma.produtoColetado.groupBy({
        by: ["fonteId"],
        where: { fonteId: { in: concorrentes.map((fonte) => fonte.id) }, quantidade: { not: null } },
      })
    ).map((linha) => linha.fonteId),
  );

  return {
    lojas,
    lojasNovas,
    novos,
    maisVendidos,
    lojasQueInformamEstoque: concorrentes.filter((fonte) => comQuantidade.has(fonte.id)).map((fonte) => fonte.nome),
    totais: {
      lojas: lojas.length,
      comErro: lojas.filter((loja) => loja.situacao === "erro").length,
      naoTerminaram: lojas.filter((loja) => loja.situacao === "aberta").length,
      novos: novos.reduce((soma, loja) => soma + loja.total, 0),
    },
  };
}

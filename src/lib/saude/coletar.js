import { readdir, stat, statfs } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";
import { config as configDasIntegracoes } from "@/lib/integracoes/config";
import { lerConfiguracao } from "@/lib/riseAi/configuracao";
import { ESCOPOS, estadoDoOrcamento } from "@/lib/riseAi/orcamento";
import { ambienteDoRise } from "@/lib/sessao";
import { rotuloDaVersao } from "@/lib/versao";
import {
  ROTINAS_DO_WORKER,
  avaliarBackup,
  avaliarBanco,
  avaliarColeta,
  avaliarDisco,
  avaliarHealthchecks,
  avaliarIntegracao,
  avaliarMemoria,
  avaliarOrcamento,
  avaliarPc,
  avaliarRotina,
  avaliarWorker,
  estadoGeral,
} from "./regras";

/**
 * Le tudo o que a Saude do Rise mostra (pedido do dono em 25/10/2026). So LEITURA: banco, disco e `.env`; nenhuma chamada
 * a API externa (o "Testar integracoes agora" da tela e outra acao). Cada parte que falha vira um item vermelho com o
 * motivo, nunca derruba a tela inteira.
 */

const DIA_MS = 24 * 60 * 60 * 1000;
const ID_DO_VIGIA_PC = "vigia-pc";
const PRAZO_DO_PC_MS = 3 * 60 * 1000;
const PASTA_DE_DADOS = path.join(process.cwd(), "dados");
const ARQUIVO_DE_BACKUP = /^sistema_rise-\d{8}-\d{6}\.dump$/;

const INTEGRACOES = [
  { servico: "BLING", rotulo: "Bling", obrigatoria: true },
  { servico: "MERCADO_LIVRE", rotulo: "Mercado Livre", obrigatoria: true },
  { servico: "LOJA_INTEGRADA", rotulo: "Loja Integrada", obrigatoria: true },
  { servico: "TELEGRAM", rotulo: "Telegram", obrigatoria: false },
  { servico: "OPENAI", rotulo: "OpenAI", obrigatoria: false },
];

const ROTULO_DO_ESCOPO = { CLIENTES: "Orçamento da IA dos clientes", INTERNO: "Orçamento da IA interna" };

/** Roda uma leitura e, se ela lancar, devolve o item vermelho com o motivo. */
async function seguro(item, ler) {
  try {
    return { ...item, ...(await ler()) };
  } catch (erro) {
    return { ...item, estado: "falha", detalhe: `Não foi possível ler: ${erro?.message ?? erro}` };
  }
}

async function itensDosWorkers({ agora, naVps }) {
  // No PC o worker normal nunca roda (a copia do banco nao coleta): uma linha so, em vez de onze "so na VPS".
  const itens = naVps
    ? await itensDoWorkerNaVps({ agora })
    : [{ id: "worker", rotulo: "Worker e rotinas", estado: "aguardando", detalhe: "O worker normal e as rotinas dele só rodam na VPS." }];
  itens.push(
    await seguro({ id: "pc", rotulo: "Rise do PC (varrer pelo PC)", caminho: "/mercados/fontes" }, async () => {
      const fontes = await prisma.fonteColeta.findMany({ where: { varridaNoPc: true }, select: { id: true } });
      if (fontes.length === 0) return avaliarPc({ fontesNoPc: 0 }, agora);
      const sinal = (await prisma.workerColeta.findUnique({ where: { id: ID_DO_VIGIA_PC }, select: { sinalEm: true } }))?.sinalEm ?? null;
      const pedidos = await prisma.job.findMany({ where: { tipo: "coleta", status: "PENDENTE", fonteId: { in: fontes.map((fonte) => fonte.id) } }, select: { criadoEm: true } });
      const semPc = !sinal || agora - sinal.getTime() > PRAZO_DO_PC_MS;
      const esperando = pedidos.filter((pedido) => agora - pedido.criadoEm.getTime() > PRAZO_DO_PC_MS);
      return avaliarPc({ fontesNoPc: fontes.length, pedidosSemResposta: semPc ? esperando.length : 0, sinalEm: sinal }, agora);
    }),
  );
  return itens;
}

/** A latencia e de uma consulta trivial DEPOIS do tamanho: a primeira consulta do processo inclui abrir a conexao. */
async function itensDoWorkerNaVps({ agora }) {
  const linhas = new Map((await prisma.rotinaDoWorker.findMany()).map((linha) => [linha.id, linha]));
  return [
    await seguro({ id: "worker", rotulo: "Worker", caminho: "/mercados/fontes" }, async () => {
      const worker = await prisma.workerColeta.findFirst({ where: { encerradoEm: null, id: { not: ID_DO_VIGIA_PC } }, orderBy: { sinalEm: "desc" }, select: { sinalEm: true } });
      return avaliarWorker(worker?.sinalEm ?? null, agora);
    }),
    { id: "memoria", rotulo: "Memória do worker", ...avaliarMemoria(linhas.get("memoria")?.dados, agora) },
    ...ROTINAS_DO_WORKER.map((rotina) => ({ id: `rotina-${rotina.id}`, rotulo: rotina.rotulo, ...avaliarRotina(linhas.get(rotina.id), agora) })),
  ];
}

async function lerBanco() {
  const [linha] = await prisma.$queryRaw`SELECT pg_database_size(current_database())::bigint AS tamanho`;
  const inicio = performance.now();
  await prisma.$queryRaw`SELECT 1`;
  return { latenciaMs: performance.now() - inicio, tamanhoBytes: Number(linha?.tamanho ?? 0) };
}

async function backupMaisNovo() {
  const pasta = path.join(PASTA_DE_DADOS, "backup");
  const nomes = (await readdir(pasta).catch(() => [])).filter((nome) => ARQUIVO_DE_BACKUP.test(nome));
  let maisNovo = null;
  for (const nome of nomes) {
    const { mtime } = await stat(path.join(pasta, nome));
    if (!maisNovo || mtime > maisNovo) maisNovo = mtime;
  }
  return maisNovo;
}

async function itensDoServidor({ agora, naVps, env }) {
  const travas = configDasIntegracoes.travas;
  const trava = (liberada, codigos) => (liberada ? (codigos.length ? `${codigos.length} código(s)` : "liberado") : "travado");
  return [
    await seguro({ id: "banco", rotulo: "Banco de dados" }, async () => {
      try {
        return avaliarBanco(await lerBanco());
      } catch (erro) {
        return avaliarBanco({ erro: erro?.message ?? String(erro) });
      }
    }),
    await seguro({ id: "disco", rotulo: "Disco" }, async () => {
      const disco = await statfs(PASTA_DE_DADOS).catch(() => statfs(process.cwd()));
      return avaliarDisco({ livreBytes: disco.bavail * disco.bsize, totalBytes: disco.blocks * disco.bsize });
    }),
    await seguro({ id: "backup", rotulo: "Backup do banco" }, async () => {
      const maisNovo = await backupMaisNovo();
      // No PC o backup e semanal (Agendador do Windows) e o banco e uma copia: so a VPS cobra o diario.
      if (!naVps) return { estado: "info", detalhe: maisNovo ? `Último backup do PC há ${Math.round((agora - maisNovo.getTime()) / DIA_MS)} dia(s).` : "Sem backup no PC." };
      return avaliarBackup(maisNovo, agora);
    }),
    {
      id: "healthchecks",
      rotulo: "Avisos por e-mail (healthchecks.io)",
      ...avaliarHealthchecks({
        naVps,
        worker: Boolean(env.HEALTHCHECKS_WORKER_URL),
        backup: Boolean(env.HEALTHCHECKS_BACKUP_URL),
        copia: Boolean(env.HEALTHCHECKS_COPIA_URL),
        site: Boolean(env.HEALTHCHECKS_SITE_URL),
      }),
    },
    {
      id: "travas",
      rotulo: "Travas de escrita",
      estado: "info",
      detalhe: `Mercado Livre: ${trava(travas.mlPublicacao, travas.mlCodigosLiberados)} · Bling: ${trava(travas.blingEscrita, travas.blingCodigosLiberados)} · Loja Integrada: ${trava(travas.liEscrita, travas.liCodigosLiberados)}`,
    },
    { id: "versao", rotulo: "Versão no ar", estado: "info", detalhe: rotuloDaVersao(env.NEXT_PUBLIC_RISE_VERSAO || "dev") },
  ];
}

async function itensDasIntegracoes({ agora }) {
  const [conexoes, recusas] = await Promise.all([
    prisma.conexao.findMany({ where: { servico: { in: INTEGRACOES.map((integracao) => integracao.servico) } } }),
    prisma.logIntegracao.groupBy({
      by: ["servico", "statusHttp"],
      where: { criadoEm: { gte: new Date(agora - DIA_MS) }, statusHttp: { in: [401, 403, 429] } },
      _count: { _all: true },
    }),
  ]);
  const porServico = new Map(conexoes.map((conexao) => [conexao.servico, conexao]));
  const contar = (servico, codigos) => recusas.filter((linha) => linha.servico === servico && codigos.includes(linha.statusHttp)).reduce((soma, linha) => soma + linha._count._all, 0);
  return INTEGRACOES.map(({ servico, rotulo, obrigatoria }) => {
    const conexao = porServico.get(servico);
    return {
      id: `integracao-${servico}`,
      rotulo,
      caminho: "/integracoes",
      ...avaliarIntegracao({
        status: conexao?.status,
        ultimoTesteOk: conexao?.ultimoTesteOk ?? null,
        ultimoErro: conexao?.ultimoErro ?? null,
        recusas24h: contar(servico, [401, 403]),
        limite24h: contar(servico, [429]),
        obrigatoria,
      }),
      testadoEm: conexao?.ultimoTesteEm ?? null,
    };
  });
}

async function itensDaOperacao({ agora }) {
  const configuracao = await lerConfiguracao();
  const itens = [];
  for (const escopo of ESCOPOS) {
    itens.push(await seguro({ id: `orcamento-${escopo}`, rotulo: ROTULO_DO_ESCOPO[escopo] ?? escopo, caminho: "/rise-ai/configuracoes" }, async () => avaliarOrcamento(await estadoDoOrcamento(escopo, { agora, config: configuracao }))));
  }
  itens.push(
    await seguro({ id: "coleta", rotulo: "Varreduras", caminho: "/mercados/fontes" }, async () => {
      const [emAndamento, naFila, falhou] = await Promise.all([
        prisma.job.count({ where: { tipo: "coleta", status: "PROCESSANDO" } }),
        prisma.job.count({ where: { tipo: "coleta", status: "PENDENTE" } }),
        prisma.job.findMany({ where: { tipo: "coleta", status: "FALHOU", atualizadoEm: { gte: new Date(agora - DIA_MS) } }, select: { fonteId: true, payload: true } }),
      ]);
      const reais = falhou.filter((job) => job.payload?.teste !== true);
      const ids = [...new Set(reais.map((job) => job.fonteId).filter(Boolean))];
      const nomes = new Map((await prisma.fonteColeta.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })).map((fonte) => [fonte.id, fonte.nome]));
      return avaliarColeta({ emAndamento, naFila, falhas24h: reais.map((job) => nomes.get(job.fonteId) ?? "fonte") });
    }),
  );
  return itens;
}

/**
 * @returns {Promise<{ geral: string, em: string, ambiente: "vps" | "pc", grupos: { titulo: string, itens: object[] }[] }>}
 */
export async function coletarSaude({ agora = Date.now(), env = process.env } = {}) {
  const naVps = ambienteDoRise(env) === "vps";
  const [workers, servidor, integracoes, operacao] = await Promise.all([
    itensDosWorkers({ agora, naVps }),
    itensDoServidor({ agora, naVps, env }),
    seguro({ id: "integracoes", rotulo: "Integrações" }, async () => ({ lista: await itensDasIntegracoes({ agora }) })),
    seguro({ id: "operacao", rotulo: "IA e varreduras" }, async () => ({ lista: await itensDaOperacao({ agora }) })),
  ]);
  const lista = (resultado) => resultado.lista ?? [resultado];
  const grupos = [
    { titulo: "Workers e rotinas", itens: workers },
    { titulo: "Banco e servidor", itens: servidor },
    { titulo: "Integrações", itens: lista(integracoes) },
    { titulo: "IA e varreduras", itens: lista(operacao) },
  ];
  return { geral: estadoGeral(grupos.flatMap((grupo) => grupo.itens)), em: new Date(agora).toISOString(), ambiente: naVps ? "vps" : "pc", grupos };
}

/** Os itens em vermelho, para o aviso do Telegram e o detalhe do cartao. */
export function itensEmFalha(saude) {
  return saude.grupos.flatMap((grupo) => grupo.itens).filter((item) => item.estado === "falha");
}

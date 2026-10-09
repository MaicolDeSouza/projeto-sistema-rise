import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/**
 * A fila da coleta: as regras que o worker e a tela precisam enxergar igual.
 *
 * Fora de acoes.js porque arquivo "use server" so exporta funcao assincrona — uma
 * constante ali faz o Next recusar o modulo inteiro.
 *
 * REESCRITA EM 16/09/2026, depois de um dia de defeitos no mesmo lugar: job
 * "em andamento" por horas sem ninguem varrendo, dois workers disputando a fila,
 * worker preso para sempre numa pagina que parou de chegar, loja que falhava
 * voltando para a fila na hora. Todos vinham de uma raiz so: a VIDA de um job era
 * deduzida do ANDAMENTO dele (`atualizadoEm`), e as duas coisas nao sao a mesma.
 *
 * Agora sao tres sinais separados, cada um com uma pergunta so:
 *
 *   WorkerColeta.sinalEm   o PROCESSO esta vivo?        relogio, a cada SINAL_MS
 *   Job.sinalEm            o DONO ainda cuida do job?   relogio, a cada SINAL_MS
 *   ultima atividade       a VARREDURA anda?            memoria do worker; o vigia
 *                                                       cancela apos SEM_ATIVIDADE_MS
 *
 * E tres garantias que o banco da, em vez de o codigo conferir antes de agir:
 *
 *   - um worker por vez: trava consultiva do Postgres (TRAVA_WORKER);
 *   - um job aberto por fonte: indice unico parcial "Job_fonte_aberta";
 *   - um dono por job: pegarProximoJob e um UPDATE ... FOR UPDATE SKIP LOCKED.
 */

/// De quanto em quanto worker e job dao sinal de vida.
export const SINAL_MS = 15 * 1000;

/// Job PROCESSANDO sem sinal ha mais que isso foi largado. Oito sinais de folga:
/// o sinal e escrito por relogio, entao so falta quando o processo morreu, perdeu o
/// banco ou travou o laco de eventos — nunca porque a loja e lenta.
export const JOB_SEM_SINAL_MS = 2 * 60 * 1000;

/// Worker sem sinal ha mais que isso nao esta no ar (para a tela).
export const WORKER_SEM_SINAL_MS = 60 * 1000;

/// Varredura sem abrir pagina nem gravar nada ha mais que isso esta travada, e o
/// vigia a cancela. A pior visita legitima: 20 s de teto de requisicao + 10 s de
/// Crawl-delay; a leitura do catalogo e do sitemap, alguns minutos. Dez minutos
/// separam com folga o lento do parado.
export const SEM_ATIVIDADE_MS = Number(process.env.COLETA_SEM_ATIVIDADE_MS) || 10 * 60 * 1000;

/// Varreduras ao mesmo tempo, cada uma numa loja — 5, pedido do dono em
/// 16/09/2026 (eram 3 no mesmo dia). Cada loja tem a propria fila de ritmo
/// (buscar.js), entao paralelo nao aperta nenhum site: so deixa de esperar uma loja
/// terminar para comecar outra. O custo e do nosso lado: memoria e banda.
export const PARALELO_PADRAO = 5;

/// Retomar uma varredura so vale ate esta idade. Depois disso os precos gravados
/// ja envelheceram, e o certo e varrer de novo do comeco.
export const RETOMADA_VALE_MS = 3 * 24 * 60 * 60 * 1000;

/// Espera antes de tentar de novo uma varredura que falhou: 2, 4, 8 min...
export const esperaAposFalhaMs = (tentativas) => 2 ** Math.max(1, tentativas) * 60 * 1000;

/// Fonte cuja varredura esgotou as tentativas so volta a fila depois disso. Sem
/// esta espera ela continuava "vencida", e o worker a enfileirava de novo na
/// volta seguinte: a mesma loja falhando a cada dez segundos, para sempre.
export const ESPERA_APOS_ESGOTAR_MS = 6 * 60 * 60 * 1000;

/// Chave da trava consultiva do worker no Postgres (numero arbitrario e fixo).
export const TRAVA_WORKER = 471_920_016;

/**
 * So estas fontes, de COLETA_FONTES (ids separados por virgula), ou null.
 *
 * Com o filtro, o worker so enfileira, pega e recolhe jobs dessas fontes, e usa
 * OUTRA trava — pode subir ao lado do worker normal sem tocar no que e dele. Existe
 * para o teste do worker (scripts/teste-worker.js) e para varrer uma loja so
 * quando se investiga um defeito.
 */
export function fontesConfiguradas(valor = process.env.COLETA_FONTES) {
  const ids = String(valor ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : null;
}

/**
 * Worker do PC (COLETA_SO_PC=1): atende SO as fontes marcadas `varridaNoPc`, e nenhuma outra.
 *
 * Existe porque alguns sites bloqueiam o IP de datacenter da VPS (e outros virao). O dono marca a fonte na tela de
 * Fontes; o worker normal (o da VPS) passa a ignora-la, e `npm run worker:pc` varre no PC, com o IP de casa, gravando
 * direto no banco da VPS por um tunel SSH. Nao se combina com COLETA_FONTES (que e o worker de teste).
 */
export function soNoPcConfigurado(valor = process.env.COLETA_SO_PC) {
  return String(valor ?? "").trim() === "1";
}

/// COLETA_FONTES e COLETA_SO_PC juntos nao tem sentido: um pede fontes por id, o outro pela marca da tela.
export function modoInvalido(fontes, soNoPc) {
  return fontes && soNoPc ? "COLETA_FONTES e COLETA_SO_PC nao se combinam: escolha um dos dois." : null;
}

/** A trava do worker: uma para o normal, outra para o restrito a fontes, outra para o do PC. */
export const travaDoWorker = (fontes, soNoPc = false) =>
  fontes ? TRAVA_WORKER + 1 : soNoPc ? TRAVA_WORKER + 2 : TRAVA_WORKER;

/** Ids das fontes marcadas para varrer no PC. */
export async function idsDasFontesNoPc() {
  const fontes = await prisma.fonteColeta.findMany({ where: { varridaNoPc: true }, select: { id: true } });
  return fontes.map((fonte) => fonte.id);
}

/**
 * Poe na fila as fontes marcadas para o PC que estao ativas. E o "varrer agora" do worker do PC: quem roda
 * `npm run worker:pc` esta pedindo a varredura, e clicar de novo na tela da VPS seria o mesmo pedido. Fonte pausada ou
 * barrada pelo robots.txt nao entra, e a que ja tem job aberto fica de fora pelo indice unico da fila.
 *
 * `fonteId`: so aquela fonte (o "Varrer agora" da linha, no Rise do PC). Ela tem que estar marcada e ativa NESTE banco,
 * que e o da VPS: a marca da copia do PC nao vale. `fontes: 0` com `fonteId` = a VPS nao a reconhece como fonte do PC.
 *
 * @returns {Promise<{fontes: number, enfileiradas: number}>}
 */
export async function enfileirarFontesDoPc({ fonteId = null } = {}) {
  const fontes = await prisma.fonteColeta.findMany({
    where: { varridaNoPc: true, ativa: true, robotsPermite: true, ...(fonteId ? { id: fonteId } : {}) },
    select: { id: true, nome: true },
  });
  const enfileiradas = await enfileirar(fontes);
  return { fontes: fontes.length, enfileiradas };
}

/// Quantos jobs de coleta abertos (na fila ou varrendo) as fontes marcadas para o PC tem. Zero = o worker do PC acabou.
export async function jobsAbertosDoPc() {
  const ids = await idsDasFontesNoPc();
  if (ids.length === 0) return 0;
  return prisma.job.count({
    where: { tipo: "coleta", status: { in: ["PENDENTE", "PROCESSANDO"] }, fonteId: { in: ids } },
  });
}

/// A que fonte o job pertence (`fonteId` em coluna; job antigo so tem no payload).
const fonteDoJob = (job) => job.fonteId ?? job.payload?.fonteId ?? null;

/**
 * Este worker atende este job? Worker de teste (fontes) atende o que pediu; o do PC, so as fontes marcadas; o
 * normal, tudo menos as marcadas. O job do teste do worker so e do worker de teste.
 */
export function ehDesteWorker(job, { fontes = null, soNoPc = false, idsNoPc = new Set() } = {}) {
  if (fontes) return fontes.includes(fonteDoJob(job));
  if (ehDeTeste(job)) return false;
  return idsNoPc.has(fonteDoJob(job)) === soNoPc;
}

/** Quantas varreduras em paralelo, de COLETA_PARALELO (1 a 10). */
export function paraleloConfigurado(valor = process.env.COLETA_PARALELO) {
  const numero = Number.parseInt(valor, 10);
  return Number.isFinite(numero) && numero >= 1 ? Math.min(numero, 10) : PARALELO_PADRAO;
}

/**
 * O job foi largado pelo dono? Vale para a tela e para o recolhimento.
 *
 * Job de antes da migracao nao tem `sinalEm`; ai vale `atualizadoEm`.
 */
export function jobLargado(job, agora = Date.now()) {
  if (job.status !== "PROCESSANDO") return false;
  const ultimoSinal = new Date(job.sinalEm ?? job.atualizadoEm).getTime();
  return agora - ultimoSinal > JOB_SEM_SINAL_MS;
}

// ---------------------------------------------------------------------------
// Enfileirar
// ---------------------------------------------------------------------------

/**
 * Poe fontes na fila. Fonte que ja tem job aberto fica de fora — pelo indice
 * unico, e nao por conferencia antes de inserir: o botao e o ciclo de 30 dias
 * podem enfileirar no mesmo instante.
 *
 * @param {{id: string, nome: string}[]} fontes
 * @param {{teste?: boolean}} [opcoes] job do teste do worker: o worker normal
 *   (sem COLETA_FONTES) nao o pega nem o recolhe. Sem a marca, o worker no ar pegou
 *   para si uma fonte de teste no meio do teste, em 16/09/2026.
 * @returns {Promise<number>} quantas entraram
 */
export async function enfileirar(fontes, { teste = false } = {}) {
  if (fontes.length === 0) return 0;
  const { count } = await prisma.job.createMany({
    data: fontes.map((fonte) => ({
      tipo: "coleta",
      fonteId: fonte.id,
      payload: {
        fonteId: fonte.id,
        fonteNome: fonte.nome,
        total: 0,
        feitas: 0,
        ...(teste ? { teste: true } : {}),
      },
    })),
    skipDuplicates: true,
  });
  return count;
}

/**
 * Enfileira as fontes cujo intervalo venceu: o ciclo automatico (intervaloHoras).
 *
 * @param {object} [opcoes]
 * @param {string[]|null} [opcoes.fontes] so estas (COLETA_FONTES)
 * @param {boolean} [opcoes.teste] marca os jobs como de teste (ver enfileirar)
 * @param {number} [opcoes.agora] o teste simula o futuro, em vez de criar fonte
 *   vencida de verdade — que o worker no ar enfileiraria para si
 */
export async function enfileirarVencidas() {
  // A coleta e manual. Mantido para chamadas antigas nao reativarem o ciclo.
  return 0;
}

// ---------------------------------------------------------------------------
// Posse
// ---------------------------------------------------------------------------

/**
 * Pega o proximo job pendente para este worker, de forma ATOMICA.
 *
 * Antes era "ache o primeiro PENDENTE, depois marque PROCESSANDO": dois workers
 * achavam o mesmo job entre uma coisa e outra, e a loja era varrida em dobro.
 * Aqui e um comando so; `FOR UPDATE SKIP LOCKED` faz o concorrente pular a linha
 * em vez de esperar por ela.
 *
 * Nunca pega job de fonte que ja tem outro em andamento (o indice unico ja
 * impede dois abertos, mas um job antigo sem `fonteId` escaparia dele).
 *
 * @param {string} workerId
 * @param {{fontes?: string[]|null, soNoPc?: boolean}} [opcoes] so jobs destas fontes (COLETA_FONTES), ou so os
 *   das fontes marcadas para o PC (COLETA_SO_PC)
 * @returns {Promise<object|null>} o job, ja PROCESSANDO e deste worker
 */
export async function pegarProximoJob(workerId, { fontes = null, soNoPc = false } = {}) {
  // Com filtro, so as fontes pedidas. Sem filtro, nunca job do teste do worker, e a fonte marcada `varridaNoPc`
  // e do worker do PC: o normal a deixa de lado, e o do PC pega SO ela.
  const daFonte = Prisma.sql`COALESCE(j."fonteId", j."payload"->>'fonteId')`;
  const marcadaNoPc = Prisma.sql`EXISTS (SELECT 1 FROM "FonteColeta" f WHERE f."id" = ${daFonte} AND f."varridaNoPc")`;
  const naoETeste = Prisma.sql`COALESCE(j."payload"->>'teste', 'false') <> 'true'`;
  const soEstas = fontes
    ? Prisma.sql`AND ${daFonte} IN (${Prisma.join(fontes)})`
    : soNoPc
      ? Prisma.sql`AND ${naoETeste} AND ${marcadaNoPc}`
      : Prisma.sql`AND ${naoETeste} AND NOT ${marcadaNoPc}`;
  /*
    HORA EM UTC, e nao a hora local do banco. As colunas sao TIMESTAMP sem fuso,
    gravadas pelo Prisma em UTC, e o Postgres desta maquina roda em
    America/Sao_Paulo: o relogio do banco comparado a elas vira hora LOCAL, tres
    horas atras. O job so seria pego tres horas depois de enfileirado, e o sinal de
    vida nasceria velho — todo job em andamento pareceria largado. Pego pelo teste
    do worker antes de ir ao ar.
  */
  const linhas = await prisma.$queryRaw`
    UPDATE "Job" SET
      "status" = 'PROCESSANDO',
      "workerId" = ${workerId},
      "sinalEm" = (NOW() AT TIME ZONE 'UTC'),
      "iniciadoEm" = (NOW() AT TIME ZONE 'UTC'),
      "tentativas" = "tentativas" + 1,
      "erro" = NULL,
      -- O andamento da tentativa anterior nao vale para esta: a tela mostrava
      -- "955 produtos" de uma varredura que acabara de recomecar.
      "payload" = "payload" || '{"total": 0, "feitas": 0, "visitadas": 0}'::jsonb,
      "atualizadoEm" = (NOW() AT TIME ZONE 'UTC')
    WHERE "id" = (
      SELECT j."id" FROM "Job" j
       WHERE j."tipo" = 'coleta'
         AND j."status" = 'PENDENTE'
         AND j."proximaTentativaEm" <= (NOW() AT TIME ZONE 'UTC')
         -- Tentativas esgotadas nao se pegam: em 16/09/2026 tres quedas seguidas
         -- do worker deixaram jobs em "tentativa 4/3". Quem fecha esses e
         -- fecharEsgotados.
         AND j."tentativas" < j."maxTentativas"
         ${soEstas}
         AND NOT EXISTS (
           SELECT 1 FROM "Job" o
            WHERE o."status" = 'PROCESSANDO'
              AND o."id" <> j."id"
              AND COALESCE(o."fonteId", o."payload"->>'fonteId') =
                  COALESCE(j."fonteId", j."payload"->>'fonteId')
         )
       ORDER BY j."criadoEm", j."id"
       LIMIT 1
       FOR UPDATE SKIP LOCKED
    )
    RETURNING *`;
  return linhas[0] ?? null;
}

/**
 * Sinal de vida do job, com o andamento mais recente.
 *
 * So escreve se o job AINDA E DESTE WORKER e esta PROCESSANDO. Devolve false
 * quando nao e mais — foi recolhido por largado, ou devolvido a fila — e o dono
 * precisa parar: continuar escreveria por cima de quem o pegou depois.
 */
export async function sinalDoJob(jobId, workerId, payload) {
  const { count } = await prisma.job.updateMany({
    where: { id: jobId, workerId, status: "PROCESSANDO" },
    data: { sinalEm: new Date(), ...(payload ? { payload } : {}) },
  });
  return count === 1;
}

/**
 * Encerra um job DESTE worker. Nada acontece se ele ja nao for dono.
 *
 * @param {object} desfecho
 * @param {"CONCLUIDO"|"FALHOU"|"PENDENTE"} desfecho.status
 * @param {object} [desfecho.payload]
 * @param {string|null} [desfecho.erro]
 * @param {Date} [desfecho.proximaTentativaEm] para PENDENTE
 * @param {boolean} [desfecho.devolverTentativa] a interrupcao nao foi culpa da
 *   loja (o worker encerrou): a tentativa gasta ao pegar o job e devolvida
 * @returns {Promise<boolean>} se o job ainda era deste worker
 */
export async function encerrarJob(jobId, workerId, desfecho) {
  const { count } = await prisma.job.updateMany({
    where: { id: jobId, workerId, status: "PROCESSANDO" },
    data: {
      status: desfecho.status,
      erro: desfecho.erro ?? null,
      workerId: null,
      sinalEm: null,
      ...(desfecho.payload ? { payload: desfecho.payload } : {}),
      ...(desfecho.proximaTentativaEm ? { proximaTentativaEm: desfecho.proximaTentativaEm } : {}),
      ...(desfecho.devolverTentativa ? { tentativas: { decrement: 1 } } : {}),
    },
  });
  return count === 1;
}

/**
 * Adia a fonte cuja varredura esgotou as tentativas (ver ESPERA_APOS_ESGOTAR_MS).
 * Nao adianta nunca: se a proxima ja estava mais longe, fica como estava.
 */
export async function adiarFonte(fonteId) {
  // Falha nao cria uma proxima varredura: o operador decide quando tentar de novo.
  // Limpa inclusive datas antigas de fontes criadas antes da coleta manual.
  await prisma.fonteColeta.updateMany({
    where: { id: fonteId },
    data: { proximaVarreduraEm: null },
  });
}

/**
 * Job criado por teste automatizado (payload.teste), que o worker normal ignora.
 *
 * O filtro fica em JS DE PROPOSITO. No SQL, `NOT (payload->'teste' = true)` vale
 * NULL para todo job SEM a chave "teste" — e NULL nao passa no WHERE. A consulta
 * parecia certa e nao devolvia job real nenhum: jobs largados por worker morto
 * ficavam "em andamento" para sempre, e como o indice Job_fonte_aberta so admite
 * um job aberto por fonte, a fonte nunca mais voltava a fila. Foi o que prendeu a
 * Santana e a Eletrogate em 18/09/2026, depois de a maquina cair sem parada limpa.
 *
 * Sao poucos jobs abertos por vez; filtrar em memoria nao custa nada.
 */
const ehDeTeste = (job) => job.payload?.teste === true;

/**
 * Devolve a fila os jobs largados: PROCESSANDO sem sinal ha JOB_SEM_SINAL_MS.
 *
 * Roda a cada volta do worker, esteja ele ocupado ou nao — antes rodava so entre
 * um job e outro, e a Smartkits ficou quatro horas "em andamento" largada enquanto
 * o worker varria a Impacto CNC.
 *
 * O job de um worker vivo nunca e pego: o sinal dele e escrito por relogio, a cada
 * SINAL_MS. A tentativa fica gasta (a queda pode ter sido causada pela loja);
 * esgotada, o job falha e a fonte e adiada.
 *
 * @param {object} [opcoes]
 * @param {number} [opcoes.agora]
 * @param {number} [opcoes.semSinalHaMs] zero na PARTIDA do worker: com a trava
 *   garantindo que nao ha outro no ar, todo job em andamento e de processo morto,
 *   e esperar dois minutos seria so atraso
 * @param {string[]|null} [opcoes.fontes] so jobs destas fontes (COLETA_FONTES)
 * @param {boolean} [opcoes.soNoPc] so jobs das fontes marcadas para o PC (COLETA_SO_PC). Na PARTIDA o worker normal
 *   (semSinalHaMs menor que o limite) nao recolhe job de fonte do PC: ele e de um worker VIVO, so que em outra
 *   maquina. Na volta normal ele recolhe, sim, o que passou do limite sem sinal: o PC desligou no meio da varredura,
 *   e sem isto a tela mostraria "varrendo" para sempre.
 * @returns {Promise<{fonteNome: string, desfecho: string}[]>}
 */
export async function recolherLargados({
  agora = Date.now(),
  semSinalHaMs = JOB_SEM_SINAL_MS,
  fontes = null,
  soNoPc = false,
} = {}) {
  const limite = new Date(agora - semSinalHaMs);
  const abertos = await prisma.job.findMany({
    where: {
      tipo: "coleta",
      status: "PROCESSANDO",
      ...(fontes ? { fonteId: { in: fontes } } : {}),
      OR: [{ sinalEm: { lte: limite } }, { sinalEm: null, atualizadoEm: { lte: limite } }],
    },
  });
  const incluiOPc = !fontes && !soNoPc && semSinalHaMs >= JOB_SEM_SINAL_MS;
  const idsNoPc = fontes || incluiOPc ? new Set() : new Set(await idsDasFontesNoPc());
  const largados = abertos.filter((job) => ehDesteWorker(job, { fontes, soNoPc, idsNoPc }));

  const recolhidos = [];
  for (const job of largados) {
    const esgotou = job.tentativas >= job.maxTentativas;
    // Condicionado ao mesmo sinal lido: se o dono deu sinal entre a leitura e
    // aqui, ele esta vivo e o job continua dele.
    const { count } = await prisma.job.updateMany({
      where: { id: job.id, status: "PROCESSANDO", sinalEm: job.sinalEm, workerId: job.workerId },
      data: {
        status: esgotou ? "FALHOU" : "PENDENTE",
        erro: "o worker parou de dar sinal no meio desta varredura",
        workerId: null,
        sinalEm: null,
        proximaTentativaEm: new Date(agora),
        payload: { ...job.payload, total: 0, feitas: 0 },
      },
    });
    if (count === 0) continue;

    const fonteId = job.fonteId ?? job.payload?.fonteId;
    if (esgotou && fonteId) await adiarFonte(fonteId, agora);
    recolhidos.push({
      fonteNome: job.payload?.fonteNome ?? job.id,
      desfecho: esgotou ? "sem tentativas, marcada como falha" : "de volta a fila",
    });
  }
  return recolhidos;
}

/**
 * Fecha como FALHOU o job pendente que ja gastou todas as tentativas, e adia a
 * fonte. Sem isto ele ficaria na fila para sempre — pegarProximoJob nao o pega —,
 * e o indice de um job aberto por fonte impediria a fonte de voltar a fila.
 *
 * @returns {Promise<string[]>} nomes das fontes fechadas
 */
export async function fecharEsgotados({ fontes = null, soNoPc = false } = {}) {
  const pendentes = await prisma.job.findMany({
    where: {
      tipo: "coleta",
      status: "PENDENTE",
      ...(fontes ? { fonteId: { in: fontes } } : {}),
    },
    select: { id: true, tentativas: true, maxTentativas: true, fonteId: true, payload: true, erro: true },
  });

  // Fechar o que esgotou as tentativas e limpeza de estado: o worker normal fecha tambem as fontes do PC.
  const idsNoPc = fontes || !soNoPc ? new Set() : new Set(await idsDasFontesNoPc());
  const fechadas = [];
  for (const job of pendentes.filter(
    (item) => item.tentativas >= item.maxTentativas && ehDesteWorker(item, { fontes, soNoPc, idsNoPc }),
  )) {
    const { count } = await prisma.job.updateMany({
      where: { id: job.id, status: "PENDENTE" },
      data: { status: "FALHOU", erro: `tentativas esgotadas${job.erro ? `: ${job.erro}` : ""}`.slice(0, 500) },
    });
    if (count === 0) continue;
    const fonteId = job.fonteId ?? job.payload?.fonteId;
    if (fonteId) await adiarFonte(fonteId);
    fechadas.push(job.payload?.fonteNome ?? job.id);
  }
  return fechadas;
}

// ---------------------------------------------------------------------------
// Workers
// ---------------------------------------------------------------------------

export async function registrarWorker({ id, pid, maquina, paralelo }) {
  await prisma.workerColeta.create({ data: { id, pid, maquina, paralelo } });
  // Registro de worker encerrado ha mais de um dia so ocupa espaco.
  await prisma.workerColeta.deleteMany({
    where: {
      id: { not: id },
      sinalEm: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });
}

export async function sinalDoWorker(id) {
  await prisma.workerColeta.update({ where: { id }, data: { sinalEm: new Date() } });
}

export async function encerrarWorker(id) {
  await prisma.workerColeta.updateMany({ where: { id }, data: { encerradoEm: new Date() } });
}

/** O worker no ar, ou null. Para a tela. */
export async function workerNoAr(agora = Date.now()) {
  return prisma.workerColeta.findFirst({
    where: { encerradoEm: null, sinalEm: { gte: new Date(agora - WORKER_SEM_SINAL_MS) } },
    orderBy: { sinalEm: "desc" },
  });
}

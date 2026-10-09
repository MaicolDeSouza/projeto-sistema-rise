import "dotenv/config";

/**
 * O processo que VARRE. Quem o sobe e o supervisor (scripts/worker.js), que o
 * religa quando cai — nao rode este arquivo direto, rode `npm run worker`.
 *
 * Reescrito em 16/09/2026. O desenho, e o defeito que cada parte fecha:
 *
 * UM WORKER POR VEZ, garantido pelo Postgres (pg_try_advisory_lock numa conexao
 * propria). A trava morre junto com a conexao, entao processo morto nunca a deixa
 * presa. Antes, dois workers subiam sem se ver — um laco de shell de uma sessao
 * antiga religou um worker enquanto outro rodava, e os dois disputaram a fila.
 *
 * ATE `COLETA_PARALELO` VARREDURAS AO MESMO TEMPO (5), cada uma numa loja. O
 * job e pego de forma atomica (fila.pegarProximoJob).
 *
 * SINAL DE VIDA POR RELOGIO, e nao por andamento: a cada SINAL_MS o worker marca
 * a si mesmo e a cada job seu. Loja lenta nao parece worker morto, e worker morto
 * aparece em dois minutos.
 *
 * VIGIA DE VARREDURA PARADA: sem abrir pagina ha SEM_ATIVIDADE_MS, a varredura e
 * cancelada e volta a fila. E a rede de seguranca para o que nenhum teto previu —
 * a leitura do corpo sem teto de tempo prendeu o worker assim, para sempre.
 *
 * ENCERRAR NAO GASTA TENTATIVA: o job volta a fila como estava, e o lote aberto e
 * gravado antes de sair (coletar.js).
 *
 * RETOMADA: a data de inicio da varredura fica no job. A tentativa seguinte — depois
 * de queda, encerramento ou recolhimento — nao reabre os produtos que os lotes ja
 * gravaram desde entao: continua de onde parou (com lote de 10, perde ate 9).
 *
 * ERRO FATAL (excecao fora de qualquer try, como o assert interno do undici que
 * derrubou o worker na Casa da Robotica) devolve os jobs e sai com codigo 1; o
 * supervisor religa.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const os = await import("node:os");
const { randomUUID } = await import("node:crypto");
const { existsSync, rmSync } = await import("node:fs");
const { default: pg } = await import("pg");

const { prisma } = await import("../src/lib/db.js");
const { varrerFonte } = await import("../src/lib/coleta/coletar.js");
const { coletaPausada } = await import("../src/lib/coleta/controle.js");
const { ultimaRespostaDe } = await import("../src/lib/coleta/buscar.js");
const fila = await import("../src/lib/coleta/fila.js");
const { tirarFotoMensal } = await import("../src/lib/coleta/fotos.js");
const { servidorEhWindows } = await import("../src/lib/copiaLocal.js");

/// De quanto em quanto tempo se confere se a foto mensal e devida. A foto e uma por
/// mes, entao a conferencia e barata; a hora so evita consultar o banco a cada volta.
const CONFERE_FOTO_MS = 60 * 60 * 1000;
let fotoConferidaEm = 0;

/// Codigo de saida quando ja ha outro worker no ar. O supervisor nao religa.
const SAIDA_OUTRO_WORKER = 3;
/// Codigo de saida do encerramento pedido por `npm run worker:parar`. O supervisor
/// tambem sai, em vez de religar.
const SAIDA_PARADO = 4;
/// Configuracao que nao adianta tentar de novo (modos que se contradizem, ou o do PC apontado para o banco errado).
/// O supervisor tambem sai, em vez de religar.
const SAIDA_CONFIGURACAO = 5;
/// O worker do PC varreu tudo o que era dele e saiu de proposito (COLETA_PC_SAIR=1, o padrao do `npm run worker:pc`).
/// O supervisor sai junto, em vez de religar.
const SAIDA_CONCLUIDO = 6;

/// Pedido de parada: um arquivo, criado por scripts/parar-worker.js. E o jeito de
/// encerrar do jeito certo sem Ctrl+C — no Windows, matar o processo nao da ao
/// worker a chance de devolver os jobs.
const PEDIDO_DE_PARADA = new URL("../dados/worker.parar", import.meta.url);

/// Volta do laco principal quando nao ha vaga nem job: recolher largados,
/// enfileirar vencidas, pegar job.
const VOLTA_MS = 5 * 1000;

/// Quanto se espera a varredura cancelada terminar sozinha (gravando o lote
/// aberto) antes de da-la por presa.
const GRACA_MS = 60 * 1000;

const WORKER_ID = randomUUID();
const PARALELO = fila.paraleloConfigurado();
/// So estas fontes (COLETA_FONTES), ou todas.
const FONTES = fila.fontesConfiguradas();
/// Worker do PC (COLETA_SO_PC=1): so as fontes marcadas `varridaNoPc`, gravando no banco da VPS por um tunel.
const SO_NO_PC = fila.soNoPcConfigurado();
/// O worker do PC termina sozinho quando nao ha mais job aberto das fontes dele. Sem isto ele ficaria esperando, como o
/// da VPS; `npm run worker:pc -- --ficar` desliga.
const SAIR_AO_ACABAR = SO_NO_PC && process.env.COLETA_PC_SAIR === "1";
/// So esta fonte (o "Varrer agora" da linha, no Rise do PC, que roda `worker-pc.js --fonte=<id>`). Sem ela, o worker do
/// PC poe na fila todas as marcadas, como no `npm run worker:pc` do terminal.
const FONTE_DO_PC = SO_NO_PC ? String(process.env.COLETA_PC_FONTE ?? "").trim() || null : null;

/** Hostname que a varredura visita: o dominio da fonte, com ou sem protocolo. */
function hostnameDa(fonte) {
  try {
    const endereco = /^https?:\/\//i.test(fonte.dominio) ? fonte.dominio : `https://${fonte.dominio}`;
    return new URL(endereco).hostname;
  } catch {
    return fonte.dominio;
  }
}

/** @type {Map<string, {controle: AbortController, estado: object, fonteNome: string}>} */
const emCurso = new Map();

let encerrando = false;
/// Varredura que nao terminou nem depois de cancelada: a promessa segue viva e
/// pode escrever no banco. O processo precisa sair para mata-la.
let precisaReiniciar = false;
let trava = null;
let acordar = () => {};

const hora = () => new Date().toLocaleTimeString("pt-BR");
const log = (texto) => console.log(`[${hora()}] ${texto}`);
const logErro = (texto) => console.error(`[${hora()}] ${texto}`);
const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
const mensagem = (erro) => String(erro?.message ?? erro);

// ---------------------------------------------------------------------------
// Trava: um worker por vez
// ---------------------------------------------------------------------------

async function obterTrava() {
  const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await cliente.connect();
  const { rows } = await cliente.query("SELECT pg_try_advisory_lock($1) AS ok", [
    fila.travaDoWorker(FONTES, SO_NO_PC),
  ]);
  if (!rows[0].ok) {
    await cliente.end();
    return null;
  }
  // Conexao da trava caiu = trava perdida: outro worker pode subir. Sair e o
  // unico jeito de nao haver dois varrendo.
  cliente.on("error", (erro) => fatal(new Error(`conexao da trava caiu: ${mensagem(erro)}`)));
  cliente.on("end", () => {
    if (!encerrando) fatal(new Error("conexao da trava foi encerrada"));
  });
  return cliente;
}

// ---------------------------------------------------------------------------
// Uma varredura
// ---------------------------------------------------------------------------

async function concluir(job, fonte, resultado) {
  const eraMeu = await fila.encerrarJob(job.id, WORKER_ID, {
    status: resultado.erro ? "FALHOU" : "CONCLUIDO",
    erro: resultado.erro ?? null,
    payload: { ...job.payload, ...resultado },
  });
  if (!eraMeu) {
    log(`${fonte.nome}: terminou, mas o job ja nao era deste worker — nada gravado na fila`);
    return;
  }

  await prisma.fonteColeta.update({
    where: { id: fonte.id },
    data: {
      ultimaVarreduraEm: new Date(),
      proximaVarreduraEm: null,
      /*
        SO ESCREVE QUANDO A VARREDURA PROVOU O TOTAL. Espalhar o resultado inteiro
        gravaria `null` na varredura que nao conseguiu medir o catalogo, APAGANDO
        um numero bom da semana passada. Nao saber quantos sao nao e saber que sao
        zero.
      */
      ...(typeof resultado.produtosNoSite === "number"
        ? {
            produtosNoSite: resultado.produtosNoSite,
            produtosNoSiteParcial: resultado.produtosNoSiteParcial ?? false,
          }
        : {}),
    },
  });

  // Na via de arquivo o `total` e a contagem de ARQUIVOS: "X/Y produtos" nao
  // quereria dizer nada.
  const viaArquivo = resultado.contagem !== undefined;
  const quanto = viaArquivo
    ? `${resultado.produtos} produto(s)`
    : `${resultado.produtos} produto(s) em ${resultado.visitas ?? 0} pagina(s)`;
  log(
    `${fonte.nome}: ${resultado.erro ? "FALHOU" : "concluida"} · ${quanto}` +
      (resultado.gravacao
        ? ` · ${resultado.gravacao.novos} novo(s), ${resultado.gravacao.precosMudaram} mudanca(s) de preco`
        : "") +
      (resultado.erro ? ` · ${resultado.erro}` : ""),
  );
}

/**
 * O que fazer com o job quando a varredura nao terminou por conta propria.
 *
 * O payload devolvido e o ATUAL (com `inicioDaColeta`), e nao o do momento em que
 * o job foi pego: e a data de inicio que permite a proxima tentativa retomar.
 */
async function interromper(job, fonteNome, motivo, erro, payloadAtual = job.payload) {
  if (motivo?.tipo === "posse-perdida") {
    log(`${fonteNome}: o job deixou de ser deste worker — varredura abandonada`);
    return;
  }

  if (motivo?.tipo === "encerrando" || motivo?.tipo === "pausa") {
    await fila.encerrarJob(job.id, WORKER_ID, {
      status: "PENDENTE",
      erro: motivo?.tipo === "pausa"
        ? "varredura pausada pelo operador; continua ao retomar"
        : "worker encerrado no meio da varredura; recomeca na proxima partida",
      proximaTentativaEm: new Date(),
      devolverTentativa: true,
      payload: { ...payloadAtual, total: 0, feitas: 0 },
    });
    log(`${fonteNome}: devolvida a fila (${motivo?.tipo === "pausa" ? "pausada" : "worker encerrando"})`);
    return;
  }

  // Parada pelo vigia ou erro da propria varredura: gasta a tentativa.
  const texto = motivo?.tipo === "parada" ? motivo.mensagem : mensagem(erro);
  const esgotou = job.tentativas >= job.maxTentativas;
  await fila.encerrarJob(job.id, WORKER_ID, {
    status: esgotou ? "FALHOU" : "PENDENTE",
    erro: texto,
    proximaTentativaEm: new Date(Date.now() + fila.esperaAposFalhaMs(job.tentativas)),
    payload: { ...payloadAtual, total: 0, feitas: 0 },
  });
  const fonteId = job.fonteId ?? job.payload?.fonteId;
  if (esgotou && fonteId) await fila.adiarFonte(fonteId);

  logErro(
    `${fonteNome}: ${texto} · ` +
      (esgotou
        ? `tentativas esgotadas (${job.tentativas}/${job.maxTentativas}); fonte adiada`
        : `tenta de novo em ${fila.esperaAposFalhaMs(job.tentativas) / 60000} min`),
  );
}

async function executar(job) {
  const fonteNome = job.payload?.fonteNome ?? job.id;
  const controle = new AbortController();
  const estado = { payload: { ...job.payload }, ultimaAtividade: Date.now() };
  emCurso.set(job.id, { controle, estado, fonteNome });
  // Job pego no instante em que o encerramento comecou (a consulta ja estava em
  // voo): nasce cancelado e volta a fila, em vez de segurar a saida por uma
  // varredura inteira.
  if (encerrando) controle.abort({ tipo: "encerrando" });

  try {
    const fonte = await prisma.fonteColeta.findUnique({
      where: { id: job.fonteId ?? job.payload?.fonteId },
    });
    if (!fonte) {
      await fila.encerrarJob(job.id, WORKER_ID, { status: "FALHOU", erro: "Fonte nao existe mais." });
      return;
    }

    estado.hostname = hostnameDa(fonte);

    /*
      RETOMADA: a data de inicio da varredura mora no job e sobrevive a queda,
      ao encerramento e ao recolhimento. Tentativa nova de um job que ja tinha
      comecado continua de onde os lotes pararam; job novo (ou velho demais)
      comeca agora. Gravada ja, antes de colher: uma queda no primeiro minuto
      tambem precisa dela.
    */
    const anterior = Date.parse(job.payload?.inicioDaColeta ?? "");
    const retomando = Number.isFinite(anterior) && Date.now() - anterior < fila.RETOMADA_VALE_MS;
    const inicioDaVarredura = retomando ? new Date(anterior) : new Date();
    estado.payload = {
      ...estado.payload,
      inicioDaColeta: inicioDaVarredura.toISOString(),
      retomados: 0,
      segundosPorProduto: null,
    };
    await fila.sinalDoJob(job.id, WORKER_ID, estado.payload);

    log(
      `${fonte.nome}: ${retomando ? "retomando" : "varrendo"} (${fonte.dominio}) · ` +
        `tentativa ${job.tentativas}/${job.maxTentativas}`,
    );

    // O andamento so vai para a MEMORIA; quem grava e o relogio do sinal de vida.
    // Gravar a cada pagina eram milhares de escritas so para mover uma barra.
    const varredura = varrerFonte(
      fonte,
      ({ total, feitas, visitadas, retomados = 0 }) => {
        const agora = Date.now();
        // Retomados: produtos ja gravados antes de uma interrupcao, contados sem
        // abrir a pagina (a colheita informa quantos).
        const novos = feitas - retomados;

        // SEGUNDOS POR PRODUTO, medidos entre o primeiro e o ultimo produto NOVO
        // desta passada: a descoberta (catalogo, sitemap) e os retomados, que nao
        // custam visita, nao entram na conta.
        if (novos >= 1 && !estado.primeiroNovoEm) estado.primeiroNovoEm = agora;
        const segundosPorProduto =
          novos >= 2 ? (agora - estado.primeiroNovoEm) / 1000 / (novos - 1) : null;

        estado.payload = {
          ...estado.payload,
          total,
          feitas,
          visitadas: visitadas ?? estado.payload.visitadas ?? null,
          retomados,
          segundosPorProduto:
            segundosPorProduto === null ? null : Math.round(segundosPorProduto * 10) / 10,
        };
        estado.ultimaAtividade = agora;
      },
      { sinal: controle.signal, inicioDaVarredura: retomando ? inicioDaVarredura : null },
    ).then(
      (resultado) => ({ resultado }),
      (erro) => ({ erro }),
    );

    const cancelado = new Promise((resolver) =>
      controle.signal.addEventListener("abort", () => resolver(null), { once: true }),
    );

    let desfecho = await Promise.race([varredura, cancelado]);
    if (desfecho === null) {
      // Cancelada: espera ela sair sozinha, gravando o lote aberto. Se nao sair,
      // esta presa num await que nenhum sinal alcanca.
      desfecho = await Promise.race([varredura, dormir(GRACA_MS).then(() => ({ presa: true }))]);
    }

    const motivo = controle.signal.aborted ? controle.signal.reason : null;

    if (desfecho.presa) {
      precisaReiniciar = true;
      await interromper(job, fonte.nome, motivo, new Error("varredura nao respondeu ao cancelamento"), estado.payload);
      logErro(`${fonte.nome}: varredura presa mesmo cancelada — o worker vai reiniciar`);
      return;
    }

    if (desfecho.erro || motivo) {
      await interromper(job, fonte.nome, motivo, desfecho.erro, estado.payload);
      return;
    }

    await concluir(job, fonte, desfecho.resultado);
  } catch (erro) {
    // Falha no banco ao encerrar: o job continua PROCESSANDO sem sinal e e
    // recolhido em dois minutos. Nada a fazer aqui alem de registrar.
    logErro(`${fonteNome}: erro ao encerrar o job: ${mensagem(erro)}`);
  } finally {
    emCurso.delete(job.id);
    acordar();
  }
}

// ---------------------------------------------------------------------------
// Relogios
// ---------------------------------------------------------------------------

/**
 * Sinal de vida do worker e dos jobs, e o vigia. Agendado DEPOIS de terminar
 * (setTimeout, nao setInterval): banco lento nao empilha sinais.
 */
async function sinalDeVida() {
  try {
    await fila.sinalDoWorker(WORKER_ID);

    if (coletaPausada()) {
      for (const { controle } of emCurso.values()) {
        if (!controle.signal.aborted) controle.abort({ tipo: "pausa" });
      }
    }

    for (const [jobId, { controle, estado, fonteNome }] of emCurso) {
      if (controle.signal.aborted) continue;

      const aindaMeu = await fila.sinalDoJob(jobId, WORKER_ID, estado.payload);
      if (!aindaMeu) {
        controle.abort({ tipo: "posse-perdida" });
        continue;
      }

      // Atividade = andamento em produtos OU qualquer resposta do site (catalogo,
      // sitemap, robots): fase de descoberta longa nao e varredura parada.
      const ultima = Math.max(estado.ultimaAtividade, ultimaRespostaDe(estado.hostname));
      const parada = Date.now() - ultima;
      if (parada > fila.SEM_ATIVIDADE_MS) {
        const minutos = Math.round(parada / 60000);
        logErro(`${fonteNome}: ${minutos} min sem resposta do site — cancelando`);
        controle.abort({ tipo: "parada", mensagem: `varredura parada: ${minutos} min sem resposta do site` });
      }
    }
  } catch (erro) {
    // Banco fora por instantes nao derruba nada: o sinal seguinte tenta de novo.
    logErro(`sinal de vida nao gravado: ${mensagem(erro)}`);
  }

  if (!encerrando) setTimeout(sinalDeVida, fila.SINAL_MS);
}

async function laco() {
  while (!encerrando) {
    try {
      if (!coletaPausada()) {
        for (const { fonteNome, desfecho } of await fila.recolherLargados({ fontes: FONTES, soNoPc: SO_NO_PC })) {
          log(`${fonteNome}: largada sem sinal — ${desfecho}`);
        }

        for (const fonteNome of await fila.fecharEsgotados({ fontes: FONTES, soNoPc: SO_NO_PC })) {
          logErro(`${fonteNome}: tentativas esgotadas — marcada como falha`);
        }

        // O operador inicia as varreduras manualmente. Nao ha ciclo automatico.
        while (!coletaPausada() && !encerrando && !precisaReiniciar && emCurso.size < PARALELO) {
          const job = await fila.pegarProximoJob(WORKER_ID, { fontes: FONTES, soNoPc: SO_NO_PC });
          if (!job) break;
          // Nao aguardado: as varreduras correm juntas. `executar` nunca rejeita.
          executar(job);
        }
      }

      // Fora do `coletaPausada`: pausar a coleta nao pode custar a foto do mes. O
      // worker de teste (COLETA_FONTES) nao a tira, para nao gravar no banco de verdade. O do PC tambem nao: a foto
      // e do worker da VPS, que roda sempre.
      if (!FONTES && !SO_NO_PC && Date.now() - fotoConferidaEm >= CONFERE_FOTO_MS) {
        fotoConferidaEm = Date.now();
        const foto = await tirarFotoMensal();
        if (foto.tirou) {
          log(`foto mensal ${foto.mes}: ${foto.coleta} produto(s) de fornecedor/concorrente, ${foto.produtos} da loja`);
        }
      }
    } catch (erro) {
      logErro(`erro na volta do worker: ${mensagem(erro)}`);
    }

    // So o worker normal atende o pedido: o de teste (COLETA_FONTES) nao o consome.
    if (!FONTES && existsSync(PEDIDO_DE_PARADA)) {
      await sair(SAIDA_PARADO, "pedido de parada (npm run worker:parar)");
      return;
    }

    if (precisaReiniciar && emCurso.size === 0) {
      await sair(1, "reiniciando por varredura presa");
      return;
    }

    // Worker do PC: nada varrendo e nada na fila das fontes dele = acabou. Fonte que falhou com tentativa pendente
    // ainda conta como aberta, entao o worker espera a espera crescente passar e tenta de novo, como o da VPS.
    if (SAIR_AO_ACABAR && !encerrando && emCurso.size === 0 && !coletaPausada() && (await fila.jobsAbertosDoPc()) === 0) {
      await sair(SAIDA_CONCLUIDO, "todas as fontes marcadas para o PC foram varridas");
      return;
    }

    // Dorme ate a proxima volta OU ate uma varredura liberar vaga.
    await new Promise((resolver) => {
      const relogio = setTimeout(resolver, VOLTA_MS);
      acordar = () => {
        clearTimeout(relogio);
        resolver();
      };
    });
  }
}

// ---------------------------------------------------------------------------
// Partida e saida
// ---------------------------------------------------------------------------

let saindo = null;

/** Encerra do jeito certo: cancela, espera gravar, devolve a fila, solta a trava. */
function sair(codigo, motivo) {
  if (saindo) return saindo;
  encerrando = true;
  acordar();

  saindo = (async () => {
    log(`encerrando (${motivo})...`);
    // Rede de seguranca: nenhum encerramento passa disso.
    setTimeout(() => process.exit(codigo), GRACA_MS + 30 * 1000).unref();

    for (const { controle } of emCurso.values()) {
      if (!controle.signal.aborted) controle.abort({ tipo: "encerrando" });
    }
    while (emCurso.size > 0) await dormir(250);

    try {
      await fila.encerrarWorker(WORKER_ID);
    } catch {
      // Sem banco, o registro envelhece e a tela o da por fora em um minuto.
    }
    try {
      await trava?.end();
      await prisma.$disconnect();
    } catch {
      // Saindo de qualquer jeito.
    }
    log("worker encerrado.");
    process.exit(codigo);
  })();
  return saindo;
}

/**
 * Excecao que escapou de tudo. O estado do processo nao e mais confiavel: devolve
 * os jobs (gastando a tentativa — a causa pode ser a loja) e sai para o supervisor
 * religar.
 */
function fatal(erro) {
  if (saindo) return;
  logErro(`ERRO FATAL: ${erro?.stack ?? mensagem(erro)}`);
  saindo = (async () => {
    encerrando = true;
    setTimeout(() => process.exit(1), 10 * 1000).unref();
    for (const { controle } of emCurso.values()) controle.abort({ tipo: "fatal" });
    try {
      // Na ultima tentativa, o job FALHA e a fonte e adiada; antes, volta a fila.
      // Devolver todos como PENDENTE, como era, deixou jobs em "tentativa 4/3".
      const meus = await prisma.job.findMany({
        where: { workerId: WORKER_ID, status: "PROCESSANDO" },
      });
      for (const job of meus) {
        const esgotou = job.tentativas >= job.maxTentativas;
        await prisma.job.updateMany({
          where: { id: job.id, workerId: WORKER_ID, status: "PROCESSANDO" },
          data: {
            status: esgotou ? "FALHOU" : "PENDENTE",
            workerId: null,
            sinalEm: null,
            erro: `o worker caiu: ${mensagem(erro)}`.slice(0, 500),
            proximaTentativaEm: new Date(Date.now() + 60 * 1000),
          },
        });
        const fonteId = job.fonteId ?? job.payload?.fonteId;
        if (esgotou && fonteId) await fila.adiarFonte(fonteId);
      }
      await fila.encerrarWorker(WORKER_ID);
    } catch {
      // O recolhimento de largados cobre, em dois minutos.
    }
    process.exit(1);
  })();
}

// Supervisor morto fecha a saida do worker: a proxima escrita daria EPIPE e
// derrubaria o processo no meio do encerramento, sem devolver os jobs.
process.stdout.on("error", () => {});
process.stderr.on("error", () => {});

process.on("uncaughtException", fatal);
process.on("unhandledRejection", fatal);
for (const sinal of ["SIGINT", "SIGTERM", "SIGBREAK"]) {
  process.on(sinal, () => sair(0, `sinal ${sinal}`));
}
// O supervisor pede para encerrar por mensagem: no Windows, sinal entre processos
// mata sem aviso.
process.on("message", (mensagemRecebida) => {
  if (mensagemRecebida?.tipo === "encerrar") sair(0, "pedido do supervisor");
});
// Supervisor encerrado normalmente fecha o canal. Morto a forca, no Windows nao
// da tempo: o Node poe o filho num "job object" que o mata junto com o pai
// (medido em 16/09/2026, ate com filho sem canal nenhum). Ai os jobs ficam
// PROCESSANDO e o proximo worker os recolhe na partida.
process.on("disconnect", () => sair(0, "supervisor saiu"));

const contradicao = fila.modoInvalido(FONTES, SO_NO_PC);
if (contradicao) {
  logErro(contradicao);
  await prisma.$disconnect();
  process.exit(SAIDA_CONFIGURACAO);
}
if (SO_NO_PC) {
  // O worker do PC grava no banco da VPS. Apontado para o banco local (um servidor Windows), ele varreria para uma
  // copia que a proxima `copia:atualizar` apaga, e a VPS nunca veria o resultado. O tunel e aberto por
  // `npm run worker:pc`, que passa o endereco certo so a este processo.
  const [{ versao }] = await prisma.$queryRaw`SELECT version() AS versao`;
  // COLETA_PC_PERMITIR_BANCO_LOCAL=1 e SO para provar o caminho de "terminar sozinho" contra o banco local, onde nao ha
  // nada de verdade a perder. A imagem de producao (RISE_PRODUCAO=1) a ignora, como ignora COLETA_PERMITIR_REDE_LOCAL.
  const bancoLocalPermitidoNoTeste = process.env.COLETA_PC_PERMITIR_BANCO_LOCAL === "1" && !process.env.RISE_PRODUCAO;
  if (servidorEhWindows(versao) && !bancoLocalPermitidoNoTeste) {
    logErro(
      "COLETA_SO_PC esta apontado para um banco do Windows (a copia local). O worker do PC grava no banco da VPS: " +
        "use `npm run worker:pc`.",
    );
    await prisma.$disconnect();
    process.exit(SAIDA_CONFIGURACAO);
  }
}

trava = await obterTrava();
if (!trava) {
  const outro = await fila.workerNoAr();
  logErro(
    "ja ha um worker no ar" +
      (outro ? ` (pid ${outro.pid}, desde ${outro.iniciadoEm.toLocaleString("pt-BR")})` : "") +
      ". Este nao sobe.",
  );
  await prisma.$disconnect();
  process.exit(SAIDA_OUTRO_WORKER);
}

// Pedido de parada que sobrou de antes da partida nao vale para este worker.
if (!FONTES && existsSync(PEDIDO_DE_PARADA)) {
  rmSync(PEDIDO_DE_PARADA, { force: true });
  log("pedido de parada antigo descartado");
}

await fila.registrarWorker({
  id: WORKER_ID,
  pid: process.pid,
  maquina: os.hostname(),
  paralelo: PARALELO,
});

// Com a trava na mao, todo job em andamento e de um processo que morreu.
for (const { fonteNome, desfecho } of await fila.recolherLargados({ semSinalHaMs: 0, fontes: FONTES, soNoPc: SO_NO_PC })) {
  log(`${fonteNome}: largada pelo worker anterior — ${desfecho}`);
}

log(
  `worker no ar · pid ${process.pid} · ate ${PARALELO} varreduras em paralelo` +
    (FONTES ? ` · so as fontes ${FONTES.join(", ")}` : "") +
    (SO_NO_PC ? " · so as fontes marcadas para varrer no PC" : ""),
);
if (SO_NO_PC) {
  // Quem roda `npm run worker:pc` (ou clica "Varrer agora" no Rise do PC) esta pedindo a varredura: nao precisa
  // clicar na tela da VPS.
  const { fontes, enfileiradas } = await fila.enfileirarFontesDoPc({ fonteId: FONTE_DO_PC });
  if (FONTE_DO_PC && fontes === 0) {
    // A copia do PC achava a fonte marcada, e a VPS nao: nada a varrer, e religar repetiria a recusa.
    logErro(
      `a fonte ${FONTE_DO_PC} nao existe na VPS, nao esta marcada "Varrer pelo PC" la, ou esta pausada. ` +
        "Confira na tela Fontes da VPS e atualize a copia do PC.",
    );
    await sair(SAIDA_CONFIGURACAO, "fonte pedida nao e do PC na VPS");
  }
  log(
    fontes === 0
      ? "nenhuma fonte ativa marcada para varrer pelo PC"
      : `${fontes} fonte(s) marcada(s) para o PC; ${enfileiradas} entrou(aram) na fila agora` +
          (enfileiradas < fontes ? " (as outras ja estavam na fila ou varrendo)" : ""),
  );
}
sinalDeVida();
await laco();

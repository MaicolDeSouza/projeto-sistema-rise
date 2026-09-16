import "dotenv/config";

/**
 * Worker da coleta.
 *
 * Roda FORA do Next, em processo separado, por duas razoes: uma varredura de
 * dez lojas passa de uma hora e nao caberia numa requisicao HTTP, e dentro do
 * dev server ela morreria no primeiro hot reload.
 *
 * O relogio mora no BANCO, nao aqui: a cada volta o worker pergunta quais
 * fontes tem proximaVarreduraEm vencido. Isso importa porque o sistema roda na
 * maquina do dono, que dorme e reinicia — com setInterval, dois dias desligada
 * virariam tres varreduras acumuladas ao voltar; assim vira uma.
 *
 *   npm run worker
 *
 * O import e dinamico porque os modulos usam o alias "@/" do Next, que o Node
 * puro nao resolve — o registro abaixo mapeia na mao antes de carregar.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");

register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("../src/lib/db.js");
const { varrerFonte } = await import("../src/lib/coleta/coletar.js");
const { ORFAO_APOS_MS, ORFAO_NA_PARTIDA_MS, SINAL_DE_VIDA_MS } = await import(
  "../src/lib/coleta/fila.js"
);

/// De quanto em quanto o worker acorda para olhar a fila. Curto o bastante para
/// o botao "Atualizar tabelas" parecer imediato, longo o bastante para nao
/// martelar o banco.
const INTERVALO_MS = 10 * 1000;

/// Quantas paginas entre uma gravacao de progresso e outra. Gravar a cada
/// pagina somaria vinte mil escritas por varredura so para mover uma barra.
const PASSO_PROGRESSO = 25;

let encerrando = false;

function agora() {
  return new Date().toLocaleTimeString("pt-BR");
}

/** Enfileira as fontes cujo intervalo venceu. E o ciclo automatico de 30 dias (intervaloHoras). */
async function enfileirarVencidas() {
  const vencidas = await prisma.fonteColeta.findMany({
    where: {
      ativa: true,
      robotsPermite: true,
      proximaVarreduraEm: { lte: new Date() },
    },
    select: { id: true, nome: true },
  });

  if (vencidas.length === 0) return 0;

  // Uma fonte ja na fila nao entra de novo: sem isso, uma varredura demorada
  // acumularia um job novo a cada volta do worker.
  const jaNaFila = await prisma.job.findMany({
    where: { tipo: "coleta", status: { in: ["PENDENTE", "PROCESSANDO"] } },
    select: { payload: true },
  });
  const idsNaFila = new Set(jaNaFila.map((job) => job.payload?.fonteId));

  const novas = vencidas.filter((fonte) => !idsNaFila.has(fonte.id));
  if (novas.length === 0) return 0;

  await prisma.job.createMany({
    data: novas.map((fonte) => ({
      tipo: "coleta",
      payload: { fonteId: fonte.id, fonteNome: fonte.nome, total: 0, feitas: 0 },
    })),
  });

  console.log(`[${agora()}] ${novas.length} fonte(s) venceram e foram enfileiradas`);
  return novas.length;
}

async function processar(job) {
  await prisma.job.update({
    where: { id: job.id },
    data: { status: "PROCESSANDO", tentativas: { increment: 1 } },
  });

  const fonte = await prisma.fonteColeta.findUnique({
    where: { id: job.payload?.fonteId },
  });

  if (!fonte) {
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "FALHOU", erro: "Fonte nao existe mais." },
    });
    return;
  }

  console.log(`[${agora()}] varrendo ${fonte.nome} (${fonte.dominio})...`);

  try {
    // Grava no banco (src/lib/coleta/banco.js): so o que mudou e reescrito, e o
    // preco ganha linha na serie quando muda.
    let ultimoProgresso = 0;
    let ultimaEscrita = Date.now();

    const resultado = await varrerFonte(fonte, async ({ total, feitas, visitadas }) => {
      /*
        Escreve a cada produto novo E, sem produto novo, a cada SINAL_DE_VIDA_MS.

        So "a cada produto novo" parecia bastar, e nao bastou: em 16/09/2026 o
        Eletrogate chegou a 2.000 produtos as 08:46 e passou as duas horas
        seguintes abrindo categoria sem achar nenhum novo (10 s por pagina). Sem
        escrita, o job ficou "sem noticia ha 30 min", a tela disse que nenhum
        worker atendia e mandou rodar `npm run worker` — o que subiria um
        segundo processo que tomaria para si a varredura em andamento.
      */
      const produtoNovo = feitas !== ultimoProgresso;
      if (!produtoNovo && Date.now() - ultimaEscrita < SINAL_DE_VIDA_MS) return;
      ultimoProgresso = feitas;
      ultimaEscrita = Date.now();

      await prisma.job.update({
        where: { id: job.id },
        data: { payload: { ...job.payload, total, feitas, visitadas: visitadas ?? null } },
      });
    });

    const proxima = new Date(Date.now() + fonte.intervaloHoras * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.job.update({
        where: { id: job.id },
        data: {
          status: resultado.erro ? "FALHOU" : "CONCLUIDO",
          erro: resultado.erro,
          payload: { ...job.payload, ...resultado },
        },
      }),
      prisma.fonteColeta.update({
        where: { id: fonte.id },
        data: {
          ultimaVarreduraEm: new Date(),
          proximaVarreduraEm: proxima,
          /*
            SO ESCREVE QUANDO A VARREDURA PROVOU O TOTAL.

            Espalhar o resultado inteiro aqui gravaria `null` na varredura que
            nao conseguiu medir o catalogo, APAGANDO um numero bom da semana
            passada — a loja continua tendo 2.296 produtos mesmo no dia em que
            o sitemap nao respondeu. Nao saber quantos sao nao e o mesmo que
            saber que sao zero, e a coluna diria travessao por um tropeco.
          */
          ...(typeof resultado.produtosNoSite === "number"
            ? {
                produtosNoSite: resultado.produtosNoSite,
                produtosNoSiteParcial: resultado.produtosNoSiteParcial ?? false,
              }
            : {}),
        },
      }),
    ]);

    /*
      "X/Y" so faz sentido quando Y e a META DE PRODUTOS. Na via de arquivo o
      `total` e a contagem de ARQUIVOS lidos, e a linha saia como
      "Fortek: 1911/2 produto(s)" — numero que nao quer dizer nada. Na leitura
      de lista nao ha meta: o catalogo tem o tamanho que o fornecedor mandou.
    */
    const viaArquivo = resultado.contagem !== undefined;
    const quanto = viaArquivo
      ? `${resultado.produtos} produto(s)`
      : `${resultado.produtos}/${resultado.total} produto(s)`;

    console.log(
      `[${agora()}] ${fonte.nome}: ${quanto}` +
        (resultado.gravacao
          ? ` · ${resultado.gravacao.novos} novo(s), ${resultado.gravacao.precosMudaram} mudanca(s) de preco`
          : "") +
        (resultado.erro ? ` · ${resultado.erro}` : ""),
    );
  } catch (erro) {
    const excedeu = job.tentativas + 1 >= job.maxTentativas;

    await prisma.job.update({
      where: { id: job.id },
      data: {
        // Ainda ha tentativa: volta para PENDENTE com espera crescente, em vez
        // de morrer na primeira instabilidade de rede.
        status: excedeu ? "FALHOU" : "PENDENTE",
        erro: String(erro?.message ?? erro),
        proximaTentativaEm: new Date(Date.now() + 2 ** (job.tentativas + 1) * 60 * 1000),
      },
    });

    console.error(`[${agora()}] ${fonte.nome} falhou: ${erro?.message ?? erro}`);
  }
}

/**
 * Devolve a fila o que um worker anterior largou pela metade.
 *
 * Job PROCESSANDO e a prova de worker vivo que a tela usa: ele bloqueia "Atualizar
 * dados" e cala o aviso de "nenhum worker". Quando o processo morre no meio —
 * terminal fechado, sessao encerrada —, o job fica PROCESSANDO para sempre. A
 * Usinainfo ficou assim de 02/09 a 15/09/2026: nunca mais varrida, nunca mais
 * enfileirada (fonte com job aberto nao entra de novo) e travando o botao de todas
 * as fontes.
 *
 * So pega job PARADO ha mais de `ORFAO_APOS_MS`, e nao todo PROCESSANDO: um segundo
 * worker subido por engano devolveria a fila o trabalho que o primeiro esta fazendo.
 * O proprio job nunca e pego, porque esta volta so roda entre um job e outro.
 */
async function recuperarOrfaos(limiteMs = ORFAO_APOS_MS) {
  const orfaos = await prisma.job.findMany({
    where: {
      tipo: "coleta",
      status: "PROCESSANDO",
      atualizadoEm: { lt: new Date(Date.now() - limiteMs) },
    },
  });

  for (const job of orfaos) {
    // A tentativa ja foi contada quando o job comecou: se era a ultima, desiste.
    const esgotou = job.tentativas >= job.maxTentativas;

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: esgotou ? "FALHOU" : "PENDENTE",
        erro: "o worker parou no meio desta varredura",
        proximaTentativaEm: new Date(),
        payload: { ...job.payload, total: 0, feitas: 0 },
      },
    });

    console.log(
      `[${agora()}] ${job.payload?.fonteNome ?? job.id}: largada pelo worker anterior — ` +
        (esgotou ? "sem tentativas, marcada como falha" : "de volta a fila"),
    );
  }
}

async function volta() {
  await recuperarOrfaos();
  await enfileirarVencidas();

  const job = await prisma.job.findFirst({
    where: {
      tipo: "coleta",
      status: "PENDENTE",
      proximaTentativaEm: { lte: new Date() },
    },
    orderBy: { criadoEm: "asc" },
  });

  if (job) await processar(job);
  return Boolean(job);
}

async function principal() {
  console.log(`[${agora()}] worker de coleta no ar (passo de ${PASSO_PROGRESSO} paginas)`);
  console.log("Ctrl+C para encerrar.\n");

  // Na partida a espera e menor: quem acabou de subir nao esta processando nada,
  // e o processo anterior pode ter MORRIDO em vez de ter sido encerrado — o Node
  // derrubou o worker no meio de uma varredura com um assert interno do undici.
  await recuperarOrfaos(ORFAO_NA_PARTIDA_MS);

  while (!encerrando) {
    let trabalhou = false;

    try {
      trabalhou = await volta();
    } catch (erro) {
      console.error(`[${agora()}] erro na volta do worker:`, erro?.message ?? erro);
    }

    // So dorme quando nao havia nada: com fila cheia, emenda um job no outro.
    if (!trabalhou && !encerrando) {
      await new Promise((resolver) => setTimeout(resolver, INTERVALO_MS));
    }
  }

  await prisma.$disconnect();
  console.log(`\n[${agora()}] worker encerrado.`);
}

for (const sinal of ["SIGINT", "SIGTERM"]) {
  process.on(sinal, () => {
    if (encerrando) process.exit(1);
    encerrando = true;
    console.log(`\n[${agora()}] encerrando depois da pagina atual...`);
  });
}

await principal();

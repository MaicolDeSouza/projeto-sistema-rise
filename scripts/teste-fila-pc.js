import "dotenv/config";

/**
 * Testa os TRES modos do worker na fila (src/lib/coleta/fila.js): o normal (o da VPS), o do PC (COLETA_SO_PC) e o de
 * teste (COLETA_FONTES). Cobre quem pega, quem recolhe e quem fecha o job de uma fonte marcada `varridaNoPc`.
 *
 *   npm run teste:fila-pc
 *
 * Usa o Postgres do .env, SEM rede, e so escreve fontes e jobs "ZZ-PC-*", que apaga no fim. Recusa rodar com um worker
 * no ar, porque ele pegaria os jobs deste teste.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("@/lib/db.js");
const fila = await import("@/lib/coleta/fila.js");
const { servidorEhWindows } = await import("@/lib/copiaLocal.js");
const { gravarEstadoDoWorkerPc, idDeFonteValido, iniciarWorkerPc, lerEstadoDoWorkerPc, situacaoDoWorkerPc } = await import(
  "@/lib/coleta/workerPc.js"
);
const { mkdtempSync, rmSync } = await import("node:fs");
const os = await import("node:os");
const path = await import("node:path");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${
      ok ? "" : `\n        obtido=${JSON.stringify(obtido)}\n      esperado=${JSON.stringify(esperado)}`
    }`,
  );
}

// ---------------------------------------------------------------------------
console.log("— modo do worker (regras puras) —");

conferir("COLETA_SO_PC=1 liga", fila.soNoPcConfigurado("1"), true);
conferir("COLETA_SO_PC com espacos", fila.soNoPcConfigurado(" 1 "), true);
conferir("COLETA_SO_PC=0 nao liga", fila.soNoPcConfigurado("0"), false);
conferir("COLETA_SO_PC=true nao liga (so o 1 vale)", fila.soNoPcConfigurado("true"), false);
conferir("COLETA_SO_PC vazio", fila.soNoPcConfigurado(""), false);
conferir("COLETA_SO_PC ausente", fila.soNoPcConfigurado(undefined), false);

conferir("fontes e so-no-pc juntos se contradizem", typeof fila.modoInvalido(["a"], true), "string");
conferir("so o do PC e valido", fila.modoInvalido(null, true), null);
conferir("so as fontes e valido", fila.modoInvalido(["a"], false), null);
conferir("o normal e valido", fila.modoInvalido(null, false), null);

const travas = [fila.travaDoWorker(null, false), fila.travaDoWorker(["a"], false), fila.travaDoWorker(null, true)];
conferir("tres modos, tres travas diferentes (convivem no mesmo banco)", new Set(travas).size, 3);
conferir("a trava do normal nao mudou", fila.travaDoWorker(null), fila.TRAVA_WORKER);

const jobA = { fonteId: "A", payload: {} };
const jobB = { fonteId: "B", payload: {} };
const jobDeTeste = { fonteId: "A", payload: { teste: true } };
const jobAntigo = { fonteId: null, payload: { fonteId: "B" } };
const noPc = new Set(["B"]);
conferir("normal pega fonte da VPS", fila.ehDesteWorker(jobA, { idsNoPc: noPc }), true);
conferir("normal NAO pega fonte do PC", fila.ehDesteWorker(jobB, { idsNoPc: noPc }), false);
conferir("normal NAO pega job de teste", fila.ehDesteWorker(jobDeTeste, { idsNoPc: noPc }), false);
conferir("PC NAO pega fonte da VPS", fila.ehDesteWorker(jobA, { soNoPc: true, idsNoPc: noPc }), false);
conferir("PC pega fonte do PC", fila.ehDesteWorker(jobB, { soNoPc: true, idsNoPc: noPc }), true);
conferir("PC NAO pega job de teste", fila.ehDesteWorker({ fonteId: "B", payload: { teste: true } }, { soNoPc: true, idsNoPc: noPc }), false);
conferir("job antigo (so no payload) tambem e reconhecido", fila.ehDesteWorker(jobAntigo, { soNoPc: true, idsNoPc: noPc }), true);
conferir("worker de teste pega o que pediu, marcado ou nao", [fila.ehDesteWorker(jobA, { fontes: ["A"] }), fila.ehDesteWorker(jobB, { fontes: ["A"] })], [true, false]);
conferir("worker de teste pega o job de teste da fonte pedida", fila.ehDesteWorker(jobDeTeste, { fontes: ["A"] }), true);

conferir("servidor do PC e Windows", servidorEhWindows("PostgreSQL 17.11 on x86_64-windows, compiled by msvc-19.44.35228, 64-bit"), true);
conferir(
  "servidor da VPS NAO e Windows",
  servidorEhWindows("PostgreSQL 17.11 (Debian 17.11-1.pgdg13+2) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit"),
  false,
);
conferir("texto vazio NAO vale como Windows", servidorEhWindows(""), false);

// ---------------------------------------------------------------------------
console.log("\n— o worker do PC visto pelo Rise do PC (estado em arquivo, o botao Varrer agora) —");

const agora = Date.parse("2026-10-09T18:00:00Z");
const vivo = () => true;
const morto = () => false;
const comeco = { pid: 4242, fonteId: "cmfonte0001", fonteNome: "Loja", inicioEm: "2026-10-09T17:50:00Z" };
const fimOk = { ...comeco, fimEm: "2026-10-09T17:59:00Z", codigo: 0, motivo: null };

conferir("sem estado: parado e sem resultado", situacaoDoWorkerPc(null), { rodando: false, ultima: null });
conferir("comeco gravado e processo vivo: rodando, com a fonte", (({ rodando, fonteId }) => [rodando, fonteId])(situacaoDoWorkerPc(comeco, { agora, vivo })), [true, "cmfonte0001"]);
const interrompida = situacaoDoWorkerPc(comeco, { agora, vivo: morto });
conferir("comeco sem fim e processo morto: interrompida (o PC desligou)", [interrompida.rodando, interrompida.ultima.ok], [false, false]);
conferir(
  "comeco de mais de 24 h com o pid vivo (reaproveitado pelo Windows): nao conta como rodando",
  situacaoDoWorkerPc({ ...comeco, inicioEm: "2026-10-08T12:00:00Z" }, { agora, vivo }).rodando,
  false,
);
const concluida = situacaoDoWorkerPc(fimOk, { agora, vivo });
conferir("fim com codigo 0: concluida, com a hora do fim", [concluida.rodando, concluida.ultima.ok, concluida.ultima.mensagem, concluida.ultima.fimEm], [false, true, "Concluída.", "2026-10-09T17:59:00Z"]);
conferir("fim com erro: o motivo gravado vai para a tela", situacaoDoWorkerPc({ ...fimOk, codigo: 5, motivo: "A VPS recusou." }, { agora, vivo }).ultima.mensagem, "A VPS recusou.");
conferir("fim com erro sem motivo: o codigo", situacaoDoWorkerPc({ ...fimOk, codigo: 1 }, { agora, vivo }).ultima.mensagem, "Falhou (código 1).");
conferir("id de fonte: um cuid passa", idDeFonteValido("cmv183ymh000e0jqlpxf6ett8"), true);
conferir(
  "id de fonte: argumento, espaco, vazio e nulo nao passam",
  [idDeFonteValido("--ficar"), idDeFonteValido("abc def ghi"), idDeFonteValido(""), idDeFonteValido(null)],
  [false, false, false, false],
);

// No disco, numa pasta temporaria: gravar e ler de volta, e o botao recusar SEM ligar processo nenhum.
const pastaTeste = mkdtempSync(path.join(os.tmpdir(), "rise-worker-pc-"));
try {
  const pastaDados = path.join(pastaTeste, "dados");
  conferir("arquivo de estado ausente: nulo", lerEstadoDoWorkerPc(pastaDados), null);
  gravarEstadoDoWorkerPc(pastaDados, fimOk);
  conferir("grava e le de volta", lerEstadoDoWorkerPc(pastaDados), fimOk);
  conferir("o botao recusa id de fonte invalido", iniciarWorkerPc({ pastaProjeto: pastaTeste, fonteId: "--ficar" }), { ok: false, erro: "Fonte inválida." });
  gravarEstadoDoWorkerPc(pastaDados, { pid: process.pid, fonteId: "cmfonte0001", fonteNome: "Loja", inicioEm: new Date().toISOString() });
  conferir(
    "com um worker do PC rodando, o botao recusa e nao liga outro",
    iniciarWorkerPc({ pastaProjeto: pastaTeste, fonteId: "cmfonte0002" }),
    { ok: false, erro: "Já há uma varredura pelo PC em andamento (Loja)." },
  );
  gravarEstadoDoWorkerPc(pastaDados, fimOk);
  conferir(
    "sem o script na pasta, o botao diz isso em vez de falhar calado",
    iniciarWorkerPc({ pastaProjeto: pastaTeste, fonteId: "cmfonte0002" }).erro,
    "Não achei scripts/worker-pc.js nesta pasta.",
  );
} finally {
  rmSync(pastaTeste, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
console.log("\n— a fila no banco —");

if (await fila.workerNoAr()) {
  console.error("Ha um worker no ar neste banco: ele pegaria os jobs deste teste. Rode `npm run worker:parar` antes.");
  await prisma.$disconnect();
  process.exit(2);
}

const PREFIXO = "ZZ-PC";

async function limpar() {
  const fontes = await prisma.fonteColeta.findMany({ where: { nome: { startsWith: PREFIXO } }, select: { id: true } });
  const ids = fontes.map((fonte) => fonte.id);
  await prisma.job.deleteMany({ where: { fonteId: { in: ids } } });
  await prisma.fonteColeta.deleteMany({ where: { id: { in: ids } } });
}

const criarFonte = (letra, varridaNoPc) =>
  prisma.fonteColeta.create({
    data: { nome: `${PREFIXO}-${letra}`, dominio: `zz-pc-${letra.toLowerCase()}.invalid`, tipo: "CONCORRENTE", varridaNoPc },
  });

const criarJob = (fonte, extras = {}) =>
  prisma.job.create({
    data: {
      tipo: "coleta",
      fonteId: fonte.id,
      payload: { fonteId: fonte.id, fonteNome: fonte.nome },
      ...extras,
    },
  });

const limparJobs = (...fontes) => prisma.job.deleteMany({ where: { fonteId: { in: fontes.map((fonte) => fonte.id) } } });
const haMinutos = (minutos) => new Date(Date.now() - minutos * 60 * 1000);
const nomes = (lista) => lista.map((item) => item.fonteNome ?? item).sort();

try {
  await limpar();
  const fonteA = await criarFonte("A", false);
  const fonteB = await criarFonte("B", true);

  // Os jobs do teste sao os MAIS ANTIGOS da fila, para vencerem qualquer outro job pendente do banco. O da fonte do
  // PC e ainda mais antigo que o da VPS: se o normal o pegasse, a ordem o entregaria primeiro.
  await criarJob(fonteB, { criadoEm: new Date("1999-01-01T00:00:00Z") });
  await criarJob(fonteA, { criadoEm: new Date("2000-01-01T00:00:00Z") });

  const emAndamento = (job) => prisma.job.update({ where: { id: job.id }, data: { status: "PENDENTE", workerId: null, sinalEm: null, tentativas: 0 } });

  const doNormal = await fila.pegarProximoJob("w-normal", {});
  conferir("o worker normal pega a fonte da VPS, mesmo com o job do PC mais antigo", doNormal?.fonteId, fonteA.id);
  const segundoDoNormal = await fila.pegarProximoJob("w-normal", {});
  conferir("o worker normal nunca chega a fonte do PC", segundoDoNormal?.fonteId === fonteB.id, false);
  if (segundoDoNormal) await emAndamento(segundoDoNormal);
  await emAndamento(doNormal);

  const doPc = await fila.pegarProximoJob("w-pc", { soNoPc: true });
  conferir("o worker do PC pega SO a fonte marcada", doPc?.fonteId, fonteB.id);
  await emAndamento(doPc);

  const deTesteA = await fila.pegarProximoJob("w-teste", { fontes: [fonteA.id] });
  conferir("o worker de teste pega a fonte que pediu (A)", deTesteA?.fonteId, fonteA.id);
  await emAndamento(deTesteA);
  const deTesteB = await fila.pegarProximoJob("w-teste", { fontes: [fonteB.id] });
  conferir("o worker de teste pega a fonte que pediu mesmo marcada (B)", deTesteB?.fonteId, fonteB.id);
  await emAndamento(deTesteB);

  // Desmarcar devolve a fonte ao worker da VPS.
  await prisma.fonteColeta.update({ where: { id: fonteB.id }, data: { varridaNoPc: false } });
  const aposDesmarcar = await fila.pegarProximoJob("w-normal", {});
  conferir("desmarcada, a fonte volta ao worker normal (a mais antiga e a B)", aposDesmarcar?.fonteId, fonteB.id);
  if (aposDesmarcar) await emAndamento(aposDesmarcar);
  await prisma.fonteColeta.update({ where: { id: fonteB.id }, data: { varridaNoPc: true } });
  conferir("marcada de novo, o do PC pega de novo", (await fila.pegarProximoJob("w-pc", { soNoPc: true }))?.fonteId, fonteB.id);

  // ----------------------------------------------------------------- recolher
  await limparJobs(fonteA, fonteB);
  const largado = { status: "PROCESSANDO", sinalEm: haMinutos(5), workerId: "w-morto", tentativas: 1 };
  await criarJob(fonteA, largado);
  await criarJob(fonteB, largado);

  conferir(
    "na PARTIDA o normal recolhe so o da VPS (o do PC pode ser de um worker vivo em outra maquina)",
    nomes(await fila.recolherLargados({ semSinalHaMs: 0 })),
    [fonteA.nome],
  );
  const sobrou = await prisma.job.findFirst({ where: { fonteId: fonteB.id } });
  conferir("o job do PC continua em andamento depois da partida do normal", sobrou.status, "PROCESSANDO");

  conferir(
    "na volta normal o normal recolhe o do PC SEM sinal ha mais de 2 min (o PC desligou)",
    nomes(await fila.recolherLargados({})),
    [fonteB.nome],
  );

  await limparJobs(fonteA, fonteB);
  await criarJob(fonteA, largado);
  await criarJob(fonteB, largado);
  conferir(
    "na partida do worker do PC, ele recolhe so o dele",
    nomes(await fila.recolherLargados({ semSinalHaMs: 0, soNoPc: true })),
    [fonteB.nome],
  );
  const doNormalSobrou = await prisma.job.findFirst({ where: { fonteId: fonteA.id } });
  conferir("o job da VPS fica para o worker da VPS", doNormalSobrou.status, "PROCESSANDO");

  await limparJobs(fonteA, fonteB);
  await criarJob(fonteB, { status: "PROCESSANDO", sinalEm: new Date(), workerId: "w-pc-vivo", tentativas: 1 });
  conferir("job do PC com sinal de agora nunca e recolhido pelo normal", await fila.recolherLargados({}), []);

  // ----------------------------------------------------------------- fechar esgotados
  await limparJobs(fonteA, fonteB);
  const esgotado = { status: "PENDENTE", tentativas: 3, maxTentativas: 3 };
  await criarJob(fonteA, esgotado);
  await criarJob(fonteB, esgotado);
  conferir("o normal fecha os esgotados de todas as fontes", (await fila.fecharEsgotados({})).sort(), [fonteA.nome, fonteB.nome]);

  await limparJobs(fonteA, fonteB);
  await criarJob(fonteA, esgotado);
  await criarJob(fonteB, esgotado);
  conferir("o do PC fecha so os esgotados das fontes dele", await fila.fecharEsgotados({ soNoPc: true }), [fonteB.nome]);
  const aindaPendente = await prisma.job.findFirst({ where: { fonteId: fonteA.id } });
  conferir("o esgotado da VPS fica para o worker da VPS", aindaPendente.status, "PENDENTE");

  // ----------------------------------------------------------------- o worker do PC poe as fontes dele na fila
  await limparJobs(fonteA, fonteB);
  const fonteC = await criarFonte("C", true); // marcada e ativa
  const fonteD = await prisma.fonteColeta.create({
    data: { nome: `${PREFIXO}-D`, dominio: "zz-pc-d.invalid", tipo: "CONCORRENTE", varridaNoPc: true, ativa: false },
  });
  const fonteE = await prisma.fonteColeta.create({
    data: { nome: `${PREFIXO}-E`, dominio: "zz-pc-e.invalid", tipo: "CONCORRENTE", varridaNoPc: true, robotsPermite: false },
  });
  const todas = [fonteA, fonteB, fonteC, fonteD, fonteE];
  const idsDeTeste = todas.map((fonte) => fonte.id);

  // A funcao enfileira TODA fonte marcada do banco; se o PC ja tiver uma de verdade, o job dela e desfeito no fim.
  const jobsAntes = (await prisma.job.findMany({ select: { id: true } })).map((job) => job.id);
  const primeira = await fila.enfileirarFontesDoPc();
  const donos = async () =>
    (await prisma.job.findMany({ where: { fonteId: { in: idsDeTeste } }, select: { fonteId: true } })).map((job) => job.fonteId).sort();
  conferir(
    "o worker do PC poe na fila so as fontes marcadas E ativas E liberadas pelo robots.txt (B e C)",
    await donos(),
    [fonteB.id, fonteC.id].sort(),
  );
  conferir("a contagem inclui as fontes de teste marcadas e ativas", primeira.fontes >= 2 && primeira.enfileiradas >= 2, true);

  await fila.enfileirarFontesDoPc();
  conferir("pedir de novo nao duplica o job (indice de um job aberto por fonte)", await donos(), [fonteB.id, fonteC.id].sort());

  const abertos = await fila.jobsAbertosDoPc();
  await prisma.job.updateMany({ where: { fonteId: fonteB.id }, data: { status: "CONCLUIDO" } });
  conferir("job concluido deixa de contar como aberto", abertos - (await fila.jobsAbertosDoPc()), 1);
  await prisma.job.updateMany({ where: { fonteId: fonteC.id }, data: { status: "FALHOU" } });
  conferir("job que falhou de vez tambem deixa de contar (o worker do PC pode terminar)", abertos - (await fila.jobsAbertosDoPc()), 2);

  // Desfaz o que a funcao enfileirou de verdade em fonte que nao e de teste.
  await prisma.job.deleteMany({ where: { id: { notIn: jobsAntes }, fonteId: { notIn: idsDeTeste } } });

  // ----------------------------------------- o "Varrer agora" do Rise do PC: so a fonte pedida (worker-pc --fonte)
  await limparJobs(...todas);
  conferir("com fonteId, so aquela fonte entra na fila", await fila.enfileirarFontesDoPc({ fonteId: fonteC.id }), { fontes: 1, enfileiradas: 1 });
  conferir("e nenhuma outra fonte marcada", await donos(), [fonteC.id]);
  conferir(
    "fonte NAO marcada pedida pelo id: a VPS nao a reconhece (o worker recusa com 5)",
    await fila.enfileirarFontesDoPc({ fonteId: fonteA.id }),
    { fontes: 0, enfileiradas: 0 },
  );
  conferir("fonte pausada pedida pelo id: idem", await fila.enfileirarFontesDoPc({ fonteId: fonteD.id }), { fontes: 0, enfileiradas: 0 });
  conferir("id que nao existe no banco: idem", await fila.enfileirarFontesDoPc({ fonteId: "zzpcnaoexiste0000" }), { fontes: 0, enfileiradas: 0 });
  conferir("a fila continua so com a C", await donos(), [fonteC.id]);

  conferir("idsDasFontesNoPc lista so as marcadas", (await fila.idsDasFontesNoPc()).filter((id) => [fonteA.id, fonteB.id].includes(id)), [fonteB.id]);
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

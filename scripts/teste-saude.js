import "dotenv/config";

/**
 * Testes da Saude do Rise (pedido do dono em 25/10/2026: um cartao em Configuracoes que vigia os workers, o banco, as
 * integracoes e o resto que importa, com aviso no Telegram do que ficar vermelho).
 *
 *   npm run teste:saude
 *
 * As regras sao puras (src/lib/saude/regras.js). A parte do banco usa o Postgres local, SEM rede, e so escreve linhas
 * `zz-saude-*` em RotinaDoWorker (apagadas no fim).
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const regras = await import("../src/lib/saude/regras.js");
const { mensagemDoAviso } = await import("../src/lib/telegram/texto.js");
const { TIPOS_DE_AVISO, ROTULO_DO_AVISO } = await import("../src/lib/telegram/avisosTipos.js");

let falhas = 0;
let total = 0;
function conferir(nome, obtido, esperado) {
  total++;
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const AGORA = Date.UTC(2026, 9, 25, 15, 0, 0);
const antes = (ms) => new Date(AGORA - ms);

// --- resultado de uma volta da rotina -------------------------------------------------------------------------------
conferir("resultado: sem retorno e ok", regras.resultadoDaRotina(undefined), { ok: true, erro: null, aviso: null });
conferir("resultado: rodada parada e falha", regras.resultadoDaRotina({ parou: "429" }), { ok: false, erro: "rodada parada (429)", aviso: null });
conferir("resultado: motivo erro e falha", regras.resultadoDaRotina({ motivo: "erro", erro: "token" }), { ok: false, erro: "token", aviso: null });
conferir("resultado: ok false sem erro", regras.resultadoDaRotina({ ok: false }), { ok: false, erro: "falhou", aviso: null });
conferir("resultado: falha parcial vira aviso", regras.resultadoDaRotina({ conferidos: 6, falhas: 2 }), { ok: true, erro: null, aviso: "2 falha(s)" });
conferir("resultado: desligado nao e falha", regras.resultadoDaRotina({ ok: true, mandados: 0, falhas: 0, motivo: "desligado" }), { ok: true, erro: null, aviso: null });

// --- avaliacao de uma rotina -----------------------------------------------------------------------------------------
conferir("rotina sem linha: aguardando", regras.avaliarRotina(null, AGORA).estado, "aguardando");
conferir("rotina em dia: ok", regras.avaliarRotina({ ultimaOkEm: antes(5 * MIN), intervaloMs: 15 * MIN }, AGORA).estado, "ok");
conferir(
  "rotina com falha depois do ok: falha com o erro",
  regras.avaliarRotina({ ultimaOkEm: antes(30 * MIN), ultimaFalhaEm: antes(5 * MIN), ultimoErro: "token expirado", intervaloMs: 15 * MIN }, AGORA),
  { estado: "falha", detalhe: "Falhou há 5 min: token expirado" },
);
conferir("rotina atrasada (mais de 2 intervalos): atencao", regras.avaliarRotina({ ultimaOkEm: antes(40 * MIN), intervaloMs: 15 * MIN }, AGORA).estado, "atencao");
conferir("rotina parada (mais de 3 intervalos): falha", regras.avaliarRotina({ ultimaOkEm: antes(60 * MIN), intervaloMs: 15 * MIN }, AGORA).estado, "falha");
conferir("rotina com aviso: atencao", regras.avaliarRotina({ ultimaOkEm: antes(MIN), aviso: "2 falha(s)", intervaloMs: 15 * MIN }, AGORA), { estado: "atencao", detalhe: "Rodou há 1 min com aviso: 2 falha(s)" });
conferir("rotina sem intervalo nao envelhece", regras.avaliarRotina({ ultimaOkEm: antes(48 * HORA) }, AGORA).estado, "ok");

// --- worker, disco, backup, memoria, banco -----------------------------------------------------------------------------
conferir("worker sem linha: falha", regras.avaliarWorker(null, AGORA).estado, "falha");
conferir("worker com sinal recente: ok", regras.avaliarWorker(antes(20 * 1000), AGORA).estado, "ok");
conferir("worker sem sinal ha 2 min: falha", regras.avaliarWorker(antes(2 * MIN), AGORA).estado, "falha");

const GB = 1024 ** 3;
conferir("disco com 40% livre: ok", regras.avaliarDisco({ livreBytes: 40 * GB, totalBytes: 100 * GB }).estado, "ok");
conferir("disco com 12% livre: atencao", regras.avaliarDisco({ livreBytes: 12 * GB, totalBytes: 100 * GB }).estado, "atencao");
conferir("disco com 5% livre: falha", regras.avaliarDisco({ livreBytes: 5 * GB, totalBytes: 100 * GB }), { estado: "falha", detalhe: "5,0 GB livres de 100,0 GB (5%)" });
conferir("disco sem leitura: aguardando", regras.avaliarDisco(null).estado, "aguardando");

conferir("backup de hoje: ok", regras.avaliarBackup(antes(12 * HORA), AGORA).estado, "ok");
conferir("backup de 30 h: atencao", regras.avaliarBackup(antes(30 * HORA), AGORA).estado, "atencao");
conferir("backup de 3 dias: falha", regras.avaliarBackup(antes(72 * HORA), AGORA).estado, "falha");
conferir("sem backup: falha", regras.avaliarBackup(null, AGORA).estado, "falha");

conferir("memoria em 50%: ok", regras.avaliarMemoria({ heapMb: 1024, limiteMb: 2048, em: antes(MIN) }, AGORA).estado, "ok");
conferir("memoria em 85%: atencao", regras.avaliarMemoria({ heapMb: 1740, limiteMb: 2048, em: antes(MIN) }, AGORA).estado, "atencao");
conferir("memoria em 95%: falha", regras.avaliarMemoria({ heapMb: 1950, limiteMb: 2048, em: antes(MIN) }, AGORA).estado, "falha");
conferir("memoria sem dado: aguardando", regras.avaliarMemoria(null, AGORA).estado, "aguardando");

conferir("banco rapido: ok", regras.avaliarBanco({ latenciaMs: 12, tamanhoBytes: 400 * 1024 ** 2 }), { estado: "ok", detalhe: "Respondeu em 12 ms · 400 MB" });
conferir("banco lento: atencao", regras.avaliarBanco({ latenciaMs: 800, tamanhoBytes: 0 }).estado, "atencao");
conferir("banco fora: falha", regras.avaliarBanco({ erro: "conexao recusada" }), { estado: "falha", detalhe: "Não respondeu: conexao recusada" });

// --- integracoes, orcamento, coleta, PC, healthchecks ----------------------------------------------------------------
conferir("integracao conectada e testada: ok", regras.avaliarIntegracao({ status: "CONECTADO", ultimoTesteOk: true, obrigatoria: true }).estado, "ok");
conferir("integracao obrigatoria sem configurar: falha", regras.avaliarIntegracao({ status: "NAO_CONFIGURADO", obrigatoria: true }).estado, "falha");
conferir("integracao opcional sem configurar: aguardando", regras.avaliarIntegracao({ status: "NAO_CONFIGURADO", obrigatoria: false }).estado, "aguardando");
conferir("integracao expirada: falha", regras.avaliarIntegracao({ status: "EXPIRADO", obrigatoria: true }).estado, "falha");
conferir(
  "integracao com teste que falhou: falha com o erro",
  regras.avaliarIntegracao({ status: "CONECTADO", ultimoTesteOk: false, ultimoErro: "invalid_grant", obrigatoria: true }),
  { estado: "falha", detalhe: "Último teste falhou: invalid_grant" },
);
conferir("integracao com recusas em 24 h: atencao", regras.avaliarIntegracao({ status: "CONECTADO", ultimoTesteOk: true, recusas24h: 3, obrigatoria: true }).estado, "atencao");
conferir("integracao com limite (429): atencao", regras.avaliarIntegracao({ status: "CONECTADO", limite24h: 2, obrigatoria: true }).estado, "atencao");

conferir("orcamento normal: ok", regras.avaliarOrcamento({ nivel: "normal", percentual: 20, gastoBrl: 6, tetoBrl: 30 }).estado, "ok");
conferir("orcamento em aviso: atencao", regras.avaliarOrcamento({ nivel: "aviso", percentual: 85, gastoBrl: 25.5, tetoBrl: 30 }).estado, "atencao");
conferir("orcamento esgotado: falha", regras.avaliarOrcamento({ nivel: "esgotado", percentual: 100, gastoBrl: 30, tetoBrl: 30 }).estado, "falha");

conferir("coleta sem falhas: ok", regras.avaliarColeta({ emAndamento: 1, naFila: 2, falhas24h: [] }).estado, "ok");
conferir("coleta com falha: atencao com o nome", regras.avaliarColeta({ emAndamento: 0, naFila: 0, falhas24h: ["Santana"] }), { estado: "atencao", detalhe: "1 varredura falhou nas últimas 24 h: Santana" });

conferir("PC sem fontes: aguardando", regras.avaliarPc({ fontesNoPc: 0, pedidosSemResposta: 0, sinalEm: null }, AGORA).estado, "aguardando");
conferir("PC com pedido sem resposta: falha", regras.avaliarPc({ fontesNoPc: 2, pedidosSemResposta: 1, sinalEm: antes(HORA) }, AGORA).estado, "falha");
conferir("PC com fontes e sem pedido: ok", regras.avaliarPc({ fontesNoPc: 2, pedidosSemResposta: 0, sinalEm: null }, AGORA).estado, "ok");

conferir("healthchecks na VPS sem a URL do worker: atencao", regras.avaliarHealthchecks({ naVps: true, worker: false, backup: true, site: false }).estado, "atencao");
conferir("healthchecks com worker e site: ok", regras.avaliarHealthchecks({ naVps: true, worker: true, backup: true, site: true }).estado, "ok");
conferir("healthchecks no PC: aguardando", regras.avaliarHealthchecks({ naVps: false, worker: false, backup: false, site: false }).estado, "aguardando");

// --- estado geral -------------------------------------------------------------------------------------------------------
conferir("geral: falha vence", regras.estadoGeral([{ estado: "ok" }, { estado: "atencao" }, { estado: "falha" }]), "falha");
conferir("geral: aguardando e info nao pioram", regras.estadoGeral([{ estado: "ok" }, { estado: "aguardando" }, { estado: "info" }]), "ok");
conferir("geral: atencao sem falha", regras.estadoGeral([{ estado: "ok" }, { estado: "atencao" }]), "atencao");
conferir("resumo do cartao: tudo certo", regras.resumoDaSaude([{ estado: "ok" }, { estado: "aguardando" }]), "Tudo certo");
conferir("resumo do cartao: a pior primeiro", regras.resumoDaSaude([{ estado: "atencao" }, { estado: "falha" }, { estado: "falha" }]), "2 em vermelho · 1 em amarelo");
conferir("todas as rotinas tem rotulo", regras.ROTINAS_DO_WORKER.every((rotina) => rotina.id && rotina.rotulo), true);

// --- aviso do Telegram ----------------------------------------------------------------------------------------------------
conferir("o aviso da saude e um tipo do Telegram", TIPOS_DE_AVISO.includes("saudeDoRise") && typeof ROTULO_DO_AVISO.saudeDoRise === "string", true);
conferir(
  "texto do aviso da saude",
  mensagemDoAviso("saudeDoRise", { rotulo: "Backup do banco", detalhe: "Último: há 3 dias" }),
  { texto: "Saúde do Rise: Backup do banco\nÚltimo: há 3 dias", caminho: "/configuracoes/saude" },
);

// --- banco: registrar a rotina e coletar ---------------------------------------------------------------------------------
const { prisma } = await import("../src/lib/db.js");
const { registrarRotina } = await import("../src/lib/saude/registro.js");
const { coletarSaude } = await import("../src/lib/saude/coletar.js");
try {
  await prisma.rotinaDoWorker.deleteMany({ where: { id: { startsWith: "zz-saude-" } } });

  await registrarRotina("zz-saude-a", { conferidos: 3, falhas: 0 }, { inicio: AGORA - 1500, intervaloMs: 15 * MIN, agora: AGORA });
  let linha = await prisma.rotinaDoWorker.findUnique({ where: { id: "zz-saude-a" } });
  conferir("registrar ok grava ultimaOkEm, duracao e intervalo", [linha.ultimaOkEm?.getTime(), linha.duracaoMs, linha.intervaloMs, linha.ultimaFalhaEm], [AGORA, 1500, 15 * MIN, null]);

  await registrarRotina("zz-saude-a", { parou: "401" }, { inicio: AGORA + MIN, intervaloMs: 15 * MIN, agora: AGORA + MIN + 200 });
  linha = await prisma.rotinaDoWorker.findUnique({ where: { id: "zz-saude-a" } });
  conferir("registrar falha mantem o ultimo ok e grava o erro", [linha.ultimaOkEm?.getTime(), linha.ultimaFalhaEm?.getTime(), linha.ultimoErro], [AGORA, AGORA + MIN + 200, "rodada parada (401)"]);
  conferir("a avaliacao le a falha", regras.avaliarRotina(linha, AGORA + 2 * MIN).estado, "falha");

  await registrarRotina("zz-saude-a", { conferidos: 3 }, { inicio: AGORA + 3 * MIN, intervaloMs: 15 * MIN, agora: AGORA + 3 * MIN });
  linha = await prisma.rotinaDoWorker.findUnique({ where: { id: "zz-saude-a" } });
  conferir("o ok seguinte limpa o aviso e volta a ok", [regras.avaliarRotina(linha, AGORA + 4 * MIN).estado, linha.aviso], ["ok", null]);

  const saude = await coletarSaude({ agora: Date.now() });
  conferir("coletar devolve grupos com itens", saude.grupos.length > 0 && saude.grupos.every((grupo) => grupo.titulo && grupo.itens.length > 0), true);
  conferir("coletar devolve o estado geral", ["ok", "atencao", "falha"].includes(saude.geral), true);
  conferir("todo item tem id, rotulo, estado e detalhe", saude.grupos.flatMap((grupo) => grupo.itens).every((item) => item.id && item.rotulo && item.estado && typeof item.detalhe === "string"), true);
  const idsDoGrupo = (resultado) => resultado.grupos[0].itens.map((item) => item.id);
  const noPc = await coletarSaude({ agora: Date.now(), env: { ...process.env, RISE_PRODUCAO: "" } });
  conferir("no PC o worker e as rotinas sao uma linha so", idsDoGrupo(noPc).filter((id) => id === "worker" || id.startsWith("rotina-")), ["worker"]);
  const naVps = await coletarSaude({ agora: Date.now(), env: { ...process.env, RISE_PRODUCAO: "1" } });
  conferir("na VPS cada rotina tem a sua linha", regras.ROTINAS_DO_WORKER.every((rotina) => idsDoGrupo(naVps).includes(`rotina-${rotina.id}`)), true);
  conferir("na VPS sem batida do worker o healthchecks pede atencao", naVps.grupos[1].itens.find((item) => item.id === "healthchecks")?.estado, process.env.HEALTHCHECKS_WORKER_URL && process.env.HEALTHCHECKS_SITE_URL ? "ok" : "atencao");
  conferir("o banco aparece e responde", saude.grupos.flatMap((grupo) => grupo.itens).find((item) => item.id === "banco")?.estado !== "falha", true);
} finally {
  await prisma.rotinaDoWorker.deleteMany({ where: { id: { startsWith: "zz-saude-" } } });
  await prisma.$disconnect();
}

console.log(`\n${total - falhas} de ${total} ok${falhas ? ` · ${falhas} FALHA(S)` : ""}`);
process.exit(falhas ? 1 : 0);

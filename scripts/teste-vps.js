/**
 * Testa as regras do cartao "Servidor VPS" (src/lib/vps/regras.js): onde os botoes funcionam, a leitura do git e da
 * VPS, as decisoes de deploy e de copia, a leitura do log do deploy, quem o ajudante mata para parar o servidor do PC
 * (e quem ele NUNCA mata) e os scripts mandados a VPS.
 *
 *   npm run teste:vps
 *
 * SEM rede, SEM banco e SEM processos: so funcoes puras. A cadeia de processos usada e a real, medida em 09/10/2026
 * (o servidor do PC aberto pelo app do Claude).
 */

import * as regras from "../src/lib/vps/regras.js";
import { ambienteDoRise, envioDoProprioRise, inicialDoNome, sessaoDoRise } from "../src/lib/sessao.js";

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : `\n        obtido=${JSON.stringify(obtido)}\n      esperado=${JSON.stringify(esperado)}`}`,
  );
}

// ---------------------------------------------------------------------------
console.log("— onde os botoes funcionam —");

conferir("localhost:3000 no PC: sim", regras.ehOPcDeDesenvolvimento({}, "localhost:3000"), true);
conferir("[::1]:3000 no PC: sim", regras.ehOPcDeDesenvolvimento({}, "[::1]:3000"), true);
conferir("127.0.0.1: sim", regras.ehOPcDeDesenvolvimento({}, "127.0.0.1:3000"), true);
conferir("pela rede local (192.168.x): nao", regras.ehOPcDeDesenvolvimento({}, "192.168.0.10:3000"), false);
conferir("pelo nome da VPS: nao", regras.ehOPcDeDesenvolvimento({}, "rise.4hobby.com.br"), false);
conferir("com RISE_PRODUCAO=1 (a imagem da VPS), nem em localhost", regras.ehOPcDeDesenvolvimento({ RISE_PRODUCAO: "1" }, "localhost:3000"), false);
conferir("RISE_PRODUCAO=0 conta como PC", regras.ehOPcDeDesenvolvimento({ RISE_PRODUCAO: "0" }, "localhost"), true);
conferir("sem cabecalho Host: nao", regras.ehOPcDeDesenvolvimento({}, null), false);

// ---------------------------------------------------------------------------
console.log("\n— git e VPS (leitura de texto) —");

const status = regras.lerStatusDoGit("## main...origin/main [ahead 2, behind 1]\n M CLAUDE.md\n M src/lib/x.js\n");
conferir("status: ramo, upstream, a frente, atras e alterados", status, {
  ramo: "main",
  upstream: "origin/main",
  aFrente: 2,
  atras: 1,
  alterados: ["CLAUDE.md", "src/lib/x.js"],
});
conferir("status limpo", regras.lerStatusDoGit("## main...origin/main\n"), { ramo: "main", upstream: "origin/main", aFrente: 0, atras: 0, alterados: [] });
conferir(
  "migrations novas pelos caminhos do diff",
  regras.migrationsNovas(["prisma/migrations/20261009_b/migration.sql", "src/x.js", "prisma/schema.prisma", "prisma/migrations/20261009_a/migration.sql"]),
  ["20261009_a", "20261009_b"],
);
const vpsLida = regras.lerSaidaDaVps("commit=4c3c5c4\nultimo_deploy=09.10.2026.07.02 7eafdb9\ndeploy_rodando=0\ndisco=18%\nvarreduras=3\nna_fila=2\nlixo sem igual\n");
conferir("saida da VPS", vpsLida, { commit: "4c3c5c4", versaoNoAr: "09.10.2026.07.02", commitNoAr: "7eafdb9", varreduras: 3, naFila: 2, disco: "18%", deployEmAndamento: false });
conferir("commit curto e longo sao o mesmo", regras.mesmoCommit("7eafdb9", "7eafdb9c12"), true);
conferir("commits diferentes", regras.mesmoCommit("7eafdb9", "4c3c5c4"), false);
conferir("commit vazio ou curto demais nunca e igual", [regras.mesmoCommit(null, "7eafdb9"), regras.mesmoCommit("abc", "abc")], [false, false]);

// ---------------------------------------------------------------------------
console.log("\n— decisao do deploy —");

const limpo = { ramo: "main", upstream: "origin/main", aFrente: 0, atras: 0, alterados: [] };
const vpsOk = { alcancavel: true, commitNoAr: "7eafdb9", varreduras: 0, deployEmAndamento: false };
const base = { git: limpo, commitDoGithub: "4c3c5c4", vps: vpsOk, migrations: [] };

conferir("tudo certo: pode, sem avisos", regras.decidirDeploy(base), { pode: true, bloqueios: [], avisos: [], nada: false });
const igual = regras.decidirDeploy({ ...base, commitDoGithub: "7eafdb9" });
conferir("VPS ja roda o GitHub: nada a fazer", [igual.pode, igual.nada], [false, true]);
const local = regras.decidirDeploy({ ...base, git: { ...limpo, alterados: ["a.js", "b.js", "c.js"], aFrente: 1 } });
conferir("arquivo sem commit e commit nao enviado: AVISO, nao bloqueio (varias sessoes na mesma pasta)", [local.pode, local.avisos.length], [true, 2]);
conferir("o aviso diz que NAO vai para a VPS", local.avisos.every((aviso) => aviso.includes("NÃO vão")), true);
conferir("VPS sem resposta: bloqueia", regras.decidirDeploy({ ...base, vps: { alcancavel: false, erro: "timeout" } }).pode, false);
conferir("deploy ja rodando: bloqueia", regras.decidirDeploy({ ...base, vps: { ...vpsOk, deployEmAndamento: true } }).pode, false);
conferir("outra operacao rodando: bloqueia", regras.decidirDeploy({ ...base, outraOperacao: "copia rodando" }).pode, false);
conferir("sem a origin/main: bloqueia", regras.decidirDeploy({ ...base, commitDoGithub: null }).pode, false);
const comMigration = regras.decidirDeploy({ ...base, migrations: ["20261009_x"], vps: { ...vpsOk, varreduras: 2 } });
conferir("migration e varreduras: pode, com os dois avisos", [comMigration.pode, comMigration.avisos.length], [true, 2]);
conferir("GitHub nao lido agora: aviso", regras.decidirDeploy({ ...base, githubLido: false }).avisos.length, 1);

// ---------------------------------------------------------------------------
console.log("\n— decisao da copia —");

conferir("VPS respondendo: pode", regras.decidirCopia({ vps: vpsOk }).pode, true);
conferir("VPS sem resposta: nao (o dump e tirado na hora)", regras.decidirCopia({ vps: { alcancavel: false } }).pode, false);
conferir("deploy rodando na VPS: nao", regras.decidirCopia({ vps: { ...vpsOk, deployEmAndamento: true } }).pode, false);
conferir("outra operacao: nao", regras.decidirCopia({ vps: vpsOk, outraOperacao: "deploy" }).pode, false);

// ---------------------------------------------------------------------------
console.log("\n— log do deploy —");

const logOk = [
  "== Deploy 09.10.2026.17.10 (commit 4c3c5c4)",
  "#12 building...",
  "== Migration pendente: backup antes de aplicar",
  "== Conferindo o site",
  "== De fora: /produtos 401 (401) | Remote-User forjado 401 (401)",
  "== No ar: Versao 09.10.2026.17.10 (commit 4c3c5c4)",
  "== FIM codigo=0",
].join("\n");
const lidoOk = regras.lerSaidaDoDeploy(logOk);
conferir("deploy que deu certo", [lidoOk.ok, lidoOk.versao, lidoOk.commit, lidoOk.passo], [true, "09.10.2026.17.10", "4c3c5c4", "Concluído"]);
conferir("codigo de saida do log", regras.codigoDeSaidaDoLog(logOk), 0);
conferir("log sem FIM: ainda rodando", regras.codigoDeSaidaDoLog("== Deploy x (commit y)\n"), null);
const logRuim = [
  "== Deploy 09.10.2026.17.10 (commit 4c3c5c4)",
  "\u001b[31merro de build\u001b[0m",
  "",
  "== O DEPLOY PAROU no passo: construindo a imagem (linha 70). O que ja foi trocado continua trocado: confira 'docker compose ps'.",
  "   Voltar o codigo:  docker image tag rise:anterior rise:latest && docker compose up -d app worker",
  "   Worker parado?    docker compose up -d worker",
  "== FIM codigo=1",
].join("\n");
const lidoRuim = regras.lerSaidaDoDeploy(logRuim);
conferir("deploy que parou: o passo e os comandos de volta", [lidoRuim.ok, lidoRuim.parou?.passo, lidoRuim.voltar.length], [false, "construindo a imagem", 2]);
conferir("passo no meio do deploy", regras.lerSaidaDoDeploy("== Deploy a (commit b)\n== Conferindo o site\n").passo, "Conferindo o site");

// ---------------------------------------------------------------------------
console.log("\n— estado da operacao —");

const agora = Date.parse("2026-10-09T20:00:00Z");
const copiaVelha = { tipo: "copia", fase: "rodando", inicio: "2026-10-09T19:50:00Z", batimento: "2026-10-09T19:55:00Z" };
conferir("copia sem batimento ha 5 min: travada", regras.estadoDaOperacao(copiaVelha, agora).fase, "travado");
conferir("copia com batimento recente: rodando", regras.estadoDaOperacao({ ...copiaVelha, batimento: "2026-10-09T19:59:50Z" }, agora).fase, "rodando");
conferir("deploy nao tem batimento: o log decide, continua rodando", regras.estadoDaOperacao({ tipo: "deploy", fase: "rodando", inicio: "2026-10-09T19:00:00Z" }, agora).fase, "rodando");
conferir("sem estado", regras.estadoDaOperacao(null, agora), null);

// ---------------------------------------------------------------------------
console.log("\n— parar o servidor do PC: quem morre e quem NUNCA morre —");

const processo = (pid, ppid, nome, comando) => ({ ProcessId: pid, ParentProcessId: ppid, Name: nome, CommandLine: comando });
const RAIZ = "C:\\00-Dev\\Projeto_sistema_Rise\\sistema-rise";
const tabela = regras.lerTabelaDeProcessos(
  JSON.stringify([
    processo(4816, 1, "explorer.exe", "C:\\Windows\\Explorer.EXE"),
    processo(4892, 4816, "claude.exe", "Claude.exe"),
    processo(14392, 4892, "cmd.exe", 'C:\\Windows\\System32\\cmd.exe /C "C:\\Program Files\\nodejs\\npm.cmd" --prefix sistema-rise run dev'),
    processo(1648, 14392, "node.exe", '"node.exe" "npm-cli.js" --prefix sistema-rise run dev'),
    processo(21924, 1648, "cmd.exe", "cmd.exe /d /s /c next dev --experimental-https"),
    processo(16712, 21924, "node.exe", '"node" "...\\next\\dist\\bin\\next" dev --experimental-https'),
    processo(13380, 16712, "node.exe", `"node.exe" ${RAIZ}\\node_modules\\next\\dist\\server\\lib\\start-server.js`),
    processo(4776, 13380, "node.exe", `"node.exe" ${RAIZ}\\node_modules\\next\\dist\\server\\lib\\start-server.js`),
    processo(9001, 4776, "node.exe", `"node.exe" ${RAIZ}\\scripts\\vps-copiar-banco.js`),
    processo(9002, 4776, "node.exe", `"node.exe" ${RAIZ}\\scripts\\worker-pc.js --fonte=cmabc12345`),
    processo(9003, 9002, "node.exe", `"node.exe" ${RAIZ}\\scripts\\worker.js`),
    processo(9004, 9002, "ssh.exe", "ssh -N -L 127.0.0.1:55432:127.0.0.1:5432 rise@vps"),
    processo(7000, 4892, "powershell.exe", "powershell.exe"),
    processo(7001, 7000, "cmd.exe", 'cmd.exe /C "npm.cmd" run dev'),
    processo(7002, 7001, "node.exe", `"node.exe" C:\\00-Dev\\Projeto_sistema_Rise\\sistema-rise-agente-1\\node_modules\\next\\dist\\server\\lib\\start-server.js`),
  ]),
);
conferir("tabela de processos lida", tabela.length, 15);
conferir("objeto unico (um processo so) tambem e lido", regras.lerTabelaDeProcessos(JSON.stringify(processo(1, 0, "x.exe", "x"))).length, 1);
conferir("JSON quebrado: tabela vazia", regras.lerTabelaDeProcessos("isto nao e json"), []);

const escutando = regras.pidsEscutando(
  [
    "  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       4776",
    "  TCP    [::]:3000              [::]:0                 LISTENING       4776",
    "  TCP    0.0.0.0:3001           0.0.0.0:0              LISTENING       7002",
    "  TCP    127.0.0.1:5432         0.0.0.0:0              LISTENING       999",
    "  TCP    127.0.0.1:3000         127.0.0.1:50000        ESTABLISHED     4776",
  ].join("\n"),
);
conferir("quem escuta nas portas do Rise (sem o Postgres, sem conexao aberta)", escutando.sort(), [4776, 7002]);

const raizes = regras.raizesDoServidor(tabela, escutando).sort((a, b) => a - b);
conferir("a raiz sobe ate o npm run dev e para no Claude e no PowerShell", raizes, [7001, 14392]);

const protegidos = regras.protegidosDoServidor(tabela, 9001);
conferir("protegidos: o ajudante e os workers (worker-pc.js e o supervisor worker.js)", protegidos.sort((a, b) => a - b), [9001, 9002, 9003]);

const ordem = regras.pidsParaParar(tabela, raizes, protegidos);
conferir("NUNCA o Claude, o Explorer nem o PowerShell", ordem.some((pid) => [4892, 4816, 7000].includes(pid)), false);
conferir("NUNCA o ajudante nem o worker do PC e os filhos dele (supervisor, tunel)", ordem.some((pid) => [9001, 9002, 9003, 9004].includes(pid)), false);
conferir("a cadeia do servidor desta pasta, filhos antes dos pais", ordem.filter((pid) => pid !== 7001 && pid !== 7002), [4776, 13380, 16712, 21924, 1648, 14392]);
conferir("o servidor da outra pasta tambem para (a copia exige as tres portas livres)", ordem.includes(7002) && ordem.includes(7001), true);

// ---------------------------------------------------------------------------
console.log("\n— scripts mandados a VPS —");

const leitura = regras.scriptDeLeituraDaVps();
conferir("leitura: o SQL vai por heredoc (o docker exec nao engole o resto do script)", leitura.includes("<<'SQL'"), true);
conferir("leitura: termina com sucesso mesmo se o psql falhar", leitura.trim().endsWith("true"), true);
conferir("leitura: o pgrep nao acha a si mesmo", leitura.includes("'[d]eploy-vps.sh'"), true);
const deploy = regras.scriptDoDeploy();
conferir("deploy: baixa o codigo ANTES de rodar o script", deploy.includes("git checkout -q --detach origin/main && ./deploy/deploy-vps.sh"), true);
conferir("deploy: desligado do ssh e com a linha FIM", deploy.includes("setsid nohup") && deploy.includes('echo "== FIM codigo=$?"'), true);
conferir("dump: stdin do docker exec fechado", regras.scriptDoDump().includes("< /dev/null"), true);
conferir("log valido", regras.caminhoDeLogValido("/home/rise/logs/deploy-botao-20261009-171000.log"), true);
conferir(
  "log com aspas, til, relativo ou outro nome: invalido",
  [
    regras.caminhoDeLogValido("/home/rise/logs/deploy-botao-20261009-171000.log'; rm -rf /"),
    regras.caminhoDeLogValido("~/logs/deploy-botao-20261009-171000.log"),
    regras.caminhoDeLogValido("logs/deploy-botao-20261009-171000.log"),
    regras.caminhoDeLogValido("/home/rise/logs/deploy.log"),
    regras.caminhoDeLogValido(null),
  ],
  [false, false, false, false, false],
);
conferir(
  "resumo da copia",
  regras.resumoDaCopia("Dump conferido: x\nRestaurado em 12.3 s\n\nCopia pronta em sistema_rise: 1317 produto(s), 70513 coletado(s)\n").pronta,
  "Copia pronta em sistema_rise: 1317 produto(s), 70513 coletado(s)",
);
conferir("passos da copia: cinco, sem repetir", new Set(Object.values(regras.PASSOS_DA_COPIA)).size, 5);

// ---------------------------------------------------------------------------
console.log("\n— quem esta logado e o botao Sair (src/lib/sessao.js) —");

const cab = (valores) => ({ get: (nome) => valores[nome.toLowerCase()] ?? null });
conferir("VPS = RISE_PRODUCAO; PC = sem ela ou 0", [ambienteDoRise({ RISE_PRODUCAO: "1" }), ambienteDoRise({}), ambienteDoRise({ RISE_PRODUCAO: "0" })], ["vps", "pc", "pc"]);
conferir("na VPS o nome vem do Remote-User", sessaoDoRise(cab({ "remote-user": "Maicol" }), { RISE_PRODUCAO: "1" }), { ambiente: "vps", nome: "Maicol" });
conferir("no PC o Remote-User e ignorado (qualquer um na rede local o mandaria)", sessaoDoRise(cab({ "remote-user": "Intruso" }), {}), { ambiente: "pc", nome: null });
conferir("na VPS sem o cabecalho: sem nome", sessaoDoRise(cab({}), { RISE_PRODUCAO: "1" }), { ambiente: "vps", nome: null });
conferir("nome sem caractere de controle e curto", sessaoDoRise(cab({ "remote-user": "  Mai\u0000col\n " + "x".repeat(80) }), { RISE_PRODUCAO: "1" }).nome.length <= 60, true);
conferir("inicial do nome", [inicialDoNome("Maicol"), inicialDoNome("élcio"), inicialDoNome(""), inicialDoNome(null)], ["M", "É", "?", "?"]);
conferir("Sair vindo do proprio Rise (Origin igual ao Host): aceito", envioDoProprioRise({ origin: "https://rise.4hobby.com.br", host: "rise.4hobby.com.br" }), true);
conferir("Sair vindo de outro site: recusado", envioDoProprioRise({ origin: "https://site-malicioso.com", host: "rise.4hobby.com.br" }), false);
conferir("subdominio parecido: recusado", envioDoProprioRise({ origin: "https://rise.4hobby.com.br.atacante.com", host: "rise.4hobby.com.br" }), false);
conferir("sem Origin: vale o Sec-Fetch-Site same-origin", [envioDoProprioRise({ host: "rise.4hobby.com.br", secFetchSite: "same-origin" }), envioDoProprioRise({ host: "rise.4hobby.com.br", secFetchSite: "cross-site" }), envioDoProprioRise({ host: "rise.4hobby.com.br" })], [true, false, false]);
conferir("Origin \"null\" ou quebrado, ou sem Host: recusado", [envioDoProprioRise({ origin: "null", host: "rise.4hobby.com.br" }), envioDoProprioRise({ origin: "nao e url", host: "rise.4hobby.com.br" }), envioDoProprioRise({ origin: "https://rise.4hobby.com.br", host: "" })], [false, false, false]);

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

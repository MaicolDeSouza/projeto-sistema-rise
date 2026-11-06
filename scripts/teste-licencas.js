import "dotenv/config";

/**
 * Testes das Licencas Softwares (spec 2026-11-05-licencas-softwares-design.md): os programas semeados e os recursos de
 * Acessos; nas tarefas seguintes entram as regras puras, o banco, o arquivo de licenca, a leitura do portal e a
 * importacao das planilhas. SEM rede.
 *
 *   npm run teste:licencas            (apaga o que criou no fim)
 *   npm run teste:licencas -- --manter (deixa os ZZ no banco, para conferir a tela)
 *
 * So escreve licencas ZZ-LIC-*, programas zz-lic-*, clientes "ZZ LIC *" e as leituras do portal deles, apagados no
 * comeco e no fim. A conexao LIGHTBURN (o hash da chave da extensao) volta ao que era.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const manter = process.argv.includes("--manter");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

// ---------------------------------------------------------------------------
// Regras puras (sem banco)
// ---------------------------------------------------------------------------

console.log("\nRegras puras");
const R = await import("../src/lib/ferramentas/licencas/regras.js");
conferir("nome do PC", [R.normalizarNomeDoPc("USUARIO-PC\t\r"), R.normalizarNomeDoPc("  Desktop  M5 "), R.normalizarNomeDoPc(null)], ["usuario-pc", "desktop m5", ""]);
conferir("identificador: chave em maiusculas, arquivo so aparado", [R.normalizarIdentificador(" bfe1ae-16 ", "CHAVE"), R.normalizarIdentificador(" Mach3 VD60 ", "ARQUIVO")], ["BFE1AE-16", "Mach3 VD60"]);
const lb = { ativacoesPermitidas: 3 };
const lida = { portalLidoEm: new Date(), portalAtivacoesPermitidas: null };
const at = (hostname, extra = {}) => ({ id: hostname, hostname, sumiuEm: null, ultimaSincronizacaoEm: null, ...extra });
conferir("vagas: 1 de 3, 2 livres", R.vagasLivres({ software: lb, licenca: lida, ativacoes: [at("A")] }), { permitidas: 3, usadas: 1, livres: 2, lida: true });
conferir("vagas: sumida nao conta", R.vagasLivres({ software: lb, licenca: lida, ativacoes: [at("A"), at("B", { sumiuEm: new Date() })] }).usadas, 1);
conferir("vagas: nunca lida = null, nunca '3 livres'", R.vagasLivres({ software: lb, licenca: { portalLidoEm: null }, ativacoes: [] }), { permitidas: 3, usadas: 0, livres: null, lida: false });
conferir("vagas: portal vence o programa e 4 de 3 da 0", R.vagasLivres({ software: lb, licenca: { ...lida, portalAtivacoesPermitidas: 3 }, ativacoes: [at("A"), at("B"), at("C"), at("D")] }).livres, 0);
conferir("vagas: programa sem limite", R.vagasLivres({ software: { ativacoesPermitidas: null }, licenca: lida, ativacoes: [at("A")] }).livres, null);
const linha = (id, nomeDoPc, situacao = "ATIVA") => ({ id, nomeDoPc, situacao });
const c1 = R.casarLinhasComAtivacoes([linha("l1", "Desktop-A"), linha("l2", null), linha("l3", "PC-X", "ENCERRADA")], [at("desktop-a"), at("PC-X"), at("NOVO")]);
conferir("casamento: por nome sem caixa; encerrada nao casa; sobra = sem cliente", [c1.porLinha.get("l1")?.hostname, c1.porLinha.get("l2"), c1.semCliente.map((a) => a.hostname), c1.empates], ["desktop-a", null, ["PC-X", "NOVO"], []]);
const c2 = R.casarLinhasComAtivacoes([linha("l1", "DESKTOP-PC")], [at("DESKTOP-PC", { id: "a1" }), at("desktop-pc", { id: "a2" })]);
conferir("casamento: dois PCs com o mesmo nome = empate, ninguem casa, nao sao 'sem cliente'", [c2.porLinha.get("l1"), c2.semCliente.length, c2.empates], [null, 0, [{ hostname: "desktop-pc", linhaIds: ["l1"] }]]);
conferir("ultimo uso", R.ultimoUso([at("A", { ultimaSincronizacaoEm: new Date("2026-10-01") }), at("B", { ultimaSincronizacaoEm: new Date("2026-11-01") }), at("C", { ultimaSincronizacaoEm: new Date("2026-12-01"), sumiuEm: new Date() })])?.toISOString(), "2026-11-01T00:00:00.000Z");
const agora = new Date("2026-11-05T12:00:00Z");
const sit = (licenca) => R.situacaoDaLicenca({ licenca: { portalSituacao: "ACTIVE", portalLidoEm: agora, ...licenca }, software: { temPortal: true }, agora });
conferir("situacao: verde > 30 dias", sit({ portalExpiraEm: new Date("2026-12-31T12:00:00Z") }), { cor: "verde", texto: "Expira em 56 dias" });
conferir("situacao: ambar <= 30", sit({ portalExpiraEm: new Date("2026-11-20T12:00:00Z") }).cor, "ambar");
conferir("situacao: expirada", sit({ portalExpiraEm: new Date("2026-10-26T12:00:00Z") }), { cor: "cinza", texto: "Expirada há 10 dias" });
conferir("situacao: suspensa, revogada, outra", [sit({ portalSituacao: "SUSPENDED" }).texto, sit({ portalSituacao: "REVOKED" }).texto, sit({ portalSituacao: "WEIRD" })], ["Suspensa", "Revogada", { cor: "vermelho", texto: "WEIRD" }]);
conferir("situacao: sumiu do portal vence tudo; nunca lida; sem portal", [sit({ portalSumiuEm: agora }).texto, sit({ portalLidoEm: null }), R.situacaoDaLicenca({ licenca: {}, software: { temPortal: false } })], ["Sumiu do portal", { cor: "cinza", texto: "Não lida do portal" }, null]);
conferir("frescor", [R.frescorDaLeitura(null).cor, R.frescorDaLeitura(agora, agora).texto, R.frescorDaLeitura(new Date("2026-11-01T12:00:00Z"), agora), R.frescorDaLeitura(new Date("2026-10-20T12:00:00Z"), agora).cor, R.frescorDaLeitura(new Date("2026-09-01T12:00:00Z"), agora).cor], ["vermelho", "Lido do portal hoje", { cor: "verde", texto: "Lido do portal há 4 dias" }, "ambar", "vermelho"]);
const proj = (identificador, livres, ultimoUso) => ({ identificador, vagas: { livres }, ultimoUso });
conferir("ordem padrao: mais livres, depois uso mais antigo (nunca usada primeiro), depois chave", R.ordenarLicencas([proj("C", 1, null), proj("A", 2, new Date("2026-01-01")), proj("B", 2, null), proj("D", null, null)]).map((p) => p.identificador), ["B", "A", "C", "D"]);
conferir("datas", [R.lerDataIso("2026-11-05")?.toISOString(), R.lerDataIso(""), R.formatarDataCurta(new Date("2026-11-05T00:00:00Z"))], ["2026-11-05T00:00:00.000Z", null, "05/11/26"]);
conferir("resumo da leitura", R.textoDoResumoDaLeitura({ licencas: 78, novas: 2, alteradas: 5, sumiram: 1, pcsSemCliente: 3 }), "78 chaves lidas · 2 novas · 5 alteradas · 1 PC sumiu · 3 PCs sem cliente (abra o Rise)");

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

const { prisma } = await import("../src/lib/db.js");
const inicioDoTeste = new Date();

/** Apaga so o que o teste cria. Arquivos antes das licencas e licencas antes dos programas: os dois sao Restrict. */
async function limpar() {
  await prisma.logIntegracao.deleteMany({ where: { servico: "LIGHTBURN", criadoEm: { gte: inicioDoTeste } } });
  await prisma.leituraDoPortal.deleteMany({ where: { OR: [{ software: { slug: { startsWith: "zz-lic-" } } }, { lidaEm: { gte: inicioDoTeste } }] } });
  await prisma.arquivoDeLicenca.deleteMany({ where: { licenca: { identificador: { startsWith: "ZZ-LIC-" } } } });
  await prisma.licenca.deleteMany({ where: { identificador: { startsWith: "ZZ-LIC-" } } });
  await prisma.software.deleteMany({ where: { slug: { startsWith: "zz-lic-" } } });
  await prisma.cliente.deleteMany({ where: { nome: { startsWith: "ZZ LIC " } } });
}

// A conexao LIGHTBURN como estava: o teste gera chaves da extensao e devolve tudo no fim.
const conexaoOriginal = await prisma.conexao.findUnique({ where: { servico: "LIGHTBURN" } });
async function devolverConexao() {
  if (conexaoOriginal) {
    const { id, servico, criadoEm, atualizadoEm, ...dados } = conexaoOriginal;
    void id; void criadoEm; void atualizadoEm;
    await prisma.conexao.update({ where: { servico }, data: dados });
  } else {
    await prisma.conexao.deleteMany({ where: { servico: "LIGHTBURN" } });
  }
}

await limpar();

try {
  console.log("\nBanco: programas semeados e recursos");
  const softwares = await prisma.software.findMany({ orderBy: { ordem: "asc" }, select: { slug: true, identificacao: true, temPortal: true, ativacoesPermitidas: true, linhasIniciais: true } });
  conferir("LightBurn e Mach3 semeados", softwares.filter((s) => ["lightburn", "mach3"].includes(s.slug)), [
    { slug: "lightburn", identificacao: "CHAVE", temPortal: true, ativacoesPermitidas: 3, linhasIniciais: 3 },
    { slug: "mach3", identificacao: "ARQUIVO", temPortal: false, ativacoesPermitidas: null, linhasIniciais: 1 },
  ]);
  conferir("Servico LIGHTBURN existe", Object.keys((await import("@/generated/prisma/enums")).Servico).includes("LIGHTBURN"), true);
  const { recursoPorId } = await import("../src/lib/acessos/recursos.js");
  conferir("recursos de Acessos", [recursoPorId("tela.ferramentas.licencas")?.pai, recursoPorId("acao.ferramentas.licencas.arquivo")?.pai], ["tela.ferramentas", "tela.ferramentas.licencas"]);
  const { FERRAMENTAS } = await import("../src/lib/ferramentas/catalogo.js");
  conferir("cartao em Ferramentas", FERRAMENTAS.find((f) => f.href === "/ferramentas/licencas")?.recurso, "tela.ferramentas.licencas");

  // Marcador: os blocos de banco seguintes entram acima desta linha.
} finally {
  if (!manter) await devolverConexao();
  if (!manter) await limpar();
  await prisma.$disconnect();
}

console.log(`\n${falhas === 0 ? "Tudo certo." : `${falhas} falha(s).`}`);
process.exit(falhas === 0 ? 0 : 1);

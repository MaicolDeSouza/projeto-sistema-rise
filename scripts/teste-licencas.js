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
// Regras puras (sem banco): entram na Tarefa 3, acima do banco.
// ---------------------------------------------------------------------------

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

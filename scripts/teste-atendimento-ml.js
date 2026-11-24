import "dotenv/config";

/**
 * Testes do Atendimento do Mercado Livre, fase 1: perguntas dos anuncios (spec
 * docs/superpowers/specs/2026-11-24-atendimento-ml-design.md; plano
 * docs/superpowers/plans/2026-11-24-atendimento-ml-fase-1-perguntas.md).
 *
 *   npm run teste:atendimento-ml
 *   npm run teste:atendimento-ml -- --manter   (deixa as perguntas ZZ-ATD-* para conferir a tela)
 *
 * Postgres local, SEM rede e SEM IA paga: o Mercado Livre (scripts/lib/mlPerguntasFalso.js), o Telegram
 * (scripts/lib/telegramFalso.js) e o provedor de IA sao falsos. So escreve atendimentos com idExterno `ZZ-ATD-*`, produtos
 * `ZZ-ATD-*`, usuarios `zz-atd-*` e as linhas do bot com chat `zz-atd-*`; a ConfiguracaoIA, a Conexao TELEGRAM e o estado do
 * bot do dono sao lidos no comeco e devolvidos no fim.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("../src/lib/db.js");

const MANTER = process.argv.includes("--manter");

let falhas = 0;
let total = 0;
function conferir(nome, obtido, esperado) {
  total++;
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

/** O codigo do erro do Prisma (P2002 = unico violado), ou a mensagem quando nao ha codigo. */
async function codigoDoErro(promessa) {
  try {
    await promessa;
    return null;
  } catch (erro) {
    return erro?.code ?? String(erro?.message ?? erro);
  }
}

async function limpar() {
  await prisma.atendimentoML.deleteMany({ where: { idExterno: { startsWith: "ZZ-ATD-" } } });
}

try {
  await limpar();

  // ---------------------------------------------------------------------------------------------------------------
  console.log("\n# Tarefa 1: banco");
  {
    const base = { tipo: "PERGUNTA", textoDoCliente: "Tem em estoque?", situacaoNoML: "UNANSWERED", recebidaEm: new Date() };
    const criada = await prisma.atendimentoML.create({ data: { ...base, idExterno: "ZZ-ATD-1" } });
    conferir("pergunta nasce ABERTA", criada.status, "ABERTA");
    conferir("a mesma pergunta nao entra duas vezes", await codigoDoErro(prisma.atendimentoML.create({ data: { ...base, idExterno: "ZZ-ATD-1" } })), "P2002");
    await limpar();
  }

  // MARCADOR: blocos novos entram acima desta linha.
} finally {
  if (!MANTER) await limpar();
  await prisma.$disconnect();
}

console.log(`\n${total} asserções, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);

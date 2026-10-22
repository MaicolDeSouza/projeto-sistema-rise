import "dotenv/config";

/**
 * Testes da Entrega C1 do Rise AI, os avisos no Telegram (spec docs/superpowers/specs/2026-10-12-rise-ia-agente-design.md,
 * §7 Entrega C; plano docs/superpowers/plans/2026-10-22-rise-ia-entrega-c1-telegram.md).
 *
 *   npm run teste:telegram
 *
 * Postgres local, SEM rede: o Telegram e falso (scripts/lib/telegramFalso.js) e a unica chamada "de verdade" vai a um
 * host `.invalid`, so para ver a linha de log. So escreve usuarios `zz-tg-*`, avisos com chave ou chat `zz-tg-*`,
 * produtos `ZZ-TG-*` e a auditoria feita por `zz-tg-*`; a Conexao TELEGRAM e a ConfiguracaoIA do dono sao lidas no
 * comeco e devolvidas no fim.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("../src/lib/db.js");

let falhas = 0;
let total = 0;
function conferir(nome, obtido, esperado) {
  total++;
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
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

/** Apaga tudo o que os testes criam. Roda no comeco e no fim. */
async function limpar() {
  if (prisma.avisoTelegram) {
    await prisma.avisoTelegram.deleteMany({ where: { OR: [{ chave: { startsWith: "zz-tg-" } }, { chatId: { startsWith: "zz-tg-" } }] } });
  }
  await prisma.auditoriaDeAcesso.deleteMany({ where: { quem: { startsWith: "zz-tg-" } } });
  await prisma.usuarioFuncao.deleteMany({ where: { usuario: { login: { startsWith: "zz-tg-" } } } });
  await prisma.usuarioRise.deleteMany({ where: { login: { startsWith: "zz-tg-" } } });
  await prisma.logIntegracao.deleteMany({ where: { servico: "TELEGRAM", endpoint: { contains: "teste-rise.invalid" } } }).catch(() => null);
}

// O que e do dono e volta no fim, como esta.
const conexaoDoDono = await prisma.conexao.findUnique({ where: { servico: "TELEGRAM" } }).catch(() => null);
const configuracaoDoDono = await prisma.configuracaoIA.findUnique({ where: { id: "unica" } });

async function devolverODoDono() {
  if (conexaoDoDono) {
    const { id: _id, servico: _servico, ...dados } = conexaoDoDono;
    await prisma.conexao.upsert({ where: { servico: "TELEGRAM" }, update: dados, create: { servico: "TELEGRAM", ...dados } });
  } else {
    await prisma.conexao.deleteMany({ where: { servico: "TELEGRAM" } }).catch(() => null);
  }
  if (configuracaoDoDono) {
    await prisma.configuracaoIA.update({ where: { id: "unica" }, data: { dados: configuracaoDoDono.dados } });
  } else {
    await prisma.configuracaoIA.deleteMany({ where: { id: "unica" } });
  }
}

await limpar();
try {
  {
    console.log("\nBanco");
    const u = await prisma.usuarioRise.create({ data: { login: "zz-tg-um", nome: "ZZ TG Um", codigoDeVinculoHash: "a".repeat(64), codigoDeVinculoExpiraEm: new Date() } });
    conferir("usuario guarda o hash e a validade do codigo", [u.codigoDeVinculoHash.length, u.codigoDeVinculoExpiraEm instanceof Date], [64, true]);
    await prisma.avisoTelegram.create({ data: { chave: "zz-tg-chave-1", tipo: "produtoZerou", chatId: "zz-tg-chat", texto: "x" } });
    conferir("chave do aviso e unica", await codigoDoErro(prisma.avisoTelegram.create({ data: { chave: "zz-tg-chave-1", tipo: "produtoZerou", chatId: "zz-tg-chat", texto: "y" } })), "P2002");
    conferir("aviso nasce sem envio e com 0 tentativas", (await prisma.avisoTelegram.findUnique({ where: { chave: "zz-tg-chave-1" } })).tentativas, 0);
    conferir("Servico aceita TELEGRAM", (await prisma.logIntegracao.create({ data: { servico: "TELEGRAM", metodo: "GET", endpoint: "https://teste-rise.invalid/bot***/getMe", statusHttp: 200, duracaoMs: 1 } })).servico, "TELEGRAM");
  }

  // MARCADOR: blocos novos entram acima desta linha.
} finally {
  await limpar();
  await devolverODoDono();
  await prisma.$disconnect();
}

console.log(`\n${total} asserções, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);

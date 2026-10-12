import "dotenv/config";

/**
 * Testes do projeto Acessos (spec docs/superpowers/specs/2026-10-12-acessos-design.md; plano
 * docs/superpowers/plans/2026-10-12-acessos-lancamento-1.md).
 *
 *   npm run teste:acessos
 *
 * Postgres local, SEM rede. So escreve logins `zz-ac-*`, funcoes `ZZ-AC *`, a auditoria feita por `zz-ac-*` e as
 * marcas de semeadura `zz-ac-*`; apaga tudo no comeco (resto de uma execucao que caiu) e no fim. Nunca toca nos
 * usuarios e funcoes de verdade.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("../src/lib/db.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
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
  await prisma.auditoriaDeAcesso.deleteMany({ where: { quem: { startsWith: "zz-ac-" } } });
  await prisma.usuarioRise.deleteMany({ where: { login: { startsWith: "zz-ac-" } } });
  await prisma.funcaoRise.deleteMany({ where: { nome: { startsWith: "ZZ-AC" } } });
  await prisma.semeaduraDeAcessos.deleteMany({ where: { chave: { startsWith: "zz-ac-" } } });
}

try {
  await limpar();

  // --- banco: as tabelas da migration `_acessos`, com as regras que o banco garante sozinho ---
  {
    const funcao = await prisma.funcaoRise.create({
      data: { nome: "ZZ-AC Teste", descricao: "funcao de teste", permissoes: { create: [{ recurso: "tela.produtos", nivel: "ver" }] } },
    });
    const usuario = await prisma.usuarioRise.create({
      data: {
        login: "zz-ac-um",
        nome: "Um",
        funcoes: { create: [{ funcaoId: funcao.id }] },
        excecoes: { create: [{ recurso: "dado.custo", nivel: "nenhum" }] },
      },
    });
    conferir("usuario nasce ativo, sem ultimo acesso", [usuario.ativo, usuario.ultimoAcessoEm], [true, null]);
    conferir("funcao nasce nao fixa", funcao.fixa, false);
    conferir("login e unico", await codigoDoErro(prisma.usuarioRise.create({ data: { login: "zz-ac-um", nome: "Outro" } })), "P2002");
    conferir("nome da funcao e unico", await codigoDoErro(prisma.funcaoRise.create({ data: { nome: "ZZ-AC Teste" } })), "P2002");
    conferir(
      "uma permissao por recurso em cada funcao",
      await codigoDoErro(prisma.permissaoDaFuncao.create({ data: { funcaoId: funcao.id, recurso: "tela.produtos", nivel: "editar" } })),
      "P2002",
    );
    conferir(
      "uma excecao por recurso em cada usuario",
      await codigoDoErro(prisma.excecaoDoUsuario.create({ data: { usuarioId: usuario.id, recurso: "dado.custo", nivel: "ver" } })),
      "P2002",
    );
    await prisma.usuarioRise.update({ where: { id: usuario.id }, data: { telegramChatId: "zz-ac-chat-1" } });
    conferir(
      "o chat do Telegram so liga a um usuario",
      await codigoDoErro(prisma.usuarioRise.create({ data: { login: "zz-ac-dois", nome: "Dois", telegramChatId: "zz-ac-chat-1" } })),
      "P2002",
    );

    // O mesmo client gerado que o db.js usa, pelo mesmo atalho "@/" (o resolver-alias.js resolve).
    const { Prisma } = await import("@/generated/prisma/client");
    await prisma.auditoriaDeAcesso.create({
      data: { quem: "zz-ac-um", oQue: "usuario.salvar", alvo: usuario.id, antes: Prisma.DbNull, depois: { nome: "Um", ativo: true } },
    });
    const auditoria = await prisma.auditoriaDeAcesso.findFirst({ where: { quem: "zz-ac-um" } });
    conferir("auditoria guarda o antes nulo e o depois em JSON", [auditoria.antes, auditoria.depois], [null, { nome: "Um", ativo: true }]);

    await prisma.semeaduraDeAcessos.create({ data: { chave: "zz-ac-atendimento" } });
    conferir("marca de semeadura e unica", await codigoDoErro(prisma.semeaduraDeAcessos.create({ data: { chave: "zz-ac-atendimento" } })), "P2002");

    await prisma.funcaoRise.delete({ where: { id: funcao.id } });
    conferir(
      "apagar a funcao leva as permissoes e o vinculo, e o usuario fica",
      [
        await prisma.permissaoDaFuncao.count({ where: { funcaoId: funcao.id } }),
        await prisma.usuarioFuncao.count({ where: { funcaoId: funcao.id } }),
        await prisma.usuarioRise.count({ where: { id: usuario.id } }),
      ],
      [0, 0, 1],
    );
    await prisma.usuarioRise.delete({ where: { id: usuario.id } });
    conferir("apagar o usuario leva as excecoes", await prisma.excecaoDoUsuario.count({ where: { usuarioId: usuario.id } }), 0);
  }

  // (os blocos das tarefas seguintes entram aqui, antes do finally)
} catch (erro) {
  falhas++;
  console.error("FALHA inesperada:", erro);
} finally {
  await limpar().catch((erro) => console.error("limpeza falhou:", erro));
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);

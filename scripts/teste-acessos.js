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

  // --- catalogo: a lista unica de recursos (src/lib/acessos/recursos.js) ---
  {
    const { RECURSOS, NIVEIS_POR_TIPO, NAO_DELEGAVEIS, ordemDoNivel, recursoPorId, validarNivel, gruposDaMatriz } = await import(
      "../src/lib/acessos/recursos.js"
    );
    const { blocos } = await import("../src/lib/blocos.js");
    const ids = RECURSOS.map((recurso) => recurso.id);
    conferir("ids do catalogo sao unicos", ids.length === new Set(ids).size, true);
    conferir("todo recurso tem um tipo conhecido", RECURSOS.filter((recurso) => !NIVEIS_POR_TIPO[recurso.tipo]).map((recurso) => recurso.id), []);
    // Configuracoes entra no menu na Tarefa 10, no lugar de Integracoes, que vira cartao dentro dela.
    const hrefs = new Set([...blocos.map((bloco) => bloco.href), "/configuracoes"]);
    conferir(
      "todo grupo e um bloco do menu ou os dados sensiveis",
      RECURSOS.filter((recurso) => recurso.grupo !== "dados" && !hrefs.has(recurso.grupo)).map((recurso) => recurso.id),
      [],
    );
    conferir("todo pai existe e vem antes do filho", RECURSOS.filter((recurso, i) => recurso.pai && (ids.indexOf(recurso.pai) < 0 || ids.indexOf(recurso.pai) > i)).map((recurso) => recurso.id), []);
    const entradas = new Set(RECURSOS.filter((recurso) => recurso.tipo === "tela" && !recurso.pai).map((recurso) => recurso.grupo));
    conferir(
      "todo bloco do menu (menos Integracoes, que vira cartao) tem uma tela de entrada sem pai",
      [...hrefs].filter((href) => href !== "/integracoes" && !entradas.has(href)),
      [],
    );
    conferir("so Usuarios e funcoes nao e delegavel", NAO_DELEGAVEIS, ["tela.configuracoes.usuarios"]);
    conferir(
      "os sete dados sensiveis estao no grupo dos dados, com a dica de onde aparecem",
      RECURSOS.filter((recurso) => recurso.grupo === "dados").map((recurso) => [recurso.id, Boolean(recurso.dica)]),
      [
        ["dado.custo", true],
        ["dado.margem", true],
        ["dado.localizacao", true],
        ["dado.estoqueExato", true],
        ["dado.concorrentes", true],
        ["dado.pessoalDoCliente", true],
        ["dado.financeiro", true],
      ],
    );
    conferir(
      "ids que as outras tarefas usam existem",
      [
        "tela.painel", "cartao.painel.produtos", "cartao.painel.anunciosPublicados", "tela.produtos", "tela.produtos.cadastro",
        "acao.produtos.sincronizarBling", "acao.vps.deploy", "tela.riseAi", "riseAi.chat", "riseAi.revisao", "riseAi.conhecimento",
        "riseAi.consumo", "riseAi.configuracoes", "tela.configuracoes", "tela.configuracoes.usuarios", "tela.integracoes",
      ].filter((id) => !recursoPorId(id)),
      [],
    );
    conferir("recurso que nao existe", recursoPorId("tela.naoExiste"), null);
    conferir(
      "niveis validos por tipo",
      [validarNivel("tela.produtos", "excluir"), validarNivel("dado.custo", "excluir"), validarNivel("acao.vps.deploy", "executar"), validarNivel("acao.vps.deploy", "ver"), validarNivel("cartao.painel.produtos", "editar"), validarNivel("tela.naoExiste", "ver")],
      [true, false, true, false, false, false],
    );
    conferir(
      "ordem dos niveis (executar vale como ver; nivel desconhecido fica abaixo de tudo)",
      ["nenhum", "ver", "executar", "editar", "excluir", "voar"].map(ordemDoNivel),
      [0, 1, 1, 2, 3, -1],
    );
    const grupos = gruposDaMatriz();
    conferir("a matriz termina nos dados sensiveis e nao tem grupo vazio", [grupos.at(-1).grupo, grupos.filter((g) => g.recursos.length === 0).length], ["dados", 0]);
    conferir("a matriz nao mostra o que nao e delegavel", grupos.flatMap((g) => g.recursos).some((recurso) => !recurso.delegavel), false);
    conferir("o grupo da matriz leva o nome da tela de entrada", grupos.find((g) => g.grupo === "/rise-ai").rotulo, "Rise AI");
  }

  // --- resolucao: o nivel efetivo de cada recurso (src/lib/acessos/resolucao.js) ---
  {
    const { resolverPermissoes, podeNo, blocosOcultos, contarLiberados } = await import("../src/lib/acessos/resolucao.js");
    const { RECURSOS } = await import("../src/lib/acessos/recursos.js");
    const funcao = (...permissoes) => ({ permissoes: permissoes.map(([recurso, nivel]) => ({ recurso, nivel })) });
    const excecao = (recurso, nivel) => ({ recurso, nivel });
    const resolver = (funcoes, excecoes = [], administrador = false) => resolverPermissoes({ funcoes, excecoes, administrador });

    conferir("o maior nivel entre as funcoes", resolver([funcao(["tela.produtos", "ver"]), funcao(["tela.produtos", "editar"])]).get("tela.produtos"), "editar");
    conferir("a excecao vence a funcao, para menos", resolver([funcao(["tela.produtos", "editar"])], [excecao("tela.produtos", "nenhum")]).has("tela.produtos"), false);
    conferir("a excecao vence a funcao, para mais", resolver([funcao(["tela.produtos", "ver"])], [excecao("tela.produtos", "excluir")]).get("tela.produtos"), "excluir");
    const semTela = resolver([funcao(["tela.produtos.cadastro", "editar"], ["acao.produtos.sincronizarBling", "executar"], ["acao.produtos.gerarTextoComIA", "executar"])]);
    conferir(
      "tela nenhum derruba as sub-telas e as acoes dela, inclusive a acao da sub-tela",
      ["tela.produtos.cadastro", "acao.produtos.sincronizarBling", "acao.produtos.gerarTextoComIA"].map((id) => semTela.has(id)),
      [false, false, false],
    );
    const admin = resolver([], [], true);
    conferir(
      "administrador tem o maior nivel de cada tipo, delegavel ou nao",
      ["tela.produtos", "dado.custo", "acao.vps.deploy", "tela.configuracoes.usuarios", "cartao.painel.produtos", "riseAi.revisao"].map((id) => admin.get(id)),
      ["excluir", "editar", "executar", "excluir", "ver", "editar"],
    );
    conferir("administrador tem todos os recursos do catalogo", admin.size, RECURSOS.length);
    conferir(
      "recurso fora do catalogo e nivel invalido sao ignorados sem lancar",
      [...resolver([funcao(["tela.naoExiste", "ver"], ["tela.produtos", "voar"], ["dado.custo", "excluir"])]).keys()],
      [],
    );
    conferir(
      "recurso nao delegavel gravado numa funcao ou excecao nao vale (so pelo administrador)",
      [
        resolver([funcao(["tela.configuracoes", "ver"], ["tela.configuracoes.usuarios", "editar"])]).has("tela.configuracoes.usuarios"),
        resolver([funcao(["tela.configuracoes", "ver"])], [excecao("tela.configuracoes.usuarios", "excluir")]).has("tela.configuracoes.usuarios"),
      ],
      [false, false],
    );
    const custoEditar = resolver([funcao(["dado.custo", "editar"])]);
    conferir(
      "pode: editar inclui ver; ausente e nao; nivel pedido invalido e nao",
      [podeNo(custoEditar, "dado.custo", "ver"), podeNo(custoEditar, "dado.custo", "editar"), podeNo(custoEditar, "dado.margem", "ver"), podeNo(custoEditar, "dado.custo", "voar"), podeNo(custoEditar, "dado.custo", "nenhum")],
      [true, true, false, false, false],
    );
    const semRiseAi = resolver([funcao(["tela.configuracoes", "ver"], ["riseAi.chat", "editar"])]);
    conferir("bloco cuja tela de entrada e nenhum fica oculto (e a capacidade some junto)", [blocosOcultos(semRiseAi, ["/rise-ai", "/configuracoes"]), semRiseAi.has("riseAi.chat")], [["/rise-ai"], false]);
    conferir("bloco que nao tem tela de entrada no catalogo fica oculto (falha fechada)", blocosOcultos(admin, ["/naoExiste"]), ["/naoExiste"]);
    const totalProdutos = RECURSOS.filter((recurso) => recurso.grupo === "/produtos" && recurso.delegavel).length;
    conferir("contar os liberados de um grupo", contarLiberados(resolver([funcao(["tela.produtos", "ver"])]), "/produtos"), { liberados: 1, total: totalProdutos });
    const totalTelas = RECURSOS.filter((recurso) => recurso.tipo === "tela" && recurso.delegavel).length;
    conferir(
      "contar as telas liberadas de todos os grupos",
      contarLiberados(resolver([funcao(["tela.produtos", "ver"], ["tela.produtos.cadastro", "ver"], ["dado.custo", "ver"])]), null, { tipo: "tela" }),
      { liberados: 2, total: totalTelas },
    );
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

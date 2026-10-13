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

  // --- sessao: quem e a pessoa e o que pode (src/lib/acessos/sessao.js, pura) ---
  {
    const { LOGINS_RESERVADOS, normalizarLogin, loginDaRequisicao, montarSessao, quebraVidro, precisaGravarAcesso } = await import(
      "../src/lib/acessos/sessao.js"
    );
    const vps = { RISE_PRODUCAO: "1", RISE_SEGREDO_DE_BORDA: "segredo-de-teste-123" };
    const pedido = (cabecalhos) => new Headers(cabecalhos);
    const daVps = (cabecalhos, env = vps) => loginDaRequisicao(pedido(cabecalhos), env);

    conferir("logins reservados", LOGINS_RESERVADOS, ["pc", "desconhecido"]);
    conferir("normalizar login: minusculas, aparado, sem controle, vazio vira vazio", [normalizarLogin(" Maicol "), normalizarLogin("AN\u0007DREA"), normalizarLogin(null), normalizarLogin("x".repeat(80)).length], ["maicol", "andrea", "", 60]);
    conferir("VPS: Remote-User com espaco e maiuscula e o mesmo login, com o segredo certo", daVps({ "remote-user": " Maicol ", "x-rise-borda": "segredo-de-teste-123" }), { ambiente: "vps", login: "maicol", motivo: null });
    conferir("VPS: segredo errado vale como sem login", daVps({ "remote-user": "maicol", "x-rise-borda": "outro" }), { ambiente: "vps", login: null, motivo: "sem-login" });
    conferir("VPS: segredo ausente vale como sem login", daVps({ "remote-user": "maicol" }), { ambiente: "vps", login: null, motivo: "sem-login" });
    conferir("VPS: sem a variavel do segredo ninguem entra", daVps({ "remote-user": "maicol", "x-rise-borda": "" }, { RISE_PRODUCAO: "1" }), { ambiente: "vps", login: null, motivo: "sem-segredo" });
    conferir("VPS: login reservado nao entra", daVps({ "remote-user": "PC", "x-rise-borda": "segredo-de-teste-123" }), { ambiente: "vps", login: null, motivo: "reservado" });
    conferir("VPS: RISE_SIMULAR_LOGIN e ignorada", daVps({ "remote-user": "maicol", "x-rise-borda": "segredo-de-teste-123" }, { ...vps, RISE_SIMULAR_LOGIN: "andrea" }), { ambiente: "vps", login: "maicol", motivo: null });
    conferir("PC sem simulacao e o login pc", loginDaRequisicao(pedido({ "remote-user": "maicol" }), {}), { ambiente: "pc", login: "pc", motivo: null });
    conferir("PC com RISE_SIMULAR_LOGIN", loginDaRequisicao(pedido({}), { RISE_SIMULAR_LOGIN: " Andrea " }), { ambiente: "pc", login: "andrea", motivo: "simulado" });
    conferir("quebra-vidro compara sem caixa e ignora vazio", [quebraVidro("maicol", { RISE_AI_ADMINS: " Maicol , outro" }), quebraVidro("andrea", { RISE_AI_ADMINS: "maicol" }), quebraVidro(null, { RISE_AI_ADMINS: "maicol" }), quebraVidro("maicol", {})], [true, false, false, false]);

    const atendimento = { fixa: false, permissoes: [{ recurso: "tela.riseAi", nivel: "ver" }, { recurso: "riseAi.chat", nivel: "editar" }] };
    const usuario = (extra = {}) => ({ login: "andrea", ativo: true, funcoes: [{ funcao: atendimento }], excecoes: [], ...extra });
    const pc = montarSessao({ ambiente: "pc", login: "pc", motivo: null, usuario: null, quebraVidro: false });
    conferir("PC sem simulacao e administrador e pode tudo", [pc.estado, pc.administrador, pc.pode("tela.configuracoes.usuarios", "editar"), pc.simulando], ["ok", true, true, null]);
    const simuladoSemCadastro = montarSessao({ ambiente: "pc", login: "andrea", motivo: "simulado", usuario: null, quebraVidro: false });
    conferir("PC simulado sem cadastro nao pode nada", [simuladoSemCadastro.estado, simuladoSemCadastro.administrador, simuladoSemCadastro.pode("tela.riseAi", "ver"), simuladoSemCadastro.simulando], ["nao-cadastrado", false, false, "andrea"]);
    const andrea = montarSessao({ ambiente: "vps", login: "andrea", motivo: null, usuario: usuario(), quebraVidro: false });
    conferir("a funcao Atendimento conversa e nao revisa", [andrea.estado, andrea.administrador, andrea.pode("riseAi.chat", "editar"), andrea.pode("riseAi.revisao", "ver")], ["ok", false, true, false]);
    const inativa = montarSessao({ ambiente: "vps", login: "andrea", motivo: null, usuario: usuario({ ativo: false }), quebraVidro: false });
    conferir("usuario inativo vale como sem acesso", [inativa.estado, inativa.pode("riseAi.chat", "ver")], ["inativo", false]);
    const dono = montarSessao({ ambiente: "vps", login: "maicol", motivo: null, usuario: usuario({ login: "maicol", ativo: false }), quebraVidro: true });
    conferir("quebra-vidro e administrador mesmo inativo", [dono.estado, dono.administrador, dono.pode("tela.configuracoes.usuarios", "editar")], ["ok", true, true]);
    const fixa = montarSessao({ ambiente: "vps", login: "maicol", motivo: null, usuario: usuario({ login: "maicol", funcoes: [{ funcao: { fixa: true, permissoes: [] } }] }), quebraVidro: false });
    conferir("quem tem a funcao fixa e administrador", [fixa.administrador, fixa.pode("acao.vps.deploy", "executar")], [true, true]);
    const semSegredo = montarSessao({ ambiente: "vps", login: null, motivo: "sem-segredo", usuario: null, quebraVidro: false });
    conferir("sem segredo de borda: estado proprio e nada liberado", [semSegredo.estado, semSegredo.pode("tela.painel", "ver")], ["sem-segredo", false]);
    const bancoForaNaVps = montarSessao({ ambiente: "vps", login: "andrea", motivo: null, usuario: null, quebraVidro: false, erroBanco: true });
    const bancoForaNoPc = montarSessao({ ambiente: "pc", login: "andrea", motivo: "simulado", usuario: null, quebraVidro: false, erroBanco: true });
    conferir("banco fora: na VPS nada; no PC administrador (para Integracoes abrir)", [bancoForaNaVps.estado, bancoForaNaVps.administrador, bancoForaNoPc.estado, bancoForaNoPc.administrador], ["erro-banco", false, "erro-banco", true]);

    const agora = new Date("2026-10-12T20:00:00Z");
    conferir("ultimo acesso: grava a cada 10 minutos", [precisaGravarAcesso(null, agora), precisaGravarAcesso(new Date(agora - 9 * 60000), agora), precisaGravarAcesso(new Date(agora - 11 * 60000), agora)], [true, false, true]);
  }

  // --- involucro: toda Server Action passa por aqui (src/lib/acessos/involucro.js, puro) ---
  {
    const { executarComSessao } = await import("../src/lib/acessos/involucro.js");
    const { ErroDeAcesso } = await import("../src/lib/acessos/erros.js");
    const { ErroDeUso } = await import("../src/lib/riseAi/erros.js");
    const sessaoQuePode = async () => ({ login: "zz-ac-um", pode: () => true });
    const sessaoQueNaoPode = async () => ({ login: "zz-ac-um", pode: () => false });
    const errosNoConsole = [];
    const consoleOriginal = console.error;
    console.error = (...partes) => errosNoConsole.push(partes.join(" "));
    try {
      conferir("pode: devolve ok e o que o trabalho devolveu", await executarComSessao(sessaoQuePode, "riseAi.revisao", "ver", async () => ({ x: 1 })), { ok: true, x: 1 });
      let rodou = false;
      conferir(
        "nao pode: recusa com o nome do recurso, sem rodar o trabalho",
        [await executarComSessao(sessaoQueNaoPode, "riseAi.revisao", "ver", async () => { rodou = true; return {}; }), rodou],
        [{ ok: false, erro: "Sem permissão para Rise AI › Revisão do dia." }, false],
      );
      conferir("erro de uso vira a mensagem", await executarComSessao(sessaoQuePode, "riseAi.chat", "editar", async () => { throw new ErroDeUso("Conversa não encontrada."); }), { ok: false, erro: "Conversa não encontrada." });
      conferir("erro de acesso lancado dentro do trabalho tambem recusa", await executarComSessao(sessaoQuePode, "riseAi.chat", "editar", async () => { throw new ErroDeAcesso("dado.custo", "ver"); }), { ok: false, erro: "Sem permissão para Custo e fornecedores." });
      conferir(
        "defeito nosso vira o aviso generico e vai para o log",
        [await executarComSessao(sessaoQuePode, "riseAi.chat", "editar", async () => { throw new TypeError("x is undefined"); }), errosNoConsole.length],
        [{ ok: false, erro: "Não foi possível concluir agora. Tente de novo em instantes." }, 1],
      );
      conferir("um ok:false do trabalho vence o ok:true", await executarComSessao(sessaoQuePode, "riseAi.chat", "editar", async () => ({ ok: false, erro: "y" })), { ok: false, erro: "y" });
      conferir("falha ao montar a sessao vira o aviso generico", (await executarComSessao(async () => { throw new Error("banco"); }, "riseAi.chat", "ver", async () => ({}))).ok, false);
    } finally {
      console.error = consoleOriginal;
    }
  }

  // --- semeadura: Administrador e Atendimento na partida, e o acessos:admin (src/lib/acessos/semeadura.js) ---
  {
    const { PERMISSOES_DA_ATENDIMENTO, semearAcessos, promoverAdministrador } = await import("../src/lib/acessos/semeadura.js");
    const { validarNivel, recursoPorId } = await import("../src/lib/acessos/recursos.js");
    // Nomes e chave de teste: a semeadura de verdade (Administrador, Atendimento, "atendimento") nunca e tocada aqui.
    // Chave propria: o bloco do banco, acima, ja deixou "zz-ac-atendimento" gravada (e a semeadura a respeitaria).
    const opcoes = { nomes: { administrador: "ZZ-AC Administrador", atendimento: "ZZ-AC Atendimento" }, chaves: { atendimento: "zz-ac-semeadura" } };
    const env = { RISE_AI_ADMINS: "ZZ-AC-Dono, pc" };

    conferir("permissoes da Atendimento sao todas validas e delegaveis", PERMISSOES_DA_ATENDIMENTO.filter(({ recurso, nivel }) => !validarNivel(recurso, nivel) || !recursoPorId(recurso).delegavel), []);
    const nivelDe = (id) => PERMISSOES_DA_ATENDIMENTO.find((p) => p.recurso === id)?.nivel ?? "nenhum";
    conferir(
      "Atendimento: chat do Rise AI, Produtos e custo em ver; nada de acao, Revisao ou Configuracoes",
      [nivelDe("tela.riseAi"), nivelDe("riseAi.chat"), nivelDe("tela.produtos"), nivelDe("dado.custo"), nivelDe("riseAi.revisao"), nivelDe("tela.configuracoes"), PERMISSOES_DA_ATENDIMENTO.some((p) => p.recurso.startsWith("acao."))],
      ["ver", "editar", "ver", "ver", "nenhum", "nenhum", false],
    );

    const primeira = await semearAcessos({ prisma, env, ...opcoes });
    const atendimento = await prisma.funcaoRise.findUnique({ where: { nome: "ZZ-AC Atendimento" }, include: { permissoes: true } });
    const administrador = await prisma.funcaoRise.findUnique({ where: { nome: "ZZ-AC Administrador" } });
    const dono = await prisma.usuarioRise.findUnique({ where: { login: "zz-ac-dono" }, include: { funcoes: true } });
    conferir(
      "primeira semeadura: Administrador fixa, Atendimento com as permissoes, o login do .env (reservado de fora) com Administrador",
      [administrador.fixa, atendimento.permissoes.length, primeira.atendimentoCriada, primeira.usuariosCriados, dono.funcoes.map((f) => f.funcaoId)],
      [true, PERMISSOES_DA_ATENDIMENTO.length, true, ["zz-ac-dono"], [administrador.id]],
    );
    const segunda = await semearAcessos({ prisma, env, ...opcoes });
    conferir("segunda semeadura nao cria nada", [segunda.atendimentoCriada, segunda.usuariosCriados, segunda.administradorId], [false, [], administrador.id]);
    await prisma.funcaoRise.delete({ where: { id: atendimento.id } });
    await prisma.usuarioFuncao.deleteMany({ where: { usuarioId: dono.id } });
    const terceira = await semearAcessos({ prisma, env, ...opcoes });
    conferir(
      "a Atendimento excluida nao renasce, e a funcao tirada do usuario nao volta",
      [terceira.atendimentoCriada, await prisma.funcaoRise.count({ where: { nome: "ZZ-AC Atendimento" } }), await prisma.usuarioFuncao.count({ where: { usuarioId: dono.id } })],
      [false, 0, 0],
    );

    await prisma.usuarioRise.update({ where: { id: dono.id }, data: { ativo: false } });
    const promovido = await promoverAdministrador({ prisma, login: " ZZ-AC-Dono ", nomeAdministrador: "ZZ-AC Administrador" });
    const depois = await prisma.usuarioRise.findUnique({ where: { id: dono.id }, include: { funcoes: true } });
    conferir("acessos:admin reativa e liga a Administrador", [promovido.criado, depois.ativo, depois.funcoes.map((f) => f.funcaoId)], [false, true, [administrador.id]]);
    const novo = await promoverAdministrador({ prisma, login: "zz-ac-novo", nomeAdministrador: "ZZ-AC Administrador" });
    conferir("acessos:admin cria quem nao existe", [novo.criado, await prisma.usuarioFuncao.count({ where: { usuario: { login: "zz-ac-novo" }, funcaoId: administrador.id } })], [true, 1]);
    conferir("acessos:admin recusa login reservado ou vazio", [await codigoDoErro(promoverAdministrador({ prisma, login: "pc", nomeAdministrador: "ZZ-AC Administrador" })), await codigoDoErro(promoverAdministrador({ prisma, login: "  ", nomeAdministrador: "ZZ-AC Administrador" }))], ["Este login não pode ser usado.", "Informe o login."]);
  }

  // --- menu: Configuracoes por ultimo, Integracoes vira cartao (src/lib/blocos.js) ---
  {
    const { blocos, ehRotaAtiva } = await import("../src/lib/blocos.js");
    const configuracoes = blocos.at(-1);
    conferir("Configuracoes e o ultimo item do menu, e Integracoes saiu", [configuracoes.href, configuracoes.rotulo, blocos.some((bloco) => bloco.href === "/integracoes")], ["/configuracoes", "Configurações", false]);
    conferir(
      "Configuracoes acende em /configuracoes/*, em /integracoes e na tela de configuracoes do Rise AI",
      ["/configuracoes", "/configuracoes/usuarios", "/integracoes", "/rise-ai/configuracoes", "/produtos"].map((rota) => ehRotaAtiva(rota, configuracoes.href, configuracoes.rotasExtras)),
      [true, true, true, true, false],
    );
    conferir("o Rise AI continua aceso na tela de configuracoes dele, e o Painel so na raiz", [ehRotaAtiva("/rise-ai/configuracoes", "/rise-ai"), ehRotaAtiva("/", "/"), ehRotaAtiva("/produtos", "/")], [true, true, false]);
  }

  // --- configuracoes: os cartoes e o detalhe vivo de cada um (src/lib/configuracoes/) ---
  {
    const { CARTOES_DE_CONFIGURACOES } = await import("../src/lib/configuracoes/catalogo.js");
    const { detalheDeUsuarios, detalheDeIntegracoes, detalheDoRiseAi } = await import("../src/lib/configuracoes/detalhes.js");
    conferir("os tres cartoes, cada um com o seu recurso", CARTOES_DE_CONFIGURACOES.map((cartao) => [cartao.href, cartao.recurso]), [
      ["/configuracoes/usuarios", "tela.configuracoes.usuarios"],
      ["/integracoes", "tela.integracoes"],
      ["/rise-ai/configuracoes", "riseAi.configuracoes"],
    ]);
    conferir("usuarios e funcoes, no plural e no singular", [detalheDeUsuarios({ usuarios: 2, funcoes: 2 }), detalheDeUsuarios({ usuarios: 1, funcoes: 1 }), detalheDeUsuarios({ usuarios: 0, funcoes: 2 })], ["2 usuários · 2 funções", "1 usuário · 1 função", "0 usuários · 2 funções"]);
    const conectores = [{ id: "BLING" }, { id: "MERCADO_LIVRE" }, { id: "LOJA_INTEGRADA" }];
    const conexoes = (pares) => new Map(pares.map(([servico, status]) => [servico, { status }]));
    conferir(
      "integracoes: a pior situacao primeiro, so o que tem valor",
      [
        detalheDeIntegracoes(conectores, conexoes([["BLING", "CONECTADO"], ["MERCADO_LIVRE", "CONECTADO"], ["LOJA_INTEGRADA", "CONECTADO"]])),
        detalheDeIntegracoes(conectores, conexoes([["BLING", "CONECTADO"], ["MERCADO_LIVRE", "EXPIRADO"], ["LOJA_INTEGRADA", "CONECTADO"]])),
        detalheDeIntegracoes(conectores, conexoes([["BLING", "ERRO"], ["MERCADO_LIVRE", "CONECTADO"]])),
        detalheDeIntegracoes([], new Map()),
      ],
      ["3 conectadas", "1 expirada · 2 conectadas", "1 com erro · 1 não configurada · 1 conectada", "nenhuma conectada"],
    );
    const provedores = [{ id: "anthropic", rotulo: "Anthropic" }];
    conferir("o padrao do Rise AI", [detalheDoRiseAi({ provedor: "anthropic", modelo: "claude-haiku-5-5" }, provedores), detalheDoRiseAi(null, provedores), detalheDoRiseAi({ provedor: "x", modelo: "m" }, provedores)], ["Padrão: Anthropic · claude-haiku-5-5", "Sem modelo padrão", "Padrão: x · m"]);
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

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ambienteDoRise } from "@/lib/sessao";
import { ErroDeUso } from "@/lib/riseAi/erros";
import { contarLiberados, resolverPermissoes } from "./resolucao.js";
import { LOGINS_RESERVADOS, montarSessao, normalizarLogin, quebraVidro } from "./sessao.js";
import { podeDesativar, validarFuncao, validarUsuario } from "./validacao.js";

/**
 * Leitura e gravacao de usuarios e funcoes para as telas de Configuracoes › Usuarios e funcoes (spec de Acessos, §5.3 a
 * §5.5). So o servidor usa; as acoes de `src/app/configuracoes/acoes.js` conferem o recurso antes de chamar.
 *
 * `env` e parametro (padrao `process.env`) para o teste dizer quem esta em RISE_AI_ADMINS sem mexer no ambiente.
 */

const incluirFuncoes = { funcoes: { include: { funcao: { select: { id: true, nome: true, fixa: true } } } } };

/**
 * A lista da aba Usuarios: ativos (e os inativos com `inativos`), por nome. A busca casa o nome ou o login, sem caixa.
 * `peloEnv` marca quem e administrador pelo RISE_AI_ADMINS (a tela trava o Ativo dele).
 */
export async function listarUsuarios({ busca = "", inativos = false, env = process.env } = {}) {
  const termo = String(busca ?? "").trim();
  const usuarios = await prisma.usuarioRise.findMany({
    where: {
      ...(inativos ? {} : { ativo: true }),
      ...(termo ? { OR: [{ nome: { contains: termo, mode: "insensitive" } }, { login: { contains: normalizarLogin(termo) } }] } : {}),
    },
    include: incluirFuncoes,
    orderBy: [{ nome: "asc" }, { login: "asc" }],
  });
  return usuarios.map((usuario) => ({
    id: usuario.id,
    login: usuario.login,
    nome: usuario.nome,
    ativo: usuario.ativo,
    ultimoAcessoEm: usuario.ultimoAcessoEm,
    funcoes: usuario.funcoes.map((vinculo) => vinculo.funcao),
    peloEnv: quebraVidro(usuario.login, env),
  }));
}

/** O usuario para o formulario: as funcoes (ids), as excecoes e o selo do .env; `null` se nao existe. */
export async function carregarUsuario(id, { env = process.env } = {}) {
  const usuario = await prisma.usuarioRise.findUnique({ where: { id: String(id ?? "") }, include: { funcoes: true, excecoes: true } });
  if (!usuario) return null;
  return {
    id: usuario.id,
    login: usuario.login,
    nome: usuario.nome,
    assinatura: usuario.assinatura,
    ativo: usuario.ativo,
    criadoEm: usuario.criadoEm,
    ultimoAcessoEm: usuario.ultimoAcessoEm,
    funcoes: usuario.funcoes.map((vinculo) => vinculo.funcaoId),
    excecoes: usuario.excecoes.map(({ recurso, nivel }) => ({ recurso, nivel })),
    peloEnv: quebraVidro(usuario.login, env),
  };
}

/** A lista da aba Funcoes: a fixa primeiro, depois por nome; quantos usuarios e quantas telas cada uma libera. */
export async function listarFuncoes() {
  const funcoes = await prisma.funcaoRise.findMany({
    include: { permissoes: true, _count: { select: { usuarios: true } } },
    orderBy: [{ fixa: "desc" }, { nome: "asc" }],
  });
  return funcoes.map((funcao) => ({
    id: funcao.id,
    nome: funcao.nome,
    descricao: funcao.descricao,
    fixa: funcao.fixa,
    usuarios: funcao._count.usuarios,
    telasLiberadas: contarLiberados(resolverPermissoes({ funcoes: [funcao], administrador: funcao.fixa }), null, { tipo: "tela" }),
  }));
}

/** A funcao para a matriz: `permissoes` como objeto `{ recurso: nivel }` e quem a tem; `null` se nao existe. */
export async function carregarFuncao(id) {
  const funcao = await prisma.funcaoRise.findUnique({
    where: { id: String(id ?? "") },
    include: { permissoes: true, usuarios: { include: { usuario: { select: { id: true, nome: true } } } } },
  });
  if (!funcao) return null;
  return {
    id: funcao.id,
    nome: funcao.nome,
    descricao: funcao.descricao,
    fixa: funcao.fixa,
    permissoes: Object.fromEntries(funcao.permissoes.map(({ recurso, nivel }) => [recurso, nivel])),
    usuarios: funcao.usuarios.map((vinculo) => vinculo.usuario),
  };
}

const textoDaData = (data) => (data ? new Date(data).toISOString() : null);

/** Sem `Date` nem `null` nos campos de texto: o que atravessa para o navegador e para campos nao controlados. */
export function usuarioParaTela(usuario) {
  return {
    ...usuario,
    assinatura: usuario.assinatura ?? "",
    criadoEm: textoDaData(usuario.criadoEm),
    ultimoAcessoEm: textoDaData(usuario.ultimoAcessoEm),
  };
}

export function funcaoParaTela(funcao) {
  return { ...funcao, descricao: funcao.descricao ?? "" };
}

// ---------------------------------------------------------------------------------------------------------- gravacao

/** Uma linha na trilha de auditoria, na mesma transacao da mudanca. Nunca segredo: so o que a tela mostra. */
export async function registrarAuditoria(tx, { quem, oQue, alvo, antes = null, depois = null }) {
  await tx.auditoriaDeAcesso.create({
    data: { quem, oQue, alvo, antes: antes ?? Prisma.DbNull, depois: depois ?? Prisma.DbNull },
  });
}

const retratoDoUsuario = (usuario) => ({
  login: usuario.login,
  nome: usuario.nome,
  assinatura: usuario.assinatura ?? null,
  ativo: usuario.ativo,
  funcoes: (usuario.funcoes ?? []).map((vinculo) => vinculo.funcaoId ?? vinculo).sort(),
  excecoes: (usuario.excecoes ?? []).map(({ recurso, nivel }) => ({ recurso, nivel })),
});

const AVISO_DO_ENV = "Este login vem de RISE_AI_ADMINS; tire-o lá primeiro.";

/**
 * Cria ou atualiza um usuario; funcoes e excecoes sao trocadas por inteiro. Recusa (com o erro no campo): login
 * repetido, funcao que nao existe, tirar o ativo ou a funcao fixa de quem vem do .env, e do ultimo administrador ativo.
 * As funcoes fixas ficam travadas (`FOR UPDATE`) durante a conta: dois administradores se desativando ao mesmo tempo
 * nao deixam o Rise sem nenhum.
 *
 * @returns {Promise<{ ok: true, id: string } | { ok: false, erros: Record<string, string> }>}
 */
export async function salvarUsuario(entrada, { quem, env = process.env } = {}) {
  const validacao = validarUsuario(entrada);
  if (!validacao.ok) return { ok: false, erros: validacao.erros };
  const dados = validacao.dados;
  const id = entrada?.id ? String(entrada.id) : null;

  return prisma.$transaction(async (tx) => {
    const fixas = (await tx.$queryRaw`SELECT "id" FROM "FuncaoRise" WHERE "fixa" = true FOR UPDATE`).map((linha) => linha.id);
    const atual = id ? await tx.usuarioRise.findUnique({ where: { id }, include: { funcoes: true, excecoes: true } }) : null;
    if (id && !atual) throw new ErroDeUso("Usuário não encontrado.");

    const mesmoLogin = await tx.usuarioRise.findUnique({ where: { login: dados.login }, select: { id: true } });
    if (mesmoLogin && mesmoLogin.id !== atual?.id) return { ok: false, erros: { login: "Já existe um usuário com este login." } };
    const existentes = await tx.funcaoRise.count({ where: { id: { in: dados.funcoes } } });
    if (existentes !== dados.funcoes.length) return { ok: false, erros: { funcoes: "Função não encontrada." } };

    if (atual) {
      const peloEnv = quebraVidro(atual.login, env);
      if (peloEnv && dados.login !== atual.login) return { ok: false, erros: { login: AVISO_DO_ENV } };
      const eraAdministrador = atual.ativo && atual.funcoes.some((vinculo) => fixas.includes(vinculo.funcaoId));
      const seraAdministrador = dados.ativo && dados.funcoes.some((funcaoId) => fixas.includes(funcaoId));
      const tinhaFixa = atual.funcoes.some((vinculo) => fixas.includes(vinculo.funcaoId));
      const perdeAlgo = !dados.ativo || (tinhaFixa && !dados.funcoes.some((funcaoId) => fixas.includes(funcaoId)));
      if (peloEnv && perdeAlgo) return { ok: false, erros: { ativo: AVISO_DO_ENV } };
      if (eraAdministrador && !seraAdministrador) {
        const outros = await tx.usuarioRise.count({
          where: { id: { not: atual.id }, ativo: true, funcoes: { some: { funcaoId: { in: fixas } } } },
        });
        if (!podeDesativar({ ehAdministrador: true, outrosAdministradoresAtivos: outros, peloEnv })) {
          return { ok: false, erros: { ativo: "É o último administrador ativo." } };
        }
      }
    }

    const campos = { login: dados.login, nome: dados.nome, assinatura: dados.assinatura, ativo: dados.ativo };
    const gravado = atual ? await tx.usuarioRise.update({ where: { id: atual.id }, data: campos }) : await tx.usuarioRise.create({ data: campos });
    await tx.usuarioFuncao.deleteMany({ where: { usuarioId: gravado.id } });
    if (dados.funcoes.length) await tx.usuarioFuncao.createMany({ data: dados.funcoes.map((funcaoId) => ({ usuarioId: gravado.id, funcaoId })) });
    await tx.excecaoDoUsuario.deleteMany({ where: { usuarioId: gravado.id } });
    if (dados.excecoes.length) await tx.excecaoDoUsuario.createMany({ data: dados.excecoes.map((excecao) => ({ usuarioId: gravado.id, ...excecao })) });

    await registrarAuditoria(tx, {
      quem,
      oQue: "usuario.salvar",
      alvo: gravado.id,
      antes: atual ? retratoDoUsuario(atual) : null,
      depois: retratoDoUsuario({ ...gravado, funcoes: dados.funcoes, excecoes: dados.excecoes }),
    });
    return { ok: true, id: gravado.id };
  });
}

/**
 * Cria ou atualiza uma funcao; as permissoes sao trocadas por inteiro (so as acima de `nenhum`). A fixa nao se edita, e
 * o nome e unico sem diferenciar caixa.
 *
 * @returns {Promise<{ ok: true, id: string } | { ok: false, erros?: Record<string, string>, erro?: string }>}
 */
export async function salvarFuncao(entrada, { quem } = {}) {
  const validacao = validarFuncao(entrada);
  if (!validacao.ok) return { ok: false, erros: validacao.erros };
  const dados = validacao.dados;
  const id = entrada?.id ? String(entrada.id) : null;

  return prisma.$transaction(async (tx) => {
    const atual = id ? await tx.funcaoRise.findUnique({ where: { id }, include: { permissoes: true } }) : null;
    if (id && !atual) throw new ErroDeUso("Função não encontrada.");
    if (atual?.fixa) return { ok: false, erro: "A função Administrador não se edita." };
    const mesmoNome = await tx.funcaoRise.findFirst({
      where: { nome: { equals: dados.nome, mode: "insensitive" }, ...(atual ? { id: { not: atual.id } } : {}) },
      select: { id: true },
    });
    if (mesmoNome) return { ok: false, erros: { nome: "Já existe uma função com este nome." } };

    const campos = { nome: dados.nome, descricao: dados.descricao };
    const gravada = atual ? await tx.funcaoRise.update({ where: { id: atual.id }, data: campos }) : await tx.funcaoRise.create({ data: campos });
    await tx.permissaoDaFuncao.deleteMany({ where: { funcaoId: gravada.id } });
    if (dados.permissoes.length) await tx.permissaoDaFuncao.createMany({ data: dados.permissoes.map((permissao) => ({ funcaoId: gravada.id, ...permissao })) });

    const retrato = (funcao, permissoes) => ({ nome: funcao.nome, descricao: funcao.descricao ?? null, permissoes: Object.fromEntries(permissoes.map(({ recurso, nivel }) => [recurso, nivel])) });
    await registrarAuditoria(tx, {
      quem,
      oQue: "funcao.salvar",
      alvo: gravada.id,
      antes: atual ? retrato(atual, atual.permissoes) : null,
      depois: retrato(gravada, dados.permissoes),
    });
    return { ok: true, id: gravada.id };
  });
}

/** Exclui uma funcao (os vinculos e as permissoes saem junto). A fixa nao se exclui. A trilha guarda quem a tinha. */
export async function excluirFuncao(id, { quem } = {}) {
  return prisma.$transaction(async (tx) => {
    const atual = await tx.funcaoRise.findUnique({
      where: { id: String(id ?? "") },
      include: { usuarios: { include: { usuario: { select: { nome: true } } } } },
    });
    if (!atual) return { ok: false, erro: "Função não encontrada." };
    if (atual.fixa) return { ok: false, erro: "A função Administrador não se exclui." };
    await tx.funcaoRise.delete({ where: { id: atual.id } });
    await registrarAuditoria(tx, {
      quem,
      oQue: "funcao.excluir",
      alvo: atual.id,
      antes: { nome: atual.nome, usuarios: atual.usuarios.map((vinculo) => vinculo.usuario.nome) },
    });
    return { ok: true };
  });
}

/**
 * Esta pessoa e o ultimo administrador ativo? A tela trava o interruptor Ativo dela com o motivo (regra 8 do Padrao
 * visual); quem recusa de verdade e o `salvarUsuario`, que refaz a conta com as funcoes fixas travadas.
 */
export async function ehUltimoAdministradorAtivo(id) {
  const fixas = (await prisma.funcaoRise.findMany({ where: { fixa: true }, select: { id: true } })).map((funcao) => funcao.id);
  const usuario = await prisma.usuarioRise.findUnique({ where: { id: String(id ?? "") }, include: { funcoes: true } });
  if (!usuario?.ativo || !usuario.funcoes.some((vinculo) => fixas.includes(vinculo.funcaoId))) return false;
  const outros = await prisma.usuarioRise.count({ where: { id: { not: usuario.id }, ativo: true, funcoes: { some: { funcaoId: { in: fixas } } } } });
  return outros === 0;
}

/**
 * Alguem administra o Rise? Um login em RISE_AI_ADMINS ou um usuario ativo com a funcao fixa. O Painel vazio usa isto
 * para dizer "o Rise está sem administrador" (o unico caso em que pedir acesso nao resolve, spec §5.6). Falha ao ler o
 * banco responde `true`: o Painel ja mostra o erro do banco, e acusar "sem administrador" seria mentir.
 */
export async function haAdministrador({ env = process.env } = {}) {
  if ((env.RISE_AI_ADMINS ?? "").split(",").some((login) => normalizarLogin(login))) return true;
  try {
    return (await prisma.usuarioRise.count({ where: { ativo: true, funcoes: { some: { funcao: { fixa: true } } } } })) > 0;
  } catch {
    return true;
  }
}

/**
 * A sessao de Acessos de um login que NAO veio de uma requisicao com login (o token do /mcp): as mesmas funcoes, excecoes,
 * quebra-vidro e "inativo" da tela, pela mesma `montarSessao`. Mudou na matriz de Usuarios e funcoes, vale aqui na
 * proxima chamada.
 *
 * Sempre como VPS (`montarSessao` faz do PC sem simulacao um administrador, e qualquer token viraria administrador). A
 * unica excecao e o login "pc" no Rise do PC, que e a maquina do dono e e assim que a tela Autorizar do PC grava o token.
 *
 * @returns {Promise<{ estado: "ok"|"inativo"|"nao-cadastrado"|"erro-banco", administrador: boolean, permissoes: Map<string,string>,
 *   pode: (id: string, nivel: string) => boolean }>}
 */
export async function permissoesDoLogin(bruto, { env = process.env } = {}) {
  const login = normalizarLogin(bruto);
  if (login === "pc" && ambienteDoRise(env) === "pc") return montarSessao({ ambiente: "pc", login, motivo: null });
  // Vazio ou reservado ("pc" na VPS, "desconhecido"): ninguem com esse login existe, e a sessao fica sem nada.
  if (!login || LOGINS_RESERVADOS.includes(login)) return { ...montarSessao({ ambiente: "vps", login: null, motivo: "token" }), estado: "nao-cadastrado" };
  try {
    const usuario = await prisma.usuarioRise.findUnique({
      where: { login },
      include: { funcoes: { include: { funcao: { include: { permissoes: true } } } }, excecoes: true },
    });
    return montarSessao({ ambiente: "vps", login, motivo: "token", usuario, quebraVidro: quebraVidro(login, env) });
  } catch (erro) {
    console.error("[acessos] banco indisponível ao ler a sessão do token:", erro?.message ?? erro);
    return { ...montarSessao({ ambiente: "vps", login, motivo: "token", usuario: null }), estado: "erro-banco" };
  }
}

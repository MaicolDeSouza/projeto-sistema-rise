import { prisma } from "@/lib/db";
import { contarLiberados, resolverPermissoes } from "./resolucao.js";
import { normalizarLogin, quebraVidro } from "./sessao.js";

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

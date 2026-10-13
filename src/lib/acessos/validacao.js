import { recursoPorId, validarNivel } from "./recursos.js";
import { LOGINS_RESERVADOS, normalizarLogin } from "./sessao.js";

/**
 * A validacao do que chega das telas de Usuarios e funcoes (spec de Acessos, §3 e §5). Pura: devolve `{ ok, erros,
 * dados }`, com os erros por campo (no molde de `errosPorCampo` dos cadastros) e os dados ja limpos para gravar.
 * Recurso nao delegavel nunca entra numa funcao nem numa excecao: so o Administrador o tem (conferido em codigo).
 */

const NOME_DA_FIXA = "administrador";

const texto = (valor) => String(valor ?? "").trim();
const aceitaNaPermissao = (recurso, nivel) => validarNivel(recurso, nivel) && recursoPorId(recurso).delegavel;

export function validarUsuario({ login, nome, assinatura, ativo = true, funcoes = [], excecoes = [] } = {}) {
  const erros = {};
  const loginLimpo = normalizarLogin(login);
  if (!loginLimpo) erros.login = "Informe o login.";
  else if (LOGINS_RESERVADOS.includes(loginLimpo)) erros.login = "Este login não pode ser usado.";
  const nomeLimpo = texto(nome).slice(0, 80);
  if (!nomeLimpo) erros.nome = "Informe o nome.";
  const assinaturaLimpa = texto(assinatura).slice(0, 40) || null;
  const invalida = (excecoes ?? []).find(({ recurso, nivel }) => !aceitaNaPermissao(recurso, nivel));
  if (invalida) erros.excecoes = `Exceção inválida: ${invalida.recurso}.`;
  const dados = {
    login: loginLimpo,
    nome: nomeLimpo,
    assinatura: assinaturaLimpa,
    ativo: ativo === true,
    funcoes: [...new Set((funcoes ?? []).map(String).filter(Boolean))],
    excecoes: (excecoes ?? []).map(({ recurso, nivel }) => ({ recurso, nivel })),
  };
  return { ok: Object.keys(erros).length === 0, erros, dados };
}

/** `permissoes` chega como `{ recurso: nivel }` (a matriz); vai para o banco so o que esta acima de `nenhum`. */
export function validarFuncao({ nome, descricao, permissoes = {} } = {}) {
  const erros = {};
  const nomeLimpo = texto(nome).slice(0, 60);
  if (!nomeLimpo) erros.nome = "Informe o nome.";
  else if (nomeLimpo.toLowerCase() === NOME_DA_FIXA) erros.nome = "Este nome é da função fixa.";
  const lista = Object.entries(permissoes ?? {})
    .filter(([, nivel]) => nivel !== "nenhum")
    .map(([recurso, nivel]) => ({ recurso, nivel }));
  const invalida = lista.find(({ recurso, nivel }) => !aceitaNaPermissao(recurso, nivel));
  if (invalida) erros.permissoes = `Permissão inválida: ${invalida.recurso}.`;
  return { ok: Object.keys(erros).length === 0, erros, dados: { nome: nomeLimpo, descricao: texto(descricao).slice(0, 200) || null, permissoes: lista } };
}

/**
 * Pode tirar o ativo ou a funcao fixa desta pessoa? Nunca de quem vem do RISE_AI_ADMINS (a tela mostraria o contrario
 * do que o servidor faz) e nunca do ultimo administrador ativo (o dono se trancaria fora).
 */
export function podeDesativar({ ehAdministrador, outrosAdministradoresAtivos, peloEnv }) {
  if (peloEnv) return false;
  return !ehAdministrador || outrosAdministradoresAtivos > 0;
}

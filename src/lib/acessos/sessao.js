import { timingSafeEqual } from "node:crypto";

import { ambienteDoRise, sessaoDoRise } from "@/lib/sessao";
import { podeNo, resolverPermissoes } from "./resolucao.js";

/**
 * Quem esta usando o Rise e o que pode fazer (spec §4). PURA: recebe os cabecalhos, o ambiente e o usuario ja lido do
 * banco; quem le o banco e o `servidor.js` (Tarefa 6). `src/lib/sessao.js` NAO muda (o layout, o /api/sair e o
 * teste:vps dependem dele): este modulo so o usa.
 */

/** Logins que o codigo de hoje usa sem login de verdade: nunca viram usuario cadastrado. */
export const LOGINS_RESERVADOS = ["pc", "desconhecido"];

/** O login como o banco guarda: minusculas, aparado, sem caractere de controle, ate 60 caracteres. */
export function normalizarLogin(texto) {
  return String(texto ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .toLowerCase()
    .slice(0, 60);
}

/** Comparacao em tempo constante: nao conta ao atacante quantos caracteres do segredo ele acertou. */
function iguais(a, b) {
  const x = Buffer.from(String(a ?? ""), "utf8");
  const y = Buffer.from(String(b ?? ""), "utf8");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/**
 * O login desta requisicao.
 * - VPS: o `Remote-User` (que so o `forward_auth` do Caddy grava) SO vale acompanhado do segredo de borda
 *   (`X-Rise-Borda` = `RISE_SEGREDO_DE_BORDA`): um conteiner da rede que falasse direto com o `app` mandaria o
 *   cabecalho que quisesse. Sem a variavel, ninguem entra (falha fechada) e o motivo diz o que falta.
 * - PC: nao ha login; "pc", ou o `RISE_SIMULAR_LOGIN` para testar o acesso de outra pessoa (ignorado na VPS).
 *
 * @returns {{ ambiente: "pc" | "vps", login: string | null, motivo: null | "sem-login" | "sem-segredo" | "reservado" | "simulado" }}
 */
export function loginDaRequisicao(cabecalhos, env) {
  const ambiente = ambienteDoRise(env);
  if (ambiente !== "vps") {
    const simulado = normalizarLogin(env?.RISE_SIMULAR_LOGIN);
    if (simulado && !LOGINS_RESERVADOS.includes(simulado)) return { ambiente, login: simulado, motivo: "simulado" };
    return { ambiente, login: "pc", motivo: null };
  }

  const segredo = String(env?.RISE_SEGREDO_DE_BORDA ?? "").trim();
  if (!segredo) return { ambiente, login: null, motivo: "sem-segredo" };
  const borda = typeof cabecalhos?.get === "function" ? cabecalhos.get("x-rise-borda") : null;
  if (!iguais(borda, segredo)) return { ambiente, login: null, motivo: "sem-login" };

  const login = normalizarLogin(sessaoDoRise(cabecalhos, env).nome);
  if (!login) return { ambiente, login: null, motivo: "sem-login" };
  if (LOGINS_RESERVADOS.includes(login)) return { ambiente, login: null, motivo: "reservado" };
  return { ambiente, login, motivo: null };
}

/** O login esta em `RISE_AI_ADMINS`? E o quebra-vidro: vale sempre, alem da tabela (spec §4). */
export function quebraVidro(login, env) {
  const procurado = normalizarLogin(login);
  if (!procurado) return false;
  return String(env?.RISE_AI_ADMINS ?? "")
    .split(",")
    .map(normalizarLogin)
    .filter(Boolean)
    .includes(procurado);
}

/**
 * A sessao pronta para as paginas e as acoes.
 *
 * @param {{ ambiente: "pc"|"vps", login: string|null, motivo: string|null, usuario: object|null, quebraVidro: boolean, erroBanco?: boolean }} entrada
 *   `usuario` e o `UsuarioRise` com `funcoes[].funcao.permissoes` e `excecoes`.
 * @returns {{ login: string|null, ambiente: string, usuario: object|null, administrador: boolean, permissoes: Map<string,string>,
 *   estado: "ok"|"sem-login"|"sem-segredo"|"nao-cadastrado"|"inativo"|"erro-banco", simulando: string|null,
 *   pode: (id: string, nivel: string) => boolean }}
 */
export function montarSessao({ ambiente, login, motivo, usuario = null, quebraVidro: peloEnv = false, erroBanco = false }) {
  const simulando = motivo === "simulado" ? login : null;
  const sessao = (estado, administrador, permissoes = null) => {
    const mapa = permissoes ?? (administrador ? resolverPermissoes({ administrador: true }) : new Map());
    return { login, ambiente, usuario, administrador, permissoes: mapa, estado, simulando, pode: (id, nivel) => podeNo(mapa, id, nivel) };
  };

  // O PC de desenvolvimento e a maquina do dono: sem login e administrador. Com o banco fora do ar, continua
  // administrador mesmo simulando outra pessoa, para Integracoes (que traz o banco da VPS) abrir.
  if (erroBanco) return sessao("erro-banco", ambiente === "pc" || peloEnv);
  if (ambiente === "pc" && !simulando) return sessao("ok", true);
  if (!login) return sessao(motivo === "sem-segredo" ? "sem-segredo" : "sem-login", false);
  if (peloEnv) return sessao("ok", true);
  if (!usuario) return sessao("nao-cadastrado", false);
  if (!usuario.ativo) return sessao("inativo", false);

  const funcoes = (usuario.funcoes ?? []).map((vinculo) => vinculo.funcao).filter(Boolean);
  const administrador = funcoes.some((funcao) => funcao.fixa);
  return sessao("ok", administrador, resolverPermissoes({ funcoes, excecoes: usuario.excecoes ?? [], administrador }));
}

/** `ultimoAcessoEm` e gravado no maximo a cada 10 minutos (spec §4): uma escrita por requisicao seria desperdicio. */
export function precisaGravarAcesso(ultimoAcessoEm, agora = new Date()) {
  if (!ultimoAcessoEm) return true;
  return agora.getTime() - new Date(ultimoAcessoEm).getTime() > 10 * 60 * 1000;
}

import { ambienteDoRise, sessaoDoRise } from "@/lib/sessao";
import { separarLista } from "@/lib/integracoes/config";
import { ErroDeUso } from "./erros";

/**
 * Quem pode o quê no Rise AI. O login (Tinyauth) decide quem ENTRA no Rise; aqui se decide quem é ADMINISTRADOR do
 * Rise AI (Revisão, Configurações, Consumo, aprovar conhecimento). Enquanto o Rise não tem níveis de acesso, a lista
 * mora em `RISE_AI_ADMINS` (nomes do Tinyauth separados por vírgula, comparados sem diferenciar caixa).
 *
 * Falha FECHADA: na VPS, sem a variável ninguém é administrador. No PC de desenvolvimento não há login e todo mundo
 * é (é a máquina do dono). A conferência é do servidor — esconder o botão na tela não protege nada.
 */

/** @param {string|null|undefined} nome  @param {Record<string, string|undefined>} env */
export function ehAdministrador(nome, env) {
  if (ambienteDoRise(env) !== "vps") return true;
  const procurado = String(nome ?? "").trim().toLowerCase();
  if (!procurado) return false;
  return separarLista(env?.RISE_AI_ADMINS)
    .map((item) => item.toLowerCase())
    .includes(procurado);
}

/**
 * O nome que identifica o dono das conversas: o do login na VPS ("desconhecido" se, por engano de configuração, o
 * cabeçalho não chegou — nunca vira administrador) e "pc" no Rise do PC, que não tem login.
 */
export function usuarioDaSessao(cabecalhos, env) {
  const { ambiente, nome } = sessaoDoRise(cabecalhos, env);
  return ambiente === "vps" ? (nome ?? "desconhecido") : "pc";
}

/** @param {{ administrador?: boolean } | null | undefined} sessao */
export function exigirAdministrador(sessao) {
  if (!sessao?.administrador) throw new ErroDeUso("Só administradores do Rise AI podem fazer isso.");
}

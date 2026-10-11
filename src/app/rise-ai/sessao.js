import { headers } from "next/headers";

import { ambienteDoRise } from "@/lib/sessao";
import { ehAdministrador, usuarioDaSessao } from "@/lib/riseAi/acesso";

/**
 * Quem está usando o Rise AI nesta requisição (páginas, layouts e Server Actions de `/rise-ai`): o nome do login
 * (`Remote-User` do Tinyauth; "pc" no Rise do PC, que não tem login), se é administrador do Rise AI e onde o Rise
 * roda. A conferência de administrador é SEMPRE refeita no servidor, em cada ação — esconder o botão não protege nada.
 *
 * Módulo de servidor comum (sem "use server"): devolve um objeto, não é uma ação chamável pelo navegador.
 *
 * @returns {Promise<{ usuario: string, administrador: boolean, ambiente: "pc" | "vps" }>}
 */
export async function sessaoAtual() {
  const cabecalhos = await headers();
  const usuario = usuarioDaSessao(cabecalhos, process.env);
  return { usuario, administrador: ehAdministrador(usuario, process.env), ambiente: ambienteDoRise(process.env) };
}

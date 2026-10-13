import { sessaoDeAcessos } from "@/lib/acessos/servidor";

/**
 * Quem está usando o Rise AI nesta requisição, no formato que `src/lib/riseAi/` já usa: `usuario` (o dono das
 * conversas: o login; "pc" no Rise do PC), `administrador` (quem lê as conversas dos outros: o recurso "Rise AI ›
 * Revisão do dia" de Acessos), `ambiente` e `pode` (as permissões de Acessos). Montada sobre a sessão de Acessos, lida
 * uma vez por requisição; a conferência é SEMPRE do servidor, em cada ação.
 *
 * Módulo de servidor comum (sem "use server"): devolve um objeto, não é uma ação chamável pelo navegador.
 */
export function sessaoDoRiseAi(acesso) {
  return {
    usuario: acesso.login ?? "desconhecido",
    administrador: acesso.pode("riseAi.revisao", "ver"),
    ambiente: acesso.ambiente,
    pode: acesso.pode,
  };
}

/** @returns {Promise<{ usuario: string, administrador: boolean, ambiente: "pc" | "vps", pode: (id: string, nivel: string) => boolean }>} */
export async function sessaoAtual() {
  return sessaoDoRiseAi(await sessaoDeAcessos());
}

/** Para o trabalho de `executarComAcesso`: recebe a sessão de Acessos e entrega a do Rise AI. */
export function comSessaoDoRiseAi(trabalho) {
  return (acesso) => trabalho(sessaoDoRiseAi(acesso));
}

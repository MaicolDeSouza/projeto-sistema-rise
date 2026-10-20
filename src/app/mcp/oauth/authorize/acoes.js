"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { executarComAcesso } from "@/lib/acessos/servidor";
import { decidirAutorizacao } from "@/lib/mcp/autorizacao";
import { origemPelosCabecalhos } from "@/lib/mcp/oauth";

/**
 * Autorizar ou Recusar na tela /mcp/oauth/authorize (`useActionState`: recebe o estado anterior e o FormData). O login
 * que vai no codigo e o da SESSAO, nunca um campo do formulario. O `redirect` fica FORA do `executarComAcesso`: ele
 * funciona lancando um erro, e dentro do involucro esse erro viraria a mensagem generica.
 */
export async function decidirAutorizacaoAcao(_estado, dados) {
  const origem = origemPelosCabecalhos(await headers());
  const params = Object.fromEntries([...dados.entries()].filter(([, valor]) => typeof valor === "string"));
  const resultado = await executarComAcesso("riseAi.chat", "editar", (acesso) =>
    decidirAutorizacao({ params, login: acesso.login ?? "", decisao: params.decisao, origem }),
  );
  if (resultado.url) redirect(resultado.url);
  return { erro: resultado.motivo ?? resultado.erro ?? "Não foi possível concluir agora. Tente de novo em instantes." };
}

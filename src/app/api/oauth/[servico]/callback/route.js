import { NextResponse } from "next/server";

import { config } from "@/lib/integracoes/config";
import { obterConector } from "@/lib/integracoes/registro";

export const dynamic = "force-dynamic";

const APELIDOS = {
  bling: "BLING",
  mercadolivre: "MERCADO_LIVRE",
};

export async function GET(requisicao, { params }) {
  const { servico } = await params;
  const url = new URL(requisicao.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const erroOAuth = url.searchParams.get("error");

  // Sempre volta para APP_URL: e o unico dominio onde a interface funciona.
  // O callback do Mercado Livre chega em localtest.me, onde o navegador
  // bloqueia os scripts da pagina.
  const voltar = (chave, valor) =>
    NextResponse.redirect(
      `${config.appUrl}/integracoes?${new URLSearchParams({ [chave]: valor })}`,
    );

  const conector = obterConector(APELIDOS[servico]);
  if (!conector) return voltar("erro", `Servico desconhecido: ${servico}`);

  if (erroOAuth) {
    return voltar("erro", `${conector.nome} recusou a autorizacao: ${erroOAuth}`);
  }

  if (!code) {
    return voltar("erro", `${conector.nome} nao enviou o codigo de autorizacao.`);
  }

  const esperado = requisicao.cookies.get(`state_${servico}`)?.value;
  if (!esperado || esperado !== state) {
    return voltar(
      "erro",
      `State invalido no retorno do ${conector.nome}. Tente conectar novamente.`,
    );
  }

  try {
    await conector.concluirAutorizacao(code);
  } catch (erro) {
    return voltar("erro", erro.message);
  }

  const resposta = voltar("conectado", conector.nome);
  resposta.cookies.delete(`state_${servico}`);
  return resposta;
}

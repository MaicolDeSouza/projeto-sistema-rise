import { NextResponse } from "next/server";

import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { config } from "@/lib/integracoes/config";
import { obterConector } from "@/lib/integracoes/registro";

export const dynamic = "force-dynamic";

const APELIDOS = {
  bling: "BLING",
  mercadolivre: "MERCADO_LIVRE",
};

export async function GET(requisicao, { params }) {
  // Acessos: conectar uma conta e editar Integracoes (o retorno grava os tokens).
  if (!(await sessaoDeAcessos()).pode("tela.integracoes", "editar")) return recusarRota();
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
  if (!conector) return voltar("erro", `Serviço desconhecido: ${servico}`);

  if (erroOAuth) {
    return voltar("erro", `${conector.nome} recusou a autorização: ${erroOAuth}`);
  }

  if (!code) {
    return voltar("erro", `${conector.nome} não enviou o código de autorização.`);
  }

  const esperado = requisicao.cookies.get(`state_${servico}`)?.value;
  if (!esperado || esperado !== state) {
    return voltar(
      "erro",
      `State inválido no retorno do ${conector.nome}. Tente conectar novamente.`,
    );
  }

  try {
    await conector.concluirAutorizacao(code);
  } catch (erro) {
    // O detalhe (texto da API, nome de host) fica so no log do servidor: na URL ele iria para a tela e para o historico
    // do navegador (revisao de seguranca de 22/10/2026).
    console.error(`[oauth/${servico}] falha ao concluir a autorização:`, erro?.message ?? erro);
    return voltar("erro", `${conector.nome} não concluiu a autorização. Tente conectar novamente; o detalhe está no log do servidor.`);
  }

  const resposta = voltar("conectado", conector.nome);
  resposta.cookies.delete(`state_${servico}`);
  return resposta;
}

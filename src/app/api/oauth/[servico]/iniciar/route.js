import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { config } from "@/lib/integracoes/config";
import { obterConector } from "@/lib/integracoes/registro";

export const dynamic = "force-dynamic";

/** Mapeia o segmento da URL para o id do conector. */
const APELIDOS = {
  bling: "BLING",
  mercadolivre: "MERCADO_LIVRE",
};

export async function GET(requisicao, { params }) {
  const { servico } = await params;
  const conector = obterConector(APELIDOS[servico]);

  const voltar = (chave, valor) =>
    NextResponse.redirect(
      `${config.appUrl}/integracoes?${new URLSearchParams({ [chave]: valor })}`,
    );

  if (!conector || conector.tipoAuth !== "oauth2") {
    return voltar("erro", `Servico desconhecido: ${servico}`);
  }

  if (!conector.configurado) {
    return voltar(
      "erro",
      `Faltam variaveis no .env: ${conector.faltando.join(", ")}`,
    );
  }

  const state = randomUUID();
  const resposta = NextResponse.redirect(conector.iniciarAutorizacao(state));

  // O cookie precisa ser gravado no MESMO dominio para onde o servico vai
  // devolver — cookie nao atravessa dominio. Por isso o link de "Conectar" do
  // Mercado Livre aponta para localtest.me, e nao para localhost.
  resposta.cookies.set(`state_${servico}`, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return resposta;
}

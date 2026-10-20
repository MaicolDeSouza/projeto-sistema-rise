import { headers } from "next/headers";
import { redirect } from "next/navigation";

import Autorizar from "@/components/mcp/Autorizar";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { prepararAutorizacao } from "@/lib/mcp/autorizacao";
import { origemPelosCabecalhos } from "@/lib/mcp/oauth";

export const metadata = { title: "Autorizar acesso | Sistema Rise" };
export const dynamic = "force-dynamic";

/**
 * A tela "Autorizar o acesso ao Rise" do OAuth do /mcp. Fica ATRAS do login do Tinyauth (o Caddy nao a poe no ramo publico):
 * quem chega aqui e uma pessoa com login no Rise, e e o login dela que o token vai carregar.
 *
 * Sem "Rise AI › Acesso pelo Claude e ChatGPT" em editar, 404 (quem nao pode conectar nao ve a tela). Pedido com erro que
 * pode voltar ao cliente (escopo errado, sem PKCE) volta direto; erro sem endereco conhecido fica na tela.
 */
export default async function AutorizarPage({ searchParams }) {
  const acesso = await exigirAcessoNaPagina("riseAi.chat", "editar");
  const origem = origemPelosCabecalhos(await headers());
  const preparado = await prepararAutorizacao(await searchParams, { origem });
  if (!preparado.ok && preparado.url) redirect(preparado.url);

  return (
    <Autorizar
      login={acesso.login ?? ""}
      cliente={preparado.ok ? preparado.cliente.nome : null}
      destino={preparado.ok ? preparado.destino : null}
      params={preparado.ok ? preparado.params : null}
      motivo={preparado.ok ? null : preparado.motivo}
    />
  );
}

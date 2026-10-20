import { headers } from "next/headers";

import Conexoes from "@/components/riseAi/Conexoes";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { conexoesParaTela, enderecoDoMcp } from "@/lib/mcp/conexoes";
import { origemPelosCabecalhos } from "@/lib/mcp/oauth";

export const metadata = { title: "Rise AI | Sistema Rise" };
export const dynamic = "force-dynamic";

/**
 * A aba Conexões: o endereço do servidor MCP para colar no claude.ai ou no ChatGPT e as conexões vivas de quem está
 * logado, com o Desconectar. Cada pessoa só vê as próprias. Quem só vê (sem editar) não conecta: a tela Autorizar dá 404.
 */
export default async function RiseAiPage() {
  const acesso = await exigirAcessoNaPagina("riseAi.chat", "ver");
  const endereco = enderecoDoMcp(origemPelosCabecalhos(await headers()));
  const conexoes = await conexoesParaTela(acesso.login ?? "");
  return <Conexoes endereco={endereco} conexoes={conexoes} podeEditar={acesso.pode("riseAi.chat", "editar")} />;
}

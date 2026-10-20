import { hostPermitido, originPermitida, respostaDeHostErrado } from "@/lib/mcp/oauth";
import { exigirTokenMcp } from "@/lib/mcp/portao";
import { responderMcp } from "@/lib/mcp/servidor";

/**
 * O endereco que se cola no claude.ai e no ChatGPT: https://rise.4hobby.com.br/mcp (plano de 20/10/2026). Streamable HTTP
 * sem estado (revisao 2026-07-28 do MCP, e os clientes de 2025 pelo `initialize`): um POST por mensagem, nada de sessao.
 *
 * PUBLICA no Caddy, de proposito: quem chama e a nuvem da Anthropic ou da OpenAI, sem o login do Tinyauth. Quem autentica
 * e o token do Rise, conferido a cada pedido por `exigirTokenMcp(` (que monta a sessao de Acessos do login dono dele). Nesta
 * ordem: o nome do Rise (contra DNS rebinding), a origem do navegador (pagina de outro site), o token, e so entao o servidor.
 */
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!hostPermitido(request)) return respostaDeHostErrado();
  if (!originPermitida(request)) return new Response(null, { status: 403 });
  const portao = await exigirTokenMcp(request);
  if (!portao.ok) return portao.resposta;
  return responderMcp(request, portao.autenticacao);
}

/** Sem sessoes: o fluxo de leitura (GET) e o encerramento (DELETE) da era antiga nao existem aqui. */
const soPost = () => new Response(null, { status: 405, headers: { allow: "POST" } });

export async function GET() {
  return soPost();
}

export async function DELETE() {
  return soPost();
}

export async function PUT() {
  return soPost();
}

export async function PATCH() {
  return soPost();
}

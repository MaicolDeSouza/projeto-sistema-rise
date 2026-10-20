import { hostPermitido, metadadosDoRecurso, origemDoRise, respostaDeHostErrado, respostaDeMetadado, respostaDeOptions } from "@/lib/mcp/oauth";

/**
 * Protected Resource Metadata (RFC 9728) do /mcp: e por aqui que o claude.ai e o ChatGPT descobrem onde o Rise faz o login.
 * Servido na raiz e em `/mcp` (o caminho do recurso, secao 3.1): o desafio do 401 aponta para este ultimo.
 *
 * PUBLICA de proposito (protocolo OAuth/MCP): nao le login nem banco, e nao tem segredo. O Caddy a deixa passar sem o
 * Tinyauth (ramo `@mcp` do Caddyfile).
 */
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  if (!hostPermitido(request)) return respostaDeHostErrado();
  const { resto } = await params;
  if (resto !== undefined && !(resto.length === 1 && resto[0] === "mcp")) return new Response(null, { status: 404 });
  return respostaDeMetadado(metadadosDoRecurso(origemDoRise(request)));
}

export async function OPTIONS() {
  return respostaDeOptions();
}

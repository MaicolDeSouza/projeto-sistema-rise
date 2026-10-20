import { hostPermitido, metadadosDoServidor, origemDoRise, respostaDeHostErrado, respostaDeMetadado, respostaDeOptions } from "@/lib/mcp/oauth";

/**
 * Authorization Server Metadata (RFC 8414): os enderecos do login, do token e do registro, e o que o Rise aceita (PKCE
 * S256, cliente publico, `iss` na volta).
 *
 * PUBLICA de proposito (protocolo OAuth/MCP): nao le login nem banco, e nao tem segredo. O Caddy a deixa passar sem o
 * Tinyauth (ramo `@mcp` do Caddyfile).
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!hostPermitido(request)) return respostaDeHostErrado();
  return respostaDeMetadado(metadadosDoServidor(origemDoRise(request)));
}

export async function OPTIONS() {
  return respostaDeOptions();
}

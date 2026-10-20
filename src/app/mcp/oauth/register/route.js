import { hostPermitido, respostaDeHostErrado, respostaJson, validarRegistro } from "@/lib/mcp/oauth";
import { registrarCliente } from "@/lib/mcp/oauthBanco";
import { criarLimitador } from "@/lib/riseAi/limite";

/**
 * Registro dinamico de cliente (RFC 7591): o claude.ai ("Register automatically") e o ChatGPT se cadastram sozinhos aqui
 * na primeira conexao. Registrar NAO da acesso a nada: o cliente ainda precisa que alguem com login do Rise o autorize na
 * tela /mcp/oauth/authorize, e o retorno so pode ser um endereco da lista fechada (`redirectPermitido`).
 *
 * PUBLICA de proposito (protocolo OAuth/MCP). Freio: 10 registros por minuto no processo, para um robo nao encher a tabela.
 */
export const dynamic = "force-dynamic";

const limitador = criarLimitador({ porMinuto: 10 });

export async function POST(request) {
  if (!hostPermitido(request)) return respostaDeHostErrado();
  if (!limitador.permitir("registro")) return respostaJson(429, { error: "too_many_requests", error_description: "Muitos registros. Tente de novo em um minuto." }, { "retry-after": "60" });

  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return respostaJson(400, { error: "invalid_client_metadata", error_description: "O corpo precisa ser JSON." });
  }
  const validado = validarRegistro(corpo);
  if (!validado.ok) return respostaJson(400, { error: validado.erro, error_description: validado.descricao });

  const cliente = await registrarCliente(validado.cliente);
  return respostaJson(201, {
    client_id: cliente.clientId,
    client_id_issued_at: Math.floor(cliente.criadoEm.getTime() / 1000),
    client_name: cliente.nome,
    redirect_uris: cliente.redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
}

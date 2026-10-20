import { hostPermitido, respostaDeHostErrado, respostaJson } from "@/lib/mcp/oauth";
import { carregarCliente, renovarToken, trocarCodigo } from "@/lib/mcp/oauthBanco";
import { criarLimitador } from "@/lib/riseAi/limite";

/**
 * Endpoint de token (RFC 6749, secao 3.2): troca o codigo da tela Autorizar por um par acesso + renovacao, e renova. O
 * cliente e publico (sem segredo): quem prova que e o dono do codigo e o PKCE (`code_verifier`).
 *
 * PUBLICA de proposito (protocolo OAuth/MCP). Freio: 60 pedidos por minuto por IP (o Caddy manda o X-Forwarded-For).
 */
export const dynamic = "force-dynamic";

const limitador = criarLimitador({ porMinuto: 60 });

/** O formulario (o padrao do OAuth) ou JSON; qualquer outra coisa e pedido invalido. */
async function lerCampos(request) {
  const tipo = (request.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (tipo.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(await request.text()));
    if (tipo.includes("application/json")) {
      const corpo = await request.json();
      return corpo && typeof corpo === "object" && !Array.isArray(corpo) ? corpo : null;
    }
  } catch {
    return null;
  }
  return null;
}

const erro = (status, codigo, descricao) => respostaJson(status, { error: codigo, error_description: descricao });

export async function POST(request) {
  if (!hostPermitido(request)) return respostaDeHostErrado();
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconhecido";
  if (!limitador.permitir(ip)) return respostaJson(429, { error: "too_many_requests", error_description: "Muitos pedidos. Tente de novo em um minuto." }, { "retry-after": "60" });

  const campos = await lerCampos(request);
  if (!campos) return erro(400, "invalid_request", "Envie os campos como formulário ou JSON.");
  const grant = campos.grant_type;
  if (!grant) return erro(400, "invalid_request", "Informe o grant_type.");
  if (grant !== "authorization_code" && grant !== "refresh_token") return erro(400, "unsupported_grant_type", "Só authorization_code e refresh_token.");

  const cliente = await carregarCliente(campos.client_id);
  if (!cliente) return erro(401, "invalid_client", "Cliente desconhecido.");

  const resultado =
    grant === "authorization_code"
      ? await trocarCodigo({ codigo: campos.code, clientId: cliente.id, redirectUri: campos.redirect_uri, codeVerifier: campos.code_verifier, resource: campos.resource })
      : await renovarToken({ refreshToken: campos.refresh_token, clientId: cliente.id });
  if (!resultado.ok) return erro(400, resultado.erro, resultado.descricao);
  return respostaJson(200, resultado.tokens);
}

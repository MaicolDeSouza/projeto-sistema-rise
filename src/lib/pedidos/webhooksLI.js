import { randomBytes } from "node:crypto";

import { clienteLI } from "@/lib/canaisDeVenda/li/cliente";
import { lerSegredo, salvarConexao } from "@/lib/integracoes/conexoes";
import { config, exigirTravaLiberada } from "@/lib/integracoes/config";

/**
 * "Ligar notificacoes" da Loja Integrada (fase 2 dos Pedidos de venda, spec 5.11): cadastra na LI a URL publica do Rise
 * com um token que o Rise gera, e guarda o token no segredo cifrado da Conexao (a rota confere a notificacao por ele).
 * So na VPS: no PC nao ha URL publica para a LI chamar. O token novo so e gravado depois de a LI aceitar.
 */
export async function ligarNotificacoesLI({ cliente = clienteLI(), base = config.appUrlPublica, gerarToken = () => randomBytes(24).toString("hex") } = {}) {
  if (!base) return { ok: false, erro: "Só na VPS: falta APP_URL_PUBLICA." };
  try {
    exigirTravaLiberada("LOJA_INTEGRADA");
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
  const token = gerarToken();
  const notifyUrl = `${String(base).replace(/\/+$/, "")}/api/webhooks/loja-integrada`;
  let resposta;
  try {
    resposta = await cliente.put("/webhooks/v1/pedido", { notifyUrl, token }, { base: "raiz" });
  } catch (erro) {
    return { ok: false, erro: `A Loja Integrada não respondeu: ${erro?.message ?? erro}` };
  }
  const status = resposta?.status ?? 0;
  if (status < 200 || status >= 300) return { ok: false, erro: `A Loja Integrada recusou (HTTP ${status}).` };

  const ligadasEm = new Date();
  const segredo = (await lerSegredo("LOJA_INTEGRADA")) ?? {};
  await salvarConexao("LOJA_INTEGRADA", { segredo: { ...segredo, webhookToken: token, webhookLigadoEm: ligadasEm.toISOString() } });
  return { ok: true, ligadasEm };
}

/** Quando as notificacoes da LI foram ligadas (null = nunca), para o cartao da tela. Sem o token. */
export async function notificacoesLILigadasEm() {
  const segredo = await lerSegredo("LOJA_INTEGRADA").catch(() => null);
  return segredo?.webhookLigadoEm ?? null;
}

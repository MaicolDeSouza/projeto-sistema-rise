import { randomBytes, timingSafeEqual } from "node:crypto";

import { lerConexao, lerSegredo, salvarConexao } from "@/lib/integracoes/conexoes";
import { hashDoSegredo } from "@/lib/mcp/oauth.js";

/**
 * A chave da extensao "Rise LightBurn" (spec 2026-11-05, §6.4), no molde da do AliExpress: a extensao manda a chave em
 * `Authorization: Bearer` e so consegue importar leituras do portal (nenhuma rota dela apaga nada). O banco guarda so o
 * HASH: um dump vazado nao entrega a chave. Gerar de novo troca o hash, e a chave anterior para de valer.
 */

const SERVICO = "LIGHTBURN";
const RECUSA = { ok: false, status: 401, erro: "Chave da extensão ausente ou inválida." };

export async function gerarChaveDaExtensao() {
  const chave = `rise_lb_${randomBytes(24).toString("base64url")}`;
  await salvarConexao(SERVICO, {
    segredo: { hash: hashDoSegredo(chave) },
    status: "CONECTADO",
    conectadoEm: new Date(),
    escopos: "extensao",
    ultimoErro: null,
  });
  return { chave };
}

export async function conferirChaveDaExtensao(request) {
  const autorizacao = request.headers.get("authorization") ?? "";
  const chave = /^Bearer\s+(\S+)$/i.exec(autorizacao.trim())?.[1];
  if (!chave) return RECUSA;
  const guardado = (await lerSegredo(SERVICO))?.hash;
  if (!guardado) return RECUSA;
  const esperado = Buffer.from(guardado, "hex");
  const recebido = Buffer.from(hashDoSegredo(chave), "hex");
  // Comparacao em tempo constante: os dois hashes tem sempre 32 bytes.
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido) ? { ok: true } : RECUSA;
}

/** O que o cartao de Integracoes mostra (sem segredo nenhum). */
export async function estadoDaChave() {
  const conexao = await lerConexao(SERVICO);
  const temChave = Boolean(conexao) && Boolean((await lerSegredo(SERVICO))?.hash);
  return {
    configurada: temChave,
    conectadoEm: conexao?.conectadoEm ?? null,
    ultimoTesteEm: conexao?.ultimoTesteEm ?? null,
    ultimoTesteOk: conexao?.ultimoTesteOk ?? null,
    ultimoErro: conexao?.ultimoErro ?? null,
  };
}

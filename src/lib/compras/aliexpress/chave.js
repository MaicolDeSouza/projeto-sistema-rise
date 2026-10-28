import { randomBytes, timingSafeEqual } from "node:crypto";

import { lerConexao, lerSegredo, salvarConexao } from "@/lib/integracoes/conexoes";
import { hashDoSegredo } from "@/lib/mcp/oauth.js";

/**
 * A chave da extensao "Rise AliExpress" (spec 2026-10-28, §6.2). A extensao manda a chave em `Authorization: Bearer` e
 * age como o dono (so importa pedidos de compra). O banco guarda so o HASH (sha256, como os tokens do MCP): um dump
 * vazado nao entrega a chave. Gerar de novo troca o hash, e a chave anterior para de valer.
 */

const SERVICO = "ALIEXPRESS";
const RECUSA = { ok: false, status: 401, erro: "Chave da extensão ausente ou inválida." };

export async function gerarChaveDaExtensao() {
  const chave = `rise_ali_${randomBytes(24).toString("base64url")}`;
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

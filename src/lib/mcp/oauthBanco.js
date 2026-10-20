import { prisma } from "@/lib/db";

import { ESCOPO, VALIDADE_DA_RENOVACAO_MS, VALIDADE_DO_ACESSO_S, VALIDADE_DO_CODIGO_MS, conferirPkce, gerarSegredo, hashDoSegredo } from "./oauth.js";

/**
 * Os clientes, os codigos e os tokens do OAuth do /mcp no banco (plano de 20/10/2026). O texto de um codigo ou token sai
 * daqui UMA vez, na resposta; o banco guarda so o SHA-256.
 *
 * Familia = todos os pares acesso+renovacao que nasceram do mesmo codigo (o id dele): e a "conexao" que a tela mostra e o
 * Desconectar revoga. Sinal de roubo (codigo usado duas vezes, renovacao ja trocada usada de novo) revoga a familia inteira:
 * quem roubou e quem e o dono perdem o acesso, e o dono so precisa conectar de novo.
 *
 * Todas as funcoes aceitam `{ agora }` (milissegundos) para o teste nao esperar o relogio.
 */

const TAMANHO_MAXIMO = 256;
const texto = (valor) => (typeof valor === "string" && valor.length > 0 && valor.length <= TAMANHO_MAXIMO ? valor : null);
const recusa = (erro, descricao) => ({ ok: false, erro, descricao });
const GRANT_INVALIDO = (descricao) => recusa("invalid_grant", descricao);

/** @returns {Promise<{ clientId: string, nome: string, redirectUris: string[], criadoEm: Date }>} */
export async function registrarCliente({ nome, redirectUris }) {
  const cliente = await prisma.clienteMcp.create({ data: { nome, redirectUris } });
  return { clientId: cliente.id, nome: cliente.nome, redirectUris: cliente.redirectUris, criadoEm: cliente.criadoEm };
}

/** @returns {Promise<{ id: string, nome: string, redirectUris: string[] } | null>} */
export async function carregarCliente(clientId) {
  const id = texto(clientId);
  if (!id) return null;
  return prisma.clienteMcp.findUnique({ where: { id }, select: { id: true, nome: true, redirectUris: true } });
}

/** O codigo da tela Autorizar, ja validada a decisao. Devolve o TEXTO do codigo (so esta vez). */
export async function emitirCodigo({ clienteId, login, redirectUri, codeChallenge, resource, escopos }, { agora = Date.now() } = {}) {
  const codigo = gerarSegredo();
  await prisma.codigoMcp.create({
    data: { hash: hashDoSegredo(codigo), clienteId, login, redirectUri, codeChallenge, resource, escopos, expiraEm: new Date(agora + VALIDADE_DO_CODIGO_MS) },
  });
  return codigo;
}

async function revogarFamilia(familia, agora, tx = prisma) {
  const { count } = await tx.tokenMcp.updateMany({ where: { familia, revogadoEm: null }, data: { revogadoEm: new Date(agora) } });
  return count;
}

/** Cria um par novo na familia e devolve o corpo da resposta do endpoint de token (RFC 6749, secao 5.1). */
async function emitirPar(tx, { familia, clienteId, login, escopos }, agora) {
  const acesso = gerarSegredo();
  const renovacao = gerarSegredo();
  await tx.tokenMcp.create({
    data: {
      hashAcesso: hashDoSegredo(acesso),
      hashRenovacao: hashDoSegredo(renovacao),
      familia,
      clienteId,
      login,
      escopos,
      expiraEm: new Date(agora + VALIDADE_DO_ACESSO_S * 1000),
      renovacaoExpiraEm: new Date(agora + VALIDADE_DA_RENOVACAO_MS),
    },
  });
  return { access_token: acesso, token_type: "Bearer", expires_in: VALIDADE_DO_ACESSO_S, refresh_token: renovacao, scope: escopos.join(" ") || ESCOPO };
}

/**
 * `grant_type=authorization_code`. O codigo e MARCADO COMO USADO antes de qualquer outra conferencia: uma tentativa errada
 * (PKCE, retorno, cliente) tambem o gasta, e ninguem tenta varias vezes o mesmo codigo. O segundo uso revoga o que o
 * primeiro emitiu (RFC 6749, secao 4.1.2).
 *
 * @returns {Promise<{ ok: true, tokens: object } | { ok: false, erro: "invalid_grant" | "invalid_request", descricao: string }>}
 */
export async function trocarCodigo({ codigo, clientId, redirectUri, codeVerifier, resource }, { agora = Date.now() } = {}) {
  const textoDoCodigo = texto(codigo);
  if (!textoDoCodigo) return recusa("invalid_request", "Informe o code.");
  const guardado = await prisma.codigoMcp.findUnique({ where: { hash: hashDoSegredo(textoDoCodigo) } });
  if (!guardado) return GRANT_INVALIDO("Código inválido.");

  if (guardado.usadoEm) {
    await revogarFamilia(guardado.id, agora);
    return GRANT_INVALIDO("Código já usado.");
  }

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.codigoMcp.updateMany({ where: { id: guardado.id, usadoEm: null }, data: { usadoEm: new Date(agora) } });
    if (count !== 1) {
      // Duas trocas ao mesmo tempo: a outra levou o codigo. Mesmo tratamento do reuso.
      await revogarFamilia(guardado.id, agora, tx);
      return GRANT_INVALIDO("Código já usado.");
    }
    if (guardado.expiraEm.getTime() <= agora) return GRANT_INVALIDO("Código vencido.");
    if (guardado.clienteId !== clientId) return GRANT_INVALIDO("Código de outro cliente.");
    // O retorno tem de ser o MESMO texto do pedido de autorizacao (RFC 6749, secao 4.1.3), porta inclusive.
    if (guardado.redirectUri !== redirectUri) return GRANT_INVALIDO("redirect_uri diferente do pedido.");
    if (resource !== undefined && resource !== null && resource !== "" && resource !== guardado.resource) return GRANT_INVALIDO("resource diferente do pedido.");
    if (!conferirPkce(codeVerifier, guardado.codeChallenge)) return GRANT_INVALIDO("code_verifier não confere.");

    const tokens = await emitirPar(tx, { familia: guardado.id, clienteId: guardado.clienteId, login: guardado.login, escopos: guardado.escopos }, agora);
    return { ok: true, tokens };
  });
}

/**
 * `grant_type=refresh_token`. Cliente publico: a renovacao GIRA a cada uso (OAuth 2.1, secao 4.3.1). O par antigo deixa de
 * valer na hora, o de acesso inclusive. Renovacao ja trocada usada de novo revoga a familia.
 */
export async function renovarToken({ refreshToken, clientId }, { agora = Date.now() } = {}) {
  const textoDaRenovacao = texto(refreshToken);
  if (!textoDaRenovacao) return recusa("invalid_request", "Informe o refresh_token.");
  const guardado = await prisma.tokenMcp.findUnique({ where: { hashRenovacao: hashDoSegredo(textoDaRenovacao) } });
  if (!guardado) return GRANT_INVALIDO("Renovação inválida.");
  // Outro cliente com a renovacao de alguem: recusa sem revogar (quem errou o cliente nao derruba a conexao do dono).
  if (guardado.clienteId !== clientId) return GRANT_INVALIDO("Renovação de outro cliente.");
  if (guardado.revogadoEm) return GRANT_INVALIDO("Conexão desconectada.");
  if (guardado.substituidoEm) {
    await revogarFamilia(guardado.familia, agora);
    return GRANT_INVALIDO("Renovação já usada.");
  }
  if (guardado.renovacaoExpiraEm.getTime() <= agora) return GRANT_INVALIDO("Renovação vencida.");

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.tokenMcp.updateMany({ where: { id: guardado.id, substituidoEm: null, revogadoEm: null }, data: { substituidoEm: new Date(agora) } });
    if (count !== 1) {
      await revogarFamilia(guardado.familia, agora, tx);
      return GRANT_INVALIDO("Renovação já usada.");
    }
    const tokens = await emitirPar(tx, { familia: guardado.familia, clienteId: guardado.clienteId, login: guardado.login, escopos: guardado.escopos }, agora);
    return { ok: true, tokens };
  });
}

/**
 * O token de acesso do cabecalho `Authorization` vale? Vencido, revogado ou ja substituido por uma renovacao = `null`.
 * Usuario inativo NAO e conferido aqui: e do portao, que monta a sessao de Acessos a cada chamada.
 *
 * @returns {Promise<{ login: string, clienteId: string, clienteNome: string, escopos: string[], expiraEm: Date, familia: string } | null>}
 */
export async function validarTokenDeAcesso(token, { agora = Date.now() } = {}) {
  const textoDoToken = texto(token);
  if (!textoDoToken) return null;
  const guardado = await prisma.tokenMcp.findUnique({ where: { hashAcesso: hashDoSegredo(textoDoToken) }, include: { cliente: { select: { nome: true } } } });
  if (!guardado || guardado.revogadoEm || guardado.substituidoEm || guardado.expiraEm.getTime() <= agora) return null;
  return { login: guardado.login, clienteId: guardado.clienteId, clienteNome: guardado.cliente.nome, escopos: guardado.escopos, expiraEm: guardado.expiraEm, familia: guardado.familia };
}

/**
 * As conexoes vivas do login (uma por familia, a renovacao ainda valendo), para a tela do Rise AI. `criadoEm` e a data em
 * que a conexao nasceu (o primeiro par), nao a da ultima renovacao.
 *
 * @returns {Promise<{ familia: string, clienteNome: string, criadoEm: Date, renovacaoExpiraEm: Date }[]>}
 */
export async function listarConexoesDoLogin(login, { agora = Date.now() } = {}) {
  const vivos = await prisma.tokenMcp.findMany({
    where: { login: String(login ?? ""), revogadoEm: null, substituidoEm: null, renovacaoExpiraEm: { gt: new Date(agora) } },
    include: { cliente: { select: { nome: true } } },
    orderBy: { criadoEm: "desc" },
  });
  if (vivos.length === 0) return [];
  const inicios = await prisma.tokenMcp.groupBy({ by: ["familia"], where: { familia: { in: vivos.map((token) => token.familia) } }, _min: { criadoEm: true } });
  const inicioDe = new Map(inicios.map((linha) => [linha.familia, linha._min.criadoEm]));
  return vivos.map((token) => ({ familia: token.familia, clienteNome: token.cliente.nome, criadoEm: inicioDe.get(token.familia) ?? token.criadoEm, renovacaoExpiraEm: token.renovacaoExpiraEm }));
}

/** O Desconectar da tela: so a familia do proprio login. */
export async function revogarConexao(familia, login, { agora = Date.now() } = {}) {
  const { count } = await prisma.tokenMcp.updateMany({ where: { familia: String(familia ?? ""), login: String(login ?? ""), revogadoEm: null }, data: { revogadoEm: new Date(agora) } });
  return { revogados: count };
}

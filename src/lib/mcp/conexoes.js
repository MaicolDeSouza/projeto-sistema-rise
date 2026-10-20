import { prisma } from "@/lib/db";
import { ErroDeUso } from "@/lib/riseAi/erros";
import { listarConexoesDoLogin, revogarConexao } from "./oauthBanco.js";

/**
 * A tela Conexoes do Rise AI (decisao C1 do dono, 20/10/2026: o chat interno saiu e o acesso e pelo Claude ou pelo
 * ChatGPT): o endereco que a pessoa cola no conector e as conexoes vivas DELA, com o Desconectar. A regra do banco mora
 * em `oauthBanco.js`; aqui so o formato da tela.
 */

/** O endereco do servidor MCP, a partir da origem publica do Rise (`origemPelosCabecalhos`). */
export function enderecoDoMcp(origem) {
  return `${String(origem ?? "").replace(/\/+$/, "")}/mcp`;
}

/** As conexoes do login, com as datas em texto ISO: o componente do navegador recebe so dado serializavel. */
export async function conexoesParaTela(login, opcoes = {}) {
  const conexoes = await listarConexoesDoLogin(login, opcoes);
  return conexoes.map((conexao) => ({
    familia: conexao.familia,
    cliente: conexao.clienteNome,
    conectadoEm: conexao.criadoEm.toISOString(),
    valeAte: conexao.renovacaoExpiraEm.toISOString(),
  }));
}

/**
 * Desconectar: revoga a familia inteira do proprio login (o token de acesso cai na hora, no proximo pedido do Claude).
 * Familia de outro login, ou ja desconectada, e recusada com a mesma mensagem: a tela nao diz se a conexao existe.
 */
export async function desconectar(familia, login, opcoes = {}) {
  const { revogados } = await revogarConexao(familia, login, opcoes);
  if (revogados === 0) throw new ErroDeUso("Conexão não encontrada.");
  return { revogados };
}

/**
 * As conexoes de TODA a equipe, para o Administrador (pedido do dono em 20/10/2026: a Andrea conectou e ele so via a
 * propria). A mesma regra de "viva" de `listarConexoesDoLogin`, com o login de cada uma; quem chama confere o acesso.
 */
export async function conexoesDaEquipe({ agora = Date.now() } = {}) {
  const vivos = await prisma.tokenMcp.findMany({
    where: { revogadoEm: null, substituidoEm: null, renovacaoExpiraEm: { gt: new Date(agora) } },
    include: { cliente: { select: { nome: true } } },
    orderBy: [{ login: "asc" }, { criadoEm: "desc" }],
  });
  if (vivos.length === 0) return [];
  const inicios = await prisma.tokenMcp.groupBy({ by: ["familia"], where: { familia: { in: vivos.map((token) => token.familia) } }, _min: { criadoEm: true } });
  const inicioDe = new Map(inicios.map((linha) => [linha.familia, linha._min.criadoEm]));
  return vivos.map((token) => ({
    familia: token.familia,
    login: token.login,
    cliente: token.cliente.nome,
    conectadoEm: (inicioDe.get(token.familia) ?? token.criadoEm).toISOString(),
    valeAte: token.renovacaoExpiraEm.toISOString(),
  }));
}

/** O Administrador desconecta a conexao de qualquer pessoa: revoga a familia inteira, do login dono dela. */
export async function desconectarDaEquipe(familia, opcoes = {}) {
  const token = await prisma.tokenMcp.findFirst({ where: { familia: String(familia ?? ""), revogadoEm: null }, select: { login: true } });
  if (!token) throw new ErroDeUso("Conexão não encontrada.");
  await desconectar(familia, token.login, opcoes);
  return { login: token.login };
}

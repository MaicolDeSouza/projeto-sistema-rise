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

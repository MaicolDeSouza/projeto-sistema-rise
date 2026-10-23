import { prisma } from "@/lib/db";
import { lerConexao } from "@/lib/integracoes/conexoes";
import { vinculosDaEquipe } from "./vinculo";

/**
 * O que a aba Canais mostra do Telegram (Rise AI, Entrega C1): se ha token (e desde quando), a conta do bot que o
 * ultimo teste achou, a ultima falha (ja mascarada por quem a gravou) e quem esta vinculado. O token nunca sai daqui.
 */

export const SERVICO_TELEGRAM = "TELEGRAM";

/** So o fato de haver token cadastrado: a tela do usuario decide se "Gerar codigo" fica habilitado. */
export async function temTokenDoTelegram() {
  const linha = await prisma.conexao.findUnique({ where: { servico: SERVICO_TELEGRAM }, select: { segredoCifrado: true } });
  return Boolean(linha?.segredoCifrado);
}

/**
 * @returns {Promise<{ token: { cadastrada: boolean, em: Date|null }, bot: { usuario: string|null, testadoEm: Date|null, ok: boolean|null, erro: string|null }, vinculados: { usuarioId: string, login: string, nome: string, ativo: boolean }[], urlPublica: boolean }>}
 */
export async function estadoDoTelegram({ env = process.env } = {}) {
  const [conexao, cadastrada, vinculados] = await Promise.all([lerConexao(SERVICO_TELEGRAM), temTokenDoTelegram(), vinculosDaEquipe()]);
  return {
    token: { cadastrada, em: cadastrada ? (conexao?.conectadoEm ?? null) : null },
    bot: {
      usuario: conexao?.contaExterna ?? null,
      testadoEm: conexao?.ultimoTesteEm ?? null,
      ok: conexao?.ultimoTesteOk ?? null,
      erro: conexao?.ultimoErro ?? null,
    },
    vinculados,
    urlPublica: Boolean(String(env.APP_URL_PUBLICA ?? "").trim()),
  };
}

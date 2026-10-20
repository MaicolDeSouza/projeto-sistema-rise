"use server";

import { revalidatePath } from "next/cache";

import { executarComAcesso } from "@/lib/acessos/servidor";
import { ErroDeUso } from "@/lib/riseAi/erros";
import { gerarRelatorioAgora } from "@/lib/relatorios/rotina";

/**
 * Acoes de Relatorios. So exporta funcao assincrona (modulo "use server"). Toda acao confere o acesso no servidor.
 */

/**
 * "Gerar agora": o relatorio dos ultimos 7 dias com o que ja esta no banco, SEM varrer nada. Quem varre e a rodada de
 * sabado 00:00 (o worker da VPS).
 */
export async function gerarRelatorioAgoraAcao() {
  return executarComAcesso("tela.relatorios", "editar", async () => {
    const resultado = await gerarRelatorioAgora();
    revalidatePath("/relatorios");
    if (!resultado.ok) throw new ErroDeUso(`Não foi possível gerar o relatório: ${resultado.erro}`);
    return { id: resultado.id };
  });
}

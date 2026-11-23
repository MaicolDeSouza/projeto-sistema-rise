"use server";

import { revalidatePath } from "next/cache";

import { executarComAcesso } from "@/lib/acessos/servidor";
import { salvarConfigDeFrete } from "@/lib/frete/configuracao";
import { salvarSaldoDoFrete } from "@/lib/frete/saldo";

/**
 * Configuracoes > Envios (modulo de frete): o acrescimo de embalagem e o peso extra da cotacao, e desde 23/11/2026 o limite
 * do aviso de saldo do Melhor Envio e a senha da recarga (vazia mantem a atual).
 */
export async function salvarConfigDeFreteAcao(entrada) {
  return executarComAcesso("tela.configuracoes.envios", "editar", async () => {
    const resultado = await salvarConfigDeFrete(entrada);
    const saldo = await salvarSaldoDoFrete({ limiteDeSaldo: entrada?.limiteDeSaldo, senhaNova: entrada?.senhaNova });
    if (resultado.ok && saldo.ok) {
      revalidatePath("/configuracoes/envios");
      return { ok: true };
    }
    return { ok: false, erros: { ...(resultado.erros ?? {}), ...(saldo.erros ?? {}) } };
  });
}

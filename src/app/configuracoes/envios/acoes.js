"use server";

import { revalidatePath } from "next/cache";

import { executarComAcesso } from "@/lib/acessos/servidor";
import { salvarConfigDeFrete } from "@/lib/frete/configuracao";

/** Configuracoes > Envios (modulo de frete): o acrescimo de embalagem e o peso extra da cotacao. */
export async function salvarConfigDeFreteAcao(entrada) {
  return executarComAcesso("tela.configuracoes.envios", "editar", async () => {
    const resultado = await salvarConfigDeFrete(entrada);
    if (resultado.ok) revalidatePath("/configuracoes/envios");
    return resultado;
  });
}

"use server";

import { revalidatePath } from "next/cache";

import { executarComAcesso } from "@/lib/acessos/servidor";
import { CANAIS_COM_TAXA, salvarTaxas } from "@/lib/pedidos/taxas";

/**
 * Salvar as taxas de venda de um canal (hoje so a Loja Integrada). Passa pelo acesso da tela do canal em editar: quem
 * so ve a lista da LI ve as taxas e nao as muda. A regra (o que e taxa valida) mora em `lib/pedidos/taxas.js`.
 */
export async function salvarTaxasAcao(canal, taxas) {
  if (!CANAIS_COM_TAXA.includes(canal)) return { ok: false, erro: "Este canal não tem taxas cadastradas no Rise." };
  return executarComAcesso("tela.canaisDeVenda.lojaIntegrada", "editar", async () => {
    const resultado = await salvarTaxas(canal, taxas);
    if (resultado.ok) revalidatePath("/canais-de-venda/loja-integrada");
    return resultado;
  });
}

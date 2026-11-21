import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { devolucoesDoMes } from "@/lib/pedidos/reclamacoesML";

/**
 * As devolucoes do Mercado Livre postadas no mes, em CSV para o contador (20/11/2026, pedido do dono: o valor devolvido sai
 * da receita do mes da devolucao, com a nota de devolucao). `?mes=AAAA-MM`. Gerado na hora; nada fica gravado.
 */
export async function GET(requisicao) {
  const sessao = await sessaoDeAcessos().catch(() => null);
  if (!sessao?.pode("tela.pedidos", "ver")) return recusarRota();
  const mes = new URL(requisicao.url).searchParams.get("mes") ?? "";
  const lista = await devolucoesDoMes({ mes });
  if (!lista.ok) return new Response(lista.erro, { status: 400 });
  // O BOM faz o Excel ler os acentos como UTF-8.
  const corpo = `﻿${lista.csv}\r\n`;
  return new Response(corpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="devolucoes-ml-${mes}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

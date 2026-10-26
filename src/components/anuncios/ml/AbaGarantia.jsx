"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";

import SecaoDoAnuncio, { LinhaDeDado } from "./SecaoDoAnuncio";

/**
 * Aba Garantia (pedido do dono em 26/10/2026): a do PRODUTO BASE, so leitura. Vai ao Mercado Livre nos termos de venda
 * (`termosDeVenda`, em payload.js): "Garantia do vendedor" e o tempo em meses. Produto sem garantia no cadastro nao manda
 * nada, e o ML mostra a padrao dele. Mudar e no cadastro do produto.
 */
export default function AbaGarantia({ rascunho, contexto }) {
  const produto = contexto.produtos?.[rascunho.produtoId];
  const meses = Number(produto?.garantiaMeses);
  const temGarantia = Number.isInteger(meses) && meses > 0;

  return (
    <SecaoDoAnuncio
      titulo="Garantia (do cadastro do produto)"
      ajuda="Vai ao Mercado Livre na publicação. No kit, vale a garantia do produto principal."
      acao={
        rascunho.produtoId && (
          <Link href={`/produtos/${rascunho.produtoId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-acento hover:bg-superficie">
            <Pencil size={12} />
            Editar no produto
          </Link>
        )
      }
    >
      <div className="rounded border border-borda px-3">
        <LinhaDeDado rotulo="Tipo de garantia">{temGarantia ? "Garantia do vendedor" : null}</LinhaDeDado>
        <LinhaDeDado rotulo="Tempo de garantia">{temGarantia ? `${meses} ${meses === 1 ? "mês" : "meses"}` : null}</LinhaDeDado>
      </div>
      {!temGarantia && <p className="mt-2 text-xs text-amber-700">O produto não tem garantia no cadastro: nada de garantia vai ao Mercado Livre.</p>}
    </SecaoDoAnuncio>
  );
}

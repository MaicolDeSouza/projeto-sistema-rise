"use client";

import { useState } from "react";
import { Check, ExternalLink, Loader } from "lucide-react";

/**
 * Aba Divergencias do anuncio do Mercado Livre (pedido do dono em 25/10/2026, no molde da Loja Integrada): a PRIMEIRA a
 * esquerda, so no anuncio publicado e so quando ha o que olhar. Os mesmos motivos do "!" do icone, um por linha, cada um
 * com a acao que o resolve (`divergenciasDoAnuncioML`). O catalogo nao se resolve sozinho: o dono confere e marca como
 * revisado; uma mudanca nova no ML (entrou, saiu, trocou) acende o "!" de novo.
 */
export default function AbaDivergenciasML({ itens, linkDoPainel = null, enviar = null, revisarCatalogo = null }) {
  const [revisao, setRevisao] = useState({ estado: "parado", erro: null });

  async function marcarRevisado() {
    setRevisao({ estado: "enviando", erro: null });
    const resultado = await revisarCatalogo();
    setRevisao(resultado?.ok ? { estado: "parado", erro: null } : { estado: "parado", erro: resultado?.erro ?? "Não foi possível registrar." });
  }

  if (itens.length === 0) return <p className="text-sm text-suave">Nenhuma divergência: o anúncio está em dia com o Rise e o Mercado Livre.</p>;

  return (
    <ul className="space-y-2">
      {itens.map((item) => (
        <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded border border-amber-200 bg-amber-50/50 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-texto">{item.titulo}</p>
            <p className="mt-0.5 text-xs text-suave">{item.detalhe}</p>
            {item.acao === "revisarCatalogo" && revisao.erro && <p className="mt-1 text-xs text-red-700" role="alert">{revisao.erro}</p>}
          </div>
          {item.acao === "enviar" && enviar}
          {item.acao === "painel" && linkDoPainel && (
            <a href={linkDoPainel} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded border border-borda bg-superficie px-2.5 py-1 text-xs font-medium text-acento hover:bg-fundo">
              Abrir no painel do ML <ExternalLink size={12} />
            </a>
          )}
          {item.acao === "revisarCatalogo" && revisarCatalogo && (
            <button
              type="button"
              onClick={marcarRevisado}
              disabled={revisao.estado === "enviando"}
              title='Você conferiu o catálogo: o "!" sai agora e volta se o anúncio entrar, sair ou trocar de catálogo'
              className="inline-flex shrink-0 items-center gap-1 rounded bg-acento px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {revisao.estado === "enviando" ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}
              Marcar como revisado
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

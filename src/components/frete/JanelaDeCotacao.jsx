"use client";

import { X } from "lucide-react";

import { propsDoFundo } from "@/lib/fundoDaJanela";

import CotadorDeFrete from "./CotadorDeFrete";

/** O cotador numa janela por cima (Proposta e Pedido): fundo que fecha so com clique que comeca e termina nele. */
export default function JanelaDeCotacao({ aberta, aoFechar, titulo = "Cotar frete", ...props }) {
  if (!aberta) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-16" {...propsDoFundo(aoFechar)}>
      <section role="dialog" aria-modal="true" aria-label={titulo} className="w-full max-w-4xl rounded-lg border border-borda bg-superficie shadow-2xl">
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <span className="font-semibold">{titulo}</span>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">
          <CotadorDeFrete {...props} />
        </div>
      </section>
    </div>
  );
}

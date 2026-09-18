"use client";

import { Loader, X } from "lucide-react";

/**
 * Confirmacao de exclusao num popup que NOMEIA o que sera apagado — no molde do
 * de Produtos (18/09/2026), onde um `confirm()` nativo sem nome deixou passar o
 * item errado. `aviso` e a consequencia (o que mais some junto).
 */
export default function PopupExclusao({
  titulo,
  nome,
  aviso,
  erro,
  pendente,
  aoConfirmar,
  aoCancelar,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) aoCancelar();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirmar exclusao"
        className="w-full max-w-md overflow-hidden rounded-lg border border-borda bg-superficie shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-borda p-3">
          <span className="text-sm font-semibold">{titulo}</span>
          <button
            type="button"
            onClick={aoCancelar}
            aria-label="Cancelar"
            className="rounded p-1 text-suave hover:bg-fundo"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-3 py-3 text-sm">
          <span className="block truncate font-medium">{nome}</span>
          {aviso && <p className="mt-1 text-xs text-suave">{aviso}</p>}
          {erro && <p className="mt-2 text-xs text-red-700">{erro}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-borda p-3">
          <button
            type="button"
            onClick={aoCancelar}
            disabled={pendente}
            className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={aoConfirmar}
            disabled={pendente}
            className="inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {pendente && <Loader size={13} className="animate-spin" />}
            Excluir
          </button>
        </div>
      </section>
    </div>
  );
}

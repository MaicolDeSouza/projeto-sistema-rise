"use client";

import { useEffect } from "react";

import { propsDoFundo } from "@/lib/fundoDaJanela";

/**
 * A pergunta antes de uma acao do pedido (sair sem salvar, marcar como enviado, finalizar, cancelar, desfazer), no
 * desenho do "Sair sem salvar?" dos editores de anuncio: titulo, o que acontece, e dois botoes. O de recuo tem o foco;
 * clique fora e Esc recuam. O destrutivo vem em vermelho, por ultimo.
 */
export default function Pergunta({ titulo, children, confirmar, recuar = "Cancelar", destrutiva = false, aoConfirmar, aoRecuar, ocupado = false }) {
  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key === "Escape") {
        evento.stopPropagation();
        aoRecuar();
      }
    }
    document.addEventListener("keydown", aoTeclar, true);
    return () => document.removeEventListener("keydown", aoTeclar, true);
  }, [aoRecuar]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4" {...propsDoFundo(() => aoRecuar())}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="pergunta-titulo" className="w-full max-w-md rounded-lg border border-borda bg-superficie p-5 shadow-2xl">
        <p id="pergunta-titulo" className="font-semibold text-balance">
          {titulo}
        </p>
        <div className="mt-1.5 text-sm text-pretty text-suave">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" autoFocus onClick={aoRecuar} className="rounded-md border border-borda px-3 py-2 text-sm hover:bg-fundo">
            {recuar}
          </button>
          <button
            type="button"
            onClick={aoConfirmar}
            disabled={ocupado}
            className={`rounded-md px-3 py-2 text-sm font-semibold text-white transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97] disabled:opacity-50 ${destrutiva ? "bg-red-600" : "bg-acento"}`}
          >
            {confirmar}
          </button>
        </div>
      </section>
    </div>
  );
}

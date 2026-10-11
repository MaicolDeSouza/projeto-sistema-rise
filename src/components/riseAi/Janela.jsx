"use client";

import { useEffect } from "react";

import { propsDoFundo } from "@/lib/fundoDaJanela";

/**
 * A janela (popup) do Rise AI: fundo escuro que só fecha com clique que começa E termina nele (`propsDoFundo`, regra do
 * sistema: selecionar o texto de um campo e soltar o mouse fora não pode fechar e perder o digitado) e Esc fecha.
 *
 * @param {{ titulo: string, aoFechar: () => void, largura?: string, children: import("react").ReactNode }} props
 */
export default function Janela({ titulo, aoFechar, largura = "max-w-md", children }) {
  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...propsDoFundo(aoFechar)}>
      <div role="dialog" aria-label={titulo} className={`max-h-[90vh] w-full ${largura} overflow-y-auto rounded-lg border border-borda bg-superficie p-5 shadow-xl`}>
        <h2 className="mb-3 text-base font-semibold">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

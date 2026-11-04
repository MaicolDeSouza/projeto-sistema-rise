"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, X } from "lucide-react";

import { propsDoFundo } from "@/lib/fundoDaJanela";

/**
 * Link para uma pagina do Rise que abre num pop-up por cima da tela (pedido do dono em 04/11/2026: "todo link deve
 * abrir sempre em forma de popup", o cadastro do cliente e o produto). A pagina aparece numa moldura do proprio Rise,
 * sem o menu lateral (`MarcaDeJanela`). O clique do meio e o Ctrl+clique continuam abrindo em outra aba (o `href` e de
 * verdade), e o icone no topo da janela tambem. Ao fechar, a tela de tras e relida: o que mudou la dentro aparece.
 */
export default function JanelaDaPagina({ href, titulo, children, className = "" }) {
  const [aberta, setAberta] = useState(false);
  const router = useRouter();

  function abrir(evento) {
    if (evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.button === 1) return;
    evento.preventDefault();
    evento.stopPropagation();
    setAberta(true);
  }

  function fechar() {
    setAberta(false);
    router.refresh();
  }

  useEffect(() => {
    if (!aberta) return undefined;
    function aoTeclar(evento) {
      if (evento.key === "Escape") {
        evento.stopPropagation();
        fechar();
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  });

  return (
    <>
      <a href={href} onClick={abrir} title={`Abrir ${titulo}`} className={className}>
        {children}
      </a>
      {aberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" {...propsDoFundo(fechar)}>
          <section role="dialog" aria-modal="true" aria-label={titulo} className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-borda bg-superficie shadow-2xl">
            <header className="flex items-center justify-between gap-3 border-b border-borda px-4 py-2">
              <h2 className="truncate text-sm font-semibold">{titulo}</h2>
              <div className="flex shrink-0 items-center gap-1">
                <a href={href} target="_blank" rel="noreferrer" title="Abrir em outra aba" aria-label="Abrir em outra aba" className="rounded p-2 text-suave transition-colors hover:bg-fundo hover:text-texto">
                  <ExternalLink size={16} />
                </a>
                <button type="button" onClick={fechar} aria-label="Fechar" className="rounded p-2 text-suave transition-colors hover:bg-fundo hover:text-texto">
                  <X size={18} />
                </button>
              </div>
            </header>
            <iframe src={href} title={titulo} className="min-h-0 w-full flex-1 border-0 bg-fundo" />
          </section>
        </div>
      )}
    </>
  );
}

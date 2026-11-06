"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { X } from "lucide-react";

import Pergunta from "@/components/compras/Pergunta";
import { propsDoFundo } from "@/lib/fundoDaJanela";

/**
 * A moldura das janelas da tela de licencas, no padrao do projeto: fundo escuro que so fecha com clique que comeca e
 * termina nele (`propsDoFundo`), titulo, X e Esc; com `alterado`, fechar pergunta "Sair sem salvar?" antes (Continuar
 * editando com o foco). O rodape recebe `pedirFechar`, para o Cancelar passar pela mesma pergunta.
 */
export default function Janela({ titulo, subtitulo = null, alterado = false, aoFechar, largura = "max-w-lg", rodape = null, children }) {
  const idDoTitulo = useId();
  const [perguntando, setPerguntando] = useState(false);
  const pedirFechar = useCallback(() => (alterado ? setPerguntando(true) : aoFechar()), [alterado, aoFechar]);

  useEffect(() => {
    // As janelas por cima (Pergunta, ConclusaoDoEnvio) ouvem o Esc na captura e param ali: este so roda sem elas.
    function aoTeclar(evento) {
      if (evento.key !== "Escape" || perguntando) return;
      evento.stopPropagation();
      pedirFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [pedirFechar, perguntando]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" {...propsDoFundo(pedirFechar)}>
      <section role="dialog" aria-modal="true" aria-labelledby={idDoTitulo} className={`flex max-h-[calc(100vh-2rem)] w-full ${largura} flex-col rounded-lg border border-borda bg-superficie shadow-2xl`}>
        <header className="flex items-start justify-between gap-3 border-b border-borda px-5 py-3">
          <div className="min-w-0">
            <h2 id={idDoTitulo} className="font-semibold text-balance">
              {titulo}
            </h2>
            {subtitulo && <p className="mt-0.5 truncate text-xs text-suave">{subtitulo}</p>}
          </div>
          <button type="button" onClick={pedirFechar} aria-label="Fechar" className="-mr-2 shrink-0 rounded p-2 text-suave transition-colors hover:bg-fundo hover:text-texto">
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <footer className="flex items-center gap-2 border-t border-borda px-5 py-3">{typeof rodape === "function" ? rodape(pedirFechar) : rodape}</footer>}
      </section>

      {perguntando && (
        <Pergunta titulo="Sair sem salvar?" confirmar="Sair sem salvar" recuar="Continuar editando" destrutiva aoConfirmar={aoFechar} aoRecuar={() => setPerguntando(false)}>
          O que foi digitado nesta janela será perdido.
        </Pergunta>
      )}
    </div>
  );
}

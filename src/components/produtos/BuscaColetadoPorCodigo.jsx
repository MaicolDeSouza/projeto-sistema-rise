"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";

import { buscarItemColetadoPorCodigo } from "@/app/produtos/acoes";

/** Escolhe o item exato coletado sem copiar o cadastro inteiro do produto. */
export default function BuscaColetadoPorCodigo({ codigo, tipo, aoEscolher }) {
  const [aberto, setAberto] = useState(false);
  const [resposta, setResposta] = useState(null);
  const [pendente, iniciarTransicao] = useTransition();

  function buscar() {
    setAberto(true);
    setResposta(null);
    iniciarTransicao(async () => {
      try {
        setResposta(await buscarItemColetadoPorCodigo(codigo, tipo));
      } catch {
        setResposta({ ok: false, erro: "Falha ao buscar o codigo." });
      }
    });
  }

  return (
    <div className="relative shrink-0">
      <button type="button" onClick={buscar} disabled={pendente} aria-label="Buscar produto pelo codigo" title="Buscar produto pelo codigo" className="rounded border border-borda p-1.5 text-acento hover:bg-fundo disabled:opacity-50">
        <Search size={16} />
      </button>
      {aberto && createPortal(
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" role="presentation">
        <div role="dialog" aria-modal="true" aria-label="Buscar produto pelo codigo" className="w-full max-w-md rounded border border-borda bg-superficie p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold">
            <span>Produtos com codigo {codigo || "—"}</span>
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar busca" className="rounded p-1 hover:bg-fundo"><X size={14} /></button>
          </div>
          {pendente && <p className="text-xs text-suave">Buscando...</p>}
          {resposta && !resposta.ok && <p className="text-xs text-red-700">{resposta.erro}</p>}
          {resposta?.ok && resposta.itens.length === 0 && <p className="text-xs text-suave">Nenhum produto coletado com este codigo.</p>}
          {resposta?.ok && resposta.itens.length > 0 && (
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {resposta.itens.map((item) => (
                <button key={item.id} type="button" onClick={() => { aoEscolher(item); setAberto(false); }} className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-fundo">
                  <span className="font-semibold">{item.fonte}</span> · {item.codigo || "sem codigo"}
                  <span className="block truncate text-suave" title={item.nome || undefined}>{item.nome || "Produto sem nome"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

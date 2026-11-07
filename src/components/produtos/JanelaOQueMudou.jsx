"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { propsDoFundo } from "@/lib/fundoDaJanela";

/**
 * "O que mudou na descricao" (Correcoes da descricao, spec 2026-11-07): no Salvar, os trechos que o dono corrigiu a mao no
 * texto que a IA ou a proposta escreveu, cada um com uma caixa para virar regra. Nesta janela o operador ve primeiro os
 * pares "antes -> depois"; a acao principal e Salvar. Caixas desmarcadas: corrigir uma vez nao e decidir uma regra.
 *
 * Mora num portal no <body>: dentro do <form> do produto, o Enter no "Por que" enviaria o formulario. Esc e o clique no
 * fundo voltam ao cadastro sem salvar.
 */
export default function JanelaOQueMudou({ candidatos, prompt, aoSalvar, aoSalvarSemRegra, aoVoltar }) {
  const [marcados, setMarcados] = useState(() => new Set());
  const [escopo, setEscopo] = useState("todas");
  const [porque, setPorque] = useState("");
  const titulo = useId();

  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key !== "Escape" || evento.repeat) return;
      // Na captura: o Esc nao chega ao cadastro de baixo (que abriria o "Sair sem salvar?").
      evento.stopPropagation();
      aoVoltar();
    }
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [aoVoltar]);

  function alternar(indice) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(indice)) novo.delete(indice);
      else novo.add(indice);
      return novo;
    });
  }

  function salvar() {
    const explicacao = porque.trim() || null;
    const promptNome = escopo === "prompt" && prompt?.nome ? prompt.nome : null;
    const lista = candidatos
      .filter((_, indice) => marcados.has(indice))
      .map((candidato) => ({ errado: candidato.antes, certo: candidato.depois, promptNome, explicacao }));
    if (lista.length === 0) aoSalvarSemRegra();
    else aoSalvar(lista);
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4" {...propsDoFundo(aoVoltar)}>
      <section role="dialog" aria-modal="true" aria-labelledby={titulo} className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-lg border border-borda bg-superficie shadow-2xl">
        <header className="flex items-center gap-1.5 border-b border-borda px-4 py-3">
          <h2 id={titulo} className="text-sm font-semibold">O que mudou na descrição</h2>
          <BolhaDeAjuda variante="inline" texto="Marque o que deve virar regra: o Rise passa a corrigir isso em toda descrição." />
        </header>

        <ul className="min-h-0 flex-1 divide-y divide-borda overflow-y-auto px-4">
          {candidatos.map((candidato, indice) => (
            <li key={`${candidato.antes}\u0000${candidato.depois}`}>
              <label className="flex cursor-pointer items-start gap-2.5 py-2.5">
                <input type="checkbox" checked={marcados.has(indice)} onChange={() => alternar(indice)} className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-1.5 text-sm">
                    <span className="text-suave line-through">{candidato.antes}</span>
                    <ArrowRight size={13} aria-hidden="true" className="shrink-0 text-suave" />
                    <span className="font-medium">{candidato.depois}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-suave" title={candidato.contexto}>
                    {candidato.contexto}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <footer className="space-y-3 border-t border-borda px-4 py-3">
          {prompt?.nome && (
            <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <legend className="sr-only">Vale para</legend>
              <span className="text-suave">Vale para:</span>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="radio" name="escopo-oquemudou" checked={escopo === "todas"} onChange={() => setEscopo("todas")} className="accent-emerald-600" />
                Todas as descrições
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="radio" name="escopo-oquemudou" checked={escopo === "prompt"} onChange={() => setEscopo("prompt")} className="accent-emerald-600" />
                Só o prompt “{prompt.nome}”
              </label>
            </fieldset>
          )}
          <label className="block text-sm">
            <span className="text-suave">Por quê (opcional)</span>
            <input
              type="text"
              value={porque}
              maxLength={500}
              onChange={(evento) => setPorque(evento.target.value)}
              className="mt-1 w-full rounded border border-borda bg-fundo px-2 py-1.5 text-sm"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={aoSalvarSemRegra} className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo">
              Salvar sem regra
            </button>
            <button type="button" autoFocus onClick={salvar} className="rounded bg-acento px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
              Salvar
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from "lucide-react";
import { formatarLinhaTecnica, limitesEspecificacoes } from "@/lib/ia/revisaoDescricao";

const CORES = [
  { base: "border-amber-400 bg-amber-50", marcada: "border-amber-600 bg-amber-200" },
  { base: "border-emerald-400 bg-emerald-50", marcada: "border-emerald-600 bg-emerald-200" },
  { base: "border-violet-400 bg-violet-50", marcada: "border-violet-600 bg-violet-200" },
  { base: "border-sky-400 bg-sky-50", marcada: "border-sky-600 bg-sky-200" },
  { base: "border-rose-400 bg-rose-50", marcada: "border-rose-600 bg-rose-200" },
  { base: "border-teal-400 bg-teal-50", marcada: "border-teal-600 bg-teal-200" },
];

export default function LinhasDescricao({
  texto, divergencias, opcoesRestantes, selecoes, confirmadas,
  aoSelecionar, aoExcluirOpcao, aoExcluirLinha, aoMover, aoMoverPasso, rolagem,
}) {
  const [destino, setDestino] = useState(null);
  const arraste = useRef(null);
  const linhas = texto.split("\n");
  const { inicio, fim } = limitesEspecificacoes(texto);
  const grupos = divergencias
    .map((item, indice) => ({ ...item, cor: CORES[indice % CORES.length] }))
    .filter((item) => !confirmadas.has(item.id))
    .sort((a, b) => (a.posicao ?? Infinity) - (b.posicao ?? Infinity));
  const escolhidas = new Set(divergencias
    .filter((item) => confirmadas.has(item.id) && Number.isInteger(selecoes[item.id]))
    .map((item) => formatarLinhaTecnica(item.opcoes[selecoes[item.id]].linha)));
  const visiveis = [];
  let grupo = 0;
  let comuns = 0;
  function adicionarOpcoes(todas = false) {
    while (grupo < grupos.length && (todas || (grupos[grupo].posicao ?? Infinity) <= comuns)) {
      const divergencia = grupos[grupo++];
      for (const opcaoIndice of opcoesRestantes[divergencia.id] ?? []) {
        visiveis.push({ tipo: "opcao", divergencia, opcaoIndice });
      }
    }
  }
  for (let indice = 0; indice < linhas.length; indice++) {
    const tecnica = indice >= inicio && indice < fim && Boolean(linhas[indice].trim());
    if (indice === fim) adicionarOpcoes(true);
    else if (tecnica) adicionarOpcoes();
    visiveis.push({ tipo: "linha", indice, linha: linhas[indice], tecnica });
    if (tecnica && !escolhidas.has(linhas[indice])) comuns++;
  }
  while (grupo < grupos.length) {
    const divergencia = grupos[grupo++];
    for (const opcaoIndice of opcoesRestantes[divergencia.id] ?? []) {
      visiveis.push({ tipo: "opcao", divergencia, opcaoIndice });
    }
  }

  function atualizarDestino(evento) {
    if (!arraste.current) return;
    const elemento = document.elementFromPoint(evento.clientX, evento.clientY)?.closest("[data-spec-index]");
    if (elemento) {
      const indice = Number(elemento.dataset.specIndex);
      arraste.current.destino = indice;
      setDestino(indice);
    }
    const painel = rolagem.current;
    if (painel) {
      const area = painel.getBoundingClientRect();
      if (evento.clientY < area.top + 35) painel.scrollBy({ top: -22 });
      else if (evento.clientY > area.bottom - 35) painel.scrollBy({ top: 22 });
    }
  }

  function terminarArraste(evento) {
    if (!arraste.current) return;
    const { origem, destino: alvo } = arraste.current;
    arraste.current = null;
    setDestino(null);
    evento.currentTarget.releasePointerCapture(evento.pointerId);
    if (origem !== alvo) aoMover(origem, alvo);
  }

  return (
    <div className="overflow-hidden rounded border border-borda bg-superficie font-mono text-xs">
      {visiveis.map((item, ordem) => {
        if (item.tipo === "opcao") {
          const { divergencia, opcaoIndice } = item;
          const opcao = divergencia.opcoes[opcaoIndice];
          const marcada = selecoes[divergencia.id] === opcaoIndice;
          const cor = marcada ? divergencia.cor.marcada : divergencia.cor.base;
          return (
            <div key={divergencia.id + "-" + opcaoIndice} className={"flex items-start border-l-4 border-b p-0.5 " + cor}>
              <span className="w-8 shrink-0 px-1 py-1.5 text-center text-suave">?</span>
              <button
                type="button"
                onClick={() => aoSelecionar(divergencia.id, opcaoIndice)}
                aria-pressed={marcada}
                title={opcao.fontes.map((fonte) => fonte.nome + ": " + fonte.produto).join(" · ")}
                className="min-w-0 flex-1 whitespace-pre-wrap px-1 py-1.5 text-left hover:underline"
              >
                {formatarLinhaTecnica(opcao.linha)}
                {marcada && <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 font-sans font-semibold text-white">Selecionada</span>}
                {divergencia.recomendada === opcaoIndice && <span className="ml-2 rounded bg-emerald-600 px-1.5 py-0.5 font-sans font-semibold text-white">IA recomenda</span>}
              </button>
              <button type="button" onClick={() => aoExcluirOpcao(divergencia, opcaoIndice)} aria-label={"Excluir opção " + opcao.valor + " de " + divergencia.campo} title="Excluir esta opção" className="shrink-0 p-1.5 text-suave hover:text-red-700"><Trash2 size={13} /></button>
            </div>
          );
        }
        const { indice, linha, tecnica } = item;
        return (
          <div key={"linha-" + ordem} data-spec-index={tecnica ? indice : undefined} className={"flex items-start border-b border-borda/50 " + (destino === indice ? "bg-sky-100" : "")}>
            <span className="w-8 shrink-0 border-r border-borda/50 px-2 py-1.5 text-right text-suave">{indice + 1}</span>
            {tecnica && (
              <button
                type="button"
                onPointerDown={(evento) => {
                  if (evento.button !== 0) return;
                  evento.preventDefault();
                  evento.currentTarget.setPointerCapture(evento.pointerId);
                  arraste.current = { origem: indice, destino: indice };
                  setDestino(indice);
                }}
                onPointerMove={atualizarDestino}
                onPointerUp={terminarArraste}
                onPointerCancel={() => { arraste.current = null; setDestino(null); }}
                aria-label={"Arrastar linha " + (indice + 1)}
                title="Arraste para reordenar"
                className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-1 text-suave hover:bg-sky-100 active:cursor-grabbing"
              ><GripVertical size={14} /></button>
            )}
            <span className="min-w-0 flex-1 whitespace-pre-wrap px-2 py-1.5">{linha || "\u00a0"}</span>
            {tecnica && (
              <>
                <button type="button" onClick={() => aoMoverPasso(indice, -1)} aria-label={"Subir linha " + (indice + 1)} title="Subir linha" className="shrink-0 p-1.5 text-suave hover:text-acento"><ChevronUp size={13} /></button>
                <button type="button" onClick={() => aoMoverPasso(indice, 1)} aria-label={"Descer linha " + (indice + 1)} title="Descer linha" className="shrink-0 p-1.5 text-suave hover:text-acento"><ChevronDown size={13} /></button>
                <button type="button" onClick={() => aoExcluirLinha(indice)} aria-label={"Excluir linha " + (indice + 1) + ": " + linha} title="Excluir esta especificação" className="shrink-0 p-1.5 text-suave hover:text-red-700"><Trash2 size={13} /></button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

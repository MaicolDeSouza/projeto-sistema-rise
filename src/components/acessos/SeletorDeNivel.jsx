"use client";

import { useRef } from "react";

import { nivelPorTecla } from "@/lib/acessos/matriz";
import { NIVEIS_POR_TIPO } from "@/lib/acessos/recursos";

/**
 * O nivel de um recurso na matriz: um grupo de radio em segmentos, com o nome do nivel em cada um (uma acao tem
 * "nenhum / executar"; um cartao, "nenhum / ver"). Quatro vagas fixas, para as colunas alinharem entre linhas de tipos
 * diferentes. Teclado: o grupo e uma parada so do Tab; as setas mudam o nivel e 0 a 3 escolhem a coluna.
 */
export default function SeletorDeNivel({ recurso, valor = "nenhum", aoMudar, desabilitado = false }) {
  const niveis = NIVEIS_POR_TIPO[recurso.tipo];
  const atual = niveis.includes(valor) ? valor : "nenhum";
  const botoes = useRef([]);

  function escolher(nivel, focar = false) {
    if (desabilitado) return;
    aoMudar(nivel);
    if (focar) botoes.current[niveis.indexOf(nivel)]?.focus();
  }

  function aoTeclar(evento) {
    const indice = niveis.indexOf(atual);
    if (evento.key === "ArrowRight" || evento.key === "ArrowLeft") {
      evento.preventDefault();
      const passo = evento.key === "ArrowRight" ? 1 : niveis.length - 1;
      escolher(niveis[(indice + passo) % niveis.length], true);
      return;
    }
    const porTecla = nivelPorTecla(recurso, evento.key);
    if (porTecla) {
      evento.preventDefault();
      escolher(porTecla, true);
    }
  }

  return (
    <div role="radiogroup" aria-label={recurso.rotulo} onKeyDown={aoTeclar} className="grid shrink-0 grid-cols-4 gap-1 rounded-[10px] bg-fundo p-1">
      {niveis.map((nivel, indice) => {
        const marcado = atual === nivel;
        const cor = marcado
          ? nivel === "nenhum"
            ? "bg-superficie font-medium text-texto shadow-sm"
            : "bg-emerald-100 font-medium text-emerald-800 ring-1 ring-emerald-300"
          : "text-suave hover:bg-superficie hover:text-texto";
        return (
          <button
            key={nivel}
            ref={(elemento) => {
              botoes.current[indice] = elemento;
            }}
            type="button"
            role="radio"
            aria-checked={marcado}
            tabIndex={marcado ? 0 : -1}
            disabled={desabilitado}
            onClick={() => escolher(nivel)}
            className={`h-8 w-[4.5rem] rounded-md px-1 text-xs transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:cursor-not-allowed ${cor}`}
          >
            {nivel}
          </button>
        );
      })}
    </div>
  );
}

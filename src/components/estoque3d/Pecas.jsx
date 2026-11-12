"use client";

import { Loader, X } from "lucide-react";
import { useState } from "react";

import CabecalhoOrdenavel from "@/components/ui/CabecalhoOrdenavel";
import { propsDoFundo } from "@/lib/fundoDaJanela";

/** Pecas pequenas que as abas Colunas e Caixinhas do Mapa do estoque dividem: a janela do formulario e a ordem da tabela. */

export const CLASSE_DO_CAMPO = "mt-1 w-full rounded border border-borda px-2.5 py-2 text-sm font-medium focus:border-acento focus:outline-none";

/** Janela por cima da tabela com Cancelar e Salvar (regra 7). O envio e manual: o React 19 limpa o formulario depois de uma action. */
export function JanelaDeFormulario({ titulo, erro, pendente, aoSalvar, aoFechar, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" {...propsDoFundo(aoFechar)}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onSubmit={(evento) => {
          evento.preventDefault();
          aoSalvar(Object.fromEntries(new FormData(evento.currentTarget)));
        }}
        className="w-full max-w-lg overflow-hidden rounded-lg border border-borda bg-superficie shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-borda p-3">
          <span className="text-sm font-semibold">{titulo}</span>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4">{children}</div>
        {erro && <p className="px-4 pb-2 text-sm text-red-700">{erro}</p>}
        <div className="flex justify-end gap-2 border-t border-borda p-3">
          <button type="button" onClick={aoFechar} disabled={pendente} className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={pendente} className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
            {pendente && <Loader size={14} className="animate-spin" />}
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}

/** Rotulo + campo da janela. `largo` ocupa as duas colunas. */
export function CampoDaJanela({ nome, rotulo, largo = false, children, ...props }) {
  return (
    <label className={`block text-sm font-semibold ${largo ? "col-span-2" : ""}`}>
      {rotulo}
      {children ?? <input name={nome} className={CLASSE_DO_CAMPO} {...props} />}
    </label>
  );
}

/**
 * Ordem da tabela guardada na tela (as listas sao curtas e ja vem inteiras): nada -> crescente -> decrescente -> nada,
 * o mesmo ciclo do cabecalho das listas grandes. Devolve as linhas ordenadas e o cabecalho pronto.
 */
export function useOrdemDaTabela(linhas) {
  const [ordem, setOrdem] = useState({ campo: null, direcao: null });
  function clicar(campo) {
    setOrdem((atual) => (atual.campo !== campo ? { campo, direcao: "asc" } : atual.direcao === "asc" ? { campo, direcao: "desc" } : { campo: null, direcao: null }));
  }
  const ordenadas = !ordem.campo
    ? linhas
    : [...linhas].sort((a, b) => {
        const [x, y] = [a[ordem.campo], b[ordem.campo]];
        // Vazio vai para o fim nas duas direcoes: nao e o menor valor, e a falta dele.
        if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1;
        if (y === null || y === undefined) return -1;
        const comparacao = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR", { numeric: true });
        return ordem.direcao === "asc" ? comparacao : -comparacao;
      });
  return { ordenadas, cabecalho: { ordenar: ordem.campo, direcao: ordem.direcao, aoClicar: clicar } };
}

/** O cabecalho que ordena, com o que `useOrdemDaTabela` devolveu em `cabecalho`. */
export function Coluna({ cabecalho, campo, rotulo, className = "" }) {
  return <CabecalhoOrdenavel campo={campo} rotulo={rotulo} className={className} {...cabecalho} />;
}

const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
/** "85,5" ou travessao. */
export const cm = (valor) => (valor === null || valor === undefined ? "—" : NUMERO.format(valor));

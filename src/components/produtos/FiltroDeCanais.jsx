"use client";

import { useRef, useState } from "react";
import { Filter, X } from "lucide-react";

import { CANAIS_DO_FILTRO } from "@/lib/filtroDeCanais";
import { propsDoFundo } from "@/lib/fundoDaJanela";

/**
 * O filtro da coluna Canais da lista de Produtos (pedido do dono em 24/10/2026): por canal, Todos, so os vinculados ou
 * so os nao vinculados. O cabecalho vira o botao; o menu abre em camada fixa (a area da tabela rola de lado e cortaria
 * um menu `absolute`). Cada escolha vai para a URL na hora (`aoMudar`), e a lista volta a pagina 1.
 *
 * @param {{ filtro: Record<string, "sim"|"nao">, aoMudar: (canal: string, valor: "sim"|"nao"|null) => void, aoLimpar: () => void }} props
 */
export default function FiltroDeCanais({ filtro, aoMudar, aoLimpar }) {
  const botao = useRef(null);
  const [posicao, setPosicao] = useState(null);
  const ativos = Object.keys(filtro ?? {}).length;

  function abrir() {
    const caixa = botao.current?.getBoundingClientRect();
    if (!caixa) return;
    setPosicao({ top: caixa.bottom + 6, right: Math.max(8, window.innerWidth - caixa.right) });
  }

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={abrir}
        aria-expanded={posicao !== null}
        title="Filtrar por canal: vinculados ou não"
        className={`inline-flex items-center gap-1.5 uppercase tracking-wide hover:text-texto ${ativos ? "font-semibold text-acento" : ""}`}
      >
        Canais
        <Filter size={12} />
        {ativos > 0 && <span className="rounded-full bg-acento px-1.5 text-[10px] leading-4 text-white">{ativos}</span>}
      </button>
      {posicao && (
        <div className="fixed inset-0 z-40" {...propsDoFundo(() => setPosicao(null))}>
          <div
            role="dialog"
            aria-label="Filtrar por canal"
            style={{ top: posicao.top, right: posicao.right }}
            className="fixed w-[25rem] max-w-[calc(100vw-1rem)] rounded-lg border border-borda bg-superficie p-3 text-left text-sm normal-case tracking-normal text-texto shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">Filtrar por canal</span>
              <button type="button" onClick={() => setPosicao(null)} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
                <X size={14} />
              </button>
            </div>
            <ul className="space-y-2">
              {CANAIS_DO_FILTRO.map((canal) => {
                const atual = filtro?.[canal.id] ?? null;
                const opcoes = [
                  { valor: null, rotulo: "Todos" },
                  { valor: "sim", rotulo: canal.sim },
                  { valor: "nao", rotulo: canal.nao },
                ];
                return (
                  <li key={canal.id} className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-suave">{canal.rotulo}</span>
                    <div role="radiogroup" aria-label={canal.rotulo} className="inline-flex overflow-hidden rounded border border-borda text-xs">
                      {opcoes.map((opcao) => {
                        const marcada = atual === opcao.valor;
                        return (
                          <button
                            key={opcao.rotulo}
                            type="button"
                            role="radio"
                            aria-checked={marcada}
                            onClick={() => aoMudar(canal.id, opcao.valor)}
                            className={`px-2 py-1 ${marcada ? "bg-acento font-medium text-white" : "hover:bg-fundo"}`}
                          >
                            {opcao.rotulo}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
            {ativos > 0 && (
              <button type="button" onClick={aoLimpar} className="mt-3 text-xs text-acento hover:underline">
                Limpar filtro de canais
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

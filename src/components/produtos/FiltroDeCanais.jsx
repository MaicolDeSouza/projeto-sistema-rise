"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Filter, X } from "lucide-react";

import { CANAIS } from "@/lib/canais";
import { CANAIS_DO_FILTRO, proximoValorDoFiltro } from "@/lib/filtroDeCanais";
import { propsDoFundo } from "@/lib/fundoDaJanela";

const LOGO = Object.fromEntries(CANAIS.map((canal) => [canal.id, canal.logo]));

// O desenho de cada icone do filtro, o mesmo da coluna Canais: o "R" do Rise, os logotipos e o "!" ambar.
function DesenhoDoIcone({ id }) {
  if (id === "rise") {
    return <span className="flex h-7 w-7 items-center justify-center rounded bg-emerald-600 text-[15px] leading-none font-bold text-white">R</span>;
  }
  if (id === "div") {
    return <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-[15px] leading-none font-bold text-amber-950">!</span>;
  }
  const logo = { bling: LOGO.BLING, li: LOGO.LOJA_INTEGRADA, ml: LOGO.MERCADO_LIVRE, mlc: LOGO.MERCADO_LIVRE }[id];
  return (
    <span className="relative">
      <Image src={logo} alt="" width={28} height={28} className="rounded" />
      {id === "mlc" && (
        <span className="absolute -right-1.5 -bottom-1.5 rounded-full bg-sky-700 px-1 text-[9px] leading-[13px] font-bold text-white ring-2 ring-superficie">
          C
        </span>
      )}
    </span>
  );
}

/**
 * O filtro da coluna Canais da lista de Produtos. Desde 28/10/2026 (pedido do dono, Opcao 1) o popup mostra os proprios
 * icones: cada clique avanca desligado -> verde (so quem tem) -> riscado em vermelho (so quem NAO tem) -> desligado, e os
 * ligados valem juntos. O cabecalho vira o botao; o menu abre em camada fixa (a area da tabela rola de lado e cortaria
 * um menu `absolute`). Cada clique vai para a URL na hora (`aoMudar`), e a lista volta a pagina 1. A Shopee fica de fora
 * enquanto nao tiver integracao (nao haveria o que filtrar).
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
        title="Filtrar por canal"
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
            className="fixed max-w-[calc(100vw-1rem)] rounded-lg border border-borda bg-superficie p-3 text-left text-sm normal-case tracking-normal text-texto shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <span className="font-semibold">Filtrar por canal</span>
              <button type="button" onClick={() => setPosicao(null)} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
                <X size={14} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              {CANAIS_DO_FILTRO.map((canal) => {
                const atual = filtro?.[canal.id] ?? null;
                const estado = atual === "sim" ? canal.sim : atual === "nao" ? canal.nao : `${canal.rotulo}: sem filtro`;
                const proximo = proximoValorDoFiltro(atual);
                const dica = `${estado}. Clique para ${proximo === "sim" ? `mostrar só: ${canal.sim}` : proximo === "nao" ? `mostrar só: ${canal.nao}` : "tirar o filtro"}.`;
                return (
                  <button
                    key={canal.id}
                    type="button"
                    onClick={() => aoMudar(canal.id, proximo)}
                    title={dica}
                    aria-label={dica}
                    aria-pressed={atual === null ? false : atual === "sim" ? true : "mixed"}
                    className={`relative flex h-11 w-11 items-center justify-center rounded-lg border-2 transition-[background-color,border-color,opacity] ${
                      atual === "sim"
                        ? "border-emerald-500 bg-emerald-50"
                        : atual === "nao"
                          ? "border-red-500 bg-red-50"
                          : "border-borda opacity-60 grayscale hover:bg-fundo hover:opacity-100 hover:grayscale-0"
                    }`}
                  >
                    <DesenhoDoIcone id={canal.id} />
                    {/* "Nao tem": o risco vermelho na diagonal por cima do icone. */}
                    {atual === "nao" && (
                      <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="h-[3px] w-12 rotate-45 rounded-full bg-red-600 ring-1 ring-white" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {ativos > 0 && (
              <div className="mt-3 flex items-start justify-between gap-4 border-t border-borda pt-2 text-xs">
                <ul className="space-y-0.5 text-suave">
                  {CANAIS_DO_FILTRO.filter((canal) => filtro?.[canal.id]).map((canal) => (
                    <li key={canal.id} className={filtro[canal.id] === "sim" ? "text-emerald-700" : "text-red-700"}>
                      {filtro[canal.id] === "sim" ? canal.sim : canal.nao}
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={aoLimpar} className="shrink-0 text-acento hover:underline">
                  Limpar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

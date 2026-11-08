"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Filter, X } from "lucide-react";

import { CANAIS } from "@/lib/canais";
import { CANAIS_DO_FILTRO, estadosDoCanal, proximoValorDoFiltro, rotuloDoEstado } from "@/lib/filtroDeCanais";
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
  const logo = { bling: LOGO.BLING, li: LOGO.LOJA_INTEGRADA, ml: LOGO.MERCADO_LIVRE }[id];
  return <Image src={logo} alt="" width={28} height={28} className="rounded" />;
}

// A borda do icone e a cor do resumo, por estado: verde (tem), vermelho (nao tem), ambar (o "P" da proposta) e azul (o "C"
// do catalogo), as mesmas cores dos selos da linha.
const CLASSE_DO_ESTADO = {
  sim: "border-emerald-500 bg-emerald-50",
  nao: "border-red-500 bg-red-50",
  proposta: "border-amber-400 bg-amber-50",
  catalogo: "border-sky-500 bg-sky-50",
};
const COR_DO_RESUMO = { sim: "text-emerald-700", nao: "text-red-700", proposta: "text-amber-700", catalogo: "text-sky-700" };

/**
 * O filtro da coluna Canais da lista de Produtos. Desde 28/10/2026 (pedido do dono, Opcao 1) o popup mostra os proprios
 * icones: cada clique avanca desligado -> verde (so quem tem) -> riscado em vermelho (so quem NAO tem) -> desligado, e os
 * ligados valem juntos. Desde 08/11/2026 (pedido do dono) o ciclo e por icone (`estados` em `lib/filtroDeCanais.js`): o
 * Rise e o ML tem tambem "em proposta" (o "P"), o ML e um icone so e o "com catalogo" (o "C") e o ultimo estado dele, e o
 * "!" aplica o filtro e fecha o popup. O cabecalho vira o botao; o menu abre em camada fixa (a area da tabela rola de
 * lado e cortaria um menu `absolute`). Cada clique vai para a URL na hora (`aoMudar`), e a lista volta a pagina 1. A
 * Shopee fica de fora enquanto nao tiver integracao (nao haveria o que filtrar).
 *
 * @param {{ filtro: Record<string, string>, aoMudar: (canal: string, valor: string|null) => void, aoLimpar: () => void }} props
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
                const estado = rotuloDoEstado(canal, atual) ?? `${canal.rotulo}: sem filtro`;
                const proximo = proximoValorDoFiltro(atual, estadosDoCanal(canal));
                const dica = `${estado}. Clique para ${proximo ? `mostrar só: ${rotuloDoEstado(canal, proximo)}` : "tirar o filtro"}.`;
                return (
                  <button
                    key={canal.id}
                    type="button"
                    onClick={() => {
                      aoMudar(canal.id, proximo);
                      // O "!" aplica e fecha (pedido do dono em 08/11/2026); os outros ficam abertos para combinar.
                      if (canal.fechaAoClicar) setPosicao(null);
                    }}
                    title={dica}
                    aria-label={dica}
                    aria-pressed={atual === null ? false : atual === "sim" ? true : "mixed"}
                    className={`relative flex h-11 w-11 items-center justify-center rounded-lg border-2 transition-[background-color,border-color,opacity] ${
                      CLASSE_DO_ESTADO[atual] ?? "border-borda opacity-60 grayscale hover:bg-fundo hover:opacity-100 hover:grayscale-0"
                    }`}
                  >
                    <DesenhoDoIcone id={canal.id} />
                    {/* "Nao tem": o risco vermelho na diagonal por cima do icone. */}
                    {atual === "nao" && (
                      <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="h-[3px] w-12 rotate-45 rounded-full bg-red-600 ring-1 ring-white" />
                      </span>
                    )}
                    {/* "Em proposta": o mesmo "P" ambar da linha; "com catalogo": o selo "C" do icone do ML. */}
                    {atual === "proposta" && (
                      <span aria-hidden="true" className="absolute top-0.5 left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[10px] leading-none font-bold text-amber-950 ring-2 ring-superficie">
                        P
                      </span>
                    )}
                    {atual === "catalogo" && (
                      <span aria-hidden="true" className="absolute right-0.5 bottom-0.5 rounded-full bg-sky-700 px-1 text-[9px] leading-[14px] font-bold text-white ring-2 ring-superficie">
                        C
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
                    <li key={canal.id} className={COR_DO_RESUMO[filtro[canal.id]] ?? "text-suave"}>
                      {rotuloDoEstado(canal, filtro[canal.id])}
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

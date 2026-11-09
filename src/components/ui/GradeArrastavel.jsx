"use client";

import { useMemo } from "react";
import { RotateCcw } from "lucide-react";

import useOrdemArrastavel from "./useOrdemArrastavel";

/**
 * Grade de cartoes que trocam de lugar (pedido do dono em 07/11/2026: "como se fosse arrastar um icone de um app de
 * celular, se manter clicado tem a possibilidade de arrastar o cartao para mudar a ordem"). Segurar 0,4 s sem mexer
 * (mouse ou dedo) pega o cartao: ele cresce com a borda azul, e passar por cima de outro troca os dois de lugar. Ao
 * soltar, a ordem e gravada para a pessoa. O gesto inteiro mora em `useOrdemArrastavel` (o menu lateral usa o mesmo).
 * "Ordem padrão" aparece embaixo quando a ordem foi mudada.
 *
 * `itens`: [{ id, conteudo }] na ordem padrao; `ordemSalva`: os ids gravados (ou null).
 */
export default function GradeArrastavel({ pagina, itens, ordemSalva = null, className = "" }) {
  const idsPadrao = useMemo(() => itens.map((item) => item.id), [itens]);
  const porId = useMemo(() => new Map(itens.map((item) => [item.id, item.conteudo])), [itens]);
  const { ordem, pego, erro, mudada, container, propsDoContainer, propsDoItem, voltarAoPadrao } = useOrdemArrastavel({
    pagina,
    idsPadrao,
    ordemSalva,
  });

  return (
    <>
      <div ref={container} className={`${className} ${pego ? "cursor-grabbing select-none" : ""}`} {...propsDoContainer}>
        {ordem.map((id) => (
          <div
            key={id}
            {...propsDoItem(id)}
            className={`relative rounded-xl transition-[transform,box-shadow,opacity] duration-150 [&>*]:h-full ${
              pego === id ? "z-10 scale-[1.03] shadow-lg ring-2 ring-acento" : pego ? "opacity-80" : ""
            }`}
          >
            {porId.get(id)}
          </div>
        ))}
      </div>
      {(mudada || erro) && (
        <div className="mt-2 flex items-center justify-end gap-3 text-xs">
          {erro && <span className="text-rose-600">{erro}</span>}
          {mudada && (
            <button type="button" onClick={voltarAoPadrao} title="Volta os cartões desta página à ordem do Rise" className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-suave hover:bg-fundo hover:text-texto">
              <RotateCcw size={12} /> Ordem padrão
            </button>
          )}
        </div>
      )}
    </>
  );
}

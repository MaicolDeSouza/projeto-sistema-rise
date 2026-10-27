"use client";

import { useState } from "react";
import { Box, TriangleAlert } from "lucide-react";

import { corDoEstoque, textoDoEstoque } from "@/lib/producao/regras";

const CORES = { vermelho: "text-red-600", amarelo: "text-amber-500", verde: "text-emerald-600" };

/**
 * Icone de estoque no desenho do Bling (pedido do dono em 26/10/2026): a caixa vermelha (vazio), amarela (abaixo do
 * minimo) ou verde, e ao passar o mouse a dica escura com o estoque atual, o minimo e o maximo. A dica e `fixed`
 * (calculada do icone): dentro de uma tabela com rolagem lateral, um `absolute` seria cortado.
 */
export default function IconeDeEstoque({ estoque, estoqueMinimo = null, estoqueMaximo = null }) {
  const [dica, setDica] = useState(null);
  const cor = corDoEstoque({ estoque, estoqueMinimo });
  const { titulo, linhas } = textoDoEstoque({ estoque, estoqueMinimo, estoqueMaximo });

  const abrir = (evento) => {
    const caixa = evento.currentTarget.getBoundingClientRect();
    setDica({ x: caixa.left + caixa.width / 2, y: caixa.top });
  };

  return (
    <span
      tabIndex={0}
      role="img"
      aria-label={`${titulo}. ${linhas.join(". ")}`}
      onMouseEnter={abrir}
      onFocus={abrir}
      onMouseLeave={() => setDica(null)}
      onBlur={() => setDica(null)}
      className="inline-flex rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-acento"
    >
      <Box size={18} className={CORES[cor]} />
      {dica && (
        <span
          role="tooltip"
          style={{ left: dica.x, top: dica.y - 8 }}
          className="pointer-events-none fixed z-50 w-max -translate-x-1/2 -translate-y-full rounded-md bg-neutral-800 px-3 py-2 text-left text-xs text-white shadow-lg"
        >
          <span className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold">
            {cor !== "verde" && <TriangleAlert size={14} className="text-amber-400" />}
            {titulo}
          </span>
          {linhas.map((linha) => (
            <span key={linha} className="block font-medium">
              {linha}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

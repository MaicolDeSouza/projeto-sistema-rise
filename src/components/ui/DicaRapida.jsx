"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ATRASO_MS = 150;
const MARGEM = 6;

/**
 * Dica que abre RAPIDO ao passar o mouse sobre um valor (o `title` do navegador demora ~1 s), acima dele, num portal com
 * posicao fixa (a tabela tem `overflow-x-auto`, que cortaria uma caixa absoluta). Mesmo tempo do texto cortado (150 ms,
 * `TextoCortadoAoClicar`). Primeiro uso: o estoque da lista de Produtos, com o estoque virtual e a previsao de entrega
 * (pedido do dono em 07/11/2026). `conteudo` nulo = sem dica (o filho aparece igual).
 */
export default function DicaRapida({ conteudo, children, className = "" }) {
  const [aberta, setAberta] = useState(false);
  const ancora = useRef(null);
  const caixa = useRef(null);
  const relogio = useRef(null);

  useLayoutEffect(() => {
    if (!aberta || !caixa.current || !ancora.current) return;
    const alvo = ancora.current.getBoundingClientRect();
    const { width, height } = caixa.current.getBoundingClientRect();
    const cabeEmCima = alvo.top - height - MARGEM >= 0;
    const topo = cabeEmCima ? alvo.top - height - MARGEM : alvo.bottom + MARGEM;
    const esquerda = Math.max(MARGEM, Math.min(alvo.left + alvo.width / 2 - width / 2, window.innerWidth - width - MARGEM));
    caixa.current.style.top = `${topo}px`;
    caixa.current.style.left = `${esquerda}px`;
  }, [aberta]);

  if (!conteudo) return children;

  const abrir = () => {
    clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setAberta(true), ATRASO_MS);
  };
  const fechar = () => {
    clearTimeout(relogio.current);
    setAberta(false);
  };

  return (
    <span ref={ancora} onMouseEnter={abrir} onMouseLeave={fechar} onFocus={abrir} onBlur={fechar} className={className}>
      {children}
      {aberta &&
        createPortal(
          <span
            ref={caixa}
            role="tooltip"
            style={{ top: -9999, left: -9999 }}
            className="pointer-events-none fixed z-[60] max-w-xs rounded-md bg-slate-900 px-3 py-2 text-left text-xs leading-relaxed font-normal text-white shadow-lg"
          >
            {conteudo}
          </span>,
          document.body,
        )}
    </span>
  );
}

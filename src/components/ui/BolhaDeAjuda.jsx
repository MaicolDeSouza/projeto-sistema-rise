"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Bolinha "i" de ajuda, no padrao do Bling (pedido do dono em 18/09/2026): ao
 * passar o mouse, mostra um texto curto explicando o que aquilo faz — em vez
 * de um paragrafo de ajuda sempre visivel embaixo do campo.
 *
 * Duas variantes:
 * - `"canto"` (padrao): badge no canto SUPERIOR direito de um botao-icone
 *   (lupa, Buscar por codigo, ✦ titulo/descricao). Desprendida do botao —
 *   fica quase toda para FORA do canto, nao colada na borda. Quando o icone
 *   tambem tem um numero (`Contador`), o numero mora no canto INFERIOR
 *   direito, NO MESMO `right` desta bolha (pedido do dono em 18/09/2026: os
 *   dois alinhados na mesma borda, um em cima do outro).
 * - `"inline"`: ao lado do ROTULO de um campo comum (Nome, SKU, Origem...),
 *   substituindo o paragrafo de ajuda que ficava sempre visivel embaixo do
 *   campo — pedido do dono em 18/09/2026, para "deixar a tela mais limpa".
 *
 * O texto abre para CIMA (pedido do dono em 18/09/2026) e so abre para baixo quando
 * nao cabe em cima da tela (pedido de 07/10/2026).
 *
 * O texto e desenhado FORA da arvore, num portal em `document.body` com posicao
 * `fixed` calculada do "i" (07/10/2026): dentro de um painel com rolagem
 * (`overflow-y-auto`, a janela do editor da Loja Integrada) ou de uma tabela com
 * `overflow-x-auto`, um texto `absolute` era CORTADO pela caixa, e no hover nao
 * aparecia nada. A posicao e escrita direto no elemento antes da pintura (como a
 * `ListaFlutuante` do cadastro), sem estado, e refeita a cada rolagem.
 *
 * O texto zera caixa, espacamento e peso herdados (`normal-case`,
 * `tracking-normal`, `font-normal`): dentro de um <th> de tabela (uppercase,
 * tracking largo) a explicacao inteira saia em MAIUSCULAS.
 *
 * `onClick` para a propagacao: quando a bolha mora DENTRO de um botao maior
 * (caso da lupa de referencias), clicar bem em cima do "i" nao pode disparar
 * a acao do botao por baixo.
 */
const MARGEM = 6;

export default function BolhaDeAjuda({ texto, variante = "canto", className = "" }) {
  // "inline-direita": igual a "inline", mas o texto abre alinhado pela DIREITA do icone (para a
  // esquerda). E a variante para icone que mora na borda direita de uma janela ou coluna (pedido
  // do dono em 21/09/2026).
  const inline = variante === "inline" || variante === "inline-direita";
  const centralizado = variante === "inline";
  const [aberto, setAberto] = useState(false);
  const icone = useRef(null);
  const caixa = useRef(null);
  const seta = useRef(null);

  useLayoutEffect(() => {
    if (!aberto) return undefined;
    function posicionar() {
      const elemento = caixa.current;
      const ancora = icone.current;
      if (!elemento || !ancora) return;
      const alvo = ancora.getBoundingClientRect();
      const { width, height } = elemento.getBoundingClientRect();
      const larguraDaTela = document.documentElement.clientWidth;
      const preferida = centralizado ? alvo.left + alvo.width / 2 - width / 2 : alvo.right - width;
      const esquerda = Math.min(Math.max(preferida, MARGEM), larguraDaTela - width - MARGEM);
      const cabeEmCima = alvo.top - height - MARGEM >= 0;
      const topo = cabeEmCima ? alvo.top - height - MARGEM : alvo.bottom + MARGEM;
      Object.assign(elemento.style, { left: `${esquerda}px`, top: `${topo}px`, visibility: "visible" });
      if (seta.current) {
        const centro = Math.min(Math.max(alvo.left + alvo.width / 2 - esquerda - 4, 6), width - 14);
        Object.assign(seta.current.style, {
          left: `${centro}px`,
          top: cabeEmCima ? "100%" : "auto",
          bottom: cabeEmCima ? "auto" : "100%",
          transform: `translateY(${cabeEmCima ? -4 : 4}px) rotate(45deg)`,
        });
      }
    }
    posicionar();
    // Rolagem de qualquer caixa (captura) ou da janela move o "i": a bolha acompanha.
    window.addEventListener("scroll", posicionar, true);
    window.addEventListener("resize", posicionar);
    return () => {
      window.removeEventListener("scroll", posicionar, true);
      window.removeEventListener("resize", posicionar);
    };
  }, [aberto, centralizado, texto]);

  return (
    <span
      className={`${inline ? "relative inline-flex" : "absolute -top-3 -right-1 z-10"} ${className}`}
      onClick={(evento) => evento.stopPropagation()}
      onMouseEnter={() => setAberto(true)}
      onMouseLeave={() => setAberto(false)}
    >
      <span
        ref={icone}
        role="img"
        aria-label="Ajuda"
        tabIndex={0}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        className="block h-4 w-4 cursor-help rounded-full text-acento shadow-md ring-2 ring-superficie"
      >
        {/* O "i" e desenhado (SVG), e nao escrito como texto: e o de serifa e cauda
            curva do icone de informacao de referencia, e nao depende da fonte da
            pagina. O circulo usa a cor de destaque da loja (`currentColor` = `text-acento`). */}
        <svg viewBox="0 0 550 550" aria-hidden="true" className="block h-full w-full">
          <circle cx="275" cy="275" r="275" fill="currentColor" />
          <g fill="#fff">
            <circle cx="307" cy="140" r="42" />
            <path d="M200 240C214 232 236 220 268 214C292 210 316 212 322 222C325 232 320 270 316 300C312 335 302 370 300 392C300 398 305 402 316 402C328 402 340 400 345 404C348 410 340 416 330 420C305 430 278 440 255 441C236 442 222 430 220 412C219 392 230 350 238 320C246 292 254 272 254 264C244 260 224 254 214 250C206 247 201 244 200 240Z" />
          </g>
        </svg>
      </span>
      {aberto &&
        createPortal(
          <span
            ref={caixa}
            role="tooltip"
            style={{ position: "fixed", left: 0, top: 0, visibility: "hidden" }}
            className="pointer-events-none z-[100] w-max max-w-56 rounded-md bg-slate-800 px-2.5 py-1.5 text-left text-[11px] leading-snug font-normal tracking-normal text-white normal-case shadow-lg"
          >
            {texto}
            <span ref={seta} className="absolute h-2 w-2 bg-slate-800" />
          </span>,
          document.body,
        )}
    </span>
  );
}

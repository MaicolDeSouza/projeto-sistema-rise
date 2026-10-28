"use client";

import { useState } from "react";

import { AmpliacaoDeFoto } from "@/components/produtos/ImagemComZoom";

/// Lado da previa que aparece ao passar o mouse.
const LADO_PREVIA = 260;

/**
 * PADRAO DO RISE PARA FOTO PEQUENA (pedido do dono em 12/10/2026): o mouse em cima abre uma previa
 * ampliada e o clique abre a foto grande. Toda miniatura de produto que nao tenha uma tela propria de
 * fotos usa este componente, em vez de montar a sua.
 *
 * A previa usa posicao FIXA calculada a partir da miniatura, e nao `absolute`: a lista rola dentro de
 * um contêiner com overflow, que cortaria qualquer coisa que saisse dele. Ela abre ACIMA da linha (<tr>),
 * para nao cobrir o nome do produto da propria linha; sem espaco em cima (as primeiras linhas), abre
 * embaixo. E nunca passa da borda da tela.
 *
 * O clique NAO sobe: dentro de uma linha clicavel, quem abre a foto para ver melhor nao esta escolhendo a linha.
 *
 * `children` e a miniatura em si (a lista usa o `next/image` para fotos locais); sem ela vai um <img>.
 */
export default function FotoComLupa({ src, alt, children = null, className = "h-11 w-11" }) {
  const [previa, setPrevia] = useState(null);
  const [ampliada, setAmpliada] = useState(false);

  function mostrarPrevia(evento) {
    const caixa = evento.currentTarget.getBoundingClientRect();
    const linha = evento.currentTarget.closest("tr")?.getBoundingClientRect() ?? caixa;
    const emCima = linha.top - LADO_PREVIA - 4;
    const topo =
      emCima >= 8 ? emCima : Math.max(8, Math.min(linha.bottom + 4, window.innerHeight - LADO_PREVIA - 8));
    const esquerda = Math.max(8, Math.min(caixa.left, window.innerWidth - LADO_PREVIA - 8));
    setPrevia({ topo, esquerda });
  }

  return (
    <>
      <button
        type="button"
        onClick={(evento) => {
          evento.stopPropagation();
          setPrevia(null);
          setAmpliada(true);
        }}
        onMouseEnter={mostrarPrevia}
        onMouseLeave={() => setPrevia(null)}
        title="Clique para ver maior"
        aria-label={`Ver foto maior de ${alt || "produto"}`}
        className={`relative block shrink-0 cursor-zoom-in overflow-hidden rounded border border-borda bg-superficie hover:border-acento focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none ${className}`}
      >
        {children ?? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain" />
        )}
      </button>

      {previa && (
        <div
          className="pointer-events-none fixed z-[60] rounded-lg border border-borda bg-white p-2 shadow-2xl"
          style={{ top: previa.topo, left: previa.esquerda, width: LADO_PREVIA, height: LADO_PREVIA }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="h-full w-full object-contain" />
        </div>
      )}

      {/* A foto grande mora DENTRO da linha clicavel: o clique no "X" ou no fundo subia ate o <tr> e abria o
          detalhe do produto (Scraper, achado pelo dono em 28/10/2026). O envoltorio `contents` segura o clique. */}
      {ampliada && (
        <div className="contents" onClick={(evento) => evento.stopPropagation()}>
          <AmpliacaoDeFoto src={src} alt={alt} aoFechar={() => setAmpliada(false)} />
        </div>
      )}
    </>
  );
}

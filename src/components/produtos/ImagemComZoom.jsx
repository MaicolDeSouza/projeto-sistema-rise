"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/**
 * Foto com LUPA: o mouse em cima mostra a area sob ele ampliada, e o clique abre a foto grande
 * (pedido do dono em 21/09/2026, para conferir detalhe sem sair da tela).
 *
 * O zoom e CONTROLADO por quem usa (`zoom` e `setZoom`), e nao daqui, para a janela de revisao
 * poder mostrar a MESMA area nas duas fotos lado a lado: e assim que se compara a original com a
 * melhorada. A posicao vai em porcentagem da caixa (0 a 100), e como as fotos do lote sao
 * quadradas (1024x1024) e a caixa tambem, a porcentagem cai no mesmo ponto das duas.
 */
export function ImagemComZoom({ src, alt, zoom, setZoom, aoAmpliar, className = "", opaca = false }) {
  function mover(evento) {
    const caixa = evento.currentTarget.getBoundingClientRect();
    const limitar = (valor) => Math.min(100, Math.max(0, valor));
    setZoom({
      x: limitar(((evento.clientX - caixa.left) / caixa.width) * 100),
      y: limitar(((evento.clientY - caixa.top) / caixa.height) * 100),
    });
  }

  return (
    <div
      className={`relative cursor-zoom-in overflow-hidden ${className}`}
      onMouseMove={mover}
      onMouseLeave={() => setZoom(null)}
      onClick={aoAmpliar}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={`h-full w-full object-contain ${opaca ? "opacity-40" : ""}`}
      />
      {zoom && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-white bg-no-repeat"
          style={{
            backgroundImage: `url("${src}")`,
            backgroundSize: "250%",
            backgroundPosition: `${zoom.x}% ${zoom.y}%`,
          }}
        />
      )}
    </div>
  );
}

/**
 * A foto GRANDE, por cima de tudo. O Esc e ouvido na captura da `window` e para ali: sem isso o mesmo
 * Esc fecharia tambem a janela de revisao, que escuta no `document`. As setas do teclado tambem ficam
 * aqui, para nao trocarem a foto de tras enquanto esta aberta.
 *
 * NAVEGACAO ENTRE FOTOS (pedido do dono em 04/10/2026: ao clicar na foto do produto, setas para ir a
 * anterior e a proxima). E opcional: quem tem uma lista de fotos passa `aoNavegar(passo)` (-1 ou 1),
 * `posicao` (a atual, a partir de 0) e `total`, e ganha as duas setas na tela, as do teclado e o
 * contador. Quem mostra uma foto so (a janela de revisao compara a original com a melhorada, e "proxima"
 * ali nao existe) nao passa nada e fica como era, com as setas do teclado engolidas. As setas nao dao a
 * volta: na primeira o "anterior" apaga, na ultima o "proxima", como as do painel.
 */
export function AmpliacaoDeFoto({ src, alt, aoFechar, posicao = 0, total = 0, aoNavegar = null }) {
  const navegavel = Boolean(aoNavegar) && total > 1;
  const ultima = total - 1;

  useEffect(() => {
    const aoTeclar = (evento) => {
      if (evento.key === "Escape") {
        evento.stopImmediatePropagation();
        aoFechar();
      } else if (evento.key === "ArrowLeft" || evento.key === "ArrowRight") {
        evento.stopImmediatePropagation();
        if (!navegavel) return;
        const passo = evento.key === "ArrowLeft" ? -1 : 1;
        if (posicao + passo >= 0 && posicao + passo <= ultima) aoNavegar(passo);
      }
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [aoFechar, aoNavegar, navegavel, posicao, ultima]);

  return (
    <div
      className="fixed inset-0 z-[70] flex cursor-zoom-out items-center justify-center bg-slate-950/85 p-4"
      onClick={aoFechar}
      aria-label="Foto ampliada"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="max-h-full max-w-full rounded bg-white object-contain" />
      <button
        type="button"
        onClick={aoFechar}
        aria-label="Fechar a foto ampliada"
        className="absolute top-3 right-3 rounded-full bg-white/90 p-2 text-slate-700 shadow hover:bg-white"
      >
        <X size={18} />
      </button>

      {navegavel && (
        <>
          {/* O clique nas setas NAO pode subir: o fundo fecha a foto, e passar de foto nao e fechar. */}
          <button
            type="button"
            onClick={(evento) => {
              evento.stopPropagation();
              aoNavegar(-1);
            }}
            disabled={posicao <= 0}
            aria-label="Foto anterior"
            className="absolute top-1/2 left-3 -translate-y-1/2 cursor-pointer rounded-full bg-white/90 p-2.5 text-slate-700 shadow hover:bg-white disabled:cursor-default disabled:opacity-30"
          >
            <ChevronLeft size={26} />
          </button>
          <button
            type="button"
            onClick={(evento) => {
              evento.stopPropagation();
              aoNavegar(1);
            }}
            disabled={posicao >= ultima}
            aria-label="Proxima foto"
            className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer rounded-full bg-white/90 p-2.5 text-slate-700 shadow hover:bg-white disabled:cursor-default disabled:opacity-30"
          >
            <ChevronRight size={26} />
          </button>
          <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-800/80 px-3 py-1 text-xs text-white">
            {posicao + 1} / {total}
          </span>
        </>
      )}
    </div>
  );
}

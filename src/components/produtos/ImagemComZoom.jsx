"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

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
 * Esc fecharia tambem a janela de revisao, que escuta no `document`. As setas tambem ficam aqui, para
 * nao trocarem a foto de tras enquanto esta aberta.
 */
export function AmpliacaoDeFoto({ src, alt, aoFechar }) {
  useEffect(() => {
    const aoTeclar = (evento) => {
      if (evento.key === "Escape") {
        evento.stopImmediatePropagation();
        aoFechar();
      } else if (evento.key === "ArrowLeft" || evento.key === "ArrowRight") {
        evento.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [aoFechar]);

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
    </div>
  );
}

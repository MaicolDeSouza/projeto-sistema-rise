"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";

/**
 * A tira de miniaturas das fotos do produto novo, no painel e na janela de revisao.
 *
 * Pedido do dono em 21/09/2026:
 *  - SEM barra de rolagem: setinhas para um lado e para o outro, que so aparecem quando ha mais
 *    fotos do que cabem;
 *  - ARRASTAR para mudar a ordem. A ordem da tira e a ordem em que as fotos vao para o produto, e
 *    a primeira (a mais a esquerda) e a PRINCIPAL. Por isso nao ha botao de "tornar principal".
 *
 * O arrastar usa o drag and drop do navegador, num <div role="button"> e nao num <button>: o
 * Firefox nao inicia arrasto a partir de um <button>. A barra colorida na borda da miniatura de
 * destino mostra onde a foto vai entrar (antes ou depois, conforme o lado do mouse).
 */
export default function TiraDeFotos({ imagens, atualBase, aoEscolher, aoReordenar, tamanho = "h-11 w-11", children }) {
  const rolagem = useRef(null);
  const [bordas, setBordas] = useState({ esquerda: false, direita: false });
  const [arrastando, setArrastando] = useState(null);
  const [alvo, setAlvo] = useState(null);

  // Quais setinhas mostrar. Observa a caixa e o miolo: foto que entra ou sai muda o miolo sem
  // nenhum evento de rolagem. O `setState` fica no callback do observador, e nao no corpo do efeito.
  useEffect(() => {
    const caixa = rolagem.current;
    if (!caixa) return undefined;

    const atualizar = () => {
      const esquerda = caixa.scrollLeft > 2;
      const direita = caixa.scrollLeft + caixa.clientWidth < caixa.scrollWidth - 2;
      setBordas((anterior) =>
        anterior.esquerda === esquerda && anterior.direita === direita ? anterior : { esquerda, direita },
      );
    };

    const observador = new ResizeObserver(atualizar);
    observador.observe(caixa);
    if (caixa.firstElementChild) observador.observe(caixa.firstElementChild);
    caixa.addEventListener("scroll", atualizar);
    return () => {
      observador.disconnect();
      caixa.removeEventListener("scroll", atualizar);
    };
  }, []);

  // A foto que esta na tela nunca fica escondida atras da borda da tira.
  useEffect(() => {
    const caixa = rolagem.current;
    const item = caixa?.querySelector(`[data-base="${atualBase}"]`);
    if (!caixa || !item) return;
    const inicio = item.offsetLeft;
    const fim = inicio + item.offsetWidth;
    if (inicio < caixa.scrollLeft) caixa.scrollTo({ left: inicio - 8, behavior: "smooth" });
    else if (fim > caixa.scrollLeft + caixa.clientWidth) {
      caixa.scrollTo({ left: fim - caixa.clientWidth + 8, behavior: "smooth" });
    }
  }, [atualBase, imagens.length]);

  function rolar(sentido) {
    const caixa = rolagem.current;
    if (caixa) caixa.scrollBy({ left: sentido * caixa.clientWidth * 0.8, behavior: "smooth" });
  }

  function aoSoltar(evento) {
    evento.preventDefault();
    // Soltar uma miniatura aqui nao e enviar arquivo: o painel tambem escuta soltar.
    evento.stopPropagation();
    if (!arrastando || !alvo || arrastando === alvo.base) {
      setArrastando(null);
      setAlvo(null);
      return;
    }
    const movida = imagens.find((imagem) => imagem.base === arrastando);
    if (movida) {
      const restantes = imagens.filter((imagem) => imagem.base !== arrastando);
      const posicao = restantes.findIndex((imagem) => imagem.base === alvo.base);
      restantes.splice(posicao + (alvo.depois ? 1 : 0), 0, movida);
      aoReordenar(restantes);
    }
    setArrastando(null);
    setAlvo(null);
  }

  const seta =
    "flex h-7 w-6 shrink-0 items-center justify-center rounded border border-borda bg-superficie text-suave hover:text-texto";

  return (
    <div className="flex min-w-0 items-center gap-1">
      {(bordas.esquerda || bordas.direita) && (
        <button
          type="button"
          onClick={() => rolar(-1)}
          disabled={!bordas.esquerda}
          aria-label="Fotos anteriores"
          className={`${seta} disabled:opacity-30`}
        >
          <ChevronLeft size={14} />
        </button>
      )}

      <div
        ref={rolagem}
        className="relative min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max gap-1.5 py-0.5 pr-1">
          {imagens.map((imagem, posicao) => (
            <div
              key={imagem.base}
              role="button"
              tabIndex={0}
              data-base={imagem.base}
              draggable
              onClick={() => aoEscolher(imagem.base)}
              onKeyDown={(evento) => {
                if (evento.key === "Enter" || evento.key === " ") {
                  evento.preventDefault();
                  aoEscolher(imagem.base);
                }
              }}
              onDragStart={(evento) => {
                evento.dataTransfer.effectAllowed = "move";
                evento.dataTransfer.setData("text/plain", imagem.base);
                setArrastando(imagem.base);
              }}
              onDragOver={(evento) => {
                if (!arrastando) return;
                evento.preventDefault();
                const caixa = evento.currentTarget.getBoundingClientRect();
                const depois = evento.clientX > caixa.left + caixa.width / 2;
                setAlvo((anterior) =>
                  anterior?.base === imagem.base && anterior.depois === depois ? anterior : { base: imagem.base, depois },
                );
              }}
              onDrop={aoSoltar}
              onDragEnd={() => {
                setArrastando(null);
                setAlvo(null);
              }}
              title={
                posicao === 0
                  ? "Foto principal (a primeira da fila). Arraste para mudar a ordem."
                  : `Foto ${posicao + 1}${imagem.finalizada ? " (validada)" : ""}. Arraste para mudar a ordem.`
              }
              className={`relative block ${tamanho} shrink-0 cursor-grab overflow-hidden rounded border-2 bg-white ${
                imagem.base === atualBase ? "border-acento" : "border-borda hover:border-acento/50"
              } ${arrastando === imagem.base ? "opacity-40" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagem.url} alt="" draggable={false} className="h-full w-full object-contain p-0.5" />
              {posicao === 0 && (
                <span className="absolute top-0 left-0 flex h-3.5 w-3.5 items-center justify-center rounded-br bg-slate-800/80">
                  <Star size={9} className="fill-amber-300 text-amber-300" />
                </span>
              )}
              {imagem.finalizada && (
                <span className="absolute right-0 bottom-0 flex h-3.5 w-3.5 items-center justify-center rounded-tl bg-emerald-600 text-white">
                  <Check size={10} strokeWidth={3} />
                </span>
              )}
              {alvo?.base === imagem.base && arrastando !== imagem.base && (
                <span
                  className={`absolute inset-y-0 w-1 bg-acento ${alvo.depois ? "right-0" : "left-0"}`}
                  aria-hidden
                />
              )}
            </div>
          ))}
          {children}
        </div>
      </div>

      {(bordas.esquerda || bordas.direita) && (
        <button
          type="button"
          onClick={() => rolar(1)}
          disabled={!bordas.direita}
          aria-label="Mais fotos"
          className={`${seta} disabled:opacity-30`}
        >
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

import { dataBr, dataCurta, pontosDoGrafico } from "@/lib/ferramentas/cotacao";

const ALTURA = 280;

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 4 });
const EIXO = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Grafico de linha da venda do PTAX, em SVG proprio (sem biblioteca: o dono
 * escolheu isso em 21/09/2026 para nao trazer dependencia nova). O desenho e
 * feito na largura REAL do quadro (ResizeObserver), e nao num `viewBox` que
 * encolhe: assim o texto dos eixos continua legivel no celular.
 *
 * Valor e data aparecem numa linha acima do grafico, e nao num balao sobre ele:
 * dispensa calcular posicao de balao e serve igual ao mouse e ao teclado.
 * Setas do teclado percorrem os dias com o grafico focado.
 */
export default function GraficoCotacao({ serie }) {
  const quadro = useRef(null);
  const [largura, setLargura] = useState(640);
  const [escolhido, setEscolhido] = useState(null);

  useEffect(() => {
    const elemento = quadro.current;
    if (!elemento || typeof ResizeObserver === "undefined") return undefined;
    const observador = new ResizeObserver(([entrada]) => {
      const nova = Math.round(entrada.contentRect.width);
      if (nova > 0) setLargura(nova);
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  const grafico = pontosDoGrafico(serie, largura, ALTURA);
  const { pontos, margem } = grafico;
  // Serie nova (troca de periodo) pode ser menor que o indice guardado.
  const indice = escolhido !== null && escolhido < pontos.length ? escolhido : null;
  const mostrado = pontos[indice ?? pontos.length - 1];

  function aoMover(evento) {
    const caixa = evento.currentTarget.getBoundingClientRect();
    const x = evento.clientX - caixa.left;
    let melhor = 0;
    for (let i = 1; i < pontos.length; i++) {
      if (Math.abs(pontos[i].x - x) < Math.abs(pontos[melhor].x - x)) melhor = i;
    }
    setEscolhido(melhor);
  }

  function aoTeclar(evento) {
    if (evento.key === "ArrowLeft" || evento.key === "ArrowRight") {
      evento.preventDefault();
      const passo = evento.key === "ArrowLeft" ? -1 : 1;
      // Atualizacao funcional: teclas seguidas (tecla presa) leem o valor mais novo.
      setEscolhido((anterior) => {
        const atual = anterior !== null && anterior < pontos.length ? anterior : pontos.length - 1;
        return Math.min(Math.max(atual + passo, 0), pontos.length - 1);
      });
    } else if (evento.key === "Escape") {
      setEscolhido(null);
    }
  }

  if (pontos.length === 0) return null;

  return (
    <div>
      <p className="mb-2 flex flex-wrap items-baseline gap-x-3 text-sm tabular-nums">
        <span className="font-medium">{dataBr(mostrado.data)}</span>
        <span>
          Venda <strong>{MOEDA.format(mostrado.valor)}</strong>
        </span>
        <span className="text-suave">Compra {MOEDA.format(mostrado.compra)}</span>
      </p>

      <div ref={quadro} className="w-full">
        <svg
          width={largura}
          height={ALTURA}
          role="img"
          aria-label={`Gráfico da venda do dólar PTAX, de ${dataBr(pontos[0].data)} a ${dataBr(
            pontos[pontos.length - 1].data,
          )}. Use as setas para percorrer os dias.`}
          tabIndex={0}
          onPointerMove={aoMover}
          onPointerLeave={() => setEscolhido(null)}
          onKeyDown={aoTeclar}
          onBlur={() => setEscolhido(null)}
          className="block touch-pan-y rounded outline-none focus-visible:ring-2 focus-visible:ring-acento"
        >
          {grafico.eixoY.map((marca) => (
            <g key={marca.y}>
              <line x1={margem.esquerda} x2={largura - margem.direita} y1={marca.y} y2={marca.y} className="stroke-borda" />
              <text x={margem.esquerda - 8} y={marca.y + 4} textAnchor="end" className="fill-suave text-[11px] tabular-nums">
                {EIXO.format(marca.valor)}
              </text>
            </g>
          ))}

          {grafico.eixoX.map((marca, posicao) => (
            <text
              key={marca.data}
              x={marca.x}
              y={ALTURA - 6}
              textAnchor={posicao === 0 ? "start" : posicao === grafico.eixoX.length - 1 ? "end" : "middle"}
              className="fill-suave text-[11px]"
            >
              {dataCurta(marca.data)}
            </text>
          ))}

          {grafico.area && <path d={grafico.area} className="fill-acento/10" />}
          <path d={grafico.caminho} fill="none" strokeWidth="2" strokeLinejoin="round" className="stroke-acento" />

          {indice !== null && (
            <line x1={mostrado.x} x2={mostrado.x} y1={margem.topo} y2={ALTURA - margem.base} className="stroke-suave" strokeDasharray="3 3" />
          )}
          <circle cx={mostrado.x} cy={mostrado.y} r="4" className="fill-acento stroke-superficie" strokeWidth="2" />
        </svg>
      </div>
    </div>
  );
}

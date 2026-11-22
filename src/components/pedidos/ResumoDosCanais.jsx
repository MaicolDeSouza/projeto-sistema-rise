"use client";

import { useState } from "react";
import Image from "next/image";
import { ChartColumn } from "lucide-react";

import { canalPorId } from "@/lib/canais";

import { moeda, moedaComSinal } from "./formato";

const vendasTexto = (n) => (n === 1 ? "1 venda" : `${n} vendas`);
const porcento = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });
const umaCasa = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

// O "Diario" (pedido do dono em 22/11/2026) corta em vez de arredondar ("se faltar 7,9 mostrar 7,9"): o centavo do
// valor e a casa das vendas.
const cortar = (valor, casas) => Math.trunc(valor * 10 ** casas) / 10 ** casas;
const vendasPorDia = (n) => {
  const porDia = cortar(n, 1);
  return porDia === 1 ? "1 venda" : `${umaCasa.format(porDia)} vendas`;
};

/**
 * "(R$570,29/4,3 vendas por dia)" e "(R$172,22 por dia)" (texto do dono em 22/11/2026; antes "(Diário=...)"): o total
 * dividido pelos dias corridos do filtro de datas.
 */
function PorDia({ children }) {
  return <span className="text-xs font-normal text-suave"> ({children} por dia)</span>;
}

/** Uma linha da caixinha: rotulo pequeno a esquerda, valor a direita (as tres linhas alinham pelo valor). */
function Linha({ rotulo, children, title }) {
  return (
    <div className="flex items-baseline justify-between gap-3" title={title}>
      <span className="text-xs text-suave">{rotulo}</span>
      <span className="whitespace-nowrap text-right text-sm font-semibold tabular-nums">{children}</span>
    </div>
  );
}

/** Uma caixinha: a de um canal (com o logo) ou a Geral (`geral`, em destaque azul, sem logo). */
function Caixa({ resumo, dias, geral = false }) {
  const canal = geral ? null : canalPorId(resumo.canal);
  const temLucro = "lucro" in resumo;
  const semVenda = resumo.pedidos === 0;
  return (
    <div className={`rounded-lg border px-3.5 py-2.5 ${geral ? "border-acento/40 bg-acento/5" : "border-borda bg-superficie"}`}>
      <div className="mb-1.5 flex items-center gap-2">
        {canal?.logo && <Image src={canal.logo} alt="" width={18} height={18} className="rounded-sm" />}
        <span className="text-sm font-medium">{geral ? "Geral" : (canal?.nome ?? resumo.canal)}</span>
      </div>
      {semVenda ? (
        <p className="py-3 text-center text-xs text-suave">Sem vendas no período</p>
      ) : (
        <div className="space-y-0.5">
          <Linha rotulo="Vendas">
            {moeda.format(resumo.faturamento)} <span className="font-normal text-suave">({vendasTexto(resumo.pedidos)})</span>
            {dias && (
              <PorDia>
                {moeda.format(cortar(resumo.faturamento / dias, 2))}/{vendasPorDia(resumo.pedidos / dias)}
              </PorDia>
            )}
          </Linha>
          {temLucro && (
            <Linha
              rotulo="Lucro"
              title={
                resumo.semLucro > 0
                  ? `${resumo.semLucro} venda(s) sem lucro calculado (item sem custo) ficaram de fora do lucro e do markup`
                  : "Markup = lucro ÷ custo total (produto, comissão, tarifa, frete e imposto). Devolvidos entram com o prejuízo do frete de retorno."
              }
            >
              <span className={resumo.lucro < 0 ? "text-red-600" : "text-emerald-700"}>{moedaComSinal(resumo.lucro)}</span>
              {resumo.markup !== null && <span className="font-normal text-suave"> ({porcento.format(resumo.markup)})</span>}
              {resumo.semLucro > 0 && <span className="ml-1 text-amber-600">*</span>}
              {dias && <PorDia>{moedaComSinal(cortar(resumo.lucro / dias, 2))}</PorDia>}
            </Linha>
          )}
          <Linha rotulo="Ticket médio">{moeda.format(resumo.ticket)}</Linha>
          {temLucro && resumo.lucroMedio !== null && (
            <Linha
              rotulo="Lucro médio por venda"
              title={`Lucro ÷ vendas com lucro calculado (${resumo.pedidos - resumo.semLucro})${resumo.semLucro > 0 ? `; ${resumo.semLucro} venda(s) sem custo ficaram de fora` : ""}`}
            >
              <span className={resumo.lucroMedio < 0 ? "text-red-600" : "text-emerald-700"}>{moedaComSinal(resumo.lucroMedio)}</span>
            </Linha>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * As caixinhas de Vendas (pedido do dono em 12/11/2026): uma por canal (vendas, lucro com markup e ticket medio) e a
 * Geral, com as mesmas linhas somando os tres canais (ela substituiu o "Lucro no periodo" do canto). Seguem os filtros
 * da lista menos o de canal (`resumoDosCanais`). Cancelados e devolvidos nao entram nas vendas nem no ticket.
 */
export default function ResumoDosCanais({ resumo, dias = null }) {
  // As caixinhas nascem ESCONDIDAS (pedido do dono em 22/11/2026: "botao que esconde os 04 cards") e o botao as mostra;
  // vale so enquanto a tela esta aberta.
  const [aberto, setAberto] = useState(false);
  if (!resumo) return null;
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex justify-end">
        <button
          type="button"
          onClick={() => setAberto((antes) => !antes)}
          aria-expanded={aberto}
          title={aberto ? "Esconder o resumo de vendas e lucro por canal" : "Mostrar o resumo de vendas e lucro por canal"}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
            aberto ? "border-acento bg-acento/10 text-acento" : "border-borda text-suave hover:bg-fundo"
          }`}
        >
          <ChartColumn size={13} aria-hidden="true" /> {aberto ? "Esconder resumo" : "Mostrar resumo"}
        </button>
      </div>
      {aberto && (
        // Quatro lado a lado so em tela muito larga: com o "por dia" na mesma linha a linha de Vendas pede ~420 px de
        // caixinha (medido com R$18.195,36), e em 4 colunas abaixo de ~2040 px ela nao cabe.
        <div className="grid grid-cols-1 gap-2.5 min-[768px]:grid-cols-2 min-[2040px]:grid-cols-4">
          {resumo.canais.map((c) => (
            <Caixa key={c.canal} resumo={c} dias={dias} />
          ))}
          <Caixa resumo={resumo.geral} dias={dias} geral />
        </div>
      )}
    </div>
  );
}

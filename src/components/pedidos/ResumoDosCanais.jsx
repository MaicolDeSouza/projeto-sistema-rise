"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { ChartColumn } from "lucide-react";

import { metricasDeFaturamentoAcao } from "@/app/pedidos/acoes";
import { canalPorId } from "@/lib/canais";
import { diasDoPeriodo, periodoDoMes } from "@/lib/pedidos/periodoDasMetricas";

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
function Caixa({ resumo, dias, geral = false, servicos = null }) {
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
              rotulo={geral ? "Lucro produtos" : "Lucro"}
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
          {/* Servicos (25/11/2026): so na Geral e so com venda de servico no periodo; o lucro e o valor menos o custo (sem NF). */}
          {servicos?.pedidos > 0 && (
            <Linha rotulo="Serviços" title="Itens de produto marcado como Serviço, já com o desconto. Sem nota fiscal por enquanto: o lucro é o valor menos o custo.">
              {moeda.format(servicos.faturamento)}
              {"lucro" in servicos && (
                <span className="font-normal text-suave">
                  {" "}
                  (Lucro <span className={servicos.lucro < 0 ? "text-red-600" : "text-emerald-700"}>{moedaComSinal(servicos.lucro)}</span>)
                </span>
              )}
            </Linha>
          )}
        </div>
      )}
    </div>
  );
}

const MES = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" });
const nomeDoMes = (dia) => {
  const texto = MES.format(new Date(`${dia}T12:00:00Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

/**
 * As Metricas de faturamento de Vendas (pedido do dono em 25/11/2026; eram as caixinhas de 12/11/2026 atras do "Mostrar
 * resumo", que seguiam os filtros da lista): uma caixinha por canal (vendas, lucro com markup e ticket medio) e a Geral.
 * O botao fica a esquerda e o painel nasce fechado; ao abrir, mostra o MES ATUAL, com "Mes anterior", "Mes atual" e um
 * intervalo de datas proprio (os outros filtros da lista nao entram). Os numeros vem da acao `metricasDeFaturamentoAcao`.
 * Cancelados, devolvidos e vendas em mediacao nao entram nas vendas nem no ticket.
 */
export default function ResumoDosCanais({ hoje }) {
  const [aberto, setAberto] = useState(false);
  const [periodo, setPeriodo] = useState(() => periodoDoMes(hoje, 0));
  const [resumo, setResumo] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, iniciar] = useTransition();

  const mesAtual = periodoDoMes(hoje, 0);
  const mesAnterior = periodoDoMes(hoje, -1);
  const igual = (a, b) => a.desde === b.desde && a.ate === b.ate;

  function carregar(novo) {
    setPeriodo(novo);
    if (!novo.desde || !novo.ate || novo.desde > novo.ate) return;
    setErro(null);
    iniciar(async () => {
      const resposta = await metricasDeFaturamentoAcao(novo.desde, novo.ate);
      if (resposta?.ok) setResumo(resposta.resumo);
      else setErro(resposta?.erro ?? "Não foi possível ler as métricas.");
    });
  }

  function alternar() {
    const abrir = !aberto;
    setAberto(abrir);
    // Abre sempre no mes atual (pedido do dono: "deve nascer com os dados de faturamento do mes atual").
    if (abrir) carregar(mesAtual);
  }

  const botaoDoPeriodo = (rotulo, alvo) => (
    <button
      type="button"
      onClick={() => carregar(alvo)}
      aria-pressed={igual(periodo, alvo)}
      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${igual(periodo, alvo) ? "border-acento bg-acento text-white" : "border-borda hover:bg-fundo"}`}
    >
      {rotulo}
    </button>
  );
  const rotuloDoPeriodo = igual(periodo, mesAtual) || igual(periodo, mesAnterior) ? nomeDoMes(periodo.desde) : null;
  const dias = periodo.desde && periodo.ate && periodo.desde <= periodo.ate ? diasDoPeriodo(periodo.desde, periodo.ate, hoje) : null;

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={alternar}
          aria-expanded={aberto}
          title={aberto ? "Esconder as métricas de faturamento" : "Mostrar as métricas de faturamento por canal"}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
            aberto ? "border-acento bg-acento/10 text-acento" : "border-borda text-suave hover:bg-fundo"
          }`}
        >
          <ChartColumn size={13} aria-hidden="true" /> Métricas de faturamento
        </button>
        {aberto && (
          <>
            <span className="mx-1 h-5 w-px bg-borda" aria-hidden="true" />
            {botaoDoPeriodo("Mês anterior", mesAnterior)}
            {botaoDoPeriodo("Mês atual", mesAtual)}
            <input
              type="date"
              value={periodo.desde}
              max={periodo.ate || undefined}
              onChange={(evento) => carregar({ ...periodo, desde: evento.target.value })}
              aria-label="Data inicial das métricas"
              className="rounded-md border border-borda bg-superficie px-2 py-1 text-xs tabular-nums"
            />
            <span className="text-xs text-suave">a</span>
            <input
              type="date"
              value={periodo.ate}
              min={periodo.desde || undefined}
              onChange={(evento) => carregar({ ...periodo, ate: evento.target.value })}
              aria-label="Data final das métricas"
              className="rounded-md border border-borda bg-superficie px-2 py-1 text-xs tabular-nums"
            />
            {rotuloDoPeriodo && <span className="text-xs font-medium text-suave">{rotuloDoPeriodo}</span>}
            {carregando && <span className="text-xs text-suave">Carregando…</span>}
            {erro && <span className="text-xs text-red-700">{erro}</span>}
          </>
        )}
      </div>
      {aberto && resumo && (
        // Quatro lado a lado so em tela muito larga: com o "por dia" na mesma linha a linha de Vendas pede ~420 px de
        // caixinha (medido com R$18.195,36), e em 4 colunas abaixo de ~2040 px ela nao cabe.
        <div className={`grid grid-cols-1 gap-2.5 transition-opacity duration-150 min-[768px]:grid-cols-2 min-[2040px]:grid-cols-4 ${carregando ? "opacity-50" : ""}`}>
          {resumo.canais.map((c) => (
            <Caixa key={c.canal} resumo={c} dias={dias} />
          ))}
          <Caixa resumo={resumo.geral} dias={dias} geral servicos={resumo.servicos} />
        </div>
      )}
    </div>
  );
}

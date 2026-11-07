"use client";

import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import CampoBusca from "@/components/ui/CampoBusca";
import { CANAIS } from "@/lib/canais";

import { STATUS, TEXTO_DO_STATUS } from "./textos";

// Os canais que tem pedido lido pelo Rise; a Shopee aparece desligada ate ter integracao.
const CANAIS_DO_FILTRO = CANAIS.filter((canal) => ["BLING", "LOJA_INTEGRADA", "MERCADO_LIVRE", "SHOPEE"].includes(canal.id));
const LIGAVEIS = new Set(["BLING", "LOJA_INTEGRADA", "MERCADO_LIVRE"]);

/** "2026-11-07" menos N dias, em dia de calendario (sem fuso: a conta e so de datas). */
function diasAntes(dia, n) {
  const [ano, mes, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, d - n)).toISOString().slice(0, 10);
}

/**
 * Os filtros da lista de Pedidos de venda, todos na URL (sobrevivem a recarga e vao num link): busca (`q`), periodo
 * (`desde`/`ate`, padrao 1 mes, decidido pela pagina; atalhos Hoje e 7 dias), canais e status (parametro repetido; nenhum = todos) e "Só com
 * !" (`aviso=1`). Cada mudanca volta a pagina 1. `navegacao` e a paginacao do topo, posta no canto direito da 1a linha.
 */
export default function FiltrosDePedidos({ busca, desde, ate, hoje, canais, status, soComAviso, navegacao = null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function ir(mudar) {
    const params = new URLSearchParams(searchParams);
    mudar(params);
    params.delete("pagina");
    const texto = params.toString();
    router.push(texto ? `${pathname}?${texto}` : pathname);
  }

  function alternarRepetido(nome, valor) {
    ir((params) => {
      const atuais = new Set(params.getAll(nome));
      if (valor === null) atuais.clear();
      else if (atuais.has(valor)) atuais.delete(valor);
      else atuais.add(valor);
      params.delete(nome);
      for (const item of atuais) params.append(nome, item);
    });
  }

  function mudarData(nome, valor) {
    ir((params) => {
      if (valor) params.set(nome, valor);
      else params.delete(nome);
    });
  }

  // Atalhos do periodo (pedido do dono em 07/11/2026: "botao clicavel para filtrar por vendas dos ultimos 7 dias e vendas
  // do dia"). O ativo fica marcado; clicar nele de novo volta ao periodo padrao de 1 mes.
  const atalhos = [
    { id: "hoje", rotulo: "Hoje", desde: hoje, dica: "Só as vendas de hoje" },
    { id: "7dias", rotulo: "7 dias", desde: diasAntes(hoje, 6), dica: "As vendas dos últimos 7 dias, com hoje" },
  ];
  function usarAtalho(atalho, ativo) {
    ir((params) => {
      if (ativo) {
        params.delete("desde");
        params.delete("ate");
      } else {
        params.set("desde", atalho.desde);
        params.set("ate", hoje);
      }
    });
  }

  const chip = (ativo) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${ativo ? "border-acento bg-acento/10 text-acento" : "border-borda text-suave hover:text-texto"}`;
  const campoData = "rounded-md border border-borda bg-superficie px-2 py-1.5 text-sm tabular-nums outline-none focus:border-acento";

  return (
    <div className="mb-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <CampoBusca valorInicial={busca} rotulo="Buscar por número, cliente, CPF/CNPJ, produto ou código (também das peças)" className="w-full max-w-xs" />

        <div className="flex items-center gap-1.5 text-sm" role="group" aria-label="Período da venda">
          <input type="date" aria-label="Vendido desde" value={desde} max={ate || undefined} onChange={(e) => mudarData("desde", e.target.value)} className={campoData} />
          <span className="text-suave">a</span>
          <input type="date" aria-label="Vendido até" value={ate} min={desde || undefined} onChange={(e) => mudarData("ate", e.target.value)} className={campoData} />
          <div className="ml-1 flex items-center gap-1">
            {atalhos.map((atalho) => {
              const ativo = desde === atalho.desde && ate === hoje;
              return (
                <button
                  key={atalho.id}
                  type="button"
                  onClick={() => usarAtalho(atalho, ativo)}
                  aria-pressed={ativo}
                  title={ativo ? "Clique para voltar ao período de 1 mês" : atalho.dica}
                  className={chip(ativo)}
                >
                  {atalho.rotulo}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Filtrar pelo canal">
          {CANAIS_DO_FILTRO.map((canal) => {
            const ligavel = LIGAVEIS.has(canal.id);
            const ativo = canais.includes(canal.id);
            const dica = !ligavel ? `${canal.nome}: ainda sem pedidos no Rise` : ativo ? `${canal.nome}: clique para tirar do filtro` : `Mostrar só ${canal.nome}`;
            return (
              <button
                key={canal.id}
                type="button"
                disabled={!ligavel}
                onClick={() => alternarRepetido("canal", canal.id)}
                title={dica}
                aria-label={dica}
                aria-pressed={ativo}
                className={`flex h-9 w-9 items-center justify-center rounded-md border-2 transition-[background-color,border-color,opacity,filter] ${
                  ativo ? "border-acento bg-acento/10" : "border-transparent opacity-60 grayscale hover:bg-fundo hover:opacity-100 hover:grayscale-0"
                } disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:grayscale`}
              >
                <Image src={canal.logo} alt="" width={22} height={22} className="rounded" />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => ir((params) => (soComAviso ? params.delete("aviso") : params.set("aviso", "1")))}
          aria-pressed={soComAviso}
          title="Mostrar só os pedidos com aviso"
          className={`inline-flex items-center gap-1.5 ${chip(soComAviso)}`}
        >
          <span aria-hidden="true" className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[9px] leading-none font-bold text-amber-950">
            !
          </span>
          Só com aviso
        </button>

        {navegacao}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar pela situação">
        <button type="button" onClick={() => alternarRepetido("status", null)} className={chip(status.length === 0)} aria-pressed={status.length === 0}>
          Todos
        </button>
        {STATUS.map((valor) => (
          <button key={valor} type="button" onClick={() => alternarRepetido("status", valor)} className={chip(status.includes(valor))} aria-pressed={status.includes(valor)}>
            {TEXTO_DO_STATUS[valor]}
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

import { atualizarRastreioAcao } from "@/app/compras/acoes";
import { LINK_DO_PACOTEVICIO } from "@/lib/compras/rastreioJT/regras";

const quando = (valor) =>
  valor ? new Date(valor).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : null;

const TOM = {
  delivered: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  exception: "bg-rose-50 text-rose-700 ring-rose-200",
  returned: "bg-rose-50 text-rose-700 ring-rose-200",
  out_for_delivery: "bg-sky-50 text-sky-700 ring-sky-200",
};

/**
 * O rastreio da J&T no bloco Frete (23/11/2026, PacoteVicio). Linha-guia: o operador ve primeiro onde o pacote esta; a acao
 * e "Atualizar rastreio". Estado proprio: o botao nao reaplica o pedido, para nao apagar o que foi digitado e nao salvo.
 * Todos os eventos aparecem, inclusive o de atribuicao do plano Basico, e o link do PacoteVicio fica embaixo (exigencia
 * da licenca).
 */
export default function RastreioDaJT({ pedidoId, inicial, podeAtualizar, motivoSemBotao = null }) {
  const [rastreio, setRastreio] = useState(inicial);
  const [erro, setErro] = useState(null);
  const [ocupado, iniciar] = useTransition();

  function atualizar() {
    setErro(null);
    iniciar(async () => {
      const resposta = await atualizarRastreioAcao(pedidoId);
      if (resposta?.pedido?.rastreioJT !== undefined) setRastreio(resposta.pedido.rastreioJT);
      if (!resposta?.ok) setErro(resposta?.erro ?? "Não foi possível consultar o rastreio da J&T.");
    });
  }

  const eventos = rastreio?.eventos ?? [];
  const mensagem = erro ?? rastreio?.erro ?? null;
  return (
    <div className="mt-4 border-t border-borda pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-texto">Rastreio J&T</span>
        {rastreio?.rotulo && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TOM[rastreio.situacao] ?? "bg-fundo text-texto ring-borda"}`}>
            {rastreio.rotulo}
            {rastreio.situacaoEm && <span className="ml-1 font-normal opacity-80">{quando(rastreio.situacaoEm)}</span>}
          </span>
        )}
        {rastreio?.lidoEm && <span className="text-xs text-suave">lido {quando(rastreio.lidoEm)}</span>}
        <button
          type="button"
          onClick={atualizar}
          disabled={!podeAtualizar || ocupado}
          title={podeAtualizar ? "Consulta a J&T agora (gasta 1 consulta do mês)." : (motivoSemBotao ?? undefined)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-borda px-2.5 py-1.5 text-xs font-medium text-texto hover:border-acento hover:text-acento disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={13} className={ocupado ? "animate-spin" : ""} />
          {ocupado ? "Consultando…" : "Atualizar rastreio"}
        </button>
      </div>
      {mensagem && <p className="mt-2 text-xs text-rose-600">{mensagem}</p>}
      {!rastreio && !mensagem && <p className="mt-2 text-xs text-suave">Ainda não consultado.</p>}
      {eventos.length > 0 && (
        <ol className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
          {eventos.map((evento, indice) => (
            <li key={`${evento.em}-${indice}`} className="grid grid-cols-[88px_1fr] gap-2 text-xs">
              <span className="tabular-nums text-suave">{quando(evento.em) ?? "—"}</span>
              <span className={indice === 0 ? "font-medium text-texto" : "text-texto"}>
                {evento.descricao}
                {evento.local && <span className="ml-1 text-suave">· {evento.local}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      <a href={rastreio?.link ?? LINK_DO_PACOTEVICIO} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-suave hover:text-acento">
        Rastreio por PacoteVício <ExternalLink size={11} />
      </a>
    </div>
  );
}

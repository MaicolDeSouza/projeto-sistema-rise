"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Undo2 } from "lucide-react";

import { marcarNotaDeDevolucaoAcao } from "@/app/pedidos/acoes";
import { LINK_DO_FATURADOR_ML, TEXTO_DA_CHEGADA, TEXTO_DA_NOTA } from "@/lib/pedidos/reclamacoesTextos";

const DIA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/**
 * A celula "Devolução" da lista de reclamacoes (20/11/2026, pedido do dono: emitir a nota de devolucao quando o cliente
 * posta). A API do ML nao emite nem mostra essa nota: o operador emite no faturador e marca aqui, com o numero. A acao
 * principal e "Marcar emitida", que so aparece na devolucao postada sem a nota.
 */
export default function NotaDeDevolucao({ linha, podeMarcar }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [numero, setNumero] = useState("");
  const [erro, setErro] = useState(null);
  const [pendente, iniciar] = useTransition();

  if (!linha.nota) return <span className="text-suave">—</span>;

  function enviar(emitida) {
    setErro(null);
    iniciar(async () => {
      const resultado = await marcarNotaDeDevolucaoAcao(linha.id, emitida ? numero : null, emitida);
      if (!resultado?.ok) {
        setErro(resultado?.erro ?? "Não foi possível salvar.");
        return;
      }
      setAberto(false);
      setNumero("");
      router.refresh();
    });
  }

  const datas = [linha.postadaEm && `Postada ${DIA.format(new Date(linha.postadaEm))}`, linha.entregueEm ? `chegou ${DIA.format(new Date(linha.entregueEm))}` : linha.chegada && linha.chegada !== "CHEGOU" ? TEXTO_DA_CHEGADA[linha.chegada].toLowerCase() : null].filter(Boolean).join(" · ");

  return (
    <div className="min-w-[11rem]">
      {linha.nota === "FALTA_NOTA" ? (
        <span className="inline-flex items-center gap-1.5 font-medium text-red-700">
          <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
          {TEXTO_DA_NOTA.FALTA_NOTA}
        </span>
      ) : linha.nota === "NOTA_EMITIDA" ? (
        <span className="inline-flex items-center gap-1.5 text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          {linha.notaNumero ? `Nota nº ${linha.notaNumero}` : TEXTO_DA_NOTA.NOTA_EMITIDA}
          {podeMarcar && (
            <button
              type="button"
              onClick={() => enviar(false)}
              disabled={pendente}
              title="Desfazer: a nota volta a faltar"
              aria-label="Desfazer a nota de devolução"
              className="-my-1 rounded p-1 text-suave transition-[color,background-color] duration-150 hover:bg-fundo hover:text-acento disabled:opacity-50"
            >
              <Undo2 size={13} />
            </button>
          )}
        </span>
      ) : (
        <span className="text-suave">{TEXTO_DA_NOTA[linha.nota]}</span>
      )}

      {datas && <span className={`block text-[11px] ${linha.chegada === "NAO_CHEGOU" ? "font-medium text-amber-700" : "text-suave"}`}>{datas}</span>}

      {linha.nota === "FALTA_NOTA" &&
        (aberto ? (
          <form
            className="mt-1.5 flex items-center gap-1.5"
            onSubmit={(evento) => {
              evento.preventDefault();
              enviar(true);
            }}
          >
            <input
              autoFocus
              value={numero}
              onChange={(evento) => setNumero(evento.target.value)}
              maxLength={20}
              placeholder="Nº da nota"
              aria-label="Número da nota de devolução"
              className="w-24 rounded border border-borda bg-superficie px-2 py-1 text-xs tabular-nums"
            />
            <button type="submit" disabled={pendente} className="rounded bg-acento px-2 py-1 text-xs font-medium text-white transition-opacity duration-150 disabled:opacity-50">
              Salvar
            </button>
            <button type="button" onClick={() => setAberto(false)} className="px-1 text-xs text-suave hover:text-texto">
              Cancelar
            </button>
          </form>
        ) : (
          <span className="mt-1 flex items-center gap-2 text-xs">
            {podeMarcar ? (
              <button type="button" onClick={() => setAberto(true)} className="font-medium text-acento hover:underline">
                Marcar emitida
              </button>
            ) : (
              <span className="text-suave" title="Sem permissão para marcar a nota de devolução">
                Marcar emitida
              </span>
            )}
            <a href={LINK_DO_FATURADOR_ML} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-suave hover:text-acento hover:underline" title="Emitir a nota de devolução no faturador do Mercado Livre">
              Faturador
              <ExternalLink size={11} />
            </a>
          </span>
        ))}
      {erro && <span className="mt-1 block text-xs text-red-700">{erro}</span>}
    </div>
  );
}

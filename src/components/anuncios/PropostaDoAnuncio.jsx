"use client";

import { FileText, X } from "lucide-react";
import { useEffect, useState } from "react";

import { propsDoFundo } from "@/lib/fundoDaJanela";
import { marcaDaProposta, valorProposto } from "@/lib/propostaDeAnuncio/preencher";

/**
 * A proposta de anuncio no editor do canal (spec 2026-10-23, secao 6.3), no molde da proposta no cadastro de produto:
 * campo que a proposta preencheu ganha a marca ambar "PROPOSTA" (some quando o dono edita); campo que ja tinha outro valor
 * ganha a linha "Proposta: ... Usar". O relatorio abre numa janela. Nada aqui grava: e o Salvar do editor que grava.
 */

const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A marca "PROPOSTA" embaixo do campo, enquanto o valor ainda e o que a proposta pos. */
export function MarcaDaPropostaNoCampo({ proposta, caminho, valorAtual }) {
  if (marcaDaProposta(proposta, caminho) !== "preenchido") return null;
  if (!igual(valorProposto(proposta, caminho), valorAtual)) return null;
  return (
    <p className="mt-1 text-[11px] font-semibold tracking-wide text-amber-700" title="Preenchido pela proposta; some quando você edita.">
      PROPOSTA
    </p>
  );
}

/** A sugestao para um campo que ja tinha valor: o dono decide com um clique. */
export function SugestaoDaProposta({ proposta, caminho, valorAtual, aoUsar, formatar = (valor) => String(valor ?? "") }) {
  if (marcaDaProposta(proposta, caminho) !== "sugestao") return null;
  const sugerido = valorProposto(proposta, caminho);
  if (igual(sugerido, valorAtual)) return null;
  return (
    <div className="mt-1 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
      <span className="shrink-0 rounded bg-amber-200 px-1 text-[10px] font-semibold">Proposta</span>
      <span className="min-w-0 flex-1 break-words">{formatar(sugerido)}</span>
      <button type="button" onClick={() => aoUsar(sugerido)} className="shrink-0 font-medium text-amber-800 hover:underline">
        Usar
      </button>
    </div>
  );
}

/** A faixa do topo do editor: a proposta espera o dono, com o botao do relatorio. */
export function FaixaDaProposta({ proposta, oQueFazer }) {
  const [aberto, setAberto] = useState(false);
  if (!proposta) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <span className="shrink-0 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-amber-950">P</span>
      <span className="min-w-0 flex-1">Proposta pronta, aguardando aprovação. {oQueFazer}</span>
      {proposta.relatorio && (
        <button type="button" onClick={() => setAberto(true)} className="inline-flex shrink-0 items-center gap-1 rounded border border-current px-2 py-0.5 font-medium hover:bg-white/50">
          <FileText size={12} /> Relatório
        </button>
      )}
      {aberto && <JanelaDoRelatorio proposta={proposta} aoFechar={() => setAberto(false)} />}
    </div>
  );
}

function JanelaDoRelatorio({ proposta, aoFechar }) {
  // O Esc fecha so o relatorio: ouvido na captura e parado ali, senao o editor de baixo pergunta "Sair sem salvar?".
  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key !== "Escape") return;
      evento.stopPropagation();
      evento.preventDefault();
      aoFechar();
    }
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [aoFechar]);
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 pt-[8vh]" {...propsDoFundo(aoFechar)}>
      <section role="dialog" aria-modal="true" aria-label="Relatório da proposta" className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-borda bg-superficie shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-borda px-4 py-2.5">
          <p className="text-sm font-semibold">Relatório da proposta</p>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <pre className="font-sans text-sm whitespace-pre-wrap text-texto">{proposta.relatorio}</pre>
          {(proposta.avisos ?? []).length > 0 && (
            <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-amber-800">
              {proposta.avisos.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          )}
          {(proposta.links ?? []).length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold">Anúncios usados na conta do preço (sem catálogo; preços não conferidos pelo Rise)</p>
              <ul className="mt-1 space-y-1 text-xs">
                {proposta.links.map((link) => (
                  <li key={link.url} className="flex flex-wrap gap-2">
                    {/* So endereco http(s) vira link: o texto veio da conversa, e javascript: num href executaria codigo. */}
                    {/^https?:\/\//i.test(String(link.url)) ? (
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-acento hover:underline">
                        {link.titulo || link.url}
                      </a>
                    ) : (
                      <span className="min-w-0 flex-1 truncate">{link.titulo || link.url}</span>
                    )}
                    <span className="tabular-nums">{Number(link.preco).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-[11px] text-suave">Roteiro versão {proposta.versaoDoRoteiro || "?"}</p>
        </div>
      </section>
    </div>
  );
}

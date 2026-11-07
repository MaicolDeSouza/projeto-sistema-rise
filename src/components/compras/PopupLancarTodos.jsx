"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Loader2, X } from "lucide-react";

import { lancarEstoqueAcao, reenviarAoBlingAcao } from "@/app/compras/acoes";
import { faltaLancar } from "@/lib/compras/regras";
import { propsDoFundo } from "@/lib/fundoDaJanela";

/**
 * "Lançar estoque" de TODOS os itens de uma vez (pedido do dono em 07/11/2026: "outro botao que eu possa marcar 'Lançar
 * estoque' todos de uma vez"). Linha-guia: o operador ve a lista do que vai entrar (o que falta de cada item) e a acao
 * principal e "Lançar N itens no Bling". Cada item passa pelo MESMO `lancarEstoqueAcao` do botao da linha, um depois do
 * outro (o Bling aceita 3 pedidos por segundo da conta inteira). Se o Bling pedir o deposito, a janela pergunta UMA vez e
 * usa o escolhido nos itens seguintes. Item que falha nao para os outros: a lista mostra o que entrou e o que nao entrou.
 */
export default function PopupLancarTodos({ itens, aoFechar, aoTerminar }) {
  // A lista fica congelada ao abrir: depois de lancar, o pedido volta atualizado (falta 0) e a lista sumiria da janela.
  const [pendentes] = useState(() => itens.filter((item) => faltaLancar(item) > 0));
  const [estado, setEstado] = useState({});
  const [rodando, setRodando] = useState(false);
  const [terminou, setTerminou] = useState(false);
  const [depositos, setDepositos] = useState(null);
  const escolha = useRef(null);

  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key === "Escape" && !rodando) aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar, rodando]);

  const marcar = (id, valor) => setEstado((antes) => ({ ...antes, [id]: valor }));
  const perguntarDeposito = (lista) =>
    new Promise((resolver) => {
      escolha.current = resolver;
      setDepositos(lista);
    });

  async function lancarTodos() {
    setRodando(true);
    let deposito = null;
    let ultimoPedido = null;
    const avisos = {};
    for (const item of pendentes) {
      const quantidade = faltaLancar(item);
      marcar(item.id, { fase: "lancando" });
      let resposta;
      try {
        resposta = await lancarEstoqueAcao(item.id, quantidade, deposito?.id ?? null);
      } catch {
        resposta = { ok: false, erro: "Falha de conexão." };
      }
      if (!resposta?.ok) {
        marcar(item.id, { fase: "erro", texto: resposta?.erro ?? "Não foi possível lançar." });
        continue;
      }
      ultimoPedido = resposta.pedido ?? ultimoPedido;
      let bling = resposta.bling;
      if (!bling?.ok && bling?.precisaDeposito?.length) {
        // A entrada ja esta no Rise; falta so dizer onde ela cai no Bling. Pergunta uma vez so.
        deposito ??= await perguntarDeposito(bling.precisaDeposito);
        setDepositos(null);
        bling = await reenviarAoBlingAcao(item.produtoId, deposito.id);
      }
      if (bling?.ok) {
        marcar(item.id, { fase: "ok" });
        avisos[item.id] = null;
      } else {
        const texto = bling?.erro ?? "erro desconhecido";
        marcar(item.id, { fase: "bling", texto });
        avisos[item.id] = texto;
      }
    }
    setRodando(false);
    setTerminou(true);
    aoTerminar({ pedido: ultimoPedido, avisos });
  }

  const falhas = Object.values(estado).filter((valor) => valor.fase === "erro" || valor.fase === "bling").length;
  const lancados = Object.values(estado).filter((valor) => valor.fase === "ok" || valor.fase === "bling").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" {...propsDoFundo(() => !rodando && aoFechar())}>
      <section role="dialog" aria-modal="true" aria-labelledby="lancar-todos-titulo" className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-borda bg-superficie shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-borda px-5 py-4">
          <div className="min-w-0">
            <h2 id="lancar-todos-titulo" className="font-semibold">Lançar estoque de todos os itens</h2>
            <p className="mt-0.5 text-sm text-suave">Entra o que falta de cada item, no Rise e no Bling.</p>
          </div>
          <button type="button" onClick={aoFechar} disabled={rodando} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo disabled:opacity-40">
            <X size={18} />
          </button>
        </header>

        {depositos ? (
          <div className="space-y-3 px-5 py-4 text-sm">
            <p>O Bling não tem depósito padrão: escolha onde as entradas caem. Vale para todos os itens desta vez.</p>
            <div className="space-y-1.5">
              {depositos.map((deposito) => (
                <button
                  key={deposito.id}
                  type="button"
                  onClick={() => escolha.current?.(deposito)}
                  className="flex w-full items-center justify-between rounded-md border border-borda px-3 py-2 text-left hover:border-acento"
                >
                  {deposito.descricao}
                  <ArrowRight size={15} className="text-suave" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-borda overflow-y-auto px-5 py-1 text-sm">
            {pendentes.map((item) => {
              const falta = faltaLancar(item);
              const fator = item.fator > 1 ? item.fator : 1;
              const situacao = estado[item.id];
              return (
                <li key={item.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" title={item.nome}>{item.nome}</span>
                    <span className="font-mono text-xs text-suave">{item.sku}</span>
                    {situacao?.texto && (
                      <span className={`block text-xs ${situacao.fase === "erro" ? "text-rose-700" : "text-amber-700"}`}>
                        {situacao.fase === "erro" ? situacao.texto : `Entrada gravada no Rise; o Bling recusou: ${situacao.texto}`}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    +{falta}
                    {fator > 1 && <span className="block text-[11px] text-suave">cx = {(falta * fator).toLocaleString("pt-BR")} un.</span>}
                  </span>
                  <span className="flex w-5 shrink-0 justify-center" aria-hidden="true">
                    {situacao?.fase === "lancando" && <Loader2 size={15} className="animate-spin text-acento" />}
                    {situacao?.fase === "ok" && <Check size={16} className="text-emerald-600" />}
                    {(situacao?.fase === "erro" || situacao?.fase === "bling") && <span className="h-2 w-2 rounded-full bg-amber-500" />}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {!depositos && (
          <footer className="flex items-center justify-between gap-3 border-t border-borda px-5 py-3">
            <span className="text-xs text-suave" aria-live="polite">
              {terminou
                ? falhas > 0
                  ? `${lancados} lançado(s); ${falhas} com problema (a linha diz o quê).`
                  : `${lancados} lançado(s) no Bling.`
                : `${pendentes.length} ${pendentes.length === 1 ? "item" : "itens"} com quantidade a lançar.`}
            </span>
            <div className="flex gap-2">
              {terminou ? (
                <button type="button" onClick={aoFechar} className="rounded-md bg-acento px-3.5 py-2 text-sm font-semibold text-white hover:bg-acento/90">
                  OK
                </button>
              ) : (
                <>
                  <button type="button" onClick={aoFechar} disabled={rodando} className="rounded-md border border-borda px-3 py-2 text-sm hover:bg-fundo disabled:opacity-50">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={lancarTodos}
                    disabled={rodando || pendentes.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-md bg-acento px-3.5 py-2 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-acento/90 active:scale-[0.97] disabled:opacity-50"
                  >
                    {rodando && <Loader2 size={15} className="animate-spin" />}
                    <span className="whitespace-nowrap">{rodando ? "Lançando…" : `Lançar ${pendentes.length} ${pendentes.length === 1 ? "item" : "itens"} no Bling`}</span>
                  </button>
                </>
              )}
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowRight, Loader2, X } from "lucide-react";

import { lancarEstoqueAcao, reenviarAoBlingAcao } from "@/app/compras/acoes";
import { faltaLancar, validarQuantidadeDeLancamento } from "@/lib/compras/regras";
import { propsDoFundo } from "@/lib/fundoDaJanela";
import { soDigitos } from "./formato";

/**
 * "Lancar estoque" de um item (spec §7.5). Linha-guia: o operador ve quanto chegou e o saldo depois; a acao principal e
 * "Lancar no Bling". A quantidade vem com o que falta (aceita menos: entrega parcial). Se o Bling pedir o deposito (sem
 * deposito padrao), a janela mostra a lista e manda de novo so os ajustes pendentes.
 */
export default function PopupLancarEstoque({ item, aoFechar, aoConcluir }) {
  const falta = faltaLancar(item);
  const [quantidade, setQuantidade] = useState(String(falta));
  const [erro, setErro] = useState(null);
  const [depositos, setDepositos] = useState(null);
  const [ocupado, iniciar] = useTransition();

  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key === "Escape" && !ocupado) aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar, ocupado]);

  const valida = validarQuantidadeDeLancamento(quantidade, falta);
  const depois = (item.estoqueAtual ?? 0) + (valida.ok ? valida.quantidade : 0);

  function lancar() {
    setErro(null);
    iniciar(async () => {
      const resposta = await lancarEstoqueAcao(item.id, Number(quantidade));
      if (!resposta?.ok) {
        setErro(resposta?.erro ?? "Não foi possível lançar.");
        return;
      }
      if (!resposta.bling?.ok && resposta.bling?.precisaDeposito?.length) {
        // A entrada ja esta no Rise; falta so escolher onde ela cai no Bling.
        setDepositos({ lista: resposta.bling.precisaDeposito, resposta });
        return;
      }
      aoConcluir(resposta, Number(quantidade));
    });
  }

  function enviarNoDeposito(deposito) {
    iniciar(async () => {
      const bling = await reenviarAoBlingAcao(item.produtoId, deposito.id);
      aoConcluir({ ...depositos.resposta, bling }, Number(quantidade));
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" {...propsDoFundo(() => !ocupado && aoFechar())}>
      <section role="dialog" aria-modal="true" aria-labelledby="lancar-titulo" className="w-full max-w-md rounded-lg border border-borda bg-superficie shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-borda px-5 py-4">
          <div className="min-w-0">
            <h2 id="lancar-titulo" className="font-semibold">Lançar estoque</h2>
            <p className="mt-0.5 truncate text-sm text-suave">
              <span className="font-mono text-xs">{item.sku}</span> · {item.nome}
            </p>
          </div>
          <button type="button" onClick={aoFechar} disabled={ocupado} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
            <X size={18} />
          </button>
        </header>

        {depositos ? (
          <div className="space-y-3 px-5 py-4 text-sm">
            <p>A entrada já está no Rise. O Bling não tem depósito padrão: escolha onde ela entra.</p>
            <div className="space-y-1.5">
              {depositos.lista.map((deposito) => (
                <button
                  key={deposito.id}
                  type="button"
                  disabled={ocupado}
                  onClick={() => enviarNoDeposito(deposito)}
                  className="flex w-full items-center justify-between rounded-md border border-borda px-3 py-2 text-left hover:border-acento disabled:opacity-50"
                >
                  {deposito.descricao}
                  <ArrowRight size={15} className="text-suave" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-4">
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-suave">Quantidade do pedido</dt>
              <dd className="text-right tabular-nums">{item.quantidade}</dd>
              {item.quantidadeLancada > 0 && (
                <>
                  <dt className="text-suave">Já lançado</dt>
                  <dd className="text-right tabular-nums">{item.quantidadeLancada}</dd>
                </>
              )}
            </dl>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Quantidade que chegou</span>
              <input
                autoFocus
                inputMode="numeric"
                value={quantidade}
                onChange={(evento) => setQuantidade(soDigitos(evento.target.value))}
                onKeyDown={(evento) => evento.key === "Enter" && valida.ok && !ocupado && lancar()}
                aria-invalid={!valida.ok}
                className="w-32 rounded-md border border-borda px-3 py-2 text-right text-lg font-semibold tabular-nums focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/20 aria-[invalid=true]:border-rose-500"
              />
              {!valida.ok && quantidade !== "" && <span className="mt-1 block text-xs text-rose-600">{valida.erro}</span>}
            </label>
            <p className="flex items-center gap-2 text-sm">
              <span className="text-suave">Saldo no Rise</span>
              <span className="tabular-nums">{item.estoqueAtual ?? "—"}</span>
              <ArrowRight size={14} className="text-suave" />
              <span className="font-semibold tabular-nums text-emerald-700">{depois}</span>
            </p>
            {erro && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{erro}</p>}
          </div>
        )}

        {!depositos && (
          <footer className="flex items-center justify-between gap-3 border-t border-borda px-5 py-3">
            <span className="text-xs text-suave">Grava a entrada no Rise e manda ao Bling agora.</span>
            <div className="flex gap-2">
              <button type="button" onClick={aoFechar} disabled={ocupado} className="rounded-md border border-borda px-3 py-2 text-sm hover:bg-fundo">
                Cancelar
              </button>
              <button
                type="button"
                onClick={lancar}
                disabled={!valida.ok || ocupado}
                className="inline-flex items-center gap-1.5 rounded-md bg-acento px-3.5 py-2 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-acento/90 active:scale-[0.97] disabled:opacity-50"
              >
                {ocupado && <Loader2 size={15} className="animate-spin" />}
                <span className="whitespace-nowrap">{ocupado ? "Lançando…" : "Lançar no Bling"}</span>
              </button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader, X } from "lucide-react";

import { aceitarDivergenciaAcao } from "@/app/pedidos/acoes";
import { CODIGO_DE_CONFERENCIA } from "@/lib/codigoDeConferencia";
import { propsDoFundo } from "@/lib/fundoDaJanela";

/**
 * "Aceitar divergência" da aba Lucro (pedido do dono em 09/11/2026: "um botao para aceitar a divergencia para sair o !; esse
 * botao exige senha igual tem hoje para validar produto"). A janela e a do Conferido do produto, com o mesmo codigo. Aceita, o
 * "!" sai; se o lucro estimado, o real ou o que o Mercado Pago creditou mudar depois, ele volta (regra no servidor).
 */
export default function AceitarDivergencia({ pedidoId }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState(null);
  const [pendente, iniciarTransicao] = useTransition();

  function fechar() {
    setAberto(false);
    setCodigo("");
    setErro(null);
  }

  function confirmar(evento) {
    evento.preventDefault();
    if (codigo.trim() !== CODIGO_DE_CONFERENCIA) {
      setErro("Código incorreto.");
      return;
    }
    iniciarTransicao(async () => {
      const resultado = await aceitarDivergenciaAcao(pedidoId);
      if (!resultado?.ok) {
        setErro(resultado?.erro ?? "Não foi possível aceitar.");
        return;
      }
      fechar();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo focus-visible:outline-2 focus-visible:outline-acento"
      >
        Aceitar divergência
      </button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 text-left" {...propsDoFundo(fechar)}>
          <form
            onSubmit={confirmar}
            role="dialog"
            aria-modal="true"
            aria-label="Aceitar divergência"
            className="w-full max-w-sm overflow-hidden rounded-lg border border-borda bg-superficie shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-borda p-3">
              <span className="text-sm font-semibold">Aceitar a divergência do lucro</span>
              <button type="button" onClick={fechar} aria-label="Cancelar" className="rounded p-1 text-suave hover:bg-fundo">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2 p-3 text-sm">
              <label className="block text-xs text-suave" htmlFor={`codigo-divergencia-${pedidoId}`}>
                Digite o código para continuar
              </label>
              <input
                id={`codigo-divergencia-${pedidoId}`}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={codigo}
                onChange={(evento) => {
                  setCodigo(evento.target.value);
                  setErro(null);
                }}
                aria-invalid={Boolean(erro)}
                className={`w-full rounded border bg-superficie px-2.5 py-1.5 ${erro ? "border-red-500" : "border-borda"}`}
              />
              {erro && <p className="text-xs text-red-700">{erro}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-borda p-3">
              <button type="button" onClick={fechar} disabled={pendente} className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pendente}
                className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {pendente && <Loader size={13} className="animate-spin" />}
                Aceitar
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

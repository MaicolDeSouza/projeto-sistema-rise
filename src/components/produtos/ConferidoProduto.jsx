"use client";

import { propsDoFundo } from "@/lib/fundoDaJanela";
import { useState, useTransition } from "react";
import { Loader, Square, SquareCheckBig, X } from "lucide-react";

import { alternarConferido } from "@/app/produtos/acoes";

// Provisorio, a pedido do dono: o codigo real vem depois. Fica no cliente de
// proposito, e so um controle interno de conferencia, nao uma protecao.
const CODIGO_PROVISORIO = "123";

/**
 * Marca "produto totalmente conferido" — controle interno do dono. Clicar abre
 * um popup que pede o codigo; so com o codigo certo a marca alterna.
 *
 * Grava no banco (pedido do dono em 22/09/2026, `Produto.conferido`): antes
 * vivia so na tela e sumia ao recarregar, o que impedia contar "quantos ja
 * foram verificados" de verdade. `produto.conferido` e o valor vindo do
 * servidor; o clique confirma no popup e so entao chama a acao.
 */
export default function ConferidoProduto({ produto }) {
  const conferido = produto.conferido;
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState(false);
  const [pendente, iniciarTransicao] = useTransition();

  function abrir() {
    setCodigo("");
    setErro(false);
    setAberto(true);
  }

  function confirmar(evento) {
    evento.preventDefault();
    if (codigo.trim() !== CODIGO_PROVISORIO) {
      setErro(true);
      return;
    }
    iniciarTransicao(async () => {
      await alternarConferido(produto.id, !conferido);
      setAberto(false);
    });
  }

  const rotulo = conferido
    ? `Conferido: ${produto.tituloBase}`
    : `Marcar como conferido: ${produto.tituloBase}`;

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label={rotulo}
        title={conferido ? "Conferido" : "Marcar como conferido"}
        className={`rounded p-1 transition hover:bg-fundo ${
          conferido ? "text-emerald-600" : "text-suave hover:text-texto"
        }`}
      >
        {conferido ? <SquareCheckBig size={20} /> : <Square size={20} />}
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 text-left"
          {...propsDoFundo(() => setAberto(false))}
        >
          <form
            onSubmit={confirmar}
            role="dialog"
            aria-modal="true"
            aria-label="Código de conferência"
            className="w-full max-w-sm overflow-hidden rounded-lg border border-borda bg-superficie shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-borda p-3">
              <span className="text-sm font-semibold">
                {conferido ? "Desmarcar conferência" : "Marcar como conferido"}
              </span>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Cancelar"
                className="rounded p-1 text-suave hover:bg-fundo"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 p-3 text-sm">
              <p className="truncate font-medium">{produto.tituloBase}</p>
              <label className="block text-xs text-suave" htmlFor={`codigo-${produto.id}`}>
                Digite o código para continuar
              </label>
              <input
                id={`codigo-${produto.id}`}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={codigo}
                onChange={(evento) => {
                  setCodigo(evento.target.value);
                  setErro(false);
                }}
                aria-invalid={erro}
                className={`w-full rounded border bg-superficie px-2.5 py-1.5 ${
                  erro ? "border-red-500" : "border-borda"
                }`}
              />
              {erro && <p className="text-xs text-red-700">Código incorreto.</p>}
            </div>

            <div className="flex justify-end gap-2 border-t border-borda p-3">
              <button
                type="button"
                onClick={() => setAberto(false)}
                disabled={pendente}
                className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pendente}
                className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {pendente && <Loader size={13} className="animate-spin" />}
                Confirmar
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

import { criarPedidoAcao } from "@/app/compras/acoes";
import { propsDoFundo } from "@/lib/fundoDaJanela";

const semAcento = (texto) => String(texto ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** "Novo pedido": escolher o fornecedor. Se ele ja tem rascunho, abre o rascunho (um por fornecedor). */
export default function JanelaNovoPedido({ fornecedores, aoFechar }) {
  const router = useRouter();
  const [procura, setProcura] = useState("");
  const [erro, setErro] = useState(null);
  const [escolhido, setEscolhido] = useState(null);
  const [, iniciar] = useTransition();

  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  const lista = useMemo(() => {
    const termo = semAcento(procura.trim());
    return termo ? fornecedores.filter((fornecedor) => semAcento(fornecedor.nome).includes(termo)) : fornecedores;
  }, [fornecedores, procura]);

  function escolher(fornecedor) {
    setEscolhido(fornecedor.id);
    setErro(null);
    iniciar(async () => {
      const resposta = await criarPedidoAcao(fornecedor.id);
      if (!resposta?.ok) {
        setEscolhido(null);
        setErro(resposta?.erro ?? "Não foi possível criar o pedido.");
        return;
      }
      router.push(`/compras/pedidos/${resposta.pedidoId}`);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 pt-[10vh]" {...propsDoFundo(() => aoFechar())}>
      <section role="dialog" aria-modal="true" aria-labelledby="novo-pedido-titulo" className="flex max-h-[70vh] w-full max-w-md flex-col rounded-lg border border-borda bg-superficie shadow-2xl">
        <header className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="novo-pedido-titulo" className="font-semibold">Novo pedido de compra</h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
            <X size={18} />
          </button>
        </header>
        <div className="border-b border-borda p-3">
          <label className="flex items-center gap-2 rounded-md border border-borda px-2.5 focus-within:border-acento focus-within:ring-2 focus-within:ring-acento/20">
            <Search size={15} className="text-suave" />
            <input
              autoFocus
              value={procura}
              onChange={(evento) => setProcura(evento.target.value)}
              placeholder="Fornecedor"
              aria-label="Procurar fornecedor"
              className="w-full py-2 text-sm outline-none"
            />
          </label>
          {erro && <p className="mt-2 text-sm text-rose-600">{erro}</p>}
        </div>
        <ul className="overflow-y-auto py-1">
          {lista.length === 0 && <li className="px-4 py-6 text-center text-sm text-suave">Nenhum fornecedor com esse nome.</li>}
          {lista.map((fornecedor) => (
            <li key={fornecedor.id}>
              <button
                type="button"
                disabled={escolhido !== null}
                onClick={() => escolher(fornecedor)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-fundo disabled:opacity-60"
              >
                <span className="truncate">{fornecedor.nome}</span>
                {escolhido === fornecedor.id ? (
                  <Loader2 size={15} className="animate-spin text-suave" />
                ) : (
                  fornecedor.rascunho && <span className="shrink-0 text-xs text-sky-700">tem rascunho</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

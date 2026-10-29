"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { propsDoFundo } from "@/lib/fundoDaJanela";

/**
 * A celula "Produtos" da lista de pedidos de compra (pedido do dono em 29/10/2026): um produto mostra o nome e o codigo
 * do Rise; varios mostram "N produtos", que abre a janela com todos (nome e codigo).
 */
export default function ProdutosDoPedido({ codigo, produtos }) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return undefined;
    const fechar = (evento) => evento.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberto]);

  if (!produtos?.length) return <span className="text-suave">—</span>;
  if (produtos.length === 1) {
    const [produto] = produtos;
    return (
      <span className="block min-w-0 truncate" title={`${produto.sku} · ${produto.nome}`}>
        {produto.nome} <span className="font-mono text-xs text-suave">{produto.sku}</span>
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={(evento) => {
          evento.stopPropagation();
          setAberto(true);
        }}
        className="rounded px-1.5 py-0.5 text-sm font-medium text-acento hover:bg-acento/5 hover:underline"
      >
        {produtos.length} produtos
      </button>
      {aberto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4" onClick={(evento) => evento.stopPropagation()} {...propsDoFundo(() => setAberto(false))}>
          <div role="dialog" aria-modal="true" aria-labelledby="produtos-do-pedido" className="w-full max-w-lg rounded-lg bg-superficie shadow-xl">
            <div className="flex items-center justify-between border-b border-borda px-4 py-3">
              <h2 id="produtos-do-pedido" className="font-semibold">
                Produtos de {codigo} ({produtos.length})
              </h2>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="rounded p-1.5 text-suave hover:bg-fundo hover:text-texto">
                <X size={16} />
              </button>
            </div>
            <ul className="max-h-[60vh] divide-y divide-borda overflow-y-auto">
              {produtos.map((produto) => (
                <li key={produto.sku} className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
                  <span className="w-24 shrink-0 font-mono text-xs text-suave">{produto.sku}</span>
                  <span className="min-w-0 flex-1">{produto.nome}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

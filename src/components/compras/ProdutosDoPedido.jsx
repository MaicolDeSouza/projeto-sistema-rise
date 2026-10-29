"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

import { propsDoFundo } from "@/lib/fundoDaJanela";

/**
 * As colunas Codigo, Produto e Quantidade da lista de pedidos de compra (pedido do dono em 29/10/2026). Um produto:
 * o codigo, o nome e a quantidade dele. Varios: "Diversos" no codigo e na quantidade e "N produtos" no nome. Clicar em
 * qualquer uma das tres abre a janela com todos (codigo, nome e quantidade em colunas separadas).
 */
const celula = "block w-full min-w-0 truncate rounded px-1.5 py-0.5 text-left hover:bg-acento/5 hover:text-acento";

export function CelulaDoProduto({ produtos, coluna, aoAbrir }) {
  if (!produtos?.length) return <span className="text-suave">—</span>;
  const varios = produtos.length > 1;
  const [primeiro] = produtos;
  const texto =
    coluna === "codigo" ? (varios ? "Diversos" : primeiro.sku) : coluna === "quantidade" ? (varios ? "Diversos" : primeiro.quantidade) : varios ? `${produtos.length} produtos` : primeiro.nome;
  return (
    <button
      type="button"
      onClick={(evento) => {
        // O clique na linha abre o pedido; aqui abre so a janela dos produtos.
        evento.stopPropagation();
        aoAbrir();
      }}
      title={varios ? "Ver os produtos do pedido" : `${primeiro.sku} · ${primeiro.nome} · ${primeiro.quantidade}`}
      className={`${celula} ${coluna === "codigo" ? "font-mono text-xs" : ""} ${coluna === "quantidade" ? "text-right tabular-nums" : ""} ${varios && coluna !== "nome" ? "text-suave" : ""} ${varios && coluna === "nome" ? "font-medium text-acento" : ""}`}
    >
      {texto}
    </button>
  );
}

export function JanelaProdutosDoPedido({ codigo, produtos, aoFechar }) {
  useEffect(() => {
    const fechar = (evento) => evento.key === "Escape" && aoFechar();
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  const total = produtos.reduce((soma, produto) => soma + (Number(produto.quantidade) || 0), 0);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4" onClick={(evento) => evento.stopPropagation()} {...propsDoFundo(aoFechar)}>
      <div role="dialog" aria-modal="true" aria-labelledby="produtos-do-pedido" className="w-full max-w-2xl rounded-lg bg-superficie shadow-xl">
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="produtos-do-pedido" className="font-semibold">
            Produtos de {codigo}
          </h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded p-1.5 text-suave hover:bg-fundo hover:text-texto">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-borda bg-fundo text-left text-xs text-suave">
              <tr>
                <th className="w-32 px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="w-28 px-4 py-2 text-right font-medium">Quantidade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {produtos.map((produto) => (
                <tr key={produto.sku}>
                  <td className="px-4 py-2.5 font-mono text-xs">{produto.sku}</td>
                  <td className="px-4 py-2.5">{produto.nome}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{produto.quantidade}</td>
                </tr>
              ))}
            </tbody>
            {produtos.length > 1 && (
              <tfoot className="border-t border-borda text-sm">
                <tr>
                  <td className="px-4 py-2.5 text-suave" colSpan={2}>
                    {produtos.length} produtos
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{total}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

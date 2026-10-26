"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";

import { buscarItensAcao } from "@/app/compras/acoes";

/**
 * "+ Adicionar outro item": um campo so, que acha por nome, codigo do Rise e codigo ou nome no fornecedor do pedido.
 * Espera 300 ms depois da ultima tecla. Cada achado diz se tem vinculo com este fornecedor (entra com nome, codigo e
 * preco dele) ou nao (entra so com o nome do Rise; o resto a mao).
 */
export default function BuscaDeItem({ pedidoId, fornecedor, aoEscolher, aoFechar }) {
  const [texto, setTexto] = useState("");
  const [achados, setAchados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [escolhendo, setEscolhendo] = useState(null);
  const vez = useRef(0);

  useEffect(() => {
    const termo = texto.trim();
    if (termo.length < 2) return undefined;
    const minha = ++vez.current;
    const relogio = setTimeout(async () => {
      setBuscando(true);
      const lista = await buscarItensAcao(pedidoId, termo);
      if (minha !== vez.current) return;
      setAchados(Array.isArray(lista) ? lista : []);
      setBuscando(false);
    }, 300);
    return () => clearTimeout(relogio);
  }, [texto, pedidoId]);

  const curto = texto.trim().length < 2;

  async function escolher(achado) {
    setEscolhendo(achado.produtoId);
    await aoEscolher(achado);
    setEscolhendo(null);
  }

  return (
    <div className="mt-3 rounded-lg border border-acento/40 bg-acento/5 p-3">
      <div className="flex items-center gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-md border border-borda bg-superficie px-2.5 focus-within:border-acento focus-within:ring-2 focus-within:ring-acento/20">
          <Search size={15} className="text-suave" />
          <input
            autoFocus
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            onKeyDown={(evento) => evento.key === "Escape" && aoFechar()}
            placeholder={`Nome, código do Rise ou código na ${fornecedor}`}
            aria-label="Buscar produto para o pedido"
            className="w-full py-2 text-sm outline-none"
          />
          {buscando && <Loader2 size={15} className="animate-spin text-suave" />}
        </label>
        <button type="button" onClick={aoFechar} className="rounded-md px-3 py-2 text-sm text-suave hover:bg-fundo hover:text-texto">
          Fechar
        </button>
      </div>
      {!curto && (
        <ul className="mt-2 max-h-72 divide-y divide-borda overflow-y-auto rounded-md border border-borda bg-superficie">
          {achados.length === 0 && !buscando && <li className="px-3 py-4 text-center text-sm text-suave">Nada encontrado.</li>}
          {achados.map((achado) => (
            <li key={achado.produtoId} className="flex items-center gap-3 px-3 py-2">
              {achado.foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={achado.foto} alt="" className="h-9 w-9 rounded border border-borda object-cover" />
              ) : (
                <span className="h-9 w-9 rounded border border-dashed border-borda" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{achado.nome}</p>
                <p className="truncate text-xs text-suave">
                  <span className="font-mono">{achado.sku}</span>
                  {achado.vinculo ? ` · na ${fornecedor}: ${achado.vinculo.codigo ?? "sem código"}` : ` · sem vínculo com a ${fornecedor}`}
                </p>
              </div>
              {achado.jaNoPedido ? (
                <span className="text-xs text-suave">Já no pedido</span>
              ) : (
                <button
                  type="button"
                  disabled={escolhendo !== null}
                  onClick={() => escolher(achado)}
                  className="inline-flex items-center gap-1 rounded-md border border-borda px-2.5 py-1.5 text-xs font-semibold hover:border-acento hover:text-acento disabled:opacity-50"
                >
                  {escolhendo === achado.produtoId ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  Adicionar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { propsDoFundo } from "@/lib/fundoDaJanela";
import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, Loader, Search, X } from "lucide-react";

import { buscarItemColetadoPorCodigo } from "@/app/produtos/acoes";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const semCaixa = (texto) => String(texto ?? "").trim().toLocaleLowerCase("pt-BR");

/**
 * Escolhe o item exato coletado sem copiar o cadastro inteiro do produto.
 *
 * Com `fornecedor` (janela do fornecedor), a lupa RELE o banco e aplica sozinha quando o codigo tem um item so na lista
 * desse fornecedor (pedido do dono em 07/11/2026: "Ao clicar na lupa deve atualizar os dados novamente ... deveria
 * buscar no BD e atualizar"; o preco da Fortek estava velho e a lupa so abria uma lista sem preco, que parecia nao fazer
 * nada). Mais de um item, ou nenhum do fornecedor, abre a lista, agora com o preco de cada um.
 */
export default function BuscaColetadoPorCodigo({ codigo, tipo, aoEscolher, fornecedor = null }) {
  const [aberto, setAberto] = useState(false);
  const [resposta, setResposta] = useState(null);
  const [atualizado, setAtualizado] = useState(null);
  const [pendente, iniciarTransicao] = useTransition();
  const relogio = useRef(null);

  function buscar() {
    setResposta(null);
    setAtualizado(null);
    if (fornecedor === null) setAberto(true);
    iniciarTransicao(async () => {
      let achado;
      try {
        achado = await buscarItemColetadoPorCodigo(codigo, tipo);
      } catch {
        achado = { ok: false, erro: "Falha ao buscar o código." };
      }
      if (fornecedor !== null && achado.ok) {
        const doFornecedor = achado.itens.filter((item) => semCaixa(item.fonte) === semCaixa(fornecedor));
        const unico = doFornecedor.length === 1 ? doFornecedor[0] : !semCaixa(fornecedor) && achado.itens.length === 1 ? achado.itens[0] : null;
        if (unico) {
          aoEscolher(unico);
          setAtualizado(unico);
          clearTimeout(relogio.current);
          relogio.current = setTimeout(() => setAtualizado(null), 4000);
          return;
        }
      }
      setResposta(achado);
      setAberto(true);
    });
  }

  const dica = atualizado
    ? `Atualizado da lista de ${atualizado.fonte}${atualizado.preco == null ? "" : `: ${moeda.format(atualizado.preco)}`}`
    : fornecedor !== null ? "Atualizar pelo código (lê a lista do fornecedor de novo)" : "Buscar produto pelo código";

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={buscar}
        disabled={pendente}
        aria-label={dica}
        title={dica}
        className={`rounded border p-1.5 transition-colors hover:bg-fundo disabled:opacity-50 ${atualizado ? "border-emerald-500 text-emerald-600" : "border-borda text-acento"}`}
      >
        {pendente ? <Loader size={16} className="animate-spin" /> : atualizado ? <Check size={16} /> : <Search size={16} />}
      </button>
      {atualizado && (
        <span role="status" className="absolute top-full right-0 z-10 mt-1 whitespace-nowrap rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800 shadow-sm">
          {dica}
        </span>
      )}
      {aberto && createPortal(
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" role="presentation" {...propsDoFundo(() => setAberto(false))}>
        <div role="dialog" aria-modal="true" aria-label="Buscar produto pelo código" className="w-full max-w-md rounded border border-borda bg-superficie p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold">
            <span>Produtos com código {codigo || "—"}</span>
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar busca" className="rounded p-1 hover:bg-fundo"><X size={14} /></button>
          </div>
          {pendente && <p className="text-xs text-suave">Buscando...</p>}
          {resposta && !resposta.ok && <p className="text-xs text-red-700">{resposta.erro}</p>}
          {resposta?.ok && resposta.itens.length === 0 && <p className="text-xs text-suave">Nenhum produto coletado com este código.</p>}
          {resposta?.ok && resposta.itens.length > 0 && (
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {resposta.itens.map((item) => (
                <button key={item.id} type="button" onClick={() => { aoEscolher(item); setAberto(false); }} className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-fundo">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1"><span className="font-semibold">{item.fonte}</span> · {item.codigo || "sem código"}</span>
                    {item.preco != null && <span className="shrink-0 font-medium tabular-nums">{moeda.format(item.preco)}</span>}
                  </span>
                  <span className="block truncate text-suave" title={item.nome || undefined}>{item.nome || "Produto sem nome"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

import BotaoNaoAnunciar from "@/components/anuncios/BotaoNaoAnunciar";
import { propsDoFundo } from "@/lib/fundoDaJanela";

/**
 * O popup do icone da Shopee na lista de Produtos (27/10/2026). A Shopee ainda nao tem integracao: o popup existe so para o
 * botao "Não anunciar na Shopee" do rodape (pedido do dono: o botao mora no popup do canal, e o icone ganha o X vermelho).
 */
export default function JanelaShopee({ produto, marcado, aoFechar }) {
  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 text-left font-normal normal-case"
      {...propsDoFundo(() => aoFechar())}
    >
      <section role="dialog" aria-modal="true" aria-label="Shopee" className="w-full max-w-md rounded-lg border border-borda bg-superficie shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-borda px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Shopee</p>
            <p className="mt-0.5 truncate text-xs text-suave">
              <span className="font-mono">{produto.sku}</span> · {produto.tituloBase}
            </p>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
            <X size={16} />
          </button>
        </header>
        <p className="p-5 text-sm text-suave">A integração com a Shopee ainda não existe no Rise.</p>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-borda px-5 py-3">
          <BotaoNaoAnunciar produtoId={produto.id} canal="SHOPEE" marcado={marcado} />
          <button type="button" onClick={aoFechar} className="rounded-md border border-borda px-4 py-2 text-sm hover:bg-fundo">
            Fechar
          </button>
        </footer>
      </section>
    </div>
  );
}

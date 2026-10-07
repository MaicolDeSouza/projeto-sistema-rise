"use client";

import { useState, useTransition } from "react";
import { Check, Loader, Sparkles } from "lucide-react";

import { sugerirCategoriasLI } from "@/app/canais-de-venda/loja-integrada/acoes";
import MensagensDoCampo from "@/components/anuncios/ml/MensagensDoCampo";
import { comAncestrais } from "@/lib/canaisDeVenda/li/categorias";
import ArvoreDeCategorias from "./ArvoreDeCategorias";

async function chamar(acao, ...argumentos) {
  try {
    return await acao(...argumentos);
  } catch {
    return { ok: false, erro: "Não foi possível falar com o servidor. Tente de novo." };
  }
}

/**
 * Aba Categorias do anuncio da Loja Integrada: a arvore ao vivo da loja, varias por produto, com busca e
 * "Recarregar". A lista e lida pelo editor ao abrir (`contexto.categoriasDaLI`); os alertas (sem
 * categoria, categoria que sumiu da loja) moram aqui.
 *
 * "Sugerir com IA" (pedido do dono em 07/10/2026): a IA escolhe na arvore real da loja, pelo nome, marca
 * e descricao do produto. Nada e marcado ate "Marcar estas", que marca as sugeridas com as categorias-pai
 * (como os produtos estao marcados na loja) e mantem o que ja estava marcado.
 */
export default function AbaCategorias({ rascunho, contexto, alterar, problemas, recarregarCategorias }) {
  const [sugestoes, setSugestoes] = useState(null);
  const [erro, setErro] = useState(null);
  const [pensando, iniciar] = useTransition();
  const categorias = contexto.categoriasDaLI ?? null;
  const marcadas = rascunho.categorias ?? [];

  function sugerir() {
    setErro(null);
    iniciar(async () => {
      const resultado = await chamar(sugerirCategoriasLI, rascunho.produtoId, rascunho.titulo ?? "");
      if (resultado.ok) setSugestoes(resultado.sugestoes);
      else setErro(resultado.erro);
    });
  }

  function marcarSugeridas() {
    const novas = comAncestrais(
      sugestoes.map((sugestao) => sugestao.id),
      categorias ?? [],
    );
    alterar((atual) => ({ categorias: [...new Set([...(atual.categorias ?? []), ...novas])] }));
    setSugestoes(null);
  }

  const todasMarcadas = sugestoes?.length > 0 && sugestoes.every((sugestao) => marcadas.includes(sugestao.id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Categorias na loja</p>
        <button
          type="button"
          onClick={sugerir}
          disabled={pensando || !rascunho.produtoId || !categorias?.length}
          title={!categorias?.length ? "Espere a lista de categorias da loja carregar" : undefined}
          className="inline-flex items-center gap-1.5 rounded border border-dashed border-acento px-3 py-1.5 text-xs font-medium text-acento hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pensando ? <Loader size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {pensando ? "Pensando..." : sugestoes ? "Sugerir de novo com IA" : "Sugerir com IA"}
        </button>
      </div>

      {erro && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{erro}</p>}

      {sugestoes && sugestoes.length > 0 && (
        <section aria-label="Categorias sugeridas pela IA" className="rounded border border-violet-200 bg-violet-50/60 p-3">
          <p className="text-xs font-semibold text-violet-900">Sugestão da IA</p>
          <ul className="mt-1.5 space-y-1.5">
            {sugestoes.map((sugestao) => (
              <li key={sugestao.id} className="text-sm">
                <span className="font-medium">{sugestao.caminho}</span>
                {marcadas.includes(sugestao.id) && (
                  <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-emerald-700">
                    <Check size={12} />
                    já marcada
                  </span>
                )}
                {sugestao.motivo && <span className="block text-xs text-suave">{sugestao.motivo}</span>}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={marcarSugeridas}
              disabled={todasMarcadas}
              className="rounded bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Marcar estas
            </button>
            <button type="button" onClick={() => setSugestoes(null)} className="rounded border border-borda bg-white px-3 py-1.5 text-xs hover:bg-fundo">
              Descartar
            </button>
            <span className="text-[11px] text-suave">Marca também as categorias-pai e mantém as que já estão marcadas.</span>
          </div>
        </section>
      )}

      <ArvoreDeCategorias
        categorias={categorias}
        carregando={Boolean(contexto.carregandoCategorias)}
        erro={contexto.erroDasCategorias ?? null}
        aoRecarregar={recarregarCategorias}
        selecionadas={marcadas}
        aoMudar={(novas) => alterar({ categorias: novas })}
      />
      <MensagensDoCampo problemas={problemas} campo="categorias" />
    </div>
  );
}

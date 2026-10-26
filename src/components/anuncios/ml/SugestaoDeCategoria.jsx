"use client";

import { useState, useTransition } from "react";
import { Loader, Sparkles } from "lucide-react";

import { sugerirCategoriaML } from "@/app/canais-de-venda/mercado-livre/acoes";
import Badge from "@/components/ui/Badge";

/**
 * "Sugerir categoria" da aba Geral: o ML acha as categorias pelo titulo, a IA recomenda uma
 * quando ha varias, e sem nenhuma a IA pesquisa na internet termos melhores. Os codigos vem
 * sempre do ML. A sugestao nunca preenche sozinha: o dono clica em "Usar".
 */
export default function SugestaoDeCategoria({ rascunho, alterar, children = null }) {
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const [buscando, iniciarBusca] = useTransition();

  function sugerir() {
    setErro(null);
    iniciarBusca(async () => {
      let resposta;
      try {
        resposta = await sugerirCategoriaML(rascunho.produtoId, rascunho.titulo ?? "");
      } catch {
        resposta = { ok: false, erro: "Não foi possível falar com o servidor. Tente de novo." };
      }
      if (!resposta.ok) {
        setErro(resposta.erro);
        return;
      }
      setResultado(resposta);
    });
  }

  function usar(candidata) {
    alterar({ categoriaId: candidata.categoriaId, categoriaNome: candidata.nome });
    setResultado(null);
  }

  const botao = (
    <button
      type="button"
      onClick={sugerir}
      disabled={buscando}
      title="O Mercado Livre procura pelo título; a IA ajuda a escolher"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded border border-borda hover:bg-fundo disabled:opacity-50 ${children ? "h-10 px-3 text-sm" : "px-2.5 py-1.5 text-xs"}`}
    >
      {buscando ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
      {buscando ? "Buscando..." : "Sugerir categoria"}
    </button>
  );

  // Com `children` (o campo da categoria), o botao fica ao lado dele (26/10/2026, para caber a aba na janela).
  return (
    <div className={children ? "" : "mt-2"}>
      {children ? (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{children}</div>
          {botao}
        </div>
      ) : (
        botao
      )}
      {erro && <p className="mt-1 text-[11px] text-red-700">{erro}</p>}

      {resultado && (
        <div className="mt-2 rounded border border-borda bg-fundo p-2">
          {resultado.origem === "internet" && resultado.candidatas.length > 0 && (
            <p className="mb-1.5 text-[11px] text-suave">Encontrada pela pesquisa na internet.</p>
          )}
          {resultado.origem === "catalogo" && (
            <p className="mb-1.5 text-[11px] text-suave">A categoria que os anúncios do catálogo do ML usam.</p>
          )}
          {resultado.aviso && <p className="mb-1.5 text-[11px] text-amber-700">{resultado.aviso}</p>}
          <ul className="space-y-1.5">
            {resultado.candidatas.map((candidata) => (
              <li key={candidata.categoriaId} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  {candidata.caminho.join(" > ")} <span className="font-mono text-xs text-suave">{candidata.categoriaId}</span>
                </span>
                {candidata.recomendada && (
                  <span title={candidata.motivo ?? undefined}>
                    <Badge tom="sucesso">IA recomenda</Badge>
                  </span>
                )}
                {!candidata.folha && <Badge tom="alerta">não é final</Badge>}
                <button
                  type="button"
                  onClick={() => usar(candidata)}
                  className="rounded border border-borda bg-superficie px-2 py-1 text-xs hover:bg-fundo"
                >
                  Usar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

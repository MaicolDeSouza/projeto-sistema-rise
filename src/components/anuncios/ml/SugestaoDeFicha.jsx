"use client";

import { useState, useTransition } from "react";
import { Loader, Sparkles } from "lucide-react";

import { preencherFichaML } from "@/app/canais-de-venda/mercado-livre/acoes";

/**
 * "Preencher com IA" da ficha tecnica: a IA sugere valores para os atributos da categoria que estao
 * EM BRANCO (nunca troca o que o dono ja preencheu). As sugestoes vem marcadas numa lista, e so o
 * que continuar marcado entra no "Aplicar marcados". A pesquisa na internet custa mais e so roda
 * com a caixa marcada.
 */
export default function SugestaoDeFicha({ rascunho, alterar }) {
  const [internet, setInternet] = useState(false);
  const [sugestoes, setSugestoes] = useState(null);
  const [marcados, setMarcados] = useState(() => new Set());
  const [erro, setErro] = useState(null);
  const [gerando, iniciarGeracao] = useTransition();

  function preencher() {
    setErro(null);
    iniciarGeracao(async () => {
      let resposta;
      try {
        resposta = await preencherFichaML(rascunho.produtoId, { categoriaId: rascunho.categoriaId, atributos: rascunho.atributos ?? {}, internet });
      } catch {
        resposta = { ok: false, erro: "Não foi possível falar com o servidor. Tente de novo." };
      }
      if (!resposta.ok) {
        setErro(resposta.erro);
        return;
      }
      setSugestoes(resposta.sugestoes);
      setMarcados(new Set(resposta.sugestoes.map((sugestao) => sugestao.id)));
    });
  }

  function alternar(id) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function aplicar() {
    const escolhidos = Object.fromEntries(sugestoes.filter((sugestao) => marcados.has(sugestao.id)).map((sugestao) => [sugestao.id, sugestao.valor]));
    // Funcao: o dono pode ter digitado num atributo enquanto a IA respondia, e o dele vale.
    alterar((atual) => {
      const atuais = atual.atributos ?? {};
      const soEmBranco = Object.fromEntries(Object.entries(escolhidos).filter(([id]) => !String(atuais[id] ?? "").trim()));
      return { atributos: { ...atuais, ...soEmBranco } };
    });
    setSugestoes(null);
  }

  return (
    <div className="rounded border border-borda bg-fundo p-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={preencher}
          disabled={gerando}
          className="inline-flex items-center gap-1.5 rounded border border-borda bg-superficie px-2.5 py-1.5 text-xs hover:bg-fundo disabled:opacity-50"
        >
          {gerando ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {gerando ? "Preenchendo..." : "Preencher com IA"}
        </button>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <input type="checkbox" checked={internet} onChange={(evento) => setInternet(evento.target.checked)} className="h-3.5 w-3.5 accent-acento" />
          pesquisar na internet (custa mais)
        </label>
      </div>
      {erro && <p className="mt-2 text-[11px] text-red-700">{erro}</p>}

      {sugestoes && (
        <div className="mt-3">
          {sugestoes.length === 0 ? (
            <p className="text-sm text-suave">Nenhum atributo em branco que a IA consiga preencher.</p>
          ) : (
            <>
              <ul className="space-y-1">
                {sugestoes.map((sugestao) => (
                  <li key={sugestao.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={marcados.has(sugestao.id)} onChange={() => alternar(sugestao.id)} className="h-4 w-4 accent-acento" />
                      <span className="font-medium">{sugestao.nome}:</span> {sugestao.valor}
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={aplicar}
                  disabled={marcados.size === 0}
                  className="rounded bg-acento px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  Aplicar marcados
                </button>
                <button type="button" onClick={() => setSugestoes(null)} className="rounded border border-borda px-3 py-1.5 text-xs hover:bg-superficie">
                  Descartar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

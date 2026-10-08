"use client";

import { useState, useTransition } from "react";
import { Loader, Sparkles } from "lucide-react";

import { sugerirTitulosML } from "@/app/canais-de-venda/mercado-livre/acoes";
import { unidadesDaComposicao } from "@/lib/canaisDeVenda/composicao";

const CATEGORIA_ML = /^MLB\d+$/;

// O kit vai a IA so como texto: quantas unidades e o nome de cada item.
function kitDoRascunho(rascunho, produtos) {
  if (!rascunho.composicao) return null;
  const itens = Array.isArray(rascunho.composicao.itens) ? rascunho.composicao.itens : [];
  const unidades = unidadesDaComposicao(itens);
  return {
    unidades: Number.isInteger(unidades) && unidades > 0 ? unidades : 1,
    itens: itens.map((item) => String(produtos[item.produtoId]?.tituloBase ?? "").slice(0, 200)).filter(Boolean),
  };
}

/**
 * "Sugerir titulo" da aba Geral: ate 3 opcoes da IA no padrao da loja, com as palavras em alta da
 * categoria quando ela ja foi escolhida. Clicar numa opcao a poe no campo; nada muda sozinho.
 */
export default function SugestaoDeTitulo({ rascunho, contexto, alterar, limite }) {
  const [opcoes, setOpcoes] = useState(null);
  const [erro, setErro] = useState(null);
  const [gerando, iniciarGeracao] = useTransition();
  const categoriaId = CATEGORIA_ML.test(rascunho.categoriaId ?? "") ? rascunho.categoriaId : null;

  function sugerir() {
    setErro(null);
    iniciarGeracao(async () => {
      let resposta;
      try {
        resposta = await sugerirTitulosML(rascunho.produtoId, { categoriaId, kit: kitDoRascunho(rascunho, contexto.produtos) });
      } catch {
        resposta = { ok: false, erro: "Não foi possível falar com o servidor. Tente de novo." };
      }
      if (!resposta.ok) {
        setErro(resposta.erro);
        return;
      }
      setOpcoes(resposta.titulos);
    });
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={sugerir}
        disabled={gerando}
        title={categoriaId ? "A IA usa o padrão da loja e as palavras em alta da categoria" : "Com a categoria escolhida, a IA usa as palavras em alta"}
        className="inline-flex items-center gap-1.5 rounded border border-borda px-2.5 py-1.5 text-xs hover:bg-fundo disabled:opacity-50"
      >
        {gerando ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
        {gerando ? "Gerando..." : "Sugerir título"}
      </button>
      {erro && <p className="mt-1 text-[11px] text-red-700">{erro}</p>}
      {opcoes && (
        <ul className="mt-2 space-y-1">
          {opcoes.map((titulo) => (
            <li key={titulo}>
              <button
                type="button"
                onClick={() => alterar({ titulo })}
                className="flex w-full items-center justify-between gap-3 rounded border border-borda px-2.5 py-1.5 text-left text-sm hover:bg-fundo"
              >
                <span>{titulo}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-suave">
                  {titulo.length}/{limite}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

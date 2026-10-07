"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader, X } from "lucide-react";

import { abrirAnuncioLI, abrirNovoAnuncioLI, anuncioDoProdutoLI } from "@/app/canais-de-venda/loja-integrada/acoes";
import EditorAnuncioLI from "./EditorAnuncioLI";

async function chamar(acao, argumento) {
  try {
    return await acao(argumento);
  } catch {
    return { ok: false, erro: "Nao foi possivel falar com o servidor. Tente de novo." };
  }
}

/**
 * O editor do anuncio da Loja Integrada numa janela, aberto pelo pop-up do icone ("Editar anuncio").
 * Um anuncio por produto: sem anuncio abre um novo (nada e gravado ate o Salvar); com anuncio abre
 * esse. Produto nao Conferido mostra so o aviso. O editor desenha a propria janela (Esc, X, "Sair
 * sem salvar?"); aqui ficam as fases antes dele.
 */
export default function JanelaAnuncioLI({ produtoId, aoFechar, aoSalvar }) {
  const [fase, setFase] = useState("carregando");
  const [editor, setEditor] = useState(null);
  const [produto, setProduto] = useState(null);
  const [erro, setErro] = useState(null);
  const montada = useRef(false);

  const abrir = useCallback(async () => {
    const dono = await chamar(anuncioDoProdutoLI, produtoId);
    if (!montada.current) return;
    if (!dono.ok) {
      setErro(dono.erro);
      setFase("erro");
      return;
    }
    setProduto(dono.produto);
    if (!dono.produto.conferido) {
      setFase("naoConferido");
      return;
    }
    const aberto = dono.anuncioId ? await chamar(abrirAnuncioLI, dono.anuncioId) : await chamar(abrirNovoAnuncioLI, produtoId);
    if (!montada.current) return;
    if (!aberto.ok) {
      setErro(aberto.erro);
      setFase("erro");
      return;
    }
    setEditor({
      anuncioId: aberto.anuncioId ?? null,
      status: aberto.status,
      rascunho: aberto.rascunho,
      contexto: aberto.contexto,
      vinculo: aberto.vinculo ?? null,
    });
    setFase("editor");
  }, [produtoId]);

  useEffect(() => {
    montada.current = true;
    (async () => {
      await abrir();
    })();
    return () => {
      montada.current = false;
    };
  }, [abrir]);

  useEffect(() => {
    if (fase === "editor") return undefined;
    function aoTeclar(evento) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [fase, aoFechar]);

  if (fase === "editor" && editor) {
    return (
      <EditorAnuncioLI
        anuncioId={editor.anuncioId}
        rascunhoInicial={editor.rascunho}
        contextoInicial={editor.contexto}
        status={editor.status}
        vinculo={editor.vinculo}
        modo="janela"
        aoFechar={aoFechar}
        aoSalvar={(id) => aoSalvar?.(id)}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 text-left font-normal normal-case"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <section role="dialog" aria-modal="true" aria-label="Anuncio da Loja Integrada" className="w-full max-w-md rounded-lg border border-borda bg-superficie shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-borda px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Anuncio da Loja Integrada</p>
            {produto && (
              <p className="mt-0.5 truncate text-xs text-suave">
                <span className="font-mono">{produto.sku}</span> · {produto.tituloBase}
              </p>
            )}
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
            <X size={16} />
          </button>
        </header>
        <div className="p-5 text-sm">
          {fase === "carregando" && (
            <p className="flex items-center gap-2 text-suave">
              <Loader size={14} className="animate-spin" />
              Abrindo o anuncio...
            </p>
          )}
          {fase === "naoConferido" && <p className="text-amber-800">So produto Conferido vai para a Loja Integrada. Confira o cadastro do produto primeiro.</p>}
          {fase === "erro" && <p className="text-red-700">{erro}</p>}
        </div>
      </section>
    </div>
  );
}

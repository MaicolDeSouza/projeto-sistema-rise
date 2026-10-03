"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader, Plus, X } from "lucide-react";

import {
  abrirAnuncioML,
  abrirNovoAnuncioML,
  listarAnunciosDoProdutoML,
} from "@/app/canais-de-venda/mercado-livre/acoes";
import Badge from "@/components/ui/Badge";
import { ROTULO_DO_TIPO_ML, STATUS_ML } from "@/lib/canaisDeVenda/ml/rotulos";
import EditorAnuncioML from "./EditorAnuncioML";

/**
 * Pop-up aberto pelo icone do Mercado Livre na lista de Produtos. Mostra os anuncios ML do
 * produto e abre o editor (`modo="janela"`) sobre eles. Cada abertura monta a janela do zero:
 * quem a monta so a desmonta ao fechar, e o estado nasce de uma consulta nova ao banco.
 *
 * Fases: `carregando` (consulta em andamento), `naoConferido` (so o aviso), `lista`, `editor` e
 * `erro` (a lista nem carregou). Produto sem anuncio pula a lista e abre direto um anuncio novo.
 *
 * O editor desenha a propria janela (overlay, X, Esc e o aviso "Sair sem salvar?"); aqui fica so
 * o que e da lista. Esc e X, na lista ou no editor, fecham a janela inteira. Depois de salvar,
 * a janela volta a lista do produto, que e recarregada. O `key` do editor muda a cada abertura:
 * o estado dele nasce das props, e sem isso o anuncio anterior vazaria para o seguinte.
 *
 * Nenhuma escrita no Mercado Livre nem no Bling: as acoes gravam so no banco local, e a lista de
 * Produtos atras e atualizada pela revalidacao que elas mesmas fazem.
 */

// A acao ja devolve `{ ok: false }` para o que da errado no servidor; isto cobre a rede caindo.
async function chamar(acao, argumento) {
  try {
    return await acao(argumento);
  } catch {
    return { ok: false, erro: "Nao foi possivel falar com o servidor. Tente de novo." };
  }
}

function Moldura({ produto, aoFechar, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 text-left font-normal normal-case"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Anuncios do Mercado Livre"
        className="flex max-h-full w-full max-w-2xl flex-col rounded-lg border border-borda bg-superficie shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-borda px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Anuncios do Mercado Livre</p>
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
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </section>
    </div>
  );
}

const CLASSE_DO_AVISO = {
  erro: "border-red-200 bg-red-50 text-red-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

export default function JanelaAnuncioML({ produtoId, aoFechar }) {
  const [fase, setFase] = useState("carregando");
  const [produto, setProduto] = useState(null);
  const [anuncios, setAnuncios] = useState([]);
  const [editor, setEditor] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [erro, setErro] = useState(null);
  const abertura = useRef(0);
  // As respostas chegam depois de um await: se a janela foi fechada nesse meio tempo, nada a fazer.
  const montada = useRef(false);

  const carregarLista = useCallback(
    async (nota) => {
      const resultado = await chamar(listarAnunciosDoProdutoML, produtoId);
      if (!montada.current) return null;
      if (!resultado.ok) {
        setErro(resultado.erro);
        setFase("erro");
        return null;
      }
      setProduto(resultado.produto);
      setAnuncios(resultado.anuncios);
      setAviso(nota ?? null);
      setFase(resultado.produto.conferido ? "lista" : "naoConferido");
      return resultado;
    },
    [produtoId],
  );

  const abrirNovo = useCallback(async () => {
    setFase("carregando");
    const resultado = await chamar(abrirNovoAnuncioML, produtoId);
    if (!montada.current) return;
    if (!resultado.ok) {
      setAviso({ tipo: "erro", texto: resultado.erro });
      setFase("lista");
      return;
    }
    abertura.current += 1;
    setEditor({
      chave: `novo-${abertura.current}`,
      anuncioId: null,
      status: undefined,
      rascunho: resultado.rascunho,
      contexto: resultado.contexto,
    });
    setFase("editor");
  }, [produtoId]);

  const abrirExistente = useCallback(async (id) => {
    setFase("carregando");
    const resultado = await chamar(abrirAnuncioML, id);
    if (!montada.current) return;
    if (!resultado.ok) {
      setAviso({ tipo: "erro", texto: resultado.erro });
      setFase("lista");
      return;
    }
    abertura.current += 1;
    setEditor({
      chave: `${resultado.anuncioId}-${abertura.current}`,
      anuncioId: resultado.anuncioId,
      status: resultado.status,
      rascunho: resultado.rascunho,
      contexto: resultado.contexto,
    });
    setFase("editor");
  }, []);

  useEffect(() => {
    montada.current = true;
    (async () => {
      const lista = await carregarLista();
      // Produto Conferido sem nenhum anuncio: nao ha o que listar, abre direto o editor de um novo.
      if (lista?.produto.conferido && lista.anuncios.length === 0) await abrirNovo();
    })();
    return () => {
      montada.current = false;
    };
  }, [carregarLista, abrirNovo]);

  // O editor ouve o proprio Esc (e tem o aviso de alteracao nao salva): aqui so as outras fases.
  useEffect(() => {
    if (fase === "editor") return undefined;
    function aoTeclar(evento) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [fase, aoFechar]);

  // Volta a lista do produto, ja com o anuncio que acabou de ser salvo.
  function aoSalvar() {
    setFase("carregando");
    carregarLista({ tipo: "ok", texto: "Anuncio salvo." });
  }

  if (fase === "editor" && editor) {
    return (
      <EditorAnuncioML
        key={editor.chave}
        anuncioId={editor.anuncioId}
        rascunhoInicial={editor.rascunho}
        contextoInicial={editor.contexto}
        status={editor.status}
        modo="janela"
        aoSalvar={aoSalvar}
        aoFechar={aoFechar}
      />
    );
  }

  return (
    <Moldura produto={produto} aoFechar={aoFechar}>
      {fase === "carregando" && (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-suave" role="status">
          <Loader size={16} className="animate-spin" />
          Carregando...
        </p>
      )}

      {fase === "erro" && (
        <p role="alert" className={`rounded border px-3 py-2 text-sm ${CLASSE_DO_AVISO.erro}`}>
          {erro}
        </p>
      )}

      {fase === "naoConferido" && (
        <div className="space-y-3 text-sm">
          <p role="alert" className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            Este produto ainda nao foi Conferido. So produto Conferido vira anuncio.
          </p>
          <Link href={`/produtos/${produto.id}`} className="inline-block text-acento hover:underline">
            Abrir o cadastro do produto
          </Link>
        </div>
      )}

      {fase === "lista" && (
        <div className="space-y-3">
          {aviso && (
            <p role={aviso.tipo === "erro" ? "alert" : "status"} className={`rounded border px-3 py-2 text-sm ${CLASSE_DO_AVISO[aviso.tipo]}`}>
              {aviso.texto}
            </p>
          )}

          {anuncios.length === 0 ? (
            <p className="py-4 text-center text-sm text-suave">Este produto ainda nao tem anuncio no Mercado Livre.</p>
          ) : (
            <ul className="divide-y divide-borda rounded border border-borda">
              {anuncios.map((anuncio) => {
                const situacao = STATUS_ML[anuncio.status] ?? STATUS_ML.RASCUNHO;
                return (
                  <li key={anuncio.id}>
                    <button
                      type="button"
                      onClick={() => abrirExistente(anuncio.id)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-fundo"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {anuncio.titulo || <span className="text-suave italic">Sem titulo</span>}
                        </span>
                        <span className="block truncate font-mono text-xs text-suave">{anuncio.codigo}</span>
                      </span>
                      <span className="shrink-0 text-xs text-suave">{ROTULO_DO_TIPO_ML[anuncio.tipoAnuncio] ?? "-"}</span>
                      <Badge tom={situacao.tom}>{situacao.rotulo}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <button
            type="button"
            onClick={abrirNovo}
            className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={14} />
            Novo anuncio
          </button>
        </div>
      )}
    </Moldura>
  );
}

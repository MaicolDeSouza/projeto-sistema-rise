"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";

import { excluirConversaAcao, renomearConversaAcao } from "@/app/rise-ai/acoes";
import { propsDoFundo } from "@/lib/fundoDaJanela";

/** A janela do sistema: fundo escuro que só fecha com clique que começa e termina nele (`propsDoFundo`), e Esc fecha. */
function Janela({ titulo, aoFechar, children }) {
  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...propsDoFundo(aoFechar)}>
      <div role="dialog" aria-label={titulo} className="w-full max-w-md rounded-lg border border-borda bg-superficie p-5 shadow-xl">
        <h2 className="mb-3 text-base font-semibold">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

/**
 * Renomear e excluir a conversa aberta. A exclusão pergunta mostrando o TÍTULO e a DATA (regra do sistema: nunca um
 * "tem certeza?" que não deixa ver o que se está apagando) e leva as mensagens junto.
 *
 * @param {{ conversaId: string, titulo: string, criadaEm: string }} props
 */
export default function ControlesDaConversa({ conversaId, titulo, criadaEm }) {
  const router = useRouter();
  const [janela, setJanela] = useState(null); // "renomear" | "excluir" | null
  const [novoTitulo, setNovoTitulo] = useState(titulo);
  const [erro, setErro] = useState(null);
  const [pendente, iniciar] = useTransition();

  const fechar = () => {
    setJanela(null);
    setErro(null);
  };

  function renomear(evento) {
    evento.preventDefault();
    const dados = new FormData();
    dados.set("titulo", novoTitulo);
    iniciar(async () => {
      const resultado = await renomearConversaAcao(conversaId, dados);
      if (!resultado.ok) return setErro(resultado.erro);
      fechar();
      router.refresh();
    });
  }

  function excluir() {
    iniciar(async () => {
      const resultado = await excluirConversaAcao(conversaId);
      if (!resultado.ok) return setErro(resultado.erro);
      router.replace("/rise-ai");
    });
  }

  const data = new Date(criadaEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setNovoTitulo(titulo);
          setJanela("renomear");
        }}
        className="rounded-md p-1.5 text-suave hover:bg-fundo hover:text-texto"
        title="Renomear a conversa"
        aria-label="Renomear a conversa"
      >
        <Pencil size={15} />
      </button>
      <button type="button" onClick={() => setJanela("excluir")} className="rounded-md p-1.5 text-suave hover:bg-fundo hover:text-red-700" title="Excluir a conversa" aria-label="Excluir a conversa">
        <Trash2 size={15} />
      </button>

      {janela === "renomear" && (
        <Janela titulo="Renomear a conversa" aoFechar={fechar}>
          <form onSubmit={renomear} className="flex flex-col gap-3">
            <input
              autoFocus
              value={novoTitulo}
              onChange={(evento) => setNovoTitulo(evento.target.value)}
              maxLength={120}
              className="w-full rounded-md border border-borda bg-superficie px-3 py-2 text-sm"
              aria-label="Novo título"
            />
            {erro && <p className="text-xs text-red-700">{erro}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={fechar} className="rounded-md border border-borda px-3 py-1.5 text-sm text-suave hover:bg-fundo">
                Cancelar
              </button>
              <button type="submit" disabled={pendente || !novoTitulo.trim()} className="rounded-md bg-acento px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
                Salvar
              </button>
            </div>
          </form>
        </Janela>
      )}

      {janela === "excluir" && (
        <Janela titulo="Excluir a conversa?" aoFechar={fechar}>
          <p className="text-sm">
            <strong>{titulo}</strong>
            <br />
            <span className="text-suave">Criada em {data}. As mensagens e as avaliações dela serão apagadas. O conhecimento que nasceu dela continua guardado.</span>
          </p>
          {erro && <p className="mt-2 text-xs text-red-700">{erro}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={fechar} className="rounded-md border border-borda px-3 py-1.5 text-sm text-suave hover:bg-fundo">
              Cancelar
            </button>
            <button type="button" disabled={pendente} onClick={excluir} className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
              Excluir
            </button>
          </div>
        </Janela>
      )}
    </>
  );
}

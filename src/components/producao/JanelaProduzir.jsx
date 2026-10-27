"use client";

import { useState, useTransition } from "react";
import { Factory, Loader } from "lucide-react";

import { criarOrdemAcao } from "@/app/estoque/producao/acoes";
import { propsDoFundo } from "@/lib/fundoDaJanela";

/**
 * "Produzir" do cadastro (26/10/2026): pede a quantidade e cria a ordem ABERTA. Nada mexe no estoque aqui; a ordem
 * abre em outra aba (o cadastro pode ter alteracao nao salva). `motivo`: por que o botao esta desabilitado.
 */
export default function JanelaProduzir({ produtoId, nome, motivo = null }) {
  const [aberta, setAberta] = useState(false);
  const [quantidade, setQuantidade] = useState("1");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState(null);
  const [criando, iniciar] = useTransition();

  const fechar = () => {
    setAberta(false);
    setErro(null);
  };

  const criar = () =>
    iniciar(async () => {
      setErro(null);
      const resultado = await criarOrdemAcao(produtoId, { quantidade: Number(quantidade), observacao });
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      window.open(`/estoque/producao/${resultado.id}`, "_blank", "noopener");
      fechar();
    });

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        disabled={Boolean(motivo)}
        title={motivo ?? "Criar uma ordem de produção deste produto"}
        className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Factory size={15} />
        Produzir
      </button>
      {aberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...propsDoFundo(fechar)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-produzir"
            onKeyDown={(evento) => evento.key === "Escape" && fechar()}
            className="w-full max-w-md rounded-lg bg-superficie p-5 shadow-xl"
          >
            <h2 id="titulo-produzir" className="text-base font-semibold">
              Produzir
            </h2>
            <p className="mt-0.5 line-clamp-2 text-sm text-suave">{nome}</p>
            <label htmlFor="quantidade-a-produzir" className="mt-4 block text-sm font-semibold">
              Quantidade
            </label>
            <input
              id="quantidade-a-produzir"
              type="number"
              min="1"
              step="1"
              autoFocus
              value={quantidade}
              onChange={(evento) => setQuantidade(evento.target.value)}
              onKeyDown={(evento) => {
                if (["e", "E", "+", "-", ".", ","].includes(evento.key)) evento.preventDefault();
                // Enter aqui nao pode enviar o formulario do produto.
                if (evento.key === "Enter") {
                  evento.preventDefault();
                  criar();
                }
              }}
              className="mt-1 w-32 rounded border border-borda px-2.5 py-2 text-sm focus:border-acento focus:outline-none"
            />
            <label htmlFor="observacao-da-ordem" className="mt-3 block text-sm font-semibold">
              Observação
            </label>
            <textarea
              id="observacao-da-ordem"
              rows={2}
              maxLength={500}
              value={observacao}
              onChange={(evento) => setObservacao(evento.target.value)}
              className="mt-1 w-full rounded border border-borda px-2.5 py-2 text-sm focus:border-acento focus:outline-none"
            />
            {erro && <p className="mt-2 text-sm text-red-700">{erro}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={fechar} className="rounded border border-borda px-3 py-2 text-sm hover:bg-fundo">
                Cancelar
              </button>
              <button
                type="button"
                onClick={criar}
                disabled={criando}
                className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {criando && <Loader size={14} className="animate-spin" />}
                Criar ordem
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";

import { avaliarMensagemAcao } from "@/app/rise-ai/acoes";

/**
 * 👍 e 👎 de uma resposta (spec §5a.1): dois botões de ícone com 40 px de área, na barra da resposta. O 👎 ("Sinalizar erro")
 * abre, na própria linha, uma caixa para dizer o que estava errado: esse comentário é o que o dono lê na revisão da noite.
 * Quem avalia não corrige nada: a correção vira conhecimento só com a aprovação do dono.
 *
 * Devolve só pedaços para a barra (`BarraDaResposta`, que é um `flex-wrap`): os botões e, quando há o que dizer, a caixa e o
 * erro numa linha própria (`basis-full order-last`), para não empurrar os dados do modelo para baixo.
 *
 * @param {{ mensagem: { id: string, avaliacao: number | null, comentario: string | null } }} props
 */
export default function Avaliacao({ mensagem }) {
  const [avaliacao, setAvaliacao] = useState(mensagem.avaliacao);
  const [comentarioSalvo, setComentarioSalvo] = useState(mensagem.comentario);
  const [abrindo, setAbrindo] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState(null);
  const [pendente, iniciar] = useTransition();

  function enviar(valor, comentario = "") {
    const dados = new FormData();
    dados.set("avaliacao", String(valor));
    dados.set("comentario", comentario);
    iniciar(async () => {
      const resultado = await avaliarMensagemAcao(mensagem.id, dados);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      setErro(null);
      setAvaliacao(resultado.mensagem.avaliacao);
      setComentarioSalvo(resultado.mensagem.comentario);
      setAbrindo(false);
      setTexto("");
    });
  }

  const botao =
    "inline-flex h-10 w-10 items-center justify-center rounded-md border border-transparent transition-[background-color,border-color,opacity] duration-150 focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:opacity-60";

  return (
    <>
      <button
        type="button"
        disabled={pendente}
        onClick={() => enviar(avaliacao === 1 ? 0 : 1)}
        aria-pressed={avaliacao === 1}
        aria-label="Resposta boa"
        title="Resposta boa"
        className={`${botao} ${avaliacao === 1 ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "text-suave hover:bg-fundo"}`}
      >
        <ThumbsUp size={16} />
      </button>
      <button
        type="button"
        disabled={pendente}
        onClick={() => (avaliacao === -1 ? enviar(0) : setAbrindo((aberto) => !aberto))}
        aria-pressed={avaliacao === -1}
        aria-label={avaliacao === -1 ? "Tirar o sinal de erro" : "Sinalizar erro nesta resposta"}
        title={avaliacao === -1 ? "Sinalizada: clique para tirar" : "Sinalizar erro nesta resposta"}
        className={`${botao} ${avaliacao === -1 ? "border-red-300 bg-red-50 text-red-800" : "text-suave hover:bg-fundo"}`}
      >
        <ThumbsDown size={16} />
      </button>
      {avaliacao === -1 && comentarioSalvo && (
        <span className="max-w-xs truncate text-xs text-suave" title={comentarioSalvo}>
          “{comentarioSalvo}”
        </span>
      )}

      {abrindo && avaliacao !== -1 && (
        <div className="order-last basis-full rounded-md border border-borda bg-fundo p-2">
          <label htmlFor={`erro-${mensagem.id}`} className="mb-1 block text-xs font-medium text-texto">
            O que estava errado? (opcional)
          </label>
          <textarea
            id={`erro-${mensagem.id}`}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            rows={2}
            maxLength={500}
            className="w-full rounded-md border border-borda bg-superficie px-2 py-1 text-sm text-texto"
            placeholder="Ex.: indicou o Mega, caro demais para ligar um LED"
          />
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={pendente} onClick={() => enviar(-1, texto)} className="rounded-md bg-acento px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
              Enviar
            </button>
            <button type="button" onClick={() => setAbrindo(false)} className="rounded-md border border-borda px-3 py-1.5 text-xs text-suave hover:bg-superficie">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {erro && <p className="order-last basis-full text-xs text-red-700">{erro}</p>}
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";

import { avaliarMensagemAcao } from "@/app/rise-ai/acoes";

/**
 * 👍 e 👎 de uma resposta. O 👎 ("Sinalizar erro") abre uma caixa para dizer o que estava errado: esse comentário é o
 * que o dono lê na revisão da noite. Quem avalia não corrige nada: a correção vira conhecimento só com a aprovação
 * do dono (a sugestão de correção ao 👎 entra na Tarefa 12).
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

  const botao = "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition disabled:opacity-60";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pendente}
          onClick={() => enviar(avaliacao === 1 ? 0 : 1)}
          aria-pressed={avaliacao === 1}
          title="Resposta boa"
          className={`${botao} ${avaliacao === 1 ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-borda text-suave hover:bg-fundo"}`}
        >
          <ThumbsUp size={13} /> Boa
        </button>
        <button
          type="button"
          disabled={pendente}
          onClick={() => (avaliacao === -1 ? enviar(0) : setAbrindo((aberto) => !aberto))}
          aria-pressed={avaliacao === -1}
          title="Sinalizar erro nesta resposta"
          className={`${botao} ${avaliacao === -1 ? "border-red-300 bg-red-50 text-red-800" : "border-borda text-suave hover:bg-fundo"}`}
        >
          <ThumbsDown size={13} /> {avaliacao === -1 ? "Sinalizada (tirar)" : "Sinalizar erro"}
        </button>
        {avaliacao === -1 && comentarioSalvo && <span className="text-xs text-suave">“{comentarioSalvo}”</span>}
      </div>

      {abrindo && avaliacao !== -1 && (
        <div className="rounded-md border border-borda bg-fundo p-2">
          <label className="mb-1 block text-xs font-medium">O que estava errado? (opcional)</label>
          <textarea
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            rows={2}
            maxLength={500}
            className="w-full rounded-md border border-borda bg-superficie px-2 py-1 text-sm"
            placeholder="Ex.: indicou o Mega, caro demais para ligar um LED"
          />
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={pendente} onClick={() => enviar(-1, texto)} className="rounded-md bg-acento px-3 py-1 text-xs font-medium text-white disabled:opacity-60">
              Enviar
            </button>
            <button type="button" onClick={() => setAbrindo(false)} className="rounded-md border border-borda px-3 py-1 text-xs text-suave hover:bg-superficie">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {erro && <p className="text-xs text-red-700">{erro}</p>}
    </div>
  );
}

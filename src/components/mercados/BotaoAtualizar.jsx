"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader, RefreshCw } from "lucide-react";

import { atualizarTabelas, situacaoVarredura } from "@/app/mercados/acoes";

/// Ritmo da consulta de andamento. Uma varredura leva mais de uma hora, entao
/// nao ha por que perguntar de segundo em segundo.
const INTERVALO_MS = 4000;

/**
 * Dispara a varredura e acompanha o andamento.
 *
 * O botao ENFILEIRA, nao executa: varrer dez lojas leva mais de uma hora, o que
 * nao cabe numa requisicao HTTP e morreria no primeiro hot reload. Quem executa
 * e o worker, em processo separado.
 *
 * Este e o mesmo caminho do ciclo automatico de 24 horas — o botao so antecipa.
 * Nao existe "modo manual" com codigo proprio para divergir do automatico.
 */
export default function BotaoAtualizar({ fonteId, rotulo = "Atualizar dados" }) {
  const router = useRouter();
  const [pendente, iniciarTransicao] = useTransition();
  const [situacao, setSituacao] = useState(null);
  const [erro, setErro] = useState(null);

  const emAndamento = situacao?.emAndamento ?? false;

  // Consulta o andamento enquanto ha varredura correndo. O efeito so agenda e
  // limpa o relogio; o estado e definido dentro do callback, nao na renderizacao.
  useEffect(() => {
    if (!emAndamento) return;

    let vivo = true;
    const relogio = setInterval(async () => {
      const nova = await situacaoVarredura();
      if (!vivo) return;

      setSituacao(nova);
      // Terminou: recarrega a tela para a tabela mostrar o que foi coletado.
      if (!nova.emAndamento) router.refresh();
    }, INTERVALO_MS);

    return () => {
      vivo = false;
      clearInterval(relogio);
    };
  }, [emAndamento, router]);

  function disparar() {
    setErro(null);
    iniciarTransicao(async () => {
      const resultado = await atualizarTabelas(fonteId);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      setSituacao(await situacaoVarredura());
    });
  }

  const emCurso = situacao?.jobs?.find((job) => job.status === "PROCESSANDO");
  const percentual =
    emCurso?.total > 0 ? Math.round((emCurso.feitas / emCurso.total) * 100) : null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={disparar}
        disabled={pendente || emAndamento}
        className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pendente || emAndamento ? (
          <Loader size={16} className="animate-spin" />
        ) : (
          <RefreshCw size={16} />
        )}
        {emAndamento ? "Varredura em andamento" : rotulo}
      </button>

      {emCurso && (
        <p className="text-xs text-suave">
          {emCurso.fonteNome}: {emCurso.feitas}
          {emCurso.total > 0 && ` de ${emCurso.total}`}
          {percentual !== null && ` (${percentual}%)`}
        </p>
      )}

      {/*
        Sem este aviso, o pior caso da funcionalidade seria silencioso: o botao
        aceita o clique, o Job fica parado, e o operador espera sem saber que
        ninguem vai atender.
      */}
      {situacao?.semWorker && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            Nenhum worker pegou o trabalho. Rode{" "}
            <code className="rounded bg-amber-50 px-1">npm run worker</code> na pasta do
            projeto.
          </span>
        </p>
      )}

      {erro && <p className="text-xs text-red-700">{erro}</p>}

      {/*
        A coleta grava em JSON e a tabela desta tela ainda le do banco, entao
        esta linha e onde o operador ve o que a varredura rendeu. Dizer so
        "concluida" nao respondia a pergunta que ele tem: quantos vieram.
      */}
      {!emAndamento && !erro && situacao?.ultimo && (
        <p className="text-right text-xs text-suave">
          Ultima varredura: {situacao.ultimo.fonteNome} ·{" "}
          {situacao.ultimo.status === "CONCLUIDO"
            ? `${situacao.ultimo.produtos ?? 0} produto(s) em JSON`
            : `falhou${situacao.ultimo.erro ? `: ${situacao.ultimo.erro}` : ""}`}
        </p>
      )}
    </div>
  );
}

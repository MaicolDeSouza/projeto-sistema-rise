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
 * Este e o mesmo caminho do ciclo automatico de 30 dias — o botao so antecipa.
 * Nao existe "modo manual" com codigo proprio para divergir do automatico.
 */
export default function BotaoAtualizar({ fonteId, rotulo = "Atualizar dados" }) {
  const router = useRouter();
  const [pendente, iniciarTransicao] = useTransition();
  const [situacao, setSituacao] = useState(null);
  const [erro, setErro] = useState(null);

  const emAndamento = situacao?.emAndamento ?? false;

  /*
    PERGUNTA O ESTADO AO ABRIR A TELA, e nao so depois do clique.
    Sem isto, `situacao` nasce null e o botao se mostra ocioso mesmo com o
    worker varrendo: quem chega na tela no meio de uma varredura clica, leva a
    recusa em vermelho e conclui que a atualizacao falhou — quando ela esta
    correndo. Uma consulta na montagem faz o botao ja aparecer desabilitado,
    com o nome da fonte e o quanto falta.
  */
  useEffect(() => {
    let vivo = true;
    situacaoVarredura().then((nova) => {
      if (vivo) setSituacao(nova);
    });
    return () => {
      vivo = false;
    };
  }, []);

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

      /*
        "Ja ha uma varredura em andamento" NAO E ERRO — e a resposta certa, e o
        trabalho que o operador quer ja esta acontecendo. Mostrar em vermelho
        dizia o contrario e assustou o dono. Aqui a recusa vira estado: a tela
        troca para o andamento, com a fonte e o percentual, em vez de pintar uma
        linha de erro. Erro de verdade (fonte pausada, banco fora) continua em
        vermelho.
      */
      const nova = await situacaoVarredura();
      setSituacao(nova);

      if (!resultado.ok && !nova.emAndamento) setErro(resultado.erro);
    });
  }

  const emCurso = situacao?.jobs?.find((job) => job.status === "PROCESSANDO");
  /*
    O total e o que se SABIA do catalogo, e pode ser menor que o real: o sitemap
    do Eletrogate lista 500 enderecos e a varredura achou 2.000 produtos, e a tela
    dizia "2000 de 500 (400%)". Passou do total, o "de" e o percentual somem — o
    numero de produtos continua certo, a estimativa e que estava errada.
  */
  const dentroDoTotal = emCurso?.total > 0 && emCurso.feitas <= emCurso.total;
  const percentual = dentroDoTotal
    ? Math.round((emCurso.feitas / emCurso.total) * 100)
    : null;
  // Os que ainda nao comecaram. `jobs` ja vem so com PENDENTE e PROCESSANDO.
  const fila = situacao?.jobs?.filter((job) => job.status === "PENDENTE").length ?? 0;

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
        <p className="text-right text-xs text-suave">
          {emCurso.fonteNome}: {emCurso.feitas}
          {dentroDoTotal ? ` de ${emCurso.total}` : " produto(s)"}
          {percentual !== null && ` (${percentual}%)`}
          {/* Paginas abertas: mostra que a varredura anda mesmo sem produto novo. */}
          {emCurso.visitadas > 0 && ` · ${emCurso.visitadas.toLocaleString("pt-BR")} paginas`}
          {/*
            QUANTAS FONTES AINDA FALTAM. Sem isto, a tela mostra so a fonte da
            vez e a varredura parece quase pronta quando ainda tem cinco lojas
            na fila — e ha loja que pede 10s entre visitas, entao a espera real
            e de minutos. O numero e o que permite decidir entre esperar e
            voltar depois.
          */}
          {fila > 0 && (
            <span className="block">
              e mais {fila} fonte{fila > 1 ? "s" : ""} na fila
            </span>
          )}
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
            ? `${situacao.ultimo.produtos ?? 0} produto(s) gravado(s)`
            : `falhou${situacao.ultimo.erro ? `: ${situacao.ultimo.erro}` : ""}`}
        </p>
      )}
    </div>
  );
}

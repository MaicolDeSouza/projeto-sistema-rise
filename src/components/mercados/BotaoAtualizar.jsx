"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, Loader, Pause, Play, RefreshCw, X } from "lucide-react";

import { alternarPausaColeta, atualizarTabelas, situacaoVarredura } from "@/app/mercados/acoes";

/// Ritmo da consulta de andamento. Uma varredura leva mais de uma hora, entao
/// nao ha por que perguntar de segundo em segundo.
const INTERVALO_MS = 4000;

/// O teto de produtos por fonte (coletar.js). Total igual a ele nao e o tamanho do
/// catalogo — e a loja que nao publica quantos tem —, e "falta 11h38" calculado
/// sobre ele seria inventado.
const TETO_POR_FONTE = 20000;

/**
 * Dispara a varredura e acompanha o andamento.
 *
 * O botao ENFILEIRA, nao executa: varrer dez lojas leva mais de uma hora, o que
 * nao cabe numa requisicao HTTP e morreria no primeiro hot reload. Quem executa
 * e o worker, em processo separado.
 *
 * A coleta comeca por este botao; nao existe agendamento automatico.
 */
export default function BotaoAtualizar({ fonteId, rotulo = "Atualizar dados" }) {
  const router = useRouter();
  const [pendente, iniciarTransicao] = useTransition();
  const [situacao, setSituacao] = useState(null);
  const [erro, setErro] = useState(null);
  // A lista das lojas em varredura abre pelo botao de status (pedido do dono em
  // 16/09/2026): com cinco lojas ao mesmo tempo, as linhas sempre visiveis
  // empurravam a tela para baixo.
  const [statusAberto, setStatusAberto] = useState(false);
  const painel = useRef(null);

  // O painel abre alinhado ao botao e, se passar da borda direita da tela, recua
  // o que falta — antes da pintura, sem salto.
  useLayoutEffect(() => {
    const elemento = painel.current;
    if (!statusAberto || !elemento) return;
    elemento.style.left = "0px";
    const excesso = elemento.getBoundingClientRect().right - (window.innerWidth - 8);
    if (excesso > 0) elemento.style.left = `${-excesso}px`;
  }, [statusAberto]);

  const pausada = situacao?.pausada ?? false;
  const emAndamento = (situacao?.emAndamento ?? false) && !pausada;

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

  function alternarPausa() {
    setErro(null);
    iniciarTransicao(async () => {
      const resultado = await alternarPausaColeta();
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      setSituacao(await situacaoVarredura());
      router.refresh();
    });
  }

  /*
    AS VARREDURAS EM CURSO — ate cinco ao mesmo tempo, uma por loja (worker
    paralelo, 16/09/2026). Job largado por worker que parou de dar sinal nao entra:
    em 16/09 a tela mostrou "Smartkits: 881 de 3780" por quatro horas, com a loja
    largada e o worker varrendo outra.
  */
  // So quem esta varrendo AGORA: loja concluida sai da lista na consulta
  // seguinte (a fila so traz PENDENTE e PROCESSANDO), e a que espera a vez conta
  // como fila, embaixo.
  const emCurso =
    situacao?.jobs
      ?.filter((job) => job.status === "PROCESSANDO" && !job.largado)
      .sort((a, b) => (a.iniciadoEm ?? 0) - (b.iniciadoEm ?? 0)) ?? [];
  // Os que ainda nao comecaram. O largado conta como fila: o worker o devolve a ela.
  const fila =
    situacao?.jobs?.filter((job) => job.status === "PENDENTE" || job.largado).length ?? 0;

  return (
    <div className="relative flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={disparar}
          disabled={pendente || emAndamento || pausada}
          className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendente || emAndamento ? (
            <Loader size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          {emAndamento ? "Varredura em andamento" : rotulo}
        </button>

        <button
          type="button"
          onClick={alternarPausa}
          disabled={pendente || situacao === null}
          className="inline-flex items-center gap-1.5 rounded border border-borda bg-superficie px-3 py-2 text-sm font-medium hover:bg-fundo disabled:opacity-60"
        >
          {pausada ? <Play size={16} /> : <Pause size={16} />}
          {pausada ? "Continuar" : "Pausar"}
        </button>

        {/* Status: quantas lojas estao sendo varridas, e a lista ao clicar. */}
        <button
          type="button"
          onClick={() => setStatusAberto((aberto) => !aberto)}
          title="Lojas em varredura"
          aria-label="Status das lojas em varredura"
          aria-expanded={statusAberto}
          className={`relative rounded border p-2 hover:bg-fundo ${
            emCurso.length > 0 ? "border-acento text-acento" : "border-borda text-suave"
          }`}
        >
          <Activity size={18} />
          {emCurso.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 rounded-full bg-acento px-1 text-[10px] leading-4 text-white">
              {emCurso.length}
            </span>
          )}
        </button>
      </div>

      {statusAberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setStatusAberto(false)} />
          <div
            ref={painel}
            className="absolute top-full left-0 z-40 mt-1 w-[34rem] max-w-[calc(100vw-1rem)] rounded-lg border border-borda bg-superficie p-3 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">
                Lojas em varredura
                {situacao?.worker && (
                  <span className="ml-1 font-normal text-suave">
                    ({emCurso.length} de {situacao.worker.paralelo} ao mesmo tempo)
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setStatusAberto(false)}
                aria-label="Fechar status"
                className="rounded p-1 text-suave hover:bg-fundo"
              >
                <X size={14} />
              </button>
            </div>

            {emCurso.length === 0 ? (
              <p className="text-sm text-suave">Nenhuma loja sendo varrida agora.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-left text-suave">
                  <tr>
                    <th className="pb-1 font-medium">Loja</th>
                    <th className="pb-1 text-right font-medium">Produtos</th>
                    <th
                      className="pb-1 text-right font-medium"
                      title="Segundos, em media, para coletar cada produto novo"
                    >
                      Seg/prod.
                    </th>
                    <th className="pb-1 text-right font-medium">Falta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {emCurso.map((job) => (
                    <LinhaDeVarredura key={job.id} job={job} />
                  ))}
                </tbody>
              </table>
            )}

            {/*
              QUANTAS FONTES AINDA FALTAM. Sem isto a varredura parece quase pronta
              quando ainda ha lojas na fila — e ha loja que pede 10 s entre visitas.
            */}
            {fila > 0 && (
              <p className="mt-2 text-xs text-suave">
                {fila} fonte{fila > 1 ? "s" : ""} esperando na fila
              </p>
            )}
          </div>
        </>
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
            Nenhum worker no ar. Rode{" "}
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
        <p className="text-left text-xs text-suave">
          Ultima varredura: {situacao.ultimo.fonteNome} ·{" "}
          {situacao.ultimo.status === "CONCLUIDO"
            ? `${situacao.ultimo.produtos ?? 0} produto(s) gravado(s)`
            : `falhou${situacao.ultimo.erro ? `: ${situacao.ultimo.erro}` : ""}`}
        </p>
      )}
    </div>
  );
}

/** 5400 s -> "1h30"; 240 s -> "4 min"; 40 s -> "< 1 min". */
function comoDuracao(segundos) {
  if (!(segundos > 0)) return null;
  if (segundos < 60) return "< 1 min";
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, "0")}`;
}

/**
 * Uma loja em varredura: produtos, paginas, segundos por produto e quanto falta.
 *
 * O total e o que se SABIA do catalogo, e pode ser menor que o real: o sitemap do
 * Eletrogate lista 500 enderecos e a varredura achou 2.000 produtos, e a tela dizia
 * "2000 de 500 (400%)". Passou do total, o "de" e o percentual somem.
 *
 * SEGUNDOS POR PRODUTO (pedido do dono em 16/09/2026) e o que explica a demora de
 * cada loja: o Eletrogate e a Impacto CNC pedem 10 s entre visitas, as outras 2 s.
 * Com o total conhecido ele vira a estimativa do que falta. So aparece depois de
 * dois produtos novos, medidos pelo worker — antes disso nao ha media honesta.
 */
function LinhaDeVarredura({ job }) {
  const dentroDoTotal = job.total > 0 && job.feitas <= job.total;
  const percentual = dentroDoTotal ? Math.round((job.feitas / job.total) * 100) : null;
  const totalConhecido = dentroDoTotal && job.total < TETO_POR_FONTE;
  const falta =
    totalConhecido && job.segundosPorProduto
      ? comoDuracao((job.total - job.feitas) * job.segundosPorProduto)
      : null;

  return (
    <tr>
      <td className="py-1.5 pr-2">
        {job.fonteNome}
        {job.retomados > 0 && (
          <span className="block text-[10px] text-suave">
            retomada: {job.retomados.toLocaleString("pt-BR")} ja gravados
          </span>
        )}
      </td>
      <td className="py-1.5 text-right tabular-nums whitespace-nowrap">
        {job.feitas.toLocaleString("pt-BR")}
        {totalConhecido && ` de ${job.total.toLocaleString("pt-BR")}`}
        {totalConhecido && <span className="text-suave"> ({percentual}%)</span>}
      </td>
      <td className="py-1.5 text-right tabular-nums">
        {job.segundosPorProduto
          ? job.segundosPorProduto.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
          : "—"}
      </td>
      <td className="py-1.5 text-right tabular-nums">{falta ?? "—"}</td>
    </tr>
  );
}

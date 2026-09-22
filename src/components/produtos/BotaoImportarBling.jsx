"use client";

import { useRef, useState, useTransition } from "react";
import { Download, Loader, Pause, Play, RotateCcw } from "lucide-react";

import { planejarImportacao, importarLote } from "@/app/produtos/acoes";

/**
 * Importacao completa do Bling em lotes: planeja uma vez (le o catalogo),
 * depois importa um lote de cada vez com barra de progresso. O usuario pode
 * pausar a qualquer momento; clicando de novo, retoma de onde parou.
 *
 * Fila fica no estado do cliente: nenhuma sessao no banco, leve, e respeita
 * retomas entre recarregos (no caso de reload do browser).
 */
export default function BotaoImportarBling() {
  const [pendente, iniciarTransicao] = useTransition();
  const [fila, setFila] = useState(null);
  const [comeco, setComeco] = useState(0);
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [resumo, setResumo] = useState({ importados: 0, falhas: 0 });

  // "Rodando" de verdade, lido dentro do laco assincrono: o estado `rodando`
  // (React) so atualiza no proximo desenho e o laco continuaria lendo o valor
  // antigo capturado no fechamento. O ref e o unico jeito confiavel de o
  // Pausa interromper o laco entre um lote e o proximo.
  const rodandoRef = useRef(false);

  function reiniciar() {
    rodandoRef.current = false;
    setFila(null);
    setComeco(0);
    setRodando(false);
    setResultado(null);
    setResumo({ importados: 0, falhas: 0 });
  }

  function planejar() {
    reiniciar();
    setResultado(null);
    iniciarTransicao(async () => {
      const r = await planejarImportacao();
      if (!r.ok) {
        setResultado({ ok: false, erro: r.erro });
      } else {
        setFila(r.fila);
        setComeco(0);
        setResumo({ importados: 0, falhas: 0 });
        setResultado(null);
        // `rodando` fica false: so o clique no play (abaixo) chama
        // importarProximo. Antes disto o estado nascia "true" (icone de Pausa)
        // sem nada rodando de verdade — o primeiro clique so pausava o que
        // nunca tinha comecado, e so o segundo clique disparava a importacao.
        setRodando(false);
      }
    });
  }

  /**
   * Laco de verdade: importa lote, aguarda, importa o proximo, ate o fim da
   * fila, um erro ou o Pausa (rodandoRef.current vira false). A versao
   * anterior encadeava so UM lote extra (uma unica chamada aninhada) e depois
   * parava sozinha, em silencio — sem erro, sem "Importacao completa" — porque
   * nunca havia um TERCEIRO passo escrito. Numa fila de 10 (os testes) isso
   * nunca apareceu: um lote so ja bastava. Numa fila de milhares, a
   * importacao parava aos 20 produtos.
   */
  function importarProximo() {
    rodandoRef.current = true;
    iniciarTransicao(async () => {
      let comecoAtual = comeco;
      let importadosAtual = resumo.importados;
      let falhasAtual = resumo.falhas;

      while (rodandoRef.current) {
        const r = await importarLote(fila, comecoAtual);
        if (!r.ok) {
          setResultado({ ok: false, erro: r.erro });
          rodandoRef.current = false;
          setRodando(false);
          return;
        }

        importadosAtual += r.importados.length;
        falhasAtual += r.falhas.length;
        comecoAtual = r.proximoComeco;
        setResumo({ importados: importadosAtual, falhas: falhasAtual });
        setComeco(comecoAtual);

        if (comecoAtual >= r.total) {
          setResultado({
            ok: true,
            final: true,
            importados: importadosAtual,
            falhas: falhasAtual,
            total: r.total,
            falhasDetalhes: r.falhas,
          });
          rodandoRef.current = false;
          setRodando(false);
          return;
        }
      }
    });
  }

  // Estado: sem fila (inicial)
  if (!fila) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={planejar}
          disabled={pendente}
          className="inline-flex items-center gap-1.5 rounded border border-acento bg-superficie px-3 py-2 text-sm font-medium text-acento hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendente ? (
            <Loader size={16} className="animate-spin" />
          ) : (
            <Download size={16} />
          )}
          {pendente ? "Planejando..." : "Importar do Bling"}
        </button>

        {resultado?.erro && (
          <p className="max-w-xs text-right text-xs text-red-700">
            {resultado.erro}
          </p>
        )}
      </div>
    );
  }

  // Estado: com fila, importando
  const porcentagem = fila.length > 0 ? Math.round((comeco / fila.length) * 100) : 0;

  return (
    <div className="flex flex-col items-end gap-2 w-full max-w-sm">
      <div className="flex w-full items-center gap-2">
        <div className="flex-1">
          <div className="mb-1 flex justify-between text-xs text-suave">
            <span>
              {comeco} de {fila.length} produtos
            </span>
            <span>{porcentagem}%</span>
          </div>
          <div className="h-2 w-full rounded-full border border-borda bg-fundo">
            <div
              className="h-full rounded-full bg-acento transition-all"
              style={{ width: `${porcentagem}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (rodando) {
              rodandoRef.current = false;
              setRodando(false);
            } else {
              setRodando(true);
              importarProximo();
            }
          }}
          disabled={pendente}
          className="rounded border border-acento bg-superficie px-2.5 py-1.5 text-sm font-medium text-acento hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendente ? (
            <Loader size={16} className="animate-spin" />
          ) : rodando ? (
            <Pause size={16} />
          ) : (
            <Play size={16} />
          )}
        </button>

        <button
          type="button"
          onClick={reiniciar}
          disabled={pendente}
          className="rounded border border-borda bg-superficie px-2.5 py-1.5 text-sm text-suave hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      <div className="max-w-xs text-right text-xs text-suave">
        <p>
          {resumo.importados} importado(s), {resumo.falhas} erro(s)
        </p>
      </div>

      {resultado?.final && (
        <div className="max-w-xs text-right text-xs">
          <p className="text-emerald-700 font-medium">
            ✓ Importacao completa
          </p>
          {resultado.falhasDetalhes?.map((falha) => (
            <p key={falha.id} className="text-red-700">
              ID {falha.id}: {falha.erro}
            </p>
          ))}
        </div>
      )}

      {resultado?.erro && (
        <p className="max-w-xs text-right text-xs text-red-700">
          {resultado.erro}
        </p>
      )}
    </div>
  );
}

"use client";

import { montarDescricaoML } from "@/lib/canaisDeVenda/ml/descricao";
import { montarPayloadML } from "@/lib/canaisDeVenda/ml/payload";
import { ABAS_ML } from "@/lib/canaisDeVenda/ml/validacao";

const CLASSE_DO_PROBLEMA = {
  bloqueante: "border-red-200 bg-red-50 text-red-800",
  alerta: "border-amber-200 bg-amber-50 text-amber-800",
};

// A previa nunca derruba a aba: o rascunho pode estar incompleto ou quebrado (e a validacao ao
// lado e justamente quem avisa disso). Sem JSON, a aba diz isso e segue mostrando o resto.
function jsonDoPayload(rascunho, contexto) {
  try {
    return JSON.stringify(montarPayloadML(rascunho, contexto), null, 2);
  } catch {
    return null;
  }
}

// Bloqueantes primeiro dentro de cada aba; a ordem de chegada se mantem entre iguais.
function agruparPorAba(problemas) {
  return ABAS_ML.map((aba) => {
    const dela = problemas.filter((problema) => problema.aba === aba.id);
    return { aba, problemas: [...dela.filter((p) => p.bloqueante), ...dela.filter((p) => !p.bloqueante)] };
  }).filter((grupo) => grupo.problemas.length > 0);
}

/**
 * Aba Previa e validacao: tudo que a validacao acusa, aba por aba (cada problema leva a aba que o
 * resolve), o que seria enviado ao Mercado Livre e o texto final da descricao. Nao publica: o
 * Publicar mora no rodape do editor e fica desligado ate a fase 3.
 *
 * `todosProblemas` e a lista inteira da validacao; as outras abas recebem so a delas.
 */
export default function AbaPrevia({ rascunho, contexto, irPara, todosProblemas }) {
  const grupos = agruparPorAba(todosProblemas);
  const bloqueantes = todosProblemas.filter((problema) => problema.bloqueante).length;
  const alertas = todosProblemas.length - bloqueantes;

  const json = jsonDoPayload(rascunho, contexto);
  const descricaoFinal = montarDescricaoML({ descricao: rascunho.descricao, frases: contexto.frases, versiculo: rascunho.versiculo });

  return (
    <div className="space-y-6">
      {bloqueantes > 0 ? (
        <p className="text-sm font-semibold text-red-700">
          {bloqueantes} problema(s) bloqueante(s) e {alertas} alerta(s)
        </p>
      ) : (
        <div>
          <p className="text-sm font-semibold text-emerald-700">Pronto para publicar quando a publicacao for ligada (fase 3).</p>
          {alertas > 0 && (
            <p className="mt-1 text-xs text-amber-700">
              {alertas} alerta(s) abaixo para conferir; eles nao impedem a publicacao.
            </p>
          )}
        </div>
      )}

      {grupos.map(({ aba, problemas }) => (
        <div key={aba.id}>
          <p className="text-sm font-semibold">{aba.rotulo}</p>
          <ul className="mt-2 space-y-2">
            {problemas.map((item, posicao) => (
              <li
                key={posicao}
                className={`flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm ${
                  CLASSE_DO_PROBLEMA[item.bloqueante ? "bloqueante" : "alerta"]
                }`}
              >
                <span className="min-w-0 flex-1">{item.problema}</span>
                <button
                  type="button"
                  onClick={() => irPara(aba.id)}
                  className="shrink-0 rounded border border-borda bg-superficie px-2 py-1 text-xs text-texto hover:bg-fundo"
                >
                  Ir para {aba.rotulo}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <details className="rounded border border-borda">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Dados que seriam enviados ao Mercado Livre</summary>
        {json === null ? (
          <p className="border-t border-borda px-3 py-2 text-sm text-amber-700">Nao foi possivel montar a previa.</p>
        ) : (
          <pre className="max-h-[32rem] overflow-auto border-t border-borda bg-fundo px-3 py-2.5 text-xs leading-relaxed">{json}</pre>
        )}
      </details>

      <div>
        <p className="text-sm font-semibold">Descricao final</p>
        <pre className="mt-2 max-h-[28rem] overflow-y-auto rounded border border-borda bg-fundo px-3 py-2.5 font-sans text-[15px] leading-relaxed break-words whitespace-pre-wrap">
          {descricaoFinal || <span className="text-suave">Sem descricao.</span>}
        </pre>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Loader } from "lucide-react";

import { validarNoMLAcao } from "@/app/canais-de-venda/mercado-livre/acoes";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
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
 * Publicar mora no rodape do editor.
 *
 * `todosProblemas` e a lista inteira da validacao; as outras abas recebem so a delas.
 */
/**
 * "Validar no ML" (fase 3): o validador de publicacoes do ML (`POST /items/validate`) confere o
 * anuncio GRAVADO sem criar nada. Sobe antes as fotos que faltam (ficam guardadas para o Publicar),
 * entao passa pela trava ML_PUBLICACAO como o Publicar.
 */
function ValidarNoML({ anuncioId, podeValidar }) {
  const [resultado, setResultado] = useState(null);
  const [validando, iniciar] = useTransition();

  function validar() {
    setResultado(null);
    iniciar(async () => {
      let lido;
      try {
        lido = await validarNoMLAcao(anuncioId);
      } catch {
        lido = { ok: false, erro: "Não foi possível falar com o servidor." };
      }
      setResultado(lido);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={validar}
          disabled={!podeValidar || validando}
          title={podeValidar ? undefined : "Salve o anúncio (sem alterações pendentes) antes de validar."}
          className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-50"
        >
          {validando && <Loader size={14} className="animate-spin" />}
          {validando ? "Validando..." : "Validar no ML"}
        </button>
        <BolhaDeAjuda
          variante="inline"
          texto="O validador do Mercado Livre confere o anúncio salvo sem criar nada. As fotos sobem ao ML nessa hora e ficam guardadas para a publicação. Depende da liberação ML_PUBLICACAO."
        />
      </div>
      {resultado?.ok && <p className="text-sm text-emerald-700">O Mercado Livre não apontou problema.</p>}
      {resultado && !resultado.ok && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {resultado.erro ?? (resultado.motivos ?? []).join(" ")}
        </p>
      )}
      {resultado?.avisos?.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800">
          {resultado.avisos.map((aviso, posicao) => (
            <li key={posicao}>{aviso}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AbaPrevia({ rascunho, contexto, irPara, todosProblemas, anuncioId, podeValidar }) {
  const grupos = agruparPorAba(todosProblemas);
  const bloqueantes = todosProblemas.filter((problema) => problema.bloqueante).length;
  const alertas = todosProblemas.length - bloqueantes;

  const json = jsonDoPayload(rascunho, contexto);
  const descricaoFinal = montarDescricaoML({ descricao: rascunho.descricao, frases: contexto.frases });
  const categoria = contexto.categoria && contexto.categoria.id === rascunho.categoriaId ? contexto.categoria : null;

  return (
    <div className="space-y-6">
      <p className="text-xs text-suave">
        Categoria: {categoria ? categoria.caminho.join(" > ") : "não lida no Mercado Livre"}
      </p>
      {bloqueantes > 0 ? (
        <p className="text-sm font-semibold text-red-700">
          {bloqueantes} problema(s) bloqueante(s) e {alertas} alerta(s)
        </p>
      ) : (
        <div>
          <p className="text-sm font-semibold text-emerald-700">
            Sem problemas na validação local. O validador do Mercado Livre roda como primeira etapa do Publicar.
          </p>
          {alertas > 0 && (
            <p className="mt-1 text-xs text-amber-700">
              {alertas} alerta(s) abaixo para conferir; eles não impedem a publicação.
            </p>
          )}
        </div>
      )}

      <ValidarNoML anuncioId={anuncioId} podeValidar={podeValidar} />

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
        <p className="border-t border-borda px-3 py-2 text-xs text-suave">
          O título vai como <code>family_name</code> (o Mercado Livre monta o título final), e o preço vai junto na criação. As fotos
          sobem antes e entram por id no lugar dos nomes abaixo.
        </p>
        {json === null ? (
          <p className="border-t border-borda px-3 py-2 text-sm text-amber-700">Não foi possível montar a prévia.</p>
        ) : (
          <pre className="max-h-[32rem] overflow-auto border-t border-borda bg-fundo px-3 py-2.5 text-xs leading-relaxed">{json}</pre>
        )}
      </details>

      <div>
        <p className="text-sm font-semibold">Descrição final</p>
        <pre className="mt-2 max-h-[28rem] overflow-y-auto rounded border border-borda bg-fundo px-3 py-2.5 font-sans text-[15px] leading-relaxed break-words whitespace-pre-wrap">
          {descricaoFinal || <span className="text-suave">Sem descrição.</span>}
        </pre>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { CircleCheck, ExternalLink, Loader } from "lucide-react";

import { validarNoMLAcao } from "@/app/canais-de-venda/mercado-livre/acoes";
import Badge from "@/components/ui/Badge";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { precisaAgirNoML, textoDoCatalogo, textoDoEstadoML } from "@/lib/canaisDeVenda/ml/estadoNoML";
import { montarPayloadML } from "@/lib/canaisDeVenda/ml/payload";
import { linkDoAnuncioML } from "@/lib/canaisDeVenda/ml/rotulos";
import { ABAS_ML } from "@/lib/canaisDeVenda/ml/validacao";
import SecaoDoAnuncio, { LinhaDeDado } from "./SecaoDoAnuncio";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dataHora = (valor) => (valor ? DATA_HORA.format(new Date(valor)).replace(",", " às") : null);

// A previa nunca derruba a aba: o rascunho pode estar incompleto. Sem JSON, a aba so nao mostra os dados.
function jsonDoPayload(rascunho, contexto) {
  try {
    return JSON.stringify(montarPayloadML(rascunho, contexto), null, 2);
  } catch {
    return null;
  }
}

/**
 * "Validar no ML": o validador de publicacoes do ML (`POST /items/validate`) confere o anuncio GRAVADO sem criar nada.
 * Sobe antes as fotos que faltam (ficam guardadas para o Publicar), entao passa pela trava ML_PUBLICACAO como o Publicar.
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
          className="inline-flex items-center gap-1.5 rounded border border-borda bg-superficie px-3 py-1.5 text-sm hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-50"
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

/** O que falta para publicar, uma linha por problema, os bloqueantes primeiro, cada um com o atalho para a aba dele. */
function OQueFalta({ problemas, irPara }) {
  const nomeDaAba = new Map(ABAS_ML.map((aba) => [aba.id, aba.rotulo]));
  const ordenados = [...problemas.filter((p) => p.bloqueante), ...problemas.filter((p) => !p.bloqueante)];
  return (
    <ul className="divide-y divide-borda rounded border border-borda">
      {ordenados.map((item, posicao) => (
        <li key={posicao} className="flex items-center gap-3 px-3 py-2 text-sm">
          <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.bloqueante ? "bg-red-500" : "bg-amber-500"}`} />
          <span className={`min-w-0 flex-1 ${item.bloqueante ? "text-texto" : "text-amber-800"}`}>{item.problema}</span>
          <button type="button" onClick={() => irPara(item.aba)} className="shrink-0 rounded px-1.5 py-0.5 text-xs text-acento hover:bg-fundo">
            {nomeDaAba.get(item.aba) ?? "Abrir"}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Aba Status (pedido do dono em 26/10/2026, no lugar da "Previa e validacao"; a primeira depois de Divergencias): o que
 * importa do anuncio num relance, em tres cartoes: no Mercado Livre (situacao, ID, catalogo, ultimo envio), no Bling (o
 * vinculo do estoque) e a publicacao (o que falta, so antes de publicar). Os dados enviados ao ML ficam recolhidos.
 */
export default function AbaStatus({ rascunho, contexto, irPara, todosProblemas, anuncioId, podeValidar, situacao }) {
  const { statusAtual, rotuloDoStatus, publicacao, idExterno, urlExterna } = situacao;
  const publicado = statusAtual === "PUBLICADO";
  const estado = publicacao?.estadoML ?? null;
  const link = linkDoAnuncioML(idExterno, urlExterna);
  const feitas = new Set(publicacao?.feitas ?? []);
  const vinculadoNoBling = feitas.has("vinculo") && feitas.has("registrar_bling");
  const bloqueantes = todosProblemas.filter((problema) => problema.bloqueante).length;
  const json = jsonDoPayload(rascunho, contexto);

  return (
    <div className="space-y-4">
      <SecaoDoAnuncio titulo="No Mercado Livre">
        <div className="rounded border border-borda px-3">
          {/* O titulo e o codigo do anuncio no topo (pedido do dono em 28/10/2026): no kit, o codigo do kit (900212_10). */}
          <LinhaDeDado rotulo="Título do anúncio">
            {String(rascunho.titulo ?? "").trim() || <span className="text-suave">Sem título</span>}
          </LinhaDeDado>
          <LinhaDeDado rotulo="Código">
            <span className="font-mono">
              {String(rascunho.composicao ? rascunho.composicao.codigo : (contexto.produtos?.[rascunho.produtoId]?.sku ?? "")).trim() || "—"}
            </span>
          </LinhaDeDado>
          <LinhaDeDado rotulo="Situação">
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge tom={rotuloDoStatus.tom}>{rotuloDoStatus.rotulo}</Badge>
              {publicado && estado?.status && (
                <span className={precisaAgirNoML(estado) ? "font-medium text-red-700" : "text-suave"}>
                  {textoDoEstadoML(estado)}
                  {estado.desde && ` desde ${dataHora(estado.desde)}`}
                </span>
              )}
            </span>
          </LinhaDeDado>
          <LinhaDeDado rotulo="ID do anúncio no ML">
            {link ? (
              <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-acento hover:underline">
                {idExterno} <ExternalLink size={12} />
              </a>
            ) : (
              <span className="text-suave">Ainda não publicado</span>
            )}
          </LinhaDeDado>
          <LinhaDeDado rotulo="Catálogo">{publicado ? textoDoCatalogo(estado?.catalogo) ?? <span className="text-suave">Ainda não lido</span> : <span className="text-suave">Depois de publicar</span>}</LinhaDeDado>
          <LinhaDeDado rotulo="Última sincronização">
            {publicado ? dataHora(publicacao?.enviado?.em ?? publicacao?.atualizadoEm) ?? <span className="text-suave">Sem registro</span> : <span className="text-suave">Nunca enviado</span>}
          </LinhaDeDado>
        </div>
      </SecaoDoAnuncio>

      <SecaoDoAnuncio titulo="No Bling" ajuda="O Bling é quem manda o estoque ao Mercado Livre: o Publicar vincula o produto e registra o anúncio no canal do ML no Bling.">
        <div className="rounded border border-borda px-3">
          <LinhaDeDado rotulo="Sincronizado com o Bling">
            {!publicado ? (
              <span className="text-suave">Depois de publicar</span>
            ) : vinculadoNoBling ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <CircleCheck size={14} aria-hidden="true" /> Sim, anúncio vinculado ao produto
              </span>
            ) : (
              <span className="font-medium text-red-700">Não: o anúncio não está vinculado no Bling</span>
            )}
          </LinhaDeDado>
          <LinhaDeDado rotulo="Estoque">
            {typeof estado?.estoque === "number" ? (
              <span className={typeof estado.estoqueBling === "number" && estado.estoque !== estado.estoqueBling ? "font-medium text-amber-700" : ""}>
                ML {estado.estoque}
                {typeof estado.estoqueBling === "number" && ` · Bling ${estado.estoqueBling}`}
              </span>
            ) : null}
          </LinhaDeDado>
        </div>
      </SecaoDoAnuncio>

      {!publicado && (
        <SecaoDoAnuncio titulo="Publicação">
          {bloqueantes === 0 ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <CircleCheck size={16} aria-hidden="true" /> Pronto para publicar
            </p>
          ) : (
            <p className="text-sm font-medium text-red-700">
              Falta resolver {bloqueantes} {bloqueantes === 1 ? "item" : "itens"} para publicar
            </p>
          )}
          {todosProblemas.length > 0 && (
            <div className="mt-3">
              <OQueFalta problemas={todosProblemas} irPara={irPara} />
            </div>
          )}
          <div className="mt-4">
            <ValidarNoML anuncioId={anuncioId} podeValidar={podeValidar} />
          </div>
        </SecaoDoAnuncio>
      )}

      {json !== null && (
        <details className="rounded-lg border border-borda bg-superficie">
          <summary className="cursor-pointer px-4 py-2 text-xs text-suave">Dados que vão ao Mercado Livre</summary>
          <pre className="max-h-[28rem] overflow-auto border-t border-borda bg-fundo px-4 py-2.5 text-xs leading-relaxed">{json}</pre>
        </details>
      )}
    </div>
  );
}

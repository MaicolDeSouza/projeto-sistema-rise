"use client";

import { useState } from "react";
import { ExternalLink, Loader, Plus } from "lucide-react";

import CabecalhoOrdenavel from "@/components/ui/CabecalhoOrdenavel";
import { ROTULO_DO_TIPO_ML } from "@/lib/canaisDeVenda/ml/rotulos";

/**
 * A lista dos anuncios que a conta do ML JA TEM para o SKU e que ainda nao sao do Rise (definicao 4 do dono em 08/11/2026):
 * aparece dentro da janela "Anuncios do Mercado Livre" quando o dono pede um anuncio novo de um produto sem anuncio no Rise
 * e a conta tem algum. O operador ve primeiro o que ja existe; a acao principal e Reaproveitar um deles (vira anuncio
 * PUBLICADO do Rise, sem escrever no ML); "Criar novo" e o caminho de sempre. Sem candidato a lista nem aparece.
 *
 * Ordena em memoria pelo cabecalho (titulo, preco, vendas), no mesmo ciclo das listas do Rise: nada -> crescente ->
 * decrescente -> nada. A ordem inicial e a da acao: ativos primeiro, depois quem vendeu mais.
 */

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const ESTADO = { active: "Ativo", paused: "Pausado", under_review: "Em revisão", inactive: "Inativo" };

function comparar(a, b, campo) {
  if (campo === "titulo") return String(a.titulo ?? "").localeCompare(String(b.titulo ?? ""), "pt-BR", { sensitivity: "base" });
  return Number(a[campo] ?? 0) - Number(b[campo] ?? 0);
}

export default function JanelaReaproveitarML({ sku, candidatos, ocupado = null, aoReaproveitar, aoCriarNovo }) {
  const [ordem, setOrdem] = useState({ ordenar: null, direcao: null });

  function aoClicar(campo) {
    setOrdem((atual) => {
      if (atual.ordenar !== campo) return { ordenar: campo, direcao: "asc" };
      if (atual.direcao === "asc") return { ordenar: campo, direcao: "desc" };
      return { ordenar: null, direcao: null };
    });
  }

  const linhas = ordem.ordenar
    ? [...candidatos].sort((a, b) => (ordem.direcao === "asc" ? 1 : -1) * comparar(a, b, ordem.ordenar))
    : candidatos;
  const cabecalho = (campo, rotulo, className = "") => (
    <CabecalhoOrdenavel campo={campo} rotulo={rotulo} ordenar={ordem.ordenar} direcao={ordem.direcao} aoClicar={aoClicar} className={className} />
  );

  return (
    <div className="space-y-3">
      <p className="text-sm">
        A conta já tem {candidatos.length === 1 ? "um anúncio" : `${candidatos.length} anúncios`} do código <span className="font-mono">{sku}</span>.
        Reaproveitar um deles o traz para o Rise como publicado, sem mexer no Mercado Livre.
      </p>
      <div className="overflow-x-auto rounded-md border border-borda">
        <table className="w-full text-left text-sm">
          <thead className="bg-fundo text-[11px] text-suave">
            <tr>
              <th className="px-3 py-2.5 font-medium uppercase">MLB</th>
              {cabecalho("titulo", "Título")}
              <th className="px-3 py-2.5 font-medium uppercase">Tipo</th>
              {cabecalho("preco", "Preço", "text-right")}
              {cabecalho("vendidos", "Vendas", "text-right")}
              <th className="px-3 py-2.5 font-medium uppercase">Estado</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {linhas.map((anuncio) => {
              const emCurso = ocupado === anuncio.id;
              return (
                <tr key={anuncio.id} className="align-middle">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                    {anuncio.link ? (
                      <a href={anuncio.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-acento hover:underline" title="Abrir o anúncio no Mercado Livre">
                        {anuncio.id}
                        <ExternalLink size={11} />
                      </a>
                    ) : (
                      anuncio.id
                    )}
                  </td>
                  <td className="max-w-[18rem] truncate px-3 py-2" title={anuncio.titulo}>
                    {anuncio.titulo}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-suave">
                    {ROTULO_DO_TIPO_ML[anuncio.tipoAnuncio] ?? anuncio.tipoAnuncio ?? ""}
                    {anuncio.freteGratis && <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-800">Frete grátis</span>}
                    {anuncio.catalogo && <span className="ml-1.5 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-800">Catálogo</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{Number.isFinite(anuncio.preco) ? MOEDA.format(anuncio.preco) : ""}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{anuncio.vendidos}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    <span className={`inline-flex items-center gap-1.5 ${anuncio.status === "active" ? "text-emerald-700" : "text-suave"}`}>
                      <span className={`h-2 w-2 rounded-full ${anuncio.status === "active" ? "bg-emerald-500" : "bg-slate-300"}`} aria-hidden="true" />
                      {ESTADO[anuncio.status] ?? anuncio.status ?? ""}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={ocupado !== null}
                      onClick={() => aoReaproveitar(anuncio.id)}
                      title="Traz este anúncio para o Rise como publicado; nada muda no Mercado Livre agora"
                      className="inline-flex items-center gap-1.5 rounded bg-acento px-2.5 py-1 text-xs font-medium text-white transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                    >
                      {emCurso && <Loader size={12} className="animate-spin" />}
                      Reaproveitar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          disabled={ocupado !== null}
          onClick={aoCriarNovo}
          className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm transition-[background-color,transform] duration-150 ease-out hover:bg-fundo active:scale-[0.98] disabled:opacity-50"
        >
          <Plus size={14} />
          Criar novo
        </button>
      </div>
    </div>
  );
}

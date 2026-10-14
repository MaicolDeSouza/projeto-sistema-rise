"use client";

import { Loader, RotateCcw } from "lucide-react";

/**
 * O aviso do rascunho automatico do cadastro (pedido do dono em 13/10/2026): ao abrir uma tela que tem alteracoes
 * nao salvas guardadas neste navegador, o dono escolhe entre recuperar e descartar. A acao principal e Recuperar; o
 * descarte e o secundario. So o que pede decisao fica escrito: o que expirou vai na dica.
 *
 * "Recuperar" espera as fotos do produto terminarem de carregar: o rascunho troca o painel de fotos, e trocar no meio
 * da carga misturaria as duas.
 */
function quando(iso) {
  const data = new Date(iso);
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const hoje = new Date();
  const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
  const mesmoDia = (a, b) => a.toDateString() === b.toDateString();
  if (mesmoDia(data, hoje)) return `hoje às ${hora}`;
  if (mesmoDia(data, ontem)) return `ontem às ${hora}`;
  return `${data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${hora}`;
}

export default function BannerDeRascunho({ rascunho, aguardando = false, aoRecuperar, aoDescartar }) {
  const dica = [
    "Este rascunho fica só neste navegador e some quando você salva ou cancela o cadastro.",
    rascunho.arquivosExpiraram ? "As fotos e os documentos enviados naquela época já expiraram e não voltam; o texto sim." : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      role="status"
      title={dica}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <span className="min-w-0 flex-1">
        <span className="font-semibold">Alterações não salvas deste cadastro, de {quando(rascunho.salvoEm)}.</span>
        {rascunho.produtoMudou && (
          <span className="block text-xs text-red-800">
            O produto foi alterado depois disso: recuperar sobrescreve o que mudou.
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={aoRecuperar}
        disabled={aguardando}
        title={aguardando ? "Esperando as fotos do produto carregarem..." : "Traz de volta o que você tinha digitado"}
        className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {aguardando ? <Loader size={14} className="animate-spin" /> : <RotateCcw size={14} />}
        Recuperar
      </button>
      <button
        type="button"
        onClick={aoDescartar}
        className="rounded border border-amber-400 px-3 py-1.5 text-sm hover:bg-amber-100"
      >
        Descartar
      </button>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { ExternalLink, FileText, PackageCheck } from "lucide-react";

import { marcarEmSeparacaoAcao } from "@/app/pedidos/acoes";

import { abrirNoCanal, linkNoBling, linkNoCanal } from "./formato";

const QUE_SEPARAM = new Set(["PAGO", "AGUARDANDO_PECAS", "EM_SEPARACAO"]);

/**
 * O rodape do pedido. A unica acao de estado e "Marcar em separação" (ou Desmarcar), em destaque; os links para o canal
 * e para o Bling ficam discretos; "Criar NF" fica desligado enquanto a trava NFE_EMISSAO estiver fechada.
 */
export default function RodapeDoPedido({ pedido, podeSeparar, nfeLigada }) {
  const [erro, setErro] = useState(null);
  const [ocupado, iniciar] = useTransition();
  const ligado = pedido.emSeparacao || pedido.status === "EM_SEPARACAO";
  const statusPermite = QUE_SEPARAM.has(pedido.status);
  const motivo = !podeSeparar ? "Sem permissão para marcar separação" : !statusPermite ? "Só um pedido pago pode entrar em separação" : undefined;
  const noCanal = linkNoCanal(pedido);
  const noBling = pedido.origem !== "BLING" ? linkNoBling(pedido) : null;
  const link = "inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-suave transition-colors hover:bg-fundo hover:text-texto";

  function alternar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await marcarEmSeparacaoAcao(pedido.id, !ligado);
      if (!resultado?.ok) setErro(resultado?.erro ?? "Não foi possível mudar.");
    });
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-1">
        {noCanal && (
          <a href={noCanal} target="_blank" rel="noreferrer" className={link}>
            <ExternalLink size={14} aria-hidden="true" /> {abrirNoCanal(pedido.origem)}
          </a>
        )}
        {noBling && (
          <a href={noBling} target="_blank" rel="noreferrer" className={link}>
            <ExternalLink size={14} aria-hidden="true" /> Abrir no Bling
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {erro && (
          <span role="alert" className="text-sm text-red-600">
            {erro}
          </span>
        )}
        <button
          type="button"
          disabled={!nfeLigada}
          title={nfeLigada ? "Disponível na próxima entrega" : "Emissão desligada (NFE_EMISSAO)"}
          className="inline-flex items-center gap-1.5 rounded-md border border-borda px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileText size={15} aria-hidden="true" /> Criar NF
        </button>
        <button
          type="button"
          onClick={alternar}
          disabled={Boolean(motivo) || ocupado}
          title={motivo}
          aria-pressed={ligado}
          className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold transition-[background-color,transform,opacity] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${
            ligado ? "border border-borda bg-superficie text-texto hover:bg-fundo" : "bg-acento text-white hover:bg-acento/90"
          }`}
        >
          <PackageCheck size={16} aria-hidden="true" />
          {ocupado ? "Salvando…" : ligado ? "Desmarcar separação" : "Marcar em separação"}
        </button>
      </div>
    </div>
  );
}

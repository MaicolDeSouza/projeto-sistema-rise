"use client";

import Image from "next/image";

import { CANAIS } from "@/lib/canais";

/**
 * O icone da Loja Integrada na coluna Canais da lista de Produtos, no molde do icone do Bling: a logo
 * COLORIDA quando o produto ja foi sincronizado e fosca quando nunca foi (ou nao e Conferido), e o
 * selo "!" quando o Rise mudou depois do ultimo envio ou o cadastro automatico parou numa etapa. O estado vem pronto do servidor
 * (`iconeLIDoProduto`, so do banco); nada aqui fala com a loja.
 */

const CANAL_LI = CANAIS.find((canal) => canal.id === "LOJA_INTEGRADA");

/** O estado em palavras: vai no nome acessivel e na dica (cor e selo sozinhos nao dizem nada). */
export function rotuloDoIconeLI({ cor, divergente, conferido, semBling, incompleto }) {
  if (!conferido) return "Loja Integrada: só Produto Conferido";
  const partes = [];
  // O cadastro automatico parou numa etapa (24/10/2026): vem primeiro, e o editor tem o "Completar o cadastro".
  if (incompleto) partes.push(`cadastro incompleto (parou em "${incompleto.rotulo}")`);
  // Sem Bling o icone fica cinza mesmo sincronizado: o Bling controla o estoque e os pedidos da LI.
  if (semBling) partes.push("sem vínculo com o Bling (estoque e pedidos não chegam)");
  else if (cor === "cinza") partes.push("nunca sincronizado");
  if (divergente) partes.push("divergência em campos");
  if (partes.length === 0) partes.push("em dia");
  return `Loja Integrada: ${partes.join(" e ")}`;
}

export default function IconeLojaIntegrada({ iconeLI, aoClicar }) {
  // Proposta de anuncio esperando o dono (spec 2026-10-23): o "P" no canto superior ESQUERDO, como no icone R.
  const rotulo = iconeLI.proposta ? `Loja Integrada: Proposta pronta, aguardando aprovação` : rotuloDoIconeLI(iconeLI);
  return (
    <button
      type="button"
      onClick={aoClicar}
      title={rotulo}
      aria-label={rotulo}
      className="relative shrink-0 rounded hover:ring-2 hover:ring-sky-200 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none"
    >
      <Image src={CANAL_LI.logo} alt="" width={22} height={22} className={`rounded ${iconeLI.cor === "verde" ? "" : "opacity-70 brightness-50 grayscale"}`} />
      {iconeLI.proposta && (
        <span
          aria-hidden="true"
          className="absolute -top-1.5 -left-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[9px] leading-none font-bold text-amber-950 ring-2 ring-superficie"
        >
          P
        </span>
      )}
      {(iconeLI.divergente || iconeLI.incompleto) && (
        <span
          aria-hidden="true"
          className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[10px] leading-none font-bold text-amber-950 ring-2 ring-superficie"
        >
          !
        </span>
      )}
    </button>
  );
}

"use client";

import Image from "next/image";

import { CANAIS } from "@/lib/canais";
import { textosDoAlertaNaLoja } from "@/lib/canaisDeVenda/li/alertaNaLoja";
import MarcaNaoAnunciar from "./MarcaNaoAnunciar";

/**
 * O icone da Loja Integrada na coluna Canais da lista de Produtos, no molde do icone do Bling: a logo
 * COLORIDA quando o produto ja foi sincronizado e fosca quando nunca foi (ou nao e Conferido), e o
 * selo "!" quando o Rise mudou depois do ultimo envio ou o cadastro automatico parou numa etapa. O estado vem pronto do servidor
 * (`iconeLIDoProduto`, so do banco); nada aqui fala com a loja.
 */

const CANAL_LI = CANAIS.find((canal) => canal.id === "LOJA_INTEGRADA");

/** O estado em palavras: vai no nome acessivel e na dica (cor e selo sozinhos nao dizem nada). */
export function rotuloDoIconeLI({ cor, divergente, conferido, semBling, incompleto, naLoja, fotosMudaram }) {
  if (!conferido) return "Loja Integrada: só Produto Conferido";
  const partes = [];
  // O cadastro automatico parou numa etapa (24/10/2026): vem primeiro, e o editor tem o "Completar o cadastro".
  if (incompleto) partes.push(`cadastro incompleto (parou em "${incompleto.rotulo}")`);
  // Sem Bling o icone fica cinza mesmo sincronizado: o Bling controla o estoque e os pedidos da LI.
  if (semBling) partes.push("sem vínculo com o Bling (estoque e pedidos não chegam)");
  else if (cor === "cinza") partes.push("nunca sincronizado");
  if (divergente) partes.push("divergência em campos");
  if (fotosMudaram) partes.push("fotos mudaram no produto");
  // O que o worker leu na loja (25/10/2026): campo mudado no painel, inativo, estoque diferente do Bling...
  partes.push(...textosDoAlertaNaLoja({ naLoja }));
  if (partes.length === 0) partes.push("em dia");
  return `Loja Integrada: ${partes.join(" e ")}`;
}

// `naoAnunciar` (27/10/2026): o produto foi marcado para nao ir a LI; o icone fica cinza com o X vermelho.
export default function IconeLojaIntegrada({ iconeLI, aoClicar, naoAnunciar = false }) {
  const rotulo = naoAnunciar ? "Loja Integrada: marcado para não anunciar" : rotuloDoIconeLI(iconeLI);
  return (
    <button
      type="button"
      onClick={aoClicar}
      title={rotulo}
      aria-label={rotulo}
      className="relative shrink-0 rounded hover:ring-2 hover:ring-sky-200 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none"
    >
      <Image src={CANAL_LI.logo} alt="" width={22} height={22} className={`rounded ${iconeLI.cor === "verde" && !naoAnunciar ? "" : "opacity-70 brightness-50 grayscale"}`} />
      {naoAnunciar && <MarcaNaoAnunciar />}
      {(iconeLI.divergente || iconeLI.incompleto || iconeLI.alertaNaLoja || iconeLI.fotosMudaram) && (
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

"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

/**
 * Parametros da URL depois de clicar numa coluna: nada -> crescente -> decrescente -> nada, e trocar de coluna sempre
 * comeca em crescente. Volta para a pagina 1: a posicao na lista so faz sentido na ordem que a gerou.
 * Usado pela lista de Produtos e pelo Scraper (pedido do dono em 23/10/2026: o mesmo filtro de coluna nas duas).
 */
export function parametrosDaOrdenacao(searchParams, campo, ordenar, direcao) {
  const params = new URLSearchParams(searchParams);

  if (ordenar !== campo) {
    params.set("ordenar", campo);
    params.set("direcao", "asc");
  } else if (direcao === "asc") {
    params.set("direcao", "desc");
  } else {
    params.delete("ordenar");
    params.delete("direcao");
  }
  // A forma antiga do Scraper (?ordem=menor) nao pode competir com a coluna.
  params.delete("ordem");
  params.delete("pagina");
  return params;
}

/**
 * Cabecalho clicavel de tabela. A ordem mora na URL (sobrevive a recarga e vai num link), e quem chama decide como
 * navegar (`aoClicar(campo)`).
 */
export default function CabecalhoOrdenavel({ campo, rotulo, ordenar, direcao, aoClicar, className = "" }) {
  const ativa = ordenar === campo;
  const Icone = !ativa ? ArrowUpDown : direcao === "asc" ? ArrowUp : ArrowDown;

  return (
    <th
      className={`px-3 py-2.5 font-medium ${className}`}
      aria-sort={ativa ? (direcao === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => aoClicar(campo)}
        title={!ativa ? "Ordenar por esta coluna" : direcao === "asc" ? "Crescente: clique para decrescente" : "Decrescente: clique para tirar a ordem"}
        className={`inline-flex items-center gap-1 uppercase hover:text-texto ${ativa ? "text-texto" : ""}`}
      >
        {rotulo}
        <Icone size={12} className={ativa ? "text-acento" : "text-suave"} />
      </button>
    </th>
  );
}

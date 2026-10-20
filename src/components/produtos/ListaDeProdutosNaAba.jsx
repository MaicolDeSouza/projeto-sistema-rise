"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { ArrowLeft } from "lucide-react";

import { guardarUltimaLista, lerUltimaLista } from "@/lib/ultimaListaDeProdutos";

/**
 * A lista de Produtos lembrada nesta aba (pedido do dono em 20/10/2026): a lista guarda o proprio endereco, e a seta do
 * cadastro volta para ele. Ver src/lib/ultimaListaDeProdutos.js.
 */

/** Invisivel, na lista: guarda a pesquisa, a pagina e a ordem atuais a cada mudanca. */
export function LembrarListaDeProdutos({ consulta }) {
  useEffect(() => {
    guardarUltimaLista(consulta);
  }, [consulta]);
  return null;
}

// O sessionStorage nao avisa mudanca: o endereco e lido ao desenhar, e o servidor desenha a lista limpa.
const naoAvisa = () => () => {};

/** O endereco da lista guardada (a lista limpa no servidor e na primeira pintura). */
export function useUltimaListaDeProdutos() {
  return useSyncExternalStore(naoAvisa, lerUltimaLista, () => "/produtos");
}

/** A seta do cabecalho do cadastro, no desenho do PageHeader, que volta para a lista como ela estava. */
export function SetaParaListaDeProdutos({ rotulo = "Voltar para produtos" }) {
  const endereco = useUltimaListaDeProdutos();
  return (
    <Link
      href={endereco}
      aria-label={rotulo}
      title={rotulo}
      className="-ml-1 rounded p-1 text-suave hover:bg-fundo hover:text-texto"
    >
      <ArrowLeft size={22} />
    </Link>
  );
}

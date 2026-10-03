"use client";

import { useRouter } from "next/navigation";

import EditorAnuncioML from "./EditorAnuncioML";

/**
 * O editor do Mercado Livre montado numa pagina (`modo="pagina"`). O anuncio novo ainda nao
 * tem endereco: no primeiro Salvar a URL passa a ser a do anuncio salvo (`replace`, e nao
 * `push`, para o Voltar do navegador nao cair de novo no "novo" e criar um segundo anuncio).
 * Nos Salvar seguintes a pagina ja e a do anuncio e nada navega.
 */
export default function EditorNaPagina({ anuncioId, rascunhoInicial, contextoInicial, status }) {
  const router = useRouter();

  return (
    <EditorAnuncioML
      anuncioId={anuncioId}
      rascunhoInicial={rascunhoInicial}
      contextoInicial={contextoInicial}
      status={status}
      modo="pagina"
      aoSalvar={(id) => {
        if (!anuncioId) router.replace(`/canais-de-venda/mercado-livre/${id}`);
      }}
    />
  );
}

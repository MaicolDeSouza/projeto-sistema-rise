"use client";

import MensagensDoCampo from "@/components/anuncios/ml/MensagensDoCampo";
import ArvoreDeCategorias from "./ArvoreDeCategorias";

/**
 * Aba Categorias do anuncio da Loja Integrada (aba propria desde 07/10/2026, pedido do dono; antes
 * ficava no fim da Geral): a arvore ao vivo da loja, varias por produto, com busca e "Recarregar".
 * A lista e lida pelo editor ao abrir (`contexto.categoriasDaLI`); os alertas (sem categoria,
 * categoria que sumiu da loja) moram aqui.
 */
export default function AbaCategorias({ rascunho, contexto, alterar, problemas, recarregarCategorias }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Categorias na loja</p>
      <ArvoreDeCategorias
        categorias={contexto.categoriasDaLI ?? null}
        carregando={Boolean(contexto.carregandoCategorias)}
        erro={contexto.erroDasCategorias ?? null}
        aoRecarregar={recarregarCategorias}
        selecionadas={rascunho.categorias ?? []}
        aoMudar={(categorias) => alterar({ categorias })}
      />
      <MensagensDoCampo problemas={problemas} campo="categorias" />
    </div>
  );
}

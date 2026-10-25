"use client";

import { Lock } from "lucide-react";

import MensagensDoCampo from "@/components/anuncios/ml/MensagensDoCampo";
import { EditarNoProduto } from "./AbasDeLeitura";

/**
 * Aba Categorias do anuncio da Loja Integrada: so leitura (pedido do dono em 25/10/2026). As categorias da loja sao DO
 * PRODUTO (`Produto.categoriasLI`), marcadas na aba Categorias do cadastro; aqui se ve o que vai para a loja, com o caminho
 * de cada uma (a arvore e lida ao vivo pelo editor, `contexto.categoriasDaLI`) e o alerta de categoria que sumiu da loja.
 */
export default function AbaCategorias({ contexto, problemas, abrirProduto }) {
  const produto = contexto.produto ?? {};
  const marcadas = Array.isArray(produto.categoriasLI) ? produto.categoriasLI : [];
  const arvore = contexto.categoriasDaLI ?? null;
  const caminhoDe = (id) => arvore?.find((categoria) => String(categoria.id) === String(id))?.caminho ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
        <Lock size={14} className="shrink-0" />
        <span className="min-w-0 flex-1">As categorias são do produto base: para mudar, edite na aba Categorias do cadastro.</span>
        <EditarNoProduto abrirProduto={produto.id ? abrirProduto : null} className="text-sm font-medium" />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Categorias na loja</p>
        {marcadas.length > 0 ? (
          <ul className="space-y-1 rounded border border-borda bg-superficie px-4 py-3 text-sm">
            {marcadas.map((id) => {
              const caminho = caminhoDe(id);
              return (
                <li key={id}>
                  {caminho ?? <span className="text-suave">id {id}{arvore ? " (não existe mais na loja)" : ""}</span>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded border border-borda bg-fundo px-3 py-2 text-sm text-suave">
            O produto ainda não tem categoria. Marque no cadastro do produto (aba Categorias).
          </p>
        )}
        <MensagensDoCampo problemas={problemas} campo="categorias" />
      </div>
    </div>
  );
}

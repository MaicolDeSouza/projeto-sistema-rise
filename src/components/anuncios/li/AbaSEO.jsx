"use client";

import { Lock } from "lucide-react";

import MensagensDoCampo from "@/components/anuncios/ml/MensagensDoCampo";
import { LIMITE_DA_DESCRIPTION_SEO, LIMITE_DO_TITULO_SEO } from "@/lib/canaisDeVenda/li/seo";
import { slugDe } from "@/lib/canaisDeVenda/li/slug";
import { EditarNoProduto } from "./AbasDeLeitura";

/** Contador no formato da LI ("54 de 70 caracteres"), vermelho acima do limite. */
function Contador({ tamanho, limite }) {
  return <span className={`shrink-0 text-xs tabular-nums ${tamanho > limite ? "font-medium text-red-700" : "text-suave"}`}>{tamanho} de {limite} caracteres</span>;
}

function CampoLido({ rotulo, valor, limite, vazio }) {
  const texto = String(valor ?? "").trim();
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <span className="text-sm font-semibold">{rotulo}</span>
        {limite && <Contador tamanho={texto.length} limite={limite} />}
      </div>
      <p className={`mt-1 whitespace-pre-wrap rounded border border-borda bg-fundo px-3 py-2 text-[15px] ${texto ? "" : "text-suave"}`}>{texto || vazio}</p>
    </div>
  );
}

/**
 * Aba SEO do anuncio da Loja Integrada: so leitura (pedido do dono em 25/10/2026). O Tag Title e a Meta Tag Description sao
 * DO PRODUTO (`Produto.seoTituloLI` e `seoDescricaoLI`), editados na aba SEO do cadastro, com a lista dos concorrentes e o
 * "Gerar com IA". A URL do produto continua so leitura: produto que ja esta na loja fica com a URL de hoje (decisao do dono
 * em 07/10/2026: o Google ja a indexou); produto novo ganha a do nome no Cadastrar.
 */
export default function AbaSEO({ rascunho, contexto, problemas, vinculo, abrirProduto }) {
  const produto = contexto.produto ?? {};
  const titulo = String(produto.seoTituloLI ?? "").trim();
  const descricao = String(produto.seoDescricaoLI ?? "").trim();

  const dominio = contexto.dominioDaLoja || "https://www.4hobby.com.br";
  const naLoja = Boolean(vinculo?.idExterno) && /^https?:\/\//i.test(String(vinculo?.urlExterna ?? ""));
  const caminhoDaLoja = naLoja ? String(vinculo.urlExterna).replace(/^https?:\/\/[^/]+\/?/i, "") : null;
  const caminho = naLoja ? caminhoDaLoja : slugDe(rascunho.titulo);
  const tituloNaBusca = titulo || rascunho.titulo || "Título do produto";
  const descriptionNaBusca = descricao || "Sem description: o Google escolhe um trecho da página.";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
        <Lock size={14} className="shrink-0" />
        <span className="min-w-0 flex-1">O SEO é do produto base: para mudar, edite na aba SEO do cadastro.</span>
        <EditarNoProduto abrirProduto={produto.id ? abrirProduto : null} className="text-sm font-medium" />
      </div>

      <div>
        <CampoLido rotulo="Tag Title - Título do produto" valor={titulo} limite={LIMITE_DO_TITULO_SEO} vazio="Sem Tag Title: preencha no produto." />
        <MensagensDoCampo problemas={problemas} campo="seoTitulo" />
      </div>

      <div>
        <CampoLido
          rotulo="Meta Tag Description - Descrição / Resumo"
          valor={descricao}
          limite={LIMITE_DA_DESCRIPTION_SEO}
          vazio="Sem Meta Tag Description: preencha no produto."
        />
        <MensagensDoCampo problemas={problemas} campo="seoDescription" />
      </div>

      <div>
        <span className="text-sm font-semibold">URL do produto</span>
        <div className="mt-1 flex items-stretch overflow-hidden rounded border border-borda bg-fundo text-[15px]">
          <span className="shrink-0 border-r border-borda px-2.5 py-2 text-suave">{dominio}/</span>
          <span className="min-w-0 flex-1 px-2.5 py-2 font-medium">{caminho ?? ""}</span>
        </div>
        <MensagensDoCampo problemas={problemas} campo="slug" />
        <p className="mt-1 text-[11px] text-suave">
          {naLoja ? "Como está na loja hoje. Fica assim, mesmo se o nome mudar." : "Vai ser a URL do produto quando ele for cadastrado na loja."}
        </p>
      </div>

      <div className="rounded border border-borda bg-fundo p-3">
        <p className="text-xs text-suave">Como aparece na busca do Google (aproximado)</p>
        <p className="mt-2 truncate text-[17px] text-blue-800">{tituloNaBusca.slice(0, LIMITE_DO_TITULO_SEO)}</p>
        <p className="truncate text-xs text-emerald-800">
          {dominio}/{caminho || "endereco-do-produto"}
        </p>
        <p className="mt-0.5 line-clamp-2 text-sm text-suave">{descriptionNaBusca.slice(0, LIMITE_DA_DESCRIPTION_SEO)}</p>
      </div>
    </div>
  );
}

"use client";

import { Lock } from "lucide-react";

import { montarDescricaoLI } from "@/lib/canaisDeVenda/li/descricao";
import { EditarNoProduto } from "./AbasDeLeitura";

/**
 * Aba Descricao: so leitura. O texto e o do CADASTRO do produto (pedido do dono em 07/10/2026: a
 * descricao nao se edita no anuncio, para nao haver duas versoes); quem muda e o cadastro, pelo
 * "Editar produto" (que pergunta antes se o anuncio tem alteracao nao salva). O que aparece aqui e
 * exatamente o que vai para a loja: o texto com fonte 16 e titulos em negrito e os documentos para
 * download (com endereco publico).
 *
 * `dangerouslySetInnerHTML` recebe o HTML montado AQUI por `montarDescricaoLI`, que escapa todo
 * texto: tag digitada no cadastro vira texto, nunca HTML. Nada vindo da loja passa por aqui.
 */
export default function AbaDescricao({ contexto, abrirProduto }) {
  const produto = contexto.produto ?? {};
  const html = montarDescricaoLI({ descricao: produto.descricaoBase, documentos: contexto.documentos ?? [] });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
        <Lock size={14} className="shrink-0" />
        <span className="min-w-0 flex-1">Esta descrição é só leitura e vem do cadastro do produto. Para editar, use</span>
        <EditarNoProduto abrirProduto={produto.id ? abrirProduto : null} className="text-sm font-medium" />
      </div>

      {!contexto.urlPublica && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Documentos para download: desligado até o Rise ter endereço público (APP_URL_PUBLICA, na VPS). Quando ligar, os arquivos da aba
          Documentos do produto entram logo abaixo das Especificações técnicas.
        </p>
      )}

      <p className="text-sm font-semibold">Descrição que vai para a loja</p>
      {html ? (
        <div
          className="max-h-[36rem] space-y-2 overflow-y-auto rounded border border-borda bg-superficie px-4 py-3 leading-relaxed [&_a]:text-acento [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="rounded border border-borda bg-fundo px-3 py-2 text-sm text-suave">
          O produto ainda não tem descrição. Escreva no cadastro do produto (aba Descrição).
        </p>
      )}
    </div>
  );
}

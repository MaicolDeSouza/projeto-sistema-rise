"use client";

import Link from "next/link";

import { montarDescricaoLI } from "@/lib/canaisDeVenda/li/descricao";

/**
 * Aba Descricao: so leitura. O texto e o do CADASTRO do produto (pedido do dono em 07/10/2026: a
 * descricao nao se edita no anuncio, para nao haver duas versoes); quem muda e o cadastro, pelo link.
 * O que aparece aqui e exatamente o que vai para a loja: o texto com fonte 16 e titulos em negrito,
 * os documentos para download (com endereco publico) e as frases fixas.
 *
 * `dangerouslySetInnerHTML` recebe o HTML montado AQUI por `montarDescricaoLI`, que escapa todo
 * texto: tag digitada no cadastro vira texto, nunca HTML. Nada vindo da loja passa por aqui.
 */
export default function AbaDescricao({ contexto }) {
  const produto = contexto.produto ?? {};
  const html = montarDescricaoLI({ descricao: produto.descricaoBase, documentos: contexto.documentos ?? [], frases: contexto.frases ?? [] });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Descricao que vai para a loja</p>
        <div className="flex gap-3 text-xs">
          {produto.id && (
            <Link href={`/produtos/${produto.id}`} target="_blank" className="text-acento hover:underline">
              Editar no produto
            </Link>
          )}
          <Link href="/canais-de-venda/loja-integrada/configuracoes" target="_blank" className="text-acento hover:underline">
            Editar as frases fixas
          </Link>
        </div>
      </div>

      {!contexto.urlPublica && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Documentos para download: desligado ate o Rise ter endereco publico (APP_URL_PUBLICA, na VPS). Quando ligar, os arquivos da aba
          Documentos do produto entram logo abaixo das Especificacoes tecnicas.
        </p>
      )}

      {html ? (
        <div
          className="max-h-[36rem] space-y-2 overflow-y-auto rounded border border-borda bg-superficie px-4 py-3 leading-relaxed [&_a]:text-acento [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="rounded border border-borda bg-fundo px-3 py-2 text-sm text-suave">
          O produto ainda nao tem descricao. Escreva no cadastro do produto (aba Descricao).
        </p>
      )}
    </div>
  );
}

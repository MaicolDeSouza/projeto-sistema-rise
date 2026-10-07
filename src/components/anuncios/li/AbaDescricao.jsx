"use client";

import Link from "next/link";

import { CLASSE_CAMPO } from "@/components/cadastros/Campo";
import { montarDescricaoLI } from "@/lib/canaisDeVenda/li/descricao";

/**
 * Aba Descricao: o texto (puro, como o do cadastro), a caixa das Especificacoes (lista montada do
 * produto: marca, modelo, GTIN, peso, medidas, garantia, homologacao), as frases fixas do canal e a
 * previa do HTML que vai para a loja.
 *
 * A previa usa `dangerouslySetInnerHTML` com o HTML montado AQUI por `montarDescricaoLI`, que escapa
 * todo texto: tag digitada no Rise vira texto, nunca HTML. Nada vindo da loja passa por aqui.
 */
export default function AbaDescricao({ rascunho, contexto, alterar }) {
  const html = montarDescricaoLI({
    descricao: rascunho.descricao,
    especificacoes: Boolean(rascunho.especificacoes),
    produto: contexto.produto ?? {},
    documentos: contexto.documentos ?? [],
    frases: contexto.frases ?? [],
  });

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="li-descricao" className="text-sm font-semibold">
          Descricao
        </label>
        <textarea
          id="li-descricao"
          rows={14}
          value={rascunho.descricao ?? ""}
          onChange={(evento) => alterar({ descricao: evento.target.value })}
          className={`${CLASSE_CAMPO} resize-y border-borda font-sans text-[15px] leading-relaxed focus:border-acento`}
        />
        <p className="mt-1 text-[11px] text-suave">Linha em branco separa paragrafos. Tags digitadas aparecem como texto na loja.</p>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={Boolean(rascunho.especificacoes)}
          onChange={(evento) => alterar({ especificacoes: evento.target.checked })}
          className="h-4 w-4 accent-acento"
        />
        Incluir a lista de Especificacoes (do cadastro do produto)
      </label>

      <div className="rounded border border-borda bg-fundo p-3 text-sm">
        <p className="font-semibold">Frases fixas da Loja Integrada</p>
        {contexto.frases?.length ? (
          <ul className="mt-1 list-disc pl-5 text-suave">
            {contexto.frases.map((frase) => (
              <li key={frase}>{frase}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-suave">Nenhuma frase fixa.</p>
        )}
        <Link href="/canais-de-venda/loja-integrada/configuracoes" target="_blank" className="mt-1 inline-block text-xs text-acento hover:underline">
          Editar as frases fixas
        </Link>
      </div>

      {!contexto.urlPublica && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Documentos: desligado ate o Rise ter endereco publico (APP_URL_PUBLICA, na VPS). Os manuais e datasheets do produto entram na descricao como links quando ele existir.
        </p>
      )}

      <div>
        <p className="text-sm font-semibold">Previa na loja</p>
        {html ? (
          <div
            className="mt-2 max-h-[32rem] space-y-2 overflow-y-auto rounded border border-borda bg-superficie px-4 py-3 text-[15px] leading-relaxed [&_a]:text-acento [&_a]:underline [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="mt-2 text-sm text-suave">Sem descricao.</p>
        )}
      </div>
    </div>
  );
}

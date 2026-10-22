"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";

import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { montarDescricaoML } from "@/lib/canaisDeVenda/ml/descricao";
import MensagensDoCampo from "./MensagensDoCampo";

const NUMERO = new Intl.NumberFormat("pt-BR");

/**
 * Aba Descricao: SO LEITURA (pedido do dono em 22/10/2026). A descricao vem sempre do cadastro do produto; no kit,
 * o bloco "Itens inclusos" sai do codigo e das quantidades da composicao. Mudar o texto e no produto: o link abre o
 * cadastro em outra aba, para nao perder o que ainda nao foi salvo aqui.
 */
export default function AbaDescricao({ rascunho, problemas }) {
  const textoFinal = montarDescricaoML({ descricao: rascunho.descricao });
  const emKit = Boolean(rascunho.composicao);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-sm font-semibold">
          Descrição
          <BolhaDeAjuda
            variante="inline"
            texto={
              emKit
                ? "Vem do cadastro do produto principal. O bloco \"Itens inclusos\" é refeito pelo código e pelas quantidades do kit. É exatamente o texto que vai ao Mercado Livre."
                : "Vem do cadastro do produto. É exatamente o texto que vai ao Mercado Livre."
            }
          />
        </div>
        {rascunho.produtoId && (
          <Link
            href={`/produtos/${rascunho.produtoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-acento hover:bg-fundo"
          >
            <Pencil size={12} />
            Editar no produto
          </Link>
        )}
      </div>
      <pre className="mt-1 max-h-[40rem] overflow-y-auto rounded border border-borda bg-fundo px-3 py-2.5 font-sans text-[15px] leading-relaxed break-words whitespace-pre-wrap">
        {textoFinal || <span className="text-suave">O produto não tem descrição. Escreva no cadastro do produto.</span>}
      </pre>
      <p className="mt-1 text-[11px] text-suave tabular-nums">{NUMERO.format(textoFinal.length)} caracteres</p>
      <MensagensDoCampo problemas={problemas} campo="descricao" />
    </div>
  );
}

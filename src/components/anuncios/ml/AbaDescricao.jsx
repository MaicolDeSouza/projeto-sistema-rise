"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";

import { montarDescricaoML } from "@/lib/canaisDeVenda/ml/descricao";
import MensagensDoCampo from "./MensagensDoCampo";
import SecaoDoAnuncio from "./SecaoDoAnuncio";

const NUMERO = new Intl.NumberFormat("pt-BR");

/**
 * Aba Descricao. Anuncio SIMPLES: so leitura (pedido do dono em 22/10/2026), a descricao vem sempre do cadastro do
 * produto, e mudar o texto e no produto (o link abre o cadastro em outra aba). KIT: editavel aqui (pedido do dono em
 * 27/10/2026); nasce da descricao do principal, e o bloco "Itens inclusos" continua refeito pelo codigo e pelas
 * quantidades da composicao (`descricaoDoRise`).
 */
export default function AbaDescricao({ rascunho, alterar, problemas }) {
  const textoFinal = montarDescricaoML({ descricao: rascunho.descricao });
  const emKit = Boolean(rascunho.composicao);

  if (emKit) {
    return (
      <SecaoDoAnuncio
        titulo="Descrição do kit"
        ajuda="Editável neste anúncio: começa com a descrição do produto principal. O bloco &quot;Itens inclusos&quot; é refeito pelo código e pelas quantidades do kit ao mexer na composição."
      >
        {/* A caixa cresce com o texto (`field-sizing: content`): uma barra de rolagem so, a da janela (pedido do dono em
            28/10/2026; com altura fixa havia duas, e a de dentro nao rolava com a aba travada no publicado). */}
        <textarea
          aria-label="Descrição do kit"
          value={rascunho.descricao ?? ""}
          onChange={(evento) => alterar({ descricao: evento.target.value })}
          className="field-sizing-content min-h-80 w-full resize-none overflow-hidden rounded border border-borda bg-superficie px-3 py-2.5 font-sans text-[15px] leading-relaxed focus:border-acento focus:outline-none"
        />
        <p className="mt-1 text-[11px] text-suave tabular-nums">{NUMERO.format(textoFinal.length)} caracteres</p>
        <MensagensDoCampo problemas={problemas} campo="descricao" />
      </SecaoDoAnuncio>
    );
  }

  return (
    <SecaoDoAnuncio
      titulo="Descrição"
      ajuda="Vem do cadastro do produto. É exatamente o texto que vai ao Mercado Livre."
      acao={
        rascunho.produtoId && (
          <Link
            href={`/produtos/${rascunho.produtoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-acento hover:bg-superficie"
          >
            <Pencil size={12} />
            Editar no produto
          </Link>
        )
      }
    >
      <pre className="rounded border border-borda bg-fundo px-3 py-2.5 font-sans text-[15px] leading-relaxed break-words whitespace-pre-wrap">
        {textoFinal || <span className="text-suave">O produto não tem descrição. Escreva no cadastro do produto.</span>}
      </pre>
      <p className="mt-1 text-[11px] text-suave tabular-nums">{NUMERO.format(textoFinal.length)} caracteres</p>
      <MensagensDoCampo problemas={problemas} campo="descricao" />
    </SecaoDoAnuncio>
  );
}

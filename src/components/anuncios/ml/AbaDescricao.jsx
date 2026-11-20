"use client";

import Link from "next/link";
import { Pencil, RotateCcw } from "lucide-react";

import { montarDescricaoCompletaML } from "@/lib/canaisDeVenda/ml/descricao";
import { kitsParaOBloco, unidadesDoAnuncio } from "@/lib/canaisDeVenda/ml/kitsNaDescricao";
import { descricaoDoRise } from "@/lib/canaisDeVenda/ml/rascunho";
import MensagensDoCampo from "./MensagensDoCampo";
import SecaoDoAnuncio from "./SecaoDoAnuncio";

const NUMERO = new Intl.NumberFormat("pt-BR");

/**
 * Aba Descricao. Anuncio SIMPLES: so leitura (pedido do dono em 22/10/2026), a descricao vem sempre do cadastro do
 * produto, e mudar o texto e no produto (o link abre o cadastro em outra aba). KIT: editavel aqui (pedido do dono em
 * 27/10/2026); nasce da descricao do principal, e o bloco "Itens inclusos" continua refeito pelo codigo e pelas
 * quantidades da composicao (`descricaoDoRise`).
 *
 * Desde 20/11/2026 (spec "Compre em kit e economize") o texto que vai ao ML e o do formato 2: as boas-vindas no comeco, a
 * descricao sem a secao de garantia e, quando ha kit maior do produto no ML, o bloco dos kits. A previa mostra esse texto
 * inteiro; `formatoAntigo` diz que o anuncio publicado ainda esta no ML com o texto de antes (o Sincronizar o troca).
 */
export default function AbaDescricao({ rascunho, contexto, alterar, problemas, formatoAntigo = false }) {
  const kits = kitsParaOBloco({ unidades: unidadesDoAnuncio(rascunho), preco: rascunho.preco, irmaos: contexto?.kitsDoProduto ?? [] });
  const textoFinal = montarDescricaoCompletaML({ descricao: rascunho.descricao, kits });
  const emKit = Boolean(rascunho.composicao);
  // Estado que pede acao (regra 8): uma linha curta ao lado da contagem, sem caixa de aviso.
  const avisoDoFormato = formatoAntigo && (
    <span className="ml-2 text-amber-700" title="O anúncio foi enviado antes das boas-vindas e do bloco dos kits. O Sincronizar com o ML manda o texto desta prévia.">
      No ML ainda está o formato antigo: sincronize para enviar este texto.
    </span>
  );

  if (emKit) {
    // Sem edicao, o kit acompanha a descricao do produto base (28/10/2026); editou aqui, o texto passa a ser do kit, e o botao
    // volta a acompanhar o produto.
    const editada = rascunho.descricaoEditada === true;
    const usarADoProduto = () => {
      const doProduto = descricaoDoRise({ ...rascunho, descricaoEditada: false }, contexto?.produtos ?? {});
      alterar({ descricaoEditada: false, ...(doProduto !== null ? { descricao: doProduto } : {}) });
    };
    return (
      <SecaoDoAnuncio
        titulo="Descrição do kit"
        ajuda="Acompanha a descrição do produto principal até você editar o texto aqui; editado, fica o texto do kit. O bloco &quot;Itens inclusos&quot; é sempre refeito pelo código e pelas quantidades do kit."
        acao={
          editada ? (
            <button
              type="button"
              onClick={usarADoProduto}
              title="Troca o texto pela descrição do produto principal, que passa a ser acompanhada de novo"
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-acento hover:bg-superficie"
            >
              <RotateCcw size={12} />
              Usar a descrição do produto
            </button>
          ) : (
            <span className="text-xs text-suave">Acompanha a descrição do produto</span>
          )
        }
      >
        {/* A caixa cresce com o texto (`field-sizing: content`): uma barra de rolagem so, a da janela (pedido do dono em
            28/10/2026; com altura fixa havia duas, e a de dentro nao rolava com a aba travada no publicado). */}
        <textarea
          aria-label="Descrição do kit"
          value={rascunho.descricao ?? ""}
          onChange={(evento) => alterar({ descricao: evento.target.value, descricaoEditada: true })}
          className="field-sizing-content min-h-80 w-full resize-none overflow-hidden rounded border border-borda bg-superficie px-3 py-2.5 font-sans text-[15px] leading-relaxed focus:border-acento focus:outline-none"
        />
        <p className="mt-1 text-[11px] text-suave tabular-nums">
          {NUMERO.format(textoFinal.length)} caracteres{avisoDoFormato}
        </p>
        <MensagensDoCampo problemas={problemas} campo="descricao" />
        {/* O kit edita so o miolo; as boas-vindas e o bloco dos kits maiores entram no envio. A previa inteira fica recolhida. */}
        {textoFinal && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-acento">Ver o texto que vai ao Mercado Livre</summary>
            <pre className="mt-2 rounded border border-borda bg-fundo px-3 py-2.5 font-sans text-[15px] leading-relaxed break-words whitespace-pre-wrap">{textoFinal}</pre>
          </details>
        )}
      </SecaoDoAnuncio>
    );
  }

  return (
    <SecaoDoAnuncio
      titulo="Descrição"
      ajuda="Vem do cadastro do produto, com as boas-vindas no começo, sem a seção de garantia (o Mercado Livre já a mostra) e, quando há kit maior do produto no ML, o bloco “Compre em kit e economize”. É exatamente o texto que vai ao Mercado Livre."
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
      <p className="mt-1 text-[11px] text-suave tabular-nums">
        {NUMERO.format(textoFinal.length)} caracteres{avisoDoFormato}
      </p>
      <MensagensDoCampo problemas={problemas} campo="descricao" />
    </SecaoDoAnuncio>
  );
}

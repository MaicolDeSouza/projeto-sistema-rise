"use client";

import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";

import { textoDaReputacao, textoDoResumo } from "@/lib/canaisDeVenda/ml/catalogo";
import { ROTULO_DO_TIPO_ML } from "@/lib/canaisDeVenda/ml/rotulos";

/**
 * Pecas da tela dos concorrentes do ML pelo catalogo (spec 2026-10-21-concorrentes-ml-catalogo-design.md), usadas pela
 * aba Catalogo. A busca de catalogo, o "Acompanhar este catalogo" e o ranking dos catalogos de referencia sairam do editor
 * em 26/10/2026 (pedido do dono): o Rise acompanha sozinho o catalogo em que o anuncio esta.
 */

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const urlDoCatalogo = (id) => `https://www.mercadolivre.com.br/p/${id}`;
const nomeDoVendedor = (apelido, id) => apelido || `vendedor ${id}`;
// Links de cada concorrente (pedido do dono em 22/10/2026). O anuncio pelo id ("MLB7862426858" -> ".../MLB-7862426858") e o
// perfil pelo apelido, no formato do `permalink` do ML (espaco vira "+"; medido: responde 301 para o https).
const urlDoAnuncio = (itemId) => `https://produto.mercadolivre.com.br/${String(itemId).replace(/^MLB/, "MLB-")}`;
const urlDoPerfil = (apelido) => `https://perfil.mercadolivre.com.br/${encodeURIComponent(apelido).replace(/%20/g, "+")}`;

export function ResumoDaPosicao({ posicao }) {
  if (!posicao) return <span className="text-suave">sem leitura</span>;
  // Leitura de antes da contagem de vendedores (22/10/2026) nao tem o numero: fica so o de anuncios.
  const resumo =
    typeof posicao.vendedores === "number"
      ? textoDoResumo({ anuncios: posicao.total, vendedores: posicao.vendedores, completo: posicao.completo !== false })
      : `${posicao.total} anúncios`;
  if (posicao.posicao === null) return <span>{resumo} · você não está neste catálogo</span>;
  return (
    <span>
      {resumo} · <strong>você é o {posicao.posicao}º</strong>
    </span>
  );
}

function Seta({ preco, anterior }) {
  if (anterior === null || anterior === undefined || preco === null || preco === anterior) return null;
  return preco < anterior ? (
    <ArrowDown size={12} className="text-red-600" aria-label={`baixou de ${MOEDA.format(anterior)}`} />
  ) : (
    <ArrowUp size={12} className="text-emerald-600" aria-label={`subiu de ${MOEDA.format(anterior)}`} />
  );
}

export function Vendedor({ apelido, id, reputacao, vendas, itemId }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex min-w-0 items-center gap-1">
        {apelido ? (
          <a href={urlDoPerfil(apelido)} target="_blank" rel="noreferrer" title="Abrir o perfil do vendedor no Mercado Livre" className="truncate hover:text-acento hover:underline">
            {nomeDoVendedor(apelido, id)}
          </a>
        ) : (
          <span className="truncate">{nomeDoVendedor(apelido, id)}</span>
        )}
        {itemId && (
          <a href={urlDoAnuncio(itemId)} target="_blank" rel="noreferrer" title={`Abrir o anúncio ${itemId} no Mercado Livre`} aria-label={`Abrir o anúncio ${itemId} no Mercado Livre`} className="shrink-0 rounded p-0.5 text-suave hover:text-acento">
            <ExternalLink size={12} />
          </a>
        )}
      </span>
      <span className="text-[11px] text-suave">
        {textoDaReputacao(reputacao)}
        {typeof vendas === "number" ? ` · ${vendas.toLocaleString("pt-BR")} vendas` : ""}
      </span>
    </span>
  );
}

const CABECALHO = (
  <thead className="text-left text-[11px] tracking-wide text-suave uppercase">
    <tr>
      <th className="w-10 py-1 font-medium">Pos.</th>
      <th className="py-1 font-medium">Vendedor</th>
      <th className="py-1 font-medium">Tipo</th>
      <th className="py-1 text-right font-medium">Preço</th>
    </tr>
  </thead>
);

function Tipo({ tipoAnuncio, freteGratis }) {
  return (
    <>
      {ROTULO_DO_TIPO_ML[tipoAnuncio] ?? tipoAnuncio ?? "-"}
      {freteGratis && <span className="ml-1 text-emerald-700">· frete grátis</span>}
    </>
  );
}

/** Os concorrentes acompanhados (gravados, com o preco anterior). Clicar num preco o copia para o anuncio. */
export function TabelaDeConcorrentes({ linhas, alterar, apagados = false }) {
  return (
    <table className={`w-full text-sm ${apagados ? "mt-2 text-suave" : ""}`}>
      {CABECALHO}
      <tbody className="divide-y divide-borda">
        {linhas.map((c) => (
          <tr key={c.id}>
            <td className="py-1.5 tabular-nums">{c.posicao}º</td>
            <td className="py-1.5"><Vendedor apelido={c.vendedorApelido} id={c.vendedorId} reputacao={c.vendedorReputacao} vendas={c.vendedorVendas} itemId={c.itemId} /></td>
            <td className="py-1.5 text-xs"><Tipo tipoAnuncio={c.tipoAnuncio} freteGratis={c.freteGratis} /></td>
            <td className="py-1.5 text-right">
              {c.preco === null ? "-" : (
                <button type="button" onClick={() => alterar({ preco: c.preco })} title="Usar este preço no anúncio" className="inline-flex items-center gap-1 tabular-nums hover:text-acento hover:underline">
                  <Seta preco={c.preco} anterior={c.precoAnterior} />
                  {MOEDA.format(c.preco)}
                </button>
              )}
              {c.precoCheio > c.preco && <span className="ml-1 text-[11px] text-suave line-through tabular-nums">{MOEDA.format(c.precoCheio)}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Todos os anuncios de um catalogo lidos agora no ML (`preverCatalogoMLAcao`), na ordem do ML e com os do dono destacados
 * como "Você" (pedido do dono em 26/10/2026: ele era o 2o e a lista dos acompanhados, que tira os dele, pulava a linha).
 * `anteriores` (itemId -> preco anterior, dos acompanhados) poe a seta de subiu/baixou; com `alterar`, clicar num preco de
 * concorrente o copia para o anuncio.
 */
export function TabelaDoCatalogoAoVivo({ itens, alterar = null, anteriores = null }) {
  if (itens.length === 0) return <p className="text-sm text-suave">Este catálogo não tem anúncios abertos.</p>;
  return (
    <table className="w-full text-sm">
      {CABECALHO}
      <tbody className="divide-y divide-borda">
        {itens.map((item) => (
          <tr key={item.itemId} className={item.meu ? "bg-emerald-50 font-medium" : ""}>
            <td className="py-1.5 pl-1 tabular-nums">{item.posicao}º</td>
            <td className="py-1.5">
              {item.meu ? (
                <span className="flex items-center gap-1 text-emerald-800">
                  Você
                  <a href={urlDoAnuncio(item.itemId)} target="_blank" rel="noreferrer" title={`Abrir o seu anúncio ${item.itemId} no Mercado Livre`} aria-label={`Abrir o seu anúncio ${item.itemId} no Mercado Livre`} className="rounded p-0.5 text-suave hover:text-acento">
                    <ExternalLink size={12} />
                  </a>
                </span>
              ) : (
                <Vendedor apelido={item.vendedor?.apelido} id={item.vendedorId} reputacao={item.vendedor?.reputacao} vendas={item.vendedor?.vendas} itemId={item.itemId} />
              )}
            </td>
            <td className="py-1.5 text-xs"><Tipo tipoAnuncio={item.tipoAnuncio} freteGratis={item.freteGratis} /></td>
            <td className="py-1.5 pr-1 text-right tabular-nums">
              {item.preco === null ? (
                "-"
              ) : alterar && !item.meu ? (
                <button type="button" onClick={() => alterar({ preco: item.preco })} title="Usar este preço no anúncio" className="inline-flex items-center gap-1 tabular-nums hover:text-acento hover:underline">
                  <Seta preco={item.preco} anterior={anteriores?.get(item.itemId) ?? null} />
                  {MOEDA.format(item.preco)}
                </button>
              ) : (
                MOEDA.format(item.preco)
              )}
              {item.precoCheio > item.preco && <span className="ml-1 text-[11px] text-suave line-through">{MOEDA.format(item.precoCheio)}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

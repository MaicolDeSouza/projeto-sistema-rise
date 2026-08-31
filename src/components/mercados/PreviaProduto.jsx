"use client";

import { Check, ImageOff, Minus } from "lucide-react";

import Badge from "@/components/ui/Badge";
import { ROTULOS_CAMPOS, valoresDoProduto } from "@/lib/coleta/campos";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const SITUACAO = {
  AVAILABLE: { rotulo: "Disponivel", tom: "sucesso" },
  OUT_OF_STOCK: { rotulo: "Sem estoque", tom: "alerta" },
  PAUSED: { rotulo: "Pausado", tom: "erro" },
  UNKNOWN: { rotulo: "Indeterminado", tom: "neutro" },
};

/// Campos que ja aparecem com destaque proprio (preco, estoque, descricao,
/// imagens) saem da grade de identificacao para nao serem ditos duas vezes.
const NA_GRADE = ["name", "code", "mpn", "ean", "brand", "model", "category", "ncm"];

/**
 * Imagem vinda do site do concorrente.
 *
 * SEMPRE <img>, nunca next/image: o host e arbitrario, e o next/image LANCA
 * EXCECAO quando ele nao esta em images.remotePatterns — uma URL de loja
 * desconhecida derrubaria a tela do teste inteira. O onError cobre o link
 * quebrado, para que uma imagem fora do ar nao deixe um buraco sem explicacao.
 */
function Imagem({ url, alt, tamanho = "h-28 w-28" }) {
  if (!url) {
    return (
      <div
        className={`${tamanho} flex shrink-0 items-center justify-center rounded border border-borda bg-fundo text-suave`}
      >
        <ImageOff size={18} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt ?? ""}
      onError={(evento) => {
        evento.currentTarget.style.display = "none";
      }}
      className={`${tamanho} shrink-0 rounded border border-borda bg-superficie object-contain`}
    />
  );
}

/**
 * Uma celula da grade. Campo nao coletado aparece como "—", nunca some.
 *
 * Mostra DE ONDE o valor veio. Sem isso, um campo derivado — o "Codigo", que e
 * copia do SKU quando a loja nao publica codigo proprio — aparecia identico a um
 * campo lido da pagina, e nao havia como saber qual era qual sem abrir o HTML.
 */
function Campo({ rotulo, valor, origem, mono = false }) {
  const vazio = valor === null || valor === undefined || valor === "";
  const derivado = origem?.startsWith("copiado");

  return (
    <div className="min-w-0">
      <dt className="text-xs text-suave">{rotulo}</dt>
      <dd
        className={`truncate text-sm ${vazio ? "text-suave" : ""} ${
          mono && !vazio ? "font-mono text-xs" : ""
        }`}
        title={vazio ? "nao publicado por este site" : String(valor)}
      >
        {vazio ? "—" : valor}
      </dd>
      {!vazio && origem && (
        <p
          className={`truncate text-[10px] ${derivado ? "text-amber-700" : "text-suave"}`}
          title={origem}
        >
          {derivado ? "⚠ " : ""}
          {origem}
        </p>
      )}
    </div>
  );
}

export default function PreviaProduto({ produto, indice }) {
  const situacao = SITUACAO[produto.stock?.status] ?? SITUACAO.UNKNOWN;
  const temPromocional = typeof produto.prices?.promotional === "number";
  const valores = valoresDoProduto(produto);
  const especificacoes = produto.specifications ?? [];

  return (
    <div className="rounded-lg border border-borda bg-superficie p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs tracking-wide text-suave uppercase">Produto {indice}</p>
        <p className="text-xs text-suave">
          Coletado em{" "}
          {new Date(produto.collectedAt).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <Imagem url={produto.images?.[0]} alt={produto.name} />
          {produto.images?.length > 1 && (
            <div className="flex max-w-28 flex-wrap gap-1">
              {produto.images.slice(1, 5).map((url) => (
                <Imagem key={url} url={url} alt="" tamanho="h-6 w-6" />
              ))}
              {produto.images.length > 5 && (
                <span className="self-center text-xs text-suave">
                  +{produto.images.length - 5}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="min-w-56 flex-1 space-y-3">
          <p className="font-medium">{produto.name}</p>

          {/* Identificacao: todos os campos, inclusive os que o site nao deu. */}
          <dl className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4">
            {NA_GRADE.filter((campo) => campo !== "name").map((campo) => (
              <Campo
                key={campo}
                rotulo={ROTULOS_CAMPOS[campo]}
                valor={produto[campo]}
                origem={produto.origens?.[campo]}
                mono={["code", "mpn", "ean", "ncm"].includes(campo)}
              />
            ))}
          </dl>

          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <p className="text-xs text-suave">{ROTULOS_CAMPOS.precoNormal}</p>
              <p
                className={
                  temPromocional
                    ? "text-sm text-suave line-through"
                    : "text-lg font-semibold tabular-nums"
                }
              >
                {MOEDA.format(produto.prices.normal)}
              </p>
            </div>

            <div>
              <p className="text-xs text-suave">{ROTULOS_CAMPOS.precoPromocional}</p>
              <p
                className={`text-lg font-semibold tabular-nums ${
                  temPromocional ? "text-emerald-700" : "text-sm font-normal text-suave"
                }`}
              >
                {temPromocional ? MOEDA.format(produto.prices.promotional) : "—"}
              </p>
            </div>

            <div>
              <p className="text-xs text-suave">{ROTULOS_CAMPOS.status}</p>
              <Badge tom={situacao.tom}>{situacao.rotulo}</Badge>
            </div>

            <div>
              <p className="text-xs text-suave">{ROTULOS_CAMPOS.quantidade}</p>
              <p className="text-sm">
                {typeof produto.stock?.quantity === "number" ? (
                  produto.stock.quantity
                ) : (
                  <span className="text-suave">nao informada</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-1 text-xs text-suave">{ROTULOS_CAMPOS.url}</p>
        <a
          href={produto.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-xs text-acento hover:underline"
        >
          {produto.url}
        </a>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs text-suave">
          {ROTULOS_CAMPOS.description}
          {produto.description && (
            <span className="ml-1">({produto.description.length} caracteres)</span>
          )}
        </p>
        {produto.description ? (
          // Texto puro, nunca dangerouslySetInnerHTML: e conteudo de terceiro, e
          // renderizar cru transformaria uma pagina comprometida em execucao de
          // script dentro do sistema. Como filho de um elemento, o React escapa.
          <p className="max-h-40 overflow-y-auto rounded border border-borda bg-fundo p-2 text-xs whitespace-pre-wrap">
            {produto.description}
          </p>
        ) : (
          <p className="text-sm text-suave">—</p>
        )}
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs text-suave">
          {ROTULOS_CAMPOS.specifications}
          {especificacoes.length > 0 && (
            <span className="ml-1">({especificacoes.length})</span>
          )}
        </p>
        {especificacoes.length > 0 ? (
          <dl className="grid grid-cols-1 gap-x-6 text-xs sm:grid-cols-2">
            {especificacoes.map((item, indice) => (
              <div
                key={`${item.nome ?? "item"}-${indice}`}
                className="flex gap-2 border-b border-borda py-1"
              >
                {/*
                  Linha sem rotulo e caracteristica solta da ficha ("Tecnologia
                  ultra silenciosa"). Aparece com marcador, e nao com um nome
                  inventado do lado esquerdo.
                */}
                {item.nome ? (
                  <>
                    <dt className="shrink-0 text-suave">{item.nome}:</dt>
                    <dd className="min-w-0 truncate" title={String(item.valor)}>
                      {String(item.valor)}
                    </dd>
                  </>
                ) : (
                  <>
                    <dt className="shrink-0 text-suave">·</dt>
                    <dd className="min-w-0 truncate" title={String(item.valor)}>
                      {String(item.valor)}
                    </dd>
                  </>
                )}
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-suave">—</p>
        )}
      </div>

      {/*
        SEO nao descreve o produto: descreve como a loja tenta ser achada. Fica
        num bloco proprio para nao se confundir com dado do item — o titulo de
        SEO costuma ser diferente do nome do produto, e mistura-los faria
        parecer que a loja publica dois nomes.
      */}
      <div className="mt-3">
        <p className="mb-1 text-xs text-suave">
          {ROTULOS_CAMPOS.seo}
          <span className="ml-1">(como o concorrente se apresenta ao buscador)</span>
        </p>
        {Object.values(produto.seo ?? {}).some(Boolean) ? (
          <dl className="space-y-0.5 rounded border border-borda bg-fundo p-2 text-xs">
            {[
              ["Titulo", produto.seo.title],
              ["Descricao", produto.seo.description],
              ["Palavras-chave", produto.seo.keywords],
              ["URL canonica", produto.seo.canonical],
            ]
              .filter(([, valor]) => valor)
              .map(([rotulo, valor]) => (
                <div key={rotulo} className="flex gap-2">
                  <dt className="shrink-0 text-suave">{rotulo}:</dt>
                  <dd className="min-w-0 truncate" title={valor}>
                    {valor}
                  </dd>
                </div>
              ))}
          </dl>
        ) : (
          <p className="text-sm text-suave">—</p>
        )}
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs text-suave">Variacoes</p>
        {produto.variants?.length > 0 ? (
          <ul className="text-xs">
            {produto.variants.map((variacao) => (
              <li key={variacao.name}>
                {variacao.name}: {variacao.options.join(" / ")}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-suave">
            — <span className="text-xs">(sem variacao agrupada nesta pagina)</span>
          </p>
        )}
      </div>

      {/*
        Fecha com o placar do proprio produto. O relatorio de cima diz o que a
        LOJA publica em algum lugar; aqui diz o que ESTE item trouxe — e os dois
        divergem quando parte do catalogo e mais completa que o resto.
      */}
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 border-t border-borda pt-2.5 text-xs">
        {Object.entries(ROTULOS_CAMPOS).map(([campo, rotulo]) => {
          const presente = valores[campo] !== null;
          return (
            <span
              key={campo}
              className={`inline-flex items-center gap-1 ${
                presente ? "text-emerald-700" : "text-suave"
              }`}
            >
              {presente ? <Check size={12} /> : <Minus size={12} />}
              {rotulo}
            </span>
          );
        })}
      </div>
    </div>
  );
}

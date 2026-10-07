"use client";

import Campo, { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import MensagensDoCampo, { problemasDoCampo } from "@/components/anuncios/ml/MensagensDoCampo";
import { LIMITE_DA_DESCRIPTION_SEO, LIMITE_DO_TITULO_SEO, descriptionPadrao, tituloSeoPadrao } from "@/lib/canaisDeVenda/li/seo";
import { slugDe } from "@/lib/canaisDeVenda/li/slug";

function Contador({ tamanho, limite }) {
  return <span className={`ml-auto shrink-0 text-[11px] tabular-nums ${tamanho > limite ? "font-medium text-red-700" : "text-suave"}`}>{tamanho}/{limite}</span>;
}

/**
 * Aba SEO: o endereco do produto na loja (slug), o titulo e a description que o Google mostra. Os
 * limites (70 e 250) sao os da LI; acima disso o envio corta na ultima palavra inteira.
 *
 * Mudar o slug de um produto que ja esta na loja troca a URL pelo /alias da LI, que redireciona a
 * antiga (301): o Google segue o redirecionamento, mas a troca nao e de graca, e o aviso diz isso.
 */
export default function AbaSEO({ rascunho, alterar, problemas, vinculo, slugOriginal }) {
  const seo = rascunho.seo ?? { title: "", description: "" };
  const alterarSeo = (parcial) => alterar((atual) => ({ seo: { ...(atual.seo ?? { title: "", description: "" }), ...parcial } }));
  const erroDoSlug = problemasDoCampo(problemas, "slug")[0]?.problema;
  const trocaUrl = Boolean(vinculo?.idExterno) && slugOriginal && rascunho.slug !== slugOriginal;
  const tituloNaBusca = seo.title?.trim() || rascunho.titulo || "Titulo do produto";
  const descriptionNaBusca = seo.description?.trim() || "Sem description: o Google escolhe um trecho da pagina.";

  return (
    <div className="space-y-5">
      <Campo nome="li-slug" rotulo="Endereco na loja (slug)" ajuda="So letras minusculas sem acento, numeros e hifens, ate 100.">
        <div className="flex gap-2">
          <input
            id="li-slug"
            value={rascunho.slug ?? ""}
            onChange={(evento) => alterar({ slug: evento.target.value.toLowerCase() })}
            className={`${CLASSE_CAMPO} ${bordaDoCampo(erroDoSlug)}`}
          />
          <button
            type="button"
            onClick={() => alterar((atual) => ({ slug: slugDe(atual.titulo) }))}
            className="mt-1 shrink-0 rounded border border-borda px-3 text-xs hover:bg-fundo"
          >
            Gerar do nome
          </button>
        </div>
        {erroDoSlug && <p className="mt-1 text-[11px] text-red-700">{erroDoSlug}</p>}
        {trocaUrl && (
          <p className="mt-1 text-[11px] text-amber-700">
            A URL antiga (/{slugOriginal}) vai redirecionar (301) para a nova no Sincronizar. Troque so se valer a pena: o Google ja indexou a antiga.
          </p>
        )}
      </Campo>

      <Campo nome="li-seo-titulo" rotulo="Titulo para o Google (title)">
        <input id="li-seo-titulo" value={seo.title ?? ""} onChange={(evento) => alterarSeo({ title: evento.target.value })} className={`${CLASSE_CAMPO} border-borda focus:border-acento`} />
        <div className="mt-1 flex items-center gap-3">
          <button type="button" onClick={() => alterar((atual) => ({ seo: { ...(atual.seo ?? {}), title: tituloSeoPadrao(atual.titulo) } }))} className="text-[11px] text-acento hover:underline">
            Usar padrao (o nome)
          </button>
          <Contador tamanho={(seo.title ?? "").trim().length} limite={LIMITE_DO_TITULO_SEO} />
        </div>
        <MensagensDoCampo problemas={problemas} campo="seoTitulo" />
      </Campo>

      <Campo nome="li-seo-description" rotulo="Descricao para o Google (meta description)">
        <textarea
          id="li-seo-description"
          rows={3}
          value={seo.description ?? ""}
          onChange={(evento) => alterarSeo({ description: evento.target.value })}
          className={`${CLASSE_CAMPO} resize-y border-borda focus:border-acento`}
        />
        <div className="mt-1 flex items-center gap-3">
          <button
            type="button"
            onClick={() => alterar((atual) => ({ seo: { ...(atual.seo ?? {}), description: descriptionPadrao(atual.descricao, atual.titulo) } }))}
            className="text-[11px] text-acento hover:underline"
          >
            Usar padrao (o primeiro paragrafo da descricao)
          </button>
          <Contador tamanho={(seo.description ?? "").trim().length} limite={LIMITE_DA_DESCRIPTION_SEO} />
        </div>
        <MensagensDoCampo problemas={problemas} campo="seoDescription" />
      </Campo>

      <div className="rounded border border-borda bg-fundo p-3">
        <p className="text-xs text-suave">Como aparece na busca do Google (aproximado)</p>
        <p className="mt-2 truncate text-[17px] text-blue-800">{tituloNaBusca.slice(0, LIMITE_DO_TITULO_SEO)}</p>
        <p className="truncate text-xs text-emerald-800">/{rascunho.slug || "endereco-do-produto"}</p>
        <p className="mt-0.5 line-clamp-2 text-sm text-suave">{descriptionNaBusca.slice(0, LIMITE_DA_DESCRIPTION_SEO)}</p>
      </div>
    </div>
  );
}

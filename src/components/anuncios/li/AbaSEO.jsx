"use client";

import { useEffect, useState, useTransition } from "react";
import { ExternalLink, Loader, Sparkles } from "lucide-react";

import { gerarSeoIALI, seoConcorrentesLI } from "@/app/canais-de-venda/loja-integrada/acoes";
import { CLASSE_CAMPO } from "@/components/cadastros/Campo";
import MensagensDoCampo from "@/components/anuncios/ml/MensagensDoCampo";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { LIMITE_DA_DESCRIPTION_SEO, LIMITE_DO_TITULO_SEO, cortarNaFrase, descriptionPadrao, tituloSeoPadrao } from "@/lib/canaisDeVenda/li/seo";
import { slugDaUrl, slugDe } from "@/lib/canaisDeVenda/li/slug";

const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });

/** Contador no formato da LI ("54 de 70 caracteres"), vermelho acima do limite. */
function Contador({ tamanho, limite }) {
  return <span className={`shrink-0 text-xs tabular-nums ${tamanho > limite ? "font-medium text-red-700" : "text-suave"}`}>{tamanho} de {limite} caracteres</span>;
}

function Rotulo({ htmlFor, texto, tamanho, limite, ajuda }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <label htmlFor={htmlFor} className="flex items-center gap-1 text-sm font-semibold">
        {texto}
        {ajuda && <BolhaDeAjuda texto={ajuda} variante="inline" />}
      </label>
      {limite && <Contador tamanho={tamanho} limite={limite} />}
    </div>
  );
}

async function chamar(acao, ...argumentos) {
  try {
    return await acao(...argumentos);
  } catch {
    return { ok: false, erro: "Nao foi possivel falar com o servidor. Tente de novo." };
  }
}

/**
 * O SEO dos concorrentes salvos no produto, para comparar e, se quiser, usar como ponto de partida.
 * "Usar" leva o texto limpo e cortado na ultima frase inteira que cabe no limite da LI.
 */
function SeoDosConcorrentes({ produtoId, alterarSeo }) {
  const [estado, setEstado] = useState({ carregando: true, lista: [], erro: null });

  useEffect(() => {
    let vivo = true;
    (async () => {
      const resultado = produtoId ? await chamar(seoConcorrentesLI, produtoId) : { ok: true, concorrentes: [] };
      if (!vivo) return;
      setEstado(resultado.ok ? { carregando: false, lista: resultado.concorrentes, erro: null } : { carregando: false, lista: [], erro: resultado.erro });
    })();
    return () => {
      vivo = false;
    };
  }, [produtoId]);

  return (
    <section aria-label="SEO dos concorrentes" className="rounded border border-borda p-3">
      <p className="text-sm font-semibold">SEO dos concorrentes</p>
      <p className="mt-0.5 text-xs text-suave">
        Dos concorrentes salvos no produto (aba Fornecedores / Concorrentes do cadastro), como a coleta leu a pagina deles. Copiar igual nao ajuda no Google:
        use como ponto de partida e ajuste.
      </p>
      {estado.carregando && (
        <p className="mt-2 flex items-center gap-2 text-xs text-suave">
          <Loader size={13} className="animate-spin" />
          Lendo os concorrentes...
        </p>
      )}
      {estado.erro && <p className="mt-2 text-xs text-red-700">{estado.erro}</p>}
      {!estado.carregando && !estado.erro && estado.lista.length === 0 && (
        <p className="mt-2 text-xs text-suave">Nenhum concorrente salvo com SEO coletado. Vincule concorrentes no cadastro do produto (lupa do Nome).</p>
      )}
      <ul className="mt-2 space-y-2">
        {estado.lista.map((item) => (
          <li key={item.id} className="rounded border border-borda bg-fundo/50 p-2.5 text-xs">
            <p className="flex flex-wrap items-center gap-x-2 text-suave">
              <span className="font-medium text-texto">{item.loja}</span>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-acento hover:underline">
                  {item.nome || "pagina"}
                  <ExternalLink size={11} />
                </a>
              ) : (
                <span>{item.nome}</span>
              )}
              {item.coletadoEm && <span>· coletado em {DATA.format(new Date(item.coletadoEm))}</span>}
            </p>
            {item.title && (
              <div className="mt-1.5">
                <p>
                  <span className="text-suave">Title ({item.title.length}):</span> {item.title}
                </p>
                <button type="button" onClick={() => alterarSeo({ title: cortarNaFrase(item.title, LIMITE_DO_TITULO_SEO) })} className="mt-0.5 text-acento hover:underline">
                  Usar este titulo
                </button>
              </div>
            )}
            {item.description && (
              <div className="mt-1.5">
                <p>
                  <span className="text-suave">Description ({item.description.length}):</span> {item.description}
                </p>
                <button
                  type="button"
                  onClick={() => alterarSeo({ description: cortarNaFrase(item.description, LIMITE_DA_DESCRIPTION_SEO) })}
                  className="mt-0.5 text-acento hover:underline"
                >
                  Usar esta descricao
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Aba SEO, com os nomes e a ordem da tela da Loja Integrada (pedido do dono em 07/10/2026): Tag
 * Title, Meta Tag Description e URL do produto. Os limites (70 e 250) sao os da LI; acima disso o
 * envio corta.
 *
 * A URL sai SEMPRE do nome do produto (decisao do dono em 07/10/2026): o campo e so leitura. Produto
 * que ja esta na loja muda de URL no proximo Sincronizar (o /alias da LI redireciona a antiga com
 * 301), e o aviso mostra a URL de verdade de hoje (`vinculo.urlExterna`; a antiga pode ser
 * "/produto/<slug>.html").
 */
export default function AbaSEO({ rascunho, contexto, alterar, problemas, vinculo }) {
  const seo = rascunho.seo ?? { title: "", description: "" };
  const alterarSeo = (parcial) => alterar((atual) => ({ seo: { ...(atual.seo ?? { title: "", description: "" }), ...parcial } }));
  const [opcoesIA, setOpcoesIA] = useState([]);
  const [erroIA, setErroIA] = useState(null);
  const [gerando, iniciarGeracao] = useTransition();

  const dominio = contexto.dominioDaLoja || "https://www.4hobby.com.br";
  const slug = slugDe(rascunho.titulo);
  const slugNaLoja = slugDaUrl(vinculo?.urlExterna);
  const trocaUrl = Boolean(vinculo?.idExterno) && Boolean(slugNaLoja) && Boolean(slug) && slug !== slugNaLoja;
  const tituloNaBusca = seo.title?.trim() || rascunho.titulo || "Titulo do produto";
  const descriptionNaBusca = seo.description?.trim() || "Sem description: o Google escolhe um trecho da pagina.";

  function gerarComIA() {
    setErroIA(null);
    iniciarGeracao(async () => {
      const resultado = await chamar(gerarSeoIALI, rascunho.produtoId, rascunho.titulo ?? "");
      if (resultado.ok) setOpcoesIA(resultado.opcoes);
      else setErroIA(resultado.erro);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Rotulo htmlFor="li-seo-titulo" texto="Tag Title - Titulo do produto" tamanho={(seo.title ?? "").trim().length} limite={LIMITE_DO_TITULO_SEO} />
        <input id="li-seo-titulo" value={seo.title ?? ""} onChange={(evento) => alterarSeo({ title: evento.target.value })} className={`${CLASSE_CAMPO} border-borda focus:border-acento`} />
        <button type="button" onClick={() => alterar((atual) => ({ seo: { ...(atual.seo ?? {}), title: tituloSeoPadrao(atual.titulo) } }))} className="mt-1 text-[11px] text-acento hover:underline">
          Usar padrao (o nome)
        </button>
        <MensagensDoCampo problemas={problemas} campo="seoTitulo" />
      </div>

      <div>
        <Rotulo
          htmlFor="li-seo-description"
          texto="Meta Tag Description - Descricao / Resumo"
          tamanho={(seo.description ?? "").trim().length}
          limite={LIMITE_DA_DESCRIPTION_SEO}
          ajuda="O resumo que o Google mostra embaixo do titulo. O ideal e de 140 a 160 caracteres: o Google corta o que passa."
        />
        <textarea
          id="li-seo-description"
          rows={3}
          value={seo.description ?? ""}
          onChange={(evento) => alterarSeo({ description: evento.target.value })}
          className={`${CLASSE_CAMPO} resize-y border-borda focus:border-acento`}
        />
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            onClick={() => alterar((atual) => ({ seo: { ...(atual.seo ?? {}), description: descriptionPadrao(contexto.produto?.descricaoBase, atual.titulo) } }))}
            className="text-[11px] text-acento hover:underline"
          >
            Usar padrao (as primeiras frases da descricao)
          </button>
          <button
            type="button"
            onClick={gerarComIA}
            disabled={gerando || !rascunho.produtoId}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-acento hover:underline disabled:opacity-60"
          >
            {gerando ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {gerando ? "Gerando com IA..." : opcoesIA.length ? "Gerar outras opcoes com IA" : "Gerar com IA"}
          </button>
        </div>
        {erroIA && <p className="mt-1 text-[11px] text-red-700">{erroIA}</p>}
        {opcoesIA.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {opcoesIA.map((opcao) => (
              <li key={opcao} className="flex items-start gap-3 rounded border border-violet-200 bg-violet-50/60 p-2 text-xs">
                <span className="min-w-0 flex-1">
                  {opcao} <span className="text-suave">({opcao.length})</span>
                </span>
                <button type="button" onClick={() => alterarSeo({ description: opcao })} className="shrink-0 rounded border border-violet-300 bg-white px-2 py-1 text-[11px] text-violet-800 hover:bg-violet-50">
                  Usar esta
                </button>
              </li>
            ))}
          </ul>
        )}
        <MensagensDoCampo problemas={problemas} campo="seoDescription" />
      </div>

      <div>
        <Rotulo htmlFor="li-slug" texto="URL do produto" ajuda="Sai do nome do produto (aba Geral) e muda junto com ele. So letras minusculas sem acento, numeros e hifens." />
        <div className="mt-1 flex items-stretch overflow-hidden rounded border border-borda bg-fundo text-[15px]">
          <span className="shrink-0 border-r border-borda px-2.5 py-2 text-suave">{dominio}/</span>
          <input id="li-slug" readOnly value={slug} className="min-w-0 flex-1 bg-transparent px-2.5 py-2 font-medium text-texto focus:outline-none" />
        </div>
        <MensagensDoCampo problemas={problemas} campo="slug" />
        {trocaUrl && (
          <p className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Hoje o produto esta na loja em <span className="font-medium break-all">{vinculo.urlExterna}</span>. No Sincronizar a URL passa a ser{" "}
            <span className="font-medium break-all">
              {dominio}/{slug}
            </span>
            , e a antiga redireciona (301) para a nova. Cada troca de nome muda a URL de novo.
          </p>
        )}
      </div>

      <div className="rounded border border-borda bg-fundo p-3">
        <p className="text-xs text-suave">Como aparece na busca do Google (aproximado)</p>
        <p className="mt-2 truncate text-[17px] text-blue-800">{tituloNaBusca.slice(0, LIMITE_DO_TITULO_SEO)}</p>
        <p className="truncate text-xs text-emerald-800">
          {dominio}/{slug || "endereco-do-produto"}
        </p>
        <p className="mt-0.5 line-clamp-2 text-sm text-suave">{descriptionNaBusca.slice(0, LIMITE_DA_DESCRIPTION_SEO)}</p>
      </div>

      <SeoDosConcorrentes produtoId={rascunho.produtoId} alterarSeo={alterarSeo} />
    </div>
  );
}

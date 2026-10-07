"use client";

import { useEffect, useState, useTransition } from "react";
import { ExternalLink, ListChecks, Loader, Sparkles, X } from "lucide-react";

import { gerarSeoIALI, seoConcorrentesLI } from "@/app/canais-de-venda/loja-integrada/acoes";
import { CLASSE_CAMPO } from "@/components/cadastros/Campo";
import MensagensDoCampo from "@/components/anuncios/ml/MensagensDoCampo";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { LIMITE_DA_DESCRIPTION_SEO, LIMITE_DO_TITULO_SEO, cortarNaFrase } from "@/lib/canaisDeVenda/li/seo";
import { slugDe } from "@/lib/canaisDeVenda/li/slug";

const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });

async function chamar(acao, ...argumentos) {
  try {
    return await acao(...argumentos);
  } catch {
    return { ok: false, erro: "Não foi possível falar com o servidor. Tente de novo." };
  }
}

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

function Opcao({ texto, detalhe, selo, aoEscolher }) {
  return (
    <li>
      <button type="button" onClick={() => aoEscolher(texto)} className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-fundo">
        <span className="block">{texto}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-suave">
          {selo && <span className="rounded bg-violet-100 px-1 font-medium text-violet-800">{selo}</span>}
          <span className="tabular-nums">{texto.length} caracteres</span>
          {detalhe}
        </span>
      </button>
    </li>
  );
}

function DeOnde({ item }) {
  return (
    <>
      <span>{item.loja}</span>
      {item.coletadoEm && <span>coletado em {DATA.format(new Date(item.coletadoEm))}</span>}
      {item.url && (
        <a href={item.url} target="_blank" rel="noreferrer" onClick={(evento) => evento.stopPropagation()} className="inline-flex items-center gap-0.5 text-acento hover:underline">
          página
          <ExternalLink size={10} />
        </a>
      )}
    </>
  );
}

/**
 * Ícone de lista ao lado do campo, no molde do "Escolher o título" do cadastro de Produto (pedido do dono
 * em 07/10/2026): abre as opções e nada vai para o campo até clicar numa delas. A lista abre colada ao
 * campo, por cima do resto da aba; clicar fora fecha.
 */
function ListaDeOpcoes({ rotulo, aberta, aoAlternar, carregando, children }) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={aoAlternar}
        aria-label={rotulo}
        aria-expanded={aberta}
        title={rotulo}
        className="rounded border border-sky-300 p-2.5 text-acento hover:bg-fundo"
      >
        {carregando ? <Loader size={18} className="animate-spin" /> : <ListChecks size={18} />}
      </button>
      {aberta && (
        <>
          <div className="fixed inset-0 z-30" onClick={aoAlternar} />
          <div className="absolute top-full right-0 z-40 mt-2 w-[36rem] max-w-[calc(100vw-4rem)] rounded-lg border border-borda bg-superficie p-2 shadow-xl">
            <div className="flex items-center justify-between px-2 pt-1 pb-2">
              <span className="text-sm font-semibold">{rotulo}</span>
              <button type="button" onClick={aoAlternar} aria-label="Fechar a lista" className="rounded p-1 text-suave hover:bg-fundo">
                <X size={14} />
              </button>
            </div>
            {children}
            <p className="mt-2 border-t border-borda px-2 pt-2 text-[11px] text-suave">
              Copiar igual ao concorrente não ajuda no Google: use como ponto de partida e ajuste.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

const SECAO = "px-2 pb-1 text-[11px] font-semibold tracking-wide text-suave uppercase";

/**
 * Aba SEO, com os nomes e a ordem da tela da Loja Integrada: Tag Title, Meta Tag Description e URL do
 * produto. Pedidos do dono em 07/10/2026:
 * - os dois campos sao OBRIGATORIOS para enviar (a validacao bloqueia) e travados no limite: 70 no
 *   title e 160 na description (o que o Google mostra);
 * - sem "Usar padrao": a description vem do icone de lista ao lado do campo (o SEO dos concorrentes
 *   salvos no produto e "Gerar com IA"). O title nao tem lista (o dono dispensou): nasce com o nome e
 *   e digitado.
 *
 * A URL e so leitura. Produto que ja esta na loja mostra a URL de hoje e ela nao muda (o Google ja a
 * indexou); produto novo mostra a que vai nascer do nome no Cadastrar.
 */
export default function AbaSEO({ rascunho, contexto, alterar, problemas, vinculo }) {
  const seo = rascunho.seo ?? { title: "", description: "" };
  const alterarSeo = (parcial) => alterar((atual) => ({ seo: { ...(atual.seo ?? { title: "", description: "" }), ...parcial } }));
  const [concorrentes, setConcorrentes] = useState({ carregando: true, lista: [], erro: null });
  const [aberta, setAberta] = useState(null);
  const [opcoesIA, setOpcoesIA] = useState([]);
  const [erroIA, setErroIA] = useState(null);
  const [gerando, iniciarGeracao] = useTransition();

  const produtoId = rascunho.produtoId;
  useEffect(() => {
    let vivo = true;
    (async () => {
      const resultado = produtoId ? await chamar(seoConcorrentesLI, produtoId) : { ok: true, concorrentes: [] };
      if (!vivo) return;
      setConcorrentes(resultado.ok ? { carregando: false, lista: resultado.concorrentes, erro: null } : { carregando: false, lista: [], erro: resultado.erro });
    })();
    return () => {
      vivo = false;
    };
  }, [produtoId]);

  const dominio = contexto.dominioDaLoja || "https://www.4hobby.com.br";
  // Produto que ja esta na loja fica com a URL de hoje (decisao do dono em 07/10/2026: o Google ja a
  // indexou); so o produto novo nasce com a URL do nome, no Cadastrar.
  const naLoja = Boolean(vinculo?.idExterno) && /^https?:\/\//i.test(String(vinculo?.urlExterna ?? ""));
  const caminhoDaLoja = naLoja ? String(vinculo.urlExterna).replace(/^https?:\/\/[^/]+\/?/i, "") : null;
  const slug = slugDe(rascunho.titulo);
  const caminho = naLoja ? caminhoDaLoja : slug;
  const tituloNaBusca = seo.title?.trim() || rascunho.titulo || "Título do produto";
  const descriptionNaBusca = seo.description?.trim() || "Sem description: o Google escolhe um trecho da página.";

  const comDescription = concorrentes.lista.filter((item) => item.description);

  function escolherDescription(texto) {
    setAberta(null);
    alterarSeo({ description: cortarNaFrase(texto, LIMITE_DA_DESCRIPTION_SEO) });
  }
  function gerarComIA() {
    setErroIA(null);
    iniciarGeracao(async () => {
      const resultado = await chamar(gerarSeoIALI, produtoId, rascunho.titulo ?? "");
      if (resultado.ok) setOpcoesIA(resultado.opcoes);
      else setErroIA(resultado.erro);
    });
  }
  const alternar = (qual) => () => setAberta((atual) => (atual === qual ? null : qual));
  const avisoDaLista = concorrentes.erro ? (
    <p className="px-2 pb-2 text-xs text-red-700">{concorrentes.erro}</p>
  ) : concorrentes.carregando ? (
    <p className="flex items-center gap-2 px-2 pb-2 text-xs text-suave">
      <Loader size={12} className="animate-spin" />
      Lendo os concorrentes...
    </p>
  ) : null;

  return (
    <div className="space-y-6">
      <div>
        <Rotulo htmlFor="li-seo-titulo" texto="Tag Title - Título do produto" tamanho={(seo.title ?? "").trim().length} limite={LIMITE_DO_TITULO_SEO} />
        <input
          id="li-seo-titulo"
          value={seo.title ?? ""}
          maxLength={LIMITE_DO_TITULO_SEO}
          onChange={(evento) => alterarSeo({ title: evento.target.value })}
          className={`${CLASSE_CAMPO} border-borda focus:border-acento`}
        />
        <MensagensDoCampo problemas={problemas} campo="seoTitulo" />
      </div>

      <div>
        <Rotulo
          htmlFor="li-seo-description"
          texto="Meta Tag Description - Descrição / Resumo"
          tamanho={(seo.description ?? "").trim().length}
          limite={LIMITE_DA_DESCRIPTION_SEO}
          ajuda="O resumo que o Google mostra embaixo do título. Vai até 160 caracteres, que é o que o Google mostra."
        />
        <div className="flex items-start gap-2">
          <textarea
            id="li-seo-description"
            rows={3}
            value={seo.description ?? ""}
            maxLength={LIMITE_DA_DESCRIPTION_SEO}
            onChange={(evento) => alterarSeo({ description: evento.target.value })}
            className={`${CLASSE_CAMPO} resize-y border-borda focus:border-acento`}
          />
          <div className="mt-1">
            <ListaDeOpcoes rotulo="Escolher a descrição" aberta={aberta === "description"} aoAlternar={alternar("description")} carregando={concorrentes.carregando || gerando}>
              <p className={SECAO}>Dos concorrentes ({comDescription.length})</p>
              {avisoDaLista}
              {!concorrentes.carregando && comDescription.length === 0 && (
                <p className="px-2 pb-2 text-xs text-suave">Nenhum concorrente salvo com descrição coletada. Vincule concorrentes no cadastro do produto.</p>
              )}
              <ul className="max-h-60 space-y-1 overflow-y-auto">
                {comDescription.map((item) => (
                  <Opcao
                    key={item.id}
                    texto={cortarNaFrase(item.description, LIMITE_DA_DESCRIPTION_SEO)}
                    detalhe={
                      <>
                        <DeOnde item={item} />
                        {item.description.length > LIMITE_DA_DESCRIPTION_SEO && <span>(o original tem {item.description.length}; vai cortado na frase)</span>}
                      </>
                    }
                    aoEscolher={escolherDescription}
                  />
                ))}
              </ul>

              <div className="mt-2 border-t border-borda pt-2">
                <p className={SECAO}>Com IA</p>
                {opcoesIA.length > 0 && (
                  <ul className="space-y-1">
                    {opcoesIA.map((opcao) => (
                      <Opcao key={opcao} texto={opcao} selo="IA" aoEscolher={escolherDescription} />
                    ))}
                  </ul>
                )}
                {erroIA && <p className="px-2 py-1 text-xs text-red-700">{erroIA}</p>}
                {opcoesIA.length > 0 ? (
                  <button
                    type="button"
                    onClick={gerarComIA}
                    disabled={gerando || !produtoId}
                    className="mt-1 inline-flex items-center gap-1.5 px-2 py-1 text-xs text-acento hover:underline disabled:opacity-60"
                  >
                    {gerando ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    {gerando ? "Escrevendo..." : "Gerar outras opções"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={gerarComIA}
                    disabled={gerando || !produtoId}
                    className="flex w-full items-center gap-2 rounded border border-dashed border-acento px-3 py-2 text-left text-sm font-medium text-acento hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {gerando ? <Loader size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    <span>{gerando ? "Escrevendo as descrições..." : "Gerar com IA"}</span>
                    <span className="ml-auto text-[11px] font-normal text-suave">3 opções de 140 a 160 caracteres</span>
                  </button>
                )}
              </div>
            </ListaDeOpcoes>
          </div>
        </div>
        <MensagensDoCampo problemas={problemas} campo="seoDescription" />
      </div>

      <div>
        <Rotulo
          htmlFor="li-slug"
          texto="URL do produto"
          ajuda={
            naLoja
              ? "A URL de produto que já está na loja não muda: o Google já a indexou. O Sincronizar não mexe nela."
              : "Produto novo: a URL sai do nome do produto (aba Características) no Cadastrar na LI. Só letras minúsculas sem acento, números e hifens."
          }
        />
        <div className="mt-1 flex items-stretch overflow-hidden rounded border border-borda bg-fundo text-[15px]">
          <span className="shrink-0 border-r border-borda px-2.5 py-2 text-suave">{dominio}/</span>
          <input id="li-slug" readOnly value={caminho ?? ""} className="min-w-0 flex-1 bg-transparent px-2.5 py-2 font-medium text-texto focus:outline-none" />
        </div>
        <MensagensDoCampo problemas={problemas} campo="slug" />
        <p className="mt-1 text-[11px] text-suave">
          {naLoja ? "Como está na loja hoje. Fica assim, mesmo se o nome mudar." : "Vai ser a URL do produto quando ele for cadastrado na loja."}
        </p>
      </div>

      <div className="rounded border border-borda bg-fundo p-3">
        <p className="text-xs text-suave">Como aparece na busca do Google (aproximado)</p>
        <p className="mt-2 truncate text-[17px] text-blue-800">{tituloNaBusca.slice(0, LIMITE_DO_TITULO_SEO)}</p>
        <p className="truncate text-xs text-emerald-800">
          {dominio}/{caminho || "endereco-do-produto"}
        </p>
        <p className="mt-0.5 line-clamp-2 text-sm text-suave">{descriptionNaBusca.slice(0, LIMITE_DA_DESCRIPTION_SEO)}</p>
      </div>
    </div>
  );
}

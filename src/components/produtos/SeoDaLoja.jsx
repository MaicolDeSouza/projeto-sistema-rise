"use client";

import { useEffect, useState, useTransition } from "react";
import { ExternalLink, ListChecks, Loader, Sparkles, X } from "lucide-react";

import { gerarSeoDoProduto, seoDosConcorrentesDoProduto } from "@/app/produtos/acoes-loja";
import { CLASSE_CAMPO } from "@/components/cadastros/Campo";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import GastoDaIA from "@/components/ui/GastoDaIA";
import { LIMITE_DA_DESCRIPTION_SEO, LIMITE_DO_TITULO_SEO, cortarNaFrase, tituloSeoPadrao } from "@/lib/canaisDeVenda/li/seo";

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
 * Icone de lista ao lado do campo, no molde do "Escolher o titulo" do cadastro: abre as opcoes e nada vai para o campo ate
 * clicar numa delas. A lista abre colada ao campo, por cima do resto da aba; clicar fora fecha.
 */
function ListaDeOpcoes({ rotulo, aberta, aoAlternar, carregando, children }) {
  return (
    <div className="relative shrink-0">
      <button type="button" onClick={aoAlternar} aria-label={rotulo} aria-expanded={aberta} title={rotulo} className="rounded border border-sky-300 p-2.5 text-acento hover:bg-fundo">
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
            <p className="mt-2 border-t border-borda px-2 pt-2 text-[11px] text-suave">Copiar igual ao concorrente não ajuda no Google: use como ponto de partida e ajuste.</p>
          </div>
        </>
      )}
    </div>
  );
}

const SECAO = "px-2 pb-1 text-[11px] font-semibold tracking-wide text-suave uppercase";

/**
 * Aba SEO do cadastro de Produto (pedido do dono em 25/10/2026: o SEO da Loja Integrada passou do editor da LI para o produto
 * base; a aba da LI so mostra). Tag Title e Meta Tag Description sao DO PRODUTO (`seoTituloLI` e `seoDescricaoLI`), travados no
 * que o Google mostra (70 e 160) e obrigatorios para sincronizar com a LI (a validacao da LI manda preencher aqui).
 *
 * - Tag Title vazio abre preenchido com o nome do produto cortado em 70 (o que o rascunho novo da LI fazia): so na primeira
 *   vez que a aba abre e enquanto o dono nao tiver mexido, e so vira dado no Salvar.
 * - A description vem do icone de lista ao lado do campo: o SEO dos concorrentes salvos no produto (pede o dado Concorrentes) e
 *   "Gerar com IA" (3 opcoes de 140 a 160 caracteres).
 * O texto vai no Salvar pelos proprios campos (`name`), como os outros do formulario. A URL do produto fica so na LI.
 */
export default function SeoDaLoja({ produtoId, inicialTitulo = "", inicialDescricao = "", lerCampo, aoAlterar, ativo, acessos = { concorrentes: true, ia: true } }) {
  const [titulo, setTitulo] = useState(String(inicialTitulo ?? ""));
  const [descricao, setDescricao] = useState(String(inicialDescricao ?? ""));
  const [mexeuNoTitulo, setMexeuNoTitulo] = useState(false);
  const [pediu, setPediu] = useState(false);
  const [concorrentes, setConcorrentes] = useState({ lista: [], erro: null, lida: false });
  const [aberta, setAberta] = useState(null);
  const [opcoesIA, setOpcoesIA] = useState([]);
  const [erroIA, setErroIA] = useState(null);
  const [gastoIA, setGastoIA] = useState(null);
  const [gerando, iniciarGeracao] = useTransition();

  // Na PRIMEIRA vez que a aba abre (ajuste de estado durante a renderizacao, o padrao do React 19 no lugar de setState em
  // efeito): o Tag Title vazio e ainda nao mexido ganha o nome do produto cortado em 70, e a lista dos concorrentes e pedida.
  if (ativo && !pediu) {
    setPediu(true);
    if (!titulo.trim() && !mexeuNoTitulo) setTitulo(tituloSeoPadrao(lerCampo("tituloBase")));
  }

  // O pedido dos concorrentes (so com o dado Concorrentes) sai uma vez; produto novo nao tem concorrente salvo.
  useEffect(() => {
    if (!pediu) return;
    (async () => {
      const resultado = produtoId && acessos.concorrentes ? await chamar(seoDosConcorrentesDoProduto, produtoId) : { ok: true, concorrentes: [] };
      setConcorrentes(resultado.ok ? { lista: resultado.concorrentes, erro: null, lida: true } : { lista: [], erro: resultado.erro, lida: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pediu]);

  const lendoConcorrentes = pediu && !concorrentes.lida;
  const comDescription = concorrentes.lista.filter((item) => item.description);

  function escolherDescription(texto) {
    setAberta(null);
    setDescricao(cortarNaFrase(texto, LIMITE_DA_DESCRIPTION_SEO));
    aoAlterar?.();
  }
  function gerarComIA() {
    setErroIA(null);
    iniciarGeracao(async () => {
      const resultado = await chamar(gerarSeoDoProduto, produtoId ?? null, { titulo: lerCampo("tituloBase"), descricao: lerCampo("descricaoBase") });
      // O gasto vem tambem no erro (a chamada que falhou no meio ja foi cobrada).
      setGastoIA(resultado.gasto ?? null);
      if (resultado.ok) setOpcoesIA(resultado.opcoes);
      else setErroIA(resultado.erro);
    });
  }
  const alternar = (qual) => () => setAberta((atual) => (atual === qual ? null : qual));
  const avisoDaLista = concorrentes.erro ? (
    <p className="px-2 pb-2 text-xs text-red-700">{concorrentes.erro}</p>
  ) : lendoConcorrentes ? (
    <p className="flex items-center gap-2 px-2 pb-2 text-xs text-suave">
      <Loader size={12} className="animate-spin" />
      Lendo os concorrentes...
    </p>
  ) : null;

  return (
    <div className="space-y-6">
      <div>
        <Rotulo htmlFor="produto-seo-titulo" texto="Tag Title - Título do produto" tamanho={titulo.trim().length} limite={LIMITE_DO_TITULO_SEO} />
        <input
          id="produto-seo-titulo"
          name="seoTituloLI"
          value={titulo}
          maxLength={LIMITE_DO_TITULO_SEO}
          onChange={(evento) => {
            setTitulo(evento.target.value);
            setMexeuNoTitulo(true);
            aoAlterar?.();
          }}
          className={`${CLASSE_CAMPO} border-borda focus:border-acento`}
        />
      </div>

      <div>
        <Rotulo
          htmlFor="produto-seo-description"
          texto="Meta Tag Description - Descrição / Resumo"
          tamanho={descricao.trim().length}
          limite={LIMITE_DA_DESCRIPTION_SEO}
          ajuda="O resumo que o Google mostra embaixo do título. Vai até 160 caracteres, que é o que o Google mostra."
        />
        <div className="flex items-start gap-2">
          <textarea
            id="produto-seo-description"
            name="seoDescricaoLI"
            rows={3}
            value={descricao}
            maxLength={LIMITE_DA_DESCRIPTION_SEO}
            onChange={(evento) => {
              setDescricao(evento.target.value);
              aoAlterar?.();
            }}
            className={`${CLASSE_CAMPO} resize-y border-borda focus:border-acento`}
          />
          <div className="mt-1">
            <ListaDeOpcoes rotulo="Escolher a descrição" aberta={aberta === "description"} aoAlternar={alternar("description")} carregando={lendoConcorrentes || gerando}>
              {/* "Com IA" no TOPO (pedido do dono em 24/10/2026): no fim, com muitos concorrentes, ficava abaixo da tela. */}
              {acessos.ia && (
                <div className="mb-2 border-b border-borda pb-2">
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
                    <button type="button" onClick={gerarComIA} disabled={gerando} className="mt-1 inline-flex items-center gap-1.5 px-2 py-1 text-xs text-acento hover:underline disabled:opacity-60">
                      {gerando ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      {gerando ? "Escrevendo..." : "Gerar outras opções"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={gerarComIA}
                      disabled={gerando}
                      className="flex w-full items-center gap-2 rounded border border-dashed border-acento px-3 py-2 text-left text-sm font-medium text-acento hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {gerando ? <Loader size={16} className="animate-spin" /> : <Sparkles size={16} />}
                      <span>{gerando ? "Escrevendo as descrições..." : "Gerar com IA"}</span>
                      <span className="ml-auto text-[11px] font-normal text-suave">3 opções de 140 a 160 caracteres</span>
                    </button>
                  )}
                  {/* Quanto custou a ultima geracao (pedido do dono em 12/10/2026). */}
                  <GastoDaIA gasto={gastoIA} className="px-2 pt-1" />
                </div>
              )}
              <p className={SECAO}>Dos concorrentes ({comDescription.length})</p>
              {avisoDaLista}
              {!lendoConcorrentes && comDescription.length === 0 && (
                <p className="px-2 pb-2 text-xs text-suave">Nenhum concorrente salvo com descrição coletada. Vincule concorrentes na aba Fornecedores / Concorrentes.</p>
              )}
              <ul className="max-h-48 space-y-1 overflow-y-auto">
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
            </ListaDeOpcoes>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ChevronRight, ExternalLink, Loader, RefreshCw, X } from "lucide-react";

import { buscarCatalogosDoProdutoMLAcao, catalogosDoAnuncioMLAcao, preverCatalogoMLAcao, relerConcorrentesMLAcao } from "@/app/canais-de-venda/mercado-livre/acoes";
import { propsDoFundo } from "@/lib/fundoDaJanela";
import { textoDoResumo } from "@/lib/canaisDeVenda/ml/catalogo";
import { ROTULO_DO_TIPO_ML } from "@/lib/canaisDeVenda/ml/rotulos";
import { ResumoDaPosicao, TabelaDeConcorrentes, TabelaDoCatalogoAoVivo, urlDoCatalogo } from "./ConcorrentesDoML";
import SecaoDoAnuncio from "./SecaoDoAnuncio";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const FALHA = "Não foi possível falar com o servidor.";

/**
 * Aba Catalogo (pedido do dono em 26/10/2026: "bem simples, mostre os catalogos que estou concorrendo e se eu clicar abre
 * popup com todas as informacoes daquele catalogo"). A lista sao os catalogos em que os anuncios publicados deste produto
 * estao no ML (relidos de hora em hora); a busca, a sugestao e o ranking dos catalogos de referencia sairam. O Rise
 * acompanha sozinho o catalogo do anuncio (`seguirCatalogoDosAnuncios`); os concorrentes dele vao para o contexto do
 * editor, porque o selo "Nº de M no ML" mora ao lado do preco, na aba Preco e custos.
 */
export default function AbaCatalogo({ rascunho, alterar, setContexto, visivel = false, acessos = { concorrentes: true, editar: true } }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aberto, setAberto] = useState(null);
  const [buscadoEm, setBuscadoEm] = useState(null);
  const [buscando, iniciarBusca] = useTransition();
  const jaBuscou = useRef(false);
  const produtoId = rascunho.produtoId;

  // "Buscar no ML" (pedido do dono em 26/10/2026): rele os anuncios no ML e procura os do dono pelo SKU. Roda sozinho na
  // primeira vez que a aba aparece (todas as abas ficam montadas, entao nao na abertura do editor) e de novo pelo botao.
  function buscar() {
    iniciarBusca(async () => {
      let resposta;
      try {
        resposta = await buscarCatalogosDoProdutoMLAcao(produtoId);
      } catch {
        resposta = { ok: false, erro: FALHA };
      }
      if (!resposta?.ok) {
        setErro(resposta?.erro ?? FALHA);
        return;
      }
      setDados({ catalogos: resposta.catalogos, tela: resposta.tela });
      setContexto((atual) => ({ ...atual, concorrentesDoCatalogoML: resposta.tela.concorrentes ?? [] }));
      setBuscadoEm(new Date(resposta.buscadoEm));
      setErro(resposta.aviso ? `Não foi possível acompanhar o catálogo do anúncio: ${resposta.aviso}` : null);
    });
  }
  const buscarSozinho = useEffectEvent(buscar);
  useEffect(() => {
    if (!visivel || jaBuscou.current || !produtoId || !acessos.concorrentes) return;
    jaBuscou.current = true;
    buscarSozinho();
  }, [visivel, produtoId, acessos.concorrentes]);

  function receberTela(tela) {
    setDados((atual) => ({ ...atual, tela }));
    setContexto((atual) => ({ ...atual, concorrentesDoCatalogoML: tela.concorrentes ?? [] }));
  }

  useEffect(() => {
    if (!produtoId || !acessos.concorrentes) return undefined;
    let vivo = true;
    catalogosDoAnuncioMLAcao(produtoId)
      .then((resposta) => {
        if (!vivo) return;
        if (!resposta?.ok) return setErro(resposta?.erro ?? FALHA);
        setDados({ catalogos: resposta.catalogos, tela: resposta.tela });
        setContexto((atual) => ({ ...atual, concorrentesDoCatalogoML: resposta.tela.concorrentes ?? [] }));
        setErro(resposta.aviso ? `Não foi possível acompanhar o catálogo do anúncio: ${resposta.aviso}` : null);
      })
      .catch(() => vivo && setErro(FALHA));
    return () => {
      vivo = false;
    };
    // A leitura e so na abertura (e quando o produto muda); `setContexto` e estavel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId, acessos.concorrentes]);

  if (!acessos.concorrentes) return <p className="text-sm text-suave">Seu acesso não mostra os concorrentes do Mercado Livre.</p>;
  if (!produtoId) return <p className="text-sm text-suave">Escolha o produto do anúncio.</p>;

  const catalogos = dados?.catalogos ?? [];
  const tela = dados?.tela ?? null;
  const catalogoAberto = catalogos.find((catalogo) => catalogo.id === aberto) ?? null;

  return (
    <SecaoDoAnuncio
      titulo="Catálogos em que você concorre"
      ajuda="Os catálogos do Mercado Livre em que seus anúncios deste produto estão (os publicados pelo Rise e qualquer outro com o mesmo código). O Rise confere no ML ao abrir esta aba e de hora em hora; para entrar ou sair de um catálogo, use o painel do ML. Clique no catálogo para ver os concorrentes."
      acao={
        <span className="flex items-center gap-2">
          {buscadoEm && !buscando && <span className="text-xs text-suave">conferido às {HORA.format(buscadoEm)}</span>}
          <button
            type="button"
            onClick={buscar}
            disabled={buscando}
            title="Confere no Mercado Livre se algum anúncio deste produto está num catálogo"
            className="inline-flex items-center gap-1 rounded border border-borda bg-superficie px-2.5 py-1 text-xs font-medium text-acento hover:bg-fundo disabled:opacity-60"
          >
            <RefreshCw size={12} className={buscando ? "animate-spin" : ""} />
            {buscando ? "Buscando..." : "Buscar no ML"}
          </button>
        </span>
      }
    >
      {erro && <p role="alert" className="mb-2 text-sm text-red-700">{erro}</p>}
      {dados === null || (buscando && catalogos.length === 0) ? (
        !erro && (
          <p className="flex items-center gap-2 text-sm text-suave">
            <Loader size={14} className="animate-spin" /> {buscando ? "Conferindo no Mercado Livre..." : "Lendo..."}
          </p>
        )
      ) : catalogos.length === 0 ? (
        <p className="text-sm text-suave">Nenhum anúncio deste produto está num catálogo do Mercado Livre{buscadoEm ? "" : " (ainda não conferido no ML)"}.</p>
      ) : (
        <ul className="divide-y divide-borda rounded border border-borda">
          {catalogos.map((catalogo) => {
            const acompanhado = tela?.catalogoId === catalogo.id;
            return (
              // O link do catalogo fica FORA do botao da linha (link dentro de botao e HTML invalido): a linha abre a janela,
              // o "Abrir no ML" abre o catalogo no site em outra aba (pedido do dono em 26/10/2026).
              <li key={catalogo.id} className="flex items-center hover:bg-fundo">
                <button type="button" onClick={() => setAberto(catalogo.id)} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{catalogo.nome || catalogo.id}</span>
                    <span className="mt-0.5 block text-sm text-suave">
                      {catalogo.resumo ? <ResumoDaLinha resumo={catalogo.resumo} /> : acompanhado ? <ResumoDaPosicao posicao={tela.posicao} /> : catalogo.id}
                    </span>
                    <span className="block truncate text-xs text-suave">
                      {catalogo.anuncios.map((anuncio) => `${ROTULO_DO_TIPO_ML[anuncio.tipoAnuncio] ?? "Anúncio"} ${anuncio.idExterno}`).join(", ")}
                    </span>
                  </span>
                  {acompanhado && tela.avisos?.length > 0 && (
                    <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                      {tela.avisos.length} aviso{tela.avisos.length > 1 ? "s" : ""}
                    </span>
                  )}
                </button>
                <a
                  href={urlDoCatalogo(catalogo.id)}
                  target="_blank"
                  rel="noreferrer"
                  title={`Abre o catálogo ${catalogo.id} no Mercado Livre, em outra aba`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-borda bg-superficie px-3 py-1.5 text-sm font-medium text-acento hover:bg-fundo"
                >
                  Abrir no ML <ExternalLink size={13} />
                </a>
                <button type="button" onClick={() => setAberto(catalogo.id)} aria-label={`Ver os concorrentes de ${catalogo.nome || catalogo.id}`} className="shrink-0 px-3 py-2.5 text-suave">
                  <ChevronRight size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {catalogoAberto && (
        <JanelaDoCatalogo
          catalogo={catalogoAberto}
          tela={tela?.catalogoId === catalogoAberto.id ? tela : null}
          produtoId={produtoId}
          alterar={alterar}
          podeReler={acessos.editar !== false}
          aoReler={receberTela}
          aoFechar={() => setAberto(null)}
        />
      )}
    </SecaoDoAnuncio>
  );
}

/**
 * A linha de um catalogo (pedido do dono em 26/10/2026): "9 anúncios · 8 vendedores · você é o 2º de 9 · 1º R$ 28,90 (você
 * R$ 31,49 ▲ 9,0%)". A seta diz onde esta o SEU preco em relacao ao 1o colocado (pedido: "quantos % estou acima"), e a cor
 * segue a da coluna Diferenca da aba Concorrentes do produto: vermelho quando o concorrente esta mais barato que voce, verde
 * quando voce esta mais barato. Voce em 1o: verde, sem comparacao.
 */
function ResumoDaLinha({ resumo }) {
  const partes = [textoDoResumo(resumo)];
  const posicao = resumo.minhaPosicao ? `você é o ${resumo.minhaPosicao}º de ${resumo.anuncios}` : "você não está neste catálogo";
  const diferenca =
    resumo.meuPreco > 0 && resumo.primeiroPreco > 0 && !resumo.primeiroEhMeu ? ((resumo.meuPreco - resumo.primeiroPreco) / resumo.primeiroPreco) * 100 : null;
  const maisCaro = diferenca !== null && diferenca >= 0.05;
  const maisBarato = diferenca !== null && diferenca <= -0.05;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <span>{partes.join(" · ")} ·</span>
      <span className={resumo.minhaPosicao === 1 ? "font-medium text-emerald-700" : "font-medium text-texto"}>{posicao}</span>
      {resumo.primeiroPreco > 0 && !resumo.primeiroEhMeu && (
        <>
          <span>· 1º {MOEDA.format(resumo.primeiroPreco)}</span>
          {resumo.meuPreco > 0 && (
            <span className="tabular-nums">
              (você {MOEDA.format(resumo.meuPreco)}
              {(maisCaro || maisBarato) && (
                <span
                  className={`ml-1 inline-flex items-center gap-0.5 font-medium ${maisCaro ? "text-red-700" : "text-emerald-700"}`}
                  title={maisCaro ? "O 1º colocado está mais barato que você" : "Você está mais barato que o 1º colocado"}
                >
                  {maisCaro ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
                  {PERCENTUAL.format(Math.abs(diferenca))}%
                </span>
              )}
              )
            </span>
          )}
        </>
      )}
    </span>
  );
}

/**
 * Tudo de um catalogo: o acompanhado mostra os concorrentes gravados (com o preco anterior, os avisos e o "Reler agora");
 * outro catalogo (o produto em dois catalogos, o "C2") e lido agora no ML, sem gravar nada.
 */
function JanelaDoCatalogo({ catalogo, tela, produtoId, alterar, podeReler, aoReler, aoFechar }) {
  const [aoVivo, setAoVivo] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, iniciar] = useTransition();

  // O Esc fecha so esta janela, nao o editor por baixo (que ouve o Esc no `document`).
  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key !== "Escape") return;
      evento.stopPropagation();
      aoFechar();
    }
    document.addEventListener("keydown", aoTeclar, true);
    return () => document.removeEventListener("keydown", aoTeclar, true);
  }, [aoFechar]);

  useEffect(() => {
    if (tela) return undefined;
    let vivo = true;
    preverCatalogoMLAcao(catalogo.id)
      .then((resposta) => {
        if (!vivo) return;
        if (resposta?.ok) setAoVivo(resposta);
        else setErro(resposta?.erro ?? FALHA);
      })
      .catch(() => vivo && setErro(FALHA));
    return () => {
      vivo = false;
    };
  }, [catalogo.id, tela]);

  function reler() {
    iniciar(async () => {
      let resposta;
      try {
        resposta = await relerConcorrentesMLAcao(produtoId);
      } catch {
        resposta = { ok: false, erro: FALHA };
      }
      if (resposta?.tela) aoReler(resposta.tela);
      setErro(resposta?.ok ? null : resposta?.erro ?? FALHA);
    });
  }

  const presentes = (tela?.concorrentes ?? []).filter((c) => !c.ausenteDesde);
  const ausentes = (tela?.concorrentes ?? []).filter((c) => c.ausenteDesde);

  return (
    <div {...propsDoFundo(aoFechar)} className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 pt-[6vh] text-left font-normal normal-case">
      <div role="dialog" aria-modal="true" aria-label={`Catálogo ${catalogo.nome || catalogo.id}`} className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-lg border border-borda bg-superficie shadow-xl">
        <div className="flex items-start gap-3 border-b border-borda px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold" title={catalogo.nome}>{catalogo.nome || catalogo.id}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-suave">
              {tela ? <ResumoDaPosicao posicao={tela.posicao} /> : aoVivo ? <span>{textoDoResumo(aoVivo.resumo) ?? `${aoVivo.total} anúncios`} · lido agora</span> : null}
              {tela?.lidoEm && <span>lido em {DATA_HORA.format(new Date(tela.lidoEm))}</span>}
            </p>
          </div>
          <a href={urlDoCatalogo(catalogo.id)} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded border border-borda px-2.5 py-1 text-sm font-medium text-acento hover:bg-fundo">
            Abrir no ML <ExternalLink size={12} />
          </a>
          {tela && podeReler && (
            <button type="button" onClick={reler} disabled={ocupado} className="inline-flex shrink-0 items-center gap-1.5 rounded bg-acento px-3 py-1 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              <RefreshCw size={14} className={ocupado ? "animate-spin" : ""} /> Reler agora
            </button>
          )}
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="shrink-0 rounded p-1 text-suave hover:bg-fundo">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
          {tela ? (
            <>
              {tela.avisos?.length > 0 && (
                <ul className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {tela.avisos.map((aviso) => <li key={aviso.texto}>{aviso.texto}</li>)}
                </ul>
              )}
              {presentes.length === 0 ? (
                <p className="text-sm text-suave">Nenhum outro anúncio neste catálogo.</p>
              ) : (
                <TabelaDeConcorrentes linhas={presentes} alterar={alterar} />
              )}
              {ausentes.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-suave">{ausentes.length} saíram do top 10</summary>
                  <TabelaDeConcorrentes linhas={ausentes} alterar={alterar} apagados />
                </details>
              )}
              <p className="text-[11px] text-suave">Os 10 primeiros anúncios do catálogo, sem os seus, relidos todo dia. Clique num preço para usá-lo no anúncio.</p>
            </>
          ) : aoVivo ? (
            <TabelaDoCatalogoAoVivo itens={aoVivo.itens} />
          ) : (
            !erro && (
              <p className="flex items-center gap-2 text-sm text-suave">
                <Loader size={14} className="animate-spin" /> Lendo o catálogo no Mercado Livre...
              </p>
            )
          )}
        </div>
      </div>
    </div>
  );
}

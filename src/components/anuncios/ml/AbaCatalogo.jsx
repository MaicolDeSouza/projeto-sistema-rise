"use client";

import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ChevronRight, ExternalLink, Loader, RefreshCw, X } from "lucide-react";

import { buscarCatalogosDoProdutoMLAcao, catalogosDoAnuncioMLAcao, preverCatalogoMLAcao, relerConcorrentesMLAcao } from "@/app/canais-de-venda/mercado-livre/acoes";
import { propsDoFundo } from "@/lib/fundoDaJanela";
import { textoDoResumo } from "@/lib/canaisDeVenda/ml/catalogo";
import { ResumoDaPosicao, TabelaDoCatalogoAoVivo, urlDoCatalogo } from "./ConcorrentesDoML";
import SecaoDoAnuncio from "./SecaoDoAnuncio";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const FALHA = "Não foi possível falar com o servidor.";

/**
 * Aba Catalogo (pedido do dono em 26/10/2026: "bem simples, mostre os catalogos que estou concorrendo e se eu clicar abre
 * popup com todas as informacoes daquele catalogo"). A lista sao os catalogos em que os anuncios publicados deste produto
 * estao no ML (relidos de hora em hora); a busca, a sugestao e o ranking dos catalogos de referencia sairam. O Rise
 * acompanha sozinho o catalogo do anuncio (`seguirCatalogoDosAnuncios`).
 */
// `idExterno`: o MLB do anuncio aberto (nulo no rascunho), para separar o catalogo DELE dos de outros anuncios do produto.
export default function AbaCatalogo({ rascunho, alterar, visivel = false, idExterno = null, acessos = { concorrentes: true, editar: true } }) {
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
  }

  useEffect(() => {
    if (!produtoId || !acessos.concorrentes) return undefined;
    let vivo = true;
    catalogosDoAnuncioMLAcao(produtoId)
      .then((resposta) => {
        if (!vivo) return;
        if (!resposta?.ok) return setErro(resposta?.erro ?? FALHA);
        setDados({ catalogos: resposta.catalogos, tela: resposta.tela });
        setErro(resposta.aviso ? `Não foi possível acompanhar o catálogo do anúncio: ${resposta.aviso}` : null);
      })
      .catch(() => vivo && setErro(FALHA));
    return () => {
      vivo = false;
    };
  }, [produtoId, acessos.concorrentes]);

  if (!acessos.concorrentes) return <p className="text-sm text-suave">Seu acesso não mostra os concorrentes do Mercado Livre.</p>;
  if (!produtoId) return <p className="text-sm text-suave">Escolha o produto do anúncio.</p>;

  const todos = dados?.catalogos ?? [];
  // So os catalogos em que ESTE anuncio concorre (pedido do dono em 26/10/2026, ao ver o catalogo de um anuncio antigo do
  // mesmo codigo aparecer no 170113 como se fosse o aberto). Os dos outros anuncios dele do produto nao aparecem (opcao 2).
  const desteAnuncio = (catalogo) => Boolean(idExterno) && catalogo.anuncios.some((anuncio) => anuncio.idExterno === idExterno);
  const catalogos = todos.filter(desteAnuncio);
  const tela = dados?.tela ?? null;
  const catalogoAberto = todos.find((catalogo) => catalogo.id === aberto) ?? null;

  return (
    <SecaoDoAnuncio
      titulo="Catálogo deste anúncio"
      ajuda="O catálogo do Mercado Livre em que este anúncio concorre. O Rise confere no ML ao abrir esta aba e de hora em hora; para entrar ou sair de um catálogo, use o painel do ML. Clique no catálogo para ver os concorrentes."
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
        <p className="text-sm text-suave">
          {idExterno ? "Este anúncio não está em nenhum catálogo do Mercado Livre" : "O anúncio ainda não foi publicado"}
          {buscadoEm || !idExterno ? "" : " (ainda não conferido no ML)"}.
        </p>
      ) : (
        <ul className="divide-y divide-borda rounded border border-borda">
          {catalogos.map((catalogo) => {
            const acompanhado = tela?.catalogoId === catalogo.id;
            return (
              // O link do catalogo fica FORA do botao da linha (link dentro de botao e HTML invalido): a linha abre a janela,
              // o "Abrir no ML" abre o catalogo no site em outra aba (pedido do dono em 26/10/2026).
              <li key={catalogo.id} className="flex items-center hover:bg-fundo">
                <button type="button" onClick={() => setAberto(catalogo.id)} className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">{catalogo.nome || catalogo.id}</span>
                      {catalogo.resumo && <SeloDaPosicao resumo={catalogo.resumo} />}
                    </span>
                    {/* Os precos na linha de baixo, junto dos anuncios e vendedores (pedido do dono: "como estava antes"). */}
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-suave">
                      {catalogo.resumo ? (
                        <>
                          <span>{textoDoResumo(catalogo.resumo)}</span>
                          <PrecosDaLinha resumo={catalogo.resumo} />
                        </>
                      ) : acompanhado ? (
                        <ResumoDaPosicao posicao={tela.posicao} />
                      ) : (
                        "Clique em Buscar no ML para ler o catálogo."
                      )}
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
          meuItemId={idExterno}
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
 * "29º de 79": a posicao do dono no catalogo, no MESMO desenho e nas mesmas cores do selo de posicao de preco do produto
 * (`SeloPosicaoDePreco`, pedido do dono em 26/10/2026): verde no 1o, ambar no ultimo, cinza no meio. A dica e outra: aqui e a
 * ordem do Mercado Livre no catalogo, e nao o ranking de precos das lojas.
 */
function SeloDaPosicao({ resumo }) {
  const { minhaPosicao: posicao, anuncios: total } = resumo;
  const cor = !posicao
    ? "border-borda bg-fundo text-suave"
    : posicao === 1
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : posicao === total
        ? "border-amber-300 bg-amber-50 text-amber-800"
        : "border-borda bg-fundo text-suave";
  const dica = posicao ? `Seu anúncio é o ${posicao}º de ${total} na ordem do Mercado Livre neste catálogo.` : "Nenhum anúncio seu está neste catálogo.";
  return (
    <span title={dica} aria-label={dica} className={`inline-flex shrink-0 items-center rounded border px-1.5 py-px text-[11px] font-semibold tabular-nums ${cor}`}>
      {posicao ? `${posicao}º de ${total}` : "fora"}
    </span>
  );
}

/**
 * O 1o colocado e voce, na linha de baixo do catalogo (pedido do dono em 26/10/2026), com a diferenca do SEU preco para o do 1o numa etiqueta:
 * seta para cima e vermelho quando voce esta mais caro (o 1o esta mais barato, a cor da coluna Diferenca da aba Concorrentes
 * do produto), para baixo e verde quando voce esta mais barato. Voce em 1o: so o seu preco, em verde.
 */
function PrecosDaLinha({ resumo }) {
  const souPrimeiro = resumo.primeiroEhMeu;
  const diferenca = !souPrimeiro && resumo.meuPreco > 0 && resumo.primeiroPreco > 0 ? ((resumo.meuPreco - resumo.primeiroPreco) / resumo.primeiroPreco) * 100 : null;
  const maisCaro = diferenca !== null && diferenca >= 0.05;
  const maisBarato = diferenca !== null && diferenca <= -0.05;
  return (
    <>
      {!souPrimeiro && resumo.primeiroPreco > 0 && (
        <span>
          · 1º colocado <span className="font-medium text-texto tabular-nums">{MOEDA.format(resumo.primeiroPreco)}</span>
        </span>
      )}
      {resumo.meuPreco > 0 && (
        <span className="inline-flex items-center gap-1.5">
          · Você
          <span className={`inline-flex items-center gap-1.5 font-medium tabular-nums ${souPrimeiro ? "text-emerald-700" : "text-texto"}`}>
            {MOEDA.format(resumo.meuPreco)}
            {(maisCaro || maisBarato) && (
              <span
                title={maisCaro ? "O 1º colocado está mais barato que você" : "Você está mais barato que o 1º colocado"}
                className={`inline-flex items-center gap-0.5 rounded px-1 py-px text-[11px] font-semibold ${maisCaro ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
              >
                {maisCaro ? <ArrowUp size={11} aria-hidden="true" /> : <ArrowDown size={11} aria-hidden="true" />}
                {PERCENTUAL.format(Math.abs(diferenca))}%
              </span>
            )}
          </span>
        </span>
      )}
    </>
  );
}

/**
 * Tudo de um catalogo, lido AGORA no ML: todos os anuncios na ordem do ML, com os do dono destacados como "Você" (pedido do
 * dono em 26/10/2026: ele era o 2o e a lista dos acompanhados, que tira os dele, pulava a linha). No catalogo acompanhado,
 * os avisos e o preco anterior (a seta) vem do que o Rise guardou, e o "Reler agora" renova o guardado e a leitura.
 */
function JanelaDoCatalogo({ catalogo, tela, produtoId, alterar, podeReler, aoReler, aoFechar, meuItemId = null }) {
  const [aoVivo, setAoVivo] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, iniciar] = useTransition();
  const [leitura, setLeitura] = useState(0);

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
  }, [catalogo.id, leitura]);

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
      setLeitura((atual) => atual + 1);
    });
  }

  // O preco anterior de cada concorrente acompanhado, para a seta de subiu/baixou na tabela ao vivo.
  const anteriores = new Map((tela?.concorrentes ?? []).filter((c) => c.precoAnterior != null).map((c) => [c.itemId, c.precoAnterior]));

  return (
    <div {...propsDoFundo(aoFechar)} className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 pt-[6vh] text-left font-normal normal-case">
      <div role="dialog" aria-modal="true" aria-label={`Catálogo ${catalogo.nome || catalogo.id}`} className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-lg border border-borda bg-superficie shadow-xl">
        <div className="flex items-start gap-3 border-b border-borda px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold" title={catalogo.nome}>{catalogo.nome || catalogo.id}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-suave">
              {aoVivo ? <span>{textoDoResumo(aoVivo.resumo) ?? `${aoVivo.total} anúncios`} · lido agora</span> : tela ? <ResumoDaPosicao posicao={tela.posicao} /> : null}
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
          {tela?.avisos?.length > 0 && (
            <ul className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {tela.avisos.map((aviso) => <li key={aviso.texto}>{aviso.texto}</li>)}
            </ul>
          )}
          {aoVivo ? (
            <>
              {/* Os que "sairam do top 10" sairam do popup (pedido do dono em 26/10/2026): eram, em geral, os concorrentes de
                  um catalogo acompanhado antes, e pareciam ser deste. O historico continua no banco. */}
              <TabelaDoCatalogoAoVivo itens={aoVivo.itens} alterar={alterar} anteriores={anteriores} meuItemId={meuItemId} />
              <p className="text-[11px] text-suave">Os 10 primeiros do catálogo, na ordem do Mercado Livre, lidos agora; este anúncio aparece em verde, no fim se estiver abaixo do 10º. Clique num preço para usá-lo no anúncio.</p>
            </>
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

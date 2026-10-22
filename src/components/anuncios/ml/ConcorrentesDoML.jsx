"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Loader, RefreshCw, Search } from "lucide-react";

import {
  acompanharCatalogoMLAcao,
  buscarCatalogosMLAcao,
  catalogosDosMeusAnunciosMLAcao,
  lerConcorrentesMLAcao,
  pararDeAcompanharMLAcao,
  preverCatalogoMLAcao,
  relerConcorrentesMLAcao,
} from "@/app/canais-de-venda/mercado-livre/acoes";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { CLASSE_CAMPO } from "@/components/cadastros/Campo";
import { textoDaReputacao } from "@/lib/canaisDeVenda/ml/catalogo";
import { ROTULO_DO_TIPO_ML } from "@/lib/canaisDeVenda/ml/rotulos";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const urlDoCatalogo = (id) => `https://www.mercadolivre.com.br/p/${id}`;
const nomeDoVendedor = (apelido, id) => apelido || `vendedor ${id}`;

/**
 * "Concorrentes no Mercado Livre" na aba Preco e estoque (spec 2026-10-21-concorrentes-ml-catalogo-design.md, 7.3).
 * Nesta tela o operador precisa ver primeiro a posicao dele no catalogo e quem esta mais barato; a acao principal e
 * "Acompanhar este catalogo" (sem catalogo) ou "Reler agora" (com catalogo).
 *
 * Sem catalogo: busca pelo titulo -> escolhe -> previa dos anuncios -> Acompanhar. Com catalogo: a lista dos
 * acompanhados (os 10 primeiros, renovados todo dia pelo worker), os avisos e os atalhos de trocar ou parar.
 * `aoMudarConcorrentes` entrega a lista para o selo de posicao ao lado do preco. Clicar num preco copia para o campo.
 */
export default function ConcorrentesDoML({ produtoId, titulo, alterar, aoMudarConcorrentes }) {
  const [tela, setTela] = useState(null);
  const [erro, setErro] = useState(null);
  const [termo, setTermo] = useState(titulo ?? "");
  const [catalogos, setCatalogos] = useState(null);
  // O catalogo dos anuncios que o dono ja tem deste produto, sugerido no topo (a busca pelo nome pode nao acha-lo).
  const [meus, setMeus] = useState([]);
  const [previa, setPrevia] = useState(null);
  const [trocando, setTrocando] = useState(false);
  const [confirmandoTroca, setConfirmandoTroca] = useState(false);
  const [ocupado, iniciar] = useTransition();

  function receber(resposta) {
    if (resposta?.tela !== undefined && resposta.tela !== null) {
      setTela(resposta.tela);
      aoMudarConcorrentes?.(resposta.tela.concorrentes ?? []);
    }
    setErro(resposta?.ok ? null : resposta?.erro ?? "Não foi possível falar com o servidor.");
  }

  useEffect(() => {
    let vivo = true;
    lerConcorrentesMLAcao(produtoId)
      .then((resposta) => vivo && receber(resposta))
      .catch(() => vivo && setErro("Não foi possível falar com o servidor."));
    catalogosDosMeusAnunciosMLAcao(produtoId)
      .then((resposta) => vivo && resposta.ok && setMeus(resposta.catalogos))
      .catch(() => {});
    return () => {
      vivo = false;
    };
    // `receber` muda a cada render; a leitura e so na abertura (e quando o produto muda).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId]);

  function buscar(evento) {
    evento?.preventDefault();
    iniciar(async () => {
      setPrevia(null);
      const resposta = await buscarCatalogosMLAcao(termo);
      setCatalogos(resposta.ok ? resposta.catalogos : []);
      setErro(resposta.ok ? null : resposta.erro);
    });
  }

  function prever(catalogo) {
    iniciar(async () => {
      const resposta = await preverCatalogoMLAcao(catalogo.id);
      if (resposta.ok) setPrevia({ catalogo, ...resposta });
      setErro(resposta.ok ? null : resposta.erro);
    });
  }

  function acompanhar() {
    if (!previa) return;
    iniciar(async () => {
      receber(await acompanharCatalogoMLAcao(produtoId, { catalogoId: previa.catalogo.id, catalogoNome: previa.catalogo.nome }));
      setPrevia(null);
      setCatalogos(null);
      setTrocando(false);
      setConfirmandoTroca(false);
    });
  }

  const reler = () => iniciar(async () => receber(await relerConcorrentesMLAcao(produtoId)));
  const parar = () => iniciar(async () => receber(await pararDeAcompanharMLAcao(produtoId)));

  if (tela === null) {
    return (
      <section className="rounded-lg border border-borda p-4">
        <Cabecalho />
        {erro ? <p className="mt-2 text-sm text-red-700">{erro}</p> : <p className="mt-2 flex items-center gap-2 text-sm text-suave"><Loader size={14} className="animate-spin" /> Lendo...</p>}
      </section>
    );
  }

  const acompanhando = Boolean(tela.catalogoId) && !trocando;
  const idsMeus = new Set(meus.map((c) => c.id));
  const lista = [...meus, ...(catalogos ?? []).filter((c) => !idsMeus.has(c.id))];
  const presentes = (tela.concorrentes ?? []).filter((c) => !c.ausenteDesde);
  const ausentes = (tela.concorrentes ?? []).filter((c) => c.ausenteDesde);

  return (
    <section className="rounded-lg border border-borda p-4">
      <Cabecalho>
        {acompanhando && (
          <button type="button" onClick={reler} disabled={ocupado} className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            <RefreshCw size={14} className={ocupado ? "animate-spin" : ""} /> Reler agora
          </button>
        )}
      </Cabecalho>

      {erro && <p role="alert" className="mt-2 text-sm text-red-700">{erro}</p>}

      {acompanhando ? (
        <div className="mt-3 space-y-3">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <a href={urlDoCatalogo(tela.catalogoId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-acento hover:underline" title={tela.catalogoId}>
              {tela.catalogoNome || tela.catalogoId} <ExternalLink size={12} />
            </a>
            <span className="text-suave">·</span>
            <ResumoDaPosicao posicao={tela.posicao} />
            {tela.lidoEm && <span className="text-xs text-suave">lido em {DATA_HORA.format(new Date(tela.lidoEm))}</span>}
            <span className="ml-auto flex gap-3 text-xs">
              <button type="button" onClick={() => setConfirmandoTroca(true)} disabled={ocupado} className="text-acento hover:underline disabled:opacity-50">Trocar catálogo</button>
              <button type="button" onClick={parar} disabled={ocupado} className="text-suave hover:text-red-700 hover:underline disabled:opacity-50">Parar de acompanhar</button>
            </span>
          </p>

          {confirmandoTroca && (
            <div className="flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              O histórico dos concorrentes do catálogo atual fica guardado como ausente.
              <button type="button" onClick={() => { setTrocando(true); setConfirmandoTroca(false); }} className="rounded border border-amber-300 bg-white px-2 py-0.5 font-medium">Trocar</button>
              <button type="button" onClick={() => setConfirmandoTroca(false)} className="rounded px-2 py-0.5 text-suave">Cancelar</button>
            </div>
          )}

          {tela.avisos?.length > 0 && (
            <ul className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {tela.avisos.map((aviso) => <li key={aviso.texto}>{aviso.texto}</li>)}
            </ul>
          )}

          {presentes.length === 0 ? (
            <p className="text-sm text-suave">{tela.posicao?.posicao === 1 && tela.posicao?.total === 1 ? "Só você está neste catálogo." : "Nenhum outro anúncio neste catálogo."}</p>
          ) : (
            <TabelaDeConcorrentes linhas={presentes} alterar={alterar} />
          )}

          {ausentes.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-suave">{ausentes.length} saíram do top 10</summary>
              <TabelaDeConcorrentes linhas={ausentes} alterar={alterar} apagados />
            </details>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <form onSubmit={buscar} className="flex gap-2">
            <input
              value={termo}
              onChange={(evento) => setTermo(evento.target.value)}
              maxLength={120}
              placeholder="Nome do produto no Mercado Livre"
              aria-label="Buscar no catálogo do Mercado Livre"
              className={`${CLASSE_CAMPO} border-borda`}
            />
            <button type="submit" disabled={ocupado || !termo.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50">
              {ocupado && !previa ? <Loader size={14} className="animate-spin" /> : <Search size={14} />} Buscar no catálogo
            </button>
            {trocando && (
              <button type="button" onClick={() => { setTrocando(false); setPrevia(null); setCatalogos(null); }} className="shrink-0 px-2 text-sm text-suave hover:underline">Cancelar</button>
            )}
          </form>

          {previa ? (
            <Previa previa={previa} ocupado={ocupado} aoAcompanhar={acompanhar} aoVoltar={() => setPrevia(null)} />
          ) : (catalogos !== null || meus.length > 0) && (
            lista.length === 0 ? (
              <p className="text-sm text-suave">Nenhum produto de catálogo parecido. Esse item fica sem concorrentes do ML.</p>
            ) : (
              <ul className="divide-y divide-borda rounded border border-borda">
                {lista.map((catalogo) => (
                  <li key={catalogo.id} className="flex items-center gap-3 px-3 py-2">
                    {catalogo.foto ? (
                      // Foto do CDN do ML: `next/image` lanca com host fora de `remotePatterns` (CLAUDE.md, armadilhas).
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={catalogo.foto} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded object-contain" />
                    ) : (
                      <span className="h-10 w-10 shrink-0 rounded bg-fundo" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={catalogo.nome}>
                        {catalogo.meusAnuncios?.length > 0 && (
                          <span title={catalogo.meusAnuncios.join(", ")} className="mr-1.5 rounded border border-emerald-300 bg-emerald-50 px-1 py-px text-[11px] font-semibold text-emerald-700">
                            seu anúncio
                          </span>
                        )}
                        {catalogo.nome}
                      </p>
                      <p className="truncate text-xs text-suave">{catalogo.atributosResumo.join(" · ") || catalogo.dominio}</p>
                    </div>
                    <button type="button" onClick={() => prever(catalogo)} disabled={ocupado} className="shrink-0 rounded border border-borda px-2.5 py-1 text-sm hover:bg-fundo disabled:opacity-50">Usar este</button>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}
    </section>
  );
}

function Cabecalho({ children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        Concorrentes no Mercado Livre
        <BolhaDeAjuda
          variante="inline"
          texto="Pelo catálogo do Mercado Livre: escolha o produto de catálogo e os 10 primeiros anúncios dele (sem os seus) passam a ser acompanhados, relidos todo dia. A busca pública do ML e o anúncio de outro vendedor não são abertos à nossa conta, então não há título nem vendidos de cada anúncio. Clique num preço para usá-lo no seu."
        />
      </h3>
      {children}
    </div>
  );
}

function ResumoDaPosicao({ posicao }) {
  if (!posicao) return <span className="text-suave">sem leitura</span>;
  if (posicao.posicao === null) return <span>{posicao.total} anúncios · você não está neste catálogo</span>;
  return (
    <span>
      {posicao.total} anúncios · <strong>você é o {posicao.posicao}º</strong>
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

function Vendedor({ apelido, id, reputacao, vendas }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{nomeDoVendedor(apelido, id)}</span>
      <span className="text-[11px] text-suave">
        {textoDaReputacao(reputacao)}
        {typeof vendas === "number" ? ` · ${vendas.toLocaleString("pt-BR")} vendas` : ""}
      </span>
    </span>
  );
}

function TabelaDeConcorrentes({ linhas, alterar, apagados = false }) {
  return (
    <table className={`w-full text-sm ${apagados ? "mt-2 text-suave" : ""}`}>
      <thead className="text-left text-[11px] tracking-wide text-suave uppercase">
        <tr>
          <th className="w-10 py-1 font-medium">Pos.</th>
          <th className="py-1 font-medium">Vendedor</th>
          <th className="py-1 font-medium">Tipo</th>
          <th className="py-1 text-right font-medium">Preço</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-borda">
        {linhas.map((c) => (
          <tr key={c.id}>
            <td className="py-1.5 tabular-nums">{c.posicao}º</td>
            <td className="py-1.5"><Vendedor apelido={c.vendedorApelido} id={c.vendedorId} reputacao={c.vendedorReputacao} vendas={c.vendedorVendas} /></td>
            <td className="py-1.5 text-xs">
              {ROTULO_DO_TIPO_ML[c.tipoAnuncio] ?? c.tipoAnuncio ?? "-"}
              {c.freteGratis && <span className="ml-1 text-emerald-700">· frete grátis</span>}
            </td>
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

function Previa({ previa, ocupado, aoAcompanhar, aoVoltar }) {
  const top = new Set(previa.topIds);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm">
          <a href={urlDoCatalogo(previa.catalogo.id)} target="_blank" rel="noreferrer" className="font-medium text-acento hover:underline">{previa.catalogo.nome}</a>
          <span className="text-suave"> · {previa.total} anúncios</span>
        </p>
        <span className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={aoVoltar} disabled={ocupado} className="text-sm text-suave hover:underline">Voltar</button>
          <button type="button" onClick={aoAcompanhar} disabled={ocupado} className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {ocupado && <Loader size={14} className="animate-spin" />} Acompanhar este catálogo
          </button>
        </span>
      </div>
      {previa.itens.length === 0 ? (
        <p className="text-sm text-suave">Este catálogo não tem anúncios abertos.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] tracking-wide text-suave uppercase">
            <tr>
              <th className="w-10 py-1 font-medium">Pos.</th>
              <th className="py-1 font-medium">Vendedor</th>
              <th className="py-1 font-medium">Tipo</th>
              <th className="py-1 text-right font-medium">Preço</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {previa.itens.map((item) => (
              <tr key={item.itemId} className={item.meu ? "bg-emerald-50 font-medium" : top.has(item.itemId) ? "" : "text-suave"}>
                <td className="py-1.5 tabular-nums">{item.posicao}º</td>
                <td className="py-1.5">
                  {item.meu ? "Você" : <Vendedor apelido={item.vendedor?.apelido} id={item.vendedorId} reputacao={item.vendedor?.reputacao} vendas={item.vendedor?.vendas} />}
                </td>
                <td className="py-1.5 text-xs">
                  {ROTULO_DO_TIPO_ML[item.tipoAnuncio] ?? item.tipoAnuncio ?? "-"}
                  {item.freteGratis && <span className="ml-1 text-emerald-700">· frete grátis</span>}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {item.preco === null ? "-" : MOEDA.format(item.preco)}
                  {item.precoCheio > item.preco && <span className="ml-1 text-[11px] text-suave line-through">{MOEDA.format(item.precoCheio)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

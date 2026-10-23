"use client";

import { useEffect, useState, useTransition } from "react";
import { ExternalLink, Loader, Plus, RefreshCw, Search, Sparkles, X } from "lucide-react";

import {
  adicionarReferenciaMLAcao,
  buscarCatalogosMLAcao,
  lerReferenciasMLAcao,
  preverCatalogoMLAcao,
  relerReferenciasMLAcao,
  removerReferenciaMLAcao,
  sugerirCatalogosMLAcao,
} from "@/app/canais-de-venda/mercado-livre/acoes";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { CLASSE_CAMPO } from "@/components/cadastros/Campo";
import { textoDoResumo } from "@/lib/canaisDeVenda/ml/catalogo";
import { catalogosDoRanking, leituraAntiga, montarRanking } from "@/lib/canaisDeVenda/ml/ranking";
import { propsDoFundo } from "@/lib/fundoDaJanela";

import { urlDoCatalogo, Vendedor } from "./ConcorrentesDoML";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const MAXIMO = 10;

// ID ou link colado ("MLB44072268" ou ".../p/MLB44072268"): vai direto para a previa, sem busca.
const idColado = (texto) => {
  const achado = String(texto ?? "").trim().match(/(?:^|\/p\/)(MLB\d{1,15})(?:$|[/?#])/i);
  return achado ? achado[1].toUpperCase() : null;
};

/**
 * "Ranking dos catalogos" na aba Preco e custos (spec 2026-10-23-ranking-catalogos-referencia-ml-design.md, 4.5). Nesta
 * tela o operador precisa ver primeiro em que posicao o preco dele fica entre os 1os colocados; a acao principal e
 * "Sugerir catalogos" (os mais vendidos da categoria e a busca pelo titulo); "Adicionar catalogo" busca um a mao.
 * `telaConcorrentes` e a tela do bloco de concorrentes (o 1o do catalogo do anuncio vem dela);
 * `preco` e o do campo, entao a posicao muda enquanto o dono digita.
 */
export default function RankingDosCatalogos({ produtoId, titulo, preco, categoriaId, telaConcorrentes }) {
  const [referencias, setReferencias] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  // Um painel por vez: as sugestoes do Rise ou a busca a mao.
  const [painel, setPainel] = useState(null);
  const [removendo, setRemovendo] = useState(null);
  const [ocupado, iniciar] = useTransition();

  function receber(resposta) {
    if (Array.isArray(resposta?.referencias)) setReferencias(resposta.referencias);
    setErro(resposta?.ok ? null : resposta?.erro ?? "Não foi possível falar com o servidor.");
    setAviso(resposta?.aviso ?? null);
  }

  useEffect(() => {
    let vivo = true;
    lerReferenciasMLAcao(produtoId)
      .then((resposta) => vivo && receber(resposta))
      .catch(() => vivo && setErro("Não foi possível falar com o servidor."));
    return () => {
      vivo = false;
    };
  }, [produtoId]);

  const reler = () => iniciar(async () => receber(await relerReferenciasMLAcao(produtoId)));
  const remover = (referencia) =>
    iniciar(async () => {
      receber(await removerReferenciaMLAcao(produtoId, referencia.id));
      setRemovendo(null);
    });
  const adicionar = (catalogo) =>
    iniciar(async () => {
      const resposta = await adicionarReferenciaMLAcao(produtoId, { catalogoId: catalogo.id, nome: catalogo.nome ?? "" });
      receber(resposta);
      if (resposta?.ok && painel === "adicionar") setPainel(null);
      return resposta;
    });

  const lista = referencias ?? [];
  const catalogos = catalogosDoRanking(telaConcorrentes, lista);
  const ranking = montarRanking({ preco, catalogos });
  const idsUsados = new Set([telaConcorrentes?.catalogoId, ...lista.map((r) => r.catalogoId)].filter(Boolean));
  const semNinguem = ranking.linhas.every((linha) => linha.tipo === "voce");

  return (
    <section className="rounded-lg border border-borda p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
          Ranking dos catálogos
          <BolhaDeAjuda
            variante="inline"
            texto="O 1º colocado do catálogo do anúncio e de cada catálogo de referência que você marcar, relidos todo dia, com o preço deste anúncio no meio. O 1º é quem o Mercado Livre mostra primeiro (preço, reputação, frete e Full contam), não necessariamente o mais barato."
          />
          <span className="font-normal text-suave">· 1º colocado de cada catálogo, não o menor preço do ML</span>
        </h3>
        <span className="flex items-center gap-2">
          {lista.length > 0 && (
            <button type="button" onClick={reler} disabled={ocupado} title="Reler o 1º dos catálogos de referência" className="inline-flex items-center gap-1.5 rounded border border-borda px-2.5 py-1 text-sm hover:bg-fundo disabled:opacity-50">
              <RefreshCw size={14} className={ocupado ? "animate-spin" : ""} /> Reler
            </button>
          )}
          {painel !== "adicionar" && (
            <button
              type="button"
              onClick={() => setPainel("adicionar")}
              disabled={ocupado || lista.length >= MAXIMO}
              title={lista.length >= MAXIMO ? `No máximo ${MAXIMO} catálogos de referência.` : "Buscar um catálogo do ML pelo nome, link ou ID"}
              className="inline-flex items-center gap-1.5 rounded border border-borda px-2.5 py-1 text-sm hover:bg-fundo disabled:opacity-50"
            >
              <Plus size={14} /> Adicionar catálogo
            </button>
          )}
          {painel !== "sugerir" && (
            <button
              type="button"
              onClick={() => setPainel("sugerir")}
              disabled={ocupado || lista.length >= MAXIMO}
              title={lista.length >= MAXIMO ? `No máximo ${MAXIMO} catálogos de referência.` : "Os mais vendidos da categoria e os catálogos parecidos com o título"}
              className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <Sparkles size={14} /> Sugerir catálogos
            </button>
          )}
        </span>
      </div>

      {erro && <p role="alert" className="mt-2 text-sm text-red-700">{erro}</p>}
      {aviso && <p className="mt-2 text-sm text-amber-800">Adicionado, mas a primeira leitura falhou: {aviso}</p>}

      {referencias === null && !erro ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-suave"><Loader size={14} className="animate-spin" /> Lendo...</p>
      ) : (
        <div className="mt-3 space-y-3">
          {painel === "adicionar" && (
            <Adicionar titulo={titulo} idsUsados={idsUsados} ocupado={ocupado} aoAdicionar={adicionar} aoCancelar={() => setPainel(null)} />
          )}
          {painel === "sugerir" && (
            <Sugestoes produtoId={produtoId} titulo={titulo} categoriaId={categoriaId} idsUsados={idsUsados} cheio={lista.length >= MAXIMO} ocupado={ocupado} aoAdicionar={adicionar} aoFechar={() => setPainel(null)} />
          )}

          {semNinguem ? (
            <p className="text-sm text-suave">
              {catalogos.length === 0 ? "Nenhum catálogo ainda: acompanhe o catálogo do anúncio acima ou adicione um catálogo de referência." : "Nenhum 1º colocado com preço lido ainda."}
            </p>
          ) : (
            <>
              <Resumo ranking={ranking} />
              <Tabela ranking={ranking} aoRemover={setRemovendo} ocupado={ocupado} />
            </>
          )}

          {ranking.foraDaConta.length > 0 && (
            <ul className="space-y-0.5 text-xs text-suave">
              {ranking.foraDaConta.map((c) => (
                <li key={c.catalogoId} className="flex items-center gap-2">
                  <a href={urlDoCatalogo(c.catalogoId)} target="_blank" rel="noreferrer" className="truncate hover:underline">{c.nome || c.catalogoId}</a>
                  <span>· {c.primeiro?.meu ? "você é o 1º" : c.semAnuncios ? "sem anúncios" : c.erro ? "não foi lido" : "ainda não lido"}</span>
                  {c.papel === "referencia" && (
                    <button type="button" onClick={() => setRemovendo(c)} disabled={ocupado} aria-label={`Remover ${c.nome || c.catalogoId}`} className="rounded p-0.5 hover:text-red-700 disabled:opacity-50"><X size={12} /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {removendo && <ConfirmarRemocao referencia={removendo} ocupado={ocupado} aoConfirmar={() => remover(removendo)} aoCancelar={() => setRemovendo(null)} />}
    </section>
  );
}

function Diferenca({ diferenca, rotulo }) {
  if (!diferenca) return null;
  if (diferenca.reais === 0) return <span>igual à {rotulo}</span>;
  const acima = diferenca.reais > 0;
  return (
    <span>
      {MOEDA.format(Math.abs(diferenca.reais))} ({PERCENTUAL.format(Math.abs(diferenca.percentual))}%) {acima ? "acima" : "abaixo"} {rotulo === "média" ? "da média" : "do mais barato"}
    </span>
  );
}

function Resumo({ ranking }) {
  if (ranking.posicao === null) {
    return <p className="text-sm text-suave">Digite o preço de venda para ver sua posição entre {ranking.total} catálogos.</p>;
  }
  const cor = ranking.posicao === 1 ? "text-emerald-700" : ranking.posicao === ranking.total ? "text-amber-700" : "text-texto";
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <p className={`text-lg font-semibold ${cor}`}>Você está em {ranking.posicao}º de {ranking.total}</p>
      <p className="text-sm text-suave">
        {ranking.posicao === 1 ? <span>você é o mais barato</span> : <Diferenca diferenca={ranking.paraOMaisBarato} rotulo="mais barato" />}
        {ranking.paraAMedia && <span> · </span>}
        <Diferenca diferenca={ranking.paraAMedia} rotulo="média" />
      </p>
    </div>
  );
}

function Tabela({ ranking, aoRemover, ocupado }) {
  const agora = new Date();
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-[11px] tracking-wide text-suave uppercase">
        <tr>
          <th className="w-10 py-1 font-medium">Pos.</th>
          <th className="py-1 font-medium">Catálogo</th>
          <th className="py-1 font-medium">1º colocado</th>
          <th className="py-1 text-right font-medium">Preço</th>
          <th className="w-8 py-1" />
        </tr>
      </thead>
      <tbody className="divide-y divide-borda">
        {ranking.linhas.map((linha) =>
          linha.tipo === "voce" ? (
            <tr key="voce" className="bg-emerald-50 font-medium">
              <td className="py-1.5 tabular-nums">{linha.posicao}º</td>
              <td className="py-1.5" colSpan={2}>Você (este anúncio)</td>
              <td className="py-1.5 text-right tabular-nums">{MOEDA.format(linha.preco)}</td>
              <td />
            </tr>
          ) : (
            <tr key={linha.catalogoId}>
              <td className="py-1.5 tabular-nums">{linha.posicao}º</td>
              <td className="max-w-56 py-1.5">
                <span className="flex min-w-0 flex-col">
                  <a href={urlDoCatalogo(linha.catalogoId)} target="_blank" rel="noreferrer" title={linha.nome || linha.catalogoId} className="inline-flex min-w-0 items-center gap-1 hover:text-acento hover:underline">
                    <span className="truncate">{linha.nome || linha.catalogoId}</span> <ExternalLink size={11} className="shrink-0" />
                  </a>
                  <span className="text-[11px] text-suave">
                    {linha.papel === "anuncio" ? "catálogo do anúncio" : "referência"}
                    {linha.lidoEm && ` · lido em ${DATA_HORA.format(new Date(linha.lidoEm))}`}
                    {linha.erro && <span className="text-amber-700"> · última leitura falhou</span>}
                    {!linha.erro && leituraAntiga(linha.lidoEm, agora) && <span className="text-amber-700"> · sem leitura desde {DATA.format(new Date(linha.lidoEm))}</span>}
                  </span>
                </span>
              </td>
              <td className="py-1.5">
                <Vendedor apelido={linha.primeiro.vendedorApelido} id={linha.primeiro.vendedorId} reputacao={linha.primeiro.vendedorReputacao} itemId={linha.primeiro.itemId} />
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {MOEDA.format(linha.preco)}
                {linha.primeiro.precoCheio > linha.preco && <span className="ml-1 text-[11px] text-suave line-through">{MOEDA.format(linha.primeiro.precoCheio)}</span>}
                {linha.primeiro.freteGratis && <span className="block text-[11px] text-emerald-700">frete grátis</span>}
              </td>
              <td className="py-1.5 text-right">
                {linha.papel === "referencia" && (
                  <button type="button" onClick={() => aoRemover(linha)} disabled={ocupado} aria-label={`Remover ${linha.nome || linha.catalogoId}`} title="Remover esta referência" className="rounded p-1 text-suave hover:text-red-700 disabled:opacity-50">
                    <X size={14} />
                  </button>
                )}
              </td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

function Adicionar({ titulo, idsUsados, ocupado, aoAdicionar, aoCancelar }) {
  const [termo, setTermo] = useState(titulo ?? "");
  const [achados, setAchados] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [erro, setErro] = useState(null);
  const [lendo, iniciar] = useTransition();
  const ocupadoAqui = ocupado || lendo;

  function prever(catalogo) {
    iniciar(async () => {
      const resposta = await preverCatalogoMLAcao(catalogo.id);
      if (resposta.ok) setPrevia({ catalogo, ...resposta });
      setErro(resposta.ok ? null : resposta.erro);
    });
  }

  function buscar(evento) {
    evento?.preventDefault();
    const id = idColado(termo);
    if (id) return prever({ id, nome: "" });
    iniciar(async () => {
      setPrevia(null);
      const resposta = await buscarCatalogosMLAcao(termo);
      setAchados(resposta.ok ? resposta.catalogos : []);
      setErro(resposta.ok ? null : resposta.erro);
    });
  }

  const primeiro = previa?.itens?.[0] ?? null;
  const repetido = previa && idsUsados.has(previa.catalogo.id);

  return (
    <div className="space-y-2 rounded border border-borda p-3">
      <form onSubmit={buscar} className="flex gap-2">
        <input
          value={termo}
          onChange={(evento) => setTermo(evento.target.value)}
          maxLength={200}
          placeholder="Nome do produto, ou o link / ID do catálogo"
          aria-label="Buscar catálogo de referência no Mercado Livre"
          className={`${CLASSE_CAMPO} border-borda`}
        />
        <button type="submit" disabled={ocupadoAqui || !termo.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50">
          {lendo ? <Loader size={14} className="animate-spin" /> : <Search size={14} />} Buscar
        </button>
        <button type="button" onClick={aoCancelar} className="shrink-0 px-2 text-sm text-suave hover:underline">Cancelar</button>
      </form>
      {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}

      {previa ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="min-w-0">
            <a href={urlDoCatalogo(previa.catalogo.id)} target="_blank" rel="noreferrer" className="font-medium text-acento hover:underline">{previa.catalogo.nome || previa.catalogo.id}</a>
            <span className="text-suave"> · {textoDoResumo(previa.resumo) ?? `${previa.total} anúncios`}</span>
            <span className="block text-suave">
              {primeiro ? <>1º: {primeiro.meu ? "você" : primeiro.vendedor?.apelido || `vendedor ${primeiro.vendedorId}`} · {primeiro.preco === null ? "-" : MOEDA.format(primeiro.preco)}</> : "Este catálogo não tem anúncios abertos."}
            </span>
          </p>
          <span className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setPrevia(null)} disabled={ocupadoAqui} className="text-suave hover:underline">Voltar</button>
            <button
              type="button"
              onClick={() => aoAdicionar(previa.catalogo)}
              disabled={ocupadoAqui || repetido}
              title={repetido ? "Este catálogo já está no ranking." : undefined}
              className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {ocupado && <Loader size={14} className="animate-spin" />} Adicionar como referência
            </button>
          </span>
        </div>
      ) : (
        achados !== null &&
        (achados.length === 0 ? (
          <p className="text-sm text-suave">Nenhum produto de catálogo parecido.</p>
        ) : (
          <ul className="divide-y divide-borda rounded border border-borda">
            {achados.map((catalogo) => (
              <li key={catalogo.id} className="flex items-center gap-3 px-3 py-2">
                {catalogo.foto ? (
                  // Foto do CDN do ML: `next/image` lanca com host fora de `remotePatterns` (CLAUDE.md, armadilhas).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={catalogo.foto} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded object-contain" />
                ) : (
                  <span className="h-9 w-9 shrink-0 rounded bg-fundo" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={catalogo.nome}>{catalogo.nome}</p>
                  <p className="truncate text-xs text-suave">{textoDoResumo(catalogo.resumo) ?? catalogo.dominio}</p>
                </div>
                {idsUsados.has(catalogo.id) ? (
                  <span className="shrink-0 text-xs text-suave">já no ranking</span>
                ) : (
                  <button type="button" onClick={() => prever(catalogo)} disabled={ocupadoAqui} className="shrink-0 rounded border border-borda px-2.5 py-1 text-sm hover:bg-fundo disabled:opacity-50">Ver</button>
                )}
              </li>
            ))}
          </ul>
        ))
      )}
    </div>
  );
}

// As sugestoes do Rise: lidas uma vez ao abrir (cada catalogo custa duas leituras no ML). Adicionar nao fecha a lista:
// o dono marca varios seguidos, e o que entrou vira "no ranking" (pelo `idsUsados`, relido do servidor).
function Sugestoes({ produtoId, titulo, categoriaId, idsUsados, cheio, ocupado, aoAdicionar, aoFechar }) {
  const [sugeridos, setSugeridos] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let vivo = true;
    sugerirCatalogosMLAcao(produtoId, { categoriaId: categoriaId || null, titulo: titulo ?? "" })
      .then((resposta) => {
        if (!vivo) return;
        setSugeridos(resposta.ok ? resposta.catalogos : []);
        setErro(resposta.ok ? null : resposta.erro);
      })
      .catch(() => vivo && setErro("Não foi possível falar com o servidor."));
    return () => {
      vivo = false;
    };
    // So na abertura: trocar o titulo ou a categoria depois pede abrir de novo (cada leitura custa chamadas ao ML).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId]);

  return (
    <div className="space-y-2 rounded border border-borda p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">
          Sugeridos
          <span className="font-normal text-suave">{categoriaId ? " · mais vendidos da categoria e busca pelo título" : " · busca pelo título (o anúncio ainda não tem categoria)"}</span>
        </p>
        <button type="button" onClick={aoFechar} className="text-sm text-suave hover:underline">Fechar</button>
      </div>
      {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      {sugeridos === null && !erro ? (
        <p className="flex items-center gap-2 text-sm text-suave"><Loader size={14} className="animate-spin" /> Procurando no Mercado Livre...</p>
      ) : sugeridos?.length === 0 ? (
        <p className="text-sm text-suave">Nenhum catálogo novo para sugerir.</p>
      ) : (
        <ul className="divide-y divide-borda rounded border border-borda">
          {(sugeridos ?? []).map((catalogo) => (
            <li key={catalogo.id} className="flex items-center gap-3 px-3 py-2">
              {catalogo.foto ? (
                // Foto do CDN do ML: `next/image` lanca com host fora de `remotePatterns` (CLAUDE.md, armadilhas).
                // eslint-disable-next-line @next/next/no-img-element
                <img src={catalogo.foto} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded object-contain" />
              ) : (
                <span className="h-9 w-9 shrink-0 rounded bg-fundo" />
              )}
              <div className="min-w-0 flex-1">
                <a href={urlDoCatalogo(catalogo.id)} target="_blank" rel="noreferrer" title={catalogo.nome || catalogo.id} className="block truncate text-sm font-medium hover:text-acento hover:underline">
                  {catalogo.nome || catalogo.id}
                </a>
                <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-suave">
                  {catalogo.maisVendido && <span className="rounded border border-amber-300 bg-amber-50 px-1 py-px font-medium text-amber-800">{catalogo.maisVendido}º mais vendido da categoria</span>}
                  <span>
                    1º: {catalogo.primeiro.meu ? "você" : catalogo.primeiro.preco === null ? "-" : MOEDA.format(catalogo.primeiro.preco)} · {catalogo.total} {catalogo.total === 1 ? "anúncio" : "anúncios"}
                  </span>
                </p>
              </div>
              {idsUsados.has(catalogo.id) ? (
                <span className="shrink-0 text-xs font-medium text-emerald-700">no ranking</span>
              ) : (
                <button
                  type="button"
                  onClick={() => aoAdicionar(catalogo)}
                  disabled={ocupado || cheio}
                  title={cheio ? `No máximo ${MAXIMO} catálogos de referência.` : "Adicionar ao ranking"}
                  className="shrink-0 rounded border border-borda px-2.5 py-1 text-sm hover:bg-fundo disabled:opacity-50"
                >
                  Adicionar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConfirmarRemocao({ referencia, ocupado, aoConfirmar, aoCancelar }) {
  useEffect(() => {
    const tecla = (evento) => evento.key === "Escape" && aoCancelar();
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [aoCancelar]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...propsDoFundo(aoCancelar)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="remover-referencia" className="w-full max-w-sm rounded-lg bg-superficie p-5 shadow-xl">
        <h4 id="remover-referencia" className="text-sm font-semibold">Remover do ranking?</h4>
        <p className="mt-2 text-sm">
          <span className="font-medium">{referencia.nome || referencia.catalogoId}</span>
          <span className="block text-xs text-suave">{referencia.catalogoId} · o histórico do 1º colocado também sai</span>
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={aoCancelar} autoFocus className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo">Cancelar</button>
          <button type="button" onClick={aoConfirmar} disabled={ocupado} className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">Remover</button>
        </div>
      </div>
    </div>
  );
}

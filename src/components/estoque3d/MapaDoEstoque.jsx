"use client";

import { Box, ExternalLink, LayoutGrid, Loader, MoveRight, PackagePlus, Search, TriangleAlert, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { acharProdutoParaGuardarAcao } from "@/app/estoque/mapa/acoes";

import FotoComLupa from "@/components/ui/FotoComLupa";

import JanelaMover from "./JanelaMover";

// O three so existe no navegador (WebGL), e pesa: carregado so quando a vista 3D abre.
const Cena3D = dynamic(() => import("./Cena3D"), { ssr: false, loading: () => <p className="p-6 text-sm text-suave">Carregando o desenho…</p> });

const semAcento = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const PESO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/**
 * Aba Mapa. Linha-guia: o operador ve primeiro ONDE esta cada caixinha do estoque escolhido; a acao principal e achar um
 * produto (busca ou clique) e ver o que ha na caixinha. So consulta nesta fase: nada aqui grava.
 */
export default function MapaDoEstoque({ mapa, podeMover = false }) {
  const [localId, setLocalId] = useState(mapa.locais.find((local) => local.caixinhas > 0)?.id ?? mapa.locais[0]?.id ?? null);
  const [vista, setVista] = useState("3d");
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState(null);
  const [movendo, setMovendo] = useState(null);
  const local = mapa.locais.find((item) => item.id === localId) ?? null;

  /** Todas as caixinhas do estoque aberto, com o codigo do lugar, para a busca e o painel. */
  const caixinhas = useMemo(() => {
    const lista = [];
    for (const coluna of local?.colunas ?? []) {
      for (const prateleira of coluna.prateleiras) {
        for (const caixinha of prateleira.caixinhas) lista.push({ ...caixinha, lugar: prateleira.codigo, naPrateleira: prateleira.caixinhas.length });
      }
    }
    return lista;
  }, [local]);

  const termo = semAcento(busca.trim());
  const destacados = useMemo(() => {
    if (!termo) return null;
    const palavras = termo.split(/\s+/);
    return new Set(caixinhas.filter((caixinha) => palavras.every((palavra) => semAcento(`${caixinha.sku} ${caixinha.nome} ${caixinha.lugar}`).includes(palavra))).map((caixinha) => caixinha.produtoId));
  }, [termo, caixinhas]);
  const escolhida = caixinhas.find((caixinha) => caixinha.produtoId === selecionado) ?? null;

  function trocarDeLocal(id) {
    setLocalId(id);
    setSelecionado(null);
  }

  if (!local) return <p className="text-sm text-suave">Nenhum estoque cadastrado.</p>;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <nav aria-label="Estoque" className="flex gap-1.5">
          {mapa.locais.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => trocarDeLocal(item.id)}
              aria-pressed={item.id === localId}
              title={item.descricao ?? undefined}
              className={`rounded-full border px-3 py-1 text-sm ${item.id === localId ? "border-acento bg-acento/10 font-medium text-acento" : "border-borda text-suave hover:bg-fundo"}`}
            >
              {item.nome} <span className="tabular-nums">{item.caixinhas}</span>
            </button>
          ))}
        </nav>

        <form
          className="relative ml-2 w-full max-w-xs"
          onSubmit={(evento) => {
            evento.preventDefault();
            const primeira = caixinhas.find((caixinha) => destacados?.has(caixinha.produtoId));
            if (primeira) setSelecionado(primeira.produtoId);
          }}
        >
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-suave" />
          <input
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar por código, nome ou lugar"
            aria-label="Buscar por código, nome ou lugar"
            className="w-full rounded border border-borda bg-superficie py-1.5 pl-8 pr-8 text-sm focus:border-acento focus:outline-none"
          />
          {busca && (
            <button type="button" onClick={() => setBusca("")} aria-label="Limpar a busca" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-suave hover:bg-fundo">
              <X size={14} />
            </button>
          )}
        </form>
        {destacados && <span className="text-sm text-suave tabular-nums">{destacados.size === 1 ? "1 achada" : `${destacados.size} achadas`}</span>}

        {podeMover && <GuardarProduto aoAchar={setMovendo} />}

        <div className="ml-auto flex overflow-hidden rounded border border-borda text-sm" role="group" aria-label="Vista">
          {[
            ["3d", "3D", Box],
            ["frente", "De frente", LayoutGrid],
          ].map(([valor, rotulo, Icone]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setVista(valor)}
              aria-pressed={vista === valor}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${vista === valor ? "bg-acento text-white" : "bg-superficie text-suave hover:bg-fundo"}`}
            >
              <Icone size={14} /> {rotulo}
            </button>
          ))}
        </div>
      </div>

      {local.colunas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-borda bg-superficie px-6 py-14 text-center text-sm text-suave">
          O {local.nome} ainda não tem colunas. Cadastre na aba Colunas.
        </p>
      ) : (
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            {vista === "3d" ? (
              <div className="h-[68vh] min-h-[420px]">
                <Cena3D local={local} selecionado={selecionado} destacados={destacados} aoSelecionar={setSelecionado} />
              </div>
            ) : (
              <VistaDeFrente local={local} selecionado={selecionado} destacados={destacados} aoSelecionar={setSelecionado} />
            )}
          </div>
          {escolhida && <PainelDaCaixinha caixinha={escolhida} podeMover={podeMover} aoMover={() => setMovendo(escolhida.produtoId)} aoFechar={() => setSelecionado(null)} />}
        </div>
      )}

      {local.aplicaRegras && local.foraDaRegra > 0 && (
        <ForaDaRegra caixinhas={caixinhas} podeMover={podeMover} aoEscolher={setSelecionado} aoMover={setMovendo} />
      )}
      {local.fora.length > 0 && <ForaDasPrateleiras titulo={`Fora das prateleiras do ${local.nome}`} itens={local.fora} />}
      {local.numero === 1 && mapa.semLugar.length > 0 && <ForaDasPrateleiras titulo="Localização que não é coluna" itens={mapa.semLugar} />}
      {movendo && <JanelaMover produtoId={movendo} aoFechar={() => setMovendo(null)} />}
    </>
  );
}

/** Cada coluna vista de frente: as prateleiras de cima para baixo e as caixinhas lado a lado, na largura de verdade. */
function VistaDeFrente({ local, selecionado, destacados, aoSelecionar }) {
  return (
    <div className="grid max-h-[68vh] min-h-[420px] grid-cols-1 gap-3 overflow-y-auto pr-1 lg:grid-cols-2 2xl:grid-cols-3">
      {local.colunas.map((coluna) => (
        <section key={coluna.id} className="rounded-lg border border-borda bg-superficie">
          <header className="flex items-baseline justify-between border-b border-borda px-3 py-1.5">
            <span className="text-sm font-semibold">Coluna {coluna.letra}</span>
            <span className="text-xs text-suave tabular-nums">
              {coluna.caixinhas} {coluna.caixinhas === 1 ? "caixinha" : "caixinhas"}
              {coluna.medida ? ` · vão de ${PESO.format(coluna.larguraCm)} cm` : ""}
            </span>
          </header>
          <ol>
            {coluna.prateleiras.map((prateleira) => (
              <li key={prateleira.numero} className="flex items-stretch border-b border-borda last:border-0">
                <span className="flex w-10 shrink-0 items-center justify-center border-r border-borda bg-fundo text-xs font-semibold text-suave">{prateleira.codigo}</span>
                <div className="flex min-h-[52px] min-w-0 flex-1 items-end gap-px p-1">
                  {prateleira.caixinhas.map((caixinha) => {
                    const apagada = destacados !== null && !destacados.has(caixinha.produtoId);
                    return (
                      <button
                        key={caixinha.produtoId}
                        type="button"
                        onClick={() => aoSelecionar(caixinha.produtoId)}
                        title={`${caixinha.sku} · ${caixinha.nome}`}
                        aria-label={`${caixinha.sku}, ${caixinha.nome}, em ${prateleira.codigo}`}
                        aria-pressed={selecionado === caixinha.produtoId}
                        style={{ flexBasis: `${(caixinha.larguraCm / Math.max(coluna.larguraCm, prateleira.ocupadoCm)) * 100}%`, background: caixinha.cor }}
                        className={`relative flex h-11 min-w-0 shrink grow-0 items-end justify-center overflow-hidden rounded-sm border text-[10px] font-semibold leading-none text-white ${
                          selecionado === caixinha.produtoId ? "border-amber-400 ring-2 ring-amber-400" : "border-black/20"
                        } ${apagada ? "opacity-20" : ""}`}
                      >
                        {caixinha.foto && (
                          // eslint-disable-next-line @next/next/no-img-element -- miniatura de 64 px ja pedida ao otimizador
                          <img src={`/_next/image?url=${encodeURIComponent(caixinha.foto)}&w=64&q=75`} alt="" loading="lazy" className="absolute inset-x-0 top-0 mx-auto h-7 w-7 bg-white object-contain" />
                        )}
                        <span className="relative w-full truncate bg-slate-900/75 px-0.5 py-0.5 tabular-nums">{caixinha.sku}</span>
                        {caixinha.avisos.length > 0 && <span className={`absolute right-0 top-0 h-2.5 w-2.5 rounded-bl ${corDoAlerta(caixinha)}`} />}
                      </button>
                    );
                  })}
                </div>
                {prateleira.excedeCm > 0 && (
                  <span className="flex shrink-0 items-center px-2 text-[11px] font-medium text-amber-700" title={`As caixinhas somam ${PESO.format(prateleira.ocupadoCm)} cm num vão de ${PESO.format(coluna.larguraCm)} cm.`}>
                    +{PESO.format(prateleira.excedeCm)} cm
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Linha({ rotulo, children }) {
  return (
    <div className="flex justify-between gap-3 border-b border-borda py-1.5 last:border-0">
      <dt className="text-suave">{rotulo}</dt>
      <dd className="text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}

/** O que ha na caixinha escolhida. */
function PainelDaCaixinha({ caixinha, podeMover, aoMover, aoFechar }) {
  return (
    <aside className="w-72 shrink-0 self-start rounded-lg border border-borda bg-superficie" aria-label={`Caixinha do produto ${caixinha.sku}`}>
      <div className="flex items-start gap-3 border-b border-borda p-3">
        {caixinha.foto && <FotoComLupa src={caixinha.foto} alt={caixinha.nome} className="h-14 w-14 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tabular-nums">{caixinha.sku}</p>
          <p className="line-clamp-3 text-xs text-suave">{caixinha.nome}</p>
        </div>
        <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
          <X size={15} />
        </button>
      </div>
      <dl className="px-3 py-1 text-sm">
        <Linha rotulo="Lugar">
          {caixinha.lugar} · {caixinha.posicao}ª de {caixinha.naPrateleira}
        </Linha>
        <Linha rotulo="Estoque">{caixinha.estoque}</Linha>
        {caixinha.capacidade !== null && (
          <Linha rotulo="Cabem">
            {caixinha.capacidade} <span className="font-normal text-suave">({caixinha.origemDaCapacidade === "digitado" ? "informado" : "estimado"})</span>
          </Linha>
        )}
        {caixinha.modelo && <Linha rotulo="Caixinha">{caixinha.modelo}</Linha>}
        {caixinha.pesoKg !== null && <Linha rotulo="Peso cheia">{PESO.format(caixinha.pesoKg)} kg</Linha>}
      </dl>
      {caixinha.avisos.length > 0 && (
        <ul className="border-t border-borda px-3 py-2 text-xs text-amber-800">
          {caixinha.avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-borda p-3">
        <button
          type="button"
          onClick={aoMover}
          disabled={!podeMover}
          title={podeMover ? "Mudar a caixinha de lugar" : "Sem permissão para mudar a localização."}
          className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          <MoveRight size={14} /> Mover
        </button>
        <Link href={`/produtos/${caixinha.produtoId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-acento hover:underline">
          Abrir o produto <ExternalLink size={13} />
        </Link>
      </div>
    </aside>
  );
}

/** Produtos com localizacao que nao cai numa prateleira ("X", "CHAO"): lista compacta embaixo do desenho. */
function ForaDasPrateleiras({ titulo, itens }) {
  return (
    <details className="mt-3 rounded-lg border border-borda bg-superficie">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        {titulo} <span className="font-normal text-suave tabular-nums">({itens.length})</span>
      </summary>
      <ul className="grid gap-x-4 border-t border-borda px-3 py-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
        {itens.map((item) => (
          <li key={item.produtoId} className="flex gap-2 py-0.5">
            <span className="w-12 shrink-0 font-semibold">{item.localizacao}</span>
            <Link href={`/produtos/${item.produtoId}`} className="min-w-0 truncate hover:underline">
              <span className="tabular-nums">{item.sku}</span> · {item.nome}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** A cor do selo da caixinha: vermelho para regra quebrada (parecido, pesado), ambar para o resto (sem caixinha, nao cabe). */
function corDoAlerta(caixinha) {
  return caixinha.alertas?.some((alerta) => alerta.tipo === "parecido" || alerta.tipo === "pesado") ? "bg-red-500" : "bg-amber-400";
}

const ROTULO_DO_ALERTA = { parecido: "Parecido vizinho", pesado: "Pesada em cima", naoCabe: "Não cabe" };

/** Estoques com regras: a lista do que esta fora delas, com o Mover em cada linha (pedido do dono em 12/11/2026). */
function ForaDaRegra({ caixinhas, podeMover, aoEscolher, aoMover }) {
  const fora = caixinhas.filter((caixinha) => caixinha.alertas?.length);
  return (
    <details open className="mt-3 rounded-lg border border-red-200 bg-superficie">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium">
        <TriangleAlert size={15} className="text-red-600" /> Fora da regra <span className="font-normal text-suave tabular-nums">({fora.length})</span>
      </summary>
      <ul className="divide-y divide-borda border-t border-borda text-sm">
        {fora.map((caixinha) => (
          <li key={caixinha.produtoId} className="flex items-center gap-3 px-3 py-1.5">
            <button type="button" onClick={() => aoEscolher(caixinha.produtoId)} className="w-12 shrink-0 text-left font-semibold hover:underline">
              {caixinha.lugar}
            </button>
            <span className="w-20 shrink-0 tabular-nums">{caixinha.sku}</span>
            <span className="min-w-0 flex-1 truncate text-suave" title={caixinha.alertas.map((alerta) => alerta.texto).join(" · ")}>
              {[...new Set(caixinha.alertas.map((alerta) => ROTULO_DO_ALERTA[alerta.tipo]))].join(" · ")}: {caixinha.alertas[0].texto}
            </span>
            {podeMover && (
              <button type="button" onClick={() => aoMover(caixinha.produtoId)} className="shrink-0 rounded border border-borda px-2 py-1 text-xs hover:bg-fundo">
                Mover
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * "Guardar produto": o produto que ainda nao tem lugar (ou que se quer pelo codigo) abre a janela Mover. Fica no mapa, e nao
 * no cadastro do produto, porque o cadastro aberto tem a Localizacao no formulario: o Salvar de la gravaria por cima do lugar
 * que o Mover acabou de dar.
 */
function GuardarProduto({ aoAchar }) {
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState(null);
  const [pendente, iniciar] = useTransition();
  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo">
        <PackagePlus size={15} /> Guardar produto
      </button>
    );
  }
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(evento) => {
        evento.preventDefault();
        setErro(null);
        iniciar(async () => {
          const resposta = await acharProdutoParaGuardarAcao(codigo);
          if (!resposta?.ok) return setErro(resposta?.erro ?? "Não encontrado.");
          setAberto(false);
          setCodigo("");
          aoAchar(resposta.id);
        });
      }}
    >
      <input
        autoFocus
        value={codigo}
        onChange={(evento) => setCodigo(evento.target.value)}
        placeholder="Código"
        aria-label="Código do produto a guardar"
        className="w-28 rounded border border-borda bg-superficie px-2.5 py-1.5 text-sm focus:border-acento focus:outline-none"
      />
      <button type="submit" disabled={pendente} className="inline-flex items-center gap-1 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
        {pendente && <Loader size={14} className="animate-spin" />} Onde guardar
      </button>
      <button type="button" onClick={() => setAberto(false)} aria-label="Cancelar" className="rounded p-1 text-suave hover:bg-fundo">
        <X size={15} />
      </button>
      {erro && <span className="text-sm text-red-700">{erro}</span>}
    </form>
  );
}

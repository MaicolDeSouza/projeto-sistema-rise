"use client";

import { useMemo, useState } from "react";
import { Loader, RefreshCw, X } from "lucide-react";

/**
 * As categorias da Loja Integrada em arvore (pai > filha), com uma caixa por categoria: o produto
 * pode ficar em varias. A lista vem AO VIVO da loja (o dono esta renovando as categorias do site),
 * por isso ha "Recarregar categorias". A busca mostra o caminho inteiro de cada achado.
 *
 * Categoria marcada que nao existe mais na loja aparece em ambar, com o botao de tirar: no envio
 * ela sai sozinha (uma URI morta daria 400 no meio do PUT), mas o dono tem que saber.
 *
 * Props: `categorias` ([{ id, nome, paiId, caminho }] ou null enquanto nao carregou), `carregando`,
 * `erro`, `aoRecarregar()`, `selecionadas` (ids em texto) e `aoMudar(ids)`.
 */

const semAcento = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

function Ramo({ id, filhos, porId, marcadas, alternar, nivel }) {
  const categoria = porId.get(id);
  const deles = filhos.get(id) ?? [];
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-fundo" style={{ paddingLeft: nivel * 16 + 4 }}>
        <input type="checkbox" checked={marcadas.has(id)} onChange={() => alternar(id)} className="h-4 w-4 accent-acento" />
        <span>{categoria.nome}</span>
      </label>
      {deles.length > 0 && (
        <ul>
          {deles.map((filho) => (
            <Ramo key={filho} id={filho} filhos={filhos} porId={porId} marcadas={marcadas} alternar={alternar} nivel={nivel + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function ArvoreDeCategorias({ categorias, carregando, erro, aoRecarregar, selecionadas, aoMudar }) {
  const [busca, setBusca] = useState("");
  const marcadas = useMemo(() => new Set(selecionadas ?? []), [selecionadas]);

  const { porId, filhos, raizes } = useMemo(() => {
    const mapa = new Map((categorias ?? []).map((categoria) => [categoria.id, categoria]));
    const deFilhos = new Map();
    const deRaizes = [];
    const porNome = (a, b) => mapa.get(a).nome.localeCompare(mapa.get(b).nome, "pt-BR");
    for (const categoria of mapa.values()) {
      if (categoria.paiId && mapa.has(categoria.paiId)) {
        if (!deFilhos.has(categoria.paiId)) deFilhos.set(categoria.paiId, []);
        deFilhos.get(categoria.paiId).push(categoria.id);
      } else {
        deRaizes.push(categoria.id);
      }
    }
    for (const lista of deFilhos.values()) lista.sort(porNome);
    deRaizes.sort(porNome);
    return { porId: mapa, filhos: deFilhos, raizes: deRaizes };
  }, [categorias]);

  function alternar(id) {
    const novas = marcadas.has(id) ? [...marcadas].filter((item) => item !== id) : [...marcadas, id];
    aoMudar(novas);
  }

  const termo = semAcento(busca).trim();
  const achadas = termo ? [...porId.values()].filter((categoria) => semAcento(categoria.caminho).includes(termo)) : [];
  const mortas = categorias ? [...marcadas].filter((id) => !porId.has(id)) : [];
  const marcadasVivas = [...marcadas].filter((id) => porId.has(id));

  return (
    <div className="rounded border border-borda">
      <div className="flex flex-wrap items-center gap-2 border-b border-borda px-3 py-2">
        <input
          type="search"
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
          placeholder="Buscar categoria"
          aria-label="Buscar categoria"
          className="min-w-0 flex-1 rounded border border-borda bg-superficie px-2 py-1.5 text-sm focus:border-acento focus:outline-none"
        />
        <button
          type="button"
          onClick={aoRecarregar}
          disabled={carregando}
          className="inline-flex items-center gap-1.5 rounded border border-borda px-2.5 py-1.5 text-xs hover:bg-fundo disabled:opacity-60"
        >
          {carregando ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Recarregar categorias
        </button>
      </div>

      {marcadasVivas.length > 0 && (
        <p className="border-b border-borda px-3 py-2 text-xs text-suave">
          Marcadas: {marcadasVivas.map((id) => porId.get(id).caminho).join(" · ")}
        </p>
      )}

      {mortas.map((id) => (
        <div key={id} className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          <span>Categoria {id} não existe mais na loja: fica fora do envio.</span>
          <button type="button" onClick={() => alternar(id)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-amber-100">
            <X size={12} />
            Tirar
          </button>
        </div>
      ))}

      <div className="max-h-72 overflow-y-auto px-2 py-2">
        {erro && <p className="px-1 text-sm text-red-700">{erro}</p>}
        {!erro && !categorias && <p className="px-1 text-sm text-suave">{carregando ? "Lendo as categorias da Loja Integrada..." : "Categorias ainda não carregadas."}</p>}
        {categorias && categorias.length === 0 && <p className="px-1 text-sm text-suave">A loja não tem categorias.</p>}
        {categorias && termo && (
          <ul>
            {achadas.length === 0 && <li className="px-1 text-sm text-suave">Nenhuma categoria com &quot;{busca}&quot;.</li>}
            {achadas.map((categoria) => (
              <li key={categoria.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-fundo">
                  <input type="checkbox" checked={marcadas.has(categoria.id)} onChange={() => alternar(categoria.id)} className="h-4 w-4 accent-acento" />
                  <span>{categoria.caminho}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {categorias && !termo && (
          <ul>
            {raizes.map((id) => (
              <Ramo key={id} id={id} filhos={filhos} porId={porId} marcadas={marcadas} alternar={alternar} nivel={0} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

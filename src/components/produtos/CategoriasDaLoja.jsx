"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader, Sparkles } from "lucide-react";

import { categoriasDaLoja, sugerirCategoriasDoProduto } from "@/app/produtos/acoes-loja";
import ArvoreDeCategorias from "@/components/anuncios/li/ArvoreDeCategorias";
import GastoDaIA from "@/components/ui/GastoDaIA";

/**
 * Aba Categorias do cadastro de Produto (pedido do dono em 25/10/2026: as categorias da Loja Integrada passaram do editor da LI
 * para o produto base; a aba da LI so mostra). As categorias sao do PRODUTO (`Produto.categoriasLI`), em varias: a arvore
 * ao vivo da loja (o dono esta renovando o site), com busca e "Recarregar", e o "Sugerir com IA" (a IA escolhe na arvore
 * real pelo nome, marca e descricao). Nada e marcado ate o dono clicar em "Marcar estas", que marca so as sugeridas (sem as
 * categorias-pai: a loja ja mostra o produto no pai) e mantem as que ja estavam marcadas.
 *
 * O valor vai no Salvar por um campo OCULTO (`categoriasLI`, JSON de ids): o formulario nao e controlado, e o campo e o que o
 * rascunho automatico guarda e devolve (`inicial` aceita a lista ou o JSON). A arvore so e lida da loja na primeira vez que
 * a aba abre (`ativo`), para abrir o cadastro nao gastar chamadas da API.
 */

async function chamar(acao, ...argumentos) {
  try {
    return await acao(...argumentos);
  } catch {
    return { ok: false, erro: "Não foi possível falar com o servidor. Tente de novo." };
  }
}

/** A lista de ids vinda do banco (lista) ou do rascunho automatico (JSON em texto). Qualquer outra coisa vira lista vazia. */
export function idsDasCategorias(valor) {
  let lista = valor;
  if (typeof valor === "string") {
    try {
      lista = JSON.parse(valor);
    } catch {
      return [];
    }
  }
  return Array.isArray(lista) ? [...new Set(lista.map(String).filter(Boolean))] : [];
}

export default function CategoriasDaLoja({ inicial, lerCampo, aoAlterar, ativo, acessos = { ia: true } }) {
  const [marcadas, setMarcadas] = useState(() => idsDasCategorias(inicial));
  const [pediu, setPediu] = useState(false);
  const [arvore, setArvore] = useState({ lista: null, erro: null, lida: false, recarregando: false });
  const [sugestoes, setSugestoes] = useState(null);
  const [erro, setErro] = useState(null);
  const [gasto, setGasto] = useState(null);
  const [pensando, iniciar] = useTransition();

  // "Recarregar categorias" (evento do botao): mostra o carregando na hora e le de novo.
  async function recarregar() {
    setArvore((atual) => ({ ...atual, recarregando: true, erro: null }));
    const resultado = await chamar(categoriasDaLoja);
    setArvore(resultado.ok ? { lista: resultado.categorias, erro: null, lida: true, recarregando: false } : { lista: null, erro: resultado.erro, lida: true, recarregando: false });
  }

  // A arvore so e lida na PRIMEIRA vez que a aba abre (ajuste de estado durante a renderizacao, o padrao do React 19 no
  // lugar de setState em efeito); o efeito so dispara a leitura, e o estado muda depois da resposta.
  if (ativo && !pediu) setPediu(true);
  useEffect(() => {
    if (!pediu) return;
    (async () => {
      const resultado = await chamar(categoriasDaLoja);
      setArvore(resultado.ok ? { lista: resultado.categorias, erro: null, lida: true, recarregando: false } : { lista: null, erro: resultado.erro, lida: true, recarregando: false });
    })();
  }, [pediu]);
  const carregando = arvore.recarregando || (pediu && !arvore.lida);

  function mudar(novas) {
    setMarcadas(novas);
    aoAlterar?.();
  }

  function sugerir() {
    setErro(null);
    iniciar(async () => {
      const resultado = await chamar(sugerirCategoriasDoProduto, { titulo: lerCampo("tituloBase"), marca: lerCampo("marca"), descricao: lerCampo("descricaoBase") });
      setGasto(resultado.gasto ?? null);
      if (resultado.ok) setSugestoes(resultado.sugestoes);
      else setErro(resultado.erro);
    });
  }

  function marcarSugeridas() {
    // So as sugeridas (as mais especificas): o pai nao e marcado, porque a loja ja mostra o produto nele (24/10/2026).
    mudar([...new Set([...marcadas, ...sugestoes.map((sugestao) => sugestao.id)])]);
    setSugestoes(null);
  }

  const todasMarcadas = sugestoes?.length > 0 && sugestoes.every((sugestao) => marcadas.includes(sugestao.id));

  return (
    <div className="space-y-2">
      <input type="hidden" name="categoriasLI" value={JSON.stringify(marcadas)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Categorias na Loja Integrada</p>
        {acessos.ia && (
          <button
            type="button"
            onClick={sugerir}
            disabled={pensando || !arvore.lista?.length}
            title={!arvore.lista?.length ? "Espere a lista de categorias da loja carregar" : undefined}
            className="inline-flex items-center gap-1.5 rounded border border-dashed border-acento px-3 py-1.5 text-xs font-medium text-acento hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pensando ? <Loader size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {pensando ? "Pensando..." : sugestoes ? "Sugerir de novo com IA" : "Sugerir com IA"}
          </button>
        )}
      </div>
      {/* Quanto custou a ultima sugestao (pedido do dono em 12/10/2026). */}
      <GastoDaIA gasto={gasto} className="text-right" />

      {erro && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{erro}</p>}

      {sugestoes && sugestoes.length > 0 && (
        <section aria-label="Categorias sugeridas pela IA" className="rounded border border-violet-200 bg-violet-50/60 p-3">
          <p className="text-xs font-semibold text-violet-900">Sugestão da IA</p>
          <ul className="mt-1.5 space-y-1.5">
            {sugestoes.map((sugestao) => (
              <li key={sugestao.id} className="text-sm">
                <span className="font-medium">{sugestao.caminho}</span>
                {marcadas.includes(sugestao.id) && (
                  <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-emerald-700">
                    <Check size={12} />
                    já marcada
                  </span>
                )}
                {sugestao.motivo && <span className="block text-xs text-suave">{sugestao.motivo}</span>}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={marcarSugeridas} disabled={todasMarcadas} className="rounded bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
              Marcar estas
            </button>
            <button type="button" onClick={() => setSugestoes(null)} className="rounded border border-borda bg-white px-3 py-1.5 text-xs hover:bg-fundo">
              Descartar
            </button>
            <span className="text-[11px] text-suave">Mantém as que já estão marcadas.</span>
          </div>
        </section>
      )}

      <ArvoreDeCategorias categorias={arvore.lista} carregando={carregando} erro={arvore.erro} aoRecarregar={recarregar} selecionadas={marcadas} aoMudar={mudar} />
      {marcadas.length === 0 && arvore.lista && <p className="text-xs text-suave">Sem categoria o produto não aparece em nenhum menu da loja.</p>}
    </div>
  );
}

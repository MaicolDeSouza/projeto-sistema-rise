"use client";

import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useState,
  useTransition,
} from "react";
import { ExternalLink, Loader, Sparkles, X } from "lucide-react";

import { criarDescricaoIA, detalhesDasReferencias } from "@/app/produtos/acoes";

/// Cor do ponto de cada aba: verde fornecedor, amarelo concorrente — as mesmas
/// cores dos selos da janela da lupa.
const ROTULO_TIPO = {
  FORNECEDOR: { ponto: "bg-emerald-500" },
  CONCORRENTE: { ponto: "bg-amber-500" },
  OUTRO: { ponto: "bg-slate-400" },
};

/** O texto e a ficha que uma loja publica para o produto marcado. */
function ConteudoReferencia({ item }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{item.nome ?? "(sem nome)"}</p>
          <p className="mt-0.5 text-xs text-suave">
            {item.codigo && <span className="font-mono">{item.codigo}</span>}
            {item.marca && <> · Marca: <strong className="text-texto">{item.marca}</strong></>}
            {item.modelo && <> · Modelo: <strong className="text-texto">{item.modelo}</strong></>}
          </p>
        </div>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs text-acento hover:underline"
          >
            Abrir <ExternalLink size={12} />
          </a>
        )}
      </div>

      {item.especificacoes.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-suave uppercase">Especificacoes</p>
          <ul className="space-y-0.5">
            {item.especificacoes.map((linha, indice) => (
              <li key={indice}>
                - {linha.nome ? <strong>{linha.nome}: </strong> : null}
                {linha.valor}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold text-suave uppercase">Descricao da loja</p>
        {item.descricao ? (
          <p className="whitespace-pre-wrap text-texto">{item.descricao}</p>
        ) : (
          <p className="text-suave">Esta loja nao publica descricao.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Os produtos marcados LADO A LADO, em abas no topo — desenho do dono em
 * 16/09/2026 (antes era uma lista de secoes empilhadas, que obrigava a rolar
 * para achar a segunda loja). Cada aba diz o tipo pela cor e a loja pelo nome.
 */
function AbasDeReferencias({ itens }) {
  const [ativa, setAtiva] = useState(0);
  const item = itens[Math.min(ativa, itens.length - 1)];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" className="flex flex-wrap gap-1.5 border-b border-borda pb-2">
        {itens.map((referencia, indice) => {
          const tipo = ROTULO_TIPO[referencia.tipo] ?? ROTULO_TIPO.OUTRO;
          const selecionada = indice === ativa;
          return (
            <button
              key={referencia.id}
              type="button"
              role="tab"
              aria-selected={selecionada}
              onClick={() => setAtiva(indice)}
              title={referencia.nome ?? ""}
              className={`max-w-44 truncate rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                selecionada
                  ? "border-acento bg-sky-50 text-texto"
                  : "border-borda text-suave hover:border-acento/50 hover:text-texto"
              }`}
            >
              <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${tipo.ponto}`} />
              {referencia.fonte}
              {referencia.codigo && <span className="ml-1 font-mono opacity-70">{referencia.codigo}</span>}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto pt-3 pr-1">
        <ConteudoReferencia key={item.id} item={item} />
      </div>
    </div>
  );
}

/**
 * Janela "Criar descricao" — pedido do dono em 16/09/2026.
 *
 * A esquerda, os produtos marcados na lupa do Nome, em abas lado a lado, com a
 * descricao e a ficha de cada loja; a direita, a criacao com IA no padrao da loja
 * (titulo, 2 paragrafos de ate 4 linhas, Especificacoes tecnicas, Itens inclusos, Garantia),
 * em texto puro.
 *
 * O texto gerado aparece EDITAVEL antes de ir para o campo: a descricao vai para
 * o anuncio, e o operador confere especificacao por especificacao. Nada substitui
 * o texto do formulario ate "Usar esta descricao".
 *
 * O formulario abre pelo `ref` (`abrir`). `lerProduto` devolve o Nome e o Codigo
 * NO MOMENTO da geracao: titulo e "Itens inclusos: (Cod:...)" saem deles.
 */
export default function JanelaDescricao({ ref, ids, lerProduto, aoUsar }) {
  const [aberta, setAberta] = useState(false);
  const [detalhes, setDetalhes] = useState(null);
  const [lendo, iniciarLeitura] = useTransition();
  const [gerando, iniciarGeracao] = useTransition();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState(null);
  const [produto, setProduto] = useState({ titulo: "", sku: "" });

  function abrir() {
    setAberta(true);
    setErro(null);
    setProduto(lerProduto());
    setDetalhes(null);
    if (ids.length === 0) {
      setDetalhes({ ok: true, itens: [] });
      return;
    }
    iniciarLeitura(async () => {
      try {
        setDetalhes(await detalhesDasReferencias(ids));
      } catch (falha) {
        setDetalhes({ ok: false, erro: falha?.message ?? "Falha ao ler as referencias." });
      }
    });
  }

  useImperativeHandle(ref, () => ({ abrir }));

  function fechar() {
    setAberta(false);
  }
  const fecharPeloTeclado = useEffectEvent(fechar);

  useEffect(() => {
    if (!aberta) return;
    const aoTeclar = (evento) => {
      if (evento.key === "Escape") fecharPeloTeclado();
    };
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberta]);

  function gerar() {
    setErro(null);
    // Nome e Codigo lidos na hora de gerar: sao os que entram no texto.
    const atual = lerProduto();
    setProduto(atual);
    iniciarGeracao(async () => {
      try {
        const resultado = await criarDescricaoIA(ids, atual);
        if (!resultado.ok) {
          setErro(resultado.erro);
          return;
        }
        setTexto(resultado.texto);
      } catch (falha) {
        setErro(falha?.message ?? "Falha ao chamar a IA.");
      }
    });
  }

  function usar() {
    aoUsar(texto, ids.length);
    setAberta(false);
  }

  if (!aberta) return null;

  const itens = detalhes?.ok ? detalhes.itens : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) fechar();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Criar descricao"
        className="flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-borda bg-superficie shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-borda p-3">
          <span className="text-sm font-semibold">Criar descricao</span>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar criar descricao"
            className="rounded p-1 text-suave hover:bg-fundo"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-3 lg:grid-cols-2">
          {/* ---------- Referencias ---------- */}
          <div className="flex min-h-0 flex-col">
            <p className="mb-2 text-xs font-semibold tracking-wide text-suave uppercase">
              Produtos marcados ({ids.length})
            </p>
            <div className="flex min-h-0 flex-1 flex-col">
              {lendo || !detalhes ? (
                <p className="flex items-center gap-2 text-sm text-suave">
                  <Loader size={14} className="animate-spin" /> Lendo as referencias...
                </p>
              ) : !detalhes.ok ? (
                <p className="text-sm text-red-700">{detalhes.erro}</p>
              ) : itens.length === 0 ? (
                <p className="text-sm text-suave">
                  Nenhum produto marcado. Marque referencias na lupa ao lado do Nome.
                </p>
              ) : (
                <AbasDeReferencias itens={itens} />
              )}
            </div>
          </div>

          {/* ---------- Criar com IA ---------- */}
          <div className="flex min-h-0 flex-col rounded-lg border border-borda bg-fundo p-3">
            <p className="mb-1 text-xs font-semibold tracking-wide text-suave uppercase">
              Criar a descricao com IA
            </p>
            <p className="mb-2 text-xs text-suave">
              Segue o padrao da loja, em texto puro: titulo, 2 paragrafos de ate 4 linhas, Especificacoes
              tecnicas, Itens inclusos com o codigo e Garantia.
            </p>

            <dl className="mb-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
              <dt className="text-suave">Titulo:</dt>
              <dd className={produto.titulo ? "font-medium" : "text-amber-700"}>
                {produto.titulo || "preencha o Nome antes de gerar"}
              </dd>
              <dt className="text-suave">Codigo:</dt>
              <dd className={produto.sku ? "font-mono" : "text-amber-700"}>
                {produto.sku || "sem codigo: \"Itens inclusos\" sai sem (Cod:)"}
              </dd>
            </dl>

            <div className="mb-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={gerar}
                disabled={gerando || ids.length === 0}
                className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {gerando ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {gerando ? "Escrevendo..." : texto ? "Gerar de novo" : "Gerar com IA"}
              </button>
            </div>

            {erro && <p className="mb-2 text-sm text-red-700">{erro}</p>}

            <textarea
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              placeholder="A descricao gerada aparece aqui, e pode ser editada antes de usar."
              className="min-h-64 w-full flex-1 resize-none rounded border border-borda bg-superficie p-2.5 font-mono text-sm leading-relaxed focus:border-acento focus:outline-none"
            />

            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-suave">
                Substitui o texto da aba Descricao.
              </span>
              <button
                type="button"
                onClick={usar}
                disabled={!texto.trim()}
                className="rounded bg-acento px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Usar esta descricao
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

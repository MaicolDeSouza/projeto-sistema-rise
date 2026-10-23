"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { propsDoFundo } from "@/lib/fundoDaJanela";
import { moverNaOrdem } from "@/lib/proposta/aplicar";
import { AmpliacaoDeFoto, ImagemComZoom } from "./ImagemComZoom";

/**
 * Janela "Fotos da proposta" (aba Imagens, spec 2026-10-16): as candidatas que a sessao do Claude baixou e as fotos
 * atuais que ela citou, com o check das escolhidas. "Aplicar fotos" so devolve a escolha (ids na ordem); quem mexe no
 * painel e o PainelDeImagens, e quem grava e o Salvar.
 *
 * Pedido do dono em 21/10/2026 (anotacao docs/superpowers/anotacoes/2026-10-21-fotos-da-proposta.md):
 * - o mouse em cima AMPLIA a foto dentro do cartao (`ImagemComZoom`, o mesmo das fotos do produto);
 * - o clique abre a foto GRANDE com setas (`AmpliacaoDeFoto`), com o Escolher/Remover escolha embaixo;
 * - marcar e desmarcar e o botao do cartao (o clique na foto passou a abrir a grande);
 * - segurar e arrastar muda a ordem das escolhidas (`moverNaOrdem`); arrastar uma nao escolhida sobre uma escolhida a
 *   escolhe ali. Arrastar e o nativo do navegador: clicar e soltar sem mover continua sendo clique.
 *
 * Desenho: nesta janela o operador precisa ver primeiro as fotos e quais estao escolhidas, em que ordem; a acao
 * principal e "Aplicar fotos".
 */
export default function FotosDaProposta({ fotos, urls, aoAplicar, aoFechar, ocupado = false, ordemInicial = null }) {
  const candidatas = fotos?.candidatas ?? [];
  // `ordemInicial`: a ultima escolha que o dono APLICOU nesta edicao (pedido do dono em 23/10/2026: reabrir antes de
  // salvar voltava a escolha da proposta). Sem ela, a escolha gravada na proposta (que o Salvar atualiza).
  const [ordem, setOrdem] = useState(() =>
    Array.isArray(ordemInicial)
      ? ordemInicial.filter((id) => candidatas.some((c) => c.id === id))
      : candidatas.filter((c) => c.escolhida).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((c) => c.id),
  );
  const [zoom, setZoom] = useState(null);
  const [aberta, setAberta] = useState(null);
  const [arrastando, setArrastando] = useState(null);
  const [sobre, setSobre] = useState(null);

  useEffect(() => {
    const aoTeclar = (evento) => {
      if (evento.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  // ESCOLHER NAO MEXE NA ROLAGEM (pedido do dono em 23/10/2026): a foto escolhida sobe para a fila das escolhidas, mas a
  // grade fica onde o operador estava. O navegador "acompanhava" a foto clicada ate o topo (scroll anchoring); a grade
  // tem `overflow-anchor: none` e, por garantia, a posicao e guardada antes e devolvida depois da troca.
  const grade = useRef(null);
  const rolagemGuardada = useRef(null);
  useLayoutEffect(() => {
    if (rolagemGuardada.current !== null && grade.current) {
      grade.current.scrollTop = rolagemGuardada.current;
      rolagemGuardada.current = null;
    }
  }, [ordem]);

  function alternar(id) {
    rolagemGuardada.current = grade.current?.scrollTop ?? null;
    setOrdem((atual) => (atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]));
  }

  // Escolhidas primeiro (na ordem), depois as outras: e o que o operador confere.
  const visiveis = [...candidatas].sort((a, b) => {
    const pa = ordem.indexOf(a.id);
    const pb = ordem.indexOf(b.id);
    return (pa < 0 ? 999 : pa) - (pb < 0 ? 999 : pb);
  });
  const urlDe = (candidata) => urls?.[`foto:${candidata.id}`] ?? null;

  // A foto grande segue o id, e nao a posicao: escolher muda a ordem da grade, e a foto aberta nao pode trocar.
  const posicaoAberta = aberta === null ? -1 : visiveis.findIndex((c) => c.id === aberta);
  const candidataAberta = posicaoAberta >= 0 ? visiveis[posicaoAberta] : null;

  function soltar(alvoId) {
    if (arrastando) setOrdem((atual) => moverNaOrdem(atual, arrastando, alvoId));
    setArrastando(null);
    setSobre(null);
  }

  function botaoDaEscolha(candidata, tamanho = "pequeno") {
    const marcada = ordem.includes(candidata.id);
    const base = tamanho === "pequeno" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm";
    return (
      <button
        type="button"
        onClick={() => alternar(candidata.id)}
        aria-pressed={marcada}
        className={
          marcada
            ? `${base} rounded border border-red-300 font-medium text-red-700 hover:bg-red-50`
            : `${base} inline-flex items-center gap-1 rounded bg-emerald-600 font-medium text-white hover:bg-emerald-700`
        }
      >
        {marcada ? "Remover escolha" : (<><Check size={12} /> Escolher essa</>)}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" {...propsDoFundo(aoFechar)}>
      <div role="dialog" aria-label="Fotos da proposta" className="mt-6 flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-superficie shadow-xl">
        <header className="flex items-center gap-3 border-b border-borda px-5 py-3">
          <h2 className="font-semibold">Fotos da proposta</h2>
          <span className="text-xs text-suave">
            {ordem.length} {ordem.length === 1 ? "escolhida" : "escolhidas"} de {candidatas.length}
          </span>
          <span className="relative inline-flex">
            <BolhaDeAjuda
              variante="inline"
              texto="Mouse em cima amplia; clique abre a foto grande, com setas. Escolher essa / Remover escolha marca a foto; o número é a ordem (a 1ª é a principal). Segure e arraste uma foto sobre uma escolhida para pô-la naquela posição. Aplicar põe as escolhidas no painel, validadas; as fotos atuais que ficarem de fora saem do carrossel ao salvar (ficam guardadas)."
            />
          </span>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="ml-auto rounded p-1 text-suave hover:bg-fundo">
            <X size={18} />
          </button>
        </header>

        <ul ref={grade} className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-4 [overflow-anchor:none] sm:grid-cols-3 lg:grid-cols-4">
          {visiveis.map((candidata) => {
            const posicao = ordem.indexOf(candidata.id);
            const marcada = posicao >= 0;
            const url = urlDe(candidata);
            const alvo = sobre === candidata.id && arrastando && arrastando !== candidata.id && marcada;
            return (
              <li
                key={candidata.id}
                draggable
                onDragStart={(evento) => {
                  setZoom(null);
                  setArrastando(candidata.id);
                  evento.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setArrastando(null);
                  setSobre(null);
                }}
                onDragOver={(evento) => {
                  // So uma ESCOLHIDA recebe: e a ordem delas que muda.
                  if (!marcada) return;
                  evento.preventDefault();
                  if (sobre !== candidata.id) setSobre(candidata.id);
                }}
                onDrop={(evento) => {
                  evento.preventDefault();
                  soltar(candidata.id);
                }}
                className={`relative flex flex-col rounded border-2 p-1.5 ${marcada ? "border-emerald-500" : "border-borda"} ${alvo ? "ring-2 ring-acento ring-offset-1" : ""} ${arrastando === candidata.id ? "opacity-50" : ""}`}
                title={candidata.motivo}
              >
                {url ? (
                  <ImagemComZoom
                    src={url}
                    alt={`Candidata ${candidata.id}`}
                    zoom={zoom?.id === candidata.id ? zoom.ponto : null}
                    setZoom={(ponto) => setZoom(ponto ? { id: candidata.id, ponto } : null)}
                    aoAmpliar={() => setAberta(candidata.id)}
                    className="aspect-square w-full rounded bg-white"
                  />
                ) : (
                  <span className="flex aspect-square w-full items-center justify-center rounded bg-fundo text-xs text-suave">sem imagem</span>
                )}
                {marcada && (
                  <span className="pointer-events-none absolute top-2.5 left-2.5 inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full bg-emerald-600 px-1.5 text-xs font-semibold text-white">
                    <Check size={12} /> {posicao + 1}
                  </span>
                )}
                <span className="mt-1 block truncate text-xs font-medium">{candidata.origem?.loja}</span>
                <span className="line-clamp-2 block flex-1 text-[11px] text-suave">{candidata.motivo}</span>
                <div className="mt-1.5">{botaoDaEscolha(candidata)}</div>
              </li>
            );
          })}
        </ul>

        <footer className="flex items-center justify-end gap-2 border-t border-borda px-5 py-3">
          <button type="button" onClick={aoFechar} className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => aoAplicar(ordem)}
            disabled={ocupado || ordem.length === 0}
            title={ordem.length === 0 ? "Escolha pelo menos uma foto" : undefined}
            className="rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ocupado ? "Aplicando..." : "Aplicar fotos"}
          </button>
        </footer>
      </div>

      {candidataAberta && urlDe(candidataAberta) && (
        <AmpliacaoDeFoto
          src={urlDe(candidataAberta)}
          alt={`Candidata ${candidataAberta.id}`}
          aoFechar={() => setAberta(null)}
          posicao={posicaoAberta}
          total={visiveis.length}
          aoNavegar={(passo) => {
            const proxima = visiveis[posicaoAberta + passo];
            if (proxima) setAberta(proxima.id);
          }}
        >
          {ordem.includes(candidataAberta.id) && (
            <span className="inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full bg-emerald-600 px-1.5 text-xs font-semibold text-white">
              <Check size={12} /> {ordem.indexOf(candidataAberta.id) + 1}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium">{candidataAberta.origem?.loja}</span>
            {candidataAberta.motivo && <span className="block truncate text-xs text-slate-500">{candidataAberta.motivo}</span>}
          </span>
          {botaoDaEscolha(candidataAberta, "grande")}
        </AmpliacaoDeFoto>
      )}
    </div>
  );
}

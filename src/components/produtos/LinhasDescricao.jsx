"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, GripVertical, Pencil, Trash2, X } from "lucide-react";
import { formatarLinhaTecnica, limitesEspecificacoes } from "@/lib/ia/revisaoDescricao";

const CORES = [
  { base: "border-amber-400 bg-amber-50", marcada: "border-amber-600 bg-amber-200" },
  { base: "border-emerald-400 bg-emerald-50", marcada: "border-emerald-600 bg-emerald-200" },
  { base: "border-violet-400 bg-violet-50", marcada: "border-violet-600 bg-violet-200" },
  { base: "border-sky-400 bg-sky-50", marcada: "border-sky-600 bg-sky-200" },
  { base: "border-rose-400 bg-rose-50", marcada: "border-rose-600 bg-rose-200" },
  { base: "border-teal-400 bg-teal-50", marcada: "border-teal-600 bg-teal-200" },
];

/**
 * A descricao para revisar, em UM texto corrido (pedido do dono em 10/10/2026): as linhas comuns, e no lugar de cada
 * escolha um QUADRO preto com as opcoes dentro (os dois primeiros paragrafos e cada parametro divergente), com as
 * cores internas de antes. Ate ali as opcoes de paragrafo eram uma lista separada, acima do texto.
 */
export default function LinhasDescricao({
  texto, divergencias, opcoesRestantes, selecoes, confirmadas,
  aoSelecionar, aoEditarOpcao, aoExcluirOpcao, aoExcluirLinha, aoMover, aoMoverPasso, rolagem,
  paragrafos = [], escolhidosParagrafos = [], aoEscolherParagrafo,
}) {
  const [destino, setDestino] = useState(null);
  // Opcao em edicao: { chave, valor }. Uma por vez; salvar grava o texto na opcao, cancelar descarta.
  const [edicao, setEdicao] = useState(null);

  function salvarEdicao(divergencia, opcaoIndice) {
    const linha = edicao?.valor.trim();
    if (!linha) return;
    aoEditarOpcao(divergencia, opcaoIndice, linha);
    setEdicao(null);
  }
  const arraste = useRef(null);
  const linhas = texto.split("\n");
  const { inicio, fim } = limitesEspecificacoes(texto);
  const grupos = divergencias
    .map((item, indice) => ({ ...item, cor: CORES[indice % CORES.length] }))
    .filter((item) => !confirmadas.has(item.id))
    .sort((a, b) => (a.posicao ?? Infinity) - (b.posicao ?? Infinity));
  const escolhidas = new Set(divergencias
    .filter((item) => confirmadas.has(item.id) && Number.isInteger(selecoes[item.id]))
    .map((item) => formatarLinhaTecnica(item.opcoes[selecoes[item.id]].linha)));
  // A linha de cada paragrafo com opcoes e a opcao escolhida dele: ali entra o quadro do paragrafo.
  const linhaDoParagrafo = new Map(
    paragrafos
      .map((opcoes, grupo) => [opcoes[escolhidosParagrafos[grupo] ?? 0]?.trim(), grupo, opcoes.length])
      .filter(([linha, , quantas]) => linha && quantas > 1)
      .map(([linha, grupo]) => [linha, grupo]),
  );
  const visiveis = [];
  let grupo = 0;
  let comuns = 0;
  function adicionarOpcoes(todas = false) {
    while (grupo < grupos.length && (todas || (grupos[grupo].posicao ?? Infinity) <= comuns)) {
      visiveis.push({ tipo: "grupo", divergencia: grupos[grupo++] });
    }
  }
  const paragrafosPostos = new Set();
  for (let indice = 0; indice < linhas.length; indice++) {
    const tecnica = indice >= inicio && indice < fim && Boolean(linhas[indice].trim());
    if (indice === fim) adicionarOpcoes(true);
    else if (tecnica) adicionarOpcoes();
    const paragrafo = linhaDoParagrafo.get(linhas[indice].trim());
    if (paragrafo !== undefined && !paragrafosPostos.has(paragrafo)) {
      paragrafosPostos.add(paragrafo);
      visiveis.push({ tipo: "paragrafo", grupo: paragrafo });
      continue;
    }
    visiveis.push({ tipo: "linha", indice, linha: linhas[indice], tecnica });
    if (tecnica && !escolhidas.has(linhas[indice])) comuns++;
  }
  while (grupo < grupos.length) visiveis.push({ tipo: "grupo", divergencia: grupos[grupo++] });

  function atualizarDestino(evento) {
    if (!arraste.current) return;
    const elemento = document.elementFromPoint(evento.clientX, evento.clientY)?.closest("[data-spec-index]");
    if (elemento) {
      const indice = Number(elemento.dataset.specIndex);
      arraste.current.destino = indice;
      setDestino(indice);
    }
    const painel = rolagem.current;
    if (painel) {
      const area = painel.getBoundingClientRect();
      if (evento.clientY < area.top + 35) painel.scrollBy({ top: -22 });
      else if (evento.clientY > area.bottom - 35) painel.scrollBy({ top: 22 });
    }
  }

  function terminarArraste(evento) {
    if (!arraste.current) return;
    const { origem, destino: alvo } = arraste.current;
    arraste.current = null;
    setDestino(null);
    evento.currentTarget.releasePointerCapture(evento.pointerId);
    if (origem !== alvo) aoMover(origem, alvo);
  }

  /** Uma opcao de parametro, com as cores de sempre (a cor do grupo; mais forte na marcada). */
  function opcaoDoParametro(divergencia, opcaoIndice) {
    const opcao = divergencia.opcoes[opcaoIndice];
    const marcada = selecoes[divergencia.id] === opcaoIndice;
    const cor = marcada ? divergencia.cor.marcada : divergencia.cor.base;
    const chave = divergencia.id + "-" + opcaoIndice;
    if (edicao?.chave === chave) {
      return (
        <div key={chave} className={"flex items-start gap-1 border-l-4 border-b p-0.5 last:border-b-0 " + cor}>
          <span className="w-8 shrink-0 px-1 py-1.5 text-center text-suave">?</span>
          <input
            autoFocus
            value={edicao.valor}
            onChange={(evento) => setEdicao({ chave, valor: evento.target.value })}
            onKeyDown={(evento) => {
              if (evento.key === "Enter") {
                evento.preventDefault();
                salvarEdicao(divergencia, opcaoIndice);
              } else if (evento.key === "Escape") {
                // Escape fecha so a edicao, e nao a janela inteira.
                evento.stopPropagation();
                setEdicao(null);
              }
            }}
            aria-label={"Editar opção de " + divergencia.campo}
            className="min-w-0 flex-1 rounded border border-borda bg-white px-1.5 py-1 font-mono text-xs"
          />
          <button type="button" onClick={() => salvarEdicao(divergencia, opcaoIndice)} disabled={!edicao.valor.trim()} aria-label="Salvar edição desta opção" title="Salvar" className="shrink-0 p-1.5 text-emerald-700 hover:text-emerald-900 disabled:opacity-30"><Check size={14} /></button>
          <button type="button" onClick={() => setEdicao(null)} aria-label="Cancelar edição" title="Cancelar" className="shrink-0 p-1.5 text-suave hover:text-red-700"><X size={14} /></button>
        </div>
      );
    }
    return (
      <div key={chave} className={"flex items-start border-l-4 border-b p-0.5 last:border-b-0 " + cor}>
        <span className="w-8 shrink-0 px-1 py-1.5 text-center text-suave">?</span>
        <button
          type="button"
          onClick={() => aoSelecionar(divergencia.id, opcaoIndice)}
          aria-pressed={marcada}
          title={opcao.fontes.map((fonte) => fonte.nome + ": " + fonte.produto).join(" · ")}
          className="min-w-0 flex-1 whitespace-pre-wrap px-1 py-1.5 text-left hover:underline"
        >
          {formatarLinhaTecnica(opcao.linha)}
          {marcada && <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 font-sans font-semibold text-white">Selecionada</span>}
          {divergencia.recomendada === opcaoIndice && (
            <span title={divergencia.motivo || undefined} className="ml-2 rounded bg-emerald-600 px-1.5 py-0.5 font-sans font-semibold text-white">IA recomenda</span>
          )}
        </button>
        <button type="button" onClick={() => setEdicao({ chave, valor: formatarLinhaTecnica(opcao.linha) })} aria-label={"Editar opção " + opcao.valor + " de " + divergencia.campo} title="Editar esta opção" className="shrink-0 p-1.5 text-suave hover:text-acento"><Pencil size={13} /></button>
        <button type="button" onClick={() => aoExcluirOpcao(divergencia, opcaoIndice)} aria-label={"Excluir opção " + opcao.valor + " de " + divergencia.campo} title="Excluir esta opção" className="shrink-0 p-1.5 text-suave hover:text-red-700"><Trash2 size={13} /></button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded border border-borda bg-superficie font-mono text-xs">
      {visiveis.map((item, ordem) => {
        if (item.tipo === "paragrafo") {
          const opcoes = paragrafos[item.grupo];
          return (
            <Quadro key={"paragrafo-" + item.grupo} titulo={`Parágrafo ${item.grupo + 1}: escolha uma opção`} rotulo={`Opções do parágrafo ${item.grupo + 1}`} radio>
              {opcoes.map((opcao, indice) => {
                const escolhida = (escolhidosParagrafos[item.grupo] ?? 0) === indice;
                return (
                  <button
                    key={indice}
                    type="button"
                    role="radio"
                    aria-checked={escolhida}
                    onClick={() => aoEscolherParagrafo?.(item.grupo, indice)}
                    className={`flex w-full items-start gap-2 border-b px-2 py-1.5 text-left last:border-b-0 ${
                      escolhida ? "border-sky-200 bg-sky-50" : "border-borda/50 bg-white hover:bg-sky-50/50"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        escolhida ? "border-acento bg-acento text-white" : "border-borda"
                      }`}
                    >
                      {escolhida && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap">{opcao}</span>
                    <span className="shrink-0 font-sans text-[11px] text-suave tabular-nums">{opcao.length}</span>
                  </button>
                );
              })}
            </Quadro>
          );
        }
        if (item.tipo === "grupo") {
          const { divergencia } = item;
          return (
            <Quadro key={"grupo-" + divergencia.id} titulo={divergencia.campo} rotulo={`Opções de ${divergencia.campo}`}>
              {(opcoesRestantes[divergencia.id] ?? []).map((opcaoIndice) => opcaoDoParametro(divergencia, opcaoIndice))}
            </Quadro>
          );
        }
        const { indice, linha, tecnica } = item;
        return (
          <div key={"linha-" + ordem} data-spec-index={tecnica ? indice : undefined} className={"flex items-start border-b border-borda/50 " + (destino === indice ? "bg-sky-100" : "")}>
            <span className="w-8 shrink-0 border-r border-borda/50 px-2 py-1.5 text-right text-suave">{indice + 1}</span>
            {tecnica && (
              <button
                type="button"
                onPointerDown={(evento) => {
                  if (evento.button !== 0) return;
                  evento.preventDefault();
                  evento.currentTarget.setPointerCapture(evento.pointerId);
                  arraste.current = { origem: indice, destino: indice };
                  setDestino(indice);
                }}
                onPointerMove={atualizarDestino}
                onPointerUp={terminarArraste}
                onPointerCancel={() => { arraste.current = null; setDestino(null); }}
                aria-label={"Arrastar linha " + (indice + 1)}
                title="Arraste para reordenar"
                className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-1 text-suave hover:bg-sky-100 active:cursor-grabbing"
              ><GripVertical size={14} /></button>
            )}
            <span className="min-w-0 flex-1 whitespace-pre-wrap px-2 py-1.5">{linha || " "}</span>
            {tecnica && (
              <>
                <button type="button" onClick={() => aoMoverPasso(indice, -1)} aria-label={"Subir linha " + (indice + 1)} title="Subir linha" className="shrink-0 p-1.5 text-suave hover:text-acento"><ChevronUp size={13} /></button>
                <button type="button" onClick={() => aoMoverPasso(indice, 1)} aria-label={"Descer linha " + (indice + 1)} title="Descer linha" className="shrink-0 p-1.5 text-suave hover:text-acento"><ChevronDown size={13} /></button>
                <button type="button" onClick={() => aoExcluirLinha(indice)} aria-label={"Excluir linha " + (indice + 1) + ": " + linha} title="Excluir esta especificação" className="shrink-0 p-1.5 text-suave hover:text-red-700"><Trash2 size={13} /></button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** O quadro PRETO de um conjunto de opcoes (pedido do dono em 10/10/2026), com um titulo curto e espaco em volta. */
function Quadro({ titulo, rotulo, radio = false, children }) {
  return (
    <div
      role={radio ? "radiogroup" : "group"}
      aria-label={rotulo}
      className="mx-2 my-3 overflow-hidden rounded border-2 border-slate-900"
    >
      <p className="border-b border-slate-900 bg-white px-2 py-1 font-sans text-[11px] font-semibold text-slate-900">{titulo}</p>
      {children}
    </div>
  );
}

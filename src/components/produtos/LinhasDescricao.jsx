"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, GripVertical, Pencil, Trash2, X } from "lucide-react";
import { codigoDosItensInclusos, formatarLinhaTecnica, limitesEspecificacoes } from "@/lib/ia/revisaoDescricao";

const CORES = [
  { base: "border-amber-400 bg-amber-50", marcada: "border-amber-600 bg-amber-200" },
  { base: "border-emerald-400 bg-emerald-50", marcada: "border-emerald-600 bg-emerald-200" },
  { base: "border-violet-400 bg-violet-50", marcada: "border-violet-600 bg-violet-200" },
  { base: "border-sky-400 bg-sky-50", marcada: "border-sky-600 bg-sky-200" },
  { base: "border-rose-400 bg-rose-50", marcada: "border-rose-600 bg-rose-200" },
  { base: "border-teal-400 bg-teal-50", marcada: "border-teal-600 bg-teal-200" },
];

/// O item que acabou de ser movido: a tela o segue e o deixa em destaque (pedido do dono em 10/10/2026).
const DESTAQUE = "bg-sky-100 ring-2 ring-inset ring-sky-500";

/**
 * A descricao para revisar, em UM texto corrido (pedido do dono em 10/10/2026): as linhas comuns, e no lugar de cada
 * escolha um QUADRO preto com as opcoes dentro (os dois primeiros paragrafos e cada parametro divergente), com as
 * cores internas de antes. A opcao escolhida usa a mesma marca dos paragrafos (o circulo azul com o visto), e o
 * "IA recomenda" e a loja de origem ficam no fim da linha.
 *
 * Mover: as linhas comuns e os quadros de parametro tem as setas para cima e para baixo. A posicao de um quadro e
 * quantas linhas comuns vem antes dele (`posicao`); quadros na mesma posicao seguem a `ordemDosQuadros`.
 */
export default function LinhasDescricao({
  texto, divergencias, opcoesRestantes, selecoes, confirmadas,
  aoSelecionar, aoEditarOpcao, aoExcluirOpcao, aoExcluirLinha, aoMover, aoMoverPasso, rolagem,
  paragrafos = [], escolhidosParagrafos = [], aoEscolherParagrafo,
  fontesDasLinhas = {}, linhasEditadas = new Set(), ordemDosQuadros = [], aoEditarLinha, aoMoverGrupo,
  // O codigo dos Itens inclusos: o do produto vem sugerido, e o lapis da linha o deixa editavel.
  codigoSugerido = "", aoEditarCodigo,
}) {
  const [destino, setDestino] = useState(null);
  // Opcao em edicao: { chave, valor }. Uma por vez; salvar grava o texto na opcao, cancelar descarta.
  const [edicao, setEdicao] = useState(null);
  // Linha comum em edicao: { indice, valor }.
  const [edicaoLinha, setEdicaoLinha] = useState(null);
  // Codigo da linha "Itens inclusos" em edicao: { indice, valor }.
  const [edicaoCodigo, setEdicaoCodigo] = useState(null);
  // O item movido por ultimo: { tipo: "linha", indice } ou { tipo: "grupo", id }.
  const [destaque, setDestaque] = useState(null);

  // A tela segue o item movido (a rolagem do painel o mantem a vista; instantanea, a suave nao rolava a cada clique
  // no navegador de teste), e o destaque some ao clicar em outro lugar.
  useEffect(() => {
    if (!destaque) return;
    rolagem?.current?.querySelector('[data-destaque="true"]')?.scrollIntoView({ block: "nearest" });
  }, [destaque, texto, divergencias, rolagem]);
  useEffect(() => {
    if (!destaque) return undefined;
    const aoClicar = (evento) => {
      if (!evento.target?.closest?.("[data-mover]")) setDestaque(null);
    };
    document.addEventListener("pointerdown", aoClicar);
    return () => document.removeEventListener("pointerdown", aoClicar);
  }, [destaque]);

  function salvarEdicao(divergencia, opcaoIndice) {
    const linha = edicao?.valor.trim();
    if (!linha) return;
    aoEditarOpcao(divergencia, opcaoIndice, linha);
    setEdicao(null);
  }
  function salvarEdicaoDaLinha() {
    const valor = edicaoLinha?.valor.trim();
    if (!valor) return;
    aoEditarLinha?.(edicaoLinha.indice, valor);
    setEdicaoLinha(null);
  }
  function salvarEdicaoDoCodigo() {
    if (!edicaoCodigo) return;
    aoEditarCodigo?.(edicaoCodigo.indice, edicaoCodigo.valor.trim());
    setEdicaoCodigo(null);
  }
  const arraste = useRef(null);
  const linhas = texto.split("\n");
  const { inicio, fim } = limitesEspecificacoes(texto);
  const ordemDe = (item, indice) => {
    const lugar = ordemDosQuadros.indexOf(item.id);
    return lugar >= 0 ? lugar : ordemDosQuadros.length + indice;
  };
  const grupos = divergencias
    .map((item, indice) => ({ ...item, cor: CORES[indice % CORES.length], ordem: ordemDe(item, indice) }))
    // Sem opcoes sobrando (o dono excluiu todas) o quadro some, e o parametro fica de fora da descricao.
    .filter((item) => !confirmadas.has(item.id) && (opcoesRestantes[item.id] ?? []).length > 0)
    .sort((a, b) => ((a.posicao ?? Infinity) - (b.posicao ?? Infinity)) || a.ordem - b.ordem);
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

  /**
   * Sobe ou desce uma linha comum. Se o vizinho na tela e um QUADRO, a linha passa por cima dele (o quadro ganha ou
   * perde uma linha comum antes dele); se e outra linha, as duas trocam.
   */
  function moverLinhaPorPasso(indice, direcao) {
    const posicaoNaTela = visiveis.findIndex((item) => item.tipo === "linha" && item.indice === indice);
    const vizinho = visiveis[posicaoNaTela + direcao];
    if (vizinho?.tipo === "grupo") {
      const { divergencia } = vizinho;
      aoMoverGrupo?.(divergencia.id, {
        posicao: (divergencia.posicao ?? 0) + (direcao > 0 ? -1 : 1),
        lugar: direcao > 0 ? "fim" : "inicio",
      });
      setDestaque({ tipo: "linha", indice });
      return;
    }
    let alvo = indice + direcao;
    while (alvo >= inicio && alvo < fim && !linhas[alvo].trim()) alvo += direcao;
    aoMoverPasso(indice, direcao);
    if (alvo >= inicio && alvo < fim) setDestaque({ tipo: "linha", indice: alvo });
  }

  /** Sobe ou desce um quadro de parametro: troca com o quadro vizinho ou passa por cima de uma linha comum. */
  function moverQuadro(divergencia, direcao) {
    const posicaoNaTela = visiveis.findIndex((item) => item.tipo === "grupo" && item.divergencia.id === divergencia.id);
    for (let passo = posicaoNaTela + direcao; passo >= 0 && passo < visiveis.length; passo += direcao) {
      const vizinho = visiveis[passo];
      if (vizinho.tipo === "grupo") {
        aoMoverGrupo?.(divergencia.id, { posicao: divergencia.posicao, trocarCom: vizinho.divergencia.id });
        break;
      }
      if (vizinho.tipo === "linha" && vizinho.tecnica) {
        // A linha que ja virou a escolha de um parametro nao conta como comum: passa direto.
        if (escolhidas.has(vizinho.linha)) continue;
        aoMoverGrupo?.(divergencia.id, {
          posicao: (divergencia.posicao ?? 0) + (direcao < 0 ? -1 : 1),
          lugar: direcao < 0 ? "fim" : "inicio",
        });
        break;
      }
      break;
    }
    setDestaque({ tipo: "grupo", id: divergencia.id });
  }

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
    if (origem !== alvo) {
      aoMover(origem, alvo);
      setDestaque({ tipo: "linha", indice: alvo });
    }
  }

  /** Uma opcao de parametro, com as cores de sempre (a cor do grupo; mais forte na marcada). */
  function opcaoDoParametro(divergencia, opcaoIndice) {
    const opcao = divergencia.opcoes[opcaoIndice];
    const marcada = selecoes[divergencia.id] === opcaoIndice;
    const cor = marcada ? divergencia.cor.marcada : divergencia.cor.base;
    const chave = divergencia.id + "-" + opcaoIndice;
    // A loja de cada opcao (as que publicam esse valor), escrita no fim da linha.
    const lojas = [...new Set(opcao.fontes.map((fonte) => fonte.nome))].join(", ");
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
        <button
          type="button"
          role="radio"
          aria-checked={marcada}
          onClick={() => aoSelecionar(divergencia.id, opcaoIndice)}
          title={opcao.fontes.map((fonte) => fonte.nome + ": " + fonte.produto).join(" · ")}
          className="flex min-w-0 flex-1 items-start gap-2 px-2 py-1.5 text-left"
        >
          <Circulo marcada={marcada} />
          <span className="min-w-0 flex-1 whitespace-pre-wrap">{formatarLinhaTecnica(opcao.linha)}</span>
          {(lojas || divergencia.recomendada === opcaoIndice) && (
            <span className="flex shrink-0 items-center gap-2 font-sans">
              {lojas && <span className="max-w-[12rem] truncate text-[11px] text-suave">{lojas}</span>}
              {divergencia.recomendada === opcaoIndice && (
                <span title={divergencia.motivo || undefined} className="rounded bg-emerald-600 px-1.5 py-0.5 font-semibold text-white">IA recomenda</span>
              )}
            </span>
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
                    <Circulo marcada={escolhida} />
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
            <Quadro
              key={"grupo-" + divergencia.id}
              titulo={divergencia.campo}
              rotulo={`Opções de ${divergencia.campo}`}
              radio
              destacado={destaque?.tipo === "grupo" && destaque.id === divergencia.id}
              aoSubir={() => moverQuadro(divergencia, -1)}
              aoDescer={() => moverQuadro(divergencia, 1)}
            >
              {(opcoesRestantes[divergencia.id] ?? []).map((opcaoIndice) => opcaoDoParametro(divergencia, opcaoIndice))}
            </Quadro>
          );
        }
        const { indice, linha, tecnica } = item;
        const marcaDaLinha = linha.trim() ? formatarLinhaTecnica(linha.trim()) : "";
        const loja = tecnica
          ? linhasEditadas.has(marcaDaLinha)
            ? "editada"
            : (fontesDasLinhas[marcaDaLinha] ?? []).join(", ")
          : "";
        const destacada = destaque?.tipo === "linha" && destaque.indice === indice;
        // A linha "Itens inclusos: (Cod:...)": o codigo tem o proprio lapis.
        const codigoDaLinha = tecnica ? null : codigoDosItensInclusos(linha);
        if (codigoDaLinha !== null && edicaoCodigo?.indice === indice) {
          return (
            <div key={"linha-" + ordem} className="flex items-center gap-1 border-b border-borda/50 bg-sky-50 p-0.5">
              <span className="w-8 shrink-0 px-2 py-1.5 text-right text-suave">{indice + 1}</span>
              <span className="shrink-0 px-1 font-sans text-[11px] text-suave">Itens inclusos, código:</span>
              <input
                autoFocus
                value={edicaoCodigo.valor}
                onChange={(evento) => setEdicaoCodigo({ indice, valor: evento.target.value })}
                onKeyDown={(evento) => {
                  if (evento.key === "Enter") {
                    evento.preventDefault();
                    salvarEdicaoDoCodigo();
                  } else if (evento.key === "Escape") {
                    // Escape fecha so a edicao, e nao a janela inteira.
                    evento.stopPropagation();
                    setEdicaoCodigo(null);
                  }
                }}
                aria-label="Código dos itens inclusos"
                className="min-w-0 flex-1 rounded border border-borda bg-white px-1.5 py-1 font-mono text-xs"
              />
              <button type="button" onClick={salvarEdicaoDoCodigo} aria-label="Salvar o código" title="Salvar" className="shrink-0 p-1.5 text-emerald-700 hover:text-emerald-900"><Check size={14} /></button>
              <button type="button" onClick={() => setEdicaoCodigo(null)} aria-label="Cancelar edição" title="Cancelar" className="shrink-0 p-1.5 text-suave hover:text-red-700"><X size={14} /></button>
            </div>
          );
        }
        if (tecnica && edicaoLinha?.indice === indice) {
          return (
            <div key={"linha-" + ordem} className="flex items-start gap-1 border-b border-borda/50 bg-sky-50 p-0.5">
              <span className="w-8 shrink-0 px-2 py-1.5 text-right text-suave">{indice + 1}</span>
              <input
                autoFocus
                value={edicaoLinha.valor}
                onChange={(evento) => setEdicaoLinha({ indice, valor: evento.target.value })}
                onKeyDown={(evento) => {
                  if (evento.key === "Enter") {
                    evento.preventDefault();
                    salvarEdicaoDaLinha();
                  } else if (evento.key === "Escape") {
                    // Escape fecha so a edicao, e nao a janela inteira.
                    evento.stopPropagation();
                    setEdicaoLinha(null);
                  }
                }}
                aria-label={"Editar linha " + (indice + 1)}
                className="min-w-0 flex-1 rounded border border-borda bg-white px-1.5 py-1 font-mono text-xs"
              />
              <button type="button" onClick={salvarEdicaoDaLinha} disabled={!edicaoLinha.valor.trim()} aria-label="Salvar edição desta linha" title="Salvar" className="shrink-0 p-1.5 text-emerald-700 hover:text-emerald-900 disabled:opacity-30"><Check size={14} /></button>
              <button type="button" onClick={() => setEdicaoLinha(null)} aria-label="Cancelar edição" title="Cancelar" className="shrink-0 p-1.5 text-suave hover:text-red-700"><X size={14} /></button>
            </div>
          );
        }
        return (
          <div
            key={"linha-" + ordem}
            data-spec-index={tecnica ? indice : undefined}
            data-destaque={destacada ? "true" : undefined}
            className={"flex items-start border-b border-borda/50 " + (destacada ? DESTAQUE : destino === indice ? "bg-sky-100" : "")}
          >
            <span className="w-8 shrink-0 border-r border-borda/50 px-2 py-1.5 text-right text-suave">{indice + 1}</span>
            {tecnica && (
              <button
                type="button"
                data-mover
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
            {loja && (
              <span className={"max-w-[12rem] shrink-0 truncate px-1 py-1.5 font-sans text-[11px] text-suave " + (loja === "editada" ? "italic" : "")}>{loja}</span>
            )}
            {codigoDaLinha !== null && (
              <>
                {!codigoDaLinha && codigoSugerido && (
                  <span className="max-w-[12rem] shrink-0 truncate px-1 py-1.5 font-sans text-[11px] text-suave">sugerido: {codigoSugerido}</span>
                )}
                <button
                  type="button"
                  onClick={() => setEdicaoCodigo({ indice, valor: codigoDaLinha || codigoSugerido })}
                  aria-label="Editar o código dos itens inclusos"
                  title="Editar o código (vem do código do produto)"
                  className="shrink-0 p-1.5 text-suave hover:text-acento"
                ><Pencil size={13} /></button>
              </>
            )}
            {tecnica && (
              <>
                <button type="button" onClick={() => setEdicaoLinha({ indice, valor: formatarLinhaTecnica(linha.trim()) })} aria-label={"Editar linha " + (indice + 1)} title="Editar esta linha" className="shrink-0 p-1.5 text-suave hover:text-acento"><Pencil size={13} /></button>
                <button type="button" data-mover onClick={() => moverLinhaPorPasso(indice, -1)} aria-label={"Subir linha " + (indice + 1)} title="Subir linha" className="shrink-0 p-1.5 text-suave hover:text-acento"><ChevronUp size={13} /></button>
                <button type="button" data-mover onClick={() => moverLinhaPorPasso(indice, 1)} aria-label={"Descer linha " + (indice + 1)} title="Descer linha" className="shrink-0 p-1.5 text-suave hover:text-acento"><ChevronDown size={13} /></button>
                <button type="button" onClick={() => aoExcluirLinha(indice)} aria-label={"Excluir linha " + (indice + 1) + ": " + linha} title="Excluir esta especificação" className="shrink-0 p-1.5 text-suave hover:text-red-700"><Trash2 size={13} /></button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** O circulo de escolha, o mesmo dos paragrafos: vazio, e azul com o visto na opcao escolhida. */
function Circulo({ marcada }) {
  return (
    <span
      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
        marcada ? "border-acento bg-acento text-white" : "border-borda bg-white"
      }`}
    >
      {marcada && <Check size={11} strokeWidth={3} />}
    </span>
  );
}

/**
 * O quadro PRETO de um conjunto de opcoes (pedido do dono em 10/10/2026), com um titulo curto e espaco em volta.
 * Os quadros de parametro tem as setas de subir e descer no cabecalho; `destacado` e o que acabou de ser movido.
 */
function Quadro({ titulo, rotulo, radio = false, destacado = false, aoSubir, aoDescer, children }) {
  return (
    <div
      role={radio ? "radiogroup" : "group"}
      aria-label={rotulo}
      data-destaque={destacado ? "true" : undefined}
      className={"mx-2 my-3 overflow-hidden rounded border-2 border-slate-900 " + (destacado ? "ring-4 ring-sky-400" : "")}
    >
      <div className="flex items-center border-b border-slate-900 bg-white pl-2 font-sans">
        <p className="min-w-0 flex-1 truncate py-1 text-[11px] font-semibold text-slate-900">{titulo}</p>
        {aoSubir && (
          <button type="button" data-mover onClick={aoSubir} aria-label={"Subir o quadro " + titulo} title="Subir este quadro" className="shrink-0 p-1.5 text-suave hover:text-acento"><ChevronUp size={13} /></button>
        )}
        {aoDescer && (
          <button type="button" data-mover onClick={aoDescer} aria-label={"Descer o quadro " + titulo} title="Descer este quadro" className="shrink-0 p-1.5 text-suave hover:text-acento"><ChevronDown size={13} /></button>
        )}
      </div>
      {children}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";

import { salvarOrdemDosCartoesAcao } from "@/app/acoes-cartoes";
import { aplicarOrdem, ehOrdemPadrao, moverPara } from "@/lib/ordemDosCartoes/regras";

const SEGURAR_MS = 400;
const TOLERANCIA_PX = 8;

/**
 * Grade de cartoes que trocam de lugar (pedido do dono em 07/11/2026: "como se fosse arrastar um icone de um app de
 * celular, se manter clicado tem a possibilidade de arrastar o cartao para mudar a ordem"). Segurar 0,4 s sem mexer
 * (mouse ou dedo) pega o cartao: ele cresce com a borda azul, e passar por cima de outro troca os dois de lugar. Ao
 * soltar, a ordem e gravada para a pessoa (`salvarOrdemDosCartoesAcao`). Mexer antes dos 0,4 s e clique ou rolagem
 * normal; o clique que vem depois de um arrastar NAO abre o cartao.
 *
 * Por que eventos de ponteiro e nao o arrastar nativo do HTML: o nativo nao existe no celular e arrastaria o link
 * (`<a>`) em vez de reordenar. No toque, a rolagem da pagina e travada so enquanto um cartao esta pego (`touchmove` nao
 * passivo). "Ordem padrão" aparece embaixo quando a ordem foi mudada.
 *
 * `itens`: [{ id, conteudo }] na ordem padrao; `ordemSalva`: os ids gravados (ou null).
 */
export default function GradeArrastavel({ pagina, itens, ordemSalva = null, className = "" }) {
  const idsPadrao = useMemo(() => itens.map((item) => item.id), [itens]);
  const porId = useMemo(() => new Map(itens.map((item) => [item.id, item.conteudo])), [itens]);
  // A escolha da pessoa (ids) e a ordem mostrada sai dela e dos cartoes de agora: cartao novo entra no fim, o que sumiu
  // (permissao, catalogo) e ignorado.
  const [escolha, setEscolha] = useState(ordemSalva);
  const ordem = useMemo(() => aplicarOrdem(idsPadrao, escolha), [idsPadrao, escolha]);
  const [pego, setPego] = useState(null);
  const [erro, setErro] = useState(null);
  const [, iniciar] = useTransition();
  const grade = useRef(null);
  const gesto = useRef(null);
  const ordemAtual = useRef(null);
  const bloquearClique = useRef(false);

  useEffect(() => {
    const elemento = grade.current;
    if (!elemento) return undefined;
    const travarRolagem = (evento) => {
      if (gesto.current?.ativo) evento.preventDefault();
    };
    elemento.addEventListener("touchmove", travarRolagem, { passive: false });
    return () => elemento.removeEventListener("touchmove", travarRolagem);
  }, []);

  function gravar(nova) {
    setErro(null);
    iniciar(async () => {
      const resposta = await salvarOrdemDosCartoesAcao(pagina, ehOrdemPadrao(nova, idsPadrao) ? [] : nova);
      if (!resposta?.ok) setErro(resposta?.erro ?? "Não foi possível guardar a ordem.");
    });
  }

  function cancelar() {
    clearTimeout(gesto.current?.relogio);
    gesto.current = null;
  }

  function aoPressionar(evento, id) {
    if (evento.button !== 0 || itens.length < 2) return;
    const elemento = evento.currentTarget;
    const ponteiro = evento.pointerId;
    cancelar();
    ordemAtual.current = ordem;
    gesto.current = { id, x: evento.clientX, y: evento.clientY, ativo: false, antes: ordem };
    gesto.current.relogio = setTimeout(() => {
      if (!gesto.current) return;
      gesto.current.ativo = true;
      try {
        elemento.setPointerCapture(ponteiro);
      } catch {
        // Sem captura o arrastar ainda funciona enquanto o ponteiro estiver sobre a grade.
      }
      setPego(id);
      navigator.vibrate?.(15);
    }, SEGURAR_MS);
  }

  function aoMover(evento) {
    const atual = gesto.current;
    if (!atual) return;
    if (!atual.ativo) {
      if (Math.hypot(evento.clientX - atual.x, evento.clientY - atual.y) > TOLERANCIA_PX) cancelar();
      return;
    }
    evento.preventDefault();
    const sob = document.elementFromPoint(evento.clientX, evento.clientY)?.closest("[data-cartao-id]");
    if (!sob || !grade.current?.contains(sob)) return;
    const alvo = sob.getAttribute("data-cartao-id");
    if (alvo === atual.id) return;
    const nova = moverPara(ordemAtual.current, atual.id, alvo);
    if (nova !== ordemAtual.current) {
      ordemAtual.current = nova;
      setEscolha(nova);
    }
  }

  function aoSoltar() {
    const atual = gesto.current;
    cancelar();
    if (!atual?.ativo) return;
    // O clique que o navegador manda logo depois de soltar nao pode abrir o cartao arrastado.
    bloquearClique.current = true;
    setTimeout(() => {
      bloquearClique.current = false;
    }, 80);
    setPego(null);
    if (!ehOrdemPadrao(ordemAtual.current, atual.antes)) gravar(ordemAtual.current);
  }

  function voltarAoPadrao() {
    setEscolha(null);
    gravar(idsPadrao);
  }

  const mudada = !ehOrdemPadrao(ordem, idsPadrao);

  return (
    <>
      <div
        ref={grade}
        className={`${className} ${pego ? "cursor-grabbing select-none" : ""}`}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onClickCapture={(evento) => {
          if (bloquearClique.current) {
            evento.preventDefault();
            evento.stopPropagation();
          }
        }}
        onContextMenu={(evento) => {
          // O toque longo do celular abre o menu do link; com um cartao sendo segurado, nao.
          if (gesto.current) evento.preventDefault();
        }}
        onDragStart={(evento) => evento.preventDefault()}
      >
        {ordem.map((id) => (
          <div
            key={id}
            data-cartao-id={id}
            onPointerDown={(evento) => aoPressionar(evento, id)}
            className={`relative rounded-xl transition-[transform,box-shadow,opacity] duration-150 [&>*]:h-full ${
              pego === id ? "z-10 scale-[1.03] shadow-lg ring-2 ring-acento" : pego ? "opacity-80" : ""
            }`}
          >
            {porId.get(id)}
          </div>
        ))}
      </div>
      {(mudada || erro) && (
        <div className="mt-2 flex items-center justify-end gap-3 text-xs">
          {erro && <span className="text-rose-600">{erro}</span>}
          {mudada && (
            <button type="button" onClick={voltarAoPadrao} title="Volta os cartões desta página à ordem do Rise" className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-suave hover:bg-fundo hover:text-texto">
              <RotateCcw size={12} /> Ordem padrão
            </button>
          )}
        </div>
      )}
    </>
  );
}

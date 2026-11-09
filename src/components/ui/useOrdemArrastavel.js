"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { salvarOrdemDosCartoesAcao } from "@/app/acoes-cartoes";
import { aplicarOrdem, ehOrdemPadrao, moverPara } from "@/lib/ordemDosCartoes/regras";

const SEGURAR_MS = 400;
const TOLERANCIA_PX = 8;

/**
 * O gesto de segurar e arrastar para trocar a ordem de uma lista de itens (pedido do dono em 07/11/2026 para os
 * cartoes das paginas de bloco e em 09/11/2026 para o menu lateral: "mesma dinamica dos cartoes"). Segurar 0,4 s sem
 * mexer (mouse ou dedo) pega o item, e passar por cima de outro troca os dois de lugar. Ao soltar, a ordem e gravada
 * para a pessoa (`salvarOrdemDosCartoesAcao`). Mexer antes dos 0,4 s e clique ou rolagem normal; o clique que vem
 * depois de um arrastar NAO abre o item.
 *
 * Por que eventos de ponteiro e nao o arrastar nativo do HTML: o nativo nao existe no celular e arrastaria o link
 * (`<a>`) em vez de reordenar. No toque, a rolagem e travada so enquanto um item esta pego (`touchmove` nao passivo).
 *
 * Quem usa: poe `container` (ref) e `propsDoContainer` no elemento que guarda os itens, e `propsDoItem(id)` em cada
 * item (o atributo `data-cartao-id` e como o gesto acha o item sob o ponteiro). `pego` e o id em movimento (para o
 * destaque), e `desligado` apaga o gesto (o menu, enquanto a pesquisa mostra so uma parte dos itens).
 *
 * @param {{ pagina: string, idsPadrao: string[], ordemSalva?: string[]|null, desligado?: boolean }} opcoes
 */
export default function useOrdemArrastavel({ pagina, idsPadrao, ordemSalva = null, desligado = false }) {
  // A escolha da pessoa (ids) e a ordem mostrada sai dela e dos itens de agora: item novo entra no fim, o que sumiu
  // (permissao, catalogo) e ignorado.
  const [escolha, setEscolha] = useState(ordemSalva);
  const ordem = useMemo(() => aplicarOrdem(idsPadrao, escolha), [idsPadrao, escolha]);
  const [pego, setPego] = useState(null);
  const [erro, setErro] = useState(null);
  const [, iniciar] = useTransition();
  const container = useRef(null);
  const gesto = useRef(null);
  const ordemAtual = useRef(null);
  const bloquearClique = useRef(false);

  useEffect(() => {
    const elemento = container.current;
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
    if (desligado || evento.button !== 0 || idsPadrao.length < 2) return;
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
        // Sem captura o arrastar ainda funciona enquanto o ponteiro estiver sobre o container.
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
    if (!sob || !container.current?.contains(sob)) return;
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
    // O clique que o navegador manda logo depois de soltar nao pode abrir o item arrastado.
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

  const propsDoContainer = {
    onPointerMove: aoMover,
    onPointerUp: aoSoltar,
    onPointerCancel: aoSoltar,
    onClickCapture: (evento) => {
      if (bloquearClique.current) {
        evento.preventDefault();
        evento.stopPropagation();
      }
    },
    onContextMenu: (evento) => {
      // O toque longo do celular abre o menu do link; com um item sendo segurado, nao.
      if (gesto.current) evento.preventDefault();
    },
    onDragStart: (evento) => evento.preventDefault(),
  };

  const propsDoItem = (id) => ({ "data-cartao-id": id, onPointerDown: (evento) => aoPressionar(evento, id) });

  return {
    ordem,
    pego,
    erro,
    mudada: !ehOrdemPadrao(ordem, idsPadrao),
    container,
    propsDoContainer,
    propsDoItem,
    voltarAoPadrao,
  };
}

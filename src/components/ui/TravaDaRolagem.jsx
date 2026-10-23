"use client";

import { useEffect } from "react";

/**
 * JANELA ABERTA = A TELA DE TRAS NAO ROLA, em todo o Rise (pedido do dono em 23/10/2026: "ao rolar o pop up ate o final
 * comeca a rolar a tela principal atras tambem... tornar isso um padrao de projeto").
 *
 * Um observador so, no documento: enquanto existir uma janela modal (`role="dialog"` ou `"alertdialog"`, ou
 * `aria-modal="true"`) dentro de um fundo fixo que cobre a tela (`fixed` + `inset-0`), o `<html>` fica com
 * `overflow: hidden` e a pagina de tras nao se move. Fechou a ultima janela, volta como estava. Nenhuma tela precisa
 * mudar: as janelas do Rise ja tem o `role` (e janela nova deve ter). A outra metade do padrao e o
 * `overscroll-behavior: contain` do globals.css, que impede a rolagem de uma area de "vazar" para a de tras ao chegar
 * no fim. O `scrollbar-gutter: stable` do `<html>` evita que a pagina pule de lado quando a barra some.
 */
const SELETOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';

function haJanelaAberta() {
  for (const janela of document.querySelectorAll(SELETOR)) {
    const fundo = janela.closest(".fixed");
    if (fundo && /\binset-0\b/.test(fundo.className) && fundo.getClientRects().length > 0) return true;
  }
  return false;
}

export default function TravaDaRolagem() {
  useEffect(() => {
    const raiz = document.documentElement;
    let travada = false;
    let agendado = 0;

    const conferir = () => {
      agendado = 0;
      const deveTravar = haJanelaAberta();
      if (deveTravar === travada) return;
      travada = deveTravar;
      raiz.style.overflow = deveTravar ? "hidden" : "";
    };
    // setTimeout, e nao requestAnimationFrame: este para em aba ou painel em segundo plano, e a trava nao acionava.
    const agendar = () => {
      if (!agendado) agendado = setTimeout(conferir, 0);
    };

    const observador = new MutationObserver(agendar);
    observador.observe(document.body, { childList: true, subtree: true });
    conferir();
    return () => {
      observador.disconnect();
      if (agendado) clearTimeout(agendado);
      raiz.style.overflow = "";
    };
  }, []);

  return null;
}

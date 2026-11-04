"use client";

import { useLayoutEffect } from "react";

/**
 * Marca a pagina quando ela esta dentro do pop-up de outra (`JanelaDaPagina`, pedido do dono em 04/11/2026: os links do
 * Rise abrem em pop-up). Com a marca `data-em-janela` no <html>, o `globals.css` esconde o menu lateral e encolhe o
 * espaco em volta, para a pagina caber na janela. Fora de um pop-up nao faz nada.
 */
export default function MarcaDeJanela() {
  useLayoutEffect(() => {
    try {
      if (window.self !== window.top) document.documentElement.dataset.emJanela = "1";
    } catch {
      // Moldura de outro dominio nao deixa ler `window.top`: entao tambem esta numa janela.
      document.documentElement.dataset.emJanela = "1";
    }
  }, []);
  return null;
}

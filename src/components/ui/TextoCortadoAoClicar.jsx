"use client";

import { useEffect, useState } from "react";

/**
 * TEXTO CORTADO MOSTRA O RESTO AO CLIQUE, em todo o Rise (pedido do dono em 23/10/2026: "ao clicar sobre o texto ja
 * deve mostrar o resto do texto, hoje so mostra se eu ficar com mouse encima por alguns segundos").
 *
 * Um ouvinte so, no documento: qualquer texto cortado com reticencias (`truncate`, `line-clamp`) abre, no clique, uma
 * bolha com o texto inteiro, logo abaixo dele. Nenhuma tela precisa mudar. O texto vem do `title` quando ha (e o que
 * as telas ja poem com o texto completo), senao do proprio texto do elemento.
 *
 * Nao interfere em clique de botao, link, campo ou linha de tabela clicavel: dentro deles o clique segue o caminho de
 * sempre (abrir, navegar) e a bolha nao aparece. Fecha com Esc, clique fora, rolagem ou mudanca de tamanho.
 */

const INTERATIVO = "a, button, input, select, textarea, label, summary, [role='button'], [role='link'], [contenteditable='true']";
// Quantos ancestrais subir atras do texto cortado: o clique costuma cair num <span> dentro da caixa que corta.
const NIVEIS = 3;

function cortado(elemento) {
  return elemento.scrollWidth > elemento.clientWidth + 1 || elemento.scrollHeight > elemento.clientHeight + 1;
}

function elementoCortado(alvo) {
  let atual = alvo;
  for (let i = 0; i <= NIVEIS && atual && atual !== document.body; i++) {
    // A CELULA DE TABELA (`td`) conta: e onde mais se corta texto (descricao e Obs dos fornecedores, 23/10/2026; a
    // primeira versao a ignorava e o clique nao fazia nada). Linha, tabela e blocos inteiros nao.
    if (atual instanceof HTMLElement && !["TR", "TABLE", "MAIN", "SECTION"].includes(atual.tagName)) {
      const estilo = getComputedStyle(atual);
      const cortaTexto =
        estilo.textOverflow === "ellipsis" || (estilo.webkitLineClamp && estilo.webkitLineClamp !== "none");
      if (cortaTexto && cortado(atual)) return atual;
    }
    atual = atual.parentElement;
  }
  return null;
}

export default function TextoCortadoAoClicar() {
  const [bolha, setBolha] = useState(null); // { texto, x, y, acima }

  useEffect(() => {
    function aoClicar(evento) {
      const alvo = evento.target;
      if (!(alvo instanceof Element)) return;
      if (alvo.closest("[data-bolha-texto-cortado]")) return;
      // Texto selecionado com arrasto nao e clique de "mostrar".
      if (window.getSelection()?.toString()) return;

      const elemento = alvo.closest(INTERATIVO) ? null : elementoCortado(alvo);
      // Linha de tabela que abre detalhe (o Scraper): o clique e dela.
      if (!elemento || elemento.closest("tr[onclick], tr[aria-selected]")) {
        setBolha(null);
        return;
      }
      const texto = (elemento.getAttribute("title") || elemento.innerText || "").trim();
      if (!texto) return setBolha(null);

      const caixa = elemento.getBoundingClientRect();
      const acima = caixa.bottom + 160 > window.innerHeight && caixa.top > 160;
      setBolha({
        texto,
        x: Math.min(Math.max(8, caixa.left), window.innerWidth - 8 - Math.min(480, window.innerWidth - 16)),
        y: acima ? window.innerHeight - caixa.top + 6 : caixa.bottom + 6,
        acima,
      });
    }
    function fechar() {
      setBolha(null);
    }
    function aoTeclar(evento) {
      if (evento.key === "Escape") setBolha(null);
    }

    document.addEventListener("click", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      document.removeEventListener("click", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, []);

  if (!bolha) return null;

  return (
    <div
      data-bolha-texto-cortado
      role="tooltip"
      style={{ left: bolha.x, ...(bolha.acima ? { bottom: bolha.y } : { top: bolha.y }) }}
      className="fixed z-[70] max-h-60 w-max max-w-[min(30rem,calc(100vw-1rem))] overflow-y-auto rounded-md bg-slate-900 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-white shadow-lg select-text"
    >
      {bolha.texto}
    </div>
  );
}

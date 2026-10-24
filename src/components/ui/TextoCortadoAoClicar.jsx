"use client";

import { useEffect, useState } from "react";

/**
 * TEXTO CORTADO MOSTRA O RESTO AO PASSAR O MOUSE, rapido, em todo o Rise. Historia: em 23/10/2026 o dono pediu que o
 * clique mostrasse o resto ("hoje so mostra se eu ficar com mouse encima por alguns segundos"); em 24/10/2026 pediu de
 * novo, "ao clicar nao quero que abra esse popup, quero que abra rapidamente o texto como e feito ao deixar o mouse
 * encima por um tempo". O nome do arquivo ficou (o layout o importa); o gatilho agora e o mouse, em `ATRASO_MS`.
 *
 * Um ouvinte so, no documento: qualquer texto cortado com reticencias (`truncate`, `line-clamp`) abre uma bolha com o
 * texto inteiro, logo abaixo dele, quando o mouse para em cima. Nenhuma tela precisa mudar. O texto vem do `title`
 * quando ha (e o que as telas ja poem com o texto completo), senao do proprio texto do elemento. Enquanto a bolha esta
 * aberta o `title` fica guardado em `data-titulo-cortado`, para a dica lenta do navegador nao aparecer por cima dela.
 *
 * O clique nao abre mais nada: botao, link e linha de tabela seguem o caminho de sempre. Fecha ao sair do texto, com
 * Esc, rolagem ou mudanca de tamanho.
 */

// O mesmo "rapido" que o dono pediu: o navegador espera ~1 s para mostrar o title; aqui, um instante.
const ATRASO_MS = 150;
// Campo de digitacao corta o proprio valor, e a bolha atrapalharia quem digita.
const CAMPO = "input, select, textarea, [contenteditable='true']";
// Quantos ancestrais subir atras do texto cortado: o mouse costuma cair num <span> dentro da caixa que corta.
const NIVEIS = 3;

function cortado(elemento) {
  return elemento.scrollWidth > elemento.clientWidth + 1 || elemento.scrollHeight > elemento.clientHeight + 1;
}

function elementoCortado(alvo) {
  let atual = alvo;
  for (let i = 0; i <= NIVEIS && atual && atual !== document.body; i++) {
    // A CELULA DE TABELA (`td`) conta: e onde mais se corta texto (descricao e Obs dos fornecedores, 23/10/2026).
    // Linha, tabela e blocos inteiros nao.
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

function guardarTitulo(elemento) {
  if (!elemento.hasAttribute("title")) return;
  elemento.dataset.tituloCortado = elemento.getAttribute("title");
  elemento.removeAttribute("title");
}

function devolverTitulo(elemento) {
  if (elemento.dataset.tituloCortado === undefined) return;
  elemento.setAttribute("title", elemento.dataset.tituloCortado);
  delete elemento.dataset.tituloCortado;
}

export default function TextoCortadoAoClicar() {
  const [bolha, setBolha] = useState(null); // { texto, x, y, acima }

  useEffect(() => {
    let espera = null;
    let pendente = null; // o elemento que vai abrir depois do atraso
    let aberto = null; // o elemento cuja bolha esta na tela

    function fechar() {
      clearTimeout(espera);
      espera = null;
      pendente = null;
      if (aberto) devolverTitulo(aberto);
      aberto = null;
      setBolha(null);
    }

    function abrir(elemento) {
      espera = null;
      pendente = null;
      if (!elemento.isConnected) return;
      const texto = (elemento.getAttribute("title") || elemento.dataset.tituloCortado || elemento.innerText || "").trim();
      if (!texto) return;
      guardarTitulo(elemento);
      aberto = elemento;
      const caixa = elemento.getBoundingClientRect();
      const acima = caixa.bottom + 160 > window.innerHeight && caixa.top > 160;
      setBolha({
        texto,
        x: Math.min(Math.max(8, caixa.left), window.innerWidth - 8 - Math.min(480, window.innerWidth - 16)),
        y: acima ? window.innerHeight - caixa.top + 6 : caixa.bottom + 6,
        acima,
      });
    }

    function aoPassar(evento) {
      const alvo = evento.target;
      if (!(alvo instanceof Element)) return;
      const elemento = alvo.closest(CAMPO) ? null : elementoCortado(alvo);
      // Ainda no mesmo texto (o mouse andou entre os filhos dele): nada muda.
      if (elemento && (elemento === aberto || elemento === pendente)) return;
      fechar();
      if (!elemento) return;
      pendente = elemento;
      espera = setTimeout(() => abrir(elemento), ATRASO_MS);
    }

    function aoSairDaJanela(evento) {
      if (!evento.relatedTarget) fechar();
    }

    function aoTeclar(evento) {
      if (evento.key === "Escape") fechar();
    }

    document.addEventListener("mouseover", aoPassar);
    document.addEventListener("mouseout", aoSairDaJanela);
    document.addEventListener("keydown", aoTeclar);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      fechar();
      document.removeEventListener("mouseover", aoPassar);
      document.removeEventListener("mouseout", aoSairDaJanela);
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
      className="pointer-events-none fixed z-[70] max-h-60 w-max max-w-[min(30rem,calc(100vw-1rem))] overflow-hidden rounded-md bg-slate-900 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-white shadow-lg"
    >
      {bolha.texto}
    </div>
  );
}

"use client";

/**
 * Bolinha "i" de ajuda, no padrao do Bling (pedido do dono em 18/09/2026): ao
 * passar o mouse, mostra um texto curto explicando o que aquilo faz — em vez
 * de um paragrafo de ajuda sempre visivel embaixo do campo, so CSS
 * (`group-hover` num grupo NOMEADO), sem estado.
 *
 * Duas variantes:
 * - `"canto"` (padrao): badge no canto SUPERIOR direito de um botao-icone
 *   (lupa, Buscar por codigo, ✦ titulo/descricao). Desprendida do botao —
 *   fica quase toda para FORA do canto, nao colada na borda. Quando o icone
 *   tambem tem um numero (`Contador`), o numero mora no canto INFERIOR
 *   direito, NO MESMO `right` desta bolha (pedido do dono em 18/09/2026: os
 *   dois alinhados na mesma borda, um em cima do outro).
 * - `"inline"`: ao lado do ROTULO de um campo comum (Nome, SKU, Origem...),
 *   substituindo o paragrafo de ajuda que ficava sempre visivel embaixo do
 *   campo — pedido do dono em 18/09/2026, para "deixar a tela mais limpa".
 *
 * O texto SEMPRE abre para CIMA (pedido do dono em 18/09/2026, depois de ver
 * a bolha abrindo para baixo na primeira versao): direcao fixa e
 * previsivel, sem depender de quanto espaco sobra abaixo.
 *
 * O texto zera caixa, espacamento e peso herdados (`normal-case`,
 * `tracking-normal`, `font-normal`): dentro de um <th> de tabela (uppercase,
 * tracking largo) a explicacao inteira saia em MAIUSCULAS.
 *
 * Grupo NOMEADO (`group/ajuda`) e nao `group` liso: varios botoes desta tela
 * ja estao dentro de outros `group` (imagem, linha de tabela), e um grupo sem
 * nome acionaria a bolha errada — ou a bolha de outro botao — no hover de
 * quem estiver em volta.
 *
 * `onClick` para a propagacao: quando a bolha mora DENTRO de um botao maior
 * (caso da lupa de referencias), clicar bem em cima do "i" nao pode disparar
 * a acao do botao por baixo.
 */
export default function BolhaDeAjuda({ texto, variante = "canto", className = "" }) {
  // "inline-direita": igual a "inline", mas o texto abre alinhado pela DIREITA do icone (para a
  // esquerda). E a variante para icone que mora na borda direita de uma janela ou coluna: o texto
  // centralizado no icone sairia do quadro e seria cortado (pedido do dono em 21/09/2026: toda
  // mensagem informativa vira este icone, inclusive nas janelas de fotos).
  const inline = variante === "inline" || variante === "inline-direita";
  const direita = variante === "inline-direita";

  return (
    <span
      className={`group/ajuda ${inline ? "relative inline-flex" : "absolute -top-3 -right-1 z-10"} ${className}`}
      onClick={(evento) => evento.stopPropagation()}
    >
      <span
        role="img"
        aria-label="Ajuda"
        tabIndex={0}
        className="block h-4 w-4 cursor-help rounded-full text-acento shadow-md ring-2 ring-superficie"
      >
        {/* O "i" e desenhado (SVG), e nao escrito como texto: e o de serifa e cauda
            curva do icone de informacao de referencia, e nao depende da fonte da
            pagina. O circulo usa a cor de destaque da loja (`currentColor` = `text-acento`). */}
        <svg viewBox="0 0 550 550" aria-hidden="true" className="block h-full w-full">
          <circle cx="275" cy="275" r="275" fill="currentColor" />
          <g fill="#fff">
            <circle cx="307" cy="140" r="42" />
            <path d="M200 240C214 232 236 220 268 214C292 210 316 212 322 222C325 232 320 270 316 300C312 335 302 370 300 392C300 398 305 402 316 402C328 402 340 400 345 404C348 410 340 416 330 420C305 430 278 440 255 441C236 442 222 430 220 412C219 392 230 350 238 320C246 292 254 272 254 264C244 260 224 254 214 250C206 247 201 244 200 240Z" />
          </g>
        </svg>
      </span>
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full z-50 mb-1.5 w-max max-w-56 rounded-md bg-slate-800 px-2.5 py-1.5 text-left text-[11px] leading-snug font-normal tracking-normal text-white normal-case opacity-0 shadow-lg transition group-hover/ajuda:opacity-100 group-focus-within/ajuda:opacity-100 ${
          inline && !direita ? "left-1/2 -translate-x-1/2" : "right-0"
        }`}
      >
        {texto}
        <span
          className={`absolute top-full h-2 w-2 -translate-y-1 rotate-45 bg-slate-800 ${
            inline && !direita ? "left-1/2 -translate-x-1/2" : "right-1"
          }`}
        />
      </span>
    </span>
  );
}

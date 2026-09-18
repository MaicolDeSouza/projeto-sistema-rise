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
  const inline = variante === "inline";

  return (
    <span
      className={`group/ajuda ${inline ? "relative inline-flex" : "absolute -top-3 -right-1 z-10"} ${className}`}
      onClick={(evento) => evento.stopPropagation()}
    >
      <span
        role="img"
        aria-label="Ajuda"
        tabIndex={0}
        className="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-acento text-[10px] leading-none font-bold text-white shadow-md ring-2 ring-superficie"
      >
        i
      </span>
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full z-50 mb-1.5 w-max max-w-56 rounded-md bg-slate-800 px-2.5 py-1.5 text-left text-[11px] leading-snug text-white opacity-0 shadow-lg transition group-hover/ajuda:opacity-100 group-focus-within/ajuda:opacity-100 ${
          inline ? "left-1/2 -translate-x-1/2" : "right-0"
        }`}
      >
        {texto}
        <span
          className={`absolute top-full h-2 w-2 -translate-y-1 rotate-45 bg-slate-800 ${
            inline ? "left-1/2 -translate-x-1/2" : "right-1"
          }`}
        />
      </span>
    </span>
  );
}

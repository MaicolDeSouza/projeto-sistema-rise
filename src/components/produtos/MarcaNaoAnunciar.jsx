/**
 * O X vermelho sobre o icone de um canal na lista de Produtos: o produto foi marcado para nao ser anunciado ali (pedido do
 * dono em 27/10/2026). Desenhado por cima do logo, sem ocupar espaco; o texto vai no `title` do icone.
 */
export default function MarcaNaoAnunciar() {
  return (
    <svg aria-hidden="true" viewBox="0 0 22 22" className="pointer-events-none absolute inset-0 h-full w-full text-red-600">
      <path d="M4 4 L18 18 M18 4 L4 18" stroke="white" strokeWidth="5" strokeLinecap="round" />
      <path d="M4 4 L18 18 M18 4 L4 18" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

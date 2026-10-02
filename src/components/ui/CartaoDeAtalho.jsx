import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/**
 * Cartao de atalho para uma tela: icone, titulo, descricao e uma linha de
 * detalhe. O cartao INTEIRO e o link. E o desenho da pagina Ferramentas, tirado
 * da grade "Personalizar" do Claude que o dono mostrou em 20/09/2026, como
 * teste: se ficar bom, vira o padrao das paginas de bloco do sistema (a barra
 * lateral so com icone e texto, e a lista de telas dentro do proprio bloco).
 *
 * `emBreve` e para a tela que o dono ja decidiu fazer e ainda nao existe (Canais de
 * Venda: Loja Integrada e Shopee): a mesma caixa, mas um <div> sem link, esmaecido, com
 * o selo "em breve" no lugar da seta. `href` e ignorado, e nada nele responde ao mouse.
 */
export default function CartaoDeAtalho({ href, icone: Icone, titulo, descricao, detalhe, emBreve = false }) {
  const conteudo = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-borda text-suave transition group-hover:border-acento group-hover:text-acento">
        <Icone size={20} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block font-medium">{titulo}</span>
        {descricao && <span className="mt-1 line-clamp-3 block text-sm text-suave">{descricao}</span>}
        {detalhe && <span className="mt-2 block text-xs text-suave">{detalhe}</span>}
      </span>
    </>
  );

  // Sem `group` e sem `hover:`: o <div> nao ganha o destaque do link, e o `group-hover` do
  // icone, sem grupo em volta, nunca dispara.
  if (emBreve) {
    return (
      <div
        aria-disabled="true"
        className="flex items-start gap-4 rounded-xl border border-borda bg-superficie p-5 opacity-60"
      >
        {conteudo}

        <span className="shrink-0 self-center rounded-full border border-borda px-2.5 py-1 text-xs font-medium text-suave">
          em breve
        </span>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-xl border border-borda bg-superficie p-5 transition hover:border-acento hover:shadow-sm"
    >
      {conteudo}

      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-borda text-suave transition group-hover:border-acento group-hover:bg-acento group-hover:text-white"
      >
        <ArrowUpRight size={16} />
      </span>
    </Link>
  );
}

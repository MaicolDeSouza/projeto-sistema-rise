import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/**
 * Cartao de atalho para uma tela: icone, titulo, descricao e uma linha de
 * detalhe. O cartao INTEIRO e o link. E o desenho da pagina Ferramentas, tirado
 * da grade "Personalizar" do Claude que o dono mostrou em 20/09/2026, como
 * teste: se ficar bom, vira o padrao das paginas de bloco do sistema (a barra
 * lateral so com icone e texto, e a lista de telas dentro do proprio bloco).
 */
export default function CartaoDeAtalho({ href, icone: Icone, titulo, descricao, detalhe }) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-xl border border-borda bg-superficie p-5 transition hover:border-acento hover:shadow-sm"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-borda text-suave transition group-hover:border-acento group-hover:text-acento">
        <Icone size={20} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block font-medium">{titulo}</span>
        {descricao && <span className="mt-1 line-clamp-3 block text-sm text-suave">{descricao}</span>}
        {detalhe && <span className="mt-2 block text-xs text-suave">{detalhe}</span>}
      </span>

      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-borda text-suave transition group-hover:border-acento group-hover:bg-acento group-hover:text-white"
      >
        <ArrowUpRight size={16} />
      </span>
    </Link>
  );
}

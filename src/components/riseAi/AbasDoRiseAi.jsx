"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * As abas do Rise AI, no desenho da `BarraDeAbas` de Cadastros, mas cada aba e uma ROTA (Conexoes, Revisao do dia,
 * Consumo, Configuracoes): o chat interno saiu (decisao C1 do dono, 20/10/2026) e a lista de conversas da esquerda com
 * ele. Quem filtra as abas e o layout, pelo `pode()` do servidor; aqui so se marca a ativa.
 */
export default function AbasDoRiseAi({ abas }) {
  const pathname = usePathname();
  const ativa = (href) => (href === "/rise-ai" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <nav aria-label="Rise AI" className="flex shrink-0 overflow-x-auto border-b border-borda">
      {abas.map((aba) => (
        <Link
          key={aba.href}
          href={aba.href}
          aria-current={ativa(aba.href) ? "page" : undefined}
          className={`shrink-0 border-b-2 px-4 py-3 text-sm whitespace-nowrap focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none focus-visible:ring-inset ${
            ativa(aba.href) ? "border-acento font-medium text-texto" : "border-transparent text-suave hover:text-texto"
          }`}
        >
          {aba.rotulo}
        </Link>
      ))}
    </nav>
  );
}

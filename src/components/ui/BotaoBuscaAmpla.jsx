"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TextSearch } from "lucide-react";

/**
 * "Busca ampla" (pedido do dono em 09/10/2026), ao lado do campo de busca do Scraper e de Produtos: ligado, a
 * busca procura tambem na descricao, na ficha tecnica e no SEO (ver lib/buscaAmpla.js), e cada linha achada so
 * no texto diz onde ("achado na descrição").
 *
 * Mora na URL (`?ampla=1`), como o termo da busca, para sobreviver a recarga e ir junto num link. Trocar volta a
 * primeira pagina: a posicao valia para a lista anterior.
 */
export default function BotaoBuscaAmpla({ ligada, ajuda }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function alternar() {
    const params = new URLSearchParams(searchParams);
    if (ligada) params.delete("ampla");
    else params.set("ampla", "1");
    params.delete("pagina");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={ligada}
      title={ajuda}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded border px-3 py-2 text-sm font-medium ${
        ligada
          ? "border-acento bg-acento text-white hover:opacity-90"
          : "border-borda bg-superficie text-suave hover:border-acento hover:text-texto"
      }`}
    >
      <TextSearch size={15} />
      Busca ampla{ligada ? ": ligada" : ""}
    </button>
  );
}

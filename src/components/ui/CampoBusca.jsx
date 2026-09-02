"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * Campo de busca com termo na URL.
 *
 * Nasceu na tela de Produtos e subiu para ca quando Mercados precisou do mesmo
 * comportamento: era generico exceto pelo texto do rotulo, e duas copias ja
 * nascem podendo divergir no tempo de espera ou no nome do parametro.
 *
 * O termo vive na URL, e nao em estado local, para sobreviver a recarga e poder
 * ser compartilhado como link.
 */
export default function CampoBusca({
  valorInicial = "",
  rotulo = "Buscar",
  parametro = "q",
  className = "mb-4 max-w-sm",
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [termo, setTermo] = useState(valorInicial);

  // Espera a digitacao parar antes de consultar: sem isso, cada tecla dispara
  // uma navegacao e uma consulta ao banco.
  useEffect(() => {
    if (termo === valorInicial) return;

    const relogio = setTimeout(() => {
      // Preserva os outros parametros da URL — em Mercados convivem filtro de
      // fonte e termo de busca, e reescrever a query inteira perderia um deles.
      const params = new URLSearchParams(searchParams);
      if (termo) params.set(parametro, termo);
      else params.delete(parametro);

      // Busca nova comeca na primeira pagina: a posicao valia para a lista
      // anterior, e ficar na pagina 12 de um resultado com duas paginas nao
      // significa nada. Inofensivo em tela sem paginacao — nao ha o parametro.
      params.delete("pagina");

      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    }, 300);

    return () => clearTimeout(relogio);
  }, [termo, valorInicial, parametro, pathname, router, searchParams]);

  return (
    <div className={`relative ${className}`}>
      <Search
        size={15}
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-suave"
      />
      <input
        type="search"
        value={termo}
        onChange={(evento) => setTermo(evento.target.value)}
        placeholder={rotulo}
        aria-label={rotulo}
        className="w-full rounded border border-borda bg-superficie py-2 pr-8 pl-8 text-sm focus:border-acento focus:outline-none"
      />
      {termo && (
        <button
          type="button"
          onClick={() => setTermo("")}
          aria-label="Limpar busca"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-suave hover:text-texto"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

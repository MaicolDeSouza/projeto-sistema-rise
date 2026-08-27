"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * Busca por nome ou codigo. O termo vive na URL para sobreviver a recarga e
 * poder ser compartilhado como link.
 */
export default function BuscaProdutos({ valorInicial = "" }) {
  const router = useRouter();
  const pathname = usePathname();
  const [termo, setTermo] = useState(valorInicial);

  // Espera a digitacao parar antes de consultar: sem isso, cada tecla dispara
  // uma navegacao e uma consulta ao banco.
  useEffect(() => {
    if (termo === valorInicial) return;

    const relogio = setTimeout(() => {
      router.push(termo ? `${pathname}?q=${encodeURIComponent(termo)}` : pathname);
    }, 300);

    return () => clearTimeout(relogio);
  }, [termo, valorInicial, pathname, router]);

  return (
    <div className="mb-4 relative max-w-sm">
      <Search
        size={15}
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-suave"
      />
      <input
        type="search"
        value={termo}
        onChange={(evento) => setTermo(evento.target.value)}
        placeholder="Buscar por nome ou codigo"
        aria-label="Buscar por nome ou codigo"
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

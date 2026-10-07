"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { canais } from "@/lib/anuncios/canais";

const SITUACOES = [
  { valor: "", rotulo: "Todas as situações" },
  { valor: "ATIVA", rotulo: "Ativos" },
  { valor: "PAUSADA", rotulo: "Pausados" },
  { valor: "ENCERRADA", rotulo: "Encerrados" },
  { valor: "RASCUNHO", rotulo: "Rascunhos" },
  { valor: "ERRO", rotulo: "Com erro" },
  { valor: "PENDENTE", rotulo: "Com alterações não publicadas" },
];

export default function FiltrosAnuncios({ canal, situacao }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // O filtro vive na URL para que o estado sobreviva a recarga e possa ser
  // compartilhado como link.
  function aplicar(chave, valor) {
    const params = new URLSearchParams(searchParams);
    if (valor) params.set(chave, valor);
    else params.delete(chave);

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const classe =
    "rounded border border-borda bg-superficie px-2 py-1.5 text-sm focus:border-acento focus:outline-none";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <select
        value={canal}
        onChange={(evento) => aplicar("canal", evento.target.value)}
        aria-label="Filtrar por canal"
        className={classe}
      >
        <option value="">Todos os canais</option>
        {canais.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nome}
          </option>
        ))}
      </select>

      <select
        value={situacao}
        onChange={(evento) => aplicar("situacao", evento.target.value)}
        aria-label="Filtrar por situação"
        className={classe}
      >
        {SITUACOES.map((item) => (
          <option key={item.valor} value={item.valor}>
            {item.rotulo}
          </option>
        ))}
      </select>

      {(canal || situacao) && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="text-sm text-suave underline hover:text-texto"
        >
          Limpar
        </button>
      )}
    </div>
  );
}

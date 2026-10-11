"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, Plus, Search } from "lucide-react";

import { buscarConversasAcao } from "@/app/rise-ai/acoes";

const FUSO = "America/Sao_Paulo";
const dia = (data) => new Date(data).toLocaleDateString("sv-SE", { timeZone: FUSO });

/** "Hoje", "Ontem" ou "Antes": o dia de cada conversa no fuso da loja (servidor e navegador chegam ao mesmo texto). */
function agrupar(conversas) {
  const hoje = dia(Date.now());
  const ontem = dia(Date.now() - 24 * 60 * 60 * 1000);
  const grupos = [
    { rotulo: "Hoje", itens: [] },
    { rotulo: "Ontem", itens: [] },
    { rotulo: "Antes", itens: [] },
  ];
  for (const conversa of conversas) {
    const quando = dia(conversa.atualizadoEm);
    grupos[quando === hoje ? 0 : quando === ontem ? 1 : 2].itens.push(conversa);
  }
  return grupos.filter((grupo) => grupo.itens.length > 0);
}

/**
 * A lista lateral de conversas (as de quem está logado), com "+ Nova conversa" e a busca no título e no texto das
 * mensagens. "Nova conversa" só abre o chat em branco: a conversa nasce na primeira pergunta.
 *
 * Para administrador, o link da Revisão do dia fica logo abaixo (a página confere de novo no servidor).
 *
 * @param {{ conversas: { id: string, titulo: string, atualizadoEm: string }[], administrador?: boolean }} props
 */
export default function ListaDeConversas({ conversas, administrador = false }) {
  const pathname = usePathname();
  const [busca, setBusca] = useState("");
  const [achadas, setAchadas] = useState([]);
  const buscando = busca.trim().length > 0;

  // Espera a digitação parar (como o CampoBusca do sistema) e pergunta ao servidor: a busca olha o texto das mensagens.
  useEffect(() => {
    if (!buscando) return undefined;
    const relogio = setTimeout(async () => {
      const resultado = await buscarConversasAcao(busca);
      setAchadas(resultado.ok ? resultado.conversas : []);
    }, 300);
    return () => clearTimeout(relogio);
  }, [busca, buscando]);

  const mostradas = buscando ? achadas : conversas;

  return (
    <aside className="flex max-h-56 w-full shrink-0 flex-col gap-3 overflow-hidden rounded-lg border border-borda bg-superficie p-3 lg:max-h-none lg:w-64">
      <Link href="/rise-ai" className="inline-flex items-center justify-center gap-1.5 rounded-md bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90">
        <Plus size={15} /> Nova conversa
      </Link>

      {administrador && (
        <Link
          href="/rise-ai/revisao"
          aria-current={pathname === "/rise-ai/revisao" ? "page" : undefined}
          className={`inline-flex items-center justify-center gap-1.5 rounded-md border border-borda px-3 py-1.5 text-sm hover:bg-fundo ${pathname === "/rise-ai/revisao" ? "bg-fundo font-medium" : "text-suave"}`}
        >
          <ClipboardCheck size={15} /> Revisão do dia
        </Link>
      )}

      <div className="relative">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-suave" />
        <input
          type="search"
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
          placeholder="Pesquisar conversas…"
          aria-label="Pesquisar conversas"
          className="w-full rounded-md border border-borda bg-fundo py-1.5 pr-2 pl-8 text-sm"
        />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="Conversas">
        {mostradas.length === 0 && <p className="px-1 py-2 text-xs text-suave">{buscando ? "Nenhuma conversa encontrada." : "Nenhuma conversa ainda. Faça a primeira pergunta."}</p>}
        {agrupar(mostradas).map((grupo) => (
          <div key={grupo.rotulo} className="mb-3">
            <p className="px-1 pb-1 text-xs font-medium tracking-wide text-suave uppercase">{grupo.rotulo}</p>
            <ul className="flex flex-col gap-0.5">
              {grupo.itens.map((conversa) => {
                const ativa = pathname === `/rise-ai/${conversa.id}`;
                return (
                  <li key={conversa.id}>
                    <Link
                      href={`/rise-ai/${conversa.id}`}
                      title={conversa.titulo}
                      aria-current={ativa ? "page" : undefined}
                      className={`block truncate rounded-md px-2 py-1.5 text-sm ${ativa ? "bg-fundo font-medium" : "text-suave hover:bg-fundo hover:text-texto"}`}
                    >
                      {conversa.titulo}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

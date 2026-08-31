"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";

import { blocos, ehRotaAtiva } from "@/lib/blocos";
import { normalizar } from "@/lib/texto";
import {
  definirRecolhida,
  lerRecolhida,
  lerRecolhidaNoServidor,
  subscrever,
} from "@/lib/preferenciaMenu";
import SidebarItem from "./SidebarItem";

export default function Sidebar() {
  const pathname = usePathname();

  const recolhida = useSyncExternalStore(
    subscrever,
    lerRecolhida,
    lerRecolhidaNoServidor,
  );
  const [aberta, setAberta] = useState(false);
  const [busca, setBusca] = useState("");

  function alternarRecolhida() {
    const proxima = !recolhida;
    definirRecolhida(proxima);
    if (proxima) setBusca("");
  }

  const blocosFiltrados = useMemo(() => {
    const termo = normalizar(busca);
    if (!termo) return blocos;
    return blocos.filter((bloco) => normalizar(bloco.rotulo).includes(termo));
  }, [busca]);

  return (
    <>
      {/* Barra superior — so no mobile, onde a sidebar vira gaveta */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-borda bg-superficie px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setAberta(true)}
          aria-label="Abrir menu"
          className="rounded-md p-1.5 text-suave hover:bg-fundo hover:text-texto"
        >
          <Menu size={20} />
        </button>
        <span className="font-semibold">Sistema Rise</span>
      </header>

      {aberta && (
        <div
          onClick={() => setAberta(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          "z-50 flex shrink-0 flex-col bg-menu text-menu-texto transition-[width,transform] duration-200",
          recolhida ? "w-16" : "w-64",
          // Mobile: gaveta sobreposta. Desktop: coluna fixa que acompanha a rolagem.
          "fixed inset-y-0 left-0 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          aberta ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {/* Faixa com o nome da loja, como no menu de referencia */}
        <div className="bg-menu-topo px-3 py-1.5">
          <p className="truncate text-[10px] font-medium tracking-[0.12em] text-menu-texto/70 uppercase">
            {recolhida ? "SR" : "Loja de Eletronicos"}
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-acento font-bold text-white">
            R
          </div>
          {!recolhida && (
            <span className="truncate text-lg font-semibold text-white">
              Rise
            </span>
          )}

          <button
            type="button"
            onClick={() => setAberta(false)}
            aria-label="Fechar menu"
            className="ml-auto rounded-md p-1 text-menu-texto hover:bg-menu-hover hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {!recolhida && (
          <div className="px-3 pb-3">
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-menu-texto/60"
              />
              <input
                type="search"
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                placeholder="Pesquisar no menu"
                aria-label="Pesquisar no menu"
                className="w-full rounded-md border border-white/10 bg-white/5 py-2 pr-3 pl-8 text-sm text-white placeholder:text-menu-texto/50 focus:border-acento focus:outline-none"
              />
            </div>
          </div>
        )}

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          {blocosFiltrados.map((bloco) => (
            <SidebarItem
              key={bloco.href}
              bloco={bloco}
              ativo={ehRotaAtiva(pathname, bloco.href)}
              recolhida={recolhida}
              aoNavegar={() => setAberta(false)}
            />
          ))}

          {blocosFiltrados.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-menu-texto/60">
              Nenhum bloco encontrado.
            </p>
          )}
        </nav>

        <button
          type="button"
          onClick={alternarRecolhida}
          aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
          className="hidden items-center gap-3 border-t border-white/10 px-4 py-3 text-sm text-menu-texto hover:bg-menu-hover hover:text-white lg:flex"
        >
          {recolhida ? (
            <PanelLeftOpen size={18} />
          ) : (
            <>
              <PanelLeftClose size={18} />
              <span>Recolher menu</span>
            </>
          )}
        </button>
      </aside>
    </>
  );
}

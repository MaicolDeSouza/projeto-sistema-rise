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

// Lidos como process.env.NOME literal: o Next troca o texto no build (ver o `env` do next.config.mjs).
const VERSAO = process.env.NEXT_PUBLIC_RISE_VERSAO || "dev";
const COMMIT = process.env.NEXT_PUBLIC_RISE_COMMIT || null;

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

  // Cascatas que o operador abriu ou fechou a mao, por href. Sem escolha dele,
  // a cascata segue a rota: aberta quando se esta dentro do bloco, fechada fora.
  // So vale enquanto a pagina esta aberta — nao ha preferencia gravada.
  const [escolhas, setEscolhas] = useState({});

  function definirCascata(href, valor) {
    setEscolhas((atual) => ({ ...atual, [href]: valor }));
  }

  // Bloco aparece se o proprio nome casa (com todos os filhos) ou se algum filho
  // casar (so com os que casaram): quem procura "marcas" acha Cadastros > Marcas.
  const blocosFiltrados = useMemo(() => {
    const termo = normalizar(busca);
    if (!termo) return blocos;

    return blocos.flatMap((bloco) => {
      if (normalizar(bloco.rotulo).includes(termo)) return [bloco];
      const filhos = (bloco.filhos ?? []).filter((filho) =>
        normalizar(filho.rotulo).includes(termo),
      );
      return filhos.length > 0 ? [{ ...bloco, filhos }] : [];
    });
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
            {recolhida ? "SR" : "Loja de Eletrônicos"}
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

        {/*
          Sem barra de rolagem visivel (pedido do dono em 18/09/2026): a nativa,
          clara, destoava do menu escuro. O menu continua rolando com a roda do
          mouse, o toque e o teclado — so o desenho da barra some. Precisa das
          duas regras: `scrollbar-width` e o pseudo-elemento cobrem navegadores
          diferentes.
        */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {blocosFiltrados.map((bloco) => {
            const ativo = ehRotaAtiva(pathname, bloco.href);

            return (
              <SidebarItem
                key={bloco.href}
                bloco={bloco}
                ativo={ativo}
                recolhida={recolhida}
                pathname={pathname}
                // Pesquisando, a cascata abre sozinha para mostrar o que casou.
                aberto={Boolean(busca) || (escolhas[bloco.href] ?? ativo)}
                aoAlternar={() =>
                  definirCascata(bloco.href, !(escolhas[bloco.href] ?? ativo))
                }
                aoNavegar={(peloBloco) => {
                  setAberta(false);
                  // Ir ao bloco pelo nome reabre a cascata que ele tenha fechado.
                  if (peloBloco && bloco.filhos) definirCascata(bloco.href, true);
                }}
              />
            );
          })}

          {blocosFiltrados.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-menu-texto/60">
              Nenhum bloco encontrado.
            </p>
          )}
        </nav>

        {/*
          Versao que esta no ar (pedido do dono em 07/10/2026): e como ele confere qual build a VPS roda.
          Fora da barra recolhida, onde nao cabe.
        */}
        {!recolhida && (
          <p
            className="px-4 pb-2 text-[10px] text-menu-texto/60"
            title={COMMIT ? `commit ${COMMIT}` : undefined}
          >
            Versão {VERSAO}
          </p>
        )}

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

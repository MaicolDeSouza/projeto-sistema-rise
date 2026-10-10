"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Monitor, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";

import { blocos, ehRotaAtiva } from "@/lib/blocos";
import { normalizar } from "@/lib/texto";
import { inicialDoNome } from "@/lib/sessao";
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

/**
 * O rodape com quem esta usando o Rise (pedido do dono em 10/10/2026, desenho aprovado): na VPS, a inicial, o nome do
 * login e o botao Sair; no PC, que nao tem login, so o aviso. O Sair e um formulario (POST /api/sair), e nao um link:
 * um GET poderia ser disparado por qualquer imagem ou pre-carregamento e deslogar sem querer.
 */
function Usuario({ sessao, recolhida }) {
  if (!sessao) return null;
  const circulo = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-menu-ativo text-sm font-medium text-white";

  if (sessao.ambiente !== "vps") {
    return (
      <div
        className={`flex items-center gap-2 border-t border-white/10 py-2.5 ${recolhida ? "justify-center px-2" : "px-3"}`}
        title="PC de desenvolvimento · sem login"
      >
        <span className={circulo}>
          <Monitor size={15} />
        </span>
        {!recolhida && (
          <span className="min-w-0">
            <span className="block truncate text-sm text-white">PC de desenvolvimento</span>
            <span className="block text-[11px] text-menu-texto/60">sem login</span>
          </span>
        )}
      </div>
    );
  }

  if (!sessao.nome) return null;
  const sair = (
    <form method="post" action="/api/sair">
      <button
        type="submit"
        title="Sair do Rise"
        aria-label="Sair do Rise"
        className={
          recolhida
            ? "rounded-md p-1.5 text-white hover:bg-menu-hover"
            : "inline-flex items-center gap-1 rounded-md border border-white/20 px-2 py-1 text-xs text-white hover:bg-menu-hover"
        }
      >
        <LogOut size={recolhida ? 18 : 13} />
        {!recolhida && "Sair"}
      </button>
    </form>
  );

  if (recolhida) {
    return (
      <div className="flex flex-col items-center gap-1.5 border-t border-white/10 py-2.5">
        <span className={circulo} title={sessao.nome}>
          {inicialDoNome(sessao.nome)}
        </span>
        {sair}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2.5">
      <span className={circulo}>{inicialDoNome(sessao.nome)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-white">{sessao.nome}</span>
        <span className="block text-[11px] text-menu-texto/60">conectado</span>
      </span>
      {sair}
    </div>
  );
}

export default function Sidebar({ sessao = null }) {
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
        <div className="flex items-center gap-2 px-3 py-4">
          {/*
            Logo da 4hobby a esquerda do "R", do MESMO tamanho (pedido do dono em 10/10/2026, que tirou a faixa
            "Loja de Eletronicos"). A engrenagem com o "4" e preta: fica num quadrado branco, como o "R" fica no azul.
            Recolhido, o menu tem 64 px e cabe um icone so: fica o "R".
          */}
          {/* Clicavel: abre a loja em outra aba (pedido do dono em 10/10/2026), sem tirar ninguem do Rise. */}
          {!recolhida && (
            <a
              href="https://www.4hobby.com.br"
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir a loja 4hobby (nova aba)"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white p-0.5 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
            >
              <Image src="/marcas/4hobby.svg" alt="Loja 4hobby" width={28} height={28} loading="eager" />
            </a>
          )}
          {/* O "R" e o nome levam ao Painel (pedido do dono em 10/10/2026), na mesma aba. */}
          <Link
            href="/"
            onClick={() => setAberta(false)}
            title="Ir para o Painel"
            className="flex min-w-0 items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-acento font-bold text-white hover:opacity-90">
              R
            </span>
            {!recolhida && (
              <span className="truncate text-lg font-semibold text-white">
                Rise
              </span>
            )}
          </Link>

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

        <Usuario sessao={sessao} recolhida={recolhida} />

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
            {/* O commit a mostra, e nao so no title: e ele que diz se o PC e a VPS rodam o mesmo codigo. */}
            {COMMIT && <span className="ml-1 text-menu-texto/40">· {COMMIT}</span>}
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

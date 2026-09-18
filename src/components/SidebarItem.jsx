"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { ehRotaAtiva } from "@/lib/blocos";

/**
 * Item do menu lateral. Quando `recolhida`, mostra so o icone e usa o
 * atributo title como tooltip nativo para o rotulo nao se perder.
 *
 * Bloco com `filhos` ganha uma seta para abrir e fechar a cascata (pedido do
 * dono em 18/09/2026). A seta e um botao IRMAO do link, e nao filho dele: botao
 * dentro de <a> e HTML invalido e o clique na seta navegaria junto. Ela fica
 * sobre o canto direito do link (`absolute`), que ganha `pr-10` para o texto nao
 * passar por baixo dela.
 *
 * Na barra recolhida nao ha seta: se a cascata esta aberta, os filhos aparecem
 * so como icones — senao as secoes de dentro (Marcas, por exemplo) ficariam
 * inalcancaveis sem expandir o menu.
 *
 * `aoNavegar(peloBloco)`: verdadeiro quando o clique foi no nome do bloco, falso
 * num subitem. So o primeiro reabre uma cascata fechada a mao; o segundo nao
 * grava escolha nenhuma, senao a cascata ficaria aberta depois de sair do bloco.
 */
export default function SidebarItem({
  bloco,
  ativo,
  recolhida,
  aoNavegar,
  pathname,
  aberto = false,
  aoAlternar,
}) {
  const Icone = bloco.icone;
  const filhos = bloco.filhos ?? [];
  const temFilhos = filhos.length > 0;
  const idFilhos = `filhos-${bloco.rotulo.toLowerCase()}`;

  const link = (
    <Link
      href={bloco.href}
      onClick={() => aoNavegar(true)}
      title={recolhida ? bloco.rotulo : undefined}
      aria-current={ativo ? "page" : undefined}
      className={[
        "relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-acento",
        recolhida ? "justify-center" : "",
        temFilhos && !recolhida ? "pr-10" : "",
        ativo
          ? "bg-menu-ativo font-medium text-white"
          : "text-menu-texto hover:bg-menu-hover hover:text-white",
      ].join(" ")}
    >
      {ativo && (
        <span
          aria-hidden="true"
          className="absolute top-1.5 bottom-1.5 left-0 w-1 rounded-r bg-acento"
        />
      )}

      <Icone size={18} strokeWidth={1.75} className="shrink-0" />

      {!recolhida && (
        <>
          <span className="truncate">{bloco.rotulo}</span>
          {!bloco.pronto && (
            <span className="ml-auto shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] tracking-wide text-menu-texto/70">
              em breve
            </span>
          )}
        </>
      )}
    </Link>
  );

  if (!temFilhos) return link;

  return (
    <div>
      <div className="relative">
        {link}
        {!recolhida && (
          <button
            type="button"
            onClick={aoAlternar}
            aria-expanded={aberto}
            aria-controls={idFilhos}
            aria-label={`${aberto ? "Fechar" : "Abrir"} ${bloco.rotulo}`}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1.5 text-menu-texto hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
          >
            <ChevronDown
              size={16}
              className={`transition-transform ${aberto ? "" : "-rotate-90"}`}
            />
          </button>
        )}
      </div>

      {aberto && (
        <ul
          id={idFilhos}
          className={
            recolhida
              ? "mt-1 space-y-0.5"
              : "mt-1 ml-5 space-y-0.5 border-l border-white/10 pl-2"
          }
        >
          {filhos.map((filho) => {
            const FilhoIcone = filho.icone;
            const filhoAtivo = ehRotaAtiva(pathname, filho.href);

            return (
              <li key={filho.href}>
                <Link
                  href={filho.href}
                  onClick={() => aoNavegar(false)}
                  title={recolhida ? filho.rotulo : undefined}
                  aria-current={filhoAtivo ? "page" : undefined}
                  className={[
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors",
                    "outline-none focus-visible:ring-2 focus-visible:ring-acento",
                    recolhida ? "justify-center" : "",
                    filhoAtivo
                      ? "bg-white/10 font-medium text-white"
                      : "text-menu-texto hover:bg-menu-hover hover:text-white",
                  ].join(" ")}
                >
                  <FilhoIcone size={15} strokeWidth={1.75} className="shrink-0" />
                  {!recolhida && <span className="truncate">{filho.rotulo}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

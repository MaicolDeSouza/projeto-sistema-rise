"use client";

import Link from "next/link";

/**
 * Item do menu lateral. Quando `recolhida`, mostra so o icone e usa o
 * atributo title como tooltip nativo para o rotulo nao se perder.
 */
export default function SidebarItem({ bloco, ativo, recolhida, aoNavegar }) {
  const Icone = bloco.icone;

  return (
    <Link
      href={bloco.href}
      onClick={aoNavegar}
      title={recolhida ? bloco.rotulo : undefined}
      aria-current={ativo ? "page" : undefined}
      className={[
        "relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-acento",
        recolhida ? "justify-center" : "",
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
}

"use client";

import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";

export const CLASSE_CAMPO =
  "mt-1 w-full rounded border px-2.5 py-2 text-[15px] font-medium focus:outline-none";

/** Borda do campo: vermelha com erro, da cor do tema sem. Para <select> e <textarea> que usam `Campo` como envelope. */
export const bordaDoCampo = (erro) =>
  erro ? "border-red-400" : "border-borda focus:border-acento";

/** Campos de numero recusam `e`, `+` e `-`: o <input type="number"> os aceita por causa da notacao cientifica. */
function bloquearSimbolos(evento) {
  if (["e", "E", "+", "-"].includes(evento.key)) evento.preventDefault();
}

/**
 * Rotulo + campo + erro dos formularios de Cadastros. Sem `children`, desenha um
 * <input> com o `nome` como id e name; com `children`, so o envelope (para
 * <select>, <textarea> e campos com botao dentro). A ajuda e a bolha "i", padrao
 * de 18/09/2026.
 */
export default function Campo({ nome, rotulo, erro, ajuda, children, ...props }) {
  return (
    <div>
      <label htmlFor={nome} className="flex items-center gap-1 text-sm font-semibold">
        {rotulo}
        {ajuda && <BolhaDeAjuda texto={ajuda} variante="inline" />}
      </label>
      {children ?? (
        <input
          id={nome}
          name={nome}
          className={`${CLASSE_CAMPO} ${bordaDoCampo(erro)}`}
          onKeyDown={props.type === "number" ? bloquearSimbolos : undefined}
          {...props}
        />
      )}
      {erro && <p className="mt-1 text-[11px] text-red-700">{erro}</p>}
    </div>
  );
}

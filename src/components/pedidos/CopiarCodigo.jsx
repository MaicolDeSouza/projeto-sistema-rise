"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Copia o codigo do produto da linha (pedido do dono em 09/11/2026: clicar no codigo nao abre mais o pedido, e ele quer
 * poder copiar). Aparece ao passar o mouse na linha (ou com o foco no teclado) e vira um "ok" por 1,5 s.
 */
export default function CopiarCodigo({ codigo }) {
  const [copiado, setCopiado] = useState(false);
  const relogio = useRef(null);
  useEffect(() => () => clearTimeout(relogio.current), []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      clearTimeout(relogio.current);
      relogio.current = setTimeout(() => setCopiado(false), 1500);
    } catch {
      // sem permissao da area de transferencia: o texto continua selecionavel na tela
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      title={copiado ? "Código copiado" : "Copiar código"}
      aria-label={copiado ? "Código copiado" : `Copiar o código ${codigo}`}
      className={`ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded align-middle text-suave transition-opacity hover:bg-fundo hover:text-texto focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-acento ${
        copiado ? "text-emerald-700 opacity-100" : "opacity-0 group-hover:opacity-100"
      }`}
    >
      {copiado ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
  );
}

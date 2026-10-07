"use client";

import { useState } from "react";

/**
 * Descricao do produto em TEXTO PURO, num campo so.
 *
 * Havia duas abas, "Escrever" e "Pre-visualizar", porque o campo aceitava
 * Markdown (**negrito**, # titulo) e a previa mostrava o HTML. Em 16/09/2026 a
 * descricao passou a ser texto puro — e exportada para varias plataformas, e o
 * Mercado Livre mostra "**" literalmente —, e a previa passou a mostrar o mesmo
 * texto do campo. O dono pediu um campo so, maior.
 *
 * O campo e alto de proposito: a descricao padrao (titulo, dois paragrafos,
 * especificacoes, itens inclusos, garantia) passa de 40 linhas, e ler em 12
 * obrigava a rolar o tempo todo.
 */
export default function EditorDescricao({ nome, valorInicial = "", aoSair }) {
  const [texto, setTexto] = useState(valorInicial ?? "");

  return (
    <div>
      <div className="mb-1 flex items-center justify-end">
        <span className="text-[11px] text-suave tabular-nums">{texto.length} caracteres</span>
      </div>

      <textarea
        id={nome}
        name={nome}
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        // Ao sair do campo o formulario le "Dimensões (CxLxA)" e "Peso" do texto
        // para os campos vazios — vale para descricao colada de outro lugar.
        onBlur={(evento) => aoSair?.(evento.target.value)}
        placeholder={
          "PORCA MARTELO M3 TIPO T PARA PERFIL 30 CANAL 8\n\n" +
          "Primeiro parágrafo.\nSegundo parágrafo.\n\n" +
          "Especificações técnicas:\n- Rosca: M3;\n- Material: Aço zincado;"
        }
        className="min-h-[40rem] w-full resize-y rounded border border-borda px-3 py-2.5 text-[15px] leading-relaxed focus:border-acento focus:outline-none"
      />
      <p className="mt-1 text-[11px] text-suave">
        Texto puro, sem formatação: o mesmo texto serve para Bling, Loja Integrada e Mercado
        Livre. Arraste o canto inferior para aumentar o campo.
      </p>
    </div>
  );
}

"use client";

/**
 * Lugar do editor do anuncio da Loja Integrada numa pagina. Provisorio: o editor por abas
 * (`EditorAnuncioLI`) entra na tarefa seguinte do plano e passa a ser montado aqui.
 */
export default function EditorNaPagina({ rascunhoInicial }) {
  return (
    <p className="rounded border border-borda bg-fundo px-3 py-2 text-sm text-suave">
      Editor na proxima tarefa. Rascunho de: {rascunhoInicial?.titulo || "produto sem titulo"}.
    </p>
  );
}

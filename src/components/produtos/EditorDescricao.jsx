"use client";

import { useMemo, useState } from "react";
import { Eye, Pencil } from "lucide-react";

import { paraHtml, paraTextoPuro } from "./Markdown";

/**
 * Descricao detalhada em Markdown, com pre-visualizacao.
 *
 * Markdown e nao editor rico porque o **Mercado Livre so aceita texto puro** na
 * descricao, enquanto Bling e Loja Integrada aceitam HTML. Markdown converte
 * limpo para os dois lados, sem biblioteca de editor nem HTML para higienizar.
 *
 * Os dois contadores acompanham a referencia do Bling: caracteres do texto puro
 * (o que o Mercado Livre vai receber) e do texto com marcacao.
 */
export default function EditorDescricao({ nome, valorInicial = "" }) {
  const [texto, setTexto] = useState(valorInicial ?? "");
  const [aba, setAba] = useState("escrever");

  const html = useMemo(() => paraHtml(texto), [texto]);
  const puro = useMemo(() => paraTextoPuro(texto), [texto]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        {[
          { id: "escrever", rotulo: "Escrever", icone: Pencil },
          { id: "previa", rotulo: "Pre-visualizar", icone: Eye },
        ].map(({ id, rotulo, icone: Icone }) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs ${
              aba === id
                ? "bg-fundo font-medium text-texto"
                : "text-suave hover:text-texto"
            }`}
          >
            <Icone size={12} />
            {rotulo}
          </button>
        ))}

        <span className="ml-auto text-[11px] text-suave">
          {puro.length} caracteres · {texto.length} com formatacao
        </span>
      </div>

      {/* O textarea nunca e desmontado: perderia o cursor e o histórico de
          desfazer a cada troca de aba. */}
      <div className={aba === "escrever" ? "" : "hidden"}>
        <textarea
          id={nome}
          name={nome}
          rows={12}
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder={
            "PORCA MARTELO M3 TIPO T PARA PERFIL 30 CANAL 8\n\n" +
            "A porca martelo tipo T e util na fixacao de componentes em perfil de aluminio.\n\n" +
            "**Caracteristicas:**\n- Rosca: M3\n- Material: Aco zincado"
          }
          className="w-full rounded border border-borda px-2 py-1.5 font-mono text-sm focus:border-acento focus:outline-none"
        />
        <p className="mt-1 text-[11px] text-suave">
          Aceita <code>**negrito**</code>, <code>*italico*</code>, listas com{" "}
          <code>-</code> e titulos com <code>#</code>.
        </p>
      </div>

      <div className={aba === "previa" ? "" : "hidden"}>
        <div className="min-h-[18rem] rounded border border-borda bg-superficie px-3 py-2 text-sm">
          {html ? (
            <div
              className="prose-sm [&_a]:text-acento [&_a]:underline [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:my-2 [&_strong]:font-semibold"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-suave">Nada escrito ainda.</p>
          )}
        </div>
        <p className="mt-1 text-[11px] text-suave">
          O Mercado Livre recebe a versao sem formatacao; Bling e Loja Integrada
          recebem o HTML.
        </p>
      </div>
    </div>
  );
}

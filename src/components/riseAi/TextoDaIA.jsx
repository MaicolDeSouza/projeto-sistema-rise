import { Fragment } from "react";

import { blocosDoTexto } from "@/lib/riseAi/textoSeguro";

/**
 * A resposta da IA como texto corrido (spec §5a.1): parágrafos, listas, negrito, itálico, código e links, desenhados a partir
 * dos blocos de `textoSeguro.js`. NUNCA injeta HTML (nem a propriedade de React que o faria): o que o modelo escreve é dado,
 * e HTML, imagem e endereço que não veio de uma ferramenta chegam aqui como texto comum (um teste confere o arquivo).
 *
 * Sem estado e sem efeito: serve ao texto pronto e ao que ainda está chegando (a marcação aberta aparece como está).
 *
 * @param {{ texto: string, linksPermitidos?: string[] }} props
 */
export default function TextoDaIA({ texto, linksPermitidos = [] }) {
  const blocos = blocosDoTexto(texto, { linksPermitidos });
  return (
    <div className="flex max-w-[80ch] flex-col gap-3 text-sm leading-relaxed [text-wrap:pretty]">
      {blocos.map((bloco, indice) => {
        if (bloco.tipo === "lista") {
          const Lista = bloco.ordenada ? "ol" : "ul";
          return (
            <Lista key={indice} className={`flex flex-col gap-1 pl-5 ${bloco.ordenada ? "list-decimal" : "list-disc"}`}>
              {bloco.itens.map((item, posicao) => (
                <li key={posicao}>
                  <Trechos trechos={item} />
                </li>
              ))}
            </Lista>
          );
        }
        return (
          <p key={indice} className={bloco.tipo === "titulo" ? "font-semibold [text-wrap:balance]" : undefined}>
            <Trechos trechos={bloco.trechos} />
          </p>
        );
      })}
    </div>
  );
}

function Trechos({ trechos }) {
  return trechos.map((trecho, indice) => {
    if (trecho.tipo === "quebra") return <br key={indice} />;
    if (trecho.tipo === "negrito") return <strong key={indice}>{trecho.texto}</strong>;
    if (trecho.tipo === "italico") return <em key={indice}>{trecho.texto}</em>;
    if (trecho.tipo === "codigo") {
      return (
        <code key={indice} className="rounded bg-fundo px-1 py-0.5 font-mono text-[0.85em]">
          {trecho.texto}
        </code>
      );
    }
    if (trecho.tipo === "link") {
      // O domínio sempre à vista, a menos que o próprio texto do link já o mostre.
      const mostraODominio = !trecho.texto.includes(trecho.dominio);
      return (
        <Fragment key={indice}>
          <a
            href={trecho.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-acento underline underline-offset-2 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
          >
            {trecho.texto}
          </a>
          {mostraODominio && <span className="text-suave"> ({trecho.dominio})</span>}
        </Fragment>
      );
    }
    return <Fragment key={indice}>{trecho.texto}</Fragment>;
  });
}

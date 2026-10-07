"use client";

import { useState } from "react";

/**
 * Abas de um formulario de Cadastros — o padrao de "Padroes do projeto" no
 * CLAUDE.md. Usado por Cliente e Transportadora.
 *
 * **Todas as abas ficam MONTADAS e so escondidas (`hidden`)** (`Painel`): campo
 * desmontado nao entra no `FormData`, e salvar de uma aba perderia o que foi
 * digitado nas outras. `data-aba` deixa o formulario descobrir a aba de um campo.
 */
export function Painel({ id, aba, children }) {
  return (
    <div role="tabpanel" data-aba={id} className={aba === id ? "" : "hidden"}>
      {children}
    </div>
  );
}

/**
 * A barra de abas, com um ponto vermelho no titulo de quem tem erro. `children`
 * fica no fim da barra (o tipo da pessoa, no Cliente).
 *
 * O foco do teclado e um anel na cor de destaque, por dentro da aba: o contorno
 * preto padrao do navegador ficava pesado em volta do titulo.
 */
export function BarraDeAbas({ abas, aba, aoMudar, comErro, children }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-borda pr-3">
      <div role="tablist" className="flex overflow-x-auto">
        {abas.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={aba === item.id}
            onClick={() => aoMudar(item.id)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-3 text-sm whitespace-nowrap focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none focus-visible:ring-inset ${
              aba === item.id
                ? "border-acento font-medium text-texto"
                : "border-transparent text-suave hover:text-texto"
            }`}
          >
            {item.rotulo}
            {comErro(item.id) && (
              <span aria-label="Há erro nesta aba" className="h-2 w-2 rounded-full bg-red-500" />
            )}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

/**
 * O estado das abas de um formulario. `abaDoCampo(chave)` diz em que aba mora um
 * campo com erro (ou `null`).
 *
 * - `levarAoPrimeiroErro(erros)`: depois de um Salvar recusado, abre a primeira aba
 *   com erro, em vez de deixar o operador numa aba sem nada errado.
 * - `comErro(erros)(id)`: se a aba tem erro (o ponto vermelho).
 * - `aoInvalidar`: para `onInvalidCapture` do <form>. Campo invalido para o
 *   NAVEGADOR (nome vazio, e-mail sem arroba) numa aba escondida: o navegador nao
 *   consegue focar um campo `display: none`, e o Salvar — que fica fora das abas —
 *   parecia nao fazer nada. Abre a aba do primeiro campo invalido e repete a
 *   validacao quando ela aparecer.
 */
export function useAbasDoFormulario({ abas, abaDoCampo }) {
  const [aba, setAba] = useState(abas[0].id);

  const comErro = (erros) => (id) => Object.keys(erros).some((chave) => abaDoCampo(chave) === id);

  function levarAoPrimeiroErro(erros) {
    const chaves = Object.keys(erros);
    const primeira = abas.find((item) => chaves.some((chave) => abaDoCampo(chave) === item.id));
    if (primeira) setAba(primeira.id);
  }

  function aoInvalidar(evento) {
    if (evento.target !== evento.currentTarget.querySelector(":invalid")) return;
    const destino = evento.target.closest("[data-aba]")?.dataset.aba;
    if (destino && destino !== aba) {
      setAba(destino);
      requestAnimationFrame(() => evento.target.reportValidity());
    }
  }

  return { aba, setAba, comErro, levarAoPrimeiroErro, aoInvalidar };
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Store } from "lucide-react";

import { normalizar } from "@/lib/texto";

/**
 * Escolha de fontes por caixa de marcacao, aceitando VARIAS ao mesmo tempo.
 *
 * Comecou como <select>, que so deixava escolher uma: comparar a Fortek com a
 * Nightech — que e o trabalho — exigia carregar a tela duas vezes e guardar o
 * primeiro numero de cabeca. Marcar duas responde na mesma lista.
 *
 * Nenhuma marcada quer dizer TODAS, e nao nenhuma: e o estado de quem ainda nao
 * filtrou, e uma tela em branco ao abrir seria resposta errada para quem nao
 * perguntou nada.
 */
export default function FiltroFontes({ fontes, selecionadas, aoMudar }) {
  const [aberto, setAberto] = useState(false);
  // O que foi digitado na caixa da lista (pedido do dono em 11/10/2026): so esconde linhas da lista, nao mexe no
  // que esta marcado. Zera a cada abertura.
  const [procura, setProcura] = useState("");
  const caixaRef = useRef(null);

  /*
    Fecha ao clicar fora e no Escape.

    Sem isso o painel fica aberto sobre a tabela e o operador tem que acertar de
    novo o mesmo botao para se livrar dele — e o clique que ele deu na linha de
    baixo, tentando fechar, abria o detalhe do produto.
  */
  useEffect(() => {
    if (!aberto) return;

    function aoClicarFora(evento) {
      if (!caixaRef.current?.contains(evento.target)) setAberto(false);
    }
    function aoTeclar(evento) {
      if (evento.key === "Escape") setAberto(false);
    }

    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  function alternar(nome) {
    const proximas = selecionadas.includes(nome)
      ? selecionadas.filter((atual) => atual !== nome)
      : [...selecionadas, nome];

    aoMudar(proximas);
  }

  const ativo = selecionadas.length > 0;

  // Sem acento e sem caixa: "eletro" acha "Eletrogate" e "Casa da Robotica" acha "Casa da Robótica".
  const palavraDaProcura = normalizar(procura).trim();
  const visiveis = palavraDaProcura
    ? fontes.filter(({ nome }) => normalizar(nome).includes(palavraDaProcura))
    : fontes;

  // O rotulo diz O QUE esta filtrado, nao so que ha filtro: com uma fonte cabe
  // o nome, com varias so o numero — "Fortek, Nightech, Smartkits (458)" nao
  // caberia na linha e viraria reticencias.
  const rotulo = !ativo
    ? "Todas as fontes"
    : selecionadas.length === 1
      ? selecionadas[0]
      : `${selecionadas.length} fontes`;

  return (
    <div ref={caixaRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!aberto) setProcura("");
          setAberto((antes) => !antes);
        }}
        aria-expanded={aberto}
        aria-haspopup="true"
        className={`inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
          ativo
            ? "border-acento bg-acento text-white"
            : "border-borda bg-superficie text-suave hover:border-suave hover:text-texto"
        }`}
      >
        <Store size={13} className="shrink-0" />
        <span className="truncate">{rotulo}</span>
        <ChevronDown size={13} className="shrink-0" />
      </button>

      {aberto && (
        <div
          className="absolute top-full left-0 z-30 mt-1.5 max-h-80 w-64 overflow-y-auto rounded-lg border border-borda bg-superficie py-1 shadow-lg"
          role="group"
          aria-label="Fontes"
        >
          {/*
            "Todas" LIMPA a escolha, nao marca tudo. Marcar as sete uma a uma
            daria a mesma lista, mas prenderia o filtro ao conjunto de hoje: a
            fonte cadastrada amanha ficaria de fora sem ninguem perceber.
          */}
          <div className="flex items-center gap-1 pr-2">
            <button
              type="button"
              onClick={() => {
                aoMudar([]);
                setAberto(false);
              }}
              className={`flex shrink-0 items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-fundo ${
                ativo ? "text-suave" : "font-medium text-texto"
              }`}
            >
              <span className="w-4 shrink-0">{!ativo && <Check size={13} />}</span>
              Todas as fontes
            </button>

            {/* Caixa pequena para achar a fonte digitando (pedido do dono em 11/10/2026). */}
            <input
              type="search"
              value={procura}
              onChange={(evento) => setProcura(evento.target.value)}
              placeholder="Buscar..."
              aria-label="Buscar fonte pelo nome"
              autoFocus
              autoComplete="off"
              className="min-w-0 flex-1 rounded border border-borda bg-fundo px-2 py-1 text-xs text-texto placeholder:text-suave focus:border-acento focus:outline-none"
            />
          </div>

          <div className="my-1 h-px bg-borda" />

          {visiveis.length === 0 && (
            <p className="px-3 py-2 text-xs text-suave">Nenhuma fonte com esse nome.</p>
          )}

          {visiveis.map(({ nome, quantidade }) => {
            const marcada = selecionadas.includes(nome);

            return (
              <label
                key={nome}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-fundo"
              >
                <input
                  type="checkbox"
                  checked={marcada}
                  onChange={() => alternar(nome)}
                  className="h-3.5 w-3.5 shrink-0 accent-[var(--color-acento,#2563eb)]"
                />
                <span className="min-w-0 flex-1 truncate">{nome}</span>
                <span className="shrink-0 text-suave tabular-nums">{quantidade}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

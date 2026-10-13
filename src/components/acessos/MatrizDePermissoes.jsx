"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { aplicarTodosDaLista, filtrarRecursos } from "@/lib/acessos/matriz";
import { gruposDaMatriz } from "@/lib/acessos/recursos";
import SeletorDeNivel from "./SeletorDeNivel";

const GRUPOS = gruposDaMatriz();

/**
 * A matriz de permissoes de uma funcao (spec de Acessos, §5.4): o unico elemento ousado do bloco. Um grupo por vez
 * (o trilho a esquerda, com "liberados/total" e um ponto quando o grupo tem alteracao nao salva), uma linha por
 * recurso com o `SeletorDeNivel`, a busca que atravessa os grupos e "Todos desta lista". Sub-tela de uma tela em
 * `nenhum` fica esmaecida: o nivel dela nao vale enquanto a tela estiver fechada. No celular o trilho vira uma lista.
 *
 * Controlada: `permissoes` e `original` sao objetos `{ recurso: nivel }`; `aoMudar` recebe o objeto novo.
 */
export default function MatrizDePermissoes({ permissoes, original, aoMudar, desabilitada = false }) {
  const [grupoAtivo, setGrupoAtivo] = useState(GRUPOS[0].grupo);
  const [busca, setBusca] = useState("");
  const buscando = busca.trim().length > 0;
  const grupo = GRUPOS.find((candidato) => candidato.grupo === grupoAtivo) ?? GRUPOS[0];
  const linhas = buscando ? filtrarRecursos(GRUPOS, busca) : grupo.recursos;

  const nivel = (id) => permissoes[id] ?? "nenhum";
  const alterado = (alvo) => alvo.recursos.some((recurso) => (original[recurso.id] ?? "nenhum") !== nivel(recurso.id));
  const liberados = (alvo) => alvo.recursos.filter((recurso) => nivel(recurso.id) !== "nenhum").length;

  function abrirGrupo(id) {
    setGrupoAtivo(id);
    setBusca("");
  }

  function mudar(id, valor) {
    const proximas = { ...permissoes };
    if (valor === "nenhum") delete proximas[id];
    else proximas[id] = valor;
    aoMudar(proximas);
  }

  function aplicarATodos(evento) {
    const valor = evento.target.value;
    evento.target.value = "";
    if (valor) aoMudar(aplicarTodosDaLista(permissoes, linhas, valor));
  }

  return (
    <div className="overflow-hidden rounded-lg border border-borda bg-superficie md:flex">
      <nav aria-label="Grupos de permissões" className="hidden w-[200px] shrink-0 border-r border-borda py-1.5 md:block">
        {GRUPOS.map((alvo) => {
          const ativo = !buscando && alvo.grupo === grupo.grupo;
          return (
            <button
              key={alvo.grupo}
              type="button"
              onClick={() => abrirGrupo(alvo.grupo)}
              aria-current={ativo ? "true" : undefined}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-[background-color,color] duration-150 focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none focus-visible:ring-inset ${ativo ? "bg-fundo font-medium text-texto" : "text-suave hover:bg-fundo hover:text-texto"}`}
            >
              <span className="truncate">{alvo.rotulo}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-suave tabular-nums">
                {alterado(alvo) && <span className="h-1.5 w-1.5 rounded-full bg-acento" title="Alterado e não salvo" />}
                {liberados(alvo)}/{alvo.recursos.length}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-borda bg-superficie px-4 py-2.5">
          <select
            value={grupo.grupo}
            onChange={(evento) => abrirGrupo(evento.target.value)}
            aria-label="Grupo"
            className="w-full rounded-md border border-borda bg-superficie px-2 py-1.5 text-sm md:hidden"
          >
            {GRUPOS.map((alvo) => (
              <option key={alvo.grupo} value={alvo.grupo}>
                {alvo.rotulo} ({liberados(alvo)}/{alvo.recursos.length})
              </option>
            ))}
          </select>
          <div className="relative min-w-48 flex-1">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-suave" aria-hidden="true" />
            <input
              type="search"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Filtrar em todos os grupos…"
              aria-label="Filtrar permissões"
              className="w-full rounded-md border border-borda bg-fundo py-1.5 pr-2 pl-8 text-sm focus-visible:border-acento focus-visible:outline-none"
            />
          </div>
          <select
            defaultValue=""
            onChange={aplicarATodos}
            disabled={desabilitada || linhas.length === 0}
            aria-label="Pôr o mesmo nível em todos desta lista"
            className="rounded-md border border-borda bg-superficie px-2 py-1.5 text-sm disabled:opacity-60"
          >
            <option value="">Todos desta lista…</option>
            <option value="nenhum">nenhum</option>
            <option value="ver">ver</option>
            <option value="editar">editar</option>
            <option value="excluir">excluir</option>
            <option value="executar">executar</option>
          </select>
          <BolhaDeAjuda
            variante="inline-direita"
            texto="Cada nível inclui os anteriores: excluir inclui editar, que inclui ver. No teclado, as setas mudam o nível e 0 a 3 escolhem a coluna."
          />
        </div>

        <ul>
          {linhas.map((recurso) => {
            const paiFechado = Boolean(recurso.pai) && nivel(recurso.pai) === "nenhum";
            return (
              <li
                key={recurso.id}
                className={`flex flex-wrap items-center justify-between gap-3 border-b border-borda/60 px-4 py-1 last:border-b-0 ${paiFechado ? "opacity-50" : ""}`}
              >
                <span className={`min-w-0 truncate text-sm ${recurso.pai ? "pl-4 text-texto" : "font-medium"}`} title={recurso.dica ?? recurso.rotulo}>
                  {buscando && <span className="text-suave">{recurso.grupoRotulo} › </span>}
                  {recurso.rotulo}
                </span>
                <SeletorDeNivel recurso={recurso} valor={nivel(recurso.id)} aoMudar={(valor) => mudar(recurso.id, valor)} desabilitado={desabilitada} />
              </li>
            );
          })}
          {linhas.length === 0 && <li className="px-4 py-6 text-sm text-suave">Nada encontrado.</li>}
        </ul>
      </div>
    </div>
  );
}

"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Navegacao entre paginas da lista de Mercados.
 *
 * A pagina vive na URL, como a busca e os filtros: sobrevive a recarga, volta
 * com o botao do navegador e pode ser mandada como link. Quem corta a lista e o
 * servidor — aqui so se mexe no endereco.
 *
 * O SELETOR EXISTE PARA O SALTO LONGO. Com 2.469 produtos sao 25 paginas, e
 * chegar na 20 por "Proxima" custa dezenove cliques. "Primeira" e "Ultima" sao
 * o mesmo raciocinio levado ao extremo — a ultima pagina e onde estao os
 * produtos mais antigos, e ninguem vai folhear ate la.
 */
export default function Paginacao({
  pagina,
  totalPaginas,
  primeiro,
  ultimo,
  total,
  /*
    Versao curta, sem a faixa "1 - 100 de 2469".
    Medido: os filtros ocupam 772px e a barra completa 455px, e nao cabem juntos
    em 1165px — a navegacao quebrava para a linha de baixo justamente onde o
    dono pediu que ela ficasse. No topo a faixa e dispensavel porque o total ja
    esta ao lado da busca; no rodape ela aparece inteira, com a linha so para
    ela.
  */
  compacto = false,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Uma pagina so nao tem para onde navegar: a barra inteira seria enfeite.
  if (totalPaginas <= 1) return null;

  function irPara(destino) {
    const alvo = Math.min(Math.max(1, destino), totalPaginas);
    const params = new URLSearchParams(searchParams);

    // A PAGINA 1 NAO ENTRA NA URL. E o padrao, e "?pagina=1" na barra de
    // endereco e sujeira que o operador acabaria mandando por link.
    if (alvo === 1) params.delete("pagina");
    else params.set("pagina", String(alvo));

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: true });
  }

  const naPrimeira = pagina <= 1;
  const naUltima = pagina >= totalPaginas;

  /*
    SETAS NO LUGAR DAS PALAVRAS, como o dono desenhou. Uma seta dupla e "vai
    para a ponta" em qualquer interface — a palavra ocupava tres vezes a largura
    para dizer o mesmo, e era o que empurrava a barra para fora da linha dos
    filtros.

    O nome continua existindo no `title` e no `aria-label`: quem passa o mouse
    ou usa leitor de tela nao fica adivinhando o que a seta faz.
  */
  const botao =
    "rounded p-1 transition disabled:cursor-not-allowed disabled:text-borda enabled:text-acento enabled:hover:bg-fundo";

  return (
    <nav
      className={`flex flex-wrap items-center justify-center ${compacto ? "gap-2.5" : "gap-3 py-3"}`}
      aria-label="Navegação entre páginas"
    >
      <button
        type="button"
        onClick={() => irPara(1)}
        disabled={naPrimeira}
        className={botao}
        title="Primeira página"
        aria-label="Primeira página"
      >
        <ChevronsLeft size={18} />
      </button>
      <button
        type="button"
        onClick={() => irPara(pagina - 1)}
        disabled={naPrimeira}
        className={botao}
        title="Página anterior"
        aria-label="Página anterior"
      >
        <ChevronLeft size={18} />
      </button>

      {/*
        O <select> carrega TODAS as paginas. Com 25 opcoes isso e uma lista
        curta; se um dia forem quinhentas, vira campo de digitar numero — mas
        inventar essa complicacao agora seria resolver problema que nao existe.
      */}
      <label className="sr-only" htmlFor="pagina-atual">
        Página
      </label>
      <select
        id="pagina-atual"
        value={pagina}
        onChange={(evento) => irPara(Number(evento.target.value))}
        className="rounded border border-borda bg-superficie px-2 py-1 text-sm tabular-nums"
      >
        {Array.from({ length: totalPaginas }, (_, indice) => (
          <option key={indice + 1} value={indice + 1}>
            {indice + 1}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => irPara(pagina + 1)}
        disabled={naUltima}
        className={botao}
        title="Próxima página"
        aria-label="Próxima página"
      >
        <ChevronRight size={18} />
      </button>
      <button
        type="button"
        onClick={() => irPara(totalPaginas)}
        disabled={naUltima}
        className={botao}
        title="Última página"
        aria-label="Última página"
      >
        <ChevronsRight size={18} />
      </button>

      {/*
        "1 - 100 de 1834" responde onde se esta DENTRO do total, que o numero da
        pagina sozinho nao responde: pagina 7 nao diz se faltam duas ou duzentas.
      */}
      {!compacto && (
        <span className="ml-2 text-sm text-suave tabular-nums">
          {primeiro} - {ultimo} de {total}
        </span>
      )}
    </nav>
  );
}

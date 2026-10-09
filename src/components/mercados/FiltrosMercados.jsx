"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Eraser } from "lucide-react";

import FiltroFontes from "@/components/mercados/FiltroFontes";

/**
 * Marcadores de filtro da tela de Mercados.
 *
 * O filtro vive na URL, como o termo de busca — sobrevive a recarga, volta com
 * o botao do navegador e pode ser mandado como link para alguem olhar a mesma
 * lista. Estado local nao faria nada disso.
 *
 * Quem filtra e ordena de verdade e a pagina, no servidor: aqui so se mexe no
 * endereco. Com cento e vinte produtos daria para filtrar no navegador, mas
 * ordenar num lugar e paginar noutro e como as duas listas comecam a divergir.
 */

function Marcador({ ativo, aoClicar, children, titulo }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      title={titulo}
      aria-pressed={ativo}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        ativo
          ? "border-acento bg-acento text-white"
          : "border-borda bg-superficie text-suave hover:border-suave hover:text-texto"
      }`}
    >
      {children}
    </button>
  );
}

export default function FiltrosMercados({ tipo = "", ordem = "", fonte = [], fontes = [] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * Troca um parametro preservando os outros.
   *
   * Clicar no marcador ja ativo o DESLIGA: e o mesmo gesto para ligar e
   * desligar, e sem isso "Menor valor" so sairia pelo botao de limpar tudo,
   * levando junto a busca que o operador tinha digitado.
   */
  function trocar(chave, valor) {
    const params = new URLSearchParams(searchParams);

    if (!valor || params.get(chave) === valor) params.delete(chave);
    else params.set(chave, valor);

    /*
      TROCAR FILTRO VOLTA PARA A PAGINA 1.

      Sem isto, quem esta na pagina 12 e filtra por uma fonte de 40 produtos
      cai numa pagina que nao existe mais e ve tabela vazia — parecendo que o
      filtro nao achou nada, quando achou quarenta. A posicao na lista so faz
      sentido dentro da lista que a gerou.
    */
    params.delete("pagina");

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  /**
   * As fontes escolhidas viram parametros REPETIDOS: ?fonte=A&fonte=B.
   *
   * Nao lista separada por virgula: nome de loja pode ter virgula, e "Casa da
   * Robotica - Varejo" ja mostra que pontuacao no nome e normal. Repetir a
   * chave e o que o proprio URLSearchParams sabe desfazer sem inventar regra de
   * escape nossa.
   */
  function trocarFontes(nomes) {
    const params = new URLSearchParams(searchParams);
    params.delete("fonte");
    for (const nome of nomes) params.append("fonte", nome);
    params.delete("pagina");

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function limpar() {
    router.push(pathname);
  }

  const temFiltro = Boolean(tipo || ordem || fonte.length > 0 || searchParams.get("q"));

  return (
    // A margem de baixo e de quem posiciona: este bloco divide a linha com a
    // navegacao entre paginas, e uma margem propria aqui desalinharia os dois.
    <div className="flex flex-wrap items-center gap-2">
      <Marcador ativo={!tipo} aoClicar={() => trocar("tipo", "")}>
        Todos
      </Marcador>
      <Marcador
        ativo={tipo === "CONCORRENTE"}
        aoClicar={() => trocar("tipo", "CONCORRENTE")}
      >
        Concorrentes
      </Marcador>
      <Marcador
        ativo={tipo === "FORNECEDOR"}
        aoClicar={() => trocar("tipo", "FORNECEDOR")}
      >
        Fornecedores
      </Marcador>

      {/*
        A FONTE E UM SELETOR, NAO UM MARCADOR POR LOJA.

        Sao sete hoje e serao dezenas — uma bolinha para cada varreria a linha
        de filtros e empurraria a tabela para fora da tela. O tipo continua em
        marcador porque sao tres opcoes fixas que nunca crescem.

        A lista vem do cadastro de fontes da aba, com 0 na fonte ainda sem
        produto (pedido do dono em 09/10/2026).
      */}
      {fontes.length > 0 && (
        <>
          <span className="mx-1 h-5 w-px bg-borda" aria-hidden />
          <FiltroFontes
            fontes={fontes}
            selecionadas={fonte}
            aoMudar={(nomes) => trocarFontes(nomes)}
          />
        </>
      )}

      {/* Separador: tipo e ordem sao perguntas diferentes e combinam entre si. */}
      <span className="mx-1 h-5 w-px bg-borda" aria-hidden />

      <Marcador
        ativo={ordem === "menor"}
        aoClicar={() => trocar("ordem", "menor")}
        titulo="Do mais barato para o mais caro"
      >
        <ArrowUpNarrowWide size={13} />
        Menor valor
      </Marcador>
      <Marcador
        ativo={ordem === "maior"}
        aoClicar={() => trocar("ordem", "maior")}
        titulo="Do mais caro para o mais barato"
      >
        <ArrowDownWideNarrow size={13} />
        Maior valor
      </Marcador>

      {/*
        So aparece quando ha o que limpar: botao sempre visivel que nao faz
        nada na maior parte do tempo vira ruido.
      */}
      {temFiltro && (
        <button
          type="button"
          onClick={limpar}
          className="ml-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-suave hover:text-texto"
        >
          <Eraser size={13} />
          Limpar filtros
        </button>
      )}
    </div>
  );
}

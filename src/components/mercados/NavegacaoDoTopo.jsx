"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import Paginacao from "./Paginacao";
import { POR_PAGINA_GRANDE, POR_PAGINA_PADRAO } from "@/lib/porPagina";

/// A tela foi aberta ou recarregada? Variavel do MODULO (o mesmo truque da Pesquisa profunda): vale ate a proxima
/// carga inteira, e nao zera nas navegacoes de dentro do app (trocar de pagina, buscar, ordenar).
let jaIniciado = false;

/**
 * Liga e desliga as 100 linhas por pagina. SEMPRE NASCE EM 25 (pedido do dono em 23/10/2026): abrir ou recarregar a
 * tela com `?por=100` (link salvo, F5) volta a 25; o 100 continua so enquanto o dono trabalha na tela.
 */
function BotaoCemPorPagina({ ligado }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function irPara(ligar, { trocarHistorico = false } = {}) {
    const params = new URLSearchParams(searchParams);
    if (ligar) params.set("por", String(POR_PAGINA_GRANDE));
    else params.delete("por");
    // A posicao valia para o outro tamanho de pagina.
    params.delete("pagina");
    const query = params.toString();
    const destino = query ? `${pathname}?${query}` : pathname;
    if (trocarHistorico) router.replace(destino);
    else router.push(destino);
  }

  useEffect(() => {
    if (jaIniciado) return;
    jaIniciado = true;
    if (ligado) irPara(false, { trocarHistorico: true });
    // So na primeira montagem da carga da pagina.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      onClick={() => irPara(!ligado)}
      title={ligado ? "Mostrando 100 produtos por página. Clique para voltar a 25." : "Mostrar 100 produtos por página"}
      className="inline-flex items-center gap-2 text-xs text-suave hover:text-texto"
    >
      100 por página
      <span
        aria-hidden
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
          ligado ? "bg-acento" : "bg-borda"
        }`}
      >
        <span
          className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
            ligado ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

/**
 * Navegacao do TOPO das listas de produtos (Produtos e Scraper, padrao pedido pelo dono em 23/10/2026): fica no
 * canto DIREITO, com o botao "100 por página" logo acima do navegador de paginas. Quem chama so precisa estar numa
 * linha flex: o `ml-auto` empurra para a direita.
 */
export default function NavegacaoDoTopo({ pagina, totalPaginas, total, porPagina }) {
  const grande = porPagina === POR_PAGINA_GRANDE;
  // Lista que cabe em 25 nao tem o que ligar (mas o botao fica se ja estiver ligado, para poder desligar).
  const mostrarBotao = grande || total > POR_PAGINA_PADRAO;
  if (!mostrarBotao && totalPaginas <= 1) return null;

  return (
    <div className="ml-auto flex flex-col items-end gap-1">
      {mostrarBotao && <BotaoCemPorPagina ligado={grande} />}
      <Paginacao compacto pagina={pagina} totalPaginas={totalPaginas} total={total} />
    </div>
  );
}

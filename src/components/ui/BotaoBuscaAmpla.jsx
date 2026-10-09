"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TextSearch } from "lucide-react";

/// A tela foi aberta ou recarregada (carga inteira da pagina)? Variavel do MODULO: vale ate a proxima carga
/// inteira, e nao zera nas navegacoes de dentro do app (ligar, digitar outra busca, mudar de pagina da lista).
let jaIniciado = false;

/**
 * "Busca ampla" (pedido do dono em 09/10/2026), ao lado do campo de busca do Scraper e de Produtos: ligado, a
 * busca procura tambem na descricao, na ficha tecnica e no SEO (ver lib/buscaAmpla.js), e cada linha achada so
 * no texto diz onde ("achado na descrição").
 *
 * Mora na URL (`?ampla=1`), como o termo da busca, para sobreviver a recarga e ir junto num link. Trocar volta a
 * primeira pagina: a posicao valia para a lista anterior.
 */
export default function BotaoBuscaAmpla({ ligada, ajuda }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function irPara(ligar, { trocarHistorico = false } = {}) {
    const params = new URLSearchParams(searchParams);
    if (ligar) params.set("ampla", "1");
    else params.delete("ampla");
    params.delete("pagina");
    const query = params.toString();
    const destino = query ? `${pathname}?${query}` : pathname;
    if (trocarHistorico) router.replace(destino);
    else router.push(destino);
  }

  // SEMPRE COMECA DESLIGADO (pedido do dono em 09/10/2026): abrir ou recarregar a tela com `?ampla=1` na URL (um
  // link salvo, o F5) desliga. Continua ligado so enquanto o dono trabalha na tela.
  useEffect(() => {
    if (jaIniciado) return;
    jaIniciado = true;
    if (ligada) irPara(false, { trocarHistorico: true });
    // So na primeira montagem da carga da pagina.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <button
      type="button"
      onClick={() => irPara(!ligada)}
      aria-pressed={ligada}
      title={ajuda}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded border px-3 py-2 text-sm font-medium ${
        ligada
          ? "border-acento bg-acento text-white hover:opacity-90"
          : "border-borda bg-superficie text-suave hover:border-acento hover:text-texto"
      }`}
    >
      <TextSearch size={15} />
      Pesquisa profunda{ligada ? ": ligada" : ""}
    </button>
  );
}

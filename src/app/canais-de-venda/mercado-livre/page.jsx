import Link from "next/link";
import { Plus, Settings } from "lucide-react";

import TabelaAnunciosML from "@/components/anuncios/ml/TabelaAnunciosML";
import Paginacao from "@/components/mercados/Paginacao";
import AvisoBanco from "@/components/ui/AvisoBanco";
import CampoBusca from "@/components/ui/CampoBusca";
import LinkDeVolta from "@/components/ui/LinkDeVolta";
import PageHeader from "@/components/ui/PageHeader";
import { listarAnunciosML } from "@/lib/canaisDeVenda/ml/banco";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mercado Livre | Sistema Rise" };

const POR_PAGINA = 100;

// Parametro repetido na URL (`?q=a&q=b`) chega como lista; vale o primeiro.
const textoDe = (valor) => String((Array.isArray(valor) ? valor[0] : valor) ?? "").trim();

/**
 * Lista dos anuncios do Mercado Livre (Canais de Venda): busca por titulo, codigo do produto
 * ou codigo do kit, 100 por pagina. Cada linha abre o editor do anuncio.
 */
export default async function MercadoLivrePage({ searchParams }) {
  const params = await searchParams;
  const busca = textoDe(params?.q);

  let lista = null;
  let erro = null;
  try {
    lista = await listarAnunciosML({ busca, pagina: textoDe(params?.pagina) });
  } catch (e) {
    erro = e;
  }

  const botao = "inline-flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium";
  const primeiro = lista ? (lista.pagina - 1) * POR_PAGINA + 1 : 0;
  const ultimo = lista ? (lista.pagina - 1) * POR_PAGINA + lista.linhas.length : 0;

  return (
    <>
      <LinkDeVolta href="/canais-de-venda" rotulo="Canais de Venda" />
      <PageHeader
        titulo="Mercado Livre"
        descricao="Anuncios criados a partir dos produtos Conferidos. A publicacao no Mercado Livre entra numa proxima etapa."
        acao={
          <div className="flex flex-wrap gap-2">
            <Link href="/canais-de-venda/mercado-livre/configuracoes" className={`${botao} border border-borda hover:bg-fundo`}>
              <Settings size={16} />
              Configuracoes
            </Link>
            <Link href="/canais-de-venda/mercado-livre/novo" className={`${botao} bg-acento text-white hover:opacity-90`}>
              <Plus size={16} />
              Novo anuncio
            </Link>
          </div>
        }
      />

      {erro && <AvisoBanco erro={erro} />}

      {lista && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <CampoBusca valorInicial={busca} rotulo="Buscar por titulo ou codigo" className="w-full max-w-sm" />
            <Paginacao
              compacto
              pagina={lista.pagina}
              totalPaginas={lista.totalPaginas}
              primeiro={primeiro}
              ultimo={ultimo}
              total={lista.total}
            />
          </div>

          <TabelaAnunciosML linhas={lista.linhas} busca={busca} />

          {lista.linhas.length > 0 && (
            <>
              <Paginacao
                pagina={lista.pagina}
                totalPaginas={lista.totalPaginas}
                primeiro={primeiro}
                ultimo={ultimo}
                total={lista.total}
              />
              <p className="mt-3 text-xs text-suave">{lista.total} anuncio(s)</p>
            </>
          )}
        </>
      )}
    </>
  );
}

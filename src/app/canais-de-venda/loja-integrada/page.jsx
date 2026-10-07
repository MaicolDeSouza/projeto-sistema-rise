import Link from "next/link";
import { Plus, Settings } from "lucide-react";

import TabelaAnunciosLI from "@/components/anuncios/li/TabelaAnunciosLI";
import Paginacao from "@/components/mercados/Paginacao";
import AvisoBanco from "@/components/ui/AvisoBanco";
import CampoBusca from "@/components/ui/CampoBusca";
import LinkDeVolta from "@/components/ui/LinkDeVolta";
import PageHeader from "@/components/ui/PageHeader";
import { listarAnunciosLI } from "@/lib/canaisDeVenda/li/banco";

export const dynamic = "force-dynamic";
export const metadata = { title: "Loja Integrada | Sistema Rise" };

const POR_PAGINA = 100;

// Parametro repetido na URL (`?q=a&q=b`) chega como lista; vale o primeiro.
const textoDe = (valor) => String((Array.isArray(valor) ? valor[0] : valor) ?? "").trim();

/**
 * Lista dos anuncios da Loja Integrada (Canais de Venda): um por produto, criado pelo editor ou
 * pelo vinculo automatico do icone. Busca por titulo ou codigo, 100 por pagina.
 */
export default async function LojaIntegradaPage({ searchParams }) {
  const params = await searchParams;
  const busca = textoDe(params?.q);

  let lista = null;
  let erro = null;
  try {
    lista = await listarAnunciosLI({ busca, pagina: textoDe(params?.pagina) });
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
        titulo="Loja Integrada"
        descricao="Conteudo, SEO e dados fiscais dos produtos da loja propria, a partir dos produtos Conferidos. Estoque e preco continuam pelo Bling."
        acao={
          <div className="flex flex-wrap gap-2">
            <Link href="/canais-de-venda/loja-integrada/configuracoes" className={`${botao} border border-borda hover:bg-fundo`}>
              <Settings size={16} />
              Configuracoes
            </Link>
            <Link href="/canais-de-venda/loja-integrada/novo" className={`${botao} bg-acento text-white hover:opacity-90`}>
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
            <Paginacao compacto pagina={lista.pagina} totalPaginas={lista.totalPaginas} primeiro={primeiro} ultimo={ultimo} total={lista.total} />
          </div>

          <TabelaAnunciosLI linhas={lista.linhas} busca={busca} />

          {lista.linhas.length > 0 && (
            <>
              <Paginacao pagina={lista.pagina} totalPaginas={lista.totalPaginas} primeiro={primeiro} ultimo={ultimo} total={lista.total} />
              <p className="mt-3 text-xs text-suave">{lista.total} anuncio(s)</p>
            </>
          )}
        </>
      )}
    </>
  );
}

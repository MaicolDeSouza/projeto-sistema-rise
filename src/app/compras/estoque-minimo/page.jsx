import { notFound } from "next/navigation";

import TabelaEstoqueMinimo from "@/components/compras/TabelaEstoqueMinimo";
import NavegacaoDoTopo from "@/components/mercados/NavegacaoDoTopo";
import Paginacao from "@/components/mercados/Paginacao";
import CampoBusca from "@/components/ui/CampoBusca";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { listarAbaixoDoMinimo } from "@/lib/compras/banco";
import { porPaginaDaUrl } from "@/lib/porPagina";

export const metadata = { title: "Abaixo do estoque mínimo | Sistema Rise" };
export const dynamic = "force-dynamic";

const ORDENS = ["codigo", "estoque", "falta"];

export default async function EstoqueMinimoPage({ searchParams }) {
  const acesso = await exigirAcessoNaPagina("tela.compras.estoqueMinimo", "ver");
  // Sem o estoque exato a lista nao tem o que mostrar (so faixas): a tela nao existe para quem nao o ve.
  if (!acesso.pode("dado.estoqueExato", "ver")) notFound();

  const params = await searchParams;
  const busca = typeof params?.q === "string" ? params.q : "";
  const porPagina = porPaginaDaUrl(params?.por);
  const ordenar = ORDENS.includes(params?.ordenar) ? params.ordenar : undefined;
  const direcao = params?.direcao === "desc" ? "desc" : "asc";
  const paginaPedida = Math.max(1, Number.parseInt(params?.pagina, 10) || 1);

  const { linhas, total } = await listarAbaixoDoMinimo({ busca, pagina: paginaPedida, porPagina, ordenar, direcao });
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const pagina = Math.min(paginaPedida, totalPaginas);

  return (
    <>
      <PageHeader
        titulo="Abaixo do estoque mínimo"
        descricao={total === 1 ? "1 produto conferido precisa de reposição." : `${total} produtos conferidos precisam de reposição.`}
        voltarPara="/compras"
        voltarRotulo="Voltar a Compras"
      />
      <div className="mb-3 flex items-end gap-4">
        <CampoBusca valorInicial={busca} rotulo="Buscar por nome ou código" className="max-w-sm flex-1" />
        <NavegacaoDoTopo pagina={pagina} totalPaginas={totalPaginas} total={total} porPagina={porPagina} />
      </div>
      <TabelaEstoqueMinimo linhas={linhas} ordenar={ordenar} direcao={direcao} />
      {totalPaginas > 1 && (
        <div className="mt-4">
          <Paginacao
            pagina={pagina}
            totalPaginas={totalPaginas}
            total={total}
            primeiro={(pagina - 1) * porPagina + 1}
            ultimo={Math.min(pagina * porPagina, total)}
          />
        </div>
      )}
    </>
  );
}

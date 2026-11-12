import { notFound } from "next/navigation";

import TabelaEstudos from "@/components/compras/estudos/TabelaEstudos";
import NavegacaoDoTopo from "@/components/mercados/NavegacaoDoTopo";
import Paginacao from "@/components/mercados/Paginacao";
import CampoBusca from "@/components/ui/CampoBusca";
import { LembrarLista } from "@/components/ui/ListaLembrada";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { COLUNAS_DOS_ESTUDOS, listarEstudos } from "@/lib/estudos/banco";
import { porPaginaDaUrl } from "@/lib/porPagina";

export const metadata = { title: "Estudos de viabilidade | Sistema Rise" };
export const dynamic = "force-dynamic";

const SITUACOES = ["NA_FILA", "CONCLUIDO"];

/**
 * Compras › Estudos de viabilidade (spec 2026-11-12). O estudo mostra custo e preco de concorrente: sem os dois acessos,
 * a tela nao abre (404, como as outras).
 */
export default async function EstudosPage({ searchParams }) {
  const acesso = await exigirAcessoNaPagina("tela.compras.estudos", "ver");
  if (!acesso.pode("dado.custo", "ver") || !acesso.pode("dado.concorrentes", "ver")) {
    notFound();
  }
  const params = await searchParams;
  const situacao = [params?.situacao ?? []].flat().filter((valor) => SITUACOES.includes(valor));
  const busca = typeof params?.q === "string" ? params.q : "";
  const paginaPedida = Math.max(1, Number.parseInt(params?.pagina, 10) || 1);
  const POR_PAGINA = porPaginaDaUrl(params?.por);
  const ordenar = COLUNAS_DOS_ESTUDOS.includes(params?.ordenar) ? params.ordenar : null;
  const direcao = params?.direcao === "desc" ? "desc" : "asc";

  const { linhas, total } = await listarEstudos({ busca, situacao, ordenar, direcao, pagina: paginaPedida, porPagina: POR_PAGINA });
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(paginaPedida, totalPaginas);

  return (
    <>
      <LembrarLista caminho="/compras/estudos" />
      <PageHeader
        titulo="Estudos de viabilidade"
        descricao={total === 1 ? "1 estudo." : `${total} estudos.`}
        voltarPara="/compras"
        voltarRotulo="Voltar a Compras"
        somenteLeitura={acesso.pode("tela.compras.estudos", "editar") ? null : "Você pode ver os estudos, mas não mexer neles."}
      />
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <CampoBusca valorInicial={busca} rotulo="Buscar por produto, código ou fonte" className="w-full max-w-sm" />
        <NavegacaoDoTopo pagina={pagina} totalPaginas={totalPaginas} total={total} porPagina={POR_PAGINA} />
      </div>
      <TabelaEstudos linhas={linhas} situacao={situacao} podeExcluir={acesso.pode("tela.compras.estudos", "excluir")} />
      {totalPaginas > 1 && (
        <div className="mt-4">
          <Paginacao pagina={pagina} totalPaginas={totalPaginas} total={total} primeiro={(pagina - 1) * POR_PAGINA + 1} ultimo={Math.min(pagina * POR_PAGINA, total)} />
        </div>
      )}
    </>
  );
}

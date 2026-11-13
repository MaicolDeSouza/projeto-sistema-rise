import Link from "next/link";
import { ListChecks } from "lucide-react";

import TabelaPropostas, { BotaoNovaProposta } from "@/components/propostas/TabelaPropostas";
import NavegacaoDoTopo from "@/components/mercados/NavegacaoDoTopo";
import Paginacao from "@/components/mercados/Paginacao";
import CampoBusca from "@/components/ui/CampoBusca";
import { LembrarLista } from "@/components/ui/ListaLembrada";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { COLUNAS_DAS_PROPOSTAS, contarPropostas, listarPropostas } from "@/lib/propostas/banco";
import { SITUACOES } from "@/lib/propostas/regras";
import { porPaginaDaUrl } from "@/lib/porPagina";

export const metadata = { title: "Propostas | Sistema Rise" };
export const dynamic = "force-dynamic";

/**
 * Propostas para cliente (spec 2026-11-12). Nesta tela o operador ve primeiro quem precisa de contato hoje e a situacao
 * de cada proposta; a acao principal e "Nova proposta".
 */
export default async function PropostasPage({ searchParams }) {
  const acesso = await exigirAcessoNaPagina("tela.propostas", "ver");
  const params = await searchParams;
  const situacoes = [params?.situacao ?? []].flat().filter((valor) => SITUACOES[valor]);
  const contatar = params?.contatar === "1";
  const abertas = params?.abertas === "1";
  const busca = typeof params?.q === "string" ? params.q : "";
  const paginaPedida = Math.max(1, Number.parseInt(params?.pagina, 10) || 1);
  const POR_PAGINA = porPaginaDaUrl(params?.por);
  const ordenar = COLUNAS_DAS_PROPOSTAS.includes(params?.ordenar) ? params.ordenar : null;
  const direcao = params?.direcao === "desc" ? "desc" : "asc";

  const { linhas, total } = await listarPropostas({ busca, situacoes, contatar, abertas, ordenar, direcao, pagina: paginaPedida, porPagina: POR_PAGINA });
  const contagem = await contarPropostas();
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(paginaPedida, totalPaginas);
  const podeEditar = acesso.pode("tela.propostas", "editar");

  return (
    <>
      <LembrarLista caminho="/propostas" />
      <PageHeader
        titulo="Propostas"
        descricao={total === 1 ? "1 proposta." : `${total} propostas.`}
        acao={
          <div className="flex items-start gap-2">
            {/* Padroes por tipo de cliente (13/11/2026): secundario, ao lado da acao principal. */}
            <Link href="/propostas/padroes" className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-texto hover:bg-superficie hover:text-acento" title="Padrões de proposta por tipo de cliente (SENAI, Instituto Federal...)">
              <ListChecks size={16} /> Padrões
            </Link>
            {podeEditar && <BotaoNovaProposta />}
          </div>
        }
        somenteLeitura={podeEditar ? null : "Você pode ver as propostas, mas não editar."}
      />
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <CampoBusca valorInicial={busca} rotulo="Buscar por número, cliente, OC ou item" className="w-full max-w-sm" />
        <NavegacaoDoTopo pagina={pagina} totalPaginas={totalPaginas} total={total} porPagina={POR_PAGINA} />
      </div>
      <TabelaPropostas
        linhas={linhas}
        situacoes={situacoes}
        contatar={contatar}
        abertas={abertas}
        contagem={contagem}
        podeExcluir={acesso.pode("tela.propostas", "excluir")}
      />
      {totalPaginas > 1 && (
        <div className="mt-4">
          <Paginacao pagina={pagina} totalPaginas={totalPaginas} total={total} primeiro={(pagina - 1) * POR_PAGINA + 1} ultimo={Math.min(pagina * POR_PAGINA, total)} />
        </div>
      )}
    </>
  );
}

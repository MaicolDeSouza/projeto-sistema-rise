import Link from "next/link";

import Paginacao from "@/components/mercados/Paginacao";
import SeloDaSituacao from "@/components/producao/SeloDaSituacao";
import CampoBusca from "@/components/ui/CampoBusca";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { contarPorSituacao, listarOrdens } from "@/lib/producao/banco";
import { ROTULO_DA_SITUACAO, SITUACOES } from "@/lib/producao/regras";

export const metadata = { title: "Ordens de produção | Sistema Rise" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 25;
const data = (valor) => (valor ? new Date(valor).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

/** Link de um filtro de situacao, mantendo a busca (trocar o filtro volta a pagina 1). */
function linkDoFiltro(situacao, busca) {
  const params = new URLSearchParams();
  if (situacao) params.set("situacao", situacao);
  if (busca) params.set("q", busca);
  const texto = params.toString();
  return `/estoque/producao${texto ? `?${texto}` : ""}`;
}

/**
 * Lista das ordens de producao. Linha-guia: o operador ve primeiro o que esta aberto ou em producao (filtro por
 * situacao no topo); a acao principal e abrir uma ordem. A ordem nasce no "Produzir" do cadastro do produto.
 */
export default async function OrdensPage({ searchParams }) {
  await exigirAcessoNaPagina("tela.estoque.producao", "ver");
  const params = await searchParams;
  const situacao = SITUACOES.includes(params?.situacao) ? params.situacao : null;
  const busca = typeof params?.q === "string" ? params.q : "";
  const paginaPedida = Math.max(1, Number.parseInt(params?.pagina, 10) || 1);

  const [{ ordens, total, pagina, totalPaginas }, contagem] = await Promise.all([
    listarOrdens({ situacao, busca, pagina: paginaPedida, porPagina: POR_PAGINA }),
    contarPorSituacao(),
  ]);
  const todas = Object.values(contagem).reduce((soma, quantas) => soma + quantas, 0);

  return (
    <>
      <PageHeader
        titulo="Ordens de produção"
        descricao={total === 1 ? "1 ordem." : `${total} ordens.`}
        voltarPara="/estoque"
        voltarRotulo="Voltar a Estoque"
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <CampoBusca valorInicial={busca} rotulo="Buscar por número, código ou nome" className="w-full max-w-sm" />
        <nav aria-label="Filtrar por situação" className="flex flex-wrap gap-1.5">
          {[[null, "Todas", todas], ...SITUACOES.map((item) => [item, ROTULO_DA_SITUACAO[item], contagem[item]])].map(([valor, rotulo, quantas]) => (
            <Link
              key={rotulo}
              href={linkDoFiltro(valor, busca)}
              aria-current={situacao === valor ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${
                situacao === valor ? "border-acento bg-acento/10 font-medium text-acento" : "border-borda text-suave hover:bg-fundo"
              }`}
            >
              {rotulo} <span className="tabular-nums">{quantas}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
        <table className="w-full text-sm">
          <thead className="bg-fundo text-left text-xs font-semibold uppercase text-suave">
            <tr>
              <th className="px-3 py-2">Nº</th>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2 text-right">Planejada</th>
              <th className="px-3 py-2 text-right">Produzida</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2">Criada</th>
              <th className="px-3 py-2">Baixa</th>
              <th className="px-3 py-2">Concluída</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {ordens.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-suave">
                  Nenhuma ordem. Use &quot;Produzir&quot; na aba Fornecedores / Concorrentes de um produto com peças próprias.
                </td>
              </tr>
            )}
            {ordens.map((ordem) => (
              <tr key={ordem.id} className="hover:bg-fundo">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                  <Link href={`/estoque/producao/${ordem.id}`} className="font-semibold text-acento hover:underline">
                    {ordem.numero}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <div className="flex max-w-xs items-baseline gap-2">
                    <span className="whitespace-nowrap font-mono text-xs text-suave">{ordem.produto.sku}</span>
                    <span className="truncate">{ordem.produto.tituloBase}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{ordem.quantidadePlanejada}</td>
                <td className="px-3 py-2 text-right tabular-nums">{ordem.quantidadeProduzida ?? "—"}</td>
                <td className="px-3 py-2">
                  <SeloDaSituacao situacao={ordem.situacao} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-suave">{data(ordem.criadoEm)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-suave">{data(ordem.baixaEm)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-suave">{data(ordem.concluidaEm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPaginas > 1 && (
        <div className="mt-4">
          <Paginacao
            pagina={pagina}
            totalPaginas={totalPaginas}
            total={total}
            primeiro={(pagina - 1) * POR_PAGINA + 1}
            ultimo={Math.min(pagina * POR_PAGINA, total)}
          />
        </div>
      )}
    </>
  );
}

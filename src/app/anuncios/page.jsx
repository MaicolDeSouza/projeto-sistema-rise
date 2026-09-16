import Link from "next/link";
import { Megaphone, Plus, TriangleAlert } from "lucide-react";

import { prisma } from "@/lib/db";
import { canais, temAlteracoesNaoPublicadas } from "@/lib/anuncios/canais";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import AvisoBanco from "@/components/ui/AvisoBanco";
import BadgeCanal from "@/components/anuncios/BadgeCanal";
import FiltrosAnuncios from "@/components/anuncios/FiltrosAnuncios";

export const dynamic = "force-dynamic";

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default async function AnunciosPage({ searchParams }) {
  const params = await searchParams;
  const canalFiltro = params?.canal ?? "";
  const situacaoFiltro = params?.situacao ?? "";

  let produtos = null;
  let erro = null;

  try {
    produtos = await prisma.produto.findMany({
      orderBy: { atualizadoEm: "desc" },
      // SO OS ANUNCIOS. A tabela mostra titulo, SKU, preco, estoque e a situacao
      // por canal — imagem nenhuma. As fotos vinham junto sem serem usadas, e o
      // campo `imagens` nem existe mais: virou `arquivos` em 27/08/2026, na
      // reforma do cadastro de Produtos. A consulta falhava inteira, e a tela
      // caia no aviso de banco indisponivel com o banco no ar.
      include: { anuncios: true },
    });
  } catch (excecao) {
    erro = excecao;
  }

  // O filtro roda aqui e nao no banco porque "alteracoes nao publicadas" e um
  // estado derivado (comparacao de hash), nao uma coluna consultavel.
  const linhas = (produtos ?? [])
    .map((produto) => {
      const porCanal = new Map(
        produto.anuncios.map((anuncio) => [anuncio.canal, anuncio]),
      );
      const pendentes = produto.anuncios.filter((anuncio) =>
        temAlteracoesNaoPublicadas(produto, anuncio),
      );
      return { produto, porCanal, pendentes };
    })
    .filter(({ porCanal, pendentes }) => {
      if (canalFiltro && !porCanal.has(canalFiltro)) return false;

      if (!situacaoFiltro) return true;
      if (situacaoFiltro === "PENDENTE") return pendentes.length > 0;

      const alvos = canalFiltro
        ? [porCanal.get(canalFiltro)]
        : [...porCanal.values()];

      return alvos.some((anuncio) => {
        if (!anuncio) return false;
        if (situacaoFiltro === "ERRO") return anuncio.status === "ERRO";
        if (situacaoFiltro === "RASCUNHO")
          return ["RASCUNHO", "VALIDADO"].includes(anuncio.status);
        return (
          anuncio.status === "PUBLICADO" &&
          anuncio.situacaoCanal === situacaoFiltro
        );
      });
    });

  return (
    <>
      <PageHeader
        titulo="Anuncios"
        descricao="Um cadastro, varios canais. Cada canal tem suas regras e sua situacao propria."
        acao={
          <Link
            href="/anuncios/novo"
            className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={16} />
            Novo anuncio
          </Link>
        }
      />

      {erro && <AvisoBanco erro={erro} />}

      {!erro && (
        <>
          <FiltrosAnuncios canal={canalFiltro} situacao={situacaoFiltro} />

          {linhas.length === 0 ? (
            <EmptyState
              icone={Megaphone}
              titulo="Nenhum anuncio encontrado"
              descricao="Ajuste os filtros ou cadastre um anuncio novo."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
              <table className="w-full text-sm">
                <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Produto</th>
                    <th className="px-4 py-3 text-right font-medium">Preco</th>
                    <th className="px-4 py-3 text-right font-medium">Estoque</th>
                    {canais.map((canal) => (
                      <th key={canal.id} className="px-4 py-3 font-medium">
                        {canal.nome}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {linhas.map(({ produto, porCanal, pendentes }) => (
                    <tr key={produto.id} className="hover:bg-fundo/60">
                      <td className="px-4 py-3">
                        <Link
                          href={`/anuncios/${produto.id}`}
                          className="font-medium hover:text-acento"
                        >
                          {produto.tituloBase}
                        </Link>
                        <p className="mt-0.5 font-mono text-xs text-suave">
                          {produto.sku}
                        </p>
                        {pendentes.length > 0 && (
                          <p className="mt-1 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
                            <TriangleAlert size={11} />
                            {pendentes.length} canal(is) com alteracoes nao
                            publicadas
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {produto.precoVenda
                          ? moeda.format(Number(produto.precoVenda))
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {produto.estoque}
                      </td>
                      {canais.map((canal) => (
                        <td key={canal.id} className="px-4 py-3">
                          {porCanal.has(canal.id) ? (
                            <BadgeCanal anuncio={porCanal.get(canal.id)} />
                          ) : (
                            <span className="text-xs text-suave">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

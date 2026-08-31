import Link from "next/link";
import { ArrowLeft, Store } from "lucide-react";

import { prisma } from "@/lib/db";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import AvisoBanco from "@/components/ui/AvisoBanco";
import FormularioFonte from "@/components/mercados/FormularioFonte";
import LinhaFonte from "@/components/mercados/LinhaFonte";

export const dynamic = "force-dynamic";

export default async function FontesPage() {
  let fontes = null;
  let erro = null;

  try {
    fontes = await prisma.fonteColeta.findMany({
      orderBy: [{ ativa: "desc" }, { nome: "asc" }],
      include: { _count: { select: { paginas: true } } },
    });
  } catch (excecao) {
    erro = excecao;
  }

  const linhas = (fontes ?? []).map((fonte) => ({
    id: fonte.id,
    nome: fonte.nome,
    dominio: fonte.dominio,
    prefixoUrl: fonte.prefixoUrl,
    tipo: fonte.tipo,
    ativa: fonte.ativa,
    robotsPermite: fonte.robotsPermite,
    ultimaVarreduraEm: fonte.ultimaVarreduraEm,
    // Quantos a loja tem, e quantos ja pegamos. Os dois juntos: um sozinho
    // nao responde se a coleta esta perto do fim ou mal comecou.
    produtosNoSite: fonte.produtosNoSite,
    produtosNoSiteParcial: fonte.produtosNoSiteParcial,
    coletados: fonte._count.paginas,
  }));

  return (
    <>
      <Link
        href="/mercados"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-suave hover:text-texto"
      >
        <ArrowLeft size={15} />
        Voltar para Mercados
      </Link>

      <PageHeader
        titulo="Sites acompanhados"
        descricao="Concorrentes e fornecedores. Cada fonte e testada antes de ser cadastrada."
      />

      {erro && <AvisoBanco erro={erro} />}

      {!erro && (
        <>
          <FormularioFonte />

          {linhas.length === 0 ? (
            <EmptyState
              icone={Store}
              titulo="Nenhum site cadastrado"
              descricao="Cole o endereco de um concorrente ou fornecedor no campo acima para comecar."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
              <table className="w-full text-sm">
                <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
                  <tr className="divide-x divide-borda">
                    <th className="px-3 py-2.5 font-medium">Loja</th>
                    <th className="px-3 py-2.5 font-medium">Situacao</th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Produtos no site
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">Coletados</th>
                    <th className="px-3 py-2.5 font-medium">Ultima varredura</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {linhas.map((fonte) => (
                    <LinhaFonte key={fonte.id} fonte={fonte} />
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

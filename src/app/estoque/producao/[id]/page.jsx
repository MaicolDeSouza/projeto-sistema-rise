import { notFound } from "next/navigation";

import OrdemDeProducao from "@/components/producao/OrdemDeProducao";
import SeloDaSituacao from "@/components/producao/SeloDaSituacao";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { lerOrdem } from "@/lib/producao/banco";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const ordem = await lerOrdem(id).catch(() => null);
  return { title: ordem ? `${ordem.numero} · ${ordem.produto.sku} | Sistema Rise` : "Ordem de produção | Sistema Rise" };
}

export default async function OrdemPage({ params }) {
  const acesso = await exigirAcessoNaPagina("tela.estoque.producao", "ver");
  const { id } = await params;
  const ordem = await lerOrdem(id);
  if (!ordem) notFound();
  const podeMovimentar = acesso.pode("acao.producao.movimentar", "executar");

  return (
    <>
      <PageHeader
        titulo={
          <span className="inline-flex items-center gap-3">
            {ordem.numero}
            <SeloDaSituacao situacao={ordem.situacao} />
          </span>
        }
        descricao={`${ordem.produto.sku} · ${ordem.produto.tituloBase}`}
        voltarPara="/estoque/producao"
        voltarRotulo="Voltar às ordens"
        somenteLeitura={podeMovimentar ? null : "Você pode ver a ordem, mas não movimentar o estoque."}
      />
      {/* Decimal e Date nao atravessam para o cliente: vai o JSON. */}
      <OrdemDeProducao key={ordem.id} ordem={JSON.parse(JSON.stringify(ordem))} podeMovimentar={podeMovimentar} />
    </>
  );
}

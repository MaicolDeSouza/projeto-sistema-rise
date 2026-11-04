import { notFound } from "next/navigation";

import { dataCompleta } from "@/components/pedidos/formato";
import IconeDoCanalDoPedido from "@/components/pedidos/IconeDoCanalDoPedido";
import PedidoDeVenda from "@/components/pedidos/PedidoDeVenda";
import { COR_DO_STATUS, TEXTO_DO_STATUS } from "@/components/pedidos/textos";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { config } from "@/lib/integracoes/config";
import { lerPedidoDeVenda } from "@/lib/pedidos/banco";
import { projetarPedido } from "@/lib/pedidos/projecao";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const pedido = await lerPedidoDeVenda(id).catch(() => null);
  return { title: pedido ? `Pedido ${pedido.numero} | Sistema Rise` : "Pedido | Sistema Rise" };
}

/**
 * Um pedido de venda (spec 5.10). Nesta tela o operador ve primeiro o status, o cliente e os avisos do pedido; a acao
 * principal e marcar em separacao. O que ele pode fazer vem de Acessos (`acao.pedidos.*`), e o lucro so com `dado.custo`.
 */
export default async function PedidoDeVendaPage({ params }) {
  const acesso = await exigirAcessoNaPagina("tela.pedidos", "ver");
  const { id } = await params;
  // Dado pessoal e custo saem no servidor para quem nao os ve (o que vai ao componente de cliente chega ao navegador).
  const pedido = projetarPedido(await lerPedidoDeVenda(id), acesso.pode);
  if (!pedido) notFound();

  const pode = {
    marcarSeparacao: acesso.pode("acao.pedidos.marcarSeparacao", "executar"),
    editarCustoDoFrete: acesso.pode("acao.pedidos.editarCustoDoFrete", "executar"),
    vincularCliente: acesso.pode("acao.pedidos.vincularCliente", "executar"),
    baixarNF: acesso.pode("acao.pedidos.baixarNF", "executar"),
  };

  return (
    <>
      <PageHeader
        voltarPara="/pedidos"
        voltarRotulo="Voltar aos pedidos"
        titulo={
          <span className="inline-flex items-center gap-2.5">
            <IconeDoCanalDoPedido canal={pedido.canal} avisos={pedido.avisos} doRise={pedido.doRise} />
            Pedido {pedido.numero}
          </span>
        }
        descricao={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="tabular-nums">Vendido em {dataCompleta(pedido.dataDaVenda)}</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-texto">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${COR_DO_STATUS[pedido.status] ?? "bg-zinc-300"}`} />
              {TEXTO_DO_STATUS[pedido.status] ?? pedido.status}
              {pedido.statusDaOrigem && <BolhaDeAjuda variante="inline" texto={`No canal: ${pedido.statusDaOrigem}`} />}
            </span>
            {pedido.blingNumero && <span>Bling {pedido.blingNumero}</span>}
          </span>
        }
      />
      <PedidoDeVenda pedido={pedido} veCusto={acesso.pode("dado.custo", "ver")} pode={pode} nfeLigada={Boolean(config.travas.nfe)} />
    </>
  );
}

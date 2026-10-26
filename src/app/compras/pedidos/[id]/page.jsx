import { notFound } from "next/navigation";

import EditorDoPedidoCompleto from "@/components/compras/EditorDoPedidoCompleto";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { lerPedido } from "@/lib/compras/banco";
import { semPrecos } from "@/lib/compras/projecao";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const pedido = await lerPedido(id).catch(() => null);
  return { title: pedido ? `${pedido.codigo} · ${pedido.fornecedor.nome} | Sistema Rise` : "Pedido de compra | Sistema Rise" };
}

export default async function PedidoPage({ params }) {
  const acesso = await exigirAcessoNaPagina("tela.compras.pedidos", "ver");
  const { id } = await params;
  const lido = await lerPedido(id);
  if (!lido) notFound();
  const pedido = acesso.pode("dado.custo", "ver") ? lido : semPrecos(lido);

  const transportadoras = await prisma.transportadora.findMany({
    where: { OR: [{ ativo: true }, ...(pedido.transportadoraId ? [{ id: pedido.transportadoraId }] : [])] },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, nomeFantasia: true, urlRastreamento: true },
  });

  return (
    <EditorDoPedidoCompleto
      key={pedido.id}
      pedidoInicial={JSON.parse(JSON.stringify(pedido))}
      transportadoras={transportadoras}
      podeEditar={acesso.pode("tela.compras.pedidos", "editar")}
      podeLancar={acesso.pode("acao.compras.lancarEstoque", "executar")}
    />
  );
}

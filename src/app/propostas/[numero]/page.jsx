import { notFound } from "next/navigation";

import EditorProposta from "@/components/propostas/EditorProposta";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { prisma } from "@/lib/db";
import { lerProposta, semCusto } from "@/lib/propostas/banco";
import { numeroDaProposta } from "@/lib/propostas/regras";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { numero } = await params;
  const proposta = await lerProposta(numero).catch(() => null);
  return { title: proposta ? `${numeroDaProposta(proposta.numero)}${proposta.clienteNome ? ` · ${proposta.clienteNome}` : ""} | Sistema Rise` : "Proposta | Sistema Rise" };
}

export default async function PropostaPage({ params }) {
  const acesso = await exigirAcessoNaPagina("tela.propostas", "ver");
  const { numero } = await params;
  const lida = await lerProposta(numero);
  if (!lida) notFound();
  const proposta = acesso.pode("dado.custo", "ver") ? lida : semCusto(lida);

  const [transportadoras, condicoes] = await Promise.all([
    prisma.transportadora.findMany({
      where: { OR: [{ ativo: true }, ...(proposta.transportadoraId ? [{ id: proposta.transportadoraId }] : [])] },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, nomeFantasia: true },
    }),
    prisma.condicaoPagamento.findMany({
      where: { OR: [{ ativo: true }, ...(proposta.condicaoPagamentoId ? [{ id: proposta.condicaoPagamentoId }] : [])] },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
  ]);

  return (
    <EditorProposta
      key={proposta.id}
      propostaInicial={JSON.parse(JSON.stringify(proposta))}
      transportadoras={transportadoras}
      condicoes={condicoes}
      podeEditar={acesso.pode("tela.propostas", "editar")}
      podePedidoDeVenda={acesso.pode("acao.propostas.pedidoDeVenda", "executar")}
    />
  );
}

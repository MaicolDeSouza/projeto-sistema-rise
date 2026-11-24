import { notFound } from "next/navigation";

import EditorProposta from "@/components/propostas/EditorProposta";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { prisma } from "@/lib/db";
import { ordenarCondicoes } from "@/lib/condicoesDePagamento";
import { listarCaixas } from "@/lib/frete/caixas";
import { lerProposta, semCusto } from "@/lib/propostas/banco";
import { situacaoDoCertificado } from "@/lib/propostas/certificado";
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

  // O vendedor tem as opcoes fixas do card "Condicoes da proposta" (17/11/2026); a lista dos usuarios do Rise saiu.
  const [transportadoras, condicoes, certificado, caixas] = await Promise.all([
    prisma.transportadora.findMany({
      where: { OR: [{ ativo: true }, ...(proposta.transportadoraId ? [{ id: proposta.transportadoraId }] : [])] },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, nomeFantasia: true },
    }),
    prisma.condicaoPagamento
      .findMany({
        where: { OR: [{ ativo: true }, ...(proposta.condicaoPagamentoId ? [{ id: proposta.condicaoPagamentoId }] : [])] },
        select: { id: true, nome: true },
      })
      .then(ordenarCondicoes),
    // Quem assina e ate quando, para a chave "Assinar digitalmente" (nunca o segredo).
    situacaoDoCertificado(),
    // As caixas de envio para o "Cotar frete" do frete CIF (modulo de frete, 18/11/2026).
    listarCaixas({ soAtivas: true }),
  ]);

  return (
    <EditorProposta
      key={proposta.id}
      propostaInicial={JSON.parse(JSON.stringify(proposta))}
      transportadoras={transportadoras}
      condicoes={condicoes}
      certificado={certificado}
      caixas={caixas}
      podeEditar={acesso.pode("tela.propostas", "editar")}
      podePedidoDeVenda={acesso.pode("acao.propostas.pedidoDeVenda", "executar")}
    />
  );
}

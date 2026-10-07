import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Hammer } from "lucide-react";

import { canalPorId } from "@/lib/canais";
import { prisma } from "@/lib/db";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

export default async function CanalDoProdutoPage({ params }) {
  const { id, canal: apelido } = await params;
  const canal = canalPorId(apelido.toUpperCase());
  if (!canal) notFound();

  const produto = await prisma.produto.findUnique({
    where: { id },
    select: { tituloBase: true, sku: true },
  });
  if (!produto) notFound();

  return (
    <>
      <Link
        href="/produtos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-suave hover:text-texto"
      >
        <ArrowLeft size={15} />
        Voltar para produtos
      </Link>

      <PageHeader
        titulo={`${produto.tituloBase} no ${canal.nome}`}
        descricao={`SKU ${produto.sku}`}
      />

      <EmptyState
        icone={Hammer}
        titulo="Tela em construção"
        descricao={`A gestão do anúncio no ${canal.nome} — publicar, editar, sincronizar e pausar — entra na próxima etapa, junto com a publicação real.`}
      />
    </>
  );
}

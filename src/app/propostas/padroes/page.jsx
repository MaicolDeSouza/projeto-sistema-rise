import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import PadroesDeProposta from "@/components/propostas/PadroesDeProposta";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { listarPadroes } from "@/lib/propostas/padroes";

export const metadata = { title: "Padrões de proposta | Sistema Rise" };
export const dynamic = "force-dynamic";

/**
 * Padroes de proposta por tipo de cliente (pedido do dono em 13/11/2026). Nesta tela o operador ve primeiro os padroes e
 * o que cada um preenche; a acao principal e "Novo padrao".
 */
export default async function PadroesPage() {
  const acesso = await exigirAcessoNaPagina("tela.propostas", "ver");
  const padroes = await listarPadroes();
  const podeEditar = acesso.pode("tela.propostas", "editar");
  return (
    <>
      <Link href="/propostas" className="mb-2 inline-flex items-center gap-1 text-sm text-suave hover:text-texto">
        <ArrowLeft size={15} /> Propostas
      </Link>
      <PageHeader
        titulo="Padrões de proposta"
        descricao="O cliente com padrão já começa a proposta com as regras dele."
        somenteLeitura={podeEditar ? null : "Você pode ver os padrões, mas não editar."}
      />
      <PadroesDeProposta padroesIniciais={JSON.parse(JSON.stringify(padroes))} podeEditar={podeEditar} />
    </>
  );
}

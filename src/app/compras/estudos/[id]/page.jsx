import { notFound } from "next/navigation";

import RelatorioDoEstudo from "@/components/compras/estudos/RelatorioDoEstudo";
import { SetaParaLista } from "@/components/ui/ListaLembrada";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { lerEstudo } from "@/lib/estudos/banco";

export const metadata = { title: "Estudo de viabilidade | Sistema Rise" };
export const dynamic = "force-dynamic";

/** O relatorio de um estudo de viabilidade (spec 2026-11-12). */
export default async function EstudoPage({ params }) {
  const acesso = await exigirAcessoNaPagina("tela.compras.estudos", "ver");
  if (!acesso.pode("dado.custo", "ver") || !acesso.pode("dado.concorrentes", "ver")) notFound();
  const { id } = await params;
  const estudo = await lerEstudo(id);
  if (!estudo) notFound();

  return (
    <>
      <PageHeader titulo={estudo.nome} voltar={<SetaParaLista caminho="/compras/estudos" rotulo="Voltar aos estudos" />} />
      <RelatorioDoEstudo estudo={estudo} podeEditar={acesso.pode("tela.compras.estudos", "editar")} />
    </>
  );
}

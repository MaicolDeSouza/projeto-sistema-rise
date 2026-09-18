import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/lib/db";
import { PARCEIROS } from "@/lib/cadastros";
import PageHeader from "@/components/ui/PageHeader";
import AvisoBanco from "@/components/ui/AvisoBanco";
import FormularioCliente from "@/components/cadastros/FormularioCliente";
import FormularioParceiro from "@/components/cadastros/FormularioParceiro";

export const dynamic = "force-dynamic";

export default async function NovoCadastroPage({ params }) {
  const { tipo } = await params;
  const config = PARCEIROS[tipo];
  if (!config && tipo !== "clientes") notFound();

  let fontes = [];
  let transportadoras = [];
  let condicoes = [];
  let erro = null;

  try {
    if (tipo === "clientes") {
      [transportadoras, condicoes] = await Promise.all([
        prisma.transportadora.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
        prisma.condicaoPagamento.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
      ]);
    } else if (config.tiposDeFonte.length > 0) {
      fontes = await prisma.fonteColeta.findMany({
        where: { tipo: { in: config.tiposDeFonte } },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true, dominio: true },
      });
    }
  } catch (excecao) {
    erro = excecao;
  }

  const plural = tipo === "clientes" ? "Clientes" : config.plural;
  const titulo = tipo === "clientes" ? "Novo cliente" : `${config.novo} ${config.singular}`;

  return (
    <>
      <Link
        href={`/cadastros/${tipo}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-suave hover:text-texto"
      >
        <ArrowLeft size={15} />
        Voltar para {plural}
      </Link>

      <PageHeader titulo={titulo} />

      {erro ? (
        <AvisoBanco erro={erro} />
      ) : tipo === "clientes" ? (
        <FormularioCliente
          cliente={null}
          transportadoras={transportadoras}
          condicoes={condicoes}
          // Data de hoje calculada AQUI, no servidor, e nao no navegador: a mesma
          // conta nos dois lados perto da meia-noite daria datas diferentes e a
          // hidratacao reclamaria.
          hoje={new Date().toLocaleDateString("sv-SE")}
        />
      ) : (
        <FormularioParceiro slug={tipo} parceiro={null} fontes={fontes} usos={0} />
      )}
    </>
  );
}

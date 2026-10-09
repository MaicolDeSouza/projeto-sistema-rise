import Link from "next/link";
import { Copy } from "lucide-react";

import PageHeader from "@/components/ui/PageHeader";
import FormularioProduto from "@/components/produtos/FormularioProduto";
import { listarFornecedores } from "@/app/produtos/acoes";
import { carregarProdutoParaFormulario, dadosParaClone } from "@/lib/produtoParaFormulario";

export const dynamic = "force-dynamic";

// Sem a linha "Voltar para produtos" e sem a descricao (pedido do dono em 21/09/2026: a area de cima
// ocupava espaco a toa). A seta ao lado do titulo volta para a lista.
//
// `?clonar=<id>` e o "Clonar" dos 3 pontinhos da lista (pedido do dono em 09/10/2026): o mesmo cadastro
// novo, ja preenchido com o produto de origem (ver `dadosParaClone`). Id que nao existe abre o cadastro vazio.
export default async function NovoProdutoPage({ searchParams }) {
  const { clonar } = (await searchParams) ?? {};
  const original = typeof clonar === "string" && clonar ? await carregarProdutoParaFormulario(clonar) : null;
  const clone = original ? dadosParaClone(original) : null;
  const catalogoFornecedores = clone ? await listarFornecedores() : [];

  return (
    <>
      <PageHeader titulo="Novo produto" voltarPara="/produtos" voltarRotulo="Voltar para produtos" />

      {clone && (
        <p className="mb-4 flex flex-wrap items-center gap-1.5 rounded border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <Copy size={15} className="shrink-0" />
          Clonado a partir de
          <Link href={`/produtos/${clone.origem.id}`} className="font-mono font-medium underline hover:text-acento">
            {clone.origem.sku}
          </Link>
          <span className="min-w-0 truncate">· {clone.origem.titulo}</span>
          <span className="w-full text-xs text-sky-800">
            Informe o código do produto novo e confira o GTIN/EAN: o Rise não aceita o mesmo EAN em dois produtos.
          </span>
        </p>
      )}

      <FormularioProduto
        key={clone?.origem.id ?? "novo"}
        produto={null}
        clone={clone}
        catalogoFornecedores={catalogoFornecedores}
      />
    </>
  );
}

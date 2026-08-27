import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import PageHeader from "@/components/ui/PageHeader";
import FormularioProduto from "@/components/produtos/FormularioProduto";

export default function NovoProdutoPage() {
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
        titulo="Novo produto"
        descricao="Cadastre o produto uma vez. Todos os canais derivam deste cadastro."
      />

      <FormularioProduto produto={null} />
    </>
  );
}

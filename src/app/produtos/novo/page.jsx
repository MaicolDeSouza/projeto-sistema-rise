import PageHeader from "@/components/ui/PageHeader";
import FormularioProduto from "@/components/produtos/FormularioProduto";

// Sem a linha "Voltar para produtos" e sem a descricao (pedido do dono em 21/09/2026: a area de cima
// ocupava espaco a toa). A seta ao lado do titulo volta para a lista.
export default function NovoProdutoPage() {
  return (
    <>
      <PageHeader titulo="Novo produto" voltarPara="/produtos" voltarRotulo="Voltar para produtos" />

      <FormularioProduto produto={null} />
    </>
  );
}

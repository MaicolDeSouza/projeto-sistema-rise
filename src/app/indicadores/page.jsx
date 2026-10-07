import { Boxes } from "lucide-react";
import CartaoDeAtalho from "@/components/ui/CartaoDeAtalho";
import PageHeader from "@/components/ui/PageHeader";

export const metadata = { title: "Indicadores | Sistema Rise" };

export default function IndicadoresPage() {
  return (
    <>
      <PageHeader titulo="Indicadores" descricao="Acompanhe os números da sua loja." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <CartaoDeAtalho
          href="/indicadores/estoque"
          icone={Boxes}
          titulo="Estoque"
          descricao="Valor do estoque a custo e receita potencial do estoque."
          detalhe="Calculados a partir dos produtos cadastrados"
        />
      </div>
    </>
  );
}

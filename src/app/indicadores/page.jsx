import { Boxes } from "lucide-react";
import CartaoDeAtalho from "@/components/ui/CartaoDeAtalho";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";

export const metadata = { title: "Indicadores | Sistema Rise" };

export default async function IndicadoresPage() {
  // Acessos: o bloco em ver, e o cartao de Estoque so para quem ve a sub-tela.
  const { pode } = await exigirAcessoNaPagina("tela.indicadores", "ver");

  return (
    <>
      <PageHeader titulo="Indicadores" descricao="Acompanhe os números da sua loja." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pode("tela.indicadores.estoque", "ver") && (
        <CartaoDeAtalho
          href="/indicadores/estoque"
          icone={Boxes}
          titulo="Estoque"
          descricao="Valor do estoque a custo e receita potencial do estoque."
          detalhe="Calculados a partir dos produtos cadastrados"
        />
        )}
      </div>
    </>
  );
}

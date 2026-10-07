import CartaoDeAtalho from "@/components/ui/CartaoDeAtalho";
import PageHeader from "@/components/ui/PageHeader";
import { CANAIS_DE_VENDA } from "@/lib/canaisDeVenda/catalogo";

export const metadata = { title: "Canais de Venda | Sistema Rise" };

/**
 * Pagina do bloco Canais de Venda: uma grade de cartoes, um por canal, no desenho de
 * Ferramentas e de Cadastros. A barra lateral so tem o icone e o texto; a lista dos canais
 * mora aqui. Canal sem tela ainda (`emBreve`) aparece, mas nao e clicavel.
 */
export default function CanaisDeVendaPage() {
  return (
    <>
      <PageHeader titulo="Canais de Venda" descricao="Crie e gerencie anúncios por canal. Escolha um para abrir." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {CANAIS_DE_VENDA.map((canal) => (
          <CartaoDeAtalho
            key={canal.href}
            href={canal.href}
            icone={canal.icone}
            titulo={canal.rotulo}
            descricao={canal.resumo}
            detalhe={canal.detalhe}
            emBreve={canal.emBreve}
          />
        ))}
      </div>
    </>
  );
}

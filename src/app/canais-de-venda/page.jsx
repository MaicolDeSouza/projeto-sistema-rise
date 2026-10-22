import CartaoDeAtalho from "@/components/ui/CartaoDeAtalho";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { CANAIS_DE_VENDA } from "@/lib/canaisDeVenda/catalogo";

export const metadata = { title: "Canais de Venda | Sistema Rise" };

/**
 * Pagina do bloco Canais de Venda: uma grade de cartoes, um por canal, no desenho de
 * Ferramentas e de Cadastros. A barra lateral so tem o icone e o texto; a lista dos canais
 * mora aqui. Canal sem tela ainda (`emBreve`) aparece, mas nao e clicavel.
 */
export default async function CanaisDeVendaPage() {
  // Acessos: o bloco em ver, e so os cartoes dos canais que a pessoa ve (o "em breve" nao tem tela e fica).
  const { pode } = await exigirAcessoNaPagina("tela.canaisDeVenda", "ver");
  const canais = CANAIS_DE_VENDA.filter((canal) => !canal.recurso || pode(canal.recurso, "ver"));

  return (
    <>
      <PageHeader titulo="Canais de Venda" descricao="Crie e gerencie anúncios por canal. Escolha um para abrir." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {canais.map((canal) => (
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

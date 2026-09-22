import CartaoDeAtalho from "@/components/ui/CartaoDeAtalho";
import PageHeader from "@/components/ui/PageHeader";
import { SECOES_DE_CADASTROS } from "@/lib/secoesDeCadastros";

export const metadata = { title: "Cadastros | Sistema Rise" };

/**
 * Pagina do bloco Cadastros: uma grade de cartoes, um por secao, no mesmo desenho
 * de Ferramentas (pedido do dono em 21/09/2026). A barra lateral so tem o icone e
 * o texto "Cadastros", sem cascata: a lista das secoes mora aqui, e cada tela tem
 * um link "← Cadastros" para voltar.
 *
 * Ate 21/09/2026 esta rota so redirecionava para Clientes, e as secoes eram
 * subitens em cascata na barra lateral.
 */
export default function CadastrosPage() {
  return (
    <>
      <PageHeader titulo="Cadastros" descricao="Escolha o que cadastrar." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SECOES_DE_CADASTROS.map((secao) => (
          <CartaoDeAtalho
            key={secao.href}
            href={secao.href}
            icone={secao.icone}
            titulo={secao.rotulo}
            descricao={secao.resumo}
            detalhe={secao.detalhe}
          />
        ))}
      </div>
    </>
  );
}

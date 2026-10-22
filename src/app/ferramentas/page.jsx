import CartaoDeAtalho from "@/components/ui/CartaoDeAtalho";
import PageHeader from "@/components/ui/PageHeader";
import { FERRAMENTAS } from "@/lib/ferramentas/catalogo";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";

export const metadata = { title: "Ferramentas | Sistema Rise" };

/**
 * Pagina do bloco Ferramentas: uma grade de cartoes, um por ferramenta. A barra
 * lateral so tem o icone e o texto "Ferramentas" (sem submenu em cascata): a
 * lista das ferramentas mora aqui. Teste de desenho pedido pelo dono em
 * 20/09/2026; se ficar bom, vira o padrao das paginas de bloco.
 */
export default async function FerramentasPage() {
  // Acessos: o bloco em ver, e so os cartoes das ferramentas que a pessoa ve.
  const { pode } = await exigirAcessoNaPagina("tela.ferramentas", "ver");
  const ferramentas = FERRAMENTAS.filter((ferramenta) => pode(ferramenta.recurso, "ver"));

  return (
    <>
      <PageHeader titulo="Ferramentas" descricao="Utilitários do dia a dia. Escolha uma para abrir." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ferramentas.map((ferramenta) => (
          <CartaoDeAtalho
            key={ferramenta.href}
            href={ferramenta.href}
            icone={ferramenta.icone}
            titulo={ferramenta.rotulo}
            descricao={ferramenta.resumo}
            detalhe={ferramenta.detalhe}
          />
        ))}
      </div>
    </>
  );
}

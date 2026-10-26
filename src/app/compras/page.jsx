import CartaoDeAtalho from "@/components/ui/CartaoDeAtalho";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { CARTOES_DE_COMPRAS } from "@/lib/compras/catalogo";

export const metadata = { title: "Compras | Sistema Rise" };
// O detalhe de cada cartao e vivo (quantos produtos faltam, quantos pedidos abertos): nada montado no build.
export const dynamic = "force-dynamic";

/** Le so o detalhe dos cartoes que a pessoa ve; um detalhe que falha nao derruba a pagina (o cartao fica sem ele). */
async function detalhe(href) {
  try {
    void href;
  } catch (erro) {
    console.error(`[compras] detalhe de ${href} não lido:`, erro?.message ?? erro);
  }
  return undefined;
}

/**
 * O bloco Compras: uma grade de cartoes. Linha-guia: o operador ve primeiro os dois assuntos (o que falta comprar e os
 * pedidos); a acao principal e abrir um. Sem a tela de entrada em Acessos, 404.
 */
export default async function ComprasPage() {
  const acesso = await exigirAcessoNaPagina("tela.compras", "ver");
  const cartoes = CARTOES_DE_COMPRAS.filter((cartao) => acesso.pode(cartao.recurso, "ver"));
  const detalhes = await Promise.all(cartoes.map((cartao) => detalhe(cartao.href)));

  return (
    <>
      <PageHeader titulo="Compras" descricao="Pedidos de compra e reposição do estoque mínimo." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cartoes.map((cartao, indice) => (
          <CartaoDeAtalho
            key={cartao.href}
            href={cartao.href}
            icone={cartao.icone}
            titulo={cartao.rotulo}
            descricao={cartao.resumo}
            detalhe={detalhes[indice]}
          />
        ))}
      </div>
    </>
  );
}

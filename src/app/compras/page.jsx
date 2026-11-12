import CartaoDeAtalho from "@/components/ui/CartaoDeAtalho";
import GradeDeCartoes from "@/components/ui/GradeDeCartoes";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { contarAbaixoDoMinimo, contarPedidosPorStatus } from "@/lib/compras/banco";
import { CARTOES_DE_COMPRAS } from "@/lib/compras/catalogo";
import { contarEstudos } from "@/lib/estudos/banco";

export const metadata = { title: "Compras | Sistema Rise" };
// O detalhe de cada cartao e vivo (quantos produtos faltam, quantos pedidos abertos): nada montado no build.
export const dynamic = "force-dynamic";

/** Le so o detalhe dos cartoes que a pessoa ve; um detalhe que falha nao derruba a pagina (o cartao fica sem ele). */
async function detalhe(href) {
  try {
    if (href === "/compras/estoque-minimo") {
      const total = await contarAbaixoDoMinimo();
      return total === 0 ? "Nada abaixo do mínimo" : `${total} ${total === 1 ? "produto" : "produtos"}`;
    }
    if (href === "/compras/pedidos") {
      const contagem = await contarPedidosPorStatus();
      const partes = [
        [contagem.RASCUNHO, "rascunho", "rascunhos"],
        [contagem.ENVIADO + contagem.PARCIAL, "a caminho", "a caminho"],
      ]
        .filter(([quantos]) => quantos > 0)
        .map(([quantos, um, varios]) => `${quantos} ${quantos === 1 ? um : varios}`);
      return partes.length ? partes.join(" · ") : "Nenhum pedido aberto";
    }
    if (href === "/compras/estudos") {
      const contagem = await contarEstudos();
      const fila = contagem.NA_FILA ?? 0;
      const feitos = contagem.CONCLUIDO ?? 0;
      if (!fila && !feitos) return "Nenhum estudo";
      return [fila ? `${fila} na fila` : null, feitos ? `${feitos} ${feitos === 1 ? "concluído" : "concluídos"}` : null].filter(Boolean).join(" · ");
    }
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
  // O estudo de viabilidade mostra custo e preco de concorrente: o cartao so aparece com os dois (senao a tela da 404).
  const veEstudos = acesso.pode("dado.custo", "ver") && acesso.pode("dado.concorrentes", "ver");
  const cartoes = CARTOES_DE_COMPRAS.filter((cartao) => acesso.pode(cartao.recurso, "ver") && (cartao.recurso !== "tela.compras.estudos" || veEstudos));
  const detalhes = await Promise.all(cartoes.map((cartao) => detalhe(cartao.href)));

  return (
    <>
      <PageHeader titulo="Compras" descricao="Pedidos de compra e reposição do estoque mínimo." />

      <GradeDeCartoes pagina="compras" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
      </GradeDeCartoes>
    </>
  );
}

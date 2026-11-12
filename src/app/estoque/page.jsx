import { Boxes, Factory } from "lucide-react";
import GradeDeCartoes from "@/components/ui/GradeDeCartoes";

import CartaoDeAtalho from "@/components/ui/CartaoDeAtalho";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { contarPorSituacao } from "@/lib/producao/banco";

export const metadata = { title: "Estoque | Sistema Rise" };
// O detalhe do cartao e vivo (quantas ordens abertas): nada montado no build.
export const dynamic = "force-dynamic";

/** Le o detalhe do cartao; falha nao derruba a pagina (o cartao fica sem ele). */
async function detalheDasOrdens() {
  try {
    const contagem = await contarPorSituacao();
    const partes = [
      [contagem.ABERTA, "aberta", "abertas"],
      [contagem.EM_PRODUCAO, "em produção", "em produção"],
    ]
      .filter(([quantas]) => quantas > 0)
      .map(([quantas, uma, varias]) => `${quantas} ${quantas === 1 ? uma : varias}`);
    return partes.length ? partes.join(" · ") : "Nenhuma ordem aberta";
  } catch (erro) {
    console.error("[estoque] detalhe das ordens não lido:", erro?.message ?? erro);
    return undefined;
  }
}

/**
 * O bloco Estoque: uma grade de cartoes, como Compras. Hoje so as ordens de producao (26/10/2026); o resto do bloco
 * (saldo e movimentacoes) continua por fazer.
 */
export default async function EstoquePage() {
  const acesso = await exigirAcessoNaPagina("tela.estoque", "ver");
  const veOrdens = acesso.pode("tela.estoque.producao", "ver");
  const veMapa = acesso.pode("tela.estoque.mapa", "ver");

  return (
    <>
      <PageHeader titulo="Estoque" descricao="Ordens de produção e o mapa das prateleiras." />
      <GradeDeCartoes pagina="estoque" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {veOrdens && (
          <CartaoDeAtalho
            href="/estoque/producao"
            icone={Factory}
            titulo="Ordens de produção"
            descricao="Dar baixa nas peças e lançar o produto montado."
            detalhe={await detalheDasOrdens()}
          />
        )}
        {veMapa && (
          <CartaoDeAtalho href="/estoque/mapa" icone={Boxes} titulo="Mapa do estoque" descricao="As prateleiras e as caixinhas dos três estoques, em 3D." />
        )}
      </GradeDeCartoes>
    </>
  );
}

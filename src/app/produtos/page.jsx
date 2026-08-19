import { Package } from "lucide-react";

import { prisma } from "@/lib/db";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import AvisoBanco from "@/components/ui/AvisoBanco";

export const dynamic = "force-dynamic";

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Decimal do Prisma nao e um number — converta antes de formatar. */
function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return "—";
  return moeda.format(Number(valor));
}

export default async function ProdutosPage() {
  let produtos = null;
  let erro = null;

  try {
    produtos = await prisma.produto.findMany({
      orderBy: { criadoEm: "desc" },
      include: { _count: { select: { imagens: true, anuncios: true } } },
    });
  } catch (excecao) {
    erro = excecao;
  }

  return (
    <>
      <PageHeader
        titulo="Produtos"
        descricao="Catalogo central da loja. Cada anuncio publicado nos canais deriva de um produto daqui."
      />

      {erro && <AvisoBanco erro={erro} />}

      {!erro && produtos.length === 0 && (
        <EmptyState
          icone={Package}
          titulo="Nenhum produto cadastrado"
          descricao="Rode `npm run seed` para carregar produtos de exemplo, ou aguarde o bloco Criar Anuncios para cadastrar produtos pelo sistema."
        />
      )}

      {!erro && produtos.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
          <table className="w-full text-sm">
            <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="px-4 py-3 font-medium">Marca</th>
                <th className="px-4 py-3 text-right font-medium">Custo</th>
                <th className="px-4 py-3 text-right font-medium">Preco</th>
                <th className="px-4 py-3 text-right font-medium">Estoque</th>
                <th className="px-4 py-3 font-medium">Anuncios</th>
                <th className="px-4 py-3 font-medium">Situacao</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {produtos.map((produto) => (
                <tr key={produto.id} className="hover:bg-fundo/60">
                  <td className="px-4 py-3 font-mono text-xs">{produto.sku}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{produto.tituloBase}</p>
                    <p className="text-xs text-suave">
                      {produto._count.imagens} imagem(ns)
                      {produto.ean ? ` · EAN ${produto.ean}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-suave">
                    {produto.marca ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatarMoeda(produto.custo)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {formatarMoeda(produto.precoVenda)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {produto.estoque}
                  </td>
                  <td className="px-4 py-3 text-suave">
                    {produto._count.anuncios}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tom={produto.ativo ? "sucesso" : "neutro"}>
                      {produto.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

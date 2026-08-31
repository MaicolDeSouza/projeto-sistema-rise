import Link from "next/link";
import { Package, Plus } from "lucide-react";

import { prisma } from "@/lib/db";
import { CANAIS, separarCanais } from "@/lib/canais";
import { urlDe } from "@/lib/arquivos";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import AvisoBanco from "@/components/ui/AvisoBanco";
import CampoBusca from "@/components/ui/CampoBusca";
import LinhaProduto from "@/components/produtos/LinhaProduto";

export const dynamic = "force-dynamic";

export default async function ProdutosPage({ searchParams }) {
  const params = await searchParams;
  const busca = (params?.q ?? "").trim();

  let produtos = null;
  let erro = null;

  try {
    produtos = await prisma.produto.findMany({
      where: busca
        ? {
            OR: [
              { tituloBase: { contains: busca, mode: "insensitive" } },
              { sku: { contains: busca, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { atualizadoEm: "desc" },
      include: {
        arquivos: {
          where: { tipo: "IMAGEM" },
          orderBy: { ordem: "asc" },
          take: 1,
        },
        anuncios: {
          select: {
            canal: true,
            status: true,
            situacaoCanal: true,
            idExterno: true,
          },
        },
      },
    });
  } catch (excecao) {
    erro = excecao;
  }

  // Decimal do Prisma nao atravessa a fronteira servidor/cliente: converta aqui.
  const linhas = (produtos ?? []).map((produto) => ({
    produto: {
      id: produto.id,
      sku: produto.sku,
      tituloBase: produto.tituloBase,
      localizacao: produto.localizacao,
      precoVenda: produto.precoVenda ? Number(produto.precoVenda) : null,
      estoque: produto.estoque,
      ativo: produto.ativo,
      imagemUrl: produto.arquivos[0]
        ? urlDe(produto.sku, "IMAGEM", produto.arquivos[0].arquivo)
        : null,
    },
    ...separarCanais(produto.anuncios),
  }));

  return (
    <>
      <PageHeader
        titulo="Produtos"
        descricao="O cadastro base da loja. Todo anuncio nos canais deriva de um produto daqui."
        acao={
          <Link
            href="/produtos/novo"
            className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={16} />
            Novo produto
          </Link>
        }
      />

      {erro && <AvisoBanco erro={erro} />}

      {!erro && (
        <>
          <CampoBusca valorInicial={busca} rotulo="Buscar por nome ou codigo" />

          {linhas.length === 0 ? (
            <EmptyState
              icone={Package}
              titulo={
                busca
                  ? `Nenhum produto encontrado para "${busca}"`
                  : "Nenhum produto cadastrado"
              }
              descricao={
                busca
                  ? "Tente outro termo, ou limpe a busca para ver o catalogo inteiro."
                  : "Cadastre o primeiro produto para comecar."
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
              <table className="w-full text-sm">
                <thead className="border-b border-borda bg-fundo text-center text-xs tracking-wide text-suave uppercase">
                  <tr className="divide-x divide-borda">
                    <th className="px-3 py-2.5 font-medium">Imagem</th>
                    <th className="px-3 py-2.5 font-medium">Nome</th>
                    <th className="px-3 py-2.5 font-medium">Codigo</th>
                    <th className="px-3 py-2.5 font-medium">Localizacao</th>
                    <th className="px-3 py-2.5 font-medium">Preco</th>
                    <th className="px-3 py-2.5 font-medium">Estoque</th>
                    <th className="px-3 py-2.5 font-medium">Canais</th>
                    <th className="w-10 px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {linhas.map(({ produto, integrados, pendentes }) => (
                    <LinhaProduto
                      key={produto.id}
                      produto={produto}
                      integrados={integrados}
                      pendentes={pendentes}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-xs text-suave">
            {linhas.length} produto(s) · Canais previstos:{" "}
            {CANAIS.map((canal) => canal.nome).join(", ")}
          </p>
        </>
      )}
    </>
  );
}

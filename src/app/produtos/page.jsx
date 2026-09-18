import Link from "next/link";
import { Plus } from "lucide-react";

import { prisma } from "@/lib/db";
import { CANAIS, separarCanais } from "@/lib/canais";
import { urlDe } from "@/lib/arquivos";
import PageHeader from "@/components/ui/PageHeader";
import AvisoBanco from "@/components/ui/AvisoBanco";
import TabelaProdutos from "@/components/produtos/TabelaProdutos";
import BotaoImportarBling from "@/components/produtos/BotaoImportarBling";

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
          <div className="flex items-start gap-3">
            <BotaoImportarBling />
            <Link
              href="/produtos/novo"
              className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Plus size={16} />
              Novo produto
            </Link>
          </div>
        }
      />

      {erro && <AvisoBanco erro={erro} />}

      {!erro && (
        <>
          <TabelaProdutos linhas={linhas} busca={busca} />

          <p className="mt-3 text-xs text-suave">
            {linhas.length} produto(s) · Canais previstos:{" "}
            {CANAIS.map((canal) => canal.nome).join(", ")}
          </p>
        </>
      )}
    </>
  );
}

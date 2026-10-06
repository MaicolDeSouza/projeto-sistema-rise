import Link from "next/link";
import { Plus } from "lucide-react";

import { prisma } from "@/lib/db";
import { CANAIS, separarCanais } from "@/lib/canais";
import { urlDe } from "@/lib/arquivos";
import { estadoDoIconeML } from "@/lib/canaisDeVenda/ml/icone";
import { INCLUDE_DO_ICONE_BLING, iconeBlingDoProduto } from "@/lib/blingSync/estado";
import PageHeader from "@/components/ui/PageHeader";
import AvisoBanco from "@/components/ui/AvisoBanco";
import Paginacao from "@/components/mercados/Paginacao";
import TabelaProdutos from "@/components/produtos/TabelaProdutos";
import BotaoImportarBling from "@/components/produtos/BotaoImportarBling";
import BotaoSincronizarEstoque from "@/components/produtos/BotaoSincronizarEstoque";

export const dynamic = "force-dynamic";

/// 25 por pagina (pedido do dono em 22/09/2026, mesmo padrao paginado de
/// Mercados): 1.316 produtos numa tabela so ficaram pesados de renderizar e de
/// interagir — cada clique (ordenar, marcar Conferido) esperava a lista
/// inteira redesenhar.
const POR_PAGINA = 25;

/// Coluna -> campo do Prisma. So as marcadas pelo dono em 22/09/2026 (Codigo,
/// Localizacao, Preco, Estoque); as demais (Imagem, Nome, Conferido, Canais)
/// nao tem ordenacao propria.
const CAMPO_DE_ORDENACAO = {
  codigo: "sku",
  localizacao: "localizacao",
  preco: "precoVenda",
  estoque: "estoque",
};

export default async function ProdutosPage({ searchParams }) {
  const params = await searchParams;
  const busca = (params?.q ?? "").trim();
  const ordenar = CAMPO_DE_ORDENACAO[params?.ordenar] ? params.ordenar : "";
  const direcao = params?.direcao === "asc" ? "asc" : "desc";
  const pedida = Number.parseInt(params?.pagina ?? "1", 10);

  const where = busca
    ? {
        OR: [
          { tituloBase: { contains: busca, mode: "insensitive" } },
          { sku: { contains: busca, mode: "insensitive" } },
        ],
      }
    : undefined;

  // Ordenar no banco ANTES de paginar, e nao so na pagina carregada: senao
  // "ordenar por preco" so organizaria os 25 produtos que ja estavam na tela,
  // sem tocar nos outros 1.291 (pedido do dono em 22/09/2026 — o filtro/
  // ordenacao tem que valer para o acervo inteiro).
  const orderBy = ordenar
    ? { [CAMPO_DE_ORDENACAO[ordenar]]: direcao }
    : { atualizadoEm: "desc" };

  let produtos = null;
  let total = 0;
  let totalConferidos = 0;
  let pagina = 1;
  let totalPaginas = 1;
  let erro = null;

  try {
    total = await prisma.produto.count({ where });
    totalConferidos = await prisma.produto.count({ where: { ...where, conferido: true } });

    totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    // Pagina fora do intervalo (link velho, ou lista que encolheu com a busca)
    // cai na ultima valida, em vez de tabela vazia (mesma regra de Mercados).
    pagina = Math.min(Math.max(Number.isFinite(pedida) ? pedida : 1, 1), totalPaginas);

    produtos = await prisma.produto.findMany({
      where,
      orderBy,
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      include: {
        arquivos: {
          where: { tipo: "IMAGEM", papel: "FOTO" },
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
        // Para o icone do Bling: os fornecedores (entram na assinatura dos campos) e quantos
        // ajustes de estoque ainda nao foram ao Bling. So banco: a lista nao chama o Bling.
        ...INCLUDE_DO_ICONE_BLING,
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
      // So para a margem do popup de preco: o custo do cadastro e, na falta dele, o
      // do rascunho do Bling (e la que esta o custo da maioria dos produtos importados).
      custo: produto.custo
        ? Number(produto.custo)
        : Number(produto.fornecedorRascunho?.precoCusto) > 0
          ? Number(produto.fornecedorRascunho.precoCusto)
          : null,
      estoque: produto.estoque,
      ativo: produto.ativo,
      conferido: produto.conferido,
      imagemUrl: produto.arquivos[0]
        ? urlDe(produto.sku, "IMAGEM", produto.arquivos[0].arquivo)
        : null,
    },
    ...separarCanais(produto.anuncios),
    // O icone do ML mostra o anuncio (publicado e ativo, ou pendente), nao so o idExterno.
    iconeML: estadoDoIconeML(produto.anuncios),
    // Cor e selo do icone do Bling, calculados aqui (a assinatura usa node:crypto, so servidor).
    iconeBling: iconeBlingDoProduto(produto),
  }));

  return (
    <>
      <PageHeader
        titulo="Produtos"
        descricao="O cadastro base da loja. Todo anuncio nos canais deriva de um produto daqui."
        acao={
          <div className="flex items-start gap-3">
            <BotaoImportarBling />
            <BotaoSincronizarEstoque />
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
          <TabelaProdutos
            linhas={linhas}
            busca={busca}
            ordenar={ordenar}
            direcao={direcao}
            pagina={pagina}
            totalPaginas={totalPaginas}
            total={total}
            totalConferidos={totalConferidos}
          />

          {/* Repete embaixo (mesmo motivo de Mercados): quem rolou a pagina
              inteira nao devia ter que voltar ao topo so para "Proxima". */}
          {linhas.length > 0 && (
            <div className="border-t border-borda">
              <Paginacao
                pagina={pagina}
                totalPaginas={totalPaginas}
                primeiro={(pagina - 1) * POR_PAGINA + 1}
                ultimo={(pagina - 1) * POR_PAGINA + linhas.length}
                total={total}
              />
            </div>
          )}

          <p className="mt-3 text-xs text-suave">
            {total} produto(s) · Canais previstos:{" "}
            {CANAIS.map((canal) => canal.nome).join(", ")}
          </p>
        </>
      )}
    </>
  );
}

import Link from "next/link";
import { Wallet, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/db";
import { calcularIndicadoresEstoque, custoDoCadastro, formatarReais } from "@/lib/indicadores/estoque";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import AvisoBanco from "@/components/ui/AvisoBanco";

export const metadata = { title: "Indicadores de estoque | Sistema Rise" };
export const dynamic = "force-dynamic";

export default async function IndicadoresEstoquePage() {
  let indicadores = null;
  let erro = null;
  try {
    // Todos os produtos, sem a paginacao ou os filtros da tela de Produtos.
    const produtos = await prisma.produto.findMany({
      select: {
        estoque: true,
        // O kit fica fora das somas (o estoque dele e o das pecas): ver `calcularIndicadoresEstoque`.
        tipo: true,
        precoVenda: true,
        fornecedorRascunho: true,
        fornecedores: {
          select: { padrao: true, precoCusto: true },
          orderBy: { criadoEm: "asc" },
        },
      },
    });
    indicadores = calcularIndicadoresEstoque(produtos.map((produto) => ({
      ...produto,
      custo: custoDoCadastro(produto),
    })));
  } catch (excecao) {
    erro = excecao;
  }

  const cards = indicadores ? [
    {
      titulo: "Valor do estoque a custo",
      valor: indicadores.custo,
      descricao: "Capital aplicado nas mercadorias, com base no custo do fornecedor padrão ou no custo importado do Bling exibido no cadastro.",
      formula: "Soma da quantidade em estoque x custo unitário de cada produto.",
      faltantes: indicadores.semCusto,
      campo: "custo",
      icone: Wallet,
    },
    {
      titulo: "Receita potencial do estoque",
      valor: indicadores.receita,
      descricao: "Receita bruta estimada se todo o estoque for vendido pelos preços cadastrados.",
      formula: "Soma da quantidade em estoque x preço de venda de cada produto.",
      faltantes: indicadores.semPreco,
      campo: "preço de venda",
      icone: TrendingUp,
    },
  ] : [];

  return (
    <>
      <PageHeader
        titulo="Estoque"
        descricao="Valoração do estoque a partir dos produtos da loja."
        voltarPara="/indicadores"
        voltarRotulo="Voltar para Indicadores"
        acao={<Link href="/produtos" className="text-sm text-acento hover:underline">Ver produtos</Link>}
      />
      {erro ? <AvisoBanco erro={erro} /> : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {cards.map(({ titulo, valor, descricao, formula, faltantes, campo, icone: Icone }) => (
              <Card key={titulo}>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-medium">{titulo}</h2>
                  <Icone size={20} className="shrink-0 text-acento" aria-hidden="true" />
                </div>
                <p className="mt-3 break-words text-3xl font-semibold tabular-nums">{formatarReais(valor)}</p>
                <p className="mt-2 text-sm text-suave">{descricao}</p>
                <p className="mt-3 text-xs text-suave">{formula}</p>
                {faltantes > 0 && (
                  <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    Total parcial: {faltantes} produto(s) com estoque sem {campo} cadastrado não entram neste valor.
                  </p>
                )}
              </Card>
            ))}
          </div>
          <div className="mt-5 space-y-2 text-sm text-suave">
            <p>{indicadores.produtosComEstoque.toLocaleString("pt-BR")} produtos com estoque positivo · {indicadores.unidades.toLocaleString("pt-BR")} unidades.</p>
            {indicadores.produtosComEstoque === 0 && <p>Nenhum produto com estoque positivo no momento.</p>}
            <p>Inclui produtos ativos e inativos com saldo positivo. Saldos zerados ou negativos não compõem os valores.</p>
            <p>
              Produtos com composição (kits) ficam de fora: o estoque deles é calculado pelas peças, que já estão na soma.
              {indicadores.kitsFora > 0 && ` ${indicadores.kitsFora.toLocaleString("pt-BR")} kit(s) com estoque não foram contados.`}
            </p>
            {indicadores.estoqueNegativo > 0 && <p className="text-amber-700">Há {indicadores.estoqueNegativo} produto(s) com saldo negativo. Confira os saldos em Produtos.</p>}
            <p>A receita potencial não é lucro: não desconta impostos, taxas, comissões, fretes ou outras despesas.</p>
            <p>Os valores são recalculados ao abrir ou recarregar esta página, usando os dados salvos em Produtos.</p>
          </div>
        </>
      )}
    </>
  );
}

import TabelaPedidos, { BotaoNovoPedido } from "@/components/compras/TabelaPedidos";
import Paginacao from "@/components/mercados/Paginacao";
import CampoBusca from "@/components/ui/CampoBusca";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { listarPedidos } from "@/lib/compras/banco";
import { prisma } from "@/lib/db";

export const metadata = { title: "Pedidos de compra | Sistema Rise" };
export const dynamic = "force-dynamic";

const STATUS = ["RASCUNHO", "ENVIADO", "PARCIAL", "FINALIZADO", "CANCELADO"];
const POR_PAGINA = 25;

export default async function PedidosPage({ searchParams }) {
  const acesso = await exigirAcessoNaPagina("tela.compras.pedidos", "ver");
  const params = await searchParams;
  const status = [params?.status ?? []].flat().filter((valor) => STATUS.includes(valor));
  const busca = typeof params?.q === "string" ? params.q : "";
  const paginaPedida = Math.max(1, Number.parseInt(params?.pagina, 10) || 1);

  const { linhas, total } = await listarPedidos({ status, busca, pagina: paginaPedida, porPagina: POR_PAGINA });
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(paginaPedida, totalPaginas);

  const podeEditar = acesso.pode("tela.compras.pedidos", "editar");
  const fornecedores = podeEditar
    ? await prisma.fornecedor
        .findMany({
          where: { ativo: true },
          orderBy: { nome: "asc" },
          select: { id: true, nome: true, pedidosDeCompra: { where: { status: "RASCUNHO" }, select: { id: true }, take: 1 } },
        })
        .then((lista) => lista.map((fornecedor) => ({ id: fornecedor.id, nome: fornecedor.nome, rascunho: fornecedor.pedidosDeCompra.length > 0 })))
    : [];

  return (
    <>
      <PageHeader
        titulo="Pedidos de compra"
        descricao={total === 1 ? "1 pedido." : `${total} pedidos.`}
        voltarPara="/compras"
        voltarRotulo="Voltar a Compras"
        acao={podeEditar ? <BotaoNovoPedido fornecedores={fornecedores} /> : null}
        somenteLeitura={podeEditar ? null : "Você pode ver os pedidos, mas não editar."}
      />
      <CampoBusca valorInicial={busca} rotulo="Buscar por número, fornecedor ou produto (código ou nome)" className="mb-3 max-w-sm" />
      <TabelaPedidos linhas={linhas} status={status} veCusto={acesso.pode("dado.custo", "ver")} podeExcluir={acesso.pode("tela.compras.pedidos", "excluir")} />
      {totalPaginas > 1 && (
        <div className="mt-4">
          <Paginacao
            pagina={pagina}
            totalPaginas={totalPaginas}
            total={total}
            primeiro={(pagina - 1) * POR_PAGINA + 1}
            ultimo={Math.min(pagina * POR_PAGINA, total)}
          />
        </div>
      )}
    </>
  );
}

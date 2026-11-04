import { ShoppingCart } from "lucide-react";

import FiltrosDePedidos from "@/components/pedidos/FiltrosDePedidos";
import { diaIso } from "@/components/pedidos/formato";
import TabelaPedidosDeVenda from "@/components/pedidos/TabelaPedidosDeVenda";
import { STATUS } from "@/components/pedidos/textos";
import NavegacaoDoTopo from "@/components/mercados/NavegacaoDoTopo";
import Paginacao from "@/components/mercados/Paginacao";
import AvisoBanco from "@/components/ui/AvisoBanco";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { listarPedidosDeVenda } from "@/lib/pedidos/banco";
import { porPaginaDaUrl } from "@/lib/porPagina";

export const metadata = { title: "Pedidos de venda | Sistema Rise" };
export const dynamic = "force-dynamic";

const CANAIS = ["BLING", "LOJA_INTEGRADA", "MERCADO_LIVRE"];
const ORDENACOES = ["canal", "numero", "data", "cliente", "total", "status", "lucro"];
const DIAS_PADRAO = 30;

const lista = (valor) => [valor ?? []].flat().map(String);
const umDe = (valor) => String((Array.isArray(valor) ? valor[0] : valor) ?? "").trim();
const ehDia = (texto) => /^\d{4}-\d{2}-\d{2}$/.test(texto);

/**
 * Pedidos de venda (spec 5.10): os pedidos do ML, da LI e do Bling que o worker le a cada 5 minutos. Nesta tela o
 * operador ve primeiro os pedidos que pedem acao e a acao principal e abrir o pedido. Periodo padrao: os ultimos 30
 * dias (`desde`/`ate` na URL, dias de Sao Paulo). O lucro so aparece para quem ve custo (`dado.custo`).
 */
export default async function PedidosDeVendaPage({ searchParams }) {
  const acesso = await exigirAcessoNaPagina("tela.pedidos", "ver");
  const params = await searchParams;

  const busca = umDe(params?.q);
  const hoje = new Date();
  const desde = ehDia(umDe(params?.desde)) ? umDe(params.desde) : diaIso(new Date(hoje.getTime() - DIAS_PADRAO * 24 * 60 * 60 * 1000));
  const ate = ehDia(umDe(params?.ate)) ? umDe(params.ate) : "";
  const canais = lista(params?.canal).filter((canal) => CANAIS.includes(canal));
  const status = lista(params?.status).filter((valor) => STATUS.includes(valor));
  const soComAviso = umDe(params?.aviso) === "1";
  const ordenar = ORDENACOES.includes(umDe(params?.ordenar)) ? umDe(params.ordenar) : "";
  const direcao = umDe(params?.direcao) === "asc" ? "asc" : "desc";
  const porPagina = porPaginaDaUrl(umDe(params?.por));
  const paginaPedida = Math.max(1, Number.parseInt(umDe(params?.pagina), 10) || 1);
  const veLucro = acesso.pode("dado.custo", "ver");

  let resultado = null;
  let erro = null;
  try {
    const filtro = {
      busca,
      // O dia inteiro de Sao Paulo nas duas pontas (o Brasil nao tem horario de verao: -03:00 o ano todo).
      desde: new Date(`${desde}T00:00:00.000-03:00`),
      ate: ate ? new Date(`${ate}T23:59:59.999-03:00`) : undefined,
      canais,
      status,
      soComAviso,
      ordenar: ordenar || undefined,
      direcao,
      porPagina,
    };
    resultado = await listarPedidosDeVenda({ ...filtro, pagina: paginaPedida });
    // Pagina alem do fim (link antigo, filtro que encolheu a lista): mostra a ultima que existe.
    const ultima = Math.max(1, Math.ceil(resultado.total / porPagina));
    if (paginaPedida > ultima) resultado = await listarPedidosDeVenda({ ...filtro, pagina: ultima });
  } catch (e) {
    erro = e;
  }

  const total = resultado?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const pagina = Math.min(paginaPedida, totalPaginas);
  const linhas = resultado?.linhas ?? [];
  const filtrando = Boolean(busca || canais.length || status.length || soComAviso || umDe(params?.desde) || ate);

  return (
    <>
      <PageHeader titulo="Pedidos de venda" descricao={total === 1 ? "1 pedido no período." : `${total} pedidos no período.`} />

      {erro && <AvisoBanco erro={erro} />}

      <FiltrosDePedidos
        busca={busca}
        desde={desde}
        ate={ate}
        canais={canais}
        status={status}
        soComAviso={soComAviso}
        navegacao={<NavegacaoDoTopo pagina={pagina} totalPaginas={totalPaginas} total={total} porPagina={porPagina} />}
      />

      {!erro && linhas.length === 0 ? (
        <EmptyState
          icone={ShoppingCart}
          titulo={filtrando ? "Nenhum pedido com esses filtros." : "Nenhum pedido lido ainda."}
          descricao={filtrando ? "Mude o período ou tire um filtro." : "O worker lê o ML, a LI e o Bling a cada 5 minutos."}
        />
      ) : (
        linhas.length > 0 && (
          <>
            <TabelaPedidosDeVenda linhas={linhas} ordenar={ordenar} direcao={direcao} veLucro={veLucro} />
            {totalPaginas > 1 && (
              <div className="mt-4">
                <Paginacao
                  pagina={pagina}
                  totalPaginas={totalPaginas}
                  total={total}
                  primeiro={(pagina - 1) * porPagina + 1}
                  ultimo={(pagina - 1) * porPagina + linhas.length}
                />
              </div>
            )}
          </>
        )
      )}
    </>
  );
}

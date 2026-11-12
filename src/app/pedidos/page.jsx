import { ShoppingCart } from "lucide-react";

import FiltrosDePedidos from "@/components/pedidos/FiltrosDePedidos";
import { diaIso } from "@/components/pedidos/formato";
import TabelaPedidosDeVenda from "@/components/pedidos/TabelaPedidosDeVenda";
import { SITUACOES, STATUS, TEXTO_DO_STATUS_DO_ENVIO } from "@/components/pedidos/textos";
import { moedaComSinal } from "@/components/pedidos/formato";
import NavegacaoDoTopo from "@/components/mercados/NavegacaoDoTopo";
import { LembrarLista } from "@/components/ui/ListaLembrada";
import Paginacao from "@/components/mercados/Paginacao";
import AvisoBanco from "@/components/ui/AvisoBanco";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import ResumoDosCanais from "@/components/pedidos/ResumoDosCanais";
import { contarEnviosDeHoje, listarPedidosDeVenda, opcoesDasColunas, resumoDaLista, resumoDosCanais } from "@/lib/pedidos/banco";
import { projetarLinhaDaLista } from "@/lib/pedidos/projecao";
import { porPaginaDaUrl } from "@/lib/porPagina";

export const metadata = { title: "Vendas | Sistema Rise" };
export const dynamic = "force-dynamic";

const CANAIS = ["BLING", "LOJA_INTEGRADA", "MERCADO_LIVRE"];
const ORDENACOES = ["canal", "numero", "data", "cliente", "total", "status", "lucro"];

const lista = (valor) => [valor ?? []].flat().map(String);
const umDe = (valor) => String((Array.isArray(valor) ? valor[0] : valor) ?? "").trim();
const ehDia = (texto) => /^\d{4}-\d{2}-\d{2}$/.test(texto);

/**
 * O mesmo dia do mes anterior ("2026-11-07" -> "2026-10-07"; 31/03 -> 28 ou 29/02): o inicio do periodo padrao de 1
 * mes (pedido do dono em 07/11/2026: "Por padrao de marcar inicio e fim em periodo de 1 mes").
 */
function umMesAntes(dia) {
  const [ano, mes, d] = dia.split("-").map(Number);
  const anoAntes = mes === 1 ? ano - 1 : ano;
  const mesAntes = mes === 1 ? 12 : mes - 1;
  const ultimoDia = new Date(Date.UTC(anoAntes, mesAntes, 0)).getUTCDate();
  return `${anoAntes}-${String(mesAntes).padStart(2, "0")}-${String(Math.min(d, ultimoDia)).padStart(2, "0")}`;
}

/**
 * Pedidos de venda (spec 5.10): os pedidos do ML, da LI e do Bling que o worker le a cada 5 minutos. Nesta tela o
 * operador ve primeiro os pedidos que pedem acao e a acao principal e abrir o pedido. Periodo padrao: os ultimos 30
 * dias (`desde`/`ate` na URL, dias de Sao Paulo). O lucro so aparece para quem ve custo (`dado.custo`).
 */
export default async function PedidosDeVendaPage({ searchParams }) {
  const acesso = await exigirAcessoNaPagina("tela.pedidos", "ver");
  const params = await searchParams;

  const busca = umDe(params?.q);
  // Periodo padrao: de hoje a 1 mes atras, as DUAS pontas preenchidas no calendario (o "ate" ficava em branco).
  const hoje = diaIso(new Date());
  const desde = ehDia(umDe(params?.desde)) ? umDe(params.desde) : umMesAntes(hoje);
  const ate = ehDia(umDe(params?.ate)) ? umDe(params.ate) : hoje;
  const canais = lista(params?.canal).filter((canal) => CANAIS.includes(canal));
  const status = lista(params?.status).filter((valor) => STATUS.includes(valor));
  const envio = lista(params?.envio).filter((valor) => valor in TEXTO_DO_STATUS_DO_ENVIO);
  // O status unico da coluna Status (08/11/2026); `status` e `envio` continuam valendo para link antigo.
  const situacoes = lista(params?.situacao).filter((valor) => SITUACOES.includes(valor));
  // Filtros das colunas Codigo e Local (parametro repetido, como o canal).
  const codigos = lista(params?.codigo).map((v) => v.trim().slice(0, 100)).filter(Boolean).slice(0, 50);
  const locais = lista(params?.local).map((v) => v.trim().slice(0, 100)).filter(Boolean).slice(0, 50);
  const soComAviso = umDe(params?.aviso) === "1";
  // "Enviar hoje" (08/11/2026): a postar ate o fim de hoje, atrasados juntos; ignora o periodo.
  const despacho = umDe(params?.despacho) === "hoje" ? "hoje" : "";
  const agora = new Date();
  const ordenar = ORDENACOES.includes(umDe(params?.ordenar)) ? umDe(params.ordenar) : "";
  const direcao = umDe(params?.direcao) === "asc" ? "asc" : "desc";
  const porPagina = porPaginaDaUrl(umDe(params?.por));
  const paginaPedida = Math.max(1, Number.parseInt(umDe(params?.pagina), 10) || 1);
  const veLucro = acesso.pode("dado.custo", "ver");

  let resultado = null;
  // As opcoes do filtro de Status e Envio e o lucro do periodo saem do mesmo filtro da lista (sem a pagina).
  let opcoes = null;
  let resumo = null;
  let enviosDeHoje = null;
  let resumoPorCanal = null;
  let erro = null;
  try {
    const filtro = {
      busca,
      // O dia inteiro de Sao Paulo nas duas pontas (o Brasil nao tem horario de verao: -03:00 o ano todo).
      desde: new Date(`${desde}T00:00:00.000-03:00`),
      ate: new Date(`${ate}T23:59:59.999-03:00`),
      canais,
      status,
      envio,
      situacoes,
      codigos,
      locais,
      soComAviso,
      despacho: despacho || undefined,
      agora,
      ordenar: ordenar || undefined,
      direcao,
      porPagina,
    };
    [resultado, opcoes, resumo, enviosDeHoje, resumoPorCanal] = await Promise.all([
      listarPedidosDeVenda({ ...filtro, pagina: paginaPedida }),
      opcoesDasColunas(filtro),
      veLucro ? resumoDaLista(filtro) : null,
      contarEnviosDeHoje(agora),
      resumoDosCanais(filtro, { comLucro: veLucro }),
    ]);
    // Pagina alem do fim (link antigo, filtro que encolheu a lista): mostra a ultima que existe.
    const ultima = Math.max(1, Math.ceil(resultado.total / porPagina));
    if (paginaPedida > ultima) resultado = await listarPedidosDeVenda({ ...filtro, pagina: ultima });
  } catch (e) {
    erro = e;
  }

  const total = resultado?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const pagina = Math.min(paginaPedida, totalPaginas);
  // Sem `dado.custo`, o lucro nao vai nem no conteudo da pagina (a coluna some, e o numero tambem).
  const linhas = (resultado?.linhas ?? []).map((linha) => projetarLinhaDaLista(linha, acesso.pode));
  const filtrando = Boolean(busca || canais.length || status.length || envio.length || situacoes.length || codigos.length || locais.length || soComAviso || despacho || umDe(params?.desde) || umDe(params?.ate));

  return (
    <>
      <LembrarLista caminho="/pedidos" />
      <PageHeader titulo="Vendas" descricao={total === 1 ? "1 pedido no período." : `${total} pedidos no período.`} />

      {erro && <AvisoBanco erro={erro} />}

      <ResumoDosCanais resumo={resumoPorCanal} />

      <FiltrosDePedidos
        busca={busca}
        desde={desde}
        ate={ate}
        hoje={hoje}
        canais={canais}
        situacoes={situacoes}
        soComAviso={soComAviso}
        contagemDasSituacoes={opcoes?.contagemDasSituacoes ?? null}
        enviarHoje={{ ativo: despacho === "hoje", total: enviosDeHoje }}
        navegacao={
          <div className="ml-auto flex items-end gap-6">
            {/* O lucro do periodo (pedido do dono em 04/11/2026): a lista filtrada inteira, pela regra da coluna Lucro. */}
            {resumo && (
              <div className="text-right" title={resumo.semLucro > 0 ? `${resumo.semLucro} pedido(s) sem lucro calculado (item sem custo) ficaram de fora` : "Cancelados não entram; devolvidos entram com o prejuízo do frete de retorno"}>
                <p className="text-xs text-suave">Lucro no período</p>
                <p className={`text-lg leading-tight font-semibold tabular-nums ${resumo.lucro < 0 ? "text-red-600" : "text-emerald-700"}`}>{moedaComSinal(resumo.lucro)}</p>
                {resumo.semLucro > 0 && <p className="text-xs text-suave">{resumo.semLucro} sem lucro calculado</p>}
              </div>
            )}
            <NavegacaoDoTopo pagina={pagina} totalPaginas={totalPaginas} total={total} porPagina={porPagina} />
          </div>
        }
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
            <TabelaPedidosDeVenda linhas={linhas} ordenar={ordenar} direcao={direcao} veLucro={veLucro} opcoes={opcoes} filtros={{ situacoes, codigos, locais }} agora={agora.toISOString()} />
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

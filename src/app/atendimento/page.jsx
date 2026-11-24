import AjustesDoAtendimento from "@/components/atendimento/AjustesDoAtendimento";
import { SITUACAO_DO_ATENDIMENTO } from "@/components/atendimento/formatos";
import TabelaDePerguntas from "@/components/atendimento/TabelaDePerguntas";
import NavegacaoDoTopo from "@/components/mercados/NavegacaoDoTopo";
import Paginacao from "@/components/mercados/Paginacao";
import CampoBusca from "@/components/ui/CampoBusca";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { contagemPorStatus, listarAtendimentos } from "@/lib/atendimentoML/banco";
import { respostaDePerguntaLiberada, TEXTO_DA_TRAVA } from "@/lib/atendimentoML/enviar";
import { porPaginaDaUrl } from "@/lib/porPagina";
import { lerConfiguracao } from "@/lib/riseAi/configuracao";

export const metadata = { title: "Atendimento ML | Sistema Rise" };
export const dynamic = "force-dynamic";

const ORDENAVEIS = ["recebidaEm", "itemId", "textoDoCliente", "status"];

/**
 * Atendimento do ML, fase 1: as perguntas dos anuncios (spec 2026-11-24-atendimento-ml-design.md). Nesta tela o dono ve
 * primeiro as perguntas que esperam resposta, a mais antiga no alto; a acao principal e abrir a pergunta e responder.
 * So para quem tem `acao.atendimentoML.responder` (o dono pediu "apenas eu").
 */
export default async function AtendimentoPage({ searchParams }) {
  const acesso = await exigirAcessoNaPagina("tela.atendimento", "ver");
  const params = await searchParams;
  const pedido = typeof params?.status === "string" ? params.status : "ABERTA";
  const status = pedido === "todas" ? null : SITUACAO_DO_ATENDIMENTO[pedido] ? pedido : "ABERTA";
  const busca = typeof params?.q === "string" ? params.q : "";
  const paginaPedida = Math.max(1, Number.parseInt(params?.pagina, 10) || 1);
  const POR_PAGINA = porPaginaDaUrl(params?.por);
  const ordenar = ORDENAVEIS.includes(params?.ordenar) ? params.ordenar : "recebidaEm";
  // Abertas: a mais antiga primeiro (e a que mais pesa no tempo de resposta). As outras: a mais recente primeiro.
  const direcao = params?.ordenar ? (params?.direcao === "desc" ? "desc" : "asc") : status === "ABERTA" ? "asc" : "desc";

  const [{ linhas, total }, contagem, config] = await Promise.all([
    listarAtendimentos({ tipo: "PERGUNTA", status, filtros: { texto: busca }, ordenar, direcao, pagina: paginaPedida, porPagina: POR_PAGINA }),
    contagemPorStatus("PERGUNTA"),
    lerConfiguracao(),
  ]);
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(paginaPedida, totalPaginas);
  const abertas = contagem.ABERTA ?? 0;
  const podeResponder = acesso.pode("acao.atendimentoML.responder", "executar");
  // A lista vai ao navegador sem o que a janela nao mostra.
  const naTela = linhas.map((l) => ({ id: l.id, itemId: l.itemId, textoDoCliente: l.textoDoCliente, recebidaEm: l.recebidaEm.toISOString(), status: l.status, rascunho: l.rascunho, respostaEnviada: l.respostaEnviada, respondidaEm: l.respondidaEm?.toISOString() ?? null, respondidaVia: l.respondidaVia, anuncio: l.anuncio ? { titulo: l.anuncio.titulo, unidadesDoKit: l.anuncio.unidadesDoKit, foto: l.anuncio.foto } : null }));

  return (
    <>
      <PageHeader
        titulo="Atendimento ML"
        descricao={abertas === 0 ? "Nenhuma pergunta esperando resposta." : abertas === 1 ? "1 pergunta esperando resposta." : `${abertas} perguntas esperando resposta.`}
        acao={<AjustesDoAtendimento prompt={config.atendimentoML?.prompt ?? ""} limite={config.atendimentoML?.limiteDaPergunta ?? 2000} podeEditar={podeResponder && acesso.pode("riseAi.configuracoes", "editar")} />}
      />
      {!respostaDePerguntaLiberada() && <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{TEXTO_DA_TRAVA} Você pode ler, pedir sugestão e guardar o rascunho; o envio ao Mercado Livre fica bloqueado.</p>}
      {!podeResponder && <p className="mb-3 text-sm text-amber-700">Você vê as perguntas, mas não tem a permissão de responder.</p>}
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <CampoBusca valorInicial={busca} rotulo="Buscar no texto da pergunta" className="w-full max-w-sm" />
        <NavegacaoDoTopo pagina={pagina} totalPaginas={totalPaginas} total={total} porPagina={POR_PAGINA} />
      </div>
      <TabelaDePerguntas linhas={naTela} status={status} contagem={contagem} />
      {totalPaginas > 1 && (
        <div className="mt-4">
          <Paginacao pagina={pagina} totalPaginas={totalPaginas} total={total} primeiro={(pagina - 1) * POR_PAGINA + 1} ultimo={Math.min(pagina * POR_PAGINA, total)} />
        </div>
      )}
    </>
  );
}

import Link from "next/link";

import AjustesDoAtendimento from "@/components/atendimento/AjustesDoAtendimento";
import { SITUACAO_DO_ATENDIMENTO } from "@/components/atendimento/formatos";
import TabelaDePerguntas from "@/components/atendimento/TabelaDePerguntas";
import NavegacaoDoTopo from "@/components/mercados/NavegacaoDoTopo";
import Paginacao from "@/components/mercados/Paginacao";
import CampoBusca from "@/components/ui/CampoBusca";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { contagemPorStatus, contarAbertas, listarAtendimentos } from "@/lib/atendimentoML/banco";
import { mensagemDePosVendaLiberada, TEXTO_DA_TRAVA_DE_MENSAGENS } from "@/lib/atendimentoML/posVenda";
import { respostaDePerguntaLiberada, TEXTO_DA_TRAVA } from "@/lib/atendimentoML/enviar";
import { porPaginaDaUrl } from "@/lib/porPagina";
import { lerConfiguracao } from "@/lib/riseAi/configuracao";

export const metadata = { title: "Atendimento ML | Sistema Rise" };
export const dynamic = "force-dynamic";

const ORDENAVEIS = ["recebidaEm", "itemId", "idExterno", "textoDoCliente", "status"];

// As duas abas (`?tipo=mensagens`): as perguntas dos anuncios e as mensagens de quem ja comprou (fase 2).
const ABAS = [
  { tipo: "PERGUNTA", rotulo: "Perguntas", parametro: null },
  { tipo: "POS_VENDA", rotulo: "Mensagens", parametro: "mensagens" },
];
const esperando = (quantas, uma, varias) => (quantas === 0 ? null : quantas === 1 ? `1 ${uma}` : `${quantas} ${varias}`);

/**
 * Atendimento do ML, fase 1: as perguntas dos anuncios (spec 2026-11-24-atendimento-ml-design.md). Nesta tela o dono ve
 * primeiro as perguntas que esperam resposta, a mais antiga no alto; a acao principal e abrir a pergunta e responder.
 * So para quem tem `acao.atendimentoML.responder` (o dono pediu "apenas eu").
 */
export default async function AtendimentoPage({ searchParams }) {
  const acesso = await exigirAcessoNaPagina("tela.atendimento", "ver");
  const params = await searchParams;
  const tipo = params?.tipo === "mensagens" ? "POS_VENDA" : "PERGUNTA";
  const mensagens = tipo === "POS_VENDA";
  const pedido = typeof params?.status === "string" ? params.status : "ABERTA";
  const status = pedido === "todas" ? null : SITUACAO_DO_ATENDIMENTO[pedido] ? pedido : "ABERTA";
  const busca = typeof params?.q === "string" ? params.q : "";
  const paginaPedida = Math.max(1, Number.parseInt(params?.pagina, 10) || 1);
  const POR_PAGINA = porPaginaDaUrl(params?.por);
  const ordenar = ORDENAVEIS.includes(params?.ordenar) ? params.ordenar : "recebidaEm";
  // Abertas: a mais antiga primeiro (e a que mais pesa no tempo de resposta). As outras: a mais recente primeiro.
  const direcao = params?.ordenar ? (params?.direcao === "desc" ? "desc" : "asc") : status === "ABERTA" ? "asc" : "desc";

  const [{ linhas, total }, contagem, config, perguntasAbertas, mensagensAbertas] = await Promise.all([
    listarAtendimentos({ tipo, status, filtros: { texto: busca }, ordenar, direcao, pagina: paginaPedida, porPagina: POR_PAGINA }),
    contagemPorStatus(tipo),
    lerConfiguracao(),
    contarAbertas("PERGUNTA"),
    contarAbertas("POS_VENDA"),
  ]);
  const abertasDaAba = { PERGUNTA: perguntasAbertas, POS_VENDA: mensagensAbertas };
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(paginaPedida, totalPaginas);
  const resumo = [esperando(perguntasAbertas, "pergunta", "perguntas"), esperando(mensagensAbertas, "mensagem", "mensagens")].filter(Boolean);
  const travaDesligada = mensagens ? (mensagemDePosVendaLiberada() ? null : TEXTO_DA_TRAVA_DE_MENSAGENS) : respostaDePerguntaLiberada() ? null : TEXTO_DA_TRAVA;
  const podeResponder = acesso.pode("acao.atendimentoML.responder", "executar");
  // A lista vai ao navegador sem o que a janela nao mostra.
  const naTela = linhas.map((l) => ({ id: l.id, tipo: l.tipo, idExterno: l.idExterno, limite: l.limite, bloqueado: Boolean(l.bloqueio), pedido: l.pedido, itemId: l.itemId, textoDoCliente: l.textoDoCliente, recebidaEm: l.recebidaEm.toISOString(), status: l.status, rascunho: l.rascunho, respostaEnviada: l.respostaEnviada, respondidaEm: l.respondidaEm?.toISOString() ?? null, respondidaVia: l.respondidaVia, anuncio: l.anuncio ? { titulo: l.anuncio.titulo, unidadesDoKit: l.anuncio.unidadesDoKit, foto: l.anuncio.foto } : null }));

  return (
    <>
      <PageHeader
        titulo="Atendimento ML"
        descricao={resumo.length === 0 ? "Nada esperando resposta." : `${resumo.join(" e ")} esperando resposta.`}
        acao={<AjustesDoAtendimento prompt={config.atendimentoML?.prompt ?? ""} limite={config.atendimentoML?.limiteDaPergunta ?? 2000} podeEditar={podeResponder && acesso.pode("riseAi.configuracoes", "editar")} />}
      />
      <nav className="mb-4 flex gap-1 border-b border-borda" aria-label="Tipo de atendimento">
        {ABAS.map((aba) => {
          const ativa = aba.tipo === tipo;
          return (
            <Link
              key={aba.tipo}
              href={aba.parametro ? `/atendimento?tipo=${aba.parametro}` : "/atendimento"}
              aria-current={ativa ? "page" : undefined}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${ativa ? "border-acento text-acento" : "border-transparent text-suave hover:text-texto"}`}
            >
              {aba.rotulo}
              {abertasDaAba[aba.tipo] > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-800 tabular-nums">{abertasDaAba[aba.tipo]}</span>}
            </Link>
          );
        })}
      </nav>
      {travaDesligada && <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{travaDesligada} Você pode ler, pedir sugestão e guardar o rascunho; o envio ao Mercado Livre fica bloqueado.</p>}
      {!podeResponder && <p className="mb-3 text-sm text-amber-700">Você vê {mensagens ? "as mensagens" : "as perguntas"}, mas não tem a permissão de responder.</p>}
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <CampoBusca valorInicial={busca} rotulo={mensagens ? "Buscar na mensagem ou pelo número do pedido" : "Buscar no texto da pergunta"} className="w-full max-w-sm" />
        <NavegacaoDoTopo pagina={pagina} totalPaginas={totalPaginas} total={total} porPagina={POR_PAGINA} />
      </div>
      <TabelaDePerguntas linhas={naTela} status={status} contagem={contagem} tipo={tipo} />
      {totalPaginas > 1 && (
        <div className="mt-4">
          <Paginacao pagina={pagina} totalPaginas={totalPaginas} total={total} primeiro={(pagina - 1) * POR_PAGINA + 1} ultimo={Math.min(pagina * POR_PAGINA, total)} />
        </div>
      )}
    </>
  );
}

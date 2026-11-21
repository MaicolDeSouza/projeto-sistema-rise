import Link from "next/link";

import NavegacaoDoTopo from "@/components/mercados/NavegacaoDoTopo";
import Paginacao from "@/components/mercados/Paginacao";
import TabelaReclamacoes from "@/components/pedidos/TabelaReclamacoes";
import AvisoBanco from "@/components/ui/AvisoBanco";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { listarReclamacoes, resumoDasReclamacoes } from "@/lib/pedidos/reclamacoesML";
import { GRUPOS, TEXTO_DO_GRUPO } from "@/lib/pedidos/reclamacoesTextos";
import { porPaginaDaUrl } from "@/lib/porPagina";

export const metadata = { title: "Reclamações | Sistema Rise" };
export const dynamic = "force-dynamic";

const PERIODOS = [
  { id: "30", rotulo: "30 dias", dias: 30 },
  { id: "90", rotulo: "90 dias", dias: 90 },
  { id: "365", rotulo: "12 meses", dias: 365 },
  { id: "tudo", rotulo: "Tudo", dias: null },
];
const ORDENACOES = ["data", "grupo", "tipo", "reputacao", "status"];
const umDe = (valor) => String((Array.isArray(valor) ? valor[0] : valor) ?? "").trim();

/**
 * Reclamacoes do Mercado Livre (pedido do dono em 20/11/2026: "quantas vendas foram abertas reclamacoes por arrependimento do
 * cliente e nao afeta minha reputacao e quantas por problema no produto e afeta"). Nesta tela o operador ve primeiro o quadro
 * por motivo, com e sem efeito na reputacao; a acao principal e abrir a venda da reclamacao. Cada numero do quadro filtra a
 * lista de baixo. So leitura: quem le o ML e a rotina `reclamacoesML` do worker.
 */
export default async function ReclamacoesPage({ searchParams }) {
  await exigirAcessoNaPagina("tela.pedidos", "ver");
  const params = await searchParams;

  const periodo = PERIODOS.find((p) => p.id === umDe(params?.periodo)) ?? PERIODOS[2];
  const agora = new Date();
  const desde = periodo.dias ? new Date(agora.getTime() - periodo.dias * 24 * 60 * 60 * 1000) : undefined;
  const grupo = GRUPOS.includes(umDe(params?.grupo)) ? umDe(params.grupo) : null;
  const afeta = ["sim", "nao"].includes(umDe(params?.afeta)) ? umDe(params.afeta) : null;
  const nota = ["falta", "emitida"].includes(umDe(params?.nota)) ? umDe(params.nota) : null;
  const podeMarcarNota = (await sessaoDeAcessos().catch(() => null))?.pode("acao.pedidos.marcarNotaDeDevolucao", "executar") ?? false;
  // O mes da lista do contador abre no mes corrente (Sao Paulo).
  const mesAtual = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(agora);
  const ordenar = ORDENACOES.includes(umDe(params?.ordenar)) ? umDe(params.ordenar) : null;
  const direcao = umDe(params?.direcao) === "asc" ? "asc" : umDe(params?.direcao) === "desc" ? "desc" : null;
  const porPagina = porPaginaDaUrl(params?.por);
  const paginaPedida = Math.max(1, Number.parseInt(umDe(params?.pagina), 10) || 1);

  let resumo;
  let lista;
  try {
    resumo = await resumoDasReclamacoes({ desde });
    const contagem = await listarReclamacoes({ desde, grupo, afeta, nota, pagina: 1, porPagina: 1 });
    const totalPaginas = Math.max(1, Math.ceil(contagem.total / porPagina));
    lista = await listarReclamacoes({ desde, grupo, afeta, nota, ordenar, direcao, pagina: Math.min(paginaPedida, totalPaginas), porPagina });
    lista.pagina = Math.min(paginaPedida, totalPaginas);
    lista.totalPaginas = totalPaginas;
  } catch {
    return (
      <div>
        <PageHeader titulo="Reclamações" voltarPara="/pedidos" voltarRotulo="Vendas" />
        <AvisoBanco />
      </div>
    );
  }

  // Os links do quadro e do periodo mantem o resto da URL (menos a pagina, que volta para a 1).
  const href = (mudancas) => {
    const proximo = new URLSearchParams();
    const atual = { periodo: periodo.id === "365" ? null : periodo.id, grupo, afeta, nota, ordenar, direcao, por: umDe(params?.por) || null, ...mudancas };
    for (const [chave, valor] of Object.entries(atual)) if (valor) proximo.set(chave, valor);
    const texto = proximo.toString();
    return texto ? `/pedidos/reclamacoes?${texto}` : "/pedidos/reclamacoes";
  };
  const ligado = (g, a) => grupo === g && afeta === a;
  const celula = (g, a, quantos, destaque = false) =>
    quantos > 0 ? (
      <Link
        href={ligado(g, a) ? href({ grupo: null, afeta: null }) : href({ grupo: g, afeta: a })}
        title={ligado(g, a) ? "Tirar o filtro" : "Filtrar a lista"}
        className={`inline-block min-w-8 rounded px-2 py-0.5 tabular-nums transition-[background-color] duration-150 ${ligado(g, a) ? "bg-acento text-white" : destaque ? "bg-red-50 font-medium text-red-700 hover:bg-red-100" : "hover:bg-fundo"}`}
      >
        {quantos}
      </Link>
    ) : (
      <span className="inline-block min-w-8 px-2 py-0.5 text-suave">0</span>
    );

  return (
    <div>
      <PageHeader
        titulo="Reclamações"
        descricao={`${resumo.total} no período · ${resumo.afetam} ${resumo.afetam === 1 ? "afeta" : "afetam"} a reputação · ${resumo.abertas} ${resumo.abertas === 1 ? "aberta" : "abertas"}`}
        voltarPara="/pedidos"
        voltarRotulo="Vendas"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PERIODOS.map((p) => (
          <Link
            key={p.id}
            href={href({ periodo: p.id === "365" ? null : p.id })}
            className={`rounded border px-3 py-1.5 text-sm transition-[background-color] duration-150 ${p.id === periodo.id ? "border-acento bg-acento text-white" : "border-borda hover:bg-fundo"}`}
          >
            {p.rotulo}
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-borda" aria-hidden="true" />
        {[
          { id: "falta", rotulo: "Falta a nota de devolução", quantos: resumo.faltaNota, grave: true },
          { id: "emitida", rotulo: "Nota emitida", quantos: resumo.notaEmitida, grave: false },
        ].map((f) => (
          <Link
            key={f.id}
            href={href({ nota: nota === f.id ? null : f.id })}
            title={nota === f.id ? "Tirar o filtro" : "Filtrar a lista"}
            className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm transition-[background-color] duration-150 ${nota === f.id ? "border-acento bg-acento text-white" : f.grave && f.quantos > 0 ? "border-red-200 bg-red-50 font-medium text-red-700 hover:bg-red-100" : "border-borda hover:bg-fundo"}`}
          >
            {f.rotulo}
            <span className="tabular-nums">{f.quantos}</span>
          </Link>
        ))}
        <form action="/api/pedidos/devolucoes" method="get" className="flex items-center gap-1.5">
          <input type="month" name="mes" defaultValue={mesAtual} required aria-label="Mês das devoluções" className="rounded border border-borda bg-superficie px-2 py-1 text-sm tabular-nums" />
          <button type="submit" className="rounded border border-borda px-3 py-1.5 text-sm transition-[background-color] duration-150 hover:bg-fundo">
            Baixar devoluções do mês
          </button>
          <BolhaDeAjuda
            variante="inline"
            texto={
              <>
                <span className="block">As devoluções postadas no mês, em planilha para o contador abater da receita.</span>
                <span className="block">Emita a nota de devolução assim que o cliente postar, no faturador do Mercado Livre, e marque aqui com o número.</span>
              </>
            }
          />
        </form>
        <div className="ml-auto">
          <NavegacaoDoTopo pagina={lista.pagina} totalPaginas={lista.totalPaginas} total={lista.total} porPagina={porPagina} />
        </div>
      </div>

      <div className="mb-4 max-w-2xl overflow-x-auto rounded-md border border-borda bg-superficie">
        <table className="w-full text-left text-sm">
          <thead className="bg-fundo text-[11px] text-suave">
            <tr>
              <th className="px-3 py-2.5 font-medium uppercase">Motivo</th>
              <th className="px-3 py-2.5 text-right font-medium uppercase">Não afeta a reputação</th>
              <th className="px-3 py-2.5 text-right font-medium uppercase">Afeta a reputação</th>
              <th className="px-3 py-2.5 text-right font-medium uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {resumo.grupos.map((g) => (
              <tr key={g.grupo}>
                <td className="px-3 py-2">{TEXTO_DO_GRUPO[g.grupo]}</td>
                <td className="px-3 py-1.5 text-right">{celula(g.grupo, "nao", g.naoAfeta)}</td>
                <td className="px-3 py-1.5 text-right">{celula(g.grupo, "sim", g.afeta, true)}</td>
                <td className="px-3 py-1.5 text-right">{celula(g.grupo, null, g.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lista.linhas.length === 0 ? (
        <EmptyState titulo="Nenhuma reclamação" descricao="Não há reclamação do Mercado Livre neste período e filtro." />
      ) : (
        <>
          <TabelaReclamacoes linhas={lista.linhas.map((l) => ({ ...l, abertaEm: l.abertaEm.toISOString(), devolucao: { ...l.devolucao, postadaEm: l.devolucao.postadaEm?.toISOString() ?? null, entregueEm: l.devolucao.entregueEm?.toISOString() ?? null } }))} ordenar={ordenar} direcao={direcao} podeMarcarNota={podeMarcarNota} />
          {lista.totalPaginas > 1 && (
            <div className="mt-4">
              <Paginacao pagina={lista.pagina} totalPaginas={lista.totalPaginas} total={lista.total} primeiro={(lista.pagina - 1) * porPagina + 1} ultimo={(lista.pagina - 1) * porPagina + lista.linhas.length} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

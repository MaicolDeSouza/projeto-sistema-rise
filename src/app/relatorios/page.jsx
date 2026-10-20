import { Download } from "lucide-react";

import GerarAgora from "@/components/relatorios/GerarAgora";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { prisma } from "@/lib/db";
import { dataDaChave, proximoSabado } from "@/lib/relatorios/semana";

export const metadata = { title: "Relatórios | Sistema Rise" };
// A lista e viva (uma rodada pode fechar a qualquer hora): nada montado no build.
export const dynamic = "force-dynamic";

const SITUACAO = {
  COLETANDO: { rotulo: "Coletando", classe: "bg-amber-50 text-amber-800 border-amber-300" },
  PRONTO: { rotulo: "Pronto", classe: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  ERRO: { rotulo: "Erro", classe: "bg-red-50 text-red-800 border-red-200" },
};

const comoData = (valor) =>
  valor
    ? new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

/**
 * Relatorios. O operador ve primeiro o ultimo relatorio semanal da coleta e a acao principal e baixar o PDF. Todo sabado
 * 00:00 (Sao Paulo) o worker varre as lojas e, quando a ultima termina, gera o PDF: erros de leitura por loja, produtos novos
 * dos concorrentes com o link e os 10 mais vendidos (estimativa pela queda de estoque).
 */
export default async function RelatoriosPage() {
  const acesso = await exigirAcessoNaPagina("tela.relatorios", "ver");
  const relatorios = await prisma.relatorioSemanal.findMany({
    orderBy: { criadoEm: "desc" },
    take: 60,
    select: { id: true, semana: true, status: true, inicioEm: true, fimEm: true, resumo: true, erro: true },
  });

  return (
    <>
      <PageHeader
        titulo="Relatórios"
        descricao={`Coleta semanal: todo sábado às 00:00. Próxima rodada: ${comoData(proximoSabado())}.`}
        acao={acesso.pode("tela.relatorios", "editar") ? <GerarAgora /> : null}
      />

      {relatorios.length === 0 ? (
        <EmptyState titulo="Nenhum relatório ainda" descricao="O primeiro sai depois da próxima rodada de sábado, ou clique em Gerar agora." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
          <table className="w-full text-sm">
            <thead className="border-b border-borda text-left text-xs text-suave">
              <tr>
                <th className="px-3 py-2 font-medium">Rodada</th>
                <th className="px-3 py-2 font-medium">Situação</th>
                <th className="px-3 py-2 font-medium">Lojas</th>
                <th className="px-3 py-2 font-medium">Com erro</th>
                <th className="px-3 py-2 font-medium">Produtos novos</th>
                <th className="px-3 py-2 text-right font-medium">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {relatorios.map((relatorio) => {
                const situacao = SITUACAO[relatorio.status] ?? SITUACAO.ERRO;
                const resumo = relatorio.resumo ?? {};
                const data = dataDaChave(relatorio.semana);
                return (
                  <tr key={relatorio.id}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{data ? `Sábado, ${data}` : "Gerado manualmente"}</p>
                      <p className="text-xs text-suave">
                        {comoData(relatorio.inicioEm)} a {comoData(relatorio.fimEm)}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded border px-1.5 py-0.5 text-[11px] ${situacao.classe}`}>{situacao.rotulo}</span>
                      {relatorio.erro && <p className="mt-1 max-w-xs text-xs text-suave">{relatorio.erro}</p>}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{resumo.lojas ?? "—"}</td>
                    <td className={`px-3 py-2 tabular-nums ${resumo.comErro ? "font-medium text-red-700" : ""}`} title={(resumo.lojasComErro ?? []).join(", ")}>
                      {resumo.comErro ?? "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{resumo.novos ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {relatorio.status === "PRONTO" ? (
                        <a
                          href={`/api/relatorios/${relatorio.id}/pdf`}
                          className="inline-flex items-center gap-1 rounded border border-borda px-2 py-1 text-xs font-medium hover:bg-fundo"
                        >
                          <Download size={12} />
                          Baixar
                        </a>
                      ) : (
                        <span className="text-xs text-suave">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

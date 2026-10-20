import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";

const AJUDA =
  "Tudo o que cada pessoa consultou no Rise pelo Claude ou pelo ChatGPT neste dia, mesmo quando o modelo não anotou a dúvida. \"Sem anotação\" quer dizer que a pergunta e a resposta não chegaram ao Rise (só o que foi consultado). As anotadas estão na aba Conversas.";

/**
 * A aba Consultas da Revisao do dia (pedido do dono em 20/10/2026, "sempre salvar o historico de conversa no Rise"): o
 * registro de cada consulta pelo MCP, por pessoa, com o que foi pesquisado e se ficou coberto por uma anotacao. Nesta
 * tela o dono ve primeiro quem consultou e o que ficou sem anotacao; nao ha acao (e so leitura).
 *
 * @param {{ consultas: { login: string, cliente: string, total: number, semAnotacao: number,
 *   chamadas: { hora: string, ferramenta: string, resumo: string, ok: boolean, erro: string | null, anotada: boolean }[] }[] }} props
 */
export default function ConsultasDoDia({ consultas }) {
  if (consultas.length === 0) return <p className="p-3 text-sm text-suave">Nenhuma consulta pelo Claude ou pelo ChatGPT neste dia.</p>;

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-1 text-xs text-suave">
        Consultas pelo Claude e pelo ChatGPT
        <BolhaDeAjuda variante="inline" texto={AJUDA} />
      </p>
      {consultas.map((grupo) => (
        <section key={`${grupo.login}-${grupo.cliente}`} className="rounded-lg border border-borda">
          <header className="flex flex-wrap items-center gap-2 border-b border-borda px-4 py-2.5">
            <h2 className="text-sm font-semibold">{grupo.login}</h2>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800">pelo {grupo.cliente}</span>
            <span className="text-xs text-suave tabular-nums">
              {grupo.total} {grupo.total === 1 ? "consulta" : "consultas"}
            </span>
            {grupo.semAnotacao > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 tabular-nums">{grupo.semAnotacao} sem anotação</span>
            )}
          </header>
          <ul className="divide-y divide-borda/60">
            {grupo.chamadas.map((chamada, indice) => (
              <li key={indice} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2 text-sm">
                <span className="w-12 shrink-0 text-xs text-suave tabular-nums">{chamada.hora}</span>
                <span className="min-w-0 flex-1 break-words">{chamada.resumo}</span>
                {!chamada.ok && <span className="text-xs text-red-700">{chamada.erro ?? "falhou"}</span>}
                <span className={`shrink-0 text-xs ${chamada.anotada ? "text-emerald-700" : "text-amber-700"}`}>{chamada.anotada ? "anotada" : "sem anotação"}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

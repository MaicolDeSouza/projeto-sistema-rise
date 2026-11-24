/**
 * Os textos pequenos da tela "Atendimento ML", num lugar so (a tabela e a janela usam os mesmos). Sem imports.
 */

export const SITUACAO_DO_ATENDIMENTO = {
  ABERTA: { texto: "Aberta", plural: "Abertas", cor: "bg-amber-500" },
  RESPONDIDA: { texto: "Respondida", plural: "Respondidas", cor: "bg-emerald-500" },
  IGNORADA: { texto: "Ignorada", plural: "Ignoradas", cor: "bg-zinc-400" },
  FECHADA_FORA: { texto: "Respondida fora do Rise", plural: "Respondidas fora do Rise", cor: "bg-sky-500" },
};

/** As abas de situacao, na ordem do dia a dia (o que pede acao primeiro). */
export const SITUACOES = ["ABERTA", "RESPONDIDA", "FECHADA_FORA", "IGNORADA"];

/** "Kit de 10" para o anuncio que vende mais de uma unidade; nulo para o de 1. */
export function textoDoKit(unidades) {
  return Number(unidades) > 1 ? `Kit de ${Number(unidades)}` : null;
}

const MIN = 60 * 1000;
const HORA = 60 * MIN;

/** "há 5 min", "há 3 h", "há 2 dias". */
export function haQuanto(data, agora = Date.now()) {
  const ms = Math.max(0, agora - new Date(data).getTime());
  if (ms < HORA) return `há ${Math.max(1, Math.round(ms / MIN))} min`;
  if (ms < 48 * HORA) return `há ${Math.round(ms / HORA)} h`;
  return `há ${Math.round(ms / (24 * HORA))} dias`;
}

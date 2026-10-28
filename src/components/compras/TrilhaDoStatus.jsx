import { Check } from "lucide-react";

const PASSOS = [
  { status: "RASCUNHO", texto: "Rascunho" },
  { status: "ENVIADO", texto: "Enviado" },
  { status: "PARCIAL", texto: "Entrega parcial" },
  { status: "FINALIZADO", texto: "Finalizado" },
];

const fmtData = (data) => (data ? new Date(data).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null);

/**
 * A trilha da situacao no topo do editor: o pedido e uma sequencia de verdade (rascunho, enviado, chegando, fechado),
 * e ver onde ele esta e o que vem depois e a primeira coisa que o dono precisa. Cancelado substitui a trilha.
 */
// `rotuloEnviado`: o pedido do AliExpress nasce enviado; a trilha diz "Comprado no AliExpress".
export default function TrilhaDoStatus({ status, enviadoEm, finalizadoEm, canceladoEm, acao = null, rotuloEnviado }) {
  if (status === "CANCELADO") {
    return (
      <p className="mb-5 rounded-lg border border-borda bg-superficie px-4 py-3 text-sm text-suave">
        Pedido cancelado em {fmtData(canceladoEm)}. Não conta como estoque a caminho.
      </p>
    );
  }
  const atual = PASSOS.findIndex((passo) => passo.status === status);
  const datas = { ENVIADO: fmtData(enviadoEm), FINALIZADO: fmtData(finalizadoEm) };

  return (
    <div className="mb-5 flex items-center gap-4 rounded-lg border border-borda bg-superficie px-4 py-3">
    <ol className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto" aria-label="Situação do pedido">
      {PASSOS.map((passo, indice) => {
        const feito = indice < atual || status === "FINALIZADO";
        const agora = indice === atual && status !== "FINALIZADO";
        return (
          <li key={passo.status} className="flex shrink-0 items-center gap-2" aria-current={agora ? "step" : undefined}>
            {indice > 0 && <span className={`h-px w-8 sm:w-14 ${indice <= atual ? "bg-acento" : "bg-borda"}`} aria-hidden="true" />}
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                feito ? "bg-acento text-white" : agora ? "bg-acento/10 text-acento ring-2 ring-acento" : "bg-fundo text-suave ring-1 ring-borda"
              }`}
            >
              {feito ? <Check size={13} strokeWidth={3} /> : indice + 1}
            </span>
            <span className={`text-sm ${agora ? "font-semibold text-texto" : feito ? "text-texto" : "text-suave"}`}>
              {passo.status === "ENVIADO" && rotuloEnviado ? rotuloEnviado : passo.texto}
              {datas[passo.status] && (indice <= atual) && <span className="ml-1.5 text-xs text-suave">{datas[passo.status]}</span>}
            </span>
          </li>
        );
      })}
    </ol>
    {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}

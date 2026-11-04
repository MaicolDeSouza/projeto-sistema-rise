/** O selo da situacao do pedido, a mesma cor na lista e no editor. */
const SELOS = {
  RASCUNHO: { texto: "Rascunho", classe: "bg-slate-100 text-slate-700" },
  ENVIADO: { texto: "Enviado", classe: "bg-sky-100 text-sky-800" },
  PARCIAL: { texto: "Entrega parcial", classe: "bg-amber-100 text-amber-800" },
  FINALIZADO: { texto: "Finalizado", classe: "bg-emerald-100 text-emerald-800" },
  CANCELADO: { texto: "Cancelado", classe: "bg-slate-100 text-slate-500 line-through" },
};

export const TEXTO_DO_STATUS = Object.fromEntries(Object.entries(SELOS).map(([status, selo]) => [status, selo.texto]));

// A fase da entrega do pedido do AliExpress, que a lista mostra no lugar do status (pedido do dono em 04/11/2026).
const FASES = {
  "Aguardando envio": "bg-slate-100 text-slate-700",
  "Aguardando conferência": "bg-violet-100 text-violet-800",
};

export default function SeloDoStatus({ status, fase = null }) {
  const selo = fase ? { texto: fase, classe: FASES[fase] ?? SELOS.ENVIADO.classe } : (SELOS[status] ?? SELOS.RASCUNHO);
  // Com a fase, o status do Rise vai para o title: o filtro do topo continua sendo pelo status.
  const titulo = fase ? `${fase} · ${SELOS[status]?.texto ?? status} no Rise` : undefined;
  return (
    <span title={titulo} className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${selo.classe}`}>
      {selo.texto}
    </span>
  );
}

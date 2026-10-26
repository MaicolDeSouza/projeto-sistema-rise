/** O selo da situacao do pedido, a mesma cor na lista e no editor. */
const SELOS = {
  RASCUNHO: { texto: "Rascunho", classe: "bg-slate-100 text-slate-700" },
  ENVIADO: { texto: "Enviado", classe: "bg-sky-100 text-sky-800" },
  PARCIAL: { texto: "Entrega parcial", classe: "bg-amber-100 text-amber-800" },
  FINALIZADO: { texto: "Finalizado", classe: "bg-emerald-100 text-emerald-800" },
  CANCELADO: { texto: "Cancelado", classe: "bg-slate-100 text-slate-500 line-through" },
};

export const TEXTO_DO_STATUS = Object.fromEntries(Object.entries(SELOS).map(([status, selo]) => [status, selo.texto]));

export default function SeloDoStatus({ status }) {
  const selo = SELOS[status] ?? SELOS.RASCUNHO;
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${selo.classe}`}>{selo.texto}</span>;
}

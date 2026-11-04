/** O selo da situacao do pedido, a mesma cor na lista e no editor. */
const SELOS = {
  RASCUNHO: { texto: "Rascunho", classe: "bg-slate-100 text-slate-700" },
  ENVIADO: { texto: "Enviado", classe: "bg-sky-100 text-sky-800" },
  PARCIAL: { texto: "Entrega parcial", classe: "bg-amber-100 text-amber-800" },
  FINALIZADO: { texto: "Finalizado", classe: "bg-emerald-100 text-emerald-800" },
  CANCELADO: { texto: "Cancelado", classe: "bg-slate-100 text-slate-500 line-through" },
};

export const TEXTO_DO_STATUS = Object.fromEntries(Object.entries(SELOS).map(([status, selo]) => [status, selo.texto]));

// A cor da fase da entrega (`faseDoPedido`, lista aprovada pelo dono em 04/11/2026): a lista mostra a fase no lugar do
// status do Rise enquanto o pedido esta aberto.
const TONS = {
  neutro: "bg-slate-100 text-slate-700",
  caminho: "bg-sky-100 text-sky-800",
  alfandega: "bg-indigo-100 text-indigo-800",
  entrega: "bg-teal-100 text-teal-800",
  conferencia: "bg-violet-100 text-violet-800",
  parcial: "bg-amber-100 text-amber-800",
  problema: "bg-rose-100 text-rose-700",
};

export default function SeloDoStatus({ status, fase = null }) {
  const selo = fase ? { texto: fase.rotulo, classe: TONS[fase.tom] ?? TONS.caminho } : (SELOS[status] ?? SELOS.RASCUNHO);
  // Com a fase, o title traz cada pacote e o status do Rise (o filtro do topo continua sendo pelo status).
  const titulo = fase ? [...(fase.detalhe ?? []), `No Rise: ${SELOS[status]?.texto ?? status}`].join("\n") : undefined;
  return (
    <span title={titulo} className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${selo.classe}`}>
      {selo.texto}
    </span>
  );
}

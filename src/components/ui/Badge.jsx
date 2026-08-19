const TONS = {
  neutro: "bg-slate-100 text-slate-700",
  sucesso: "bg-emerald-100 text-emerald-800",
  alerta: "bg-amber-100 text-amber-800",
  erro: "bg-red-100 text-red-800",
  info: "bg-sky-100 text-sky-800",
};

export default function Badge({ children, tom = "neutro" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONS[tom] ?? TONS.neutro}`}
    >
      {children}
    </span>
  );
}

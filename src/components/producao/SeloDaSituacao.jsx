import { ROTULO_DA_SITUACAO } from "@/lib/producao/regras";

const CLASSES = {
  ABERTA: "bg-slate-100 text-slate-700",
  EM_PRODUCAO: "bg-sky-100 text-sky-800",
  CONCLUIDA: "bg-emerald-100 text-emerald-800",
  CANCELADA: "bg-red-50 text-red-700",
};

/** O selo da situacao da ordem, a mesma cor na lista e na ordem. */
export default function SeloDaSituacao({ situacao }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${CLASSES[situacao] ?? CLASSES.ABERTA}`}>
      {ROTULO_DA_SITUACAO[situacao] ?? situacao}
    </span>
  );
}

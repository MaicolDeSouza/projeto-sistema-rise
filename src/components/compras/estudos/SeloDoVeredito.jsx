import { ROTULO_DA_SITUACAO, ROTULO_DO_VEREDITO } from "@/lib/estudos/regras";

import { COR_DO_VEREDITO } from "./formato";

/** O veredito do estudo como selo colorido; na fila, o selo cinza "Na fila". */
export default function SeloDoVeredito({ situacao, veredito, grande = false }) {
  const tamanho = grande ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs";
  if (situacao !== "CONCLUIDO" || !veredito) {
    return <span className={`inline-flex rounded-full bg-slate-100 font-medium whitespace-nowrap text-slate-600 ring-1 ring-slate-500/20 ring-inset ${tamanho}`}>{ROTULO_DA_SITUACAO[situacao] ?? situacao}</span>;
  }
  return (
    <span className={`inline-flex rounded-full font-semibold whitespace-nowrap ring-1 ring-inset ${COR_DO_VEREDITO[veredito]} ${tamanho}`}>{ROTULO_DO_VEREDITO[veredito]}</span>
  );
}

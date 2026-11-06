import { COR_DO_PONTO, COR_DO_TEXTO, diaEHora } from "./formato";

/**
 * Quao recente e a ultima leitura completa do portal (spec §6.3: ate 7 dias verde, ate 30 ambar, acima ou nunca
 * vermelho). E o que diz se as "vagas livres" da tabela ainda valem; como ler de novo fica no `title`.
 */
export default function SeloDaLeitura({ frescor }) {
  if (!frescor) return null;
  const dica = frescor.lidaEm
    ? `Última leitura completa do portal: ${diaEHora(frescor.lidaEm)}.\nPara ler de novo: abra o portal e clique em "Enviar ao Rise" na extensão Rise LightBurn.`
    : 'Para ler: abra o portal e clique em "Enviar ao Rise" na extensão Rise LightBurn.';
  return (
    <span title={dica} className={`inline-flex items-center gap-1.5 text-xs whitespace-nowrap ${COR_DO_TEXTO[frescor.cor] ?? ""}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${COR_DO_PONTO[frescor.cor] ?? "bg-slate-300"}`} />
      {frescor.texto}
    </span>
  );
}

const EM_REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Por onde o aviso começa a aparecer (80 % do teto): a mesma regra de `estadoDoOrcamento`. */
const INICIO_DO_AVISO = 80;

const COR_DA_BARRA = { normal: "bg-acento", aviso: "bg-amber-500", esgotado: "bg-red-500" };

/**
 * O gasto do mês contra o teto, numa barra fina: azul até 80 %, âmbar de 80 % a 99 % e vermelha quando o teto acaba. A
 * marca em 80 % mostra de onde o aviso começa. Os valores em `tabular-nums`, para os números não dançarem quando mudam.
 * Serve às Configurações (aba Orçamentos) e à página de Consumo; não tem estado, então roda no servidor e no navegador.
 *
 * @param {{ rotulo: string, gastoBrl: number, tetoBrl: number, percentual: number, nivel: "normal" | "aviso" | "esgotado" }} props
 */
export default function BarraDeOrcamento({ rotulo, gastoBrl, tetoBrl, percentual, nivel }) {
  const preenchido = Math.min(100, Math.max(0, percentual));
  const gasto = EM_REAIS.format(gastoBrl);
  const teto = EM_REAIS.format(tetoBrl);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate text-suave" title={rotulo}>
          {rotulo}
        </span>
        <span className="shrink-0 tabular-nums whitespace-nowrap">
          <strong className="font-semibold">{gasto}</strong> <span className="text-suave">de {teto} ({percentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} %)</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${rotulo}: ${gasto} de ${teto}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(preenchido)}
        className="relative mt-2 h-2 overflow-hidden rounded-full bg-fundo"
      >
        <div className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${COR_DA_BARRA[nivel] ?? COR_DA_BARRA.normal}`} style={{ width: `${preenchido}%` }} />
        <span aria-hidden="true" className="absolute inset-y-0 w-px bg-superficie" style={{ left: `${INICIO_DO_AVISO}%` }} />
      </div>
    </div>
  );
}

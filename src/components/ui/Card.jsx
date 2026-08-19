export default function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-lg border border-borda bg-superficie p-5 ${className}`}
    >
      {children}
    </div>
  );
}

/** Card de indicador do painel: rotulo em cima, numero grande embaixo. */
export function CardIndicador({ rotulo, valor, detalhe, icone: Icone }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-suave">{rotulo}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{valor}</p>
          {detalhe && <p className="mt-1 text-xs text-suave">{detalhe}</p>}
        </div>
        {Icone && (
          <span className="rounded-md bg-fundo p-2 text-acento">
            <Icone size={18} />
          </span>
        )}
      </div>
    </Card>
  );
}

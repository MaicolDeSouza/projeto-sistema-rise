/**
 * O medidor da linha da lista do minimo: uma barra fina na escala ate o maximo, com o estoque de hoje, o que ja esta
 * a caminho (tracejado) e o traco do minimo. Le-se "quanto falta" sem ler numero; os numeros ficam nas colunas.
 */
export default function MedidorDeEstoque({ estoque, aCaminho = 0, minimo, maximo }) {
  const atual = Math.max(0, Number(estoque) || 0);
  const chegando = Math.max(0, Number(aCaminho) || 0);
  // A escala e o maximo; sem ele (ou com estoque acima dele, o que nao deveria acontecer aqui), o maior dos numeros.
  const escala = Math.max(Number(maximo) || 0, minimo * 2, atual + chegando, 1);
  const pct = (valor) => `${Math.min(100, (valor / escala) * 100)}%`;
  const texto = `Estoque ${atual}${chegando ? ` + ${chegando} a caminho` : ""} de mínimo ${minimo}${maximo ? `, máximo ${maximo}` : ""}`;

  return (
    <div className="relative mt-1 h-1.5 w-28 rounded-full bg-borda" role="img" aria-label={texto} title={texto}>
      <div className="absolute inset-y-0 left-0 rounded-full bg-amber-500" style={{ width: pct(atual) }} />
      {chegando > 0 && (
        <div
          className="absolute inset-y-0 rounded-r-full bg-[repeating-linear-gradient(90deg,var(--color-acento)_0_3px,transparent_3px_5px)]"
          style={{ left: pct(atual), width: pct(chegando) }}
        />
      )}
      <div className="absolute -top-0.5 h-2.5 w-0.5 rounded bg-texto" style={{ left: pct(minimo) }} />
    </div>
  );
}

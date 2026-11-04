/**
 * Aba Peças (so com falta ou Aguardando peças): uma linha por produto que o pedido consome (o kit e as pecas proprias
 * abertos em pecas), com o necessario, o disponivel depois dos pedidos mais antigos e a previsao da falta. Falta sem
 * previsao fica em ambar: ninguem comprou nem mandou produzir.
 */
export default function AbaPecas({ pecas }) {
  const linhas = pecas?.pecas ?? [];
  if (linhas.length === 0) return <p className="p-5 text-sm text-suave">Nenhuma peça calculada para este pedido.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-borda text-left text-xs tracking-wide text-suave uppercase">
          <tr>
            <th className="px-5 py-2.5 font-medium">Peça</th>
            <th className="w-px whitespace-nowrap px-3 py-2.5 text-right font-medium">Precisa</th>
            <th className="w-px whitespace-nowrap px-3 py-2.5 text-right font-medium">Disponível</th>
            <th className="w-px whitespace-nowrap px-3 py-2.5 text-right font-medium">Falta</th>
            <th className="px-5 py-2.5 font-medium">Previsão</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {linhas.map((peca) => (
            <tr key={peca.produtoId} className={peca.falta > 0 ? "bg-amber-50" : undefined}>
              <td className="max-w-0 px-5 py-2.5">
                <span className="block truncate">{peca.nome ?? peca.sku}</span>
                <span className="font-mono text-xs text-suave">{peca.sku}</span>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{peca.necessario}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{peca.disponivel}</td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${peca.falta > 0 ? "font-semibold text-amber-800" : "text-suave"}`}>{peca.falta > 0 ? peca.falta : "—"}</td>
              <td className="px-5 py-2.5">
                {peca.falta === 0 ? (
                  <span className="text-suave">Tem</span>
                ) : peca.previsao ? (
                  peca.previsao
                ) : (
                  <span className="font-medium text-amber-700">Sem previsão</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

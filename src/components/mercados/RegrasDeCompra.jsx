import { precoComImpostos } from "@/lib/coleta/impostos";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "10 a 19 un." ou "a partir de 20 un."; sem numero, o rotulo como veio. */
function faixaEmTexto(faixa) {
  if (typeof faixa.minimo !== "number") return faixa.rotulo ?? "—";
  if (typeof faixa.maximo === "number") return `${faixa.minimo} a ${faixa.maximo} un.`;
  return `a partir de ${faixa.minimo} un.`;
}

/**
 * Compra em lote e multiplo de venda, cada um na sua caixa, ao lado de Pronta
 * entrega — o desenho do dono em 17/09/2026. Eram linhas de "Caracteristicas", e
 * ele recusou: faixa de preco e multiplo sao regra de COMPRA, nao do produto.
 *
 * Mesma regra da caixa de reserva: sem o dado, a caixa nao aparece. Vazia, diria
 * que o fornecedor nao da desconto por quantidade, quando so nao foi informado.
 *
 * Renderiza FRAGMENTO: as caixas entram na mesma fileira das outras.
 */
export default function RegrasDeCompra({ precoNormal, precosPorQuantidade, multiploVenda, impostos }) {
  const faixas = (precosPorQuantidade ?? []).filter((faixa) => typeof faixa.preco === "number");
  const temMultiplo = typeof multiploVenda === "number" && multiploVenda > 0;
  // O distribuidor cobra o mesmo imposto por fora em qualquer quantidade —
  // pedido do dono em 22/09/2026, depois de ver a Santana com IPI na unidade
  // e o lote sem ele, como se o lote fosse isento.
  const temImposto = impostos?.length > 0;

  return (
    <>
      {faixas.length > 0 && (
        <div className="min-w-[13rem] rounded border border-borda px-3 py-2.5">
          <p className="mb-2 text-xs font-medium tracking-wide text-suave uppercase">Compra em lote</p>
          <table className="text-sm">
            <tbody>
              {faixas.map((faixa) => {
                // Desconto sobre o preco de uma unidade, quando os dois existem.
                // Calculado sobre o valor SEM imposto: como o mesmo imposto
                // incide nos dois lados, a proporcao e igual com ou sem ele.
                const desconto =
                  typeof precoNormal === "number" && precoNormal > 0
                    ? Math.round((1 - faixa.preco / precoNormal) * 1000) / 10
                    : null;
                const comImposto = temImposto ? precoComImpostos(faixa.preco, impostos) : null;
                return (
                  <tr key={`${faixa.minimo}-${faixa.maximo}-${faixa.rotulo}`}>
                    <td className="py-0.5 pr-4 text-suave">{faixaEmTexto(faixa)}</td>
                    <td className="py-0.5 pr-3 text-right font-semibold tabular-nums">
                      {MOEDA.format(comImposto ?? faixa.preco)}
                      {comImposto !== null && (
                        <span className="block text-xs font-normal text-suave">
                          {MOEDA.format(faixa.preco)} sem imposto
                        </span>
                      )}
                    </td>
                    <td className="py-0.5 text-right text-xs text-emerald-700 tabular-nums">
                      {desconto > 0 ? `-${String(desconto).replace(".", ",")}%` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {temMultiplo && (
        <div className="min-w-[9rem] rounded border border-borda px-3 py-2.5">
          <p className="mb-2 text-xs font-medium tracking-wide text-suave uppercase">Múltiplo de venda</p>
          <p className="text-lg font-semibold tabular-nums">{multiploVenda}</p>
          <p className="text-xs text-suave">
            {multiploVenda > 1 ? `vendido de ${multiploVenda} em ${multiploVenda}` : "vendido por unidade"}
          </p>
        </div>
      )}
    </>
  );
}

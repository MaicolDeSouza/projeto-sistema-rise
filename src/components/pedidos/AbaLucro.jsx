import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import AceitarDivergencia from "./AceitarDivergencia";
import { mercadoPagoParaTela } from "@/lib/pedidos/mercadoPago";

import { diaMes, linhasDoMercadoPago, moeda, moedaComSinal, TEXTO_DA_FONTE } from "./formato";

const PARCELAS = [
  { chave: "receita", rotulo: "Receita (produtos)", sinal: 1 },
  { chave: "comissao", rotulo: "Comissão", sinal: -1 },
  { chave: "tarifaFixa", rotulo: "Tarifa fixa", sinal: -1 },
  { chave: "frete", rotulo: "Frete pago", sinal: -1 },
  { chave: "imposto", rotulo: "Imposto (6%)", sinal: -1 },
  { chave: "custo", rotulo: "Custo dos produtos", sinal: -1 },
];

const valor = (numero) => (numero === null || numero === undefined ? null : Number(numero));

function Valor({ numero, sinal, className = "" }) {
  if (numero === null) return <span className="text-suave">—</span>;
  const texto = moeda.format(Math.abs(numero));
  return <span className={`tabular-nums ${className}`}>{sinal < 0 && numero !== 0 ? `−${texto}` : texto}</span>;
}

/** A data da devolucao: o passo "returned" do historico do pedido, ou o do envio. */
function dataDaDevolucao(pedido) {
  const passo = (Array.isArray(pedido.historico) ? pedido.historico : []).find((h) => /return|devolv/i.test(String(h.statusDaOrigem ?? "")));
  return passo?.em ?? pedido.envio?.historico?.devolvidoEm ?? null;
}

/**
 * Aba Lucro: a estimativa (o que o editor mostrava no dia da venda) e o real (o que o canal informou), parcela a
 * parcela, com a fonte de cada numero do real em cinza. Com divergencia, a parcela que mais pesou na diferenca fica em
 * ambar. Pedido devolvido no ML: a venda sai do balanco e so o frete de retorno fica, em vermelho, como prejuizo.
 */
export default function AbaLucro({ pedido, podeAceitar = false }) {
  // Sem estimativa de verdade (o anuncio do ML nao foi lido: `origem` nula), a coluna mostra "—", nunca R$ 0,00.
  const estimativa = pedido.estimativa?.origem ? pedido.estimativa : null;
  const real = pedido.real ?? null;
  const devolvido = pedido.status === "DEVOLVIDO";
  const cancelado = pedido.status === "CANCELADO";
  const divergente = pedido.avisos?.includes("lucroDivergente");

  // A parcela que mais explica a diferenca (so quando o "!" de divergencia esta ligado).
  let maisPesou = null;
  if (divergente && estimativa && real) {
    let maior = 0;
    for (const { chave } of PARCELAS) {
      const diferenca = Math.abs((valor(real[chave]) ?? 0) - (valor(estimativa[chave]) ?? 0));
      if (diferenca > maior) {
        maior = diferenca;
        maisPesou = chave;
      }
    }
  }

  const lucroEstimado = valor(estimativa?.lucro);
  const lucroReal = valor(real?.lucro);
  // O Mercado Pago (09/11/2026): a explicacao abre ao passar o mouse ou clicar no lucro real, nunca fixa na aba.
  const mp = mercadoPagoParaTela(pedido.mercadoPago);
  const conferido = mp?.estado === "bate" && !devolvido;
  const divergeDoMP = mp?.estado === "diverge";
  const quando = devolvido ? dataDaDevolucao(pedido) : null;

  return (
    <div className="p-5">
      {devolvido && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Devolvido{quando ? ` em ${diaMes(quando)}` : ""}: a venda saiu do balanço e o frete de retorno fica como prejuízo.
        </p>
      )}
      {cancelado && <p className="mb-4 text-sm text-suave">Venda cancelada: não entra no lucro.</p>}

      <div className="max-w-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-borda text-left text-xs text-suave">
            <tr>
              <th className="py-2 pr-3 font-medium">
                <span className="inline-flex items-center gap-1">
                  Parcela
                  <BolhaDeAjuda
                    variante="inline"
                    texto={
                      <>
                        <span className="block">Lucro = receita − comissão − tarifa fixa − frete pago − imposto − custo dos produtos.</span>
                        <span className="block">A receita é o total dos produtos; o frete cobrado do cliente não entra.</span>
                        <span className="block">O custo é o do dia da venda e não muda depois.</span>
                      </>
                    }
                  />
                </span>
              </th>
              <th className="w-36 px-3 py-2 text-right font-medium">
                Estimativa
                {estimativa?.origem && <span className="block font-normal">{TEXTO_DA_FONTE[estimativa.origem] ?? estimativa.origem}</span>}
              </th>
              <th className="w-44 py-2 pl-3 text-right font-medium">{pedido.lucroFechado ? "Real (fechado)" : conferido ? "Real (conferido)" : "Real até agora"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {PARCELAS.map(({ chave, rotulo, sinal }) => {
              const fonte = real?.fontes?.[chave];
              const destaque = maisPesou === chave;
              const freteDeRetorno = devolvido && chave === "frete";
              return (
                <tr key={chave} className={destaque ? "bg-amber-50" : undefined}>
                  <td className={`py-2 pr-3 ${destaque ? "font-medium text-amber-900" : ""}`}>{freteDeRetorno ? "Frete de retorno" : rotulo}</td>
                  <td className="px-3 py-2 text-right">
                    <Valor numero={valor(estimativa?.[chave])} sinal={sinal} className="text-suave" />
                  </td>
                  <td className="py-2 pl-3 text-right">
                    <Valor numero={valor(real?.[chave])} sinal={sinal} className={freteDeRetorno && valor(real?.[chave]) > 0 ? "font-semibold text-red-600" : ""} />
                    {fonte && <span className="block text-xs text-suave">{TEXTO_DA_FONTE[fonte] ?? fonte}</span>}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-borda font-semibold">
              <td className="py-2.5 pr-3">Lucro</td>
              <td className="px-3 py-2.5 text-right">
                {lucroEstimado === null ? <span className="text-suave">—</span> : <span className={`tabular-nums ${lucroEstimado < 0 ? "text-red-600" : ""}`}>{moedaComSinal(lucroEstimado)}</span>}
              </td>
              <td className="py-2.5 pl-3 text-right">
                {lucroReal === null ? (
                  <span className="text-suave" title="Algum item está sem custo">
                    em aberto
                  </span>
                ) : mp ? (
                  <BolhaDeAjuda variante="inline" texto={linhasDoMercadoPago(mp).map((linha) => <span key={linha} className="block">{linha}</span>)}>
                    <span className={`tabular-nums ${lucroReal < 0 ? "text-red-600" : divergente || divergeDoMP ? "text-amber-800" : ""}`}>{moedaComSinal(lucroReal)}</span>
                  </BolhaDeAjuda>
                ) : (
                  <span className={`tabular-nums ${lucroReal < 0 ? "text-red-600" : divergente ? "text-amber-800" : ""}`}>{moedaComSinal(lucroReal)}</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {/* "Aceitar divergência" (09/11/2026): so com a divergencia do lucro acesa e o acesso da acao; pede o codigo do Conferido. */}
      {podeAceitar && (pedido.avisos ?? []).some((chave) => chave === "lucroDivergente" || chave === "lucroDiferenteDoMercadoPago") && (
        <div className="mt-4 flex max-w-2xl justify-end">
          <AceitarDivergencia pedidoId={pedido.id} />
        </div>
      )}
    </div>
  );
}

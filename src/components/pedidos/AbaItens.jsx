import { Package } from "lucide-react";

import FotoComLupa from "@/components/ui/FotoComLupa";

import { moeda } from "./formato";

/** O "R" do Rise na linha do item: verde quando o produto esta Conferido, fosco quando nao, cinza quando nao existe no Rise. */
function IconeDoRise({ item }) {
  if (!item.produtoId) {
    return (
      <span title="Fora do Rise: o código do canal não casou com nenhum produto" className="flex h-5 w-5 items-center justify-center rounded bg-zinc-200 text-[11px] font-bold text-zinc-500">
        ?
      </span>
    );
  }
  return (
    <span
      title={item.conferido ? "Produto conferido no Rise" : "Produto no Rise, ainda não conferido"}
      className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold text-white ${item.conferido ? "bg-emerald-600" : "bg-emerald-600/35"}`}
    >
      R
    </span>
  );
}

/**
 * Aba Itens (desenho do dono em 04/11/2026): foto, nome com a localizacao no estoque embaixo, o codigo (abre o produto
 * no Rise em outra aba), Quantidade, Valor un. e Valor total, e o total do pedido logo abaixo (com o frete cobrado,
 * quando houver, para a conta fechar). Custo e comissao ficam na aba Lucro.
 */
export default function AbaItens({ pedido }) {
  const itens = pedido.itens ?? [];
  const frete = Number(pedido.freteCobrado ?? 0);
  const desconto = Number(pedido.desconto ?? 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-borda text-left text-xs tracking-wide text-suave uppercase">
          <tr>
            <th className="px-5 py-2.5 font-medium">Produto</th>
            <th className="w-px whitespace-nowrap px-3 py-2.5 text-right font-medium">Quantidade</th>
            <th className="w-px whitespace-nowrap px-3 py-2.5 text-right font-medium">Valor un.</th>
            <th className="w-px whitespace-nowrap px-5 py-2.5 text-right font-medium">Valor total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {itens.map((item) => (
            <tr key={item.id}>
              <td className="max-w-0 px-5 py-2.5">
                <span className="flex min-w-0 items-center gap-3">
                  {item.produto?.foto ? (
                    <FotoComLupa src={item.produto.foto} alt={item.titulo} className="h-10 w-10 shrink-0" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-borda bg-fundo text-suave">
                      <Package size={16} aria-hidden="true" />
                    </span>
                  )}
                  <span className="min-w-0">
                    {/* O nome tambem abre o produto em nova aba, como o codigo (pedido do dono em 04/11/2026). */}
                    {item.produto ? (
                      <a
                        href={`/produtos/${item.produto.id}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir o produto em nova aba"
                        className="block truncate hover:text-acento hover:underline"
                      >
                        {item.titulo}
                      </a>
                    ) : (
                      <span className="block truncate">{item.titulo}</span>
                    )}
                    {item.produto?.localizacao && (
                      <span className="block text-xs text-suave" title="Localização no estoque">
                        Local: <span className="font-mono font-medium text-texto">{item.produto.localizacao}</span>
                      </span>
                    )}
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-suave">
                      <IconeDoRise item={item} />
                      {item.produto ? (
                        <a
                          href={`/produtos/${item.produto.id}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Abrir o produto em outra aba"
                          className="font-mono hover:text-acento hover:underline"
                        >
                          {item.produto.sku}
                        </a>
                      ) : (
                        <span className="font-mono">{item.codigoNaOrigem ?? "sem código"}</span>
                      )}
                      {item.produto && item.codigoNaOrigem && item.codigoNaOrigem !== item.produto.sku && <span title="Código no canal">({item.codigoNaOrigem})</span>}
                    </span>
                  </span>
                </span>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{item.quantidade}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{moeda.format(item.precoUnitario ?? 0)}</td>
              <td className="whitespace-nowrap px-5 py-2.5 text-right tabular-nums">{moeda.format(item.total ?? 0)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-borda text-sm">
          {(frete > 0 || desconto > 0) && (
            <tr>
              <td colSpan={3} className="px-3 pt-2.5 text-right text-suave">
                Produtos
              </td>
              <td className="whitespace-nowrap px-5 pt-2.5 text-right tabular-nums">{moeda.format(pedido.totalProdutos ?? 0)}</td>
            </tr>
          )}
          {desconto > 0 && (
            <tr>
              <td colSpan={3} className="px-3 pt-1 text-right text-suave">
                Desconto
              </td>
              <td className="whitespace-nowrap px-5 pt-1 text-right tabular-nums">−{moeda.format(desconto)}</td>
            </tr>
          )}
          {frete > 0 && (
            <tr>
              <td colSpan={3} className="px-3 pt-1 text-right text-suave">
                Frete cobrado
              </td>
              <td className="whitespace-nowrap px-5 pt-1 text-right tabular-nums">{moeda.format(frete)}</td>
            </tr>
          )}
          <tr className="font-semibold">
            <td colSpan={3} className="px-3 py-3 text-right">
              Valor total do pedido
            </td>
            <td className="whitespace-nowrap px-5 py-3 text-right text-base tabular-nums">{moeda.format(pedido.total ?? 0)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

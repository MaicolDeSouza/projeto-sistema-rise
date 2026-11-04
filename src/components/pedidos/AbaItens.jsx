import Link from "next/link";
import { Package } from "lucide-react";

import FotoComLupa from "@/components/ui/FotoComLupa";

import { moeda } from "./formato";

const TEXTO_DO_CUSTO = {
  kit: "Custo do kit: soma das peças no dia da venda",
  pecas: "Custo das peças próprias no dia da venda",
  fornecedorPadrao: "Custo do fornecedor padrão no dia da venda",
  rascunhoBling: "Custo do fornecedor no Bling no dia da venda",
  cadastro: "Custo do cadastro no dia da venda",
};

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
 * Aba Itens: foto, nome, codigo, o "R" do Rise, quantidade, preco, custo congelado (so com `dado.custo`; o `title` diz
 * de onde ele veio) e a comissao do canal (o ML a informa por item).
 */
export default function AbaItens({ itens, veCusto }) {
  const temComissao = itens.some((item) => item.comissao !== null && item.comissao !== undefined);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-borda text-left text-xs tracking-wide text-suave uppercase">
          <tr>
            <th className="px-5 py-2.5 font-medium">Produto</th>
            <th className="w-px px-3 py-2.5 text-right font-medium">Qtd.</th>
            <th className="w-px whitespace-nowrap px-3 py-2.5 text-right font-medium">Preço</th>
            <th className="w-px whitespace-nowrap px-3 py-2.5 text-right font-medium">Total</th>
            {veCusto && <th className="w-px whitespace-nowrap px-3 py-2.5 text-right font-medium">Custo un.</th>}
            {temComissao && <th className="w-px whitespace-nowrap px-5 py-2.5 text-right font-medium">Comissão</th>}
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
                    <span className="block truncate">{item.titulo}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-suave">
                      <IconeDoRise item={item} />
                      {item.produto ? (
                        <Link href={`/produtos/${item.produto.id}`} className="font-mono hover:text-acento hover:underline">
                          {item.produto.sku}
                        </Link>
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
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{moeda.format(item.total ?? 0)}</td>
              {veCusto && (
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums" title={TEXTO_DO_CUSTO[item.custoOrigem] ?? undefined}>
                  {item.custoUnitarioCongelado !== null && item.custoUnitarioCongelado !== undefined ? (
                    moeda.format(item.custoUnitarioCongelado)
                  ) : (
                    <span className="text-amber-700" title="Sem custo: o lucro deste pedido fica em aberto">
                      sem custo
                    </span>
                  )}
                </td>
              )}
              {temComissao && <td className="whitespace-nowrap px-5 py-2.5 text-right tabular-nums">{item.comissao !== null && item.comissao !== undefined ? moeda.format(item.comissao) : "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

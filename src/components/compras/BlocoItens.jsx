"use client";

import { ExternalLink, Plus, Trash2 } from "lucide-react";

import SecaoDoAnuncio from "@/components/anuncios/ml/SecaoDoAnuncio";
import FotoComLupa from "@/components/ui/FotoComLupa";
import { totalDoItem } from "@/lib/compras/regras";
import BuscaDeItem from "./BuscaDeItem";
import { doTexto, moeda, soDecimal, soDigitos } from "./formato";

const campo =
  "w-full rounded-md border border-borda bg-superficie px-2 py-1.5 text-sm tabular-nums focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/20 disabled:border-transparent disabled:bg-transparent disabled:px-0 aria-[invalid=true]:border-rose-500";

/**
 * Os itens do pedido, no molde do pedido de compra do Bling. Em rascunho tudo e editavel; depois de enviado so o prazo
 * (o PDF ja foi ao fornecedor). A coluna "Chegada" (lancar estoque) e de quem chama: `colunaDeChegada(item)`.
 */
export default function BlocoItens({
  pedidoId,
  fornecedor,
  itens,
  editar,
  editarPrazo,
  veCusto,
  erros,
  aoMudar,
  aoRemover,
  aoAdicionar,
  buscando,
  setBuscando,
  colunaDeChegada = null,
}) {
  const erro = (indice, nome) => erros?.[`itens.${indice}.${nome}`];

  return (
    <SecaoDoAnuncio
      titulo={`Itens do pedido (${itens.length})`}
      ajuda="Nome e código no fornecedor vêm do vínculo do produto; são eles que vão no PDF. Depois de enviado, só o prazo muda."
    >
      {itens.length === 0 ? (
        <p className="py-4 text-center text-sm text-suave">Nenhum item. Adicione pela lista do estoque mínimo ou pelo botão abaixo.</p>
      ) : (
        <div className="-mx-4 -mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-borda text-left text-xs text-suave">
              <tr>
                <th className="w-14 px-3 py-2 font-medium">Foto</th>
                <th className="min-w-48 px-3 py-2 font-medium">Produto</th>
                <th className="min-w-44 px-3 py-2 font-medium">Nome no fornecedor</th>
                <th className="w-32 px-3 py-2 font-medium">Código fornecedor</th>
                <th className="w-20 px-3 py-2 text-right font-medium">Qtde</th>
                {veCusto && <th className="w-28 px-3 py-2 text-right font-medium">Preço un.</th>}
                {veCusto && <th className="w-16 px-3 py-2 text-right font-medium">IPI %</th>}
                {veCusto && <th className="w-28 px-3 py-2 text-right font-medium">Total</th>}
                <th className="w-20 px-3 py-2 text-right font-medium">Prazo</th>
                <th className="w-10 px-2 py-2"><span className="sr-only">Link</span></th>
                {colunaDeChegada && <th className="px-3 py-2 font-medium">Chegada</th>}
                {editar && <th className="w-10 px-2 py-2"><span className="sr-only">Excluir</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {itens.map((item, indice) => (
                <tr key={item.id} className="align-top">
                  <td className="px-3 py-2">
                    {item.foto ? <FotoComLupa src={item.foto} alt={item.nome} className="h-10 w-10" /> : <span className="block h-10 w-10 rounded border border-dashed border-borda" />}
                  </td>
                  <td className="max-w-64 px-3 py-2">
                    <p className="truncate font-medium" title={item.nome}>{item.nome}</p>
                    <p className="font-mono text-xs text-suave">{item.sku}</p>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={item.nomeNoFornecedor ?? ""}
                      disabled={!editar}
                      onChange={(evento) => aoMudar(indice, "nomeNoFornecedor", evento.target.value)}
                      aria-label={`Nome no fornecedor de ${item.sku}`}
                      placeholder="—"
                      className={`${campo} truncate`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={item.codigoNoFornecedor ?? ""}
                      disabled={!editar}
                      onChange={(evento) => aoMudar(indice, "codigoNoFornecedor", evento.target.value)}
                      aria-label={`Código no fornecedor de ${item.sku}`}
                      placeholder="—"
                      className={`${campo} font-mono text-xs`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      inputMode="numeric"
                      value={item.quantidade}
                      disabled={!editar}
                      aria-invalid={Boolean(erro(indice, "quantidade"))}
                      title={erro(indice, "quantidade")}
                      onChange={(evento) => aoMudar(indice, "quantidade", soDigitos(evento.target.value))}
                      aria-label={`Quantidade de ${item.sku}`}
                      className={`${campo} text-right`}
                    />
                  </td>
                  {veCusto && (
                    <td className="px-3 py-2">
                      <input
                        inputMode="decimal"
                        value={item.precoUnitario}
                        disabled={!editar}
                        placeholder="sem preço"
                        aria-invalid={Boolean(erro(indice, "precoUnitario")) || (editar && !item.precoUnitario)}
                        title={erro(indice, "precoUnitario") ?? (item.precoUnitario ? undefined : "Sem preço: o pedido não pode ser enviado assim")}
                        onChange={(evento) => aoMudar(indice, "precoUnitario", soDecimal(evento.target.value))}
                        aria-label={`Preço unitário de ${item.sku}`}
                        className={`${campo} text-right`}
                      />
                    </td>
                  )}
                  {veCusto && (
                    <td className="px-3 py-2">
                      <input
                        inputMode="decimal"
                        value={item.ipiPercentual}
                        disabled={!editar}
                        aria-invalid={Boolean(erro(indice, "ipiPercentual"))}
                        title={erro(indice, "ipiPercentual")}
                        onChange={(evento) => aoMudar(indice, "ipiPercentual", soDecimal(evento.target.value))}
                        aria-label={`IPI de ${item.sku}`}
                        className={`${campo} text-right`}
                      />
                    </td>
                  )}
                  {veCusto && (
                    <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">
                      {moeda.format(totalDoItem({ quantidade: doTexto(item.quantidade) ?? 0, precoUnitario: doTexto(item.precoUnitario) }))}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        inputMode="numeric"
                        value={item.prazoDias}
                        disabled={!editarPrazo}
                        aria-invalid={Boolean(erro(indice, "prazoDias"))}
                        onChange={(evento) => aoMudar(indice, "prazoDias", soDigitos(evento.target.value, 4))}
                        aria-label={`Prazo de entrega de ${item.sku}, em dias`}
                        className={`${campo} text-right`}
                      />
                      <span className="text-xs text-suave">d</span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    {item.link && /^https?:\/\//i.test(item.link) && (
                      <a href={item.link} target="_blank" rel="noreferrer" title="Abrir no site do fornecedor" className="inline-flex rounded p-1.5 text-suave hover:bg-fundo hover:text-acento">
                        <ExternalLink size={15} />
                      </a>
                    )}
                  </td>
                  {colunaDeChegada && <td className="px-3 py-2">{colunaDeChegada(item)}</td>}
                  {editar && (
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        onClick={() => aoRemover(indice)}
                        aria-label={`Tirar ${item.sku} do pedido`}
                        title="Tirar do pedido"
                        className="rounded p-1.5 text-suave hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editar &&
        (buscando ? (
          <BuscaDeItem pedidoId={pedidoId} fornecedor={fornecedor} aoEscolher={aoAdicionar} aoFechar={() => setBuscando(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setBuscando(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-acento hover:bg-acento/5"
          >
            <Plus size={16} /> Adicionar outro item
          </button>
        ))}
    </SecaoDoAnuncio>
  );
}

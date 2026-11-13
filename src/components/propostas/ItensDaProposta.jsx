"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, PackagePlus, Plus, Search, Trash2 } from "lucide-react";

import { buscarProdutosAcao, produtoParaPropostaAcao } from "@/app/propostas/acoes";
import SecaoDoAnuncio from "@/components/anuncios/ml/SecaoDoAnuncio";
import FotoComLupa from "@/components/ui/FotoComLupa";
import { UNIDADES_DA_PROPOSTA, markupDoItem, totalDoItem } from "@/lib/propostas/regras";
import { chaveNova, doTexto, itemDoFormulario, moeda, soDecimal, soDigitos } from "./formato";

const celula = "w-full rounded border border-borda bg-superficie px-2 py-1.5 text-sm focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/20 disabled:bg-fundo disabled:text-suave aria-[invalid=true]:border-rose-500";

/** "+ Adicionar item": acha o produto do Rise pelo codigo ou nome; ou entra um item avulso (sem cadastro). */
function BuscaDeProduto({ aoEscolher, aoAvulso }) {
  const [texto, setTexto] = useState("");
  const [achados, setAchados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [escolhendo, setEscolhendo] = useState(null);
  const vez = useRef(0);

  useEffect(() => {
    const termo = texto.trim();
    if (termo.length < 2) return undefined;
    const minha = ++vez.current;
    const relogio = setTimeout(async () => {
      setBuscando(true);
      const lista = await buscarProdutosAcao(termo);
      if (minha !== vez.current) return;
      setAchados(Array.isArray(lista) ? lista : []);
      setBuscando(false);
    }, 300);
    return () => clearTimeout(relogio);
  }, [texto]);

  return (
    <div className="flex flex-wrap items-start gap-2">
      <div className="relative w-full max-w-md">
        <Search size={16} className="pointer-events-none absolute top-2.5 left-2.5 text-suave" />
        <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código ou nome do produto" aria-label="Buscar produto" className={`${celula} py-2 pl-8`} />
        {buscando && <Loader2 size={16} className="absolute top-2.5 right-2.5 animate-spin text-suave" />}
        {texto.trim().length >= 2 && !buscando && (
          <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-borda bg-superficie py-1 shadow-lg">
            {achados.length === 0 && <p className="px-3 py-2 text-sm text-suave">Nenhum produto. Use “Item avulso”.</p>}
            {achados.map((a) => (
              <button
                key={a.produtoId}
                type="button"
                disabled={escolhendo !== null}
                onClick={async () => {
                  setEscolhendo(a.produtoId);
                  await aoEscolher(a.produtoId);
                  setEscolhendo(null);
                  setTexto("");
                }}
                className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm hover:bg-fundo disabled:opacity-60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {a.fotoUrl ? <img src={a.fotoUrl} alt="" className="h-8 w-8 shrink-0 rounded object-contain outline outline-1 -outline-offset-1 outline-black/10" /> : <span className="h-8 w-8 shrink-0 rounded bg-fundo" />}
                <span className="w-24 shrink-0 font-mono text-xs">{a.sku}</span>
                <span className={`min-w-0 flex-1 truncate ${a.ativo ? "" : "text-suave line-through"}`}>{a.nome}</span>
                <span className="shrink-0 tabular-nums text-suave">{a.preco !== null ? moeda.format(a.preco) : "—"}</span>
                {escolhendo === a.produtoId && <Loader2 size={14} className="animate-spin" />}
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" onClick={aoAvulso} className="inline-flex items-center gap-1.5 rounded-md border border-borda px-3 py-2 text-sm hover:bg-fundo" title="Item sem cadastro no Rise (algo comprado só para este cliente)">
        <PackagePlus size={16} /> Item avulso
      </button>
    </div>
  );
}

/**
 * Os itens da proposta. O operador ve primeiro a DESCRICAO DO CLIENTE (a que sai no PDF), o codigo do cliente, a
 * quantidade e o total; nosso codigo fica pequeno embaixo, so na tela. Custo e lucro (markup) so para quem ve custo.
 */
export default function ItensDaProposta({ itens, editar, veCusto, erros, aoMudar, aoTrocar, aoErro, exigeMarcaModelo = false }) {
  const [adicionando, setAdicionando] = useState(false);
  const [obsAberta, setObsAberta] = useState(null);

  const mudarItem = (indice, campo, valor) => aoTrocar(itens.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)));
  const remover = (indice) => aoTrocar(itens.filter((_, i) => i !== indice));

  async function adicionarProduto(produtoId) {
    const dados = await produtoParaPropostaAcao(produtoId);
    if (!dados) return aoErro("Não foi possível adicionar o produto.");
    aoTrocar([...itens, itemDoFormulario({ ...dados, descricaoCliente: "", quantidade: 1 })]);
    setAdicionando(false);
  }
  function adicionarAvulso() {
    aoTrocar([...itens, { ...itemDoFormulario({ quantidade: 1 }), chave: chaveNova() }]);
    setAdicionando(false);
  }

  return (
    <SecaoDoAnuncio
      titulo={`Itens (${itens.length})`}
      ajuda="A descrição do cliente é a que sai no PDF; nosso código e nome ficam só aqui. O mesmo produto pode entrar duas vezes, com descrições diferentes."
      acao={
        editar && !adicionando ? (
          <button type="button" onClick={() => setAdicionando(true)} className="inline-flex items-center gap-1 text-sm font-medium text-acento hover:underline">
            <Plus size={15} /> Adicionar item
          </button>
        ) : null
      }
    >
      {adicionando && (
        <div className="mb-4">
          <BuscaDeProduto aoEscolher={adicionarProduto} aoAvulso={adicionarAvulso} />
        </div>
      )}
      {itens.length === 0 ? (
        <p className="py-6 text-center text-sm text-suave">Nenhum item ainda.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="text-left text-xs text-suave">
              <tr className="border-b border-borda">
                <th className="w-14 px-2 py-2 pl-4"><span className="sr-only">Foto</span></th>
                <th className="px-2 py-2">Descrição do cliente</th>
                <th className="w-40 px-2 py-2">Cód. / Marca / Modelo</th>
                <th className="w-20 px-2 py-2 text-right">Qtd.</th>
                <th className="w-20 px-2 py-2">Un.</th>
                <th className="w-28 px-2 py-2 text-right">Unitário</th>
                <th className="w-20 px-2 py-2 text-right whitespace-nowrap">Desc. %</th>
                <th className="w-28 px-2 py-2 text-right">Total</th>
                <th className="w-44 px-2 py-2">Prazo</th>
                {veCusto && <th className="w-28 px-2 py-2 text-right">Custo</th>}
                {veCusto && <th className="w-16 px-2 py-2 text-right">Lucro</th>}
                {editar && <th className="w-10 px-2 py-2 pr-4"><span className="sr-only">Remover</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {itens.map((item, indice) => {
                const erro = (campo) => erros[`itens.${indice}.${campo}`];
                const numeros = {
                  quantidade: doTexto(item.quantidade) ?? 0,
                  precoUnitario: doTexto(item.precoUnitario) ?? 0,
                  descontoPercentual: doTexto(item.descontoPercentual) ?? 0,
                  custoUnitario: doTexto(item.custoUnitario),
                };
                const markup = markupDoItem(numeros);
                const semDescricao = !item.descricaoCliente.trim();
                return (
                  <tr key={item.chave} className="align-top">
                    <td className="px-2 py-2 pl-4">
                      {item.fotoUrl ? <FotoComLupa src={item.fotoUrl} alt={item.nomeInterno ?? ""} className="h-10 w-10" /> : <span className="block h-10 w-10 rounded bg-fundo" />}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-start gap-1.5">
                        <textarea
                          rows={1}
                          value={item.descricaoCliente}
                          disabled={!editar}
                          placeholder="Como o cliente pediu"
                          aria-invalid={Boolean(erro("descricaoCliente"))}
                          onChange={(e) => mudarItem(indice, "descricaoCliente", e.target.value)}
                          className={`${celula} field-sizing-content min-h-9 resize-none`}
                        />
                        {semDescricao && (
                          <span className="mt-2 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white" title="Sem a descrição do cliente: ela é a que sai no PDF" aria-label="Sem a descrição do cliente">
                            !
                          </span>
                        )}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-suave">
                        {item.produtoId ? (
                          <span className="min-w-0 truncate" title={item.nomeInterno ?? ""}>
                            <span className="font-mono">{item.sku}</span> · {item.nomeInterno}
                          </span>
                        ) : (
                          <span>sem cadastro</span>
                        )}
                        {editar && !item.observacao && obsAberta !== item.chave && (
                          <button type="button" onClick={() => setObsAberta(item.chave)} className="font-medium text-acento hover:underline">
                            +Obs.
                          </button>
                        )}
                      </p>
                      {(item.observacao || obsAberta === item.chave) && (
                        <textarea
                          rows={1}
                          autoFocus={obsAberta === item.chave}
                          value={item.observacao}
                          disabled={!editar}
                          placeholder="Observação do item (sai no PDF)"
                          onChange={(e) => mudarItem(indice, "observacao", e.target.value)}
                          onBlur={() => setObsAberta(null)}
                          className={`${celula} field-sizing-content mt-1 min-h-8 resize-none bg-amber-50/60 text-xs italic`}
                        />
                      )}
                    </td>
                    <td className="space-y-1 px-2 py-2">
                      <input value={item.codigoCliente} disabled={!editar} placeholder="Código" aria-label="Código do cliente" onChange={(e) => mudarItem(indice, "codigoCliente", e.target.value.slice(0, 100))} className={`${celula} font-mono text-xs`} />
                      {/* Marca e modelo saem no PDF (o SENAI exige; 13/11/2026): vem do produto e se corrigem aqui. */}
                      <input
                        value={item.marca}
                        disabled={!editar}
                        placeholder="Marca"
                        aria-label="Marca"
                        aria-invalid={exigeMarcaModelo && !item.marca.trim()}
                        onChange={(e) => mudarItem(indice, "marca", e.target.value.slice(0, 100))}
                        className={`${celula} text-xs`}
                      />
                      <input
                        value={item.modelo}
                        disabled={!editar}
                        placeholder="Modelo"
                        aria-label="Modelo"
                        aria-invalid={exigeMarcaModelo && !item.modelo.trim()}
                        onChange={(e) => mudarItem(indice, "modelo", e.target.value.slice(0, 150))}
                        className={`${celula} text-xs`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input inputMode="decimal" value={item.quantidade} disabled={!editar} aria-invalid={Boolean(erro("quantidade"))} title={erro("quantidade")} onChange={(e) => mudarItem(indice, "quantidade", soDecimal(e.target.value))} className={`${celula} text-right tabular-nums`} />
                    </td>
                    <td className="px-2 py-2">
                      <select value={item.unidade} disabled={!editar} onChange={(e) => mudarItem(indice, "unidade", e.target.value)} className={celula}>
                        {UNIDADES_DA_PROPOSTA.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input inputMode="decimal" value={item.precoUnitario} disabled={!editar} aria-invalid={Boolean(erro("precoUnitario"))} title={erro("precoUnitario")} onChange={(e) => mudarItem(indice, "precoUnitario", soDecimal(e.target.value))} className={`${celula} text-right tabular-nums`} />
                    </td>
                    <td className="px-2 py-2">
                      <input inputMode="decimal" value={item.descontoPercentual} disabled={!editar} aria-invalid={Boolean(erro("descontoPercentual"))} title={erro("descontoPercentual")} onChange={(e) => mudarItem(indice, "descontoPercentual", soDecimal(e.target.value))} className={`${celula} text-right tabular-nums`} />
                    </td>
                    <td className="px-2 py-2 pt-3.5 text-right font-medium tabular-nums">{moeda.format(totalDoItem(numeros))}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <select
                          value={item.prontaEntrega ? "pronta" : "dias"}
                          disabled={!editar}
                          onChange={(e) => {
                            const pronta = e.target.value === "pronta";
                            aoTrocar(itens.map((it, i) => (i === indice ? { ...it, prontaEntrega: pronta, prazoDiasUteis: pronta ? "" : it.prazoDiasUteis || "5" } : it)));
                          }}
                          className={celula}
                          aria-label="Prazo"
                        >
                          <option value="pronta">Pronta entrega</option>
                          <option value="dias">Dias úteis</option>
                        </select>
                        {!item.prontaEntrega && (
                          <input inputMode="numeric" value={item.prazoDiasUteis} disabled={!editar} aria-label="Dias úteis" aria-invalid={Boolean(erro("prazoDiasUteis"))} onChange={(e) => mudarItem(indice, "prazoDiasUteis", soDigitos(e.target.value, 4))} className={`${celula} w-14 text-right tabular-nums`} />
                        )}
                      </div>
                    </td>
                    {veCusto && (
                      <td className="px-2 py-2">
                        <input inputMode="decimal" value={item.custoUnitario} disabled={!editar} onChange={(e) => mudarItem(indice, "custoUnitario", soDecimal(e.target.value))} className={`${celula} text-right tabular-nums`} />
                      </td>
                    )}
                    {veCusto && (
                      <td className={`px-2 py-2 pt-3.5 text-right tabular-nums ${markup === null ? "text-suave" : markup < 0 ? "text-rose-600" : markup < 60 ? "text-amber-700" : "text-emerald-700"}`}>
                        {markup === null ? "—" : `${Math.round(markup)}%`}
                      </td>
                    )}
                    {editar && (
                      <td className="px-2 py-2 pr-4">
                        <button type="button" onClick={() => remover(indice)} aria-label="Remover o item" title="Remover o item" className="rounded p-1.5 text-suave hover:bg-rose-50 hover:text-rose-600">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SecaoDoAnuncio>
  );
}

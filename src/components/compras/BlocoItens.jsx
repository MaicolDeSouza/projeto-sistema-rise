"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Pencil, Plus, Repeat, Search, Trash2 } from "lucide-react";

import SecaoDoAnuncio from "@/components/anuncios/ml/SecaoDoAnuncio";
import Janela from "@/components/ferramentas/licencas/Janela";
import FotoComLupa from "@/components/ui/FotoComLupa";
import { totalDoItem } from "@/lib/compras/regras";
import { CelulaDeFator, CelulaDeRastreio, LinhasPendentesAliExpress } from "./AliExpressDoPedido";
import BuscaDeItem from "./BuscaDeItem";
import { doTexto, moeda, soDecimal, soDigitos } from "./formato";

const semAcento = (texto) => String(texto ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

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
  // "Lancar estoque" de todos os itens de uma vez (pedido do dono em 07/11/2026), em cima da coluna Chegada.
  chegadaDeTodos = null,
  // Pedido do AliExpress (spec 2026-10-28): linhas sem produto no topo, colunas Opcao e Rastreio, "Trocar produto".
  aliexpress = null,
  podeCasar = false,
  aoAtualizar = null,
  aoTrocarProduto = null,
}) {
  const erro = (indice, nome) => erros?.[`itens.${indice}.${nome}`];
  // Regra 4 do padrao visual: coluna sem dado some (a tabela ja e larga; Opcao e Rastreio so quando algum item tem).
  const mostrarOpcao = Boolean(aliexpress) && itens.some((item) => aliexpress.opcaoPorItem[item.id]);
  // Com um pacote so, o rastreio fica no bloco Frete; a coluna so diz algo quando ha mais de um (qual item foi em qual).
  const mostrarRastreio = Boolean(aliexpress) && (aliexpress.pacotes?.length ?? 0) > 1 && itens.some((item) => aliexpress.rastreioPorItem[item.id]?.length);
  // Prazo de TODOS os itens (pedido do dono em 07/11/2026: "um campo que eu possa colocar a data de entrega e aplicar para
  // todos"): o campo em cima da coluna Prazo, em dias como ela; cada digito vale na hora para todas as linhas, que
  // continuam editaveis uma a uma. Comeca com o prazo comum quando todos sao iguais.
  const prazoComum = itens.length > 0 && itens.every((item) => item.prazoDias === itens[0].prazoDias) ? itens[0].prazoDias : "";
  const [prazoDeTodos, setPrazoDeTodos] = useState(null);
  // Indice do item com a janela "Observação" aberta (null = fechada).
  const [obsAberta, setObsAberta] = useState(null);
  // Busca dentro do pedido (pedido do dono em 07/11/2026, pedido de 141 itens): so esconde linhas; os indices continuam
  // os do formulario. Todas as palavras, sem acento, no nome, SKU, descricao e codigo do fornecedor e na observacao.
  const [busca, setBusca] = useState("");
  const palavras = semAcento(busca).split(/\s+/).filter(Boolean);
  const aparece = (item) => {
    if (!palavras.length) return true;
    const texto = semAcento([item.nome, item.sku, item.nomeNoFornecedor, item.codigoNoFornecedor, item.observacao].filter(Boolean).join(" "));
    return palavras.every((palavra) => texto.includes(palavra));
  };
  const achados = palavras.length ? itens.filter(aparece).length : itens.length;
  const valorDeTodos = prazoDeTodos ?? prazoComum ?? "";
  const mostrarLinhaDeTodos = itens.length > 1 && (editarPrazo || chegadaDeTodos);
  const colunasAntesDoPrazo = 5 + (mostrarOpcao ? 1 : 0) + (aliexpress ? 1 : 0) + (veCusto ? 3 : 0);

  return (
    <SecaoDoAnuncio
      titulo={palavras.length ? `Itens do pedido (${achados} de ${itens.length})` : `Itens do pedido (${itens.length})`}
      ajuda="Descrição e código do fornecedor vêm do vínculo do produto; são eles que vão no PDF. Depois de enviado, só o prazo muda."
      acao={
        itens.length > 1 && (
          <label className="relative block w-64 max-w-full">
            <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-suave" />
            <input
              type="search"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Buscar no pedido"
              aria-label="Buscar item no pedido"
              className="w-full rounded-md border border-borda bg-superficie py-1 pl-7 pr-2 text-sm focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/20"
            />
          </label>
        )
      }
    >
      <LinhasPendentesAliExpress aliexpress={aliexpress} pedidoId={pedidoId} fornecedor={fornecedor} podeCasar={podeCasar} aoAtualizar={aoAtualizar} />
      {itens.length === 0 ? (
        aliexpress ? null : (
        <p className="py-4 text-center text-sm text-suave">Nenhum item. Adicione pela lista do estoque mínimo ou pelo botão abaixo.</p>
        )
      ) : (
        <div className="-mx-4 -mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-borda text-left text-xs text-suave">
              {mostrarLinhaDeTodos && (
                <tr className="border-b border-borda bg-fundo/60">
                  <th colSpan={colunasAntesDoPrazo} className="px-3 py-1.5 text-right font-medium">
                    Todos os itens
                  </th>
                  <th className="px-3 py-1.5 font-normal">
                    {editarPrazo && (
                      <div className="flex items-center gap-1">
                        <input
                          inputMode="numeric"
                          value={valorDeTodos}
                          placeholder="—"
                          onChange={(evento) => {
                            const valor = soDigitos(evento.target.value, 4);
                            setPrazoDeTodos(valor);
                            itens.forEach((_, indice) => aoMudar(indice, "prazoDias", valor));
                          }}
                          aria-label="Prazo de entrega de todos os itens, em dias"
                          title="Prazo de entrega para todos os itens"
                          className={`${campo} min-w-12 text-right`}
                        />
                        <span className="text-xs text-suave">d</span>
                      </div>
                    )}
                  </th>
                  <th className="px-2 py-1.5" />
                  {mostrarRastreio && <th className="px-3 py-1.5" />}
                  {colunaDeChegada && <th className="px-3 py-1.5 font-normal">{chegadaDeTodos}</th>}
                  {editar && <th className="px-2 py-1.5" />}
                </tr>
              )}
              <tr>
                <th className="w-14 px-3 py-2 font-medium">Foto</th>
                {/* Rotulos pedidos pelo dono em 29/10/2026 (print): "Produto" e "Nome no fornecedor" viraram estes. */}
                <th className="min-w-40 px-3 py-2 font-medium">Descrição Rise</th>
                {/* min-w-60: o campo divide a celula com o "+Obs." e a observacao fica embaixo (07/11/2026). */}
                <th className="min-w-60 px-3 py-2 font-medium">Descrição fornecedor</th>
                <th className="w-24 px-3 py-2 font-medium">Código fornecedor</th>
                {mostrarOpcao && <th className="px-3 py-2 font-medium">Opção</th>}
                {aliexpress && <th className="w-20 px-3 py-2 text-right font-medium">Fator</th>}
                <th className="w-20 px-3 py-2 text-right font-medium">Qtde</th>
                {veCusto && <th className="w-28 px-3 py-2 text-right font-medium">Preço un.</th>}
                {veCusto && <th className="w-16 px-3 py-2 text-right font-medium">IPI %</th>}
                {veCusto && <th className="w-28 px-3 py-2 text-right font-medium">Total</th>}
                <th className="w-20 px-3 py-2 text-right font-medium">Prazo</th>
                <th className="w-10 px-2 py-2"><span className="sr-only">Link</span></th>
                {mostrarRastreio && <th className="px-3 py-2 font-medium">Rastreio</th>}
                {colunaDeChegada && <th className="px-3 py-2 font-medium">Chegada</th>}
                {editar && <th className="w-10 px-2 py-2"><span className="sr-only">Excluir</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {palavras.length > 0 && achados === 0 && (
                <tr>
                  <td colSpan={99} className="px-3 py-4 text-center text-sm text-suave">Nenhum item com “{busca}”.</td>
                </tr>
              )}
              {itens.map((item, indice) => (
                <tr key={item.id} className={`align-top ${aparece(item) ? "" : "hidden"}`}>
                  <td className="px-3 py-2">
                    {item.foto ? <FotoComLupa src={item.foto} alt={item.nome} className="h-10 w-10" /> : <span className="block h-10 w-10 rounded border border-dashed border-borda" />}
                  </td>
                  <td className="max-w-52 px-3 py-2">
                    <p className="truncate font-medium" title={item.nome}>{item.nome}</p>
                    <p className="flex items-center gap-1 font-mono text-xs text-suave">
                      {item.sku}
                      {aliexpress && podeCasar && aoTrocarProduto && !item.quantidadeLancada && (
                        <button
                          type="button"
                          onClick={() => aoTrocarProduto(item)}
                          aria-label={`Trocar o produto de ${item.sku}`}
                          title="Trocar produto: o item volta a ficar sem produto"
                          // Icone de 12 px: a area de clique cresce pelo ::after, sem mudar o desenho da linha.
                          className="relative rounded p-0.5 text-suave after:absolute after:-inset-2 after:content-[''] hover:bg-fundo hover:text-acento"
                        >
                          <Repeat size={12} />
                        </button>
                      )}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        value={item.nomeNoFornecedor ?? ""}
                        disabled={!editar}
                        onChange={(evento) => aoMudar(indice, "nomeNoFornecedor", evento.target.value)}
                        aria-label={`Descrição fornecedor de ${item.sku}`}
                        placeholder="—"
                        className={`${campo} min-w-0 truncate`}
                      />
                      {/* "+Obs." (pedido do dono em 07/11/2026): observacao do item para o fornecedor, impressa no PDF. */}
                      {editar && !item.observacao && (
                        <button
                          type="button"
                          onClick={() => setObsAberta(indice)}
                          title="Adicionar observação deste item para o fornecedor (vai no PDF)"
                          className="shrink-0 whitespace-nowrap rounded px-1.5 py-1 text-xs font-semibold text-acento hover:bg-acento/5"
                        >
                          +Obs.
                        </button>
                      )}
                    </div>
                    {item.observacao && (
                      <button
                        type="button"
                        disabled={!editar}
                        onClick={() => setObsAberta(indice)}
                        title={editar ? "Editar observação" : undefined}
                        className="mt-1 flex w-full items-start gap-1 rounded bg-amber-50 px-2 py-1 text-left text-xs text-amber-900 enabled:hover:bg-amber-100 disabled:cursor-default"
                      >
                        <span className="font-semibold">Obs.:</span>
                        <span className="whitespace-pre-line text-pretty">{item.observacao}</span>
                        {editar && <Pencil size={11} className="ml-auto mt-0.5 shrink-0 text-amber-700" />}
                      </button>
                    )}
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
                  {mostrarOpcao && <td className="max-w-40 truncate px-3 py-3 text-xs text-suave">{aliexpress.opcaoPorItem[item.id] ?? "—"}</td>}
                  {aliexpress && (
                    <td className="px-3 py-2 text-right">
                      <CelulaDeFator item={item} fator={aliexpress.fatorPorItem?.[item.id]} podeCasar={podeCasar} aoAtualizar={aoAtualizar} />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <input
                      inputMode="numeric"
                      value={item.quantidade}
                      disabled={!editar}
                      aria-invalid={Boolean(erro(indice, "quantidade"))}
                      title={erro(indice, "quantidade")}
                      onChange={(evento) => aoMudar(indice, "quantidade", soDigitos(evento.target.value))}
                      aria-label={`Quantidade de ${item.sku}`}
                      className={`${campo} min-w-16 text-right`}
                    />
                    {/* Fator (06/11/2026): a quantidade e em caixas do fornecedor; no estoque entram caixas x fator. */}
                    {item.fator > 1 && (
                      <span className="mt-0.5 block whitespace-nowrap text-right text-[11px] text-suave" title={`1 cx = ${item.fator.toLocaleString("pt-BR")} un. no estoque`}>
                        cx = {((doTexto(item.quantidade) ?? 0) * item.fator).toLocaleString("pt-BR")} un.
                      </span>
                    )}
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
                        className={`${campo} min-w-24 text-right`}
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
                        className={`${campo} min-w-14 text-right`}
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
                        className={`${campo} min-w-12 text-right`}
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
                  {mostrarRastreio && (
                    <td className="px-3 py-2">
                      <CelulaDeRastreio pacotes={aliexpress.rastreioPorItem[item.id]} linkDoRastreio={aliexpress.linkDoRastreio} />
                    </td>
                  )}
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

      {obsAberta !== null && itens[obsAberta] && (
        <JanelaObsDoItem
          item={itens[obsAberta]}
          aoSalvar={(texto) => {
            aoMudar(obsAberta, "observacao", texto);
            setObsAberta(null);
          }}
          aoFechar={() => setObsAberta(null)}
        />
      )}
    </SecaoDoAnuncio>
  );
}

/**
 * A janela do "+Obs.": o texto vale no formulario ao clicar Aplicar e vai ao banco no Salvar do pedido, como os outros
 * campos do item. No `<body>` (portal): a tabela rola na horizontal e corta o que e `fixed` em alguns navegadores.
 */
function JanelaObsDoItem({ item, aoSalvar, aoFechar }) {
  const original = item.observacao ?? "";
  const [texto, setTexto] = useState(original);
  const alterado = texto.trim() !== original.trim();
  return createPortal(
    <Janela
      titulo="Observação do item"
      subtitulo={`${item.sku} · ${item.nomeNoFornecedor || item.nome}`}
      alterado={alterado}
      aoFechar={aoFechar}
      rodape={(pedirFechar) => (
        <>
          {original && (
            <button type="button" onClick={() => aoSalvar(null)} className="rounded-md px-3 py-1.5 text-sm font-semibold text-rose-600 hover:bg-rose-50">
              Remover
            </button>
          )}
          <button type="button" onClick={pedirFechar} className="ml-auto rounded-md px-3 py-1.5 text-sm font-semibold text-suave hover:bg-fundo">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => aoSalvar(texto.trim() || null)}
            disabled={!alterado}
            className="rounded-md bg-acento px-3 py-1.5 text-sm font-semibold text-white hover:bg-acento/90 disabled:opacity-50"
          >
            Aplicar
          </button>
        </>
      )}
    >
      <textarea
        autoFocus
        value={texto}
        maxLength={1000}
        rows={5}
        onChange={(evento) => setTexto(evento.target.value)}
        aria-label="Observação para o fornecedor"
        placeholder="Ex.: enviar a versão com o cabo; conferir a pinagem antes de embalar."
        className="w-full rounded-md border border-borda bg-superficie px-3 py-2 text-sm focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/20"
      />
      <p className="mt-1 text-right text-xs tabular-nums text-suave">{texto.length}/1000</p>
    </Janela>,
    document.body,
  );
}

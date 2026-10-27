"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Loader, Plus, Search, Trash2, X } from "lucide-react";

import { buscarPecasPropriasAcao } from "@/app/produtos/acoes";
import FotoComLupa from "@/components/ui/FotoComLupa";
import { casasDaPeca, custoDasPecas } from "@/lib/producao/regras";
import IconeDeEstoque from "./IconeDeEstoque";

const reais = (valor) => Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** O custo de uma linha para a soma: o do produto do Rise, ou o digitado no item manual. */
function custoDaLinha(peca) {
  if (peca.componenteId) return peca.custo ?? null;
  const texto = String(peca.custoManual ?? "").trim().replace(",", ".");
  return texto === "" || !Number.isFinite(Number(texto)) ? null : Number(texto);
}

/** Linha que ainda nao tem nada digitado: nao conta no custo nem vai no Salvar. */
export const linhaVazia = (peca) => !peca.componenteId && !String(peca.descricao ?? "").trim() && String(peca.custoManual ?? "").trim() === "";

/** Chave estavel de cada linha (item manual nao tem id ate o Salvar). */
let proxima = 0;
const novaChave = () => `peca-${Date.now()}-${proxima++}`;
export const chaveDaPeca = (peca) => peca.chave ?? peca.id ?? peca.componenteId;

/**
 * Tabela da lista personalizada da aba Fornecedores / Concorrentes (pedido do dono em 26/10/2026; spec
 * 2026-10-26-producao-pecas-proprias-design.md). "Adicionar item" cria uma linha vazia; a lupa no fim do nome busca o
 * produto do Rise pelo que foi digitado (27/10/2026), e sem a lupa a linha fica como item manual, com o custo digitado.
 * So edita em memoria: a lista vai no Salvar do produto pelo campo oculto `pecasProprias`. `rodape` recebe o Produzir.
 */
export default function PecasProprias({ pecas, setPecas, produtoId, aoAlterar, rodape = null }) {
  // A busca e de UMA linha por vez: `busca.chave` diz qual, e os achados aparecem logo abaixo dela.
  const [busca, setBusca] = useState(null);
  const [procurando, iniciarBusca] = useTransition();

  const alterar = (nova) => {
    setPecas(nova);
    aoAlterar?.();
  };
  const mudar = (chave, campos) => alterar(pecas.map((peca) => (chaveDaPeca(peca) === chave ? { ...peca, ...campos } : peca)));
  const remover = (chave) => {
    alterar(pecas.filter((peca) => chaveDaPeca(peca) !== chave));
    if (busca?.chave === chave) setBusca(null);
  };

  const adicionar = () => {
    setBusca(null);
    alterar([...pecas, { chave: novaChave(), componenteId: null, descricao: "", custoManual: "", quantidade: 1 }]);
  };

  const procurar = (peca) => {
    const chave = chaveDaPeca(peca);
    const texto = String(peca.descricao ?? "").trim();
    if (texto.length < 2) {
      setBusca({ chave, erro: "Digite pelo menos 2 letras do código ou do nome." });
      return;
    }
    const excluir = [...pecas.map((item) => item.componenteId).filter(Boolean), ...(produtoId ? [produtoId] : [])];
    setBusca({ chave, itens: null });
    iniciarBusca(async () => {
      try {
        const resultado = await buscarPecasPropriasAcao(texto, excluir);
        setBusca(resultado.ok ? { chave, itens: resultado.itens } : { chave, erro: resultado.erro });
      } catch {
        setBusca({ chave, erro: "Não foi possível buscar os produtos. Tente de novo." });
      }
    });
  };

  // O produto escolhido toma o lugar da linha (mantem a quantidade digitada).
  const escolher = (chave, item) => {
    // A unidade do produto escolhido decide as casas: em UN/KIT uma quantidade quebrada vira o inteiro de cima.
    const quantidadeDe = (atual) => {
      const valor = Number(String(atual ?? "").replace(",", ".")) || 1;
      return casasDaPeca(item) === 0 ? Math.max(1, Math.ceil(valor)) : valor;
    };
    alterar(pecas.map((peca) => (chaveDaPeca(peca) === chave ? { ...item, chave, quantidade: quantidadeDe(peca.quantidade) } : peca)));
    setBusca(null);
  };

  const contadas = pecas.filter((peca) => !linhaVazia(peca));
  const custo = custoDasPecas(contadas.map((peca) => ({ custo: custoDaLinha(peca), quantidade: Number(String(peca.quantidade).replace(",", ".")) || 0 })));
  const semCusto = contadas.filter((peca) => custoDaLinha(peca) === null).map((peca) => peca.sku ?? (peca.descricao || "item manual"));

  const campo = "rounded border border-borda px-2 py-1.5 text-sm focus:border-acento focus:outline-none";
  const semTeclasDeNumero = (evento) => ["e", "E", "+", "-"].includes(evento.key) && evento.preventDefault();

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded border border-borda">
        <table className="w-full text-sm">
          <thead className="bg-fundo text-left text-xs font-semibold uppercase text-suave">
            <tr>
              <th className="w-14 px-3 py-2">Foto</th>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Código</th>
              <th className="w-32 px-3 py-2">Custo</th>
              <th className="w-28 px-3 py-2">Quantidade</th>
              <th className="px-3 py-2">Localização</th>
              <th className="w-16 px-3 py-2 text-center">Estoque</th>
              <th className="w-12 px-3 py-2" aria-label="Excluir" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {pecas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-suave">
                  Nenhum item ainda. Use &quot;Adicionar item&quot;.
                </td>
              </tr>
            )}
            {pecas.map((peca, indice) => {
              const chave = chaveDaPeca(peca);
              const manual = !peca.componenteId;
              // So a ULTIMA linha busca (pedido do dono em 27/10/2026): ao adicionar outra, a de cima fica como item manual.
              const buscavel = manual && indice === pecas.length - 1;
              const rotulo = peca.sku ?? (peca.descricao || "item");
              const buscaDaLinha = busca?.chave === chave ? busca : null;
              return (
                <Fragment key={chave}>
                  <tr>
                    <td className="px-3 py-2">
                      {peca.foto ? <FotoComLupa src={peca.foto} alt={peca.nome} className="h-10 w-10" /> : <span className="text-suave">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {manual ? (
                        <div className="flex min-w-56 items-center gap-1">
                          <input
                            value={peca.descricao}
                            maxLength={120}
                            onChange={(evento) => mudar(chave, { descricao: evento.target.value })}
                            onKeyDown={(evento) => {
                              // Enter busca, como a lupa; nunca envia o formulario do produto.
                              if (evento.key === "Enter") {
                                evento.preventDefault();
                                if (buscavel) procurar(peca);
                              }
                            }}
                            placeholder={buscavel ? "Nome ou código" : "Nome do item"}
                            aria-label="Nome do item"
                            className={`${campo} min-w-0 flex-1`}
                          />
                          {buscavel && (
                          <button
                            type="button"
                            onClick={() => procurar(peca)}
                            disabled={procurando && Boolean(buscaDaLinha)}
                            title="Buscar o produto no Rise"
                            aria-label="Buscar o produto no Rise"
                            className="rounded p-1.5 text-acento hover:bg-fundo disabled:opacity-50"
                          >
                            {procurando && buscaDaLinha ? <Loader size={16} className="animate-spin" /> : <Search size={16} />}
                          </button>
                          )}
                        </div>
                      ) : (
                        // Abre a peca em outra aba: sair daqui perderia o que nao foi salvo.
                        <Link href={`/produtos/${peca.componenteId}`} target="_blank" className="inline-flex items-center gap-1 font-medium hover:text-acento">
                          <span className="line-clamp-2">{peca.nome}</span>
                          <ExternalLink size={12} className="shrink-0 text-suave" />
                        </Link>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{peca.sku ?? <span className="text-suave">—</span>}</td>
                    <td className="px-3 py-2">
                      {manual ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={peca.custoManual}
                          onChange={(evento) => mudar(chave, { custoManual: evento.target.value })}
                          onKeyDown={semTeclasDeNumero}
                          aria-label="Custo do item manual"
                          className={`${campo} w-28`}
                        />
                      ) : peca.custo !== null && peca.custo !== undefined ? (
                        <span title={peca.custoOrigem ? `Custo: ${peca.custoOrigem}` : undefined}>{reais(peca.custo)}</span>
                      ) : (
                        <span className="text-amber-700">sem custo</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {/* UN e KIT andam de 1 em 1; MT, HR e o item manual de 0,01 em 0,01 (pedido do dono em 27/10/2026). */}
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={casasDaPeca(peca) === 0 ? "1" : "0.01"}
                          step={casasDaPeca(peca) === 0 ? "1" : "0.01"}
                          value={peca.quantidade}
                          onChange={(evento) => mudar(chave, { quantidade: evento.target.value })}
                          onKeyDown={(evento) => {
                            semTeclasDeNumero(evento);
                            if (casasDaPeca(peca) === 0 && [".", ","].includes(evento.key)) evento.preventDefault();
                          }}
                          aria-label={`Quantidade de ${rotulo}`}
                          className={`${campo} w-24`}
                        />
                        {!manual && <span className="text-xs text-suave">{peca.unidade ?? "UN"}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-suave">{peca.localizacao || "—"}</td>
                    <td className="px-3 py-2 text-center">
                      {manual ? (
                        <span className="text-suave">—</span>
                      ) : (
                        <IconeDeEstoque estoque={peca.estoque} estoqueMinimo={peca.estoqueMinimo} estoqueMaximo={peca.estoqueMaximo} />
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => remover(chave)}
                        title="Tirar da lista"
                        aria-label={`Tirar ${rotulo} da lista`}
                        className="rounded p-1 text-suave hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                  {buscaDaLinha && (buscaDaLinha.erro || buscaDaLinha.itens) && (
                    <tr>
                      <td colSpan={8} className="bg-fundo/60 px-3 py-2">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            {buscaDaLinha.erro && <p className="text-sm text-red-700">{buscaDaLinha.erro}</p>}
                            {buscaDaLinha.itens?.length === 0 && (
                              <p className="text-sm text-suave">Nenhum produto encontrado. A linha fica como item manual: informe o custo.</p>
                            )}
                            {buscaDaLinha.itens?.length > 0 && (
                              <ul className="divide-y divide-borda rounded border border-borda bg-superficie">
                                {buscaDaLinha.itens.map((item) => (
                                  <li key={item.componenteId}>
                                    <button
                                      type="button"
                                      onClick={() => escolher(chave, item)}
                                      className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm hover:bg-fundo"
                                    >
                                      {item.foto ? (
                                        // So a miniatura: a lupa da foto abriria por cima do clique que escolhe o produto.
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={item.foto} alt="" className="h-9 w-9 shrink-0 rounded border border-borda object-contain" loading="lazy" />
                                      ) : (
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-borda text-suave">—</span>
                                      )}
                                      <span className="w-24 shrink-0 font-mono text-xs">{item.sku}</span>
                                      <span className="min-w-0 flex-1 truncate">{item.nome}</span>
                                      <span className="shrink-0 text-xs text-suave">{item.custo !== null ? reais(item.custo) : "sem custo"}</span>
                                      <IconeDeEstoque estoque={item.estoque} estoqueMinimo={item.estoqueMinimo} estoqueMaximo={item.estoqueMaximo} />
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setBusca(null)}
                            aria-label="Fechar a busca"
                            className="rounded p-1 text-suave hover:bg-superficie hover:text-texto"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={adicionar}
          className="inline-flex items-center gap-1.5 rounded px-1 py-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
        >
          <Plus size={16} />
          Adicionar item
        </button>
        <div className="flex items-center gap-4">
          <span className="text-sm">
            Custo total:{" "}
            {custo.incompleto ? (
              <strong className="text-amber-700" title={`Sem custo: ${semCusto.join(", ")}`}>
                incompleto
              </strong>
            ) : (
              <strong>{reais(custo.total)}</strong>
            )}
          </span>
          {rodape}
        </div>
      </div>
    </div>
  );
}

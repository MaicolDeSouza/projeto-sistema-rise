"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Loader, PencilLine, Plus, Search, Trash2, X } from "lucide-react";

import { buscarPecasPropriasAcao } from "@/app/produtos/acoes";
import FotoComLupa from "@/components/ui/FotoComLupa";
import { custoDasPecas } from "@/lib/producao/regras";
import IconeDeEstoque from "./IconeDeEstoque";

const reais = (valor) => Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** O custo de uma linha para a soma: o do produto do Rise, ou o digitado no item manual. */
function custoDaLinha(peca) {
  if (peca.componenteId) return peca.custo ?? null;
  const texto = String(peca.custoManual ?? "").trim().replace(",", ".");
  return texto === "" || !Number.isFinite(Number(texto)) ? null : Number(texto);
}

/** Chave estavel de cada linha (item manual nao tem id ate o Salvar). */
let proxima = 0;
const novaChave = () => `peca-${Date.now()}-${proxima++}`;
export const chaveDaPeca = (peca) => peca.chave ?? peca.id ?? peca.componenteId;

/**
 * Tabela de pecas proprias da aba Fornecedores / Concorrentes (pedido do dono em 26/10/2026; spec
 * 2026-10-26-producao-pecas-proprias-design.md). So edita em memoria: a lista vai no Salvar do produto pelo campo
 * oculto `pecasProprias`. `rodape` recebe o botao Produzir (a ordem de producao).
 */
export default function PecasProprias({ pecas, setPecas, produtoId, aoAlterar, rodape = null }) {
  const [buscando, setBuscando] = useState(false);
  const [termo, setTermo] = useState("");
  const [resultado, setResultado] = useState(null);
  const [procurando, iniciarBusca] = useTransition();

  const alterar = (nova) => {
    setPecas(nova);
    aoAlterar?.();
  };
  const mudar = (chave, campos) => alterar(pecas.map((peca) => (chaveDaPeca(peca) === chave ? { ...peca, ...campos } : peca)));
  const remover = (chave) => alterar(pecas.filter((peca) => chaveDaPeca(peca) !== chave));

  const procurar = () => {
    const texto = termo.trim();
    if (texto.length < 2) {
      setResultado({ ok: false, erro: "Digite pelo menos 2 letras do código ou do nome." });
      return;
    }
    const excluir = [...pecas.map((peca) => peca.componenteId).filter(Boolean), ...(produtoId ? [produtoId] : [])];
    iniciarBusca(async () => {
      try {
        setResultado(await buscarPecasPropriasAcao(texto, excluir));
      } catch {
        setResultado({ ok: false, erro: "Não foi possível buscar os produtos. Tente de novo." });
      }
    });
  };

  const incluir = (item) => {
    alterar([...pecas, { ...item, chave: novaChave(), quantidade: 1 }]);
    setResultado((atual) => (atual?.itens ? { ...atual, itens: atual.itens.filter((achado) => achado.componenteId !== item.componenteId) } : atual));
  };
  const incluirManual = () =>
    alterar([...pecas, { chave: novaChave(), componenteId: null, descricao: "", custoManual: "", quantidade: 1 }]);

  const fecharBusca = () => {
    setBuscando(false);
    setTermo("");
    setResultado(null);
  };

  const custo = custoDasPecas(pecas.map((peca) => ({ custo: custoDaLinha(peca), quantidade: Number(String(peca.quantidade).replace(",", ".")) || 0 })));
  const semCusto = pecas.filter((peca) => custoDaLinha(peca) === null).map((peca) => peca.sku ?? (peca.descricao || "item manual"));

  const campo = "rounded border border-borda px-2 py-1.5 text-sm focus:border-acento focus:outline-none";

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
                  Nenhuma peça ainda. Use &quot;Adicionar item&quot;.
                </td>
              </tr>
            )}
            {pecas.map((peca) => {
              const chave = chaveDaPeca(peca);
              const manual = !peca.componenteId;
              return (
                <tr key={chave}>
                  <td className="px-3 py-2">
                    {peca.foto ? <FotoComLupa src={peca.foto} alt={peca.nome} className="h-10 w-10" /> : <span className="text-suave">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {manual ? (
                      <input
                        value={peca.descricao}
                        maxLength={120}
                        onChange={(evento) => mudar(chave, { descricao: evento.target.value })}
                        placeholder="Nome do item"
                        aria-label="Nome do item manual"
                        className={`${campo} w-full min-w-48`}
                      />
                    ) : (
                      // Abre a peca em outra aba: sair daqui perderia o que nao foi salvo.
                      <Link href={`/produtos/${peca.componenteId}`} target="_blank" className="inline-flex items-center gap-1 font-medium hover:text-acento">
                        <span className="line-clamp-2">{peca.nome}</span>
                        <ExternalLink size={12} className="shrink-0 text-suave" />
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{peca.sku ?? <span className="text-suave">—</span>}</td>
                  <td className="px-3 py-2">
                    {manual ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={peca.custoManual}
                        onChange={(evento) => mudar(chave, { custoManual: evento.target.value })}
                        onKeyDown={(evento) => ["e", "E", "+", "-"].includes(evento.key) && evento.preventDefault()}
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
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={peca.quantidade}
                      onChange={(evento) => mudar(chave, { quantidade: evento.target.value })}
                      onKeyDown={(evento) => ["e", "E", "+", "-"].includes(evento.key) && evento.preventDefault()}
                      aria-label={`Quantidade de ${peca.sku ?? (peca.descricao || "item manual")}`}
                      className={`${campo} w-24`}
                    />
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
                      aria-label={`Tirar ${peca.sku ?? (peca.descricao || "item manual")} da lista`}
                      className="rounded p-1 text-suave hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {!buscando && (
            <button
              type="button"
              onClick={() => setBuscando(true)}
              className="inline-flex items-center gap-1.5 rounded px-1 py-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
            >
              <Plus size={16} />
              Adicionar item
            </button>
          )}
          <button
            type="button"
            onClick={incluirManual}
            className="inline-flex items-center gap-1.5 rounded px-1 py-1 text-sm text-suave hover:text-texto"
          >
            <PencilLine size={14} />
            Item manual
          </button>
        </div>
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

      {buscando && (
        <div className="space-y-3 rounded border border-borda p-3">
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={termo}
              autoFocus
              onChange={(evento) => setTermo(evento.target.value)}
              onKeyDown={(evento) => {
                // Enter aqui nao pode enviar o formulario do produto.
                if (evento.key === "Enter") {
                  evento.preventDefault();
                  procurar();
                }
                if (evento.key === "Escape") fecharBusca();
              }}
              placeholder="Código ou nome do produto"
              aria-label="Buscar produto para a lista personalizada"
              className="min-w-0 flex-1 rounded border border-borda px-2.5 py-2 text-sm focus:border-acento focus:outline-none"
            />
            <button
              type="button"
              onClick={procurar}
              disabled={procurando}
              className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {procurando ? <Loader size={14} className="animate-spin" /> : <Search size={14} />}
              Buscar
            </button>
            <button type="button" onClick={fecharBusca} aria-label="Fechar a busca" className="rounded p-2 text-suave hover:bg-fundo hover:text-texto">
              <X size={16} />
            </button>
          </div>
          {resultado?.erro && <p className="text-sm text-red-700">{resultado.erro}</p>}
          {resultado?.ok && resultado.itens.length === 0 && <p className="text-sm text-suave">Nenhum produto encontrado.</p>}
          {resultado?.ok && resultado.itens.length > 0 && (
            <ul className="divide-y divide-borda rounded border border-borda">
              {resultado.itens.map((item) => (
                <li key={item.componenteId}>
                  <button
                    type="button"
                    onClick={() => incluir(item)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-fundo"
                  >
                    <span className="w-24 shrink-0 font-mono text-xs">{item.sku}</span>
                    <span className="min-w-0 flex-1 truncate">{item.nome}</span>
                    <span className="shrink-0 text-xs text-suave">{item.custo !== null ? reais(item.custo) : "sem custo"}</span>
                    <IconeDeEstoque estoque={item.estoque} estoqueMinimo={item.estoqueMinimo} estoqueMaximo={item.estoqueMaximo} />
                    <Plus size={14} className="shrink-0 text-acento" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

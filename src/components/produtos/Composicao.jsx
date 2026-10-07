"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Loader, Plus, Search, Trash2, X } from "lucide-react";

import { buscarPecasParaKit } from "@/app/produtos/acoes";
import { estoqueDoKit, MAXIMO_QUANTIDADE } from "@/lib/composicao";

/**
 * Aba Composicao do cadastro (pedido do dono em 07/10/2026, no desenho do Bling): Componente, Codigo (SKU),
 * Qtde e lixeira, e "Adicionar outro item". So entra produto ja cadastrado, simples, Conferido e vinculado
 * ao Bling; quem confere de verdade e o servidor no Salvar (`prepararComposicaoDoCadastro`).
 *
 * A lista mora no formulario (`pecas`) e vai no envio como campo oculto JSON, no molde dos fornecedores:
 * a aba so edita em memoria, e so o Salvar do produto grava.
 */
export default function Composicao({ pecas, setPecas, produtoId, aoAlterar }) {
  const [buscando, setBuscando] = useState(false);
  const [termo, setTermo] = useState("");
  const [resultado, setResultado] = useState(null);
  const [procurando, iniciarBusca] = useTransition();

  const alterar = (nova) => {
    setPecas(nova);
    aoAlterar?.();
  };

  const mudarQuantidade = (componenteId, texto) => {
    // Guarda o texto como esta (o campo pode ficar vazio enquanto se digita); o servidor confere no Salvar.
    alterar(pecas.map((peca) => (peca.componenteId === componenteId ? { ...peca, quantidade: texto } : peca)));
  };

  const remover = (componenteId) => alterar(pecas.filter((peca) => peca.componenteId !== componenteId));

  const procurar = () => {
    const texto = termo.trim();
    if (texto.length < 2) {
      setResultado({ ok: false, erro: "Digite pelo menos 2 letras do código ou do nome." });
      return;
    }
    const excluir = [...pecas.map((peca) => peca.componenteId), ...(produtoId ? [produtoId] : [])];
    iniciarBusca(async () => {
      try {
        setResultado(await buscarPecasParaKit(texto, excluir));
      } catch {
        setResultado({ ok: false, erro: "Não foi possível buscar os produtos. Tente de novo." });
      }
    });
  };

  const incluir = (produto) => {
    alterar([...pecas, { componenteId: produto.id, sku: produto.sku, tituloBase: produto.tituloBase, estoque: produto.estoque, quantidade: 1 }]);
    setResultado((atual) => (atual?.itens ? { ...atual, itens: atual.itens.filter((item) => item.id !== produto.id) } : atual));
  };

  const fecharBusca = () => {
    setBuscando(false);
    setTermo("");
    setResultado(null);
  };

  // Previa do estoque do kit com as quantidades da tela (o gravado so muda no Salvar).
  const quantidadesValidas = pecas.every((peca) => Number.isInteger(Number(peca.quantidade)) && Number(peca.quantidade) >= 1);
  const estoquePrevisto =
    pecas.length > 0 && quantidadesValidas
      ? estoqueDoKit(pecas.map((peca) => ({ estoque: peca.estoque, quantidade: Number(peca.quantidade) })))
      : null;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded border border-borda">
        <table className="w-full text-sm">
          <thead className="bg-fundo text-left text-xs font-semibold text-suave">
            <tr>
              <th className="px-3 py-2">Componente</th>
              <th className="px-3 py-2">Código (SKU)</th>
              <th className="w-28 px-3 py-2">Qtde</th>
              <th className="w-12 px-3 py-2" aria-label="Remover" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {pecas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-suave">
                  Nenhuma peça ainda. Use &quot;Adicionar outro item&quot;.
                </td>
              </tr>
            )}
            {pecas.map((peca) => (
              <tr key={peca.componenteId}>
                <td className="px-3 py-2">
                  {/* Abre a peca em outra aba: sair daqui perderia o que nao foi salvo. */}
                  <Link
                    href={`/produtos/${peca.componenteId}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 font-medium hover:text-acento"
                  >
                    {peca.tituloBase}
                    <ExternalLink size={12} className="shrink-0 text-suave" />
                  </Link>
                  <span className="block text-[11px] text-suave">Estoque: {peca.estoque ?? "—"}</span>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{peca.sku}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min="1"
                    max={MAXIMO_QUANTIDADE}
                    step="1"
                    value={peca.quantidade}
                    onChange={(evento) => mudarQuantidade(peca.componenteId, evento.target.value)}
                    onKeyDown={(evento) => {
                      if (["e", "E", "+", "-", ".", ","].includes(evento.key)) evento.preventDefault();
                    }}
                    aria-label={`Quantidade de ${peca.sku}`}
                    className="w-20 rounded border border-borda px-2 py-1.5 text-sm focus:border-acento focus:outline-none"
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => remover(peca.componenteId)}
                    title={`Tirar ${peca.sku} do kit`}
                    aria-label={`Tirar ${peca.sku} do kit`}
                    className="rounded p-1 text-suave hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!buscando && (
          <button
            type="button"
            onClick={() => setBuscando(true)}
            className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-2 text-sm hover:bg-fundo"
          >
            <Plus size={14} />
            Adicionar outro item
          </button>
        )}
        {estoquePrevisto !== null && (
          <span className="text-sm text-suave">
            Estoque do kit: <strong className="text-texto">{estoquePrevisto}</strong> (calculado pelas peças)
          </span>
        )}
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
              aria-label="Buscar produto para o kit"
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
            <button
              type="button"
              onClick={fecharBusca}
              aria-label="Fechar a busca"
              className="rounded p-2 text-suave hover:bg-fundo hover:text-texto"
            >
              <X size={16} />
            </button>
          </div>
          <p className="text-[11px] text-suave">Só entram produtos simples, conferidos e já vinculados ao Bling.</p>

          {resultado?.erro && <p className="text-sm text-red-700">{resultado.erro}</p>}
          {resultado?.ok && resultado.itens.length === 0 && (
            <div className="text-sm text-suave">
              <p>Nenhum produto que possa ser peça foi encontrado.</p>
              {resultado.barrados.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {resultado.barrados.map((item) => (
                    <li key={item.sku}>
                      <span className="font-mono text-xs">{item.sku}</span> {item.tituloBase}: {item.motivo}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {resultado?.ok && resultado.itens.length > 0 && (
            <ul className="divide-y divide-borda rounded border border-borda">
              {resultado.itens.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => incluir(item)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-fundo"
                  >
                    <span className="w-24 shrink-0 font-mono text-xs">{item.sku}</span>
                    <span className="min-w-0 flex-1">{item.tituloBase}</span>
                    <span className="shrink-0 text-xs text-suave">Estoque {item.estoque}</span>
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

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheck, ExternalLink, Loader, Plus, Search, Trash2, X } from "lucide-react";

import { buscarPecasParaKit } from "@/app/produtos/acoes";
import { estoqueDoKit, MAXIMO_QUANTIDADE } from "@/lib/composicao";

/**
 * Aba Composicao do cadastro (pedido do dono em 07/10/2026, no desenho do Bling): Componente, Codigo (SKU),
 * Qtde e lixeira, e "Adicionar outro item". So entra produto ja cadastrado, simples, Conferido e vinculado
 * ao Bling; quem confere de verdade e o servidor no Salvar (`prepararComposicaoDoCadastro`).
 *
 * A lista mora no formulario (`pecas`) e vai no envio como campo oculto JSON, no molde dos fornecedores:
 * a aba so edita em memoria, e so o Salvar do produto grava.
 *
 * `aviso`: recado do formulario sobre a composicao (o produto de origem do clone que nao pode ser peca).
 */
export default function Composicao({ pecas, setPecas, produtoId, aoAlterar, aviso = null }) {
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

  // Uma lista so, aptos e nao aptos juntos, em ordem de codigo (pedido do dono em 10/10/2026): o motivo de um
  // produto nao entrar aparece mesmo quando outro da busca pode entrar.
  const encontrados = resultado?.ok
    ? [
        ...resultado.itens.map((item) => ({ ...item, apto: true, chave: item.componenteId })),
        ...resultado.barrados.map((item) => ({ ...item, apto: false, chave: item.id })),
      ].sort((a, b) => String(a.sku).localeCompare(String(b.sku), "pt-BR", { numeric: true }))
    : [];

  // A busca ja devolve a peca no formato da aba (preco, peso, fornecedor padrao): as abas do kit a usam.
  const incluir = (peca) => {
    alterar([...pecas, { ...peca, quantidade: 1 }]);
    setResultado((atual) =>
      atual?.itens ? { ...atual, itens: atual.itens.filter((item) => item.componenteId !== peca.componenteId) } : atual,
    );
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
      {aviso && <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{aviso}</p>}
      <div className="overflow-x-auto rounded border border-borda">
        <table className="w-full text-sm">
          <thead className="bg-fundo text-left text-xs font-semibold text-suave">
            <tr>
              <th className="px-3 py-2">Componente</th>
              <th className="px-3 py-2">Código (SKU)</th>
              <th className="px-3 py-2">Localização</th>
              <th className="w-28 px-3 py-2">Qtde</th>
              <th className="w-12 px-3 py-2" aria-label="Remover" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {pecas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-suave">
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
                <td className="px-3 py-2 text-suave">{peca.localizacao || "—"}</td>
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
          {resultado?.ok && encontrados.length === 0 && <p className="text-sm text-suave">Nenhum produto encontrado.</p>}
          {encontrados.length > 0 && (
            <ul className="divide-y divide-borda rounded border border-borda">
              {encontrados.map((item) =>
                item.apto ? (
                  <li key={item.chave}>
                    <button
                      type="button"
                      onClick={() => incluir(item)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-fundo"
                    >
                      <span className="w-24 shrink-0 font-mono text-xs">{item.sku}</span>
                      <span className="min-w-0 flex-1">{item.tituloBase}</span>
                      <span className="shrink-0 text-xs text-suave">Estoque {item.estoque}</span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        <CircleCheck size={12} />
                        Apto
                      </span>
                      <Plus size={14} className="shrink-0 text-acento" />
                    </button>
                  </li>
                ) : (
                  // Nao apto: cinza e sem clique, com TUDO o que falta e o link para abrir o produto e corrigir.
                  <li key={item.chave} className="flex items-center gap-3 px-3 py-2 text-sm text-suave">
                    <span className="w-24 shrink-0 font-mono text-xs">{item.sku}</span>
                    <span className="min-w-0 flex-1">{item.tituloBase}</span>
                    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                      {item.faltas.length === 1 && item.faltas[0].startsWith("É um kit")
                        ? item.faltas[0]
                        : `Falta: ${item.faltas.join(" · ")}`}
                    </span>
                    <Link
                      href={`/produtos/${item.id}`}
                      target="_blank"
                      className="inline-flex shrink-0 items-center gap-1 text-xs text-acento hover:underline"
                      title={`Abrir ${item.sku} em outra aba para corrigir`}
                    >
                      Abrir
                      <ExternalLink size={12} />
                    </Link>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

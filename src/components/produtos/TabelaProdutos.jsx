"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CircleCheck,
  Loader,
  Package,
  Trash2,
  X,
} from "lucide-react";

import { excluirProdutos } from "@/app/produtos/acoes";
import Paginacao from "@/components/mercados/Paginacao";
import CampoBusca from "@/components/ui/CampoBusca";
import EmptyState from "@/components/ui/EmptyState";
import LinhaProduto from "./LinhaProduto";

/// Rotulo de cada coluna ordenavel, na ordem da tabela.
const COLUNAS_ORDENAVEIS = [
  { campo: "codigo", rotulo: "Código" },
  { campo: "localizacao", rotulo: "Localização" },
  { campo: "preco", rotulo: "Preço" },
  { campo: "estoque", rotulo: "Estoque" },
];

/**
 * Cabecalho clicavel: liga a ordenacao por esta coluna (URL, como a busca —
 * sobrevive a recarga e pode ser mandado como link, mesmo padrao do filtro de
 * Mercados). Ciclo de 3 estados por coluna: nada -> crescente -> decrescente
 * -> nada de novo, e trocar de coluna sempre comeca em crescente.
 */
function CabecalhoOrdenavel({ campo, rotulo, ordenar, direcao, aoClicar }) {
  const ativa = ordenar === campo;
  const Icone = !ativa ? ArrowUpDown : direcao === "asc" ? ArrowUp : ArrowDown;

  return (
    <th className="px-3 py-2.5 font-medium" aria-sort={ativa ? (direcao === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => aoClicar(campo)}
        className={`inline-flex items-center gap-1 hover:text-texto ${ativa ? "text-texto" : ""}`}
      >
        {rotulo}
        <Icone size={12} className={ativa ? "text-acento" : "text-suave"} />
      </button>
    </th>
  );
}

/**
 * Confirma a exclusao num POPUP na tela, listando cada produto (nome + SKU) —
 * pedido do dono em 18/09/2026, depois de um `confirm()` nativo (so um numero,
 * "Excluir estes 2 produtos?") ter deixado passar despercebido qual produto
 * estava marcado, e o errado foi excluido. Ver o nome de cada um antes de
 * confirmar e o que evita repetir isso.
 */
function PopupConfirmacao({ produtos, pendente, aoConfirmar, aoCancelar }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) aoCancelar();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirmar exclusão"
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-borda bg-superficie shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-borda p-3">
          <span className="text-sm font-semibold">
            Excluir {produtos.length} produto{produtos.length > 1 ? "s" : ""}?
          </span>
          <button
            type="button"
            onClick={aoCancelar}
            aria-label="Cancelar"
            className="rounded p-1 text-suave hover:bg-fundo"
          >
            <X size={16} />
          </button>
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-borda overflow-y-auto">
          {produtos.map((produto) => (
            <li key={produto.id} className="px-3 py-2 text-sm">
              <span className="block truncate font-medium">{produto.tituloBase}</span>
              <span className="font-mono text-xs text-suave">{produto.sku}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-2 border-t border-borda p-3">
          <p className="text-[11px] text-suave">Os arquivos enviados também serão apagados.</p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={aoCancelar}
              disabled={pendente}
              className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={aoConfirmar}
              disabled={pendente}
              className="inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {pendente && <Loader size={13} className="animate-spin" />}
              Excluir
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Lista de produtos: busca, selecao por caixa e exclusao em lote (pedido do
 * dono em 18/09/2026, no padrao do Bling) — substituiu o botao "Excluir
 * produto" de dentro do cadastro. A selecao e so desta tabela: trocar de
 * pagina ou filtrar de novo comeca vazia, de proposito — selecao que
 * sobrevive a navegacao arrisca excluir produto que o operador nem esta mais
 * vendo.
 *
 * **A lixeira mora numa caixinha fixa ao lado da busca**, sempre visivel
 * (cinza e desabilitada sem nada marcado) — pedido do dono em 18/09/2026: e
 * onde outros icones de acao em lote vao entrar no futuro, e nao um botao que
 * aparece e desaparece.
 */
export default function TabelaProdutos({
  linhas,
  busca,
  ordenar = "",
  direcao = "desc",
  pagina = 1,
  totalPaginas = 1,
  total = linhas.length,
  totalConferidos = 0,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciarTransicao] = useTransition();
  const [mensagem, setMensagem] = useState(null); // { tipo: "erro" | "sucesso", texto }

  /** Nada -> crescente -> decrescente -> nada. Preserva busca e demais parametros. */
  function trocarOrdenacao(campo) {
    const params = new URLSearchParams(searchParams);

    if (ordenar !== campo) {
      params.set("ordenar", campo);
      params.set("direcao", "asc");
    } else if (direcao === "asc") {
      params.set("direcao", "desc");
    } else {
      params.delete("ordenar");
      params.delete("direcao");
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function alternarSelecao(id) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  const todosMarcados =
    linhas.length > 0 && linhas.every(({ produto }) => selecionados.has(produto.id));

  function alternarTodos() {
    setSelecionados(todosMarcados ? new Set() : new Set(linhas.map(({ produto }) => produto.id)));
  }

  function confirmarExclusao() {
    const ids = [...selecionados];
    if (ids.length === 0) return;
    setMensagem(null);
    setConfirmando(true);
  }

  function excluirConfirmado() {
    const ids = [...selecionados];
    iniciarTransicao(async () => {
      const resultado = await excluirProdutos(ids);
      setSelecionados(new Set());
      setConfirmando(false);

      if (resultado.falhas.length > 0) {
        setMensagem({
          tipo: "erro",
          texto:
            `${resultado.excluidos} produto(s) excluído(s). ${resultado.falhas.length} nao ` +
            `puderam ser excluídos: ${resultado.falhas.map((falha) => falha.erro).join(" ")}`,
        });
      } else {
        setMensagem({
          tipo: "sucesso",
          texto: `${resultado.excluidos} produto${resultado.excluidos > 1 ? "s" : ""} excluido${resultado.excluidos > 1 ? "s" : ""}.`,
        });
      }
    });
  }

  const produtosSelecionados = linhas
    .filter(({ produto }) => selecionados.has(produto.id))
    .map(({ produto }) => produto);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <CampoBusca
          valorInicial={busca}
          rotulo="Buscar por nome ou código"
          className="max-w-sm flex-1"
        />

        {/* Contagem da lista (pedido do dono em 22/09/2026): o TOTAL que casa
            com a busca (nao so os 25 da pagina), com quantos ja foram
            marcados como Conferido entre parenteses — as duas contadas no
            banco (page.jsx), para valerem pelo acervo inteiro. */}
        <span className="rounded border border-borda bg-superficie px-3 py-2 text-xs whitespace-nowrap text-suave">
          {total} produto(s){" "}
          <span className={totalConferidos > 0 ? "font-medium text-emerald-700" : ""}>
            ({totalConferidos} verificado{totalConferidos === 1 ? "" : "s"})
          </span>
        </span>

        {/* Navegacao compacta (mesmo padrao de Mercados): so aparece com mais
            de uma pagina — Paginacao ja se esconde sozinha nesse caso. */}
        <Paginacao compacto pagina={pagina} totalPaginas={totalPaginas} total={total} />

        {/* Caixa fixa de acoes em lote — outros icones entram aqui no futuro. */}
        <div className="flex items-center gap-1 rounded border border-borda bg-superficie p-1.5">
          <button
            type="button"
            onClick={confirmarExclusao}
            disabled={pendente || selecionados.size === 0}
            aria-label={
              selecionados.size > 0
                ? `Excluir ${selecionados.size} produto(s) selecionado(s)`
                : "Marque produtos na lista para excluir"
            }
            title={
              selecionados.size > 0
                ? `Excluir ${selecionados.size} selecionado(s)`
                : "Marque produtos na lista para excluir"
            }
            className="rounded p-1.5 text-suave hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-suave"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {selecionados.size > 0 && (
          <span className="text-xs text-suave">
            {selecionados.size} selecionado(s) ·{" "}
            <button
              type="button"
              onClick={() => setSelecionados(new Set())}
              className="underline hover:text-texto"
            >
              Limpar seleção
            </button>
          </span>
        )}
      </div>

      {mensagem && (
        <p
          className={`mb-4 flex items-center gap-1.5 rounded border p-2 text-xs ${
            mensagem.tipo === "erro"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {mensagem.tipo === "sucesso" && <CircleCheck size={14} className="shrink-0" />}
          {mensagem.texto}
        </p>
      )}

      {linhas.length === 0 ? (
        <EmptyState
          icone={Package}
          titulo={
            busca
              ? `Nenhum produto encontrado para "${busca}"`
              : "Nenhum produto cadastrado"
          }
          descricao={
            busca
              ? "Tente outro termo, ou limpe a busca para ver o catálogo inteiro."
              : "Cadastre o primeiro produto para começar."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
          <table className="w-full text-sm">
            <thead className="border-b border-borda bg-fundo text-center text-xs tracking-wide text-suave uppercase">
              <tr className="divide-x divide-borda">
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={todosMarcados}
                    onChange={alternarTodos}
                    aria-label="Selecionar todos os produtos"
                    className="align-middle"
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">Imagem</th>
                <th className="px-3 py-2.5 font-medium">Nome</th>
                {/* "Conf." — nome curto pedido pelo dono em 22/09/2026 para a
                    coluna de ConferidoProduto, que ate aqui nao tinha rotulo. */}
                <th className="w-10 px-3 py-2.5" title="Conferido">Conf.</th>
                {COLUNAS_ORDENAVEIS.map(({ campo, rotulo }) => (
                  <CabecalhoOrdenavel
                    key={campo}
                    campo={campo}
                    rotulo={rotulo}
                    ordenar={ordenar}
                    direcao={direcao}
                    aoClicar={trocarOrdenacao}
                  />
                ))}
                <th className="px-3 py-2.5 font-medium">Canais</th>
                <th className="w-10 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {linhas.map(({ produto, pendentes, iconeML, iconeBling, iconeLI }) => (
                <LinhaProduto
                  key={produto.id}
                  produto={produto}
                  pendentes={pendentes}
                  iconeML={iconeML}
                  iconeBling={iconeBling}
                  iconeLI={iconeLI}
                  selecionado={selecionados.has(produto.id)}
                  aoAlternarSelecao={() => alternarSelecao(produto.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmando && (
        <PopupConfirmacao
          produtos={produtosSelecionados}
          pendente={pendente}
          aoConfirmar={excluirConfirmado}
          aoCancelar={() => setConfirmando(false)}
        />
      )}
    </>
  );
}

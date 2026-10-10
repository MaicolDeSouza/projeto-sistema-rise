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
  X,
} from "lucide-react";

import { excluirProdutos } from "@/app/produtos/acoes";
import Paginacao from "@/components/mercados/Paginacao";
import CampoBusca from "@/components/ui/CampoBusca";
import BotaoBuscaAmpla from "@/components/ui/BotaoBuscaAmpla";
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
 * Lista de produtos: busca, paginacao e ordenacao.
 *
 * **Excluir e Clonar moram nos 3 pontinhos de cada linha** (pedido do dono em 09/10/2026). Ate ali a exclusao
 * era em lote, por caixa de selecao e uma lixeira fixa ao lado da busca (18/09/2026, no padrao do Bling); a
 * lixeira e as caixas sairam. A confirmacao continua sendo o popup com nome e SKU (`PopupConfirmacao`).
 */
export default function TabelaProdutos({
  linhas,
  busca,
  // Busca ampla ligada (`?ampla=1`, pedido do dono em 09/10/2026).
  ampla = false,
  ordenar = "",
  direcao = "desc",
  pagina = 1,
  totalPaginas = 1,
  total = linhas.length,
  totalConferidos = 0,
  // Produto recem-criado (`?novo=<id>`, pedido do dono em 10/10/2026): a linha dele aparece destacada por alguns segundos.
  destacarId = null,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Produto cuja exclusao esta sendo confirmada (o "Excluir" dos 3 pontinhos da linha).
  const [excluindo, setExcluindo] = useState(null);
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

  function confirmarExclusao(produto) {
    setMensagem(null);
    setExcluindo(produto);
  }

  function excluirConfirmado() {
    const id = excluindo.id;
    iniciarTransicao(async () => {
      const resultado = await excluirProdutos([id]);
      setExcluindo(null);

      // Um produto por vez (o "Excluir" da linha): ou saiu, ou o motivo da recusa (anuncio publicado, peca de kit).
      setMensagem(
        resultado.falhas.length > 0
          ? { tipo: "erro", texto: resultado.falhas.map((falha) => falha.erro).join(" ") }
          : { tipo: "sucesso", texto: `Produto ${excluindo.sku} excluído.` },
      );
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <CampoBusca
          valorInicial={busca}
          rotulo={ampla ? "Buscar também na descrição, NCM e localização" : "Buscar por nome, código, marca ou modelo"}
          className="max-w-sm flex-1"
        />
        <BotaoBuscaAmpla
          ligada={ampla}
          ajuda="Procura também na descrição, no NCM, na homologação e na localização de cada produto."
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
              {linhas.map(({ produto, iconeML, iconeBling, iconeLI, achado }) => (
                <LinhaProduto
                  key={produto.id}
                  produto={produto}
                  destacada={produto.id === destacarId}
                  achado={achado}
                  aoExcluir={() => confirmarExclusao(produto)}
                  iconeML={iconeML}
                  iconeBling={iconeBling}
                  iconeLI={iconeLI}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {excluindo && (
        <PopupConfirmacao
          produtos={[excluindo]}
          pendente={pendente}
          aoConfirmar={excluirConfirmado}
          aoCancelar={() => setExcluindo(null)}
        />
      )}
    </>
  );
}

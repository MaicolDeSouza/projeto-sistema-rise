"use client";

import { propsDoFundo } from "@/lib/fundoDaJanela";
import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CircleCheck,
  Loader,
  Package,
  X,
} from "lucide-react";

import { excluirProdutos } from "@/app/produtos/acoes";
import NavegacaoDoTopo from "@/components/mercados/NavegacaoDoTopo";
import CampoBusca from "@/components/ui/CampoBusca";
import BotaoBuscaAmpla from "@/components/ui/BotaoBuscaAmpla";
import EmptyState from "@/components/ui/EmptyState";
import CabecalhoOrdenavel, { parametrosDaOrdenacao } from "@/components/ui/CabecalhoOrdenavel";
import ConclusaoDoEnvio from "@/components/ui/ConclusaoDoEnvio";
import FiltroDeCanais from "./FiltroDeCanais";
import LinhaProduto from "./LinhaProduto";

/// Rotulo de cada coluna ordenavel, na ordem da tabela.
const COLUNAS_ORDENAVEIS = [
  { campo: "codigo", rotulo: "Código" },
  { campo: "localizacao", rotulo: "Localização" },
  { campo: "preco", rotulo: "Preço" },
  { campo: "estoque", rotulo: "Estoque" },
];

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
      {...propsDoFundo(() => aoCancelar())}
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
  porPagina = 25,
  total = linhas.length,
  totalConferidos = 0,
  // Produto recem-criado (`?novo=<id>`, pedido do dono em 10/10/2026): a linha dele aparece destacada por alguns segundos.
  destacarId = null,
  // Acessos (lancamento 2): o que a pessoa pode nesta lista (acessosDaListaDeProdutos). Sem ele, tudo liberado, como
  // antes, para quem chama a tabela sem passar a sessao.
  acessos = null,
  // Filtro da coluna Canais (`?bling=sim&ml=nao`, pedido do dono em 24/10/2026).
  filtroCanais = {},
}) {
  const pode = acessos ?? { editar: true, excluir: true, clonar: true, verLocalizacao: true, editarLocalizacao: true, estoqueExato: true, margem: true };
  // A coluna Localizacao some sem o dado; o Estoque em faixa nao se ordena (a ordem contaria quem tem mais).
  const colunas = COLUNAS_ORDENAVEIS.filter(({ campo }) => campo !== "localizacao" || pode.verLocalizacao);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Produto cuja exclusao esta sendo confirmada (o "Excluir" dos 3 pontinhos da linha).
  const [excluindo, setExcluindo] = useState(null);
  const [pendente, iniciarTransicao] = useTransition();
  const [mensagem, setMensagem] = useState(null); // { tipo: "erro" | "sucesso", texto }

  /** Nada -> crescente -> decrescente -> nada. Preserva busca e demais parametros. */
  function trocarOrdenacao(campo) {
    const query = parametrosDaOrdenacao(searchParams, campo, ordenar, direcao).toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  /** Um canal do filtro (null = Todos); volta a pagina 1, como a busca e a ordenacao. */
  function mudarFiltroDeCanal(canal, valor) {
    const query = new URLSearchParams(searchParams?.toString() ?? "");
    if (valor) query.set(canal, valor);
    else query.delete(canal);
    query.delete("pagina");
    const texto = query.toString();
    router.push(texto ? `${pathname}?${texto}` : pathname);
  }

  function limparFiltroDeCanais() {
    const query = new URLSearchParams(searchParams?.toString() ?? "");
    for (const canal of Object.keys(filtroCanais)) query.delete(canal);
    query.delete("pagina");
    const texto = query.toString();
    router.push(texto ? `${pathname}?${texto}` : pathname);
  }
  const comFiltroDeCanais = Object.keys(filtroCanais).length > 0;

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
      // Os dois em POP-UP com botao Fechar (pedido do dono em 24/10/2026; era uma faixa no topo da lista).
      const nome = [excluindo.sku, excluindo.tituloBase].filter(Boolean).join(" · ");
      setMensagem(
        resultado.falhas.length > 0
          ? { tipo: "erro", titulo: "Não foi possível excluir", texto: nome, linhas: resultado.falhas.map((falha) => falha.erro) }
          : { tipo: "sucesso", titulo: "Produto excluído", texto: `${nome} foi excluído do Rise, com as fotos e os documentos dele.`, aviso: (resultado.avisos ?? []).join(" ") || null },
      );
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <CampoBusca
          valorInicial={busca}
          rotulo={ampla ? (pode.verLocalizacao ? "Buscar também na descrição, NCM e localização" : "Buscar também na descrição e no NCM") : "Buscar por nome, código, marca ou modelo"}
          className="max-w-sm min-w-60 flex-1"
        />
        <BotaoBuscaAmpla
          ligada={ampla}
          ajuda={pode.verLocalizacao ? "Procura também na descrição, no NCM, na homologação e na localização de cada produto." : "Procura também na descrição, no NCM e na homologação de cada produto."}
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
          {/* Quanto ja foi verificado em relacao ao total (pedido do dono em 28/10/2026; antes mostrava quanto faltava),
              sobre o mesmo total da busca. */}
          {total > 0 && (
            <span className="tabular-nums" title={`${(total - totalConferidos).toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} ainda não verificados`}>
              {` · ${((totalConferidos / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% feito`}
            </span>
          )}
        </span>

        {/* Navegacao no canto DIREITO, com o "100 por página" logo acima (padrao com o Scraper, 23/10/2026). */}
        <NavegacaoDoTopo pagina={pagina} totalPaginas={totalPaginas} total={total} porPagina={porPagina} />

      </div>

      {mensagem && (
        <ConclusaoDoEnvio
          tipo={mensagem.tipo}
          titulo={mensagem.titulo ?? (mensagem.tipo === "erro" ? "Não foi possível concluir" : "Feito")}
          mensagem={mensagem.texto}
          linhas={mensagem.linhas ?? []}
          aviso={mensagem.aviso ?? null}
          botao="Fechar"
          aoFechar={() => setMensagem(null)}
        />
      )}

      {linhas.length === 0 ? (
        <>
          <EmptyState
            icone={Package}
            titulo={
              busca
                ? `Nenhum produto encontrado para "${busca}"`
                : comFiltroDeCanais
                  ? "Nenhum produto com esse filtro de canais"
                  : "Nenhum produto cadastrado"
            }
            descricao={
              busca
                ? "Tente outro termo, ou limpe a busca para ver o catálogo inteiro."
                : comFiltroDeCanais
                  ? "Mude ou limpe o filtro para ver os outros produtos."
                  : "Cadastre o primeiro produto para começar."
            }
          />
          {comFiltroDeCanais && (
            <p className="text-center">
              <button type="button" onClick={limparFiltroDeCanais} className="text-sm text-acento hover:underline">
                Limpar filtro de canais
              </button>
            </p>
          )}
        </>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
          <table className="w-full text-sm">
            <thead className="border-b border-borda bg-fundo text-center text-xs tracking-wide text-suave uppercase">
              <tr className="divide-x divide-borda">
                <th className="px-3 py-2.5 font-medium">Imagem</th>
                <th className="px-3 py-2.5 font-medium">Nome</th>
                {colunas.map(({ campo, rotulo }) => campo === "estoque" && !pode.estoqueExato ? (
                  <th key={campo} className="px-3 py-2.5 font-medium">{rotulo}</th>
                ) : (
                  <CabecalhoOrdenavel
                    key={campo}
                    campo={campo}
                    rotulo={rotulo}
                    ordenar={ordenar}
                    direcao={direcao}
                    aoClicar={trocarOrdenacao}
                  />
                ))}
                <th className="px-3 py-2.5 font-medium">
                  <FiltroDeCanais filtro={filtroCanais} aoMudar={mudarFiltroDeCanal} aoLimpar={limparFiltroDeCanais} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {linhas.map(({ produto, iconeML, iconeBling, iconeLI, achado, estoquesNosCanais }) => (
                <LinhaProduto
                  key={produto.id}
                  produto={produto}
                  destacada={produto.id === destacarId}
                  achado={achado}
                  aoExcluir={() => confirmarExclusao(produto)}
                  acessos={pode}
                  iconeML={iconeML}
                  iconeBling={iconeBling}
                  iconeLI={iconeLI}
                  estoquesNosCanais={estoquesNosCanais}
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

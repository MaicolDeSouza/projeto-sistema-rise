"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Copy, ExternalLink, Handshake, ImageOff, LayoutList, Trash2 } from "lucide-react";

import CabecalhoOrdenavel, { parametrosDaOrdenacao } from "@/components/ui/CabecalhoOrdenavel";
import EmptyState from "@/components/ui/EmptyState";
import FotoComLupa from "@/components/ui/FotoComLupa";
import JanelaExcluirAnuncioML from "./JanelaExcluirAnuncioML";
import { CANAIS } from "@/lib/canais";
import { ROTULO_DO_TIPO_ML, seloDoAnuncioML } from "@/lib/canaisDeVenda/ml/rotulos";

/**
 * Lista dos anuncios do Mercado Livre (a busca e a paginacao moram na pagina). Colunas na ordem do padrao do projeto
 * (pedido do dono em 28/10/2026): foto, titulo, codigo, preco, estoque, tipo, situacao, os dois links do ML, a
 * concorrencia e, por ultimo, o icone do ML igual ao da lista de Produtos ("!" e "C"). A ordem das colunas mora na URL
 * (`?ordenar=&direcao=`) e e feita no servidor antes de paginar.
 */

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const LOGO_ML = CANAIS.find((canal) => canal.id === "MERCADO_LIVRE")?.logo;

// A cor da situacao vira um ponto; o texto fica neutro e numa linha so (o selo colorido quebrava em duas e saia do eixo).
const COR_DO_TOM = {
  neutro: "bg-slate-400",
  sucesso: "bg-emerald-500",
  alerta: "bg-amber-500",
  erro: "bg-red-500",
  info: "bg-sky-500",
};

const enderecoDe = (linha) => `/canais-de-venda/mercado-livre/${linha.id}`;
const celula = "px-3 py-2 align-middle";
const icone = "inline-flex rounded p-1 text-suave hover:bg-fundo hover:text-acento focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none";

function Situacao({ linha }) {
  const selo = seloDoAnuncioML(linha);
  // O estado lido do ML so ganha linha propria quando pede acao; senao repetiria o selo ("Pausado: sem estoque") e vai no title.
  return (
    <div className="flex flex-col gap-0.5" title={linha.estadoML ? `${linha.estadoML} (relido de hora em hora)` : undefined}>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${COR_DO_TOM[selo.tom] ?? COR_DO_TOM.neutro}`} />
        {selo.rotulo}
      </span>
      {linha.estadoMLPedeAcao && <span className="pl-3.5 text-xs font-medium whitespace-nowrap text-red-700">{linha.estadoML}</span>}
    </div>
  );
}

function Concorrencia({ linha }) {
  const ranking = linha.rankingML && linha.rankingML.total > 1 ? linha.rankingML : null;
  const avisos = linha.avisosML ?? [];
  if (!ranking && avisos.length === 0) return <span className="text-suave">-</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {ranking && (
        <span title="Posição do preço deste anúncio entre o 1º colocado de cada catálogo (o do anúncio e os de referência)" className="text-xs font-medium tabular-nums">
          {ranking.posicao}º de {ranking.total}
        </span>
      )}
      {avisos.length > 0 && (
        // Todos os avisos no title; abrir o anuncio (aba Preco e estoque) marca como visto.
        <span title={avisos.join("\n")} className="rounded border border-amber-300 bg-amber-50 px-1.5 text-xs leading-5 text-amber-800 tabular-nums">
          {avisos.length} {avisos.length === 1 ? "aviso" : "avisos"}
        </span>
      )}
    </span>
  );
}

/** O mesmo icone da coluna Canais de Produtos, so deste anuncio: colorido publicado, "!" em problema, "C" em catalogo. */
function IconeML({ linha }) {
  const estado = linha.icone ?? {};
  const problema = estado.erro || estado.desatualizado || estado.precisaAgirNoML || estado.estoqueDivergenteNoML || estado.catalogoMudouNoML;
  return (
    <Link
      href={enderecoDe(linha)}
      title={estado.rotulo}
      aria-label={estado.rotulo ?? "Abrir o anúncio"}
      className="relative inline-flex shrink-0 rounded hover:ring-2 hover:ring-sky-200 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none"
    >
      <Image src={LOGO_ML} alt="" width={22} height={22} className={`rounded ${estado.publicado ? "" : "opacity-70 brightness-50 grayscale"}`} />
      {problema && (
        <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[10px] leading-none font-bold text-amber-950 ring-2 ring-superficie">
          !
        </span>
      )}
      {estado.catalogos > 0 && (
        <span aria-hidden="true" className="absolute -right-1.5 -bottom-1.5 rounded-full bg-sky-700 px-1 text-[9px] leading-[13px] font-bold text-white ring-2 ring-superficie">
          C
        </span>
      )}
    </Link>
  );
}

// `verConcorrencia` (Acessos, dado.concorrentes): sem ele a coluna Concorrencia nao existe. `podeClonar` (editar o canal):
// o icone de copiar de cada linha abre um anuncio novo igual aquele, do mesmo produto (pedido do dono em 22/10/2026).
export default function TabelaAnunciosML({ linhas, busca, ordenar = "", direcao = "asc", verConcorrencia = true, podeClonar = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // O anuncio com a pergunta de excluir aberta (28/10/2026); depois da exclusao a lista e relida do servidor.
  const [paraExcluir, setParaExcluir] = useState(null);

  if (linhas.length === 0) {
    return (
      <EmptyState
        icone={Handshake}
        titulo={busca ? `Nenhum anúncio encontrado para "${busca}"` : "Nenhum anúncio do Mercado Livre ainda"}
        descricao={
          busca
            ? "Tente outro termo (título, código do produto ou código do kit), ou limpe a busca."
            : 'Clique em "Novo anúncio" e informe o código de um produto Conferido, ou use o ícone do Mercado Livre na lista de Produtos.'
        }
      />
    );
  }

  function ordenarPor(campo) {
    const query = parametrosDaOrdenacao(searchParams, campo, ordenar, direcao).toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }
  const coluna = (campo, rotulo, className = "") => (
    <CabecalhoOrdenavel campo={campo} rotulo={rotulo} ordenar={ordenar} direcao={direcao} aoClicar={ordenarPor} className={className} />
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
      <table className="w-full text-sm">
        <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
          <tr>
            <th className="w-14 px-3 py-2.5 font-medium">
              <span className="sr-only">Foto</span>
            </th>
            {coluna("titulo", "Título")}
            {coluna("codigo", "Código")}
            {coluna("preco", "Preço", "text-right [&>button]:flex-row-reverse")}
            {coluna("estoque", "Estoque", "text-right [&>button]:flex-row-reverse")}
            {coluna("tipo", "Tipo")}
            {coluna("situacao", "Situação")}
            <th className="px-1 py-2.5 text-center font-medium">Anúncio</th>
            <th className="px-1 py-2.5 text-center font-medium">Painel</th>
            {verConcorrencia && <th className="px-3 py-2.5 font-medium">Concorrência</th>}
            <th className="px-3 py-2.5 text-center font-medium">ML</th>
            {podeClonar && (
              <th className="w-16 px-2 py-2.5">
                <span className="sr-only">Ações</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {linhas.map((linha) => (
            <tr key={linha.id} className="hover:bg-fundo">
              <td className={celula}>
                {linha.fotoUrl ? (
                  <FotoComLupa src={linha.fotoUrl} alt={linha.titulo} className="h-10 w-10" />
                ) : (
                  <span title="Sem foto" className="flex h-10 w-10 items-center justify-center rounded border border-dashed border-borda text-suave">
                    <ImageOff size={14} />
                  </span>
                )}
              </td>
              <td className={`${celula} max-w-96`}>
                <Link href={enderecoDe(linha)} className="line-clamp-2 hover:text-acento hover:underline">
                  {linha.titulo || <span className="text-suave italic">Sem título</span>}
                </Link>
              </td>
              <td className={`${celula} font-mono text-xs whitespace-nowrap`}>
                <Link href={enderecoDe(linha)} className="text-acento hover:underline">
                  {linha.codigo}
                </Link>
              </td>
              <td className={`${celula} text-right whitespace-nowrap tabular-nums`}>
                {typeof linha.preco === "number" ? moeda.format(linha.preco) : <span className="text-suave">-</span>}
              </td>
              <td className={`${celula} text-right tabular-nums ${linha.estoque === 0 ? "text-red-700" : ""}`}>
                {typeof linha.estoque === "number" ? linha.estoque : <span className="text-suave">-</span>}
              </td>
              <td className={`${celula} whitespace-nowrap`}>{ROTULO_DO_TIPO_ML[linha.tipoAnuncio] ?? <span className="text-suave">-</span>}</td>
              <td className={celula}>
                <Situacao linha={linha} />
              </td>
              <td className="px-1 py-2 text-center align-middle">
                {linha.linkDoAnuncio ? (
                  <a href={linha.linkDoAnuncio} target="_blank" rel="noreferrer" title={`Abrir o anúncio ${linha.idExterno} no Mercado Livre`} aria-label={`Abrir o anúncio ${linha.idExterno} no Mercado Livre`} className={icone}>
                    <ExternalLink size={15} />
                  </a>
                ) : (
                  <span className="text-suave">-</span>
                )}
              </td>
              <td className="px-1 py-2 text-center align-middle">
                {linha.linkDoPainel ? (
                  <a href={linha.linkDoPainel} target="_blank" rel="noreferrer" title={`Abrir ${linha.idExterno} no painel do vendedor`} aria-label={`Abrir ${linha.idExterno} no painel do vendedor`} className={icone}>
                    <LayoutList size={15} />
                  </a>
                ) : (
                  <span className="text-suave">-</span>
                )}
              </td>
              {verConcorrencia && (
                <td className={celula}>
                  <Concorrencia linha={linha} />
                </td>
              )}
              <td className={`${celula} text-center`}>
                <IconeML linha={linha} />
              </td>
              {podeClonar && (
                <td className="px-2 py-2 text-center align-middle whitespace-nowrap">
                  <Link
                    href={`/canais-de-venda/mercado-livre/novo?clonar=${linha.id}`}
                    title="Clonar anúncio: abre um anúncio novo igual a este, do mesmo produto"
                    aria-label={`Clonar o anúncio ${linha.codigo}`}
                    className={icone}
                  >
                    <Copy size={14} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setParaExcluir(linha.id)}
                    title="Excluir anúncio: sem vendas sai do ML, do Bling e do Rise; com vendas, é encerrado"
                    aria-label={`Excluir o anúncio ${linha.codigo}`}
                    className={`${icone} hover:bg-red-50 hover:text-red-700`}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {paraExcluir && (
        <JanelaExcluirAnuncioML
          anuncioId={paraExcluir}
          aoFechar={() => setParaExcluir(null)}
          aoConcluir={() => {
            setParaExcluir(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

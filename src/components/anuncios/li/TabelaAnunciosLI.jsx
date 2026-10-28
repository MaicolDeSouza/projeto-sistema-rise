"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, ImageOff, LayoutList, ShoppingBag } from "lucide-react";

import { rotuloDoIconeLI } from "@/components/produtos/IconeLojaIntegrada";
import CabecalhoOrdenavel, { parametrosDaOrdenacao } from "@/components/ui/CabecalhoOrdenavel";
import EmptyState from "@/components/ui/EmptyState";
import FotoComLupa from "@/components/ui/FotoComLupa";
import { CANAIS } from "@/lib/canais";
import { STATUS_LI } from "@/lib/canaisDeVenda/li/rotulos";

/**
 * Lista dos anuncios da Loja Integrada (busca e paginacao moram na pagina). Colunas na ordem do padrao do projeto, a mesma
 * da lista do ML (pedido do dono em 28/10/2026): foto, titulo, codigo, preco, estoque, situacao, a loja e o painel da LI e,
 * por ultimo, o icone da LI igual ao da lista de Produtos (com o "!"). A ordem mora na URL e e feita no banco antes de paginar.
 */

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const LOGO_LI = CANAIS.find((canal) => canal.id === "LOJA_INTEGRADA")?.logo;

// A cor da situacao vira um ponto e o texto fica neutro, numa linha so (o mesmo desenho da lista do ML).
const COR_DO_TOM = { neutro: "bg-slate-400", sucesso: "bg-emerald-500", alerta: "bg-amber-500", erro: "bg-red-500", info: "bg-sky-500" };

const enderecoDe = (linha) => `/canais-de-venda/loja-integrada/${linha.id}`;
const celula = "px-3 py-2 align-middle";
const icone = "inline-flex rounded p-1 text-suave hover:bg-fundo hover:text-acento focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none";

function IconeLI({ linha }) {
  const estado = linha.icone;
  const rotulo = estado ? rotuloDoIconeLI(estado) : "Abrir o anúncio";
  const problema = estado && (estado.divergente || estado.incompleto || estado.alertaNaLoja || estado.fotosMudaram);
  return (
    <Link
      href={enderecoDe(linha)}
      title={rotulo}
      aria-label={rotulo}
      className="relative inline-flex shrink-0 rounded hover:ring-2 hover:ring-sky-200 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none"
    >
      <Image src={LOGO_LI} alt="" width={22} height={22} className={`rounded ${estado?.cor === "verde" ? "" : "opacity-70 brightness-50 grayscale"}`} />
      {problema && (
        <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[10px] leading-none font-bold text-amber-950 ring-2 ring-superficie">
          !
        </span>
      )}
    </Link>
  );
}

export default function TabelaAnunciosLI({ linhas, busca, ordenar = "", direcao = "asc" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (linhas.length === 0) {
    return (
      <EmptyState
        icone={ShoppingBag}
        titulo={busca ? `Nenhum anúncio encontrado para "${busca}"` : "Nenhum anúncio da Loja Integrada ainda"}
        descricao={
          busca
            ? "Tente outro termo (título ou código do produto), ou limpe a busca."
            : "Clique em \"Novo anúncio\" e informe o código de um produto Conferido, ou abra o ícone da Loja Integrada na lista de Produtos (o produto que já existe na loja é vinculado pelo código)."
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
            {coluna("situacao", "Situação")}
            <th className="px-1 py-2.5 text-center font-medium">Loja</th>
            <th className="px-1 py-2.5 text-center font-medium">Painel</th>
            <th className="px-3 py-2.5 text-center font-medium">LI</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {linhas.map((linha) => {
            const situacao = STATUS_LI[linha.status] ?? STATUS_LI.RASCUNHO;
            return (
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
                    {linha.sku}
                  </Link>
                </td>
                <td className={`${celula} text-right whitespace-nowrap tabular-nums`}>
                  {typeof linha.preco === "number" ? moeda.format(linha.preco) : <span className="text-suave">-</span>}
                </td>
                <td className={`${celula} text-right tabular-nums ${linha.estoque <= 0 ? "text-red-700" : ""}`}>
                  {typeof linha.estoque === "number" ? linha.estoque : <span className="text-suave">-</span>}
                </td>
                <td className={celula}>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={linha.idExterno ? `id ${linha.idExterno} na loja` : undefined}>
                    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${COR_DO_TOM[situacao.tom] ?? COR_DO_TOM.neutro}`} />
                    {situacao.rotulo}
                  </span>
                </td>
                <td className="px-1 py-2 text-center align-middle">
                  {linha.linkDaLoja ? (
                    <a href={linha.linkDaLoja} target="_blank" rel="noreferrer" title="Abrir o produto na loja" aria-label={`Abrir ${linha.sku} na loja`} className={icone}>
                      <ExternalLink size={15} />
                    </a>
                  ) : (
                    <span className="text-suave">-</span>
                  )}
                </td>
                <td className="px-1 py-2 text-center align-middle">
                  {linha.linkDoPainel ? (
                    <a href={linha.linkDoPainel} target="_blank" rel="noreferrer" title="Abrir o produto no painel da Loja Integrada" aria-label={`Abrir ${linha.sku} no painel da Loja Integrada`} className={icone}>
                      <LayoutList size={15} />
                    </a>
                  ) : (
                    <span className="text-suave">-</span>
                  )}
                </td>
                <td className={`${celula} text-center`}>
                  <IconeLI linha={linha} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

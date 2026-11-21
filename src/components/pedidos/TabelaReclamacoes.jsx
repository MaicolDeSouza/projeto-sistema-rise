"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";

import NotaDeDevolucao from "@/components/pedidos/NotaDeDevolucao";
import CabecalhoOrdenavel, { parametrosDaOrdenacao } from "@/components/ui/CabecalhoOrdenavel";
import { TEXTO_DA_RESOLUCAO, TEXTO_DO_GRUPO, TEXTO_DO_TIPO } from "@/lib/pedidos/reclamacoesTextos";

const DIA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * A lista das reclamacoes do Mercado Livre (20/11/2026). Uma linha por reclamacao: quando abriu, de que pedido, o grupo do
 * motivo com o que o comprador disse, o tipo, se afeta a reputacao e como terminou. O pedido que o Rise tem abre a venda; o
 * de antes do Rise abre no painel do ML. Cabecalho que ordena pela URL, como as outras listas.
 */
export default function TabelaReclamacoes({ linhas, ordenar, direcao, podeMarcarNota = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function trocarOrdenacao(campo) {
    const texto = parametrosDaOrdenacao(searchParams, campo, ordenar, direcao).toString();
    router.push(texto ? `${pathname}?${texto}` : pathname);
  }
  const cabecalho = (campo, rotulo) => <CabecalhoOrdenavel campo={campo} rotulo={rotulo} ordenar={ordenar} direcao={direcao} aoClicar={trocarOrdenacao} />;

  return (
    <div className="overflow-x-auto rounded-md border border-borda bg-superficie">
      <table className="w-full text-left text-sm">
        <thead className="bg-fundo text-[11px] text-suave">
          <tr>
            {cabecalho("data", "Aberta em")}
            <th className="px-3 py-2.5 font-medium uppercase">Pedido</th>
            {cabecalho("grupo", "Motivo")}
            {cabecalho("tipo", "Tipo")}
            {cabecalho("reputacao", "Reputação")}
            {cabecalho("status", "Situação")}
            <th className="px-3 py-2.5 font-medium uppercase">Devolução</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {linhas.map((linha) => (
            <tr key={linha.id} className="align-top">
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">{DIA.format(new Date(linha.abertaEm))}</td>
              <td className="px-3 py-2">
                {linha.pedido ? (
                  <Link href={`/pedidos/${linha.pedido.id}`} className="font-mono text-xs text-acento hover:underline">
                    {linha.pedido.numero}
                  </Link>
                ) : linha.pedidoNumero ? (
                  <a
                    href={`https://www.mercadolivre.com.br/vendas/${linha.pedidoNumero}/detalhe`}
                    target="_blank"
                    rel="noreferrer"
                    title="Venda de antes do Rise: abre no Mercado Livre"
                    className="inline-flex items-center gap-1 font-mono text-xs text-suave hover:text-acento hover:underline"
                  >
                    {linha.pedidoNumero}
                    <ExternalLink size={11} />
                  </a>
                ) : (
                  <span className="text-suave">—</span>
                )}
                {linha.pedido && (
                  <span className="block max-w-[14rem] truncate text-xs text-suave">
                    {linha.pedido.cliente} · {MOEDA.format(linha.pedido.total)}
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                <span className="block">{TEXTO_DO_GRUPO[linha.grupo] ?? linha.grupo}</span>
                {linha.motivo && <span className="block max-w-[22rem] truncate text-xs text-suave">{linha.motivo}</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-suave">{TEXTO_DO_TIPO[linha.tipo] ?? linha.tipo}</td>
              <td className="whitespace-nowrap px-3 py-2 text-xs">
                {linha.afetaReputacao === true ? (
                  <span className="rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-700">Afeta</span>
                ) : linha.afetaReputacao === false ? (
                  <span className="text-suave">Não afeta</span>
                ) : (
                  <span className="text-suave" title="O Mercado Livre não informou">
                    —
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-xs">
                {linha.status === "opened" ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-red-700">
                    <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
                    Aberta
                  </span>
                ) : (
                  <span className="text-suave">{TEXTO_DA_RESOLUCAO[linha.resolucao] ?? "Fechada"}</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs">
                <NotaDeDevolucao linha={linha.devolucao} podeMarcar={podeMarcarNota} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

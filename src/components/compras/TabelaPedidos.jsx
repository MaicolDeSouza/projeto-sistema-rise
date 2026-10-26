"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Plus } from "lucide-react";

import JanelaNovoPedido from "./JanelaNovoPedido";
import SeloDoStatus, { TEXTO_DO_STATUS } from "./SeloDoStatus";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const data = (valor) => (valor ? new Date(valor).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const FILTROS = ["RASCUNHO", "ENVIADO", "PARCIAL", "FINALIZADO", "CANCELADO"];

/** O botao "Novo pedido" do cabecalho da pagina (a janela mora aqui para nao repetir a lista de fornecedores). */
export function BotaoNovoPedido({ fornecedores }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-acento px-3.5 py-2 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-acento/90 active:scale-[0.97]"
      >
        <Plus size={16} /> Novo pedido
      </button>
      {aberto && <JanelaNovoPedido fornecedores={fornecedores} aoFechar={() => setAberto(false)} />}
    </>
  );
}

/**
 * A lista de pedidos de compra. Linha-guia: o operador ve primeiro a situacao e o fornecedor de cada pedido; a acao
 * principal e abrir um. Os chips no topo filtram pela situacao (parametro repetido `?status=`; nenhum = todos).
 */
export default function TabelaPedidos({ linhas, status, veCusto }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function alternar(filtro) {
    const params = new URLSearchParams(searchParams);
    const atuais = new Set(params.getAll("status"));
    if (filtro === null) atuais.clear();
    else if (atuais.has(filtro)) atuais.delete(filtro);
    else atuais.add(filtro);
    params.delete("status");
    params.delete("pagina");
    for (const valor of atuais) params.append("status", valor);
    router.push(`${pathname}?${params}`);
  }

  const chip = (ativo) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${ativo ? "border-acento bg-acento/10 text-acento" : "border-borda text-suave hover:text-texto"}`;

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar pela situação">
        <button type="button" onClick={() => alternar(null)} className={chip(status.length === 0)} aria-pressed={status.length === 0}>
          Todos
        </button>
        {FILTROS.map((filtro) => (
          <button key={filtro} type="button" onClick={() => alternar(filtro)} className={chip(status.includes(filtro))} aria-pressed={status.includes(filtro)}>
            {TEXTO_DO_STATUS[filtro]}
          </button>
        ))}
      </div>

      {linhas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-borda bg-superficie px-6 py-12 text-center">
          <ClipboardList size={30} className="text-suave" />
          <p className="font-medium">Nenhum pedido aqui.</p>
          <p className="text-sm text-suave">Os rascunhos nascem sozinhos pela lista do estoque mínimo, ou pelo botão Novo pedido.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
          <table className="w-full text-sm">
            <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
              <tr>
                <th className="w-px whitespace-nowrap px-3 py-2.5 font-medium">Número</th>
                <th className="px-3 py-2.5 font-medium">Fornecedor</th>
                <th className="w-px px-3 py-2.5 font-medium">Situação</th>
                <th className="w-20 px-3 py-2.5 text-right font-medium">Itens</th>
                {veCusto && <th className="w-32 px-3 py-2.5 text-right font-medium">Total</th>}
                <th className="w-28 px-3 py-2.5 font-medium">Enviado em</th>
                <th className="w-28 px-3 py-2.5 font-medium">Atualizado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {linhas.map((linha) => (
                <tr key={linha.id} className="cursor-pointer hover:bg-fundo/60" onClick={() => router.push(`/compras/pedidos/${linha.id}`)}>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-semibold">
                    <Link href={`/compras/pedidos/${linha.id}`} className="hover:text-acento" onClick={(evento) => evento.stopPropagation()}>
                      {linha.codigo}
                    </Link>
                  </td>
                  <td className="max-w-0 truncate px-3 py-2.5">{linha.fornecedor}</td>
                  <td className="px-3 py-2.5">
                    <SeloDoStatus status={linha.status} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{linha.itens}</td>
                  {veCusto && <td className="px-3 py-2.5 text-right tabular-nums">{moeda.format(linha.total)}</td>}
                  <td className="px-3 py-2.5 tabular-nums text-suave">{data(linha.enviadoEm)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-suave">{data(linha.atualizadoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

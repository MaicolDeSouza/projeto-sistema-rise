"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Plus, Trash2 } from "lucide-react";

import { excluirPedidoAcao } from "@/app/compras/acoes";
import { PODE_EXCLUIR } from "@/lib/compras/regras";

import JanelaNovoPedido from "./JanelaNovoPedido";
import Pergunta from "./Pergunta";
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
export default function TabelaPedidos({ linhas, status, veCusto, podeExcluir = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [excluindo, setExcluindo] = useState(null);
  const [erroAoExcluir, setErroAoExcluir] = useState(null);
  const [ocupado, iniciar] = useTransition();

  const confirmarExclusao = () =>
    iniciar(async () => {
      const resposta = await excluirPedidoAcao(excluindo.id);
      setExcluindo(null);
      if (!resposta?.ok) setErroAoExcluir(resposta?.erro ?? "Não foi possível excluir.");
      router.refresh();
    });

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
                {podeExcluir && <th className="w-12 px-2 py-2.5"><span className="sr-only">Excluir</span></th>}
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
                  <td className="max-w-0 px-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{linha.fornecedor}</span>
                      {linha.origem === "ALIEXPRESS" && (
                        <span className="shrink-0 rounded bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-orange-700 ring-1 ring-orange-200" title={linha.loja ? `AliExpress · ${linha.loja}` : "AliExpress"}>
                          AliExpress
                        </span>
                      )}
                      {linha.alerta && (
                        <span
                          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white"
                          title={linha.alerta === "pendente" ? "Item sem produto do Rise" : "Entregue no AliExpress, falta lançar"}
                          aria-label={linha.alerta === "pendente" ? "Item sem produto do Rise" : "Entregue no AliExpress, falta lançar"}
                        >
                          !
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <SeloDoStatus status={linha.status} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{linha.itens}</td>
                  {veCusto && <td className="px-3 py-2.5 text-right tabular-nums">{moeda.format(linha.total)}</td>}
                  <td className="px-3 py-2.5 tabular-nums text-suave">{data(linha.enviadoEm)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-suave">{data(linha.atualizadoEm)}</td>
                  {podeExcluir && (
                    <td className="px-2 py-1.5" onClick={(evento) => evento.stopPropagation()}>
                      {(() => {
                        // Pedido do AliExpress nao se apaga: a proxima importacao o recriaria (cancelado fica no historico).
                        const doAliExpress = linha.origem === "ALIEXPRESS";
                        const pode = PODE_EXCLUIR.includes(linha.status) && !doAliExpress;
                        const motivo = doAliExpress
                          ? "Pedido do AliExpress não se apaga"
                          : pode
                          ? `Excluir ${linha.codigo}`
                          : linha.status === "ENVIADO"
                            ? "Pedido enviado: cancele antes de excluir"
                            : "Pedido com estoque lançado guarda o histórico e não é excluído";
                        return (
                          <button
                            type="button"
                            disabled={!pode}
                            onClick={() => setExcluindo(linha)}
                            aria-label={motivo}
                            title={motivo}
                            className="inline-flex rounded-md p-2 text-suave transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-suave"
                          >
                            <Trash2 size={16} />
                          </button>
                        );
                      })()}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {erroAoExcluir && <p className="mt-3 text-sm text-rose-600" role="alert">{erroAoExcluir}</p>}
      {excluindo && (
        <Pergunta
          titulo={`Excluir ${excluindo.codigo}?`}
          confirmar="Excluir pedido"
          destrutiva
          ocupado={ocupado}
          aoRecuar={() => setExcluindo(null)}
          aoConfirmar={confirmarExclusao}
        >
          Pedido de {excluindo.fornecedor}, com {excluindo.itens} {excluindo.itens === 1 ? "item" : "itens"}. O pedido, os itens e o arquivo da proposta
          somem; não dá para desfazer.
        </Pergunta>
      )}
    </>
  );
}

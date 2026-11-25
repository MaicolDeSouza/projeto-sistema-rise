"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MessageCircleQuestion, MessagesSquare, ShieldAlert } from "lucide-react";

import CabecalhoOrdenavel, { parametrosDaOrdenacao } from "@/components/ui/CabecalhoOrdenavel";

import { haQuanto, SITUACAO_DO_ATENDIMENTO, SITUACOES, textoDoKit } from "./formatos";
import JanelaDaPergunta from "./JanelaDaPergunta";

function Situacao({ status }) {
  const situacao = SITUACAO_DO_ATENDIMENTO[status] ?? { texto: status, cor: "bg-zinc-300" };
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${situacao.cor}`} />
      {situacao.texto}
    </span>
  );
}

/**
 * As perguntas dos anuncios do ML. O operador ve primeiro as ABERTAS, a mais antiga no alto (o tempo de resposta conta no
 * ML). Chips de situacao (`?status=`; "Todas" = `?status=todas`), cabecalho que ordena, e a linha abre a pergunta.
 */
// Na aba Mensagens (`tipo="POS_VENDA"`, fase 2) a mesma tabela lista as conversas de pos-venda: muda a 2a coluna (o
// pedido no lugar do anuncio) e os textos.
export default function TabelaDePerguntas({ linhas, status, contagem, tipo = "PERGUNTA" }) {
  const reclamacoes = tipo === "RECLAMACAO";
  // Reclamacoes (fase 3): a mesma tabela das conversas, com a etapa na coluna do pedido.
  const mensagens = tipo === "POS_VENDA" || reclamacoes;
  const VAZIO = reclamacoes
    ? { esperando: "Nenhuma reclamação esperando resposta.", nada: "Nenhuma reclamação aqui.", dica: "As reclamações abertas no Mercado Livre aparecem aqui em até 5 minutos, com as mensagens do comprador e do mediador.", filtro: "Filtrar as reclamações" }
    : tipo === "POS_VENDA"
      ? { esperando: "Nenhuma mensagem esperando resposta.", nada: "Nenhuma mensagem aqui.", dica: "As mensagens que os compradores mandam depois da compra aparecem aqui em até 5 minutos.", filtro: "Filtrar as mensagens" }
      : { esperando: "Nenhuma pergunta esperando resposta.", nada: "Nenhuma pergunta aqui.", dica: "As perguntas novas dos anúncios do Mercado Livre aparecem aqui em até 5 minutos.", filtro: "Filtrar as perguntas" };
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [aberta, setAberta] = useState(null);

  function escolher(valor) {
    const params = new URLSearchParams(searchParams);
    if (valor === "ABERTA") params.delete("status");
    else params.set("status", valor);
    params.delete("pagina");
    router.push(`${pathname}?${params}`);
  }

  const ordenar = searchParams.get("ordenar");
  const direcao = searchParams.get("direcao") === "desc" ? "desc" : "asc";
  const coluna = (campo, rotulo) => ({
    campo,
    rotulo,
    ordenar,
    direcao,
    aoClicar: (escolhida) => router.push(`${pathname}?${parametrosDaOrdenacao(searchParams, escolhida, ordenar, direcao)}`),
  });
  const chip = (ativo) => `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${ativo ? "border-acento bg-acento/10 text-acento" : "border-borda text-suave hover:text-texto"}`;
  const total = SITUACOES.reduce((soma, s) => soma + (contagem[s] ?? 0), 0);

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label={VAZIO.filtro}>
        {SITUACOES.map((s) => (
          <button key={s} type="button" onClick={() => escolher(s)} className={chip(status === s)} aria-pressed={status === s}>
            {SITUACAO_DO_ATENDIMENTO[s].plural} <span className="tabular-nums text-suave">{contagem[s] ?? 0}</span>
          </button>
        ))}
        <button type="button" onClick={() => escolher("todas")} className={chip(status === null)} aria-pressed={status === null}>
          Todas <span className="tabular-nums text-suave">{total}</span>
        </button>
      </div>

      {linhas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-borda bg-superficie px-6 py-12 text-center">
          {reclamacoes ? <ShieldAlert size={30} className="text-suave" /> : mensagens ? <MessagesSquare size={30} className="text-suave" /> : <MessageCircleQuestion size={30} className="text-suave" />}
          <p className="font-medium">{status === "ABERTA" ? VAZIO.esperando : VAZIO.nada}</p>
          {status === "ABERTA" && (
            <p className="max-w-md text-sm text-suave">
              {VAZIO.dica}
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
          <table className="w-full text-sm">
            <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
              <tr>
                <CabecalhoOrdenavel {...coluna("recebidaEm", "Recebida")} className="w-28" />
                {mensagens ? <CabecalhoOrdenavel {...coluna("idExterno", "Pedido")} className="w-[32%]" /> : <CabecalhoOrdenavel {...coluna("itemId", "Anúncio")} className="w-[32%]" />}
                <CabecalhoOrdenavel {...coluna("textoDoCliente", mensagens ? "Última mensagem" : "Pergunta")} />
                <CabecalhoOrdenavel {...coluna("status", "Situação")} className="w-48" />
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {linhas.map((linha) => {
                const kit = textoDoKit(linha.anuncio?.unidadesDoKit);
                return (
                  <tr key={linha.id} className="cursor-pointer hover:bg-fundo/60" onClick={() => setAberta(linha)}>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-suave" title={new Date(linha.recebidaEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}>
                      {haQuanto(linha.recebidaEm)}
                    </td>
                    {mensagens && (
                      <td className="max-w-0 px-3 py-2.5">
                        <span className="block truncate" title={linha.pedido?.primeiroItem ?? ""}>
                          {linha.pedido?.primeiroItem || <span className="text-suave">{reclamacoes ? "Venda fora do Rise" : "Pedido fora do Rise"}</span>}
                          {linha.pedido?.itens > 1 && <span className="text-suave"> e mais {linha.pedido.itens - 1}</span>}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-suave">
                          <span className="font-mono">{linha.pedido?.numero ?? linha.idExterno}</span>
                          {reclamacoes && <span className={`rounded px-1 font-medium ${linha.etapa === "dispute" ? "bg-amber-100 text-amber-800" : "bg-fundo text-texto"}`}>{linha.etapa === "dispute" ? "Mediação" : "Reclamação"}</span>}
                          {linha.bloqueado && linha.status === "ABERTA" && <span className="rounded bg-amber-100 px-1 font-medium text-amber-800">{reclamacoes ? "Sem mensagem liberada" : "Bloqueada pelo ML"}</span>}
                        </span>
                      </td>
                    )}
                    <td className={`max-w-0 px-3 py-2.5 ${mensagens ? "hidden" : ""}`}>
                      <div className="flex items-center gap-2.5">
                        {linha.anuncio?.foto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={linha.anuncio.foto} alt="" className="h-9 w-9 shrink-0 rounded border border-borda object-cover" />
                        ) : (
                          <span aria-hidden="true" className="h-9 w-9 shrink-0 rounded border border-borda bg-fundo" />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate" title={linha.anuncio?.titulo ?? ""}>
                            {linha.anuncio?.titulo || <span className="text-suave">Anúncio fora do Rise</span>}
                          </span>
                          <span className="flex items-center gap-2 text-xs text-suave">
                            <span className="font-mono">{linha.itemId ?? "—"}</span>
                            {kit && <span className="rounded bg-fundo px-1 font-medium text-texto">{kit}</span>}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="max-w-0 px-3 py-2.5">
                      <button type="button" className="block w-full truncate text-left hover:text-acento focus-visible:underline focus-visible:outline-none" title={linha.textoDoCliente} onClick={(e) => (e.stopPropagation(), setAberta(linha))}>
                        {linha.textoDoCliente}
                      </button>
                      {linha.status === "ABERTA" && linha.rascunho && <span className="text-xs text-suave">Rascunho guardado</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <Situacao status={linha.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {aberta && <JanelaDaPergunta key={aberta.id} linha={aberta} aoFechar={() => setAberta(null)} />}
    </>
  );
}

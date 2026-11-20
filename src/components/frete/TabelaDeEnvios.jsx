"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Mail, MessageCircle, Truck } from "lucide-react";

import CabecalhoOrdenavel, { parametrosDaOrdenacao } from "@/components/ui/CabecalhoOrdenavel";
import { numeroDoEnvio, SITUACAO_DO_ENVIO } from "@/lib/frete/regras";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const data = (valor) => (valor ? new Date(valor).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo" }) : "—");
/** Os chips de situacao, na ordem do dia a dia (o que pede acao primeiro). */
const CHIPS = ["A_POSTAR", "POSTADO", "COM_PROBLEMA", "NAO_ENTREGUE", "ENTREGUE", "RASCUNHO", "CANCELADO", "EXPIRADO"];

function Situacao({ status }) {
  const situacao = SITUACAO_DO_ENVIO[status] ?? { texto: status, cor: "bg-zinc-300" };
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${situacao.cor}`} />
      {situacao.texto}
    </span>
  );
}

function Aviso({ linha }) {
  if (linha.pendenteDeAviso) {
    return (
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white"
        title={linha.avisoEmailErro ? `Cliente não avisado: ${linha.avisoEmailErro}` : "Cliente ainda não avisado da postagem"}
        aria-label="Cliente ainda não avisado"
      >
        !
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-suave">
      {linha.avisoEmailEm && <Mail size={14} aria-label="E-mail enviado" />}
      {linha.avisoWhatsappEm && <MessageCircle size={14} aria-label="WhatsApp aberto" />}
    </span>
  );
}

/**
 * A lista dos envios do Rise (modulo de frete, fase 2). Chips de situacao no topo (parametro repetido `?status=`; nenhum =
 * todos), cabecalho que ordena e o "!" de quem foi postado sem aviso ao cliente. A linha abre o detalhe do envio.
 */
export default function TabelaDeEnvios({ linhas, status, contagem, veCusto }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function alternar(valor) {
    const params = new URLSearchParams(searchParams);
    const atuais = new Set(params.getAll("status"));
    if (valor === null) atuais.clear();
    else if (atuais.has(valor)) atuais.delete(valor);
    else atuais.add(valor);
    params.delete("status");
    for (const s of atuais) params.append("status", s);
    params.delete("pagina");
    router.push(`${pathname}?${params}`);
  }

  const ordenar = searchParams.get("ordenar");
  const direcao = searchParams.get("direcao") === "asc" ? "asc" : "desc";
  const coluna = (campo, rotulo) => ({
    campo,
    rotulo,
    ordenar,
    direcao,
    aoClicar: (escolhida) => router.push(`${pathname}?${parametrosDaOrdenacao(searchParams, escolhida, ordenar, direcao)}`),
  });
  const chip = (ativo) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${ativo ? "border-acento bg-acento/10 text-acento" : "border-borda text-suave hover:text-texto"}`;

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar os envios">
        <button type="button" onClick={() => alternar(null)} className={chip(status.length === 0)} aria-pressed={status.length === 0}>
          Todos
        </button>
        {CHIPS.filter((s) => contagem[s] || status.includes(s)).map((s) => (
          <button key={s} type="button" onClick={() => alternar(s)} className={chip(status.includes(s))} aria-pressed={status.includes(s)}>
            {SITUACAO_DO_ENVIO[s].texto} <span className="tabular-nums text-suave">{contagem[s] ?? 0}</span>
          </button>
        ))}
      </div>

      {linhas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-borda bg-superficie px-6 py-12 text-center">
          <Truck size={30} className="text-suave" />
          <p className="font-medium">Nenhum envio aqui.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
          <table className="w-full text-sm">
            <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
              <tr>
                <CabecalhoOrdenavel {...coluna("numero", "Nº")} className="w-px whitespace-nowrap" />
                <CabecalhoOrdenavel {...coluna("data", "Data")} className="w-24" />
                <th className="px-3 py-2.5 font-medium">Destinatário</th>
                <th className="w-32 px-3 py-2.5 font-medium">Vínculo</th>
                <th className="px-3 py-2.5 font-medium">Serviço</th>
                <CabecalhoOrdenavel {...coluna("status", "Situação")} className="w-32" />
                <th className="w-36 px-3 py-2.5 font-medium">Rastreio</th>
                {veCusto && <CabecalhoOrdenavel {...coluna("custo", "Custo")} className="w-28 text-right" />}
                <th className="w-16 px-3 py-2.5 font-medium">Aviso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {linhas.map((linha) => (
                <tr key={linha.id} className="cursor-pointer hover:bg-fundo/60" onClick={() => router.push(`/envios/${linha.id}`)}>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-semibold">
                    <Link href={`/envios/${linha.id}`} className="hover:text-acento" onClick={(e) => e.stopPropagation()}>
                      {numeroDoEnvio(linha.numero)}
                    </Link>
                    {linha.direcao === "REVERSO" && <span className="ml-1.5 rounded bg-fundo px-1 text-[10px] font-medium text-suave">reverso</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-suave">{data(linha.criadoEm)}</td>
                  <td className="max-w-0 truncate px-3 py-2.5" title={[linha.nome, linha.cidade].filter(Boolean).join(" · ")}>
                    {linha.nome ?? "—"}
                    {linha.cidade && <span className="ml-1.5 text-xs text-suave">{linha.cidade}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {linha.pedido ? (
                      <Link href={`/pedidos/${linha.pedido.id}?aba=envio`} className="hover:text-acento hover:underline" onClick={(e) => e.stopPropagation()}>
                        Pedido {linha.pedido.numero}
                      </Link>
                    ) : (
                      <span className="text-suave">Avulso</span>
                    )}
                  </td>
                  <td className="max-w-0 truncate px-3 py-2.5">{[linha.transportadoraNome, linha.servicoNome].filter(Boolean).join(" ") || "—"}</td>
                  <td className="px-3 py-2.5">
                    <Situacao status={linha.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                    {linha.rastreio ? (
                      <a
                        href={linha.linkDoRastreio ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 hover:text-acento hover:underline"
                      >
                        {linha.rastreio}
                        <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="text-suave">—</span>
                    )}
                  </td>
                  {veCusto && <td className="px-3 py-2.5 text-right tabular-nums">{linha.custo !== null ? moeda.format(linha.custo) : "—"}</td>}
                  <td className="px-3 py-2.5">
                    <Aviso linha={linha} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

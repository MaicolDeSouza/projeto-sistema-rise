"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Package } from "lucide-react";

import CabecalhoOrdenavel, { parametrosDaOrdenacao } from "@/components/ui/CabecalhoOrdenavel";
import FotoComLupa from "@/components/ui/FotoComLupa";

import { abreviarPagamento, dataCompleta, diaEHora, moeda } from "./formato";
import IconeDoCanalDoPedido from "./IconeDoCanalDoPedido";
import SeloDoNivel from "./SeloDoNivel";
import { COR_DO_STATUS, COR_DO_STATUS_DO_ENVIO, TEXTO_DO_STATUS, TEXTO_DO_STATUS_DO_ENVIO } from "./textos";

/** "falta 2× 900211 (previsão 12/11)", uma peca por linha: o `title` do status Aguardando peças. */
function textoDasFaltas(faltas) {
  return (faltas ?? []).map((peca) => `falta ${peca.falta}× ${peca.sku ?? "peça"}${peca.previsao ? ` (previsão ${peca.previsao})` : ""}`).join("\n");
}

function CelulaDoLucro({ linha }) {
  // Venda cancelada nao tem lucro; a devolvida ja tem o real (so o frete de retorno, como prejuizo), e o estimado
  // mostraria um lucro que nao existe mais.
  if (linha.status === "CANCELADO") return <span className="text-suave" title="Venda cancelada">—</span>;
  const fechado = (linha.lucroFechado || linha.status === "DEVOLVIDO") && linha.lucroReal !== null;
  const valor = fechado ? linha.lucroReal : (linha.lucroEstimado ?? linha.lucroReal);
  const divergente = linha.avisos?.includes("lucroDivergente");
  if (valor === null || valor === undefined) return <span className="text-suave">—</span>;
  const negativo = valor < 0;
  const titulo = linha.status === "DEVOLVIDO"
    ? "Devolvido: a venda saiu do balanço e o frete de retorno fica como prejuízo"
    : fechado
    ? "Lucro real (fechado)"
    : `Lucro estimado${linha.lucroReal !== null ? `; real até agora: ${moeda.format(linha.lucroReal)}` : ""}`;
  return (
    <span className="inline-flex items-center justify-end gap-1" title={divergente ? `${titulo}\nO real está diferente do estimado.` : titulo}>
      {divergente && (
        <span aria-hidden="true" className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[9px] leading-none font-bold text-amber-950">
          !
        </span>
      )}
      <span className={negativo ? "font-medium text-red-600" : fechado ? "" : "text-suave"}>
        {fechado ? "" : "~"}
        {moeda.format(valor)}
      </span>
    </span>
  );
}

/**
 * A lista de Pedidos de venda (spec 5.10). Linha-guia: o operador ve primeiro os pedidos que pedem acao (o "!" do canal,
 * Aguardando peças, A postar), com o fundo ambar; a acao principal e abrir o pedido (a linha inteira e o numero).
 * Ordenam: canal, numero, data, cliente, total, status e lucro (no banco, antes de paginar). Itens, pagamento e envio
 * nao ordenam: moram em JSON ou noutra tabela.
 */
export default function TabelaPedidosDeVenda({ linhas, ordenar, direcao, veLucro }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function trocarOrdenacao(campo) {
    const texto = parametrosDaOrdenacao(searchParams, campo, ordenar, direcao).toString();
    router.push(texto ? `${pathname}?${texto}` : pathname);
  }

  const cabecalho = (campo, rotulo, className = "") => (
    <CabecalhoOrdenavel campo={campo} rotulo={rotulo} ordenar={ordenar} direcao={direcao} aoClicar={trocarOrdenacao} className={`px-2.5! ${className}`} />
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
      <table className="w-full text-sm">
        <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
          <tr>
            {cabecalho("canal", "Canal", "w-px")}
            {cabecalho("numero", "Número", "w-px whitespace-nowrap")}
            {cabecalho("data", "Data", "w-px whitespace-nowrap")}
            {cabecalho("cliente", "Cliente", "w-[16%]")}
            <th className="w-[26%] px-2.5 py-2.5 font-medium">Itens</th>
            {cabecalho("total", "Total", "w-px whitespace-nowrap text-right [&_button]:justify-end")}
            {cabecalho("status", "Status", "w-px whitespace-nowrap")}
            <th className="w-px whitespace-nowrap px-2.5 py-2.5 font-medium">Envio</th>
            {veLucro && cabecalho("lucro", "Lucro", "w-px whitespace-nowrap text-right")}
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {linhas.map((linha) => {
            const pedeAcao = linha.avisos?.length > 0 || linha.status === "AGUARDANDO_PECAS";
            const href = `/pedidos/${linha.id}`;
            const tituloDoStatus =
              linha.status === "AGUARDANDO_PECAS" && linha.faltas?.length > 0
                ? textoDasFaltas(linha.faltas)
                : linha.statusDaOrigem
                  ? `No canal: ${linha.statusDaOrigem}`
                  : undefined;
            const envioDetalhe = linha.envio?.servico ?? linha.envio?.transportadora ?? null;
            const tituloDoEnvio = [envioDetalhe, linha.envio?.rastreio ? `Rastreio: ${linha.envio.rastreio}` : null].filter(Boolean).join("\n") || undefined;
            const pagamento = abreviarPagamento(linha.pagamento);
            const cliente = linha.cliente?.nome ?? linha.nomeDoComprador ?? "Sem nome";
            return (
              <tr
                key={linha.id}
                onClick={() => router.push(href)}
                className={`cursor-pointer transition-colors ${pedeAcao ? "bg-amber-50 hover:bg-amber-100/70" : "hover:bg-fundo/60"}`}
              >
                <td className="px-2.5 py-2">
                  <IconeDoCanalDoPedido canal={linha.canal} avisos={linha.avisos} />
                </td>
                <td className="whitespace-nowrap px-2.5 py-2 font-mono text-xs font-semibold">
                  <Link href={href} onClick={(evento) => evento.stopPropagation()} className="rounded hover:text-acento hover:underline focus-visible:outline-2 focus-visible:outline-acento">
                    {linha.numero}
                  </Link>
                  {linha.blingNumero && <span className="block font-sans text-[11px] font-normal text-suave" title="Número do pedido no Bling">Bling {linha.blingNumero}</span>}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2 tabular-nums text-suave" title={dataCompleta(linha.dataDaVenda)}>
                  {diaEHora(linha.dataDaVenda)}
                </td>
                <td className="max-w-0 px-2.5 py-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{cliente}</span>
                    <SeloDoNivel nivel={linha.cliente?.nivel} />
                  </span>
                </td>
                <td className="max-w-0 px-2.5 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    {linha.item?.foto ? (
                      <FotoComLupa src={linha.item.foto} alt={linha.item.titulo} className="h-9 w-9 shrink-0" />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-borda bg-fundo text-suave">
                        <Package size={15} aria-hidden="true" />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate">
                        {linha.item ? `${linha.item.quantidade}× ${linha.item.titulo}` : "—"}
                      </span>
                      {linha.quantidadeDeItens > 1 && <span className="block text-xs text-suave">e mais {linha.quantidadeDeItens - 1}</span>}
                    </span>
                  </span>
                </td>
                {/* O pagamento mora embaixo do total (em 1366 px uma coluna a mais espremia Cliente e Itens). */}
                <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums">
                  {moeda.format(linha.total ?? 0)}
                  {pagamento && <span className="block text-xs text-suave">{pagamento}</span>}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2" title={tituloDoStatus}>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${COR_DO_STATUS[linha.status] ?? "bg-zinc-300"}`} />
                    {TEXTO_DO_STATUS[linha.status] ?? linha.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2.5 py-2" title={tituloDoEnvio}>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${COR_DO_STATUS_DO_ENVIO[linha.statusDoEnvio] ?? "bg-zinc-300"}`} />
                    {TEXTO_DO_STATUS_DO_ENVIO[linha.statusDoEnvio] ?? linha.statusDoEnvio}
                  </span>
                  {envioDetalhe && <span className="block pl-3.5 text-xs text-suave">{envioDetalhe}</span>}
                </td>
                {veLucro && (
                  <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums">
                    <CelulaDoLucro linha={linha} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

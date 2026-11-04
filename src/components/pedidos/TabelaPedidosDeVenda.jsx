"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, Package } from "lucide-react";

import CabecalhoOrdenavel, { parametrosDaOrdenacao } from "@/components/ui/CabecalhoOrdenavel";
import FotoComLupa from "@/components/ui/FotoComLupa";

import { abreviarPagamento, abrirNoCanal, dataCompleta, diaEHora, linkNoBling, linkNoCanal, moedaComSinal, moeda } from "./formato";
import IconeDoCanalDoPedido from "./IconeDoCanalDoPedido";
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
  const titulo =
    linha.status === "DEVOLVIDO"
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
        {moedaComSinal(valor)}
      </span>
    </span>
  );
}

// O numero do pedido e o "Bling N" abrem o pedido no sistema de origem, em outra aba (pedido do dono em 04/11/2026).
const linkExterno = "rounded hover:text-acento hover:underline focus-visible:outline-2 focus-visible:outline-acento";

/**
 * O cabecalho que filtra (Status e Envio, pedido do dono em 04/11/2026): cada clique passa para a proxima opcao que
 * existe na coluna e, depois da ultima, volta a "todos". A opcao escolhida aparece no proprio cabecalho.
 */
function CabecalhoQueFiltra({ rotulo, opcoes, atual, textos, aoMudar }) {
  const indice = atual ? opcoes.indexOf(atual) : -1;
  const proxima = indice + 1 < opcoes.length ? opcoes[indice + 1] : null;
  const dica = opcoes.length === 0 ? "Nada para filtrar" : proxima ? `Clique para mostrar só: ${textos[proxima] ?? proxima}` : "Clique para mostrar todos";
  return (
    <th className="w-px whitespace-nowrap px-2 py-2.5 font-medium">
      <button
        type="button"
        onClick={() => aoMudar(proxima)}
        disabled={opcoes.length === 0}
        title={dica}
        aria-label={`${rotulo}: ${atual ? (textos[atual] ?? atual) : "todos"}. ${dica}`}
        className={`inline-flex items-center gap-1 uppercase hover:text-texto disabled:cursor-default ${atual ? "font-semibold text-acento" : ""}`}
      >
        {atual ? <span className="normal-case tracking-normal">{textos[atual] ?? atual}</span> : rotulo}
        <Filter size={12} aria-hidden="true" className={atual ? "text-acento" : "text-suave"} />
      </button>
    </th>
  );
}

/** Os ultimos 6 digitos do pedido (o numero inteiro fica na dica); numero curto aparece inteiro. */
const abreviarPedido = (numero) => {
  const texto = String(numero ?? "");
  return texto.length > 8 ? `…${texto.slice(-6)}` : texto;
};

/**
 * A lista de Pedidos de venda, na ordem do dono (04/11/2026): Foto, Qtd. ("2x"), Descrição, Código, Local, Total, Lucro,
 * Status e Envio (cabecalhos que filtram), Data, Pedido (abreviado; abre o pedido no canal, e o "Bling N" no Bling) e
 * Canal. Linha-guia: o operador ve primeiro os pedidos que pedem acao (fundo ambar); a linha abre o pedido no Rise. Um
 * pedido com varios itens mostra o 1o e "e mais N". Ordenam: data, total, lucro e pedido (no banco, antes de paginar).
 *
 * `ordenavel={false}` deixa os cabecalhos parados e sem filtro (a aba Pedidos do cadastro do cliente).
 */
export default function TabelaPedidosDeVenda({ linhas, ordenar, direcao, veLucro, ordenavel = true, opcoes = null, statusAtual = null, envioAtual = null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function trocarOrdenacao(campo) {
    const texto = parametrosDaOrdenacao(searchParams, campo, ordenar, direcao).toString();
    router.push(texto ? `${pathname}?${texto}` : pathname);
  }

  function filtrar(parametro, valor) {
    const params = new URLSearchParams(searchParams);
    params.delete(parametro);
    if (valor) params.set(parametro, valor);
    params.delete("pagina");
    const texto = params.toString();
    router.push(texto ? `${pathname}?${texto}` : pathname);
  }

  const cabecalho = (campo, rotulo, className = "") =>
    ordenavel ? (
      <CabecalhoOrdenavel campo={campo} rotulo={rotulo} ordenar={ordenar} direcao={direcao} aoClicar={trocarOrdenacao} className={`px-2! ${className}`} />
    ) : (
      <th className={`px-2 py-2.5 font-medium ${className}`}>{rotulo}</th>
    );
  const fixo = (rotulo, className = "") => <th className={`px-2 py-2.5 font-medium ${className}`}>{rotulo}</th>;

  return (
    <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
      <table className="w-full text-sm">
        <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
          <tr>
            {fixo(<span className="sr-only">Foto</span>, "w-px")}
            {fixo("Qtd.", "w-px whitespace-nowrap text-right")}
            {fixo("Descrição")}
            {fixo("Código", "w-px whitespace-nowrap")}
            {fixo(<span title="Localização no estoque">Local</span>, "w-px whitespace-nowrap")}
            {cabecalho("total", "Total", "w-px whitespace-nowrap text-right [&_button]:justify-end")}
            {veLucro && cabecalho("lucro", "Lucro", "w-px whitespace-nowrap text-right [&_button]:justify-end")}
            {ordenavel && opcoes ? (
              <CabecalhoQueFiltra rotulo="Status" opcoes={opcoes.status} atual={statusAtual} textos={TEXTO_DO_STATUS} aoMudar={(valor) => filtrar("status", valor)} />
            ) : (
              fixo("Status", "w-px whitespace-nowrap")
            )}
            {ordenavel && opcoes ? (
              <CabecalhoQueFiltra rotulo="Envio" opcoes={opcoes.envio} atual={envioAtual} textos={TEXTO_DO_STATUS_DO_ENVIO} aoMudar={(valor) => filtrar("envio", valor)} />
            ) : (
              fixo("Envio", "w-px whitespace-nowrap")
            )}
            {cabecalho("data", "Data", "w-px whitespace-nowrap")}
            {cabecalho("numero", "Pedido", "w-px whitespace-nowrap")}
            {fixo("Canal", "w-px")}
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
            const noCanal = linkNoCanal(linha);
            const noBling = linha.origem !== "BLING" ? linkNoBling(linha) : null;
            const parar = (evento) => evento.stopPropagation();
            return (
              <tr
                key={linha.id}
                onClick={() => router.push(href)}
                title="Abrir o pedido no Rise"
                className={`cursor-pointer transition-colors ${pedeAcao ? "bg-amber-50 hover:bg-amber-100/70" : "hover:bg-fundo/60"}`}
              >
                <td className="px-2 py-2">
                  {linha.item?.foto ? (
                    <FotoComLupa src={linha.item.foto} alt={linha.item.titulo} className="h-9 w-9" />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded border border-borda bg-fundo text-suave">
                      <Package size={15} aria-hidden="true" />
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-medium tabular-nums">{linha.item?.quantidade ? `${linha.item.quantidade}x` : "—"}</td>
                <td className="max-w-0 px-2 py-2">
                  <span className="block truncate">{linha.item?.titulo ?? "—"}</span>
                  {linha.quantidadeDeItens > 1 && <span className="block text-xs text-suave">e mais {linha.quantidadeDeItens - 1}</span>}
                </td>
                <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">{linha.item?.sku ?? <span className="font-sans text-suave">—</span>}</td>
                <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">{linha.item?.localizacao ?? ""}</td>
                {/* Em cima o valor do anuncio (os produtos); embaixo, so quando o cliente pagou frete, o total com o frete
                    (pedido do dono em 04/11/2026). A forma de pagamento fica na dica (tem aba propria no pedido). */}
                <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums" title={pagamento ? `Pagamento: ${pagamento}` : undefined}>
                  {moeda.format(linha.totalProdutos ?? linha.total ?? 0)}
                  {Number(linha.freteCobrado) > 0 && <span className="block text-xs text-suave">{moeda.format(linha.total ?? 0)} c/ frete</span>}
                </td>
                {veLucro && (
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                    <CelulaDoLucro linha={linha} />
                  </td>
                )}
                <td className="whitespace-nowrap px-2 py-2" title={tituloDoStatus}>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${COR_DO_STATUS[linha.status] ?? "bg-zinc-300"}`} />
                    {TEXTO_DO_STATUS[linha.status] ?? linha.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 py-2" title={tituloDoEnvio}>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${COR_DO_STATUS_DO_ENVIO[linha.statusDoEnvio] ?? "bg-zinc-300"}`} />
                    {TEXTO_DO_STATUS_DO_ENVIO[linha.statusDoEnvio] ?? linha.statusDoEnvio}
                  </span>
                  {/* O servico pode ser longo ("Normal ao endereço"): corta, e o texto inteiro abre ao passar o mouse. */}
                  {envioDetalhe && <span className="block max-w-28 truncate pl-3.5 text-xs text-suave">{envioDetalhe}</span>}
                </td>
                <td className="whitespace-nowrap px-2 py-2 tabular-nums text-suave" title={dataCompleta(linha.dataDaVenda)}>
                  {diaEHora(linha.dataDaVenda)}
                </td>
                <td className="whitespace-nowrap px-2 py-2 font-mono text-xs font-semibold">
                  {noCanal ? (
                    <a href={noCanal} target="_blank" rel="noreferrer" onClick={parar} title={`${abrirNoCanal(linha.origem)}: ${linha.numero}`} className={linkExterno}>
                      {abreviarPedido(linha.numero)}
                    </a>
                  ) : (
                    <span title={linha.numero}>{abreviarPedido(linha.numero)}</span>
                  )}
                  {noBling && (
                    <a href={noBling} target="_blank" rel="noreferrer" onClick={parar} title="Abrir no Bling" className={`block font-sans text-[11px] font-normal text-suave ${linkExterno}`}>
                      Bling {linha.blingNumero}
                    </a>
                  )}
                </td>
                <td className="px-2 py-2">
                  <IconeDoCanalDoPedido canal={linha.canal} avisos={linha.avisos} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

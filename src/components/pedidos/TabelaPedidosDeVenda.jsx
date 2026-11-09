"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Package } from "lucide-react";

import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import CabecalhoOrdenavel, { parametrosDaOrdenacao } from "@/components/ui/CabecalhoOrdenavel";
import FotoComLupa from "@/components/ui/FotoComLupa";

import { abreviarPagamento, abrirNoCanal, dataCompleta, diaEHora, linhasDoMercadoPago, linkNoBling, linkNoCanal, moedaComSinal, moeda } from "./formato";
import CopiarCodigo from "./CopiarCodigo";
import FiltroDaColuna from "./FiltroDaColuna";
import IconeDoCanalDoPedido from "./IconeDoCanalDoPedido";
import { COR_DA_SITUACAO, TEXTO_DA_SITUACAO, TEXTO_DO_STATUS, TEXTO_DO_STATUS_DO_ENVIO, situacaoDoPedido } from "./textos";
import { situacaoDoDespacho } from "@/lib/pedidos/despacho";

// O prazo de envio (08/11/2026): vermelho atrasado, ambar hoje, o resto discreto.
const COR_DO_DESPACHO = { atrasado: "font-semibold text-red-700", hoje: "font-semibold text-amber-700", amanha: "text-suave", depois: "text-suave" };
const DICA_DO_PRAZO = {
  MERCADO_LIVRE: "Prazo do Mercado Livre para deixar na agência; passar dele conta na reputação",
  LOJA_INTEGRADA: "Loja Integrada: 24 horas depois do pagamento",
  BLING: "Bling: a data prevista do pedido de venda",
};

/** "falta 2× 900211 (previsão 12/11)", uma peca por linha: o `title` do status Aguardando peças. */
function textoDasFaltas(faltas) {
  return (faltas ?? []).map((peca) => `falta ${peca.falta}× ${peca.sku ?? "peça"}${peca.previsao ? ` (previsão ${peca.previsao})` : ""}`).join("\n");
}

function CelulaDoLucro({ linha }) {
  // Venda cancelada nao tem lucro; a devolvida ja tem o real (so o frete de retorno, como prejuizo), e o estimado
  // mostraria um lucro que nao existe mais.
  if (linha.status === "CANCELADO") return <span className="text-suave" title="Venda cancelada">—</span>;
  // Conferido no Mercado Pago (pedido do dono em 09/11/2026): o que foi creditado bate com a conta do Rise, entao o lucro
  // real vale sem o "~", mesmo antes de entregar. Divergiu: fica com o "~" e o "!" acende.
  const mp = linha.mercadoPago ?? null;
  const conferido = mp?.estado === "bate" && linha.lucroReal !== null && linha.status !== "DEVOLVIDO";
  const fechado = conferido || ((linha.lucroFechado || linha.status === "DEVOLVIDO") && linha.lucroReal !== null);
  const valor = fechado ? linha.lucroReal : (linha.lucroEstimado ?? linha.lucroReal);
  const divergente = linha.avisos?.includes("lucroDivergente") || linha.avisos?.includes("lucroDiferenteDoMercadoPago");
  if (valor === null || valor === undefined) return <span className="text-suave">—</span>;
  const negativo = valor < 0;
  const titulo =
    linha.status === "DEVOLVIDO"
      ? "Devolvido: a venda saiu do balanço e o frete de retorno fica como prejuízo"
      : conferido
        ? "Lucro real"
        : fechado
          ? "Lucro real (fechado)"
          : `Lucro estimado${linha.lucroReal !== null ? `; real até agora: ${moeda.format(linha.lucroReal)}` : ""}`;
  // A explicacao abre ao passar o mouse ou clicar no lucro (BolhaDeAjuda com o valor como gatilho), nunca fixa na tela.
  const dica = [titulo, linha.avisos?.includes("lucroDivergente") ? "O real está diferente do estimado." : null, ...linhasDoMercadoPago(mp)].filter(Boolean);
  const cor = negativo ? "text-red-600" : valor > 0 ? "text-emerald-700" : "text-suave";
  // O % embaixo (pedido do dono em 05/11/2026) e o MARKUP da regra do Rise: lucro ÷ custo total, e o custo total e o que
  // sobra da receita (os produtos) depois do lucro: comissao, tarifa, frete, imposto e custo do produto. O devolvido saiu
  // do balanco (receita zero) e nao tem %.
  const receita = linha.totalProdutos ?? linha.total;
  const custoTotal = receita - valor;
  const percentual = linha.status !== "DEVOLVIDO" && receita > 0 && custoTotal > 0 ? (valor / custoTotal) * 100 : null;
  return (
    <BolhaDeAjuda variante="inline" texto={dica.map((linhaDaDica) => <span key={linhaDaDica} className="block">{linhaDaDica}</span>)}>
    <span className="inline-flex flex-col items-start">
      <span className="inline-flex items-center gap-1">
        {divergente && (
          <span aria-hidden="true" className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[9px] leading-none font-bold text-amber-950">
            !
          </span>
        )}
        {/* Verde quando deu lucro, vermelho quando deu prejuizo (pedido do dono em 04/11/2026); o "~" marca o estimado. */}
        <span className={`font-medium ${cor}`}>
          {fechado ? "" : "~"}
          {moedaComSinal(valor)}
        </span>
      </span>
      {percentual !== null && (
        <span className={`text-xs ${cor}`}>{percentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
      )}
    </span>
    </BolhaDeAjuda>
  );
}

// O numero do pedido e o "Bling N" abrem o pedido no sistema de origem, em outra aba (pedido do dono em 04/11/2026).
const linkExterno = "rounded hover:text-acento hover:underline focus-visible:outline-2 focus-visible:outline-acento";

/** Os ultimos 6 digitos do pedido (o numero inteiro fica na dica); numero curto aparece inteiro. */
const abreviarPedido = (numero) => {
  const texto = String(numero ?? "");
  return texto.length > 8 ? `…${texto.slice(-6)}` : texto;
};

/**
 * A lista de Vendas, na ordem do dono (04/11/2026): Foto, Qtd. ("2x"), Descrição, Código, Local, Total, Lucro, Status,
 * Data, Pedido (abreviado; abre o pedido no canal, e o "Bling N" no Bling) e Canal. Desde 08/11/2026 (pedido do dono,
 * Opcao 1) a coluna Status mostra UM status, o pedido e o envio juntos (`situacaoDoPedido`), com o prazo de envio embaixo
 * quando ha; o status do canal, o servico e o rastreio ficam na dica. Codigo, Local e Status filtram por um menu de marcar
 * (`FiltroDaColuna`). Linha-guia: o operador ve primeiro os pedidos que pedem acao (fundo ambar); a linha abre o pedido no Rise. Um
 * pedido com varios itens mostra o 1o e "e mais N". Ordenam: data, total, lucro e pedido (no banco, antes de paginar).
 *
 * `ordenavel={false}` deixa os cabecalhos parados e sem filtro (a aba Pedidos do cadastro do cliente).
 */
export default function TabelaPedidosDeVenda({ linhas, ordenar, direcao, veLucro, ordenavel = true, opcoes = null, filtros = null, agora = null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function trocarOrdenacao(campo) {
    const texto = parametrosDaOrdenacao(searchParams, campo, ordenar, direcao).toString();
    router.push(texto ? `${pathname}?${texto}` : pathname);
  }

  // `mudancas`: { parametro: [valores] } (parametro repetido na URL; lista vazia tira o filtro).
  function filtrar(mudancas) {
    const params = new URLSearchParams(searchParams);
    for (const [parametro, valores] of Object.entries(mudancas)) {
      params.delete(parametro);
      for (const valor of valores) params.append(parametro, valor);
    }
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
  const filtravel = ordenavel && opcoes && filtros;
  const comoOpcoes = (valores, textos = null, cores = null) => valores.map((valor) => ({ valor, texto: textos?.[valor] ?? valor, cor: cores?.[valor] }));
  // A opcao marcada que saiu da lista (outro filtro a escondeu) continua no menu, para poder desmarcar.
  const comAtuais = (valores, atuais) => [...valores, ...atuais.filter((valor) => !valores.includes(valor))];

  return (
    <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
      {/* Larguras FIXAS (pedido do dono em 04/11/2026: ao filtrar, as colunas mudavam de lugar e a leitura se perdia). So a
          Descricao ocupa o que sobra; o que nao cabe numa coluna e cortado com reticencias (`truncate`) e abre ao passar
          o mouse. */}
      {/* Largura minima: as colunas fixas somam ~56rem, e numa tela estreita a Descricao sumia (ficava com 0). Abaixo disso a
          tabela rola de lado e a Descricao guarda ~10rem. */}
      <table className="w-full min-w-[66rem] table-fixed text-sm">
        <colgroup>
          <col style={{ width: "3.25rem" }} />
          <col style={{ width: "2.75rem" }} />
          <col />
          {/* Codigo e Local com folga para o rotulo e o funil do filtro (07/11/2026). */}
          <col style={{ width: "6.25rem" }} />
          <col style={{ width: "4.5rem" }} />
          {/* Total com 8rem: cabe ate "R$ 1.234,56 c/ frete" (05/11/2026); o que passar corta e abre ao passar o mouse. */}
          <col style={{ width: "8rem" }} />
          {veLucro && <col style={{ width: "5.75rem" }} />}
          {/* Status unico com o prazo embaixo (08/11/2026): cabe "Aguardando pagamento" e "Atrasado: era sex 07/11 até 16:30". */}
          <col style={{ width: "10.25rem" }} />
          {/* Data inteira ("07/11 06:41"); com 6rem cortava a hora. */}
          <col style={{ width: "6.5rem" }} />
          <col style={{ width: "5.75rem" }} />
          <col style={{ width: "3.25rem" }} />
        </colgroup>
        <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
          {/* Divisoria entre as colunas (pedido do dono em 04/11/2026: pareciam todas juntas). */}
          <tr className="divide-x divide-borda">
            {fixo(<span className="sr-only">Foto</span>, "w-px")}
            {fixo("Qtd.", "w-px whitespace-nowrap text-right")}
            {fixo("Descrição")}
            {filtravel ? (
              <FiltroDaColuna
                rotulo="Código"
                className="whitespace-nowrap"
                grupos={[{ parametro: "codigo", opcoes: comoOpcoes(comAtuais(opcoes.codigos ?? [], filtros.codigos)), atuais: filtros.codigos }]}
                aoMudar={filtrar}
              />
            ) : (
              fixo("Código", "w-px whitespace-nowrap")
            )}
            {filtravel ? (
              <FiltroDaColuna
                rotulo="Local"
                className="whitespace-nowrap"
                grupos={[{ parametro: "local", opcoes: comoOpcoes(comAtuais(opcoes.locais ?? [], filtros.locais)), atuais: filtros.locais }]}
                aoMudar={filtrar}
              />
            ) : (
              fixo(<span title="Localização no estoque">Local</span>, "w-px whitespace-nowrap")
            )}
            {cabecalho("total", "Total", "w-px whitespace-nowrap")}
            {veLucro && cabecalho("lucro", "Lucro", "w-px whitespace-nowrap")}
            {filtravel ? (
              <FiltroDaColuna
                rotulo="Status"
                className="whitespace-nowrap"
                grupos={[{ parametro: "situacao", opcoes: comoOpcoes(comAtuais(opcoes.situacoes ?? [], filtros.situacoes), TEXTO_DA_SITUACAO, COR_DA_SITUACAO), atuais: filtros.situacoes }]}
                aoMudar={filtrar}
              />
            ) : (
              fixo("Status", "w-px whitespace-nowrap")
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
            const situacao = situacaoDoPedido(linha);
            const envioDetalhe = linha.envio?.servico ?? linha.envio?.transportadora ?? null;
            // A dica guarda o que a coluna deixou de mostrar: o status do pedido e o do envio, o servico, o rastreio, as
            // pecas em falta e a situacao escrita pelo canal.
            const tituloDoStatus = [
              `Pedido: ${TEXTO_DO_STATUS[linha.status] ?? linha.status}`,
              `Envio: ${TEXTO_DO_STATUS_DO_ENVIO[linha.statusDoEnvio] ?? linha.statusDoEnvio}${envioDetalhe ? ` · ${envioDetalhe}` : ""}`,
              linha.envio?.rastreio ? `Rastreio: ${linha.envio.rastreio}` : null,
              linha.status === "AGUARDANDO_PECAS" && linha.faltas?.length > 0 ? textoDasFaltas(linha.faltas) : null,
              linha.statusDaOrigem ? `No canal: ${linha.statusDaOrigem}` : null,
            ]
              .filter(Boolean)
              .join("\n");
            const pagamento = abreviarPagamento(linha.pagamento);
            const noCanal = linkNoCanal(linha);
            const noBling = linha.origem !== "BLING" ? linkNoBling(linha) : null;
            const parar = (evento) => evento.stopPropagation();
            return (
              <tr
                key={linha.id}
                className={`group divide-x divide-borda transition-colors ${pedeAcao ? "bg-amber-50 hover:bg-amber-100/70" : "hover:bg-fundo/60"}`}
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
                <td
                  className="whitespace-nowrap px-2 py-2 text-right font-medium tabular-nums"
                  title={linha.item?.unidadesPorKit > 1 ? `Kit de ${linha.item.unidadesPorKit} unidades` : undefined}
                >
                  {linha.item?.quantidade ? `${linha.item.quantidade}x` : "—"}
                  {/* As PECAS escritas embaixo no kit (pedido do dono em 09/11/2026: "10x" ao lado de "10x Conector" parecia 100
                      unidades). "1x" e o kit vendido; "10 un." e o que sai do estoque e o que se separa. */}
                  {linha.item?.unidadesPorKit > 1 && <span className="block text-xs font-normal text-suave">{linha.item.unidades} un.</span>}
                </td>
                <td className="max-w-0 px-2 py-2">
                  {/* So o nome abre o pedido (pedido do dono em 09/11/2026): clicar no codigo, no local ou na linha nao navega,
                      para dar para selecionar e copiar sem abrir a tela. */}
                  <Link href={href} title="Abrir o pedido no Rise" className="block truncate hover:text-acento hover:underline focus-visible:outline-2 focus-visible:outline-acento">
                    {linha.item?.titulo ?? "—"}
                  </Link>
                  {linha.quantidadeDeItens > 1 && <span className="block text-xs text-suave">e mais {linha.quantidadeDeItens - 1}</span>}
                </td>
                <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">
                  {linha.item?.sku ? (
                    <>
                      <span className="select-text">{linha.item.sku}</span>
                      <CopiarCodigo codigo={linha.item.sku} />
                    </>
                  ) : (
                    <span className="font-sans text-suave">—</span>
                  )}
                </td>
                <td className="truncate px-2 py-2 font-mono text-xs">{linha.item?.localizacao ?? ""}</td>
                {/* Em cima o valor do anuncio (os produtos); embaixo, so quando o cliente pagou frete, o total com o frete
                    (pedido do dono em 04/11/2026). A forma de pagamento fica na dica (tem aba propria no pedido). */}
                <td className="whitespace-nowrap px-2 py-2 text-left tabular-nums" title={pagamento ? `Pagamento: ${pagamento}` : undefined}>
                  {moeda.format(linha.totalProdutos ?? linha.total ?? 0)}
                  {Number(linha.freteCobrado) > 0 && <span className="block truncate text-xs text-suave">{moeda.format(linha.total ?? 0)} c/ frete</span>}
                </td>
                {veLucro && (
                  <td className="whitespace-nowrap px-2 py-2 text-left tabular-nums">
                    <CelulaDoLucro linha={linha} />
                  </td>
                )}
                {/* Status: UM status (pedido do dono em 08/11/2026: "em vendas o status tem 02 informacoes. Quero apenas 1",
                    Opcao 1) e, embaixo, o prazo de envio de cada canal ("com relacao ao prazo quero que mostre [na coluna]
                    de status"). O resto vai para a dica. */}
                <td className="max-w-0 px-2 py-2">
                  <span className="flex min-w-0 items-center gap-1.5" title={tituloDoStatus}>
                    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${COR_DA_SITUACAO[situacao] ?? "bg-zinc-300"}`} />
                    <span className="truncate">{TEXTO_DA_SITUACAO[situacao] ?? situacao}</span>
                  </span>
                  {/* So com o "agora" do servidor (a lista de Pedidos): a aba do cliente nao mostra, para nao divergir na hidratacao. */}
                  {(() => {
                    const despacho = agora ? situacaoDoDespacho(linha, agora) : null;
                    if (!despacho) return null;
                    return (
                      <span className={`block truncate text-xs ${COR_DO_DESPACHO[despacho.chave]}`} title={DICA_DO_PRAZO[linha.origem] ?? "Prazo de envio"}>
                        {despacho.texto}
                      </span>
                    );
                  })()}
                </td>
                <td className="truncate px-2 py-2 tabular-nums text-suave" title={dataCompleta(linha.dataDaVenda)}>
                  {diaEHora(linha.dataDaVenda)}
                </td>
                <td className="truncate px-2 py-2 text-left font-mono text-xs font-semibold">
                  {noCanal ? (
                    <a href={noCanal} target="_blank" rel="noreferrer" onClick={parar} title={`${abrirNoCanal(linha.origem)}: ${linha.numero}`} className={linkExterno}>
                      {linha.origem === "MERCADO_LIVRE" && <span className="mr-1 font-sans font-semibold text-suave">ML</span>}
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
                  <IconeDoCanalDoPedido canal={linha.canal} avisos={linha.avisos} doRise={linha.doRise} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import { useState } from "react";

import { BarraDeAbas, Painel } from "@/components/cadastros/Abas";
import Card from "@/components/ui/Card";

import AbaEnvio from "./AbaEnvio";
import AbaGeral from "./AbaGeral";
import AbaHistorico from "./AbaHistorico";
import AbaItens from "./AbaItens";
import AbaLucro from "./AbaLucro";
import AbaNotaFiscal from "./AbaNotaFiscal";
import AbaPagamento from "./AbaPagamento";
import AbaPecas from "./AbaPecas";
import JanelaVincularCliente from "./JanelaVincularCliente";
import RodapeDoPedido from "./RodapeDoPedido";
import { ABA_DO_AVISO, AVISOS_GRAVES, TEXTO_DO_AVISO } from "./textos";

const semErro = () => false;

/**
 * A tela de um pedido de venda (spec 5.10): os avisos no topo, as abas lado a lado (todas montadas, so escondidas, no
 * molde do cadastro de Cliente) e o rodape com a unica acao de estado. Peças so aparece com falta ou Aguardando peças;
 * Lucro so para quem ve custo.
 */
export default function PedidoDeVenda({ pedido, veCusto, pode, nfeLigada, abaInicial = null }) {
  const [vinculando, setVinculando] = useState(false);
  const mostrarPecas = pedido.status === "AGUARDANDO_PECAS" || Boolean(pedido.pecas?.falta);
  // O "!" ao lado da aba onde mora cada aviso (pedido do dono em 09/11/2026); a faixa do topo continua dizendo qual e.
  const abasComAviso = new Set((pedido.avisos ?? []).map((chave) => ABA_DO_AVISO[chave]).filter(Boolean));
  const abas = [
    { id: "geral", rotulo: "Dados do cliente" },
    { id: "itens", rotulo: `Itens (${pedido.itens.length})` },
    { id: "pagamento", rotulo: "Pagamento" },
    mostrarPecas && { id: "pecas", rotulo: "Peças" },
    { id: "envio", rotulo: "Envio" },
    { id: "nf", rotulo: "Nota fiscal" },
    { id: "historico", rotulo: "Histórico" },
    // Lucro por ultimo (pedido do dono em 04/11/2026).
    veCusto && { id: "lucro", rotulo: "Lucro" },
  ]
    .filter(Boolean)
    .map((item) =>
      abasComAviso.has(item.id)
        ? {
            ...item,
            rotulo: (
              <>
                {item.rotulo}
                <span
                  aria-label="Há aviso nesta aba"
                  className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[9px] leading-none font-bold text-amber-950"
                >
                  !
                </span>
              </>
            ),
          }
        : item,
    );
  // Abre na aba do link (`?aba=itens`), quando ela existe neste pedido; senao, Dados do cliente.
  const [aba, setAba] = useState(() => (abas.some((item) => item.id === abaInicial) ? abaInicial : "geral"));
  const avisos = pedido.avisos ?? [];

  return (
    <>
      {avisos.length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {avisos.map((chave) => {
            const grave = AVISOS_GRAVES.has(chave);
            return (
              <li
                key={chave}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${grave ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
              >
                <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${grave ? "bg-red-600 text-white" : "bg-amber-400 text-amber-950"}`}>
                  !
                </span>
                {TEXTO_DO_AVISO[chave] ?? chave}
              </li>
            );
          })}
        </ul>
      )}

      <Card className="p-0">
        <BarraDeAbas abas={abas} aba={aba} aoMudar={setAba} comErro={semErro} />
        <Painel id="geral" aba={aba}>
          <AbaGeral pedido={pedido} podeVincular={pode.vincularCliente} aoVincular={() => setVinculando(true)} />
        </Painel>
        <Painel id="itens" aba={aba}>
          <AbaItens pedido={pedido} />
        </Painel>
        <Painel id="pagamento" aba={aba}>
          <AbaPagamento pedido={pedido} />
        </Painel>
        {mostrarPecas && (
          <Painel id="pecas" aba={aba}>
            <AbaPecas pecas={pedido.pecas} />
          </Painel>
        )}
        <Painel id="envio" aba={aba}>
          <AbaEnvio pedido={pedido} podeEditarFrete={pode.editarCustoDoFrete} />
        </Painel>
        {veCusto && (
          <Painel id="lucro" aba={aba}>
            <AbaLucro pedido={pedido} podeAceitar={Boolean(pode.aceitarDivergencia)} />
          </Painel>
        )}
        <Painel id="nf" aba={aba}>
          <AbaNotaFiscal pedido={pedido} podeBaixar={pode.baixarNF} />
        </Painel>
        <Painel id="historico" aba={aba}>
          <AbaHistorico historico={pedido.historico} />
        </Painel>
      </Card>

      <RodapeDoPedido pedido={pedido} podeSeparar={pode.marcarSeparacao} nfeLigada={nfeLigada} />

      {vinculando && <JanelaVincularCliente pedido={pedido} aoFechar={() => setVinculando(false)} />}
    </>
  );
}

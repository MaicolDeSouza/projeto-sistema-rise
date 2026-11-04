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
import AbaPecas from "./AbaPecas";
import JanelaVincularCliente from "./JanelaVincularCliente";
import RodapeDoPedido from "./RodapeDoPedido";
import { AVISOS_GRAVES, TEXTO_DO_AVISO } from "./textos";

const semErro = () => false;

/**
 * A tela de um pedido de venda (spec 5.10): os avisos no topo, as abas lado a lado (todas montadas, so escondidas, no
 * molde do cadastro de Cliente) e o rodape com a unica acao de estado. Peças so aparece com falta ou Aguardando peças;
 * Lucro so para quem ve custo.
 */
export default function PedidoDeVenda({ pedido, veCusto, pode, nfeLigada }) {
  const [vinculando, setVinculando] = useState(false);
  const mostrarPecas = pedido.status === "AGUARDANDO_PECAS" || Boolean(pedido.pecas?.falta);
  const abas = [
    { id: "geral", rotulo: "Geral" },
    { id: "itens", rotulo: `Itens (${pedido.itens.length})` },
    mostrarPecas && { id: "pecas", rotulo: "Peças" },
    { id: "envio", rotulo: "Envio" },
    veCusto && { id: "lucro", rotulo: "Lucro" },
    { id: "nf", rotulo: "Nota fiscal" },
    { id: "historico", rotulo: "Histórico" },
  ].filter(Boolean);
  const [aba, setAba] = useState("geral");
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
          <AbaItens itens={pedido.itens} veCusto={veCusto} />
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
            <AbaLucro pedido={pedido} />
          </Painel>
        )}
        <Painel id="nf" aba={aba}>
          <AbaNotaFiscal pedido={pedido} />
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

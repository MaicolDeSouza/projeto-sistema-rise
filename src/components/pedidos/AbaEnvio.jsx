"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink } from "lucide-react";

import { salvarCustoDoFreteManualAcao } from "@/app/pedidos/acoes";

import { Dado, Secao } from "./AbaGeral";
import { dataCompleta, linkDoRastreio, moeda } from "./formato";
import { COR_DO_STATUS_DO_ENVIO, TEXTO_DO_STATUS_DO_ENVIO } from "./textos";

const PASSOS = [
  ["prontoEm", "Pronto para envio"],
  ["postadoEm", "Postado"],
  ["entregueEm", "Entregue"],
  ["naoEntregueEm", "Não entregue"],
  ["canceladoEm", "Envio cancelado"],
  ["devolvidoEm", "Devolvido"],
];

const TEXTO_DA_FONTE_DO_FRETE = {
  envio: "do envio do ML",
  etiqueta: "da etiqueta do Enviali",
  pedido: "do pedido",
  estimado: "estimativa, até postar",
};

const paraTexto = (valor) => (valor === null || valor === undefined ? "" : String(valor).replace(".", ","));

/** O "Custo real do frete" do pedido do Bling: o operador digita o que pagou, e o lucro real e refeito ao sair do campo. */
function CampoDoFreteManual({ pedido, podeEditar }) {
  const [texto, setTexto] = useState(paraTexto(pedido.custoDoFreteManual));
  const [salvo, setSalvo] = useState(paraTexto(pedido.custoDoFreteManual));
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(false);
  const [salvando, iniciar] = useTransition();

  function salvar() {
    if (texto.trim() === salvo.trim()) return;
    const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
    const valor = limpo === "" ? null : Number(limpo);
    if (valor !== null && !Number.isFinite(valor)) return setErro("Use só números, como 18,90.");
    iniciar(async () => {
      const resultado = await salvarCustoDoFreteManualAcao(pedido.id, valor);
      if (resultado?.ok) {
        setSalvo(texto);
        setErro(null);
        setOk(true);
        setTimeout(() => setOk(false), 1800);
      } else setErro(resultado?.erro ?? "Não foi possível salvar.");
    });
  }

  return (
    <div className="mt-4 max-w-56">
      <label htmlFor="frete-manual" className="text-xs text-suave">
        Custo real do frete
      </label>
      <div className="relative mt-1">
        <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-suave">R$</span>
        <input
          id="frete-manual"
          inputMode="decimal"
          value={texto}
          disabled={!podeEditar || salvando}
          title={podeEditar ? "Salva ao sair do campo" : "Sem permissão para digitar o custo do frete"}
          onChange={(e) => {
            setErro(null);
            setTexto(e.target.value.replace(/[^\d.,]/g, ""));
          }}
          onBlur={salvar}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          placeholder="0,00"
          className="w-full rounded-md border border-borda bg-superficie py-1.5 pr-8 pl-8 text-right text-sm tabular-nums outline-none focus:border-acento disabled:bg-fundo disabled:text-suave"
        />
        {ok && <Check size={15} aria-label="Salvo" className="absolute top-1/2 right-2.5 -translate-y-1/2 text-emerald-600" />}
      </div>
      {erro && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {erro}
        </p>
      )}
    </div>
  );
}

/**
 * Aba Envio: o tipo, o servico, o rastreio com link, o status com as datas e o custo do frete para o vendedor, com a
 * fonte em cinza ("estimativa, até postar"). No pedido do Bling o custo e digitado pelo operador.
 */
export default function AbaEnvio({ pedido, podeEditarFrete }) {
  const envio = pedido.envio ?? {};
  const link = linkDoRastreio(pedido);
  const passos = PASSOS.filter(([chave]) => envio.historico?.[chave]);
  const custo = envio.custoDoVendedor;

  return (
    <div className="grid gap-x-10 gap-y-7 p-5 md:grid-cols-2">
      <Secao titulo="Envio">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Dado rotulo="Situação">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${COR_DO_STATUS_DO_ENVIO[pedido.statusDoEnvio] ?? "bg-zinc-300"}`} />
              {TEXTO_DO_STATUS_DO_ENVIO[pedido.statusDoEnvio] ?? pedido.statusDoEnvio}
            </span>
          </Dado>
          <Dado rotulo="Serviço">{envio.servico ?? envio.transportadora ?? null}</Dado>
          <Dado rotulo="Rastreio" className="col-span-2">
            {envio.rastreio ? (
              link ? (
                <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono hover:text-acento hover:underline">
                  {envio.rastreio}
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
              ) : (
                <span className="font-mono">{envio.rastreio}</span>
              )
            ) : null}
          </Dado>
          <Dado rotulo="Previsão de entrega">{envio.prazo ? dataCompleta(envio.prazo) : null}</Dado>
          <Dado rotulo="Logística">{envio.tipo ?? null}</Dado>
        </dl>
        {passos.length > 0 && (
          <ol className="mt-5 space-y-1.5 border-l border-borda pl-4 text-sm">
            {passos.map(([chave, rotulo]) => (
              <li key={chave} className="relative">
                <span aria-hidden="true" className="absolute top-1.5 -left-[21px] h-2 w-2 rounded-full bg-sky-500 ring-2 ring-superficie" />
                {rotulo} <span className="text-suave tabular-nums">em {dataCompleta(envio.historico[chave])}</span>
              </li>
            ))}
          </ol>
        )}
      </Secao>

      <Secao titulo="Custo do frete">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-suave">Cobrado do cliente</dt>
            <dd className="tabular-nums">{moeda.format(pedido.freteCobrado ?? 0)}</dd>
          </div>
          {pedido.origem !== "BLING" && (
            <div className="flex justify-between gap-4">
              <dt className="text-suave">Pago pela loja</dt>
              <dd className="text-right tabular-nums">
                {custo !== null && custo !== undefined ? moeda.format(custo) : "—"}
                {envio.fonteDoCusto && <span className="block text-xs text-suave">{TEXTO_DA_FONTE_DO_FRETE[envio.fonteDoCusto] ?? envio.fonteDoCusto}</span>}
              </dd>
            </div>
          )}
        </dl>
        {pedido.origem === "BLING" && <CampoDoFreteManual pedido={pedido} podeEditar={podeEditarFrete} />}
      </Secao>
    </div>
  );
}

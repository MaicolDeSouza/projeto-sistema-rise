import { Download } from "lucide-react";

import { Dado } from "./AbaGeral";
import { dataCompleta, NOME_DO_CANAL } from "./formato";

const EMISSOR = { MERCADO_LIVRE: "Emissor do Mercado Livre", BLING: "Bling", LOJA_INTEGRADA: "Loja Integrada" };

const SITUACAO = {
  authorized: "Autorizada",
  autorizada: "Autorizada",
  cancelled: "Cancelada",
  cancelada: "Cancelada",
  rejected: "Rejeitada",
  pending: "Pendente",
};

/** O canal deu o arquivo? Mesma regra de `destinoDaNF` (lib/pedidos/nf.js), so para ligar ou desligar o botao. */
function temArquivo(nf, tipo) {
  if (tipo === "pdf") return Boolean(nf.urlPdf);
  return Boolean(nf.urlXml) || /^https?:\/\//i.test(String(nf.xml ?? ""));
}

/**
 * Aba Nota fiscal: o que o emissor informou (numero, serie, chave, data, situacao) e os dois downloads pela rota
 * `/api/pedidos/[id]/nf` (em outra aba: o ML passa pelo Rise, a LI e o Bling abrem o link deles). Sem o arquivo, o botao
 * fica desligado com o motivo; sem NF, a frase diz em que canal ela ainda falta.
 */
export default function AbaNotaFiscal({ pedido, podeBaixar = true }) {
  const nf = pedido.nf;
  if (!nf) return <p className="p-5 text-sm text-suave">NF ainda não emitida em {NOME_DO_CANAL[pedido.origem] ?? pedido.origem}.</p>;
  const situacao = SITUACAO[String(nf.status ?? "").toLowerCase()] ?? nf.status;
  const cancelada = /cancel/i.test(String(nf.status ?? ""));
  const botao =
    "inline-flex items-center gap-1.5 rounded-md border border-borda px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="p-5">
      <dl className="grid max-w-2xl grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        <Dado rotulo="Número">{nf.numero ? <span className="tabular-nums">{nf.numero}</span> : null}</Dado>
        <Dado rotulo="Série">{nf.serie ?? null}</Dado>
        <Dado rotulo="Situação">{situacao ? <span className={cancelada ? "text-suave line-through" : ""}>{situacao}</span> : null}</Dado>
        <Dado rotulo="Emitida em">{nf.emitidaEm ? dataCompleta(nf.emitidaEm) : null}</Dado>
        <Dado rotulo="Emissor">{EMISSOR[nf.origem] ?? nf.origem ?? null}</Dado>
        <Dado rotulo="Chave de acesso" className="col-span-2 sm:col-span-3">
          {nf.chave ? <span className="font-mono text-xs break-all">{nf.chave}</span> : null}
        </Dado>
      </dl>
      <div className="mt-5 flex gap-2">
        {[
          ["pdf", "Baixar NF"],
          ["xml", "Baixar XML"],
        ].map(([tipo, rotulo]) => {
          const motivo = !podeBaixar ? "Sem permissão para baixar NF e XML." : !temArquivo(nf, tipo) ? "Este canal não deu o arquivo." : null;
          return motivo ? (
            <button key={tipo} type="button" disabled title={motivo} className={botao}>
              <Download size={14} aria-hidden="true" /> {rotulo}
            </button>
          ) : (
            <a key={tipo} href={`/api/pedidos/${pedido.id}/nf?tipo=${tipo}`} target="_blank" rel="noopener noreferrer" className={`${botao} hover:bg-fundo`}>
              <Download size={14} aria-hidden="true" /> {rotulo}
            </a>
          );
        })}
      </div>
    </div>
  );
}

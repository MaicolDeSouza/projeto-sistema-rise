"use client";

import { useState } from "react";

import SecaoDoAnuncio from "@/components/anuncios/ml/SecaoDoAnuncio";
import { FORMAS_DE_PAGAMENTO, TEXTO_DO_FRETE, dataBR, lerDesconto, prazoGeral, textoDoPagamento } from "@/lib/propostas/regras";
import { campo, Rotulo } from "./CartaoCliente";
import { doTexto, moeda, soDecimal, soDigitos } from "./formato";

/** Pagamento: uma condicao da lista (vem a preferida do cliente) e os ajustes; o resumo e o que sai no PDF. */
export function CartaoPagamento({ formulario, condicoes, editar, erros, aoMudar }) {
  const condicaoNome = condicoes.find((c) => c.id === formulario.condicaoPagamentoId)?.nome ?? null;
  const resumo = textoDoPagamento({ ...formulario, condicaoNome, parcelas: doTexto(formulario.parcelas), entradaPercentual: doTexto(formulario.entradaPercentual) });
  return (
    <SecaoDoAnuncio titulo="Pagamento" ajuda="A condição vem da preferida do cliente. O texto livre vai no PDF depois do resumo.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Rotulo texto="Condição">
          <select value={formulario.condicaoPagamentoId} disabled={!editar} onChange={(e) => aoMudar("condicaoPagamentoId", e.target.value)} className={campo}>
            <option value="">Sem condição da lista</option>
            {condicoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Rotulo>
        <Rotulo texto="Forma">
          <select value={formulario.formaPagamento} disabled={!editar} onChange={(e) => aoMudar("formaPagamento", e.target.value)} className={campo}>
            <option value="">—</option>
            {FORMAS_DE_PAGAMENTO.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Rotulo>
        <Rotulo texto="Parcelas" erro={erros.parcelas}>
          <input inputMode="numeric" value={formulario.parcelas} disabled={!editar} aria-invalid={Boolean(erros.parcelas)} onChange={(e) => aoMudar("parcelas", soDigitos(e.target.value, 2))} className={`${campo} tabular-nums`} />
        </Rotulo>
        <Rotulo texto="Entrada (%)" erro={erros.entradaPercentual}>
          <input inputMode="decimal" value={formulario.entradaPercentual} disabled={!editar} aria-invalid={Boolean(erros.entradaPercentual)} onChange={(e) => aoMudar("entradaPercentual", soDecimal(e.target.value))} className={`${campo} tabular-nums`} />
        </Rotulo>
        <Rotulo texto="Texto livre" className="sm:col-span-2">
          <textarea rows={2} value={formulario.pagamentoTexto} disabled={!editar} onChange={(e) => aoMudar("pagamentoTexto", e.target.value)} className={`${campo} field-sizing-content min-h-16`} />
        </Rotulo>
      </div>
      {resumo && <p className="mt-3 rounded-md bg-fundo px-3 py-2 text-sm whitespace-pre-line text-suave">{resumo}</p>}
    </SecaoDoAnuncio>
  );
}

/** Frete: CIF, FOB, Cliente retira ou A combinar (com a explicacao curta), transportadora, valor e prazo. */
export function CartaoFrete({ formulario, transportadoras, editar, erros, aoMudar }) {
  const comTransporte = formulario.fretePorConta === "CIF" || formulario.fretePorConta === "FOB";
  return (
    <SecaoDoAnuncio titulo="Frete" ajuda="O valor do frete soma no total só no CIF. A transportadora vem da preferida do cliente.">
      <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Frete por conta de">
        {Object.entries(TEXTO_DO_FRETE).map(([valor, texto]) => (
          <label
            key={valor}
            className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors has-[:disabled]:cursor-not-allowed ${formulario.fretePorConta === valor ? "border-acento bg-acento/10 font-medium text-acento" : "border-borda text-suave hover:text-texto"}`}
          >
            <input type="radio" name="fretePorConta" value={valor} checked={formulario.fretePorConta === valor} disabled={!editar} onChange={() => aoMudar("fretePorConta", valor)} className="sr-only" />
            {texto}
          </label>
        ))}
      </div>
      {comTransporte && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Rotulo texto="Transportadora" className="sm:col-span-3">
            <select value={formulario.transportadoraId} disabled={!editar} onChange={(e) => aoMudar("transportadoraId", e.target.value)} className={campo}>
              <option value="">—</option>
              {transportadoras.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nomeFantasia || t.nome}
                </option>
              ))}
            </select>
          </Rotulo>
          <Rotulo texto="Valor do frete (R$)" erro={erros.frete}>
            <input inputMode="decimal" value={formulario.frete} disabled={!editar} aria-invalid={Boolean(erros.frete)} onChange={(e) => aoMudar("frete", soDecimal(e.target.value))} className={`${campo} text-right tabular-nums`} />
          </Rotulo>
          <Rotulo texto="Prazo de transporte (dias)" erro={erros.prazoTransporteDias}>
            <input inputMode="numeric" value={formulario.prazoTransporteDias} disabled={!editar} onChange={(e) => aoMudar("prazoTransporteDias", soDigitos(e.target.value, 3))} className={`${campo} text-right tabular-nums`} />
          </Rotulo>
        </div>
      )}
    </SecaoDoAnuncio>
  );
}

/** Totais: desconto geral (5% ou 50), o resumo e o total em verde; custo e lucro so para quem ve custo. */
export function CartaoTotais({ formulario, totais, editar, erros, aoMudar, veCusto }) {
  const desconto = lerDesconto(formulario.desconto);
  return (
    <SecaoDoAnuncio titulo="Totais" ajuda="Desconto geral: 5% para percentual ou 50 para R$ 50,00. Impostos inclusos.">
      <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-2 text-sm">
          <Rotulo texto="Desconto geral" erro={erros.desconto ?? ("erro" in desconto ? desconto.erro : null)} className="max-w-40">
            <input value={formulario.desconto} disabled={!editar} placeholder="0 ou 5%" onChange={(e) => aoMudar("desconto", e.target.value.replace(/[^\d.,%]/g, "").slice(0, 14))} className={`${campo} text-right tabular-nums`} />
          </Rotulo>
          <dl className="grid max-w-72 grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 tabular-nums">
            <dt className="text-suave">Subtotal</dt>
            <dd className="text-right">{moeda.format(totais.subtotal)}</dd>
            {totais.desconto > 0 && (
              <>
                <dt className="text-suave">Desconto</dt>
                <dd className="text-right">− {moeda.format(totais.desconto)}</dd>
              </>
            )}
            {totais.frete > 0 && (
              <>
                <dt className="text-suave">Frete</dt>
                <dd className="text-right">{moeda.format(totais.frete)}</dd>
              </>
            )}
            <dt className="text-suave">Prazo</dt>
            <dd className="text-right">{prazoGeral(formulario.itens.map((i) => ({ prontaEntrega: i.prontaEntrega, prazoDiasUteis: doTexto(i.prazoDiasUteis) })))}</dd>
            {veCusto && totais.lucro !== null && (
              <>
                <dt className="text-suave">Lucro</dt>
                <dd className={`text-right ${totais.lucro < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                  {moeda.format(totais.lucro)} {totais.markup !== null && <span className="text-suave">({Math.round(totais.markup)}%)</span>}
                </dd>
              </>
            )}
          </dl>
        </div>
        <div className="flex min-w-48 flex-col justify-center self-stretch rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4 sm:text-right">
          <p className="text-xs font-medium text-emerald-700">Total da proposta</p>
          <p className="text-2xl font-semibold tabular-nums text-emerald-800">{moeda.format(totais.total)}</p>
        </div>
      </div>
    </SecaoDoAnuncio>
  );
}

const ABAS = [
  ["nf", "Para a nota fiscal"],
  ["cliente", "Observações para o cliente"],
  ["internas", "Internas"],
  ["contatos", "Contatos"],
  ["cotacao", "Cotação do cliente"],
];

/**
 * As abas de baixo (Padrao visual, regra 5): todas montadas e so escondidas, para o Salvar nunca perder o digitado.
 * `contatos` e `cotacao` sao componentes proprios (gravam na hora, fora do Salvar).
 */
export function AbasDaProposta({ formulario, editar, aoMudar, contatos, cotacao, quantos, vendedores = [] }) {
  const [aba, setAba] = useState("nf");
  return (
    <section className="rounded-lg border border-borda bg-superficie">
      <div className="flex overflow-x-auto border-b border-borda" role="tablist">
        {ABAS.map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm whitespace-nowrap ${aba === id ? "border-acento font-medium text-texto" : "border-transparent text-suave hover:text-texto"}`}
          >
            {rotulo}
            {quantos?.[id] > 0 && <span className="ml-1.5 text-xs text-suave tabular-nums">{quantos[id]}</span>}
          </button>
        ))}
      </div>
      <div className="p-4">
        <div hidden={aba !== "nf"} className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <Rotulo texto="Nº do pedido do cliente (OC)">
            <input value={formulario.ocCliente} disabled={!editar} onChange={(e) => aoMudar("ocCliente", e.target.value.slice(0, 60))} className={campo} />
          </Rotulo>
          <Rotulo texto="Texto para a nota fiscal">
            <textarea rows={2} value={formulario.observacoesNf} disabled={!editar} onChange={(e) => aoMudar("observacoesNf", e.target.value)} className={`${campo} field-sizing-content min-h-16`} />
          </Rotulo>
        </div>
        <div hidden={aba !== "cliente"} className="grid gap-3 lg:grid-cols-2">
          <Rotulo texto="Observações para o cliente (saem no PDF)">
            <textarea rows={3} value={formulario.observacoesCliente} disabled={!editar} onChange={(e) => aoMudar("observacoesCliente", e.target.value)} className={`${campo} field-sizing-content min-h-20`} />
          </Rotulo>
          <Rotulo texto="Garantia">
            <textarea rows={3} value={formulario.garantia} disabled={!editar} onChange={(e) => aoMudar("garantia", e.target.value)} className={`${campo} field-sizing-content min-h-20`} />
          </Rotulo>
          {/* Vendedor da faixa do PDF (13/11/2026): os usuarios do Rise na lista, ou outro nome digitado. */}
          <Rotulo texto="Vendedor">
            <input list="vendedores-da-proposta" value={formulario.vendedor} disabled={!editar} onChange={(e) => aoMudar("vendedor", e.target.value.slice(0, 120))} placeholder="Quem criou a proposta" className={`${campo} max-w-sm`} />
            <datalist id="vendedores-da-proposta">
              {vendedores.map((nome) => (
                <option key={nome} value={nome} />
              ))}
            </datalist>
          </Rotulo>
        </div>
        <div hidden={aba !== "internas"}>
          <Rotulo texto="Observações internas (nunca saem no PDF)">
            <textarea rows={3} value={formulario.observacoesInternas} disabled={!editar} onChange={(e) => aoMudar("observacoesInternas", e.target.value)} className={`${campo} field-sizing-content min-h-20 bg-amber-50/40`} />
          </Rotulo>
        </div>
        <div hidden={aba !== "contatos"}>{contatos}</div>
        <div hidden={aba !== "cotacao"}>{cotacao}</div>
      </div>
    </section>
  );
}

/** O historico dos contatos (o "Registrar contato" fica no topo). */
export function HistoricoDeContatos({ contatos }) {
  if (!contatos.length) return <p className="text-sm text-suave">Nenhum contato registrado.</p>;
  return (
    <ol className="space-y-2 text-sm">
      {contatos.map((c) => (
        <li key={c.id} className="rounded-md border border-borda px-3 py-2">
          <p className="text-xs text-suave tabular-nums">
            {new Date(c.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {c.quem}
            {c.proximoContato && ` · próximo: ${dataBR(c.proximoContato)}`}
          </p>
          <p className="mt-0.5 whitespace-pre-line">{c.texto}</p>
        </li>
      ))}
    </ol>
  );
}

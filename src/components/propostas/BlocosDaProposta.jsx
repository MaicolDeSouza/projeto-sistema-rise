"use client";

import { useState } from "react";

import SecaoDoAnuncio from "@/components/anuncios/ml/SecaoDoAnuncio";
import {
  DIAS_ATE_O_CONTATO,
  DIAS_DE_VALIDADE,
  FORMAS_DE_PAGAMENTO,
  GARANTIAS_DA_PROPOSTA,
  TEXTO_DO_FRETE,
  VENDEDORES_DA_PROPOSTA,
  dataBR,
  diasEntre,
  hojeEmSaoPaulo,
  lerDesconto,
  planoDaCondicao,
  prazoGeral,
  somarDias,
  textoDoPagamento,
  valoresDoPagamento,
} from "@/lib/propostas/regras";
import { campo, Rotulo } from "./CartaoCliente";
import { doTexto, moeda, paraTexto, soDecimal, soDigitos } from "./formato";
import CampoComLista from "./CampoComLista";

/**
 * Um campo de "N dias" com lista (validade e proximo contato, 17/11/2026): escolher "15 dias" ou digitar "45" grava a
 * DATA de hoje + N; o campo mostra quantos dias faltam ate a data gravada e, ao lado, a propria data. Enquanto se digita,
 * o texto e o digitado (senao "4" viraria "4 dias" no meio do "45").
 */
function CampoDeDias({ opcoes, data, editar, aoMudarData, rotuloDaSeta, permitirVazio = false, destaque = "", sufixo = (d) => `(${dataBR(d)})` }) {
  const [digitando, setDigitando] = useState(null);
  const hoje = hojeEmSaoPaulo();
  const dias = data ? diasEntre(hoje, data) : null;
  const mostrado = dias === null ? "" : dias < 0 ? `Venceu há ${-dias} dia${dias === -1 ? "" : "s"}` : `${dias} dia${dias === 1 ? "" : "s"}`;
  return (
    <span className="flex items-center gap-2" onBlur={() => setDigitando(null)}>
      <span className="min-w-0 flex-1">
        <CampoComLista
          opcoes={opcoes.map((d) => ({ id: String(d), nome: `${d} dias` }))}
          id={dias !== null && opcoes.includes(dias) ? String(dias) : ""}
          texto={digitando ?? mostrado}
          editar={editar}
          aoMudar={({ id, texto }) => {
            setDigitando(texto);
            const n = Number(String(id || texto).replace(/\D/g, ""));
            if (n > 0 && n <= 3650) aoMudarData(somarDias(hoje, n));
            else if (!texto.trim() && permitirVazio) aoMudarData("");
          }}
          placeholder="Escolha ou digite os dias"
          rotuloDaSeta={rotuloDaSeta}
          className={`${campo} ${destaque}`}
        />
      </span>
      {data && <span className="shrink-0 text-sm text-suave tabular-nums">{sufixo(data)}</span>}
    </span>
  );
}

/**
 * "Condicoes da proposta" (pedido do dono em 17/11/2026, no molde do card Pagamento): validade da cotacao, garantia,
 * proximo contato e vendedor, cada um com as opcoes e o campo aberto para digitar. Substituiu o card "Validade e contato"
 * e tirou a garantia e o vendedor da aba "Observacoes para o cliente".
 */
export function CartaoCondicoesDaProposta({ formulario, editar, editarValidade, vencida, venceuEm, contatoAgora, erros, aoMudar }) {
  return (
    <SecaoDoAnuncio titulo="Condições da proposta" ajuda="Validade, garantia e vendedor saem no PDF; o próximo contato é só interno (o “!” da lista).">
      <div className="grid gap-3 sm:grid-cols-2">
        <Rotulo texto="Validade da cotação" erro={erros.validadeAte}>
          <CampoDeDias opcoes={DIAS_DE_VALIDADE} data={formulario.validadeAte} editar={editarValidade} aoMudarData={(d) => aoMudar("validadeAte", d)} rotuloDaSeta="Opções de validade" sufixo={(d) => `(até ${dataBR(d)})`} />
        </Rotulo>
        <Rotulo texto="Garantia">
          <CampoComLista
            opcoes={GARANTIAS_DA_PROPOSTA.map((g) => ({ id: g, nome: g }))}
            id={GARANTIAS_DA_PROPOSTA.includes(formulario.garantia) ? formulario.garantia : ""}
            texto={formulario.garantia}
            editar={editar}
            aoMudar={({ texto }) => aoMudar("garantia", texto)}
            placeholder="Escolha ou digite a garantia"
            rotuloDaSeta="Opções de garantia"
            className={campo}
          />
        </Rotulo>
        <Rotulo texto="Próximo contato" erro={erros.proximoContato}>
          <CampoDeDias
            opcoes={DIAS_ATE_O_CONTATO}
            data={formulario.proximoContato}
            editar={editar}
            permitirVazio
            aoMudarData={(d) => aoMudar("proximoContato", d)}
            rotuloDaSeta="Opções de próximo contato"
            destaque={contatoAgora ? "border-amber-400 bg-amber-50" : ""}
          />
        </Rotulo>
        <Rotulo texto="Vendedor">
          <CampoComLista
            opcoes={VENDEDORES_DA_PROPOSTA.map((v) => ({ id: v, nome: v }))}
            id={VENDEDORES_DA_PROPOSTA.includes(formulario.vendedor) ? formulario.vendedor : ""}
            texto={formulario.vendedor}
            editar={editar}
            aoMudar={({ texto }) => aoMudar("vendedor", texto.slice(0, 120))}
            placeholder="Escolha ou digite o vendedor"
            rotuloDaSeta="Opções de vendedor"
            className={campo}
          />
        </Rotulo>
      </div>
      {vencida && <p className="mt-3 text-xs text-suave">Venceu em {dataBR(venceuEm)}. Escolha uma nova validade e salve para reabrir.</p>}
    </SecaoDoAnuncio>
  );
}

/** Os campos do formulario que a condicao preenche (parcelas e entrada, em texto); {} quando ela nao diz (A combinar). */
export function camposDaCondicao(condicoes, id) {
  const plano = planoDaCondicao(condicoes.find((c) => c.id === id)?.nome);
  return plano ? { parcelas: String(plano.parcelas), entradaPercentual: plano.entradaPercentual ? paraTexto(plano.entradaPercentual) : "" } : {};
}

/**
 * Pagamento: uma condicao da lista (vem a preferida do cliente) e os ajustes; o resumo e o que sai no PDF. Escolher a
 * condicao preenche as parcelas e a entrada (17/11/2026), e ao lado de cada uma vai o valor em reais, com a entrada ja
 * descontada das parcelas.
 */
export function CartaoPagamento({ formulario, condicoes, total = 0, editar, erros, aoMudar }) {
  const condicaoNome = condicoes.find((c) => c.id === formulario.condicaoPagamentoId)?.nome ?? null;
  const parcelas = doTexto(formulario.parcelas);
  const entradaPercentual = doTexto(formulario.entradaPercentual);
  const resumo = textoDoPagamento({ ...formulario, condicaoNome, parcelas, entradaPercentual, total });
  const valores = total > 0 ? valoresDoPagamento({ total, parcelas, entradaPercentual }) : null;
  const escolherCondicao = (id) => {
    aoMudar("condicaoPagamentoId", id);
    for (const [campoDoFormulario, valor] of Object.entries(camposDaCondicao(condicoes, id))) aoMudar(campoDoFormulario, valor);
  };
  return (
    <SecaoDoAnuncio titulo="Pagamento" ajuda="A condição vem da preferida do cliente. O texto livre vai no PDF depois do resumo.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Rotulo texto="Condição">
          <select value={formulario.condicaoPagamentoId} disabled={!editar} onChange={(e) => escolherCondicao(e.target.value)} className={campo}>
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
          <span className="flex items-center gap-2">
            <input inputMode="numeric" value={formulario.parcelas} disabled={!editar} aria-invalid={Boolean(erros.parcelas)} onChange={(e) => aoMudar("parcelas", soDigitos(e.target.value, 2))} className={`${campo} tabular-nums`} />
            {valores && (
              <span className="shrink-0 text-sm text-suave tabular-nums" title="Valor de cada parcela, com a entrada já descontada">
                ({moeda.format(valores.parcela)}
                {valores.parcelas > 1 ? " cada" : ""})
              </span>
            )}
          </span>
        </Rotulo>
        <Rotulo texto="Entrada (%)" erro={erros.entradaPercentual}>
          <span className="flex items-center gap-2">
            <input inputMode="decimal" value={formulario.entradaPercentual} disabled={!editar} aria-invalid={Boolean(erros.entradaPercentual)} onChange={(e) => aoMudar("entradaPercentual", soDecimal(e.target.value))} className={`${campo} tabular-nums`} />
            {valores && valores.entrada > 0 && (
              <span className="shrink-0 text-sm text-suave tabular-nums" title="Valor da entrada">
                ({moeda.format(valores.entrada)})
              </span>
            )}
          </span>
        </Rotulo>
        <Rotulo texto="Texto livre" className="sm:col-span-2">
          <textarea rows={2} value={formulario.pagamentoTexto} disabled={!editar} onChange={(e) => aoMudar("pagamentoTexto", e.target.value)} className={`${campo} field-sizing-content min-h-16`} />
        </Rotulo>
      </div>
      {resumo && <p className="mt-3 rounded-md bg-fundo px-3 py-2 text-sm whitespace-pre-line text-suave">{resumo}</p>}
    </SecaoDoAnuncio>
  );
}

/** O interruptor do Rise (o mesmo desenho do "Ativo" do usuario e do atacado do ML). */
function Interruptor({ ligado, aoMudar, rotulo, desabilitado = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={desabilitado}
      onClick={() => aoMudar(!ligado)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-[background-color] duration-150 focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${ligado ? "bg-emerald-600" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ${ligado ? "translate-x-5" : ""}`} />
    </button>
  );
}

/**
 * Frete: CIF, FOB, Cliente retira ou A combinar (com a explicacao curta), transportadora, valor e prazo. Pedidos do dono
 * em 17/11/2026: a transportadora e uma das cadastradas OU digitada; no CIF, o interruptor dilui o frete nos produtos; o
 * prazo se chama "Prazo de entrega".
 */
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
            <CampoComLista
              opcoes={transportadoras.map((t) => ({ id: t.id, nome: t.nomeFantasia || t.nome }))}
              id={formulario.transportadoraId}
              texto={formulario.transportadoraNome || ((t) => t?.nomeFantasia || t?.nome || "")(transportadoras.find((t) => t.id === formulario.transportadoraId))}
              editar={editar}
              aoMudar={({ id, texto }) => {
                aoMudar("transportadoraNome", texto);
                aoMudar("transportadoraId", id);
              }}
              placeholder="Escolha ou digite a transportadora"
              rotuloDaSeta="Mostrar as transportadoras cadastradas"
              tituloDoLivre="Nome digitado: fica só nesta proposta, sem entrar no cadastro de transportadoras."
              className={campo}
            />
          </Rotulo>
          <div>
            <Rotulo texto="Valor do frete (R$)" erro={erros.frete}>
              <input inputMode="decimal" value={formulario.frete} disabled={!editar} aria-invalid={Boolean(erros.frete)} onChange={(e) => aoMudar("frete", soDecimal(e.target.value))} className={`${campo} tabular-nums`} />
            </Rotulo>
            {formulario.fretePorConta === "CIF" && (
              <div className="mt-2 flex items-center gap-2 text-sm" title="Ligado: no PDF e no pedido do Bling o frete entra no preço de cada produto, proporcional ao valor do item. O total não muda.">
                <Interruptor ligado={Boolean(formulario.freteDiluido)} desabilitado={!editar} rotulo="Diluir o frete nos produtos" aoMudar={(ligado) => aoMudar("freteDiluido", ligado)} />
                <span className={formulario.freteDiluido ? "text-texto" : "text-suave"}>Diluir nos produtos</span>
              </div>
            )}
          </div>
          <Rotulo texto="Prazo de entrega (dias)" erro={erros.prazoTransporteDias}>
            <input inputMode="numeric" value={formulario.prazoTransporteDias} disabled={!editar} onChange={(e) => aoMudar("prazoTransporteDias", soDigitos(e.target.value, 3))} className={`${campo} tabular-nums`} />
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
export function AbasDaProposta({ formulario, editar, aoMudar, contatos, cotacao, quantos }) {
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
        {/* A garantia e o vendedor foram para o card "Condicoes da proposta" (17/11/2026). */}
        <div hidden={aba !== "cliente"}>
          <Rotulo texto="Observações para o cliente (saem no PDF)">
            <textarea rows={3} value={formulario.observacoesCliente} disabled={!editar} onChange={(e) => aoMudar("observacoesCliente", e.target.value)} className={`${campo} field-sizing-content min-h-20`} />
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

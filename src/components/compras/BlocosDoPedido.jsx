"use client";

import { ExternalLink } from "lucide-react";

import SecaoDoAnuncio from "@/components/anuncios/ml/SecaoDoAnuncio";
import { lerDesconto } from "@/lib/compras/regras";
import { moeda, soDecimal, soDigitos } from "./formato";

const entrada =
  "w-full rounded-md border border-borda bg-superficie px-2.5 py-2 text-sm tabular-nums focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/20 disabled:bg-fundo disabled:text-suave aria-[invalid=true]:border-rose-500";

function Campo({ rotulo, erro, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-suave">{rotulo}</span>
      {children}
      {erro && <span className="mt-1 block text-xs text-rose-600">{erro}</span>}
    </label>
  );
}

/** Um valor calculado das linhas, no mesmo desenho dos campos (so leitura), para a linha dos totais ler como uma so. */
function Calculado({ rotulo, valor }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-suave">{rotulo}</span>
      <p className="rounded-md border border-borda bg-fundo px-2.5 py-2 text-right text-sm tabular-nums">{valor}</p>
    </div>
  );
}

/**
 * Totais da compra (desenho do dono em 26/10/2026): a esquerda os impostos (IPI calculado e ICMS ST), depois frete,
 * desconto e o preco dos produtos, e o total num verde suave. Numero de itens e soma das quantidades sairam.
 */
export function BlocoTotais({ formulario, totais, editar, erros, aoMudar }) {
  const desconto = lerDesconto(formulario.desconto);
  return (
    <SecaoDoAnuncio titulo="Totais da compra" ajuda="Desconto: digite 5% para percentual ou 50 para R$ 50,00. O percentual incide sobre os produtos.">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]">
        <div className="grid grid-cols-2 gap-3 rounded-md border border-borda p-3">
          <p className="col-span-2 -mt-0.5 text-xs font-semibold text-texto">Impostos</p>
          <Calculado rotulo="IPI" valor={moeda.format(totais.ipi)} />
          {/* Imposto do AliExpress: vem da importacao, so leitura; sem ele a linha some (regra 4 do padrao visual). */}
          {totais.imposto > 0 && <Calculado rotulo="Imposto (AliExpress)" valor={moeda.format(totais.imposto)} />}
          <Campo rotulo="ICMS ST (R$)" erro={erros?.icmsSt}>
            <input inputMode="decimal" value={formulario.icmsSt} disabled={!editar} aria-invalid={Boolean(erros?.icmsSt)} onChange={(evento) => aoMudar("icmsSt", soDecimal(evento.target.value))} className={`${entrada} text-right`} />
          </Campo>
        </div>
        <div className="grid grid-cols-3 gap-3 pt-3 lg:pt-[39px]">
          <Campo rotulo="Frete (R$)" erro={erros?.frete}>
            <input inputMode="decimal" value={formulario.frete} disabled={!editar} aria-invalid={Boolean(erros?.frete)} onChange={(evento) => aoMudar("frete", soDecimal(evento.target.value))} className={`${entrada} text-right`} />
          </Campo>
          <Campo rotulo="Desconto" erro={erros?.desconto ?? ("erro" in desconto ? desconto.erro : null)}>
            <input
              value={formulario.desconto}
              disabled={!editar}
              placeholder="0 ou 5%"
              aria-invalid={Boolean(erros?.desconto) || "erro" in desconto}
              onChange={(evento) => aoMudar("desconto", evento.target.value.replace(/[^\d.,%]/g, "").slice(0, 14))}
              className={`${entrada} text-right`}
            />
            {totais.desconto > 0 && <span className="mt-1 block text-right text-xs text-suave">− {moeda.format(totais.desconto)}</span>}
          </Campo>
          <Calculado rotulo="Preço dos produtos" valor={moeda.format(totais.produtos)} />
        </div>
        {/* Verde suave (pedido do dono): o total se destaca sem pesar como a caixa escura de antes. */}
        <div className="flex min-w-48 flex-col justify-center self-stretch rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4 lg:text-right">
          <p className="text-xs font-medium text-emerald-700">Total do pedido</p>
          <p className="text-2xl font-semibold tabular-nums text-emerald-800">{moeda.format(totais.total)}</p>
        </div>
      </div>
    </SecaoDoAnuncio>
  );
}

const FORMAS = [
  { id: "PIX", texto: "Pix" },
  { id: "BOLETO", texto: "Boleto" },
  { id: "CARTAO", texto: "Cartão" },
];

/** Opcoes lado a lado com radio de verdade escondido (padrao `EscolhaDoTipo`): o teclado continua funcionando. */
function Opcoes({ nome, opcoes, valor, disabled, aoMudar }) {
  return (
    <div className="inline-flex rounded-md border border-borda p-0.5" role="radiogroup">
      {opcoes.map((opcao) => {
        const marcada = valor === opcao.id;
        return (
          <label
            key={opcao.id}
            className={`cursor-pointer whitespace-nowrap rounded px-3 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-acento/40 ${
              marcada ? "bg-acento text-white" : "text-suave hover:text-texto"
            } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <input type="radio" name={nome} value={opcao.id} checked={marcada} disabled={disabled} onChange={() => aoMudar(opcao.id)} className="sr-only" />
            {opcao.texto}
          </label>
        );
      })}
    </div>
  );
}

export function BlocoPagamento({ formulario, editar, erros, aoMudar, totais = null, editarEntrada = false }) {
  const pix = formulario.formaPagamento === "PIX";
  return (
    <SecaoDoAnuncio titulo="Pagamento" ajuda="Entrada: o valor que já foi pago ao fazer o pedido. Pode ser lançada depois de enviado.">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <span className="mb-1 block text-xs font-medium text-suave">Forma</span>
          <Opcoes nome="formaPagamento" opcoes={FORMAS} valor={formulario.formaPagamento} disabled={!editar} aoMudar={(valor) => aoMudar("formaPagamento", valor)} />
        </div>
        <Campo rotulo="Parcelas" erro={erros?.parcelas} className="w-24">
          <input
            inputMode="numeric"
            value={pix ? "1" : formulario.parcelas}
            disabled={!editar || pix}
            title={pix ? "Pix é à vista" : undefined}
            aria-invalid={Boolean(erros?.parcelas)}
            onChange={(evento) => aoMudar("parcelas", soDigitos(evento.target.value, 2))}
            className={`${entrada} text-right`}
          />
        </Campo>
        {totais && (
          <Campo rotulo="Entrada (R$)" erro={erros?.entrada} className="w-36">
            <input
              inputMode="decimal"
              value={formulario.entrada}
              disabled={!editarEntrada}
              placeholder="0"
              aria-invalid={Boolean(erros?.entrada)}
              onChange={(evento) => aoMudar("entrada", soDecimal(evento.target.value))}
              className={`${entrada} text-right`}
            />
            {totais.entrada > 0 && (
              <span className="mt-1 block text-right text-xs text-suave">
                Falta pagar <span className="font-medium tabular-nums text-texto">{moeda.format(totais.faltaPagar)}</span>
              </span>
            )}
          </Campo>
        )}
      </div>
    </SecaoDoAnuncio>
  );
}

/** Um valor so de leitura no desenho dos campos; com `link`, o valor abre o endereco em outra aba. */
function Lido({ rotulo, valor, link = null, className = "" }) {
  return (
    <div className={className}>
      <span className="mb-1 block text-xs font-medium text-suave">{rotulo}</span>
      <p className="min-h-[38px] truncate rounded-md border border-borda bg-fundo px-2.5 py-2 text-sm" title={valor ?? undefined}>
        {valor && link ? (
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono font-medium text-acento hover:underline">
            {valor} <ExternalLink size={13} />
          </a>
        ) : (
          (valor ?? "—")
        )}
      </p>
    </div>
  );
}

const dataCurta = (valor) =>
  valor ? new Date(valor).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : null;

/**
 * O frete do pedido do AliExpress (pedido do dono em 29/10/2026): transportadora (so o nome, sem cadastro), codigo de
 * rastreio que abre o status no AliExpress, status do frete e previsao de entrega. Tudo vem do "Enviar ao Rise" e e so
 * leitura. Mais de um pacote: um grupo por pacote, com os itens dele.
 */
function FreteDoAliExpress({ aliexpress }) {
  const pacotes = aliexpress.pacotes ?? [];
  return (
    <SecaoDoAnuncio titulo="Frete" ajuda="Vem do AliExpress a cada Enviar ao Rise. O código abre o rastreio no site.">
      {pacotes.length === 0 ? (
        <p className="text-sm text-suave">Sem rastreio ainda.</p>
      ) : (
        <div className="space-y-5">
          {pacotes.map((pacote, indice) => (
            <div key={pacote.codigo}>
              {pacotes.length > 1 && (
                <p className="mb-2 text-xs font-semibold text-texto">
                  Pacote {indice + 1}
                  {pacote.itens?.length > 0 && <span className="ml-1.5 font-normal text-suave">{pacote.itens.join(", ")}</span>}
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Lido rotulo="Transportadora" valor={pacote.transportadora} />
                <Lido rotulo="Código de rastreio" valor={pacote.codigo} link={aliexpress.linkDoRastreio} />
                <Lido rotulo="Status do frete" valor={pacote.status ? [dataCurta(pacote.statusEm), pacote.status].filter(Boolean).join(" · ") : null} />
                <Lido rotulo="Previsão de entrega" valor={pacote.previsao} />
              </div>
            </div>
          ))}
        </div>
      )}
    </SecaoDoAnuncio>
  );
}

export function BlocoFrete({ formulario, transportadoras, editar, aoMudar, aliexpress = null }) {
  if (aliexpress) return <FreteDoAliExpress aliexpress={aliexpress} />;
  const escolhida = transportadoras.find((transportadora) => transportadora.id === formulario.transportadoraId);
  const outra = !formulario.transportadoraId;
  const linkDoRastreio =
    escolhida?.urlRastreamento && formulario.rastreio ? escolhida.urlRastreamento.replace("{codigo}", encodeURIComponent(formulario.rastreio)) : null;
  return (
    <SecaoDoAnuncio titulo="Frete">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Transportadora">
          <select
            value={formulario.transportadoraId}
            disabled={!editar}
            onChange={(evento) => aoMudar("transportadoraId", evento.target.value)}
            className={entrada}
          >
            <option value="">Outra (digitar)</option>
            {transportadoras.map((transportadora) => (
              <option key={transportadora.id} value={transportadora.id}>
                {transportadora.nomeFantasia || transportadora.nome}
              </option>
            ))}
          </select>
          {outra && (
            <input
              value={formulario.transportadoraNome}
              disabled={!editar}
              placeholder="Nome da transportadora"
              onChange={(evento) => aoMudar("transportadoraNome", evento.target.value.slice(0, 120))}
              className={`${entrada} mt-2`}
            />
          )}
        </Campo>
        <div>
          <span className="mb-1 block text-xs font-medium text-suave">Frete por conta</span>
          <Opcoes
            nome="fretePorConta"
            opcoes={[
              { id: "CIF", texto: "Fornecedor (CIF)" },
              { id: "FOB", texto: "Nossa (FOB)" },
            ]}
            valor={formulario.fretePorConta}
            disabled={!editar}
            aoMudar={(valor) => aoMudar("fretePorConta", valor)}
          />
        </div>
        <Campo rotulo="Código de rastreio" className="sm:col-span-2">
          <div className="flex items-center gap-2">
            <input
              value={formulario.rastreio}
              disabled={!editar}
              onChange={(evento) => aoMudar("rastreio", evento.target.value.slice(0, 80))}
              className={`${entrada} font-mono`}
            />
            {linkDoRastreio && /^https?:\/\//i.test(linkDoRastreio) && (
              <a href={linkDoRastreio} target="_blank" rel="noreferrer" title="Rastrear" className="inline-flex shrink-0 rounded-md border border-borda p-2 text-suave hover:text-acento">
                <ExternalLink size={16} />
              </a>
            )}
          </div>
        </Campo>
      </div>
    </SecaoDoAnuncio>
  );
}

export function BlocoProposta({ formulario, editar, aoMudar, children = null }) {
  return (
    <SecaoDoAnuncio titulo="Proposta do fornecedor" ajuda="O número e o arquivo do orçamento que o fornecedor mandou.">
      <Campo rotulo="Nº da proposta">
        <input value={formulario.propostaNumero} disabled={!editar} onChange={(evento) => aoMudar("propostaNumero", evento.target.value.slice(0, 60))} className={entrada} />
      </Campo>
      {children}
    </SecaoDoAnuncio>
  );
}

export function BlocoObservacoes({ formulario, editar, aoMudar }) {
  return (
    <SecaoDoAnuncio titulo="Observações" ajuda="Vão no PDF para o fornecedor.">
      <textarea
        value={formulario.observacoes}
        disabled={!editar}
        rows={4}
        onChange={(evento) => aoMudar("observacoes", evento.target.value.slice(0, 4000))}
        aria-label="Observações"
        className={`${entrada} resize-y`}
      />
    </SecaoDoAnuncio>
  );
}

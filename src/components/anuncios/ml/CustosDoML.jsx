"use client";

import { useState, useTransition } from "react";
import { Loader, RefreshCw } from "lucide-react";

import { lerCustosML } from "@/app/canais-de-venda/mercado-livre/acoes";
import { custosDoAnuncio, custosValem, freteQueConta } from "@/lib/canaisDeVenda/ml/custos";
import { IMPOSTO_PADRAO, calcularMargem, corDaMargem, lucroLiquido } from "@/lib/margem";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const CATEGORIA_ML = /^MLB\d+$/;

/// Mesma regra de cor da margem do Produto (`corDaMargem`), mas sobre o lucro JA com as taxas do
/// ML: vermelho com prejuizo, amarelo abaixo de 60%, verde a partir de 60%.
function corDoLucro(lucro, margem) {
  if (lucro === null) return "text-suave";
  if (lucro < 0) return "text-red-600";
  return margem >= 60 ? "text-emerald-600" : "text-yellow-600";
}

function Linha({ rotulo, valor, detalhe }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-suave">
        {rotulo}
        {detalhe && <span className="ml-1 text-[11px]">{detalhe}</span>}
      </span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}

/**
 * Os custos do Mercado Livre sobre o preco do rascunho: comissao, tarifa fixa, frete do vendedor e
 * imposto, e o lucro e a margem que sobram. Os custos sao LIDOS do ML a pedido ("Ler custos") e
 * ficam no contexto do editor; quando preco, categoria, tipo ou logistica mudam, deixam de valer e a
 * aba pede para atualizar. Sem custos lidos, mostra a margem simples da fase 1.
 *
 * `custo` e `{ valor, faltam }` da aba (fornecedor padrao, ou a soma dos itens do kit).
 */
export default function CustosDoML({ rascunho, contexto, setContexto, custo, mensagemSemCusto }) {
  const [erro, setErro] = useState(null);
  const [lendo, iniciarLeitura] = useTransition();
  const custosML = contexto.custosML ?? null;
  const valem = custosValem(custosML, rascunho);
  const preco = Number(rascunho.preco);
  const motivoDesligado = !CATEGORIA_ML.test(rascunho.categoriaId ?? "")
    ? "Escolha a categoria na aba Geral."
    : !(preco > 0)
      ? "Informe o preço de venda."
      : null;

  function ler() {
    setErro(null);
    iniciarLeitura(async () => {
      let resposta;
      try {
        resposta = await lerCustosML(rascunho);
      } catch {
        resposta = { ok: false, erro: "Não foi possível falar com o servidor. Tente de novo." };
      }
      if (!resposta.ok) {
        setErro(resposta.erro);
        return;
      }
      setContexto((atual) => ({ ...atual, custosML: resposta.custosML }));
    });
  }

  const conta =
    valem && preco > 0
      ? custosDoAnuncio({ preco, custo: custo.valor, percentual: custosML.percentual, tarifaFixa: custosML.tarifaFixa, frete: freteQueConta(custosML, rascunho) })
      : null;
  const margemSimples = calcularMargem(preco, custo.valor);

  return (
    <div className="rounded border border-borda bg-fundo p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-suave">Custos do Mercado Livre</p>
        <button
          type="button"
          onClick={ler}
          disabled={lendo || Boolean(motivoDesligado)}
          title={motivoDesligado ?? "Lê comissão, tarifa fixa e frete no Mercado Livre"}
          className="inline-flex items-center gap-1.5 rounded border border-borda bg-superficie px-2.5 py-1.5 text-xs hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-50"
        >
          {lendo ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {custosML ? "Atualizar custos" : "Ler custos do ML"}
        </button>
      </div>
      {motivoDesligado && !custosML && <p className="mt-1 text-[11px] text-suave">{motivoDesligado}</p>}
      {erro && <p className="mt-1 text-[11px] text-red-700">{erro}</p>}
      {custosML && !valem && (
        <p className="mt-2 text-[11px] text-amber-700">Os custos foram lidos para outro preço, categoria, tipo ou logística. Clique em Atualizar custos.</p>
      )}

      {conta ? (
        <div className="mt-2 divide-y divide-borda">
          <Linha rotulo="Comissão" detalhe={`(${PERCENTUAL.format(custosML.percentual * 100)}%)`} valor={MOEDA.format(conta.comissao)} />
          <Linha rotulo="Tarifa fixa" valor={MOEDA.format(conta.tarifaFixa)} />
          <Linha
            rotulo="Frete do vendedor"
            detalhe={
              custosML.frete === null
                ? "(informe as medidas na aba Envio)"
                : `${rascunho.envio?.freteGratis ? "" : `(estimativa de ${MOEDA.format(custosML.frete)}; só conta com frete grátis) `}peso cobrado ${custosML.pesoCobrado ?? "?"} g`
            }
            valor={MOEDA.format(conta.frete)}
          />
          <Linha rotulo="Imposto" detalhe={`(${Math.round(IMPOSTO_PADRAO * 100)}%)`} valor={MOEDA.format(conta.imposto)} />
          {conta.lucro === null ? (
            <p className="py-1 text-sm text-amber-700">{mensagemSemCusto}</p>
          ) : (
            <p className={`pt-2 text-lg font-semibold ${corDoLucro(conta.lucro, conta.margem)}`}>
              {PERCENTUAL.format(conta.margem)}%<span className="ml-2 text-sm font-medium">lucro de {MOEDA.format(conta.lucro)}</span>
            </p>
          )}
        </div>
      ) : (
        !custosML && (
          <div className="mt-2">
            {margemSimples !== null ? (
              <p className={`text-lg font-semibold ${corDaMargem(preco, custo.valor)}`}>
                {PERCENTUAL.format(margemSimples)}%<span className="ml-2 text-sm font-medium">lucro de {MOEDA.format(lucroLiquido(preco, custo.valor))}</span>
              </p>
            ) : (
              !(custo.valor > 0) && <p className="text-sm text-amber-700">{mensagemSemCusto}</p>
            )}
            <p className="mt-1 text-[11px] text-suave">
              Só o imposto de {Math.round(IMPOSTO_PADRAO * 100)}%, sem as taxas do ML: leia os custos para ver o lucro de verdade.
            </p>
          </div>
        )
      )}
    </div>
  );
}

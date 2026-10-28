"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Loader } from "lucide-react";

import { precoPorMargemML } from "@/app/canais-de-venda/mercado-livre/acoes";
import { custosDoAnuncio, precoPorMargem } from "@/lib/canaisDeVenda/ml/custos";
import { custoDoAnuncio } from "./AbaPrecoEstoque";
import { taxasUsaveis } from "./CalculadoraDeMargem";
import { filtrarDecimal, lerDecimal } from "./numeros";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const CATEGORIA_ML = /^MLB\d+$/;
// Sem as taxas lidas a conta vai ao servidor (ele le o ML): espera o dono parar de digitar ou de mexer nos itens.
const ESPERA_DO_SERVIDOR_MS = 600;

/**
 * "Custo total × % = Preço de venda no ML" ao montar o kit (pedido do dono em 27/10/2026: "preciso saber o custo estimado e
 * preço de venda ao montar o kit... calcular em tempo real conforme vou adicionando mais itens, e contemplar mais de um tipo
 * de item"). O custo do kit e a soma de quantidade × custo de cada item (`custoDoAnuncio`, a mesma conta da aba Preço e
 * custos); o % e o markup sobre o CUSTO TOTAL (fornecedor + comissão + tarifa + frete + imposto), a mesma regra da
 * calculadora do preço. Digitar o % grava o preço do anúncio, e mexer nos itens com o % digitado refaz o preço.
 * Abrir o kit nao muda nada: sem o % digitado, a linha so mostra o custo e o markup do preço de hoje.
 */
export default function ContaDoKit({ rascunho, contexto, alterar, setContexto }) {
  const itens = Array.isArray(rascunho.composicao?.itens) ? rascunho.composicao.itens : [];
  const custo = custoDoAnuncio(rascunho, itens, contexto.produtos ?? {});
  const taxas = taxasUsaveis(contexto.custosML, rascunho);
  const preco = Number(rascunho.preco);
  const conta = taxas && preco > 0 && custo.valor > 0 ? custosDoAnuncio({ preco, custo: custo.valor, ...taxas }) : null;
  const custoTotal = conta ? custo.valor + conta.comissao + conta.tarifaFixa + conta.frete + conta.imposto : null;

  // O % que o dono digitou (texto). `null` = nao digitou: o campo mostra o markup do preço atual e nada e recalculado.
  const [digitado, setDigitado] = useState(null);
  const [erro, setErro] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const pedidoAtual = useRef(0);
  const espera = useRef(null);
  useEffect(() => () => clearTimeout(espera.current), []);

  const alvo = digitado === null ? null : lerDecimal(digitado);
  const semCategoria = !CATEGORIA_ML.test(rascunho.categoriaId ?? "");

  const podeCalcular = alvo !== null && alvo >= 0 && custo.valor > 0 && !semCategoria;
  // Com as taxas lidas, o preço pelo % sai aqui mesmo, na hora (null = lucro inatingível com estas taxas).
  const precoPeloAlvo = podeCalcular && taxas ? precoPorMargem({ custo: custo.valor, ...taxas, margem: { tipo: "percentual", valor: alvo } }) : undefined;
  const erroDaConta = precoPeloAlvo === null ? "Lucro inatingível com estas taxas." : null;

  // Leva o preço pelo % ao anúncio. Sem as taxas lidas, o servidor le o ML e devolve o preço (e as taxas).
  const recalcular = useEffectEvent(() => {
    clearTimeout(espera.current);
    if (!podeCalcular) return;
    if (taxas) {
      if (precoPeloAlvo > 0 && precoPeloAlvo !== preco) alterar({ preco: precoPeloAlvo });
      return;
    }
    const numero = ++pedidoAtual.current;
    espera.current = setTimeout(async () => {
      setCalculando(true);
      let resposta;
      try {
        resposta = await precoPorMargemML(rascunho, { custo: custo.valor, margem: { tipo: "percentual", valor: alvo } });
      } catch {
        resposta = { ok: false, erro: "Não foi possível falar com o servidor. Tente de novo." };
      }
      if (numero !== pedidoAtual.current) return;
      setCalculando(false);
      if (!resposta.ok) {
        setErro(resposta.erro);
        return;
      }
      setErro(null);
      alterar({ preco: resposta.preco });
      setContexto((atual) => ({ ...atual, custosML: resposta.custosML }));
    }, ESPERA_DO_SERVIDOR_MS);
  });

  // Mudou o %, o custo dos itens (incluir, tirar, quantidade) ou as taxas relidas pela caixa de custos: refaz o preço.
  const chaveDasTaxas = taxas ? `${taxas.percentual}|${taxas.tarifaFixa}|${taxas.frete}` : "";
  useEffect(() => {
    recalcular();
  }, [alvo, custo.valor, chaveDasTaxas]);

  let detalhe;
  if (!(custo.valor > 0)) detalhe = custo.faltam.length > 0 ? `Sem custo de ${custo.faltam.join(", ")}.` : "Os itens ainda não têm custo.";
  else if (semCategoria) detalhe = "Escolha a categoria do ML para somar as taxas.";
  else if (conta) detalhe = `Itens ${MOEDA.format(custo.valor)} · ML ${MOEDA.format(conta.comissao + conta.tarifaFixa + conta.frete)} · Imposto ${MOEDA.format(conta.imposto)}`;
  else detalhe = "Informe o % para o Rise ler as taxas do ML.";

  const valorDoCampo = digitado ?? (conta?.markup != null ? String(conta.markup).replace(".", ",") : "");

  return (
    <div className="min-w-0 flex-1 rounded border border-borda bg-fundo/60 px-3 py-2" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-suave">Custo total</span>
        <span className="font-semibold tabular-nums">{custoTotal === null ? (custo.valor > 0 ? MOEDA.format(custo.valor) : "—") : MOEDA.format(custoTotal)}</span>
        <span className="text-suave">×</span>
        <label className="relative">
          <span className="sr-only">% de lucro sobre o custo total</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            value={valorDoCampo}
            disabled={!(custo.valor > 0) || semCategoria}
            onChange={(evento) => {
              setErro(null);
              setDigitado(filtrarDecimal(evento.target.value, 1));
            }}
            placeholder="0"
            className="w-20 rounded border border-borda bg-superficie py-1 pr-6 pl-2 text-right text-sm tabular-nums focus:border-acento focus:outline-none disabled:bg-fundo disabled:text-suave"
          />
          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-suave">%</span>
        </label>
        <span className="text-suave">=</span>
        <span className="text-suave">Preço no ML</span>
        <span className="text-base font-semibold text-acento tabular-nums">{preco > 0 ? MOEDA.format(preco) : "—"}</span>
        {calculando && <Loader size={13} className="animate-spin text-suave" />}
      </div>
      <p className={`mt-0.5 text-[11px] tabular-nums ${erroDaConta || erro ? "text-red-700" : "text-suave"}`}>{erroDaConta ?? erro ?? detalhe}</p>
    </div>
  );
}

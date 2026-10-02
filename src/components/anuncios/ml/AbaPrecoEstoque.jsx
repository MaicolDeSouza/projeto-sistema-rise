"use client";

import { useState } from "react";

import Campo, { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import { custoDaComposicao } from "@/lib/canaisDeVenda/composicao";
import { IMPOSTO_PADRAO, calcularMargem, corDaMargem, lucroLiquido } from "@/lib/margem";
import MensagensDoCampo, { problemasDoCampo } from "./MensagensDoCampo";
import { filtrarDecimal, lerDecimal, mostrarDigitado, recusarSimbolosDeInteiro } from "./numeros";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const ORIGEM_DO_KIT = "soma de quantidade x custo dos itens";

// O custo do anuncio e o do produto (a origem diz de onde veio) ou, no kit, a soma dos itens. Item
// sem custo derruba a soma toda, e `faltam` diz quais (pelo SKU): total parcial pareceria margem boa.
function custoDoAnuncio(rascunho, itens, produtos) {
  if (!rascunho.composicao) {
    const custo = produtos[rascunho.produtoId]?.custo;
    return { valor: custo?.valor ?? null, origem: custo?.origem ?? null, faltam: [] };
  }
  const custoPorId = Object.fromEntries(itens.map((item) => [item.produtoId, produtos[item.produtoId]?.custo?.valor]));
  const { valor, faltando } = custoDaComposicao(itens, custoPorId);
  return {
    valor,
    origem: ORIGEM_DO_KIT,
    faltam: [...new Set(faltando.map((id) => produtos[id]?.sku ?? "item"))],
  };
}

// Referencia para o dono decidir o preco do kit. Falta preco (ou quantidade) em um item: sem soma,
// pelo mesmo motivo do custo.
function somaDosPrecosAvulsos(itens, produtos) {
  if (itens.length === 0) return null;
  let total = 0;
  for (const item of itens) {
    const preco = Number(produtos[item.produtoId]?.precoVenda);
    const quantidade = Number(item.quantidade);
    if (!(preco > 0) || !Number.isInteger(quantidade) || quantidade < 1) return null;
    total += preco * quantidade;
  }
  return total;
}

function mensagemSemCusto(faltam) {
  return faltam.length > 0
    ? `Sem custo de ${faltam.join(", ")}: a margem fica indisponivel.`
    : "Sem custo informado: a margem fica indisponivel.";
}

/**
 * Aba Preco e estoque: o custo (so leitura), o preco de venda e o estoque do anuncio, e a margem
 * liquida que o preco deixa sobre esse custo.
 */
export default function AbaPrecoEstoque({ rascunho, contexto, alterar, problemas }) {
  // Texto do preco como foi digitado (ver `numeros.js`); `null` = nada digitado, mostra o numero.
  const [precoDigitado, setPrecoDigitado] = useState(null);

  const emKit = Boolean(rascunho.composicao);
  const itens = Array.isArray(rascunho.composicao?.itens) ? rascunho.composicao.itens : [];
  const custo = custoDoAnuncio(rascunho, itens, contexto.produtos);
  const somaAvulsa = emKit ? somaDosPrecosAvulsos(itens, contexto.produtos) : null;

  const preco = Number(rascunho.preco);
  const margem = calcularMargem(preco, custo.valor);
  const semCusto = !(custo.valor > 0);
  const erroDoPreco = problemasDoCampo(problemas, "preco").some((problema) => problema.bloqueante);
  const erroDoEstoque = problemasDoCampo(problemas, "estoque").some((problema) => problema.bloqueante);

  function digitarPreco(bruto) {
    const texto = filtrarDecimal(bruto, 2);
    setPrecoDigitado(texto);
    alterar({ preco: lerDecimal(texto) });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Campo
          nome="ml-custo"
          rotulo="Custo"
          ajuda="Somente leitura. Quem muda o custo e o cadastro do produto (aba Fornecedores). No kit, e a soma de quantidade x custo de cada item."
        >
          <input
            id="ml-custo"
            readOnly
            value={custo.valor === null ? "" : MOEDA.format(custo.valor)}
            placeholder="Sem custo"
            className={`${CLASSE_CAMPO} border-borda bg-fundo text-suave`}
          />
          {custo.valor !== null && custo.origem && <p className="mt-1 text-[11px] text-suave">Origem: {custo.origem}</p>}
        </Campo>

        <Campo
          nome="ml-preco"
          rotulo="Preco de venda"
          ajuda={
            emKit
              ? "O preco do kit nao sai da soma das pecas: decida pela margem."
              : "Comeca com o preco de venda do produto. Aceita virgula ou ponto."
          }
        >
          <input
            id="ml-preco"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={mostrarDigitado(precoDigitado, rascunho.preco, 2)}
            onChange={(evento) => digitarPreco(evento.target.value)}
            // Ao sair o campo volta ao numero formatado ("29,9" vira "29,90").
            onBlur={() => setPrecoDigitado(null)}
            className={`${CLASSE_CAMPO} ${bordaDoCampo(erroDoPreco)}`}
          />
          <MensagensDoCampo problemas={problemas} campo="preco" />
          {somaAvulsa !== null && (
            <p className="mt-1 text-[11px] text-suave">Soma dos precos avulsos: {MOEDA.format(somaAvulsa)}</p>
          )}
        </Campo>

        <Campo
          nome="ml-estoque"
          rotulo="Estoque"
          ajuda={
            emKit
              ? "Quantos kits o estoque dos itens monta. Mudar a composicao recalcula este numero."
              : "Comeca com o estoque do produto no sistema."
          }
        >
          <input
            id="ml-estoque"
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            value={rascunho.estoque ?? ""}
            // Vazio e `null`, e nao 0: a validacao acusa estoque em branco, e zero e outra coisa.
            onChange={(evento) => alterar({ estoque: evento.target.value === "" ? null : Number(evento.target.value) })}
            onKeyDown={recusarSimbolosDeInteiro}
            className={`${CLASSE_CAMPO} ${bordaDoCampo(erroDoEstoque)}`}
          />
          <MensagensDoCampo problemas={problemas} campo="estoque" />
        </Campo>
      </div>

      <div className="rounded border border-borda bg-fundo p-3">
        <p className="text-xs text-suave">Margem liquida</p>
        {margem !== null ? (
          <p className={`mt-1 text-lg font-semibold ${corDaMargem(preco, custo.valor)}`}>
            {PERCENTUAL.format(margem)}%
            <span className="ml-2 text-sm font-medium">lucro de {MOEDA.format(lucroLiquido(preco, custo.valor))}</span>
          </p>
        ) : semCusto ? (
          <p className="mt-1 text-sm text-amber-700">{mensagemSemCusto(custo.faltam)}</p>
        ) : (
          <p className="mt-1 text-sm text-suave">Informe o preco de venda para ver a margem.</p>
        )}
        <p className="mt-2 text-[11px] text-suave">
          Imposto de {Math.round(IMPOSTO_PADRAO * 100)}% fixo. Comissao, tarifa e frete do ML entram na fase 2.
        </p>
      </div>
    </div>
  );
}

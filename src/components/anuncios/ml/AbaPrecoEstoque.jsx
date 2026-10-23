"use client";

import { useState } from "react";

import Campo, { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import SeloPosicaoDePreco from "@/components/produtos/SeloPosicaoDePreco";
import { custoDaComposicao } from "@/lib/canaisDeVenda/composicao";
import { concorrentesParaPosicao } from "@/lib/canaisDeVenda/ml/avisosConcorrentes";
import { custosDoAnuncio, custosValem, freteQueConta } from "@/lib/canaisDeVenda/ml/custos";
import { calcularMargem, corDaMargem, lucroLiquido } from "@/lib/margem";
import { posicaoDePreco } from "@/lib/posicaoDePreco";
import CalculadoraDeMargem from "./CalculadoraDeMargem";
import ConcorrentesDoML from "./ConcorrentesDoML";
import RankingDosCatalogos from "./RankingDosCatalogos";
import CustosDoML from "./CustosDoML";
import MensagensDoCampo, { problemasDoCampo } from "./MensagensDoCampo";
import { filtrarDecimal, lerDecimal, mostrarDigitado } from "./numeros";

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
    ? `Sem custo de ${faltam.join(", ")}: a margem fica indisponível.`
    : "Sem custo informado: a margem fica indisponível.";
}

/// Mesma regra de cor da margem do Produto (`corDaMargem`), mas sobre o lucro JA com as taxas do
/// ML: vermelho com prejuizo, amarelo abaixo de 60%, verde a partir de 60%.
function corDoLucro(lucro, margem) {
  if (lucro < 0) return "text-red-600";
  return margem >= 60 ? "text-emerald-600" : "text-yellow-600";
}

// A margem em % e em R$, bem visivel embaixo do preco (pedido do dono em 22/10/2026). Com as taxas do ML lidas, e o lucro
// de verdade; sem elas, so o imposto, e o rotulo diz isso.
function MargemDoPreco({ preco, custo, conta, mensagemSemCusto }) {
  if (!(preco > 0)) return null;
  if (!(custo.valor > 0)) return <p className="mt-1.5 text-xs text-amber-700">{mensagemSemCusto}</p>;
  const comTaxas = conta && conta.lucro !== null;
  const margem = comTaxas ? conta.margem : calcularMargem(preco, custo.valor);
  const lucro = comTaxas ? conta.lucro : lucroLiquido(preco, custo.valor);
  const cor = comTaxas ? corDoLucro(lucro, margem) : corDaMargem(preco, custo.valor);
  return (
    <div className="mt-1.5">
      <p className={`text-xl leading-tight font-semibold tabular-nums ${cor}`}>
        {PERCENTUAL.format(margem)}%<span className="ml-2 text-base">{MOEDA.format(lucro)}</span>
      </p>
      <p className="text-[11px] text-suave">{comTaxas ? "margem com as taxas do ML" : "margem sem as taxas do ML: leia os custos"}</p>
    </div>
  );
}

/**
 * Aba Preco e estoque: o preco de venda (com a calculadora dentro do campo e a margem embaixo) e o
 * estoque do anuncio, os concorrentes do catalogo e os Custos totais (fornecedor, taxas do ML e imposto).
 */
export default function AbaPrecoEstoque({ rascunho, contexto, alterar, setContexto, problemas, acessos = { custos: true, concorrentes: true } }) {
  // Texto do preco como foi digitado (ver `numeros.js`); `null` = nada digitado, mostra o numero.
  const [precoDigitado, setPrecoDigitado] = useState(null);
  // Os concorrentes do ML pelo catalogo (o bloco abaixo os le): o selo "Nº de M" ao lado do preco usa eles.
  const [concorrentesML, setConcorrentesML] = useState([]);
  // A tela inteira dos concorrentes: o ranking dos catalogos tira dela o 1o do catalogo do anuncio.
  const [telaConcorrentes, setTelaConcorrentes] = useState(null);
  const posicaoNoML = posicaoDePreco(rascunho.preco, concorrentesParaPosicao(concorrentesML));

  const custosML = contexto.custosML ?? null;
  const preco = Number(rascunho.preco);

  const emKit = Boolean(rascunho.composicao);
  const itens = Array.isArray(rascunho.composicao?.itens) ? rascunho.composicao.itens : [];
  const custo = custoDoAnuncio(rascunho, itens, contexto.produtos);
  const somaAvulsa = emKit ? somaDosPrecosAvulsos(itens, contexto.produtos) : null;
  // A conta com as taxas do ML serve a margem embaixo do preco e aos Custos totais: feita uma vez aqui.
  const conta =
    custosValem(custosML, rascunho) && preco > 0
      ? custosDoAnuncio({ preco, custo: custo.valor, percentual: custosML.percentual, tarifaFixa: custosML.tarifaFixa, frete: freteQueConta(custosML, rascunho) })
      : null;

  const erroDoPreco = problemasDoCampo(problemas, "preco").some((problema) => problema.bloqueante);

  function digitarPreco(bruto) {
    const texto = filtrarDecimal(bruto, 2);
    setPrecoDigitado(texto);
    alterar({ preco: lerDecimal(texto) });
  }

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 md:grid-cols-2">
        <Campo
          nome="ml-preco"
          rotulo={
            <>
              Preço de venda
              {posicaoNoML && <SeloPosicaoDePreco posicao={posicaoNoML} />}
              {posicaoNoML && <span className="ml-1 text-[11px] font-normal text-suave">no ML</span>}
            </>
          }
          ajuda={
            emKit
              ? "O preço do kit não sai da soma das peças: decida pela margem."
              : "Começa com o preço de venda do produto. Aceita vírgula ou ponto."
          }
        >
          {(() => {
            const campo = (
            <input
              id="ml-preco"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              value={mostrarDigitado(precoDigitado, rascunho.preco, 2)}
              onChange={(evento) => digitarPreco(evento.target.value)}
              // Ao sair o campo volta ao numero formatado ("29,9" vira "29,90").
              onBlur={() => setPrecoDigitado(null)}
              className={`${CLASSE_CAMPO} ${acessos.custos ? "pr-10" : ""} ${bordaDoCampo(erroDoPreco)}`}
            />
            );
            // Sem Custo e Margem (Acessos) a calculadora e a margem nao existem: o campo fica sozinho.
            return acessos.custos ? (
              <CalculadoraDeMargem rascunho={rascunho} alterar={alterar} setContexto={setContexto} custo={custo}>
                {campo}
              </CalculadoraDeMargem>
            ) : (
              campo
            );
          })()}
          <MensagensDoCampo problemas={problemas} campo="preco" />
          {acessos.custos && <MargemDoPreco preco={preco} custo={custo} conta={conta} mensagemSemCusto={mensagemSemCusto(custo.faltam)} />}
          {somaAvulsa !== null && (
            <p className="mt-1 text-[11px] text-suave">Soma dos preços avulsos: {MOEDA.format(somaAvulsa)}</p>
          )}
        </Campo>

        {acessos.custos && <CustosDoML rascunho={rascunho} contexto={contexto} setContexto={setContexto} custo={custo} conta={conta} />}
      </div>

      {rascunho.produtoId && acessos.concorrentes && (
        <ConcorrentesDoML produtoId={rascunho.produtoId} titulo={rascunho.titulo} alterar={alterar} aoMudarConcorrentes={setConcorrentesML} aoMudarTela={setTelaConcorrentes} />
      )}

      {rascunho.produtoId && acessos.concorrentes && (
        <RankingDosCatalogos produtoId={rascunho.produtoId} titulo={rascunho.titulo} preco={rascunho.preco} categoriaId={rascunho.categoriaId} telaConcorrentes={telaConcorrentes} />
      )}

    </div>
  );
}

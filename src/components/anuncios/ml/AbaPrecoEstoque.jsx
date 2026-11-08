"use client";

import { MarcaDaPropostaNoCampo, SugestaoDaProposta } from "@/components/anuncios/PropostaDoAnuncio";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { Calculator, ExternalLink, Search } from "lucide-react";

import Campo, { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import { custoDaComposicao } from "@/lib/canaisDeVenda/composicao";
import { precoPelaFaixaMLAcao } from "@/app/canais-de-venda/mercado-livre/acoes";
import { custosDoAnuncio, custosValem, freteQueConta, precoPorMargem } from "@/lib/canaisDeVenda/ml/custos";
import { lucroPorUnidade } from "@/lib/canaisDeVenda/ml/faixas";
import { calcularMarkup, corDoMarkup, lucroLiquido } from "@/lib/margem";
import CalculadoraDeMargem, { taxasUsaveis } from "./CalculadoraDeMargem";
import AtacadoDoML from "./AtacadoDoML";
import SecaoDoAnuncio from "./SecaoDoAnuncio";
import CustosDoML from "./CustosDoML";
import MensagensDoCampo, { problemasDoCampo } from "./MensagensDoCampo";
import { filtrarDecimal, lerDecimal, mostrarDigitado } from "./numeros";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const ORIGEM_DO_KIT = "soma de quantidade x custo dos itens";

// O custo do anuncio e o do produto (a origem diz de onde veio) ou, no kit, a soma dos itens. Item
// sem custo derruba a soma toda, e `faltam` diz quais (pelo SKU): total parcial pareceria margem boa.
// Exportada: a conta do kit no bloco Composicao (aba Caracteristicas) usa a mesma.
export function custoDoAnuncio(rascunho, itens, produtos) {
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
    ? `Sem custo de ${faltam.join(", ")}: o markup fica indisponível.`
    : "Sem custo informado: o markup fica indisponível.";
}

/// Mesma regra de cor do Produto (`corDoMarkup`), mas sobre o markup JA com as taxas do ML:
/// vermelho com prejuizo, amarelo abaixo de 60%, verde a partir de 60%.
function corDoLucro(lucro, markup) {
  if (lucro < 0) return "text-red-600";
  return markup >= 60 ? "text-emerald-600" : "text-yellow-600";
}

// O markup em % (lucro sobre o custo, pedido do dono em 24/10/2026; era a margem sobre o preco) e o lucro em R$, bem
// visiveis embaixo do preco. Com as taxas do ML lidas, e o lucro de verdade; sem elas, o markup do cadastro (sem taxas),
// e o rotulo diz isso.
function MargemDoPreco({ preco, custo, conta, mensagemSemCusto }) {
  if (!(preco > 0)) return null;
  if (!(custo.valor > 0)) return <p className="mt-1.5 text-xs text-amber-700">{mensagemSemCusto}</p>;
  const comTaxas = conta && conta.lucro !== null;
  const markup = comTaxas ? conta.markup : calcularMarkup(preco, custo.valor);
  const lucro = comTaxas ? conta.lucro : lucroLiquido(preco, custo.valor);
  const cor = comTaxas ? corDoLucro(lucro, markup) : corDoMarkup(preco, custo.valor);
  return (
    <div className="mt-1.5">
      <p className={`text-xl leading-tight font-semibold tabular-nums ${cor}`}>
        {PERCENTUAL.format(markup)}%<span className="ml-2 text-base">{MOEDA.format(lucro)}</span>
      </p>
      <p className="text-[11px] text-suave">{comTaxas ? "markup (lucro sobre o total dos custos)" : "markup sem as taxas do ML: leia os custos"}</p>
    </div>
  );
}

/**
 * Aba Preco e custos: o preco de venda (com a calculadora dentro do campo e a margem embaixo) e os Custos totais
 * (fornecedor, taxas do ML e imposto). Concorrentes e ranking do catalogo foram para a aba Catalogo (26/10/2026).
 */
const MOEDA_DA_PROPOSTA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function AbaPrecoEstoque({ rascunho, contexto, alterar, setContexto, problemas, acessos = { custos: true, concorrentes: true }, precoDaLojaEnviado = null, mudancas = null, anuncioId = null, jaNoML = false }) {
  // Texto do preco como foi digitado (ver `numeros.js`); `null` = nada digitado, mostra o numero.
  const [precoDigitado, setPrecoDigitado] = useState(null);
  // O selo "Nº de M no ML" ao lado do preco saiu em 26/10/2026 (pedido do dono, opcao 2): a posicao fica so na aba Catalogo.

  const custosML = contexto.custosML ?? null;
  const preco = Number(rascunho.preco);

  const emKit = Boolean(rascunho.composicao);
  const itens = Array.isArray(rascunho.composicao?.itens) ? rascunho.composicao.itens : [];
  const custo = custoDoAnuncio(rascunho, itens, contexto.produtos);
  const somaAvulsa = emKit ? somaDosPrecosAvulsos(itens, contexto.produtos) : null;
  // O preco de venda da loja de agora (kit: a soma das pecas), a base do "Preco pelo lucro da loja" e do "!" do preco da loja.
  const precoDaLojaAtual = emKit ? (somaAvulsa ?? 0) : Number(contexto.produtos?.[rascunho.produtoId]?.precoVenda ?? 0);
  const unidadesDoKit = itens.reduce((soma, item) => soma + (Number.isInteger(Number(item.quantidade)) && Number(item.quantidade) > 0 ? Number(item.quantidade) : 0), 0);
  // A conta com as taxas do ML serve a margem embaixo do preco e aos Custos totais: feita uma vez aqui.
  const conta =
    custosValem(custosML, rascunho) && preco > 0
      ? custosDoAnuncio({ preco, custo: custo.valor, percentual: custosML.percentual, tarifaFixa: custosML.tarifaFixa, frete: freteQueConta(custosML, rascunho) })
      : null;

  const erroDoPreco = problemasDoCampo(problemas, "preco").some((problema) => problema.bloqueante);

  // O % de lucro DIGITADO (na calculadora ou na conta do kit) e um alvo que o preco persegue (pedido do dono em 27/10/2026:
  // "coloquei 200 e mostrou 173%; deve ajustar para exatamente o que digitei"). O preco sai das taxas lidas no preco de
  // antes; trocado o preco, a caixa de custos rele as taxas (o frete muda, a R$ 79 o frete gratis entra) e o preco e refeito
  // com elas, ate bater. No maximo 4 voltas por alvo: perto dos R$ 79 pode nao haver preco exato (de um lado o frete e outro).
  // Mora aqui, e nao nos campos, porque esta aba fica sempre montada; digitar o preco ou o lucro em R$ desliga o alvo.
  const alvo = contexto.markupAlvo ?? null;
  const taxasAgora = taxasUsaveis(custosML, rascunho);
  const chaveDasTaxas = taxasAgora ? `${taxasAgora.percentual}|${taxasAgora.tarifaFixa}|${taxasAgora.frete}` : "";
  const voltas = useRef({ chave: null, quantas: 0 });
  const perseguirOAlvo = useEffectEvent(() => {
    if (alvo === null || !(custo.valor > 0) || !taxasAgora) return;
    const novo = precoPorMargem({ custo: custo.valor, ...taxasAgora, margem: { tipo: "percentual", valor: alvo } });
    if (!(novo > 0) || novo === preco) return;
    const chave = `${alvo}|${custo.valor}`;
    if (voltas.current.chave !== chave) voltas.current = { chave, quantas: 0 };
    if (voltas.current.quantas >= 4) return;
    voltas.current.quantas += 1;
    alterar({ preco: novo });
  });
  useEffect(() => {
    perseguirOAlvo();
  }, [alvo, custo.valor, chaveDasTaxas]);

  function digitarPreco(bruto) {
    const texto = filtrarDecimal(bruto, 2);
    setPrecoDigitado(texto);
    if (alvo !== null) setContexto((atual) => ({ ...atual, markupAlvo: null }));
    alterar({ preco: lerDecimal(texto) });
  }

  return (
    <div className="space-y-4">
      <SecaoDoAnuncio titulo="Preço e custos">
      <div className="grid items-start gap-4 md:grid-cols-2">
        <Campo
          nome="ml-preco"
          rotulo="Preço de venda"
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
              <CalculadoraDeMargem rascunho={rascunho} contexto={contexto} alterar={alterar} setContexto={setContexto} custo={custo}>
                {campo}
              </CalculadoraDeMargem>
            ) : (
              campo
            );
          })()}
          <MarcaDaPropostaNoCampo proposta={contexto.proposta} caminho="preco" valorAtual={rascunho.preco} />
          <SugestaoDaProposta proposta={contexto.proposta} caminho="preco" valorAtual={rascunho.preco} aoUsar={(valor) => {
            if (alvo !== null) setContexto((atual) => ({ ...atual, markupAlvo: null }));
            alterar({ preco: Number(valor) });
          }} formatar={(valor) => MOEDA_DA_PROPOSTA.format(Number(valor))} />
          {contexto.proposta?.preco?.valor != null && (
            <p className="mt-1 text-[11px] text-amber-800">
              {/* Desde 05/11/2026 a proposta mira o lucro da loja (pedido do dono) e guarda os dois lucros; a gravada antes tem o
                  markup (de 24/10/2026) ou a margem sobre o preco (antes disso). */}
              Proposta:{" "}
              {contexto.proposta.preco.lucroNaLoja != null
                ? `lucro de ${MOEDA.format(contexto.proposta.preco.lucro)} (na loja ${MOEDA.format(contexto.proposta.preco.lucroNaLoja)})`
                : `${contexto.proposta.preco.markup ?? contexto.proposta.preco.margem}% de ${contexto.proposta.preco.markup != null ? "markup" : "margem"}`}
              , {contexto.proposta.preco.posicao}º de {contexto.proposta.preco.total} no ranking da proposta.
            </p>
          )}
          <MensagensDoCampo problemas={problemas} campo="preco" />
          {acessos.custos && <MargemDoPreco preco={preco} custo={custo} conta={conta} mensagemSemCusto={mensagemSemCusto(custo.faltam)} />}
          {/* Kit (pedido do dono em 27/10/2026, no lugar da "Soma dos preços avulsos"): o preço de UMA unidade no site da loja e
              o do ML dividido pelas unidades do kit, para comparar os dois. Kit misto: a média por unidade. */}
          {emKit && unidadesDoKit > 0 && (somaAvulsa !== null || preco > 0) && (
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 text-xs tabular-nums">
              <dt className="text-suave">Preço na loja (UN)</dt>
              <dd>
                {somaAvulsa !== null ? MOEDA.format(somaAvulsa / unidadesDoKit) : "—"}
                {/* O lucro por unidade na loja (pedido do dono em 05/11/2026: "no kit nao mostra o lucro igual ao produto unico"):
                    a mesma conta do anuncio simples (preco menos o imposto padrao e o custo), sobre a soma das pecas e o custo do
                    kit, dividida pelas unidades. */}
                {(() => {
                  const lucroDoKit = acessos.custos && somaAvulsa !== null ? lucroLiquido(somaAvulsa, custo.valor) : null;
                  if (lucroDoKit === null) return null;
                  const lucroPorUnidade = lucroDoKit / unidadesDoKit;
                  return <span className={`ml-1 ${lucroPorUnidade < 0 ? "text-red-600" : "text-suave"}`}>(Lucro = {MOEDA.format(lucroPorUnidade)})</span>;
                })()}
              </dd>
              <dt className="text-suave">Preço no ML (UN)</dt>
              <dd className="font-medium">
                {preco > 0 ? MOEDA.format(preco / unidadesDoKit) : "—"}
                {/* O lucro por unidade NO ML (pedido do dono em 08/11/2026: "no kit nao esta mostrando o lucro por item"): o lucro do
                    anuncio com as taxas lidas, dividido pelas unidades, como a linha da loja. Sem as taxas lidas, nada. */}
                {(() => {
                  const porUnidade = acessos.custos && conta ? lucroPorUnidade(conta.lucro, unidadesDoKit) : null;
                  return porUnidade === null ? null : (
                    <span className={`ml-1 font-normal ${porUnidade < 0 ? "text-red-600" : "text-suave"}`}>(Lucro = {MOEDA.format(porUnidade)})</span>
                  );
                })()}
              </dd>
            </dl>
          )}
          {/* Anuncio simples (pedido do dono em 28/10/2026, "assim como e mostrado no kit"): o preco de venda do produto, o do
              site da loja, para comparar com o do ML. */}
          {!emKit && Number(contexto.produtos?.[rascunho.produtoId]?.precoVenda) > 0 && (
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 text-xs tabular-nums">
              <dt className="text-suave">Preço na loja</dt>
              <dd>
                {MOEDA.format(Number(contexto.produtos[rascunho.produtoId].precoVenda))}
                {/* O lucro na loja entre parenteses (pedido do dono em 03/11/2026, "R$25 (Lucro=R$5)"): a mesma conta do cadastro
                    do produto (preco menos o imposto padrao e o custo). So com o acesso a custos e com o custo conhecido. */}
                {(() => {
                  const lucroNaLoja = acessos.custos ? lucroLiquido(Number(contexto.produtos[rascunho.produtoId].precoVenda), custo.valor) : null;
                  return lucroNaLoja === null ? null : (
                    <span className={`ml-1 ${lucroNaLoja < 0 ? "text-red-600" : "text-suave"}`}>(Lucro = {MOEDA.format(lucroNaLoja)})</span>
                  );
                })()}
              </dd>
            </dl>
          )}
          {acessos.custos && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {/* O "!" do preco da loja (08/11/2026, definicao 2 do dono): o preco de venda do produto mudou depois do ultimo registro;
                  uma linha ambar ao lado do MESMO botao, que refaz o preco do ML pelo lucro novo. Nada vai ao ML sozinho. */}
              {mudancas?.partes?.includes("precoDaLoja") && (
                <p className="text-[11px] text-amber-800 tabular-nums">
                  Preço da loja mudou{precoDaLojaEnviado > 0 ? ` de ${MOEDA.format(precoDaLojaEnviado)}` : ""}
                  {precoDaLojaAtual > 0 ? ` para ${MOEDA.format(precoDaLojaAtual)}` : ""}.
                </p>
              )}
              <BotaoPrecoPeloLucroDaLoja
                rascunho={rascunho}
                custo={custo}
                temPrecoDaLoja={precoDaLojaAtual > 0}
                aplicar={(resposta) => {
                  if (alvo !== null) setContexto((atual) => ({ ...atual, markupAlvo: null }));
                  setContexto((atual) => ({ ...atual, custosML: resposta.custosML ?? atual.custosML }));
                  const alteracoes = { preco: resposta.preco };
                  if (resposta.freteGratis && !rascunho.envio?.freteGratis) alteracoes.envio = { ...rascunho.envio, freteGratis: true };
                  alterar(alteracoes);
                }}
              />
            </div>
          )}
        </Campo>

        {acessos.custos && <CustosDoML rascunho={rascunho} contexto={contexto} setContexto={setContexto} custo={custo} conta={conta} />}
      </div>
      </SecaoDoAnuncio>
      {/* Precos de atacado (08/11/2026): o segundo cartao da aba, depois de "Preco e custos". */}
      <AtacadoDoML rascunho={rascunho} alterar={alterar} anuncioId={anuncioId} jaNoML={jaNoML} problemas={problemas} />
      {/* "Pesquisar concorrentes" (pedido do dono em 05/11/2026): abre a busca do ML em outra aba com o nome do produto base,
          para ver o preco que os concorrentes praticam. A busca publica do ML pela API da 403; a pagina de lista abre normal. */}
      {linkDaBuscaNoML(contexto.produtos?.[rascunho.produtoId]?.tituloBase) && (
        <a
          href={linkDaBuscaNoML(contexto.produtos[rascunho.produtoId].tituloBase)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm text-acento hover:bg-fundo"
        >
          <Search size={14} />
          Pesquisar concorrentes
          <ExternalLink size={13} />
        </a>
      )}
    </div>
  );
}

// O nome pelo que o preco FICOU: a variante sem frete cujo preco passou de R$ 79 sai com frete gratis (obrigatorio).
function nomeDaVariante({ variante, freteGratis }) {
  const premium = String(variante).startsWith("premium");
  return `${premium ? "Premium" : "Clássico"} ${freteGratis ? "com frete grátis" : "sem frete"}`;
}

/**
 * "Preco pelo lucro da loja" (definicoes do dono em 08/11/2026): o preco da variante deste anuncio que deixa no ML o mesmo
 * lucro em R$ que o produto deixa na loja, com as taxas reais e as faixas (72-79 sobe para R$ 79 com frete gratis). O valor
 * entra no campo e continua editavel. Desligado, com o motivo no `title`, enquanto faltar custo, preco da loja ou categoria.
 */
function BotaoPrecoPeloLucroDaLoja({ rascunho, custo, temPrecoDaLoja, aplicar }) {
  const [ocupado, iniciar] = useTransition();
  const [resultado, setResultado] = useState(null);
  const semCategoria = !String(rascunho.categoriaId ?? "").trim();
  const motivo = !(custo.valor > 0)
    ? "Sem custo do produto."
    : !temPrecoDaLoja
      ? "Sem preço de venda do produto."
      : semCategoria
        ? "Sem categoria: escolha a categoria na aba Geral."
        : null;

  function calcular() {
    iniciar(async () => {
      let resposta;
      try {
        resposta = await precoPelaFaixaMLAcao(rascunho);
      } catch {
        resposta = { ok: false, erro: "Não foi possível consultar o Mercado Livre." };
      }
      if (!resposta?.ok) {
        setResultado({ erro: resposta?.erro ?? "Não foi possível calcular o preço." });
        return;
      }
      aplicar(resposta);
      setResultado({
        texto: resposta.piso
          ? `Faixa R$ 72–79: sobe para R$ 79 com frete grátis (lucro da loja ${MOEDA.format(resposta.lucro)}).`
          : `Lucro da loja ${MOEDA.format(resposta.lucro)} mantido como ${nomeDaVariante(resposta)}.`,
      });
    });
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={calcular}
        disabled={Boolean(motivo) || ocupado}
        title={motivo ?? "Calcula o preço que deixa no ML o mesmo lucro em R$ da loja, respeitando as faixas"}
        className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm text-acento transition-[background-color,transform] duration-150 ease-out hover:bg-fundo active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
      >
        <Calculator size={14} />
        {ocupado ? "Calculando…" : "Preço pelo lucro da loja"}
      </button>
      {resultado?.erro && <p className="mt-1 text-[11px] text-red-600">{resultado.erro}</p>}
      {resultado?.texto && <p className="mt-1 text-[11px] text-suave">{resultado.texto}</p>}
    </div>
  );
}

/** A pagina de busca do ML para um nome: as palavras separadas por hifen, como o proprio site monta o endereco. */
function linkDaBuscaNoML(nome) {
  const termo = String(nome ?? "").trim().replace(/\s+/g, "-");
  return termo ? `https://lista.mercadolivre.com.br/${encodeURIComponent(termo)}` : null;
}

/**
 * Regras da composicao (kit) de um anuncio: codigo, validacao, custo, estoque, peso e o
 * texto "Itens inclusos" da descricao. Funcoes puras, sem imports: a tela, as acoes e o
 * teste leem o mesmo arquivo, e nada aqui toca em banco ou rede.
 *
 * Um item e `{ produtoId, quantidade }`. Quem chama confere `errosDaComposicao` antes de
 * gravar; as demais funcoes tratam item ruim como "nao conta" em vez de quebrar, porque
 * a tela as chama a cada tecla, com a quantidade ainda pela metade.
 */

const QUANTIDADE_MAXIMA = 9999;
const MINIMO_DE_UNIDADES = 2;

// Mesmo criterio de `gerarSku` em `src/app/produtos/acoes.js`: o maior codigo ja usado
// mais um, sem reaproveitar buraco (codigo de produto excluido nao volta, porque anuncio
// ou planilha antiga apontariam para outra peca).
const CODIGO_DA_FAIXA = /^25\d{4}$/;
const PRIMEIRO_DA_FAIXA = 250001;
const ULTIMO_DA_FAIXA = 259999;

// Os kits reais do Bling escrevem o milhar com ponto (920302_1.000).
const FORMATO_DO_MILHAR = new Intl.NumberFormat("pt-BR");

// A quantidade chega do formulario como texto ("5") ou da tela como numero. Inteira e
// de 1 a 9999; qualquer outra coisa (0, negativo, 2.5, "abc", vazio, 10000) devolve null.
function lerQuantidade(quantidade) {
  let numero = quantidade;
  if (typeof quantidade === "string") {
    numero = /^\d+$/.test(quantidade.trim()) ? Number(quantidade.trim()) : NaN;
  }
  return Number.isInteger(numero) && numero >= 1 && numero <= QUANTIDADE_MAXIMA ? numero : null;
}

// Custo e peso zerados ou ausentes valem como "nao informado": um item sem custo nao
// pode entrar na soma como se fosse gratis.
function valorPositivo(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

// Arredonda no fim da conta (centavos, gramas). `toPrecision` tira o ruido do ponto
// flutuante antes de arredondar, senao 0.055 x 2 vira 0.11000000000000001 e 1.005 vira 1.
function arredondar(valor, casas) {
  const fator = 10 ** casas;
  return Math.round(Number((valor * fator).toPrecision(12))) / fator;
}

function listaDeItens(itens) {
  return Array.isArray(itens) ? itens : [];
}

/** Codigo do kit de um produto so: `{sku}_{N}`, com milhar em ponto (`920302_1.000`). */
export function codigoDaComposicao(sku, quantidade) {
  const base = String(sku ?? "").trim();
  const unidades = lerQuantidade(quantidade);
  // Sem os dois nao ha codigo. Vazio e recusado adiante como "codigo obrigatorio";
  // "100101_NaN" seria gravado.
  if (!base || unidades === null) return "";
  return `${base}_${FORMATO_DO_MILHAR.format(unidades)}`;
}

/** Soma das quantidades; item com quantidade invalida nao conta. */
export function unidadesDaComposicao(itens) {
  return listaDeItens(itens).reduce((soma, item) => soma + (lerQuantidade(item?.quantidade) ?? 0), 0);
}

/** Recusas da composicao, uma frase por problema. Lista vazia = pode gravar. */
export function errosDaComposicao(itens) {
  const lista = listaDeItens(itens);
  if (lista.length === 0) return ["Inclua ao menos um produto na composicao."];

  const erros = [];
  lista.forEach((item, posicao) => {
    if (!item?.produtoId) erros.push(`Item ${posicao + 1}: escolha o produto.`);
    if (lerQuantidade(item?.quantidade) === null) {
      erros.push(`Item ${posicao + 1}: a quantidade deve ser um numero inteiro de 1 a ${QUANTIDADE_MAXIMA}.`);
    }
  });

  const ids = lista.map((item) => item?.produtoId).filter(Boolean);
  if (new Set(ids).size !== ids.length) erros.push("O mesmo produto aparece em mais de um item.");

  // Com quantidade quebrada o total nao significa nada, e a frase de "2 unidades" so
  // repetiria o erro que ja foi dito.
  const quantidadeQuebrada = lista.some((item) => lerQuantidade(item?.quantidade) === null);
  if (!quantidadeQuebrada && unidadesDaComposicao(lista) < MINIMO_DE_UNIDADES) {
    erros.push(`A composicao precisa de ao menos ${MINIMO_DE_UNIDADES} unidades.`);
  }
  return erros;
}

/**
 * Custo do kit: soma de quantidade x custo de cada item. Se algum item nao tem custo, o
 * valor some (`null`) e `faltando` diz quais: um total parcial pareceria margem boa.
 */
export function custoDaComposicao(itens, custoPorId) {
  const lista = listaDeItens(itens);
  const faltando = [];
  let total = 0;

  for (const item of lista) {
    const custo = valorPositivo(custoPorId?.[item?.produtoId]);
    if (custo === null) {
      if (!faltando.includes(item?.produtoId)) faltando.push(item?.produtoId);
      continue;
    }
    total += custo * (lerQuantidade(item?.quantidade) ?? 0);
  }

  const semValor = lista.length === 0 || faltando.length > 0;
  return { valor: semValor ? null : arredondar(total, 2), faltando };
}

/**
 * Quantos kits o estoque dos itens monta: o menor inteiro de estoque / quantidade. Estoque
 * negativo ou nao informado conta como zero, porque nao se promete kit sem saldo.
 */
export function estoqueDaComposicao(itens, estoquePorId) {
  const lista = listaDeItens(itens);
  if (lista.length === 0) return 0;

  const kits = lista.map((item) => {
    const quantidade = lerQuantidade(item?.quantidade);
    const saldo = Number(estoquePorId?.[item?.produtoId]);
    if (quantidade === null || !Number.isFinite(saldo) || saldo <= 0) return 0;
    return Math.floor(saldo / quantidade);
  });
  return Math.min(...kits);
}

/** Peso do kit em kg (arredondado em gramas), ou `null` se algum item nao tem peso. */
export function pesoDaComposicao(itens, pesoPorId) {
  const lista = listaDeItens(itens);
  if (lista.length === 0) return null;

  let total = 0;
  for (const item of lista) {
    const peso = valorPositivo(pesoPorId?.[item?.produtoId]);
    if (peso === null) return null;
    total += peso * (lerQuantidade(item?.quantidade) ?? 0);
  }
  return arredondar(total, 3);
}

/** Secao "Itens inclusos" da descricao, no padrao da loja (`- 05 NOME;`). */
export function blocoItensInclusos(codigo, itens, tituloPorId) {
  const cabecalho = codigo ? `Itens inclusos: (Cod:${codigo})` : "Itens inclusos:";
  const linhas = listaDeItens(itens).map((item) => {
    const quantidade = String(lerQuantidade(item?.quantidade) ?? 0).padStart(2, "0");
    return `- ${quantidade} ${String(tituloPorId?.[item?.produtoId] ?? "").trim()};`;
  });
  return [cabecalho, ...linhas].join("\n");
}

const abreItensInclusos = (linha) => linha.trim().toLowerCase().startsWith("itens inclusos");
const abreGarantia = (linha) => /^garantia\s*:/i.test(linha.trim());
const ehLinhaEmBranco = (linha) => linha.trim() === "";
const ehItemDeLista = (linha) => linha.trim().startsWith("-");

/**
 * Poe o bloco de itens inclusos no texto da descricao. A secao existente comeca na linha
 * "Itens inclusos" e acaba na primeira linha em branco, ou numa linha "Garantia:", ou numa
 * linha que nao e item de lista ("- ..."): descricao importada do Bling traz a lista colada na
 * Garantia, sem linha em branco, e trocar ate o branco apagaria a garantia. Sem a secao, o
 * bloco entra antes da "Garantia:"; sem as duas, vai no fim.
 */
export function trocarItensInclusos(texto, bloco) {
  const original = String(texto ?? "");
  // O navegador manda quebra de linha CRLF nos campos de texto; o texto volta com a
  // mesma quebra com que chegou, em vez de misturar as duas.
  const quebra = original.includes("\r\n") ? "\r\n" : "\n";
  const linhas = original.split(/\r?\n/);
  const linhasDoBloco = String(bloco ?? "").split(/\r?\n/);

  const inicio = linhas.findIndex(abreItensInclusos);
  if (inicio !== -1) {
    const acabaDepois = linhas.findIndex(
      (linha, posicao) => posicao > inicio && (ehLinhaEmBranco(linha) || abreGarantia(linha) || !ehItemDeLista(linha)),
    );
    const fim = acabaDepois === -1 ? linhas.length : acabaDepois;
    return [...linhas.slice(0, inicio), ...linhasDoBloco, ...linhas.slice(fim)].join(quebra);
  }

  const garantia = linhas.findIndex(abreGarantia);
  if (garantia !== -1) {
    const brancoAntes = garantia === 0 || ehLinhaEmBranco(linhas[garantia - 1]) ? [] : [""];
    return [...linhas.slice(0, garantia), ...brancoAntes, ...linhasDoBloco, "", ...linhas.slice(garantia)].join(quebra);
  }

  const semFinal = original.trimEnd();
  return semFinal ? `${semFinal}${quebra}${quebra}${linhasDoBloco.join(quebra)}` : linhasDoBloco.join(quebra);
}

/**
 * Proximo codigo livre da faixa automatica 25xxxx (de 250001 a 259999), ou `null` se a
 * faixa acabou. Codigo de kit (`250010_5`) e de outras faixas nao entram na conta.
 */
export function proximoCodigoDaFaixa(codigos) {
  const maior = (Array.isArray(codigos) ? codigos : [])
    .map(String)
    .filter((codigo) => CODIGO_DA_FAIXA.test(codigo))
    .map(Number)
    .filter((numero) => numero >= PRIMEIRO_DA_FAIXA && numero <= ULTIMO_DA_FAIXA)
    .reduce((atual, numero) => Math.max(atual, numero), PRIMEIRO_DA_FAIXA - 1);

  return maior >= ULTIMO_DA_FAIXA ? null : String(maior + 1);
}

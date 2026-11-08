/**
 * Faixas de preco e variantes dos anuncios do ML de um produto (definicoes do dono em 08/11/2026,
 * spec docs/superpowers/specs/2026-11-08-anuncios-ml-por-lucro-da-loja-design.md). Funcoes puras,
 * sem rede: as taxas e o frete chegam como funcoes, para o teste fixar os numeros e a leitura
 * (`leitura.js`) passar as do ML de verdade.
 *
 * Uma "variante" e o par tipo de anuncio + frete gratis. A base de tudo e o LUCRO DA LOJA em R$:
 * cada variante recebe o preco que deixa no ML esse mesmo lucro, e as faixas dizem quantas
 * variante o produto tem: abaixo de R$ 72 so o Classico sem frete (o com frete gratis saiu em 08/11/2026,
 * noite); de R$ 72 para cima so o Classico com frete gratis (entre 72 e 78,99 ele sobe para o piso de
 * R$ 79, onde o frete gratis e obrigatorio e a tarifa fixa cai).
 * Premium nunca entra sozinho.
 */

import { lucroLiquido } from "../../margem";
import { custosDoAnuncio, LIMITE_DO_FRETE_GRATIS } from "./custos";

const dinheiro = (valor) => Math.round((Number(valor) + Number.EPSILON) * 100) / 100;

/** A partir deste preco sem frete o produto passa a ter so a variante com frete gratis (abaixo dele, so a sem frete). */
export const LIMITE_DA_SEGUNDA_VARIANTE = 72;

export const VARIANTES = ["classico_sem_frete", "classico_frete_gratis", "premium_sem_frete", "premium_frete_gratis"];

export const NOME_DA_VARIANTE = {
  classico_sem_frete: "Clássico sem frete",
  classico_frete_gratis: "Clássico com frete grátis",
  premium_sem_frete: "Premium sem frete",
  premium_frete_gratis: "Premium com frete grátis",
};

const TIPO_DA_VARIANTE = { classico: "gold_special", premium: "gold_pro" };

const comFreteGratis = (variante) => String(variante).endsWith("_frete_gratis");
const tipoDaVariante = (variante) => (String(variante).startsWith("premium") ? TIPO_DA_VARIANTE.premium : TIPO_DA_VARIANTE.classico);

/** Quais variantes o produto deve ter, pelo preco SEM frete (o da loja ou o calculado). Sem preco, nenhuma. */
export function variantesEsperadas(precoSemFrete) {
  const preco = Number(precoSemFrete);
  if (!(preco > 0)) return [];
  // Abaixo de R$ 72 so o Classico sem frete (o dono tirou o com frete gratis em 08/11/2026, noite); de 72 em diante, so o com frete gratis.
  return preco < LIMITE_DA_SEGUNDA_VARIANTE ? ["classico_sem_frete"] : ["classico_frete_gratis"];
}

/** A variante de um rascunho: tipo de anuncio + frete gratis (ligado ou obrigatorio pelo preco). */
export function varianteDoRascunho(rascunho) {
  const premium = rascunho?.tipoAnuncio === TIPO_DA_VARIANTE.premium;
  const freteGratis = Boolean(rascunho?.envio?.freteGratis) || Number(rascunho?.preco) >= LIMITE_DO_FRETE_GRATIS;
  return `${premium ? "premium" : "classico"}_${freteGratis ? "frete_gratis" : "sem_frete"}`;
}

/** Copia do rascunho com o tipo de anuncio e o frete gratis da variante; o original fica como esta. */
export function rascunhoDaVariante(rascunho, variante) {
  return {
    ...rascunho,
    tipoAnuncio: tipoDaVariante(variante),
    envio: { ...(rascunho?.envio ?? {}), freteGratis: comFreteGratis(variante) },
  };
}

// Sobe ao proximo preco terminado em 9 centavos (72,90 -> 72,99; 72,991 -> 73,09): nunca abaixo do pedido.
const paraCimaEm9 = (valor) => Math.ceil(Math.round((valor + 0.01) * 10 * 1e6) / 1e6) / 10 - 0.01;

/**
 * O menor preco terminado em ,X9 que deixa o `lucro` pedido numa variante, dadas `taxas(preco)` ->
 * `{ percentual, tarifaFixa }` e `frete(preco, freteGratis)` -> R$ do vendedor. O frete gratis e o
 * da variante ou o obrigatorio (preco >= 79). O preco e resolvido pela formula de `precoPorMargem`
 * nos dois regimes (abaixo e a partir de 79, onde tarifa e frete mudam) e conferido com
 * `custosDoAnuncio`; quando nenhum regime se sustenta (a conta abaixo de 79 passa de 79 e a de 79
 * fica abaixo), o preco e o proprio 79. `piso` marca a regra da faixa 72-79: variante com frete
 * gratis cujo preco sem frete cai ali sobe para R$ 79. `null` sem custo ou sem lucro.
 */
export async function precoPelaFaixa({ lucro, custo, variante, taxas, frete }) {
  // `Number(null)` e 0: lucro ausente nao e lucro zero.
  if (lucro === null || lucro === undefined || lucro === "") return null;
  const pedido = Number(lucro);
  if (!Number.isFinite(pedido) || !(Number(custo) > 0)) return null;
  const freteDaVariante = comFreteGratis(variante);

  const resolvido = await resolver({ pedido, custo: Number(custo), freteDaVariante, taxas, frete });
  if (resolvido === null) return null;

  let final = resolvido.preco;
  let piso = false;
  // O lucro sozinho deixaria o preco com frete gratis abaixo de 79 (ou exatamente no 79 forcado pelo choque dos dois
  // regimes): se o preco sem frete cai na faixa 72-79, vale a regra do piso.
  if (freteDaVariante && (final < LIMITE_DO_FRETE_GRATIS || resolvido.forcado)) {
    const semFrete = (await resolver({ pedido, custo: Number(custo), freteDaVariante: false, taxas, frete }))?.preco ?? null;
    if (semFrete !== null && semFrete >= LIMITE_DA_SEGUNDA_VARIANTE && semFrete < LIMITE_DO_FRETE_GRATIS) {
      final = LIMITE_DO_FRETE_GRATIS;
      piso = true;
    }
  }
  return { preco: final, freteGratis: freteDaVariante || final >= LIMITE_DO_FRETE_GRATIS, piso };
}

async function resolver({ pedido, custo, freteDaVariante, taxas, frete }) {
  const lucroEm = async (preco) => {
    const fg = freteDaVariante || preco >= LIMITE_DO_FRETE_GRATIS;
    const { percentual, tarifaFixa } = (await taxas(preco)) ?? {};
    return custosDoAnuncio({ preco, custo, percentual, tarifaFixa, frete: await frete(preco, fg) })?.lucro ?? null;
  };
  // A formula de precoPorMargem com as taxas e o frete lidos num preco de referencia do regime.
  const candidato = async (referencia) => {
    const fg = freteDaVariante || referencia >= LIMITE_DO_FRETE_GRATIS;
    const { percentual, tarifaFixa } = (await taxas(referencia)) ?? {};
    const parte = 1 - Number(percentual ?? 0) - 0.06;
    if (!(parte > 0)) return null;
    return paraCimaEm9((pedido + custo + Number(tarifaFixa ?? 0) + Number((await frete(referencia, fg)) ?? 0)) / parte);
  };

  let preco = null;
  let forcado = false;
  const abaixo = await candidato(LIMITE_DO_FRETE_GRATIS - 1);
  if (abaixo !== null && abaixo < LIMITE_DO_FRETE_GRATIS) preco = abaixo;
  else {
    const acima = await candidato(LIMITE_DO_FRETE_GRATIS);
    if (acima === null) return null;
    forcado = acima < LIMITE_DO_FRETE_GRATIS;
    preco = forcado ? LIMITE_DO_FRETE_GRATIS : acima;
  }
  // Tarifa e frete mudam com o preco (o frete do vendedor cresce com ele: a R$ 467 o kit pagou R$ 21,65, nao os R$ 19,05
  // lidos a R$ 79): refaz a conta com as taxas lidas no proprio preco ate ela parar de mudar, como precoPorMargemNoML.
  if (!forcado) {
    for (let volta = 0; volta < 4; volta++) {
      const refeito = await candidato(preco);
      if (refeito === null || refeito === preco) break;
      // Nunca volta para baixo de 79 vindo de cima (o regime de 79 e o que vale) nem para cima de 79 vindo de baixo.
      if ((preco >= LIMITE_DO_FRETE_GRATIS) !== (refeito >= LIMITE_DO_FRETE_GRATIS)) break;
      preco = refeito;
    }
  }
  // Degraus menores que a conta nao pega: confere e sobe 10 centavos ate 4 vezes.
  for (let volta = 0; volta < 4; volta++) {
    const lucro = await lucroEm(preco);
    if (lucro === null || lucro >= pedido) break;
    preco = dinheiro(preco + 0.1);
  }
  return { preco: dinheiro(preco), forcado };
}

/**
 * As variantes que o produto deve ter, tem e ainda faltam, pelas linhas de `anunciosMLDoProduto` (`tipoAnuncio`, `preco`,
 * `freteGratis`, `situacaoCanal`, `codigo`, `sku`). A faixa sai do preco de venda da LOJA (sem chamar o ML; perto de R$ 72 pode
 * diferir em centavos do preco exato pelo lucro, aceito). So o anuncio do proprio produto (nao o kit: `codigo === sku`) e
 * nao encerrado conta; rascunho conta (vai virar anuncio). Premium nunca cobre o Classico.
 *
 * `naConta` (08/11/2026, pedido do dono): os anuncios do SKU que a conta do ML ja tem e o Rise nao (`candidatosParaReaproveitar`:
 * `tipoAnuncio`, `freteGratis`, `preco`, `status`; os encerrados ja sairam). Contam como existentes: o "Faltam" nao pede o que
 * ja esta no ar, so precisa ser reaproveitado.
 */
export function variantesDoProduto({ precoVenda, anuncios, naConta = [] }) {
  const esperadas = variantesEsperadas(precoVenda);
  const existentes = [];
  for (const anuncio of anuncios ?? []) {
    if (!anuncio || anuncio.situacaoCanal === "ENCERRADA") continue;
    if (String(anuncio.codigo ?? "") !== String(anuncio.sku ?? "")) continue;
    const variante = varianteDoRascunho({ tipoAnuncio: anuncio.tipoAnuncio, envio: { freteGratis: anuncio.freteGratis }, preco: anuncio.preco });
    if (!existentes.includes(variante)) existentes.push(variante);
  }
  for (const anuncio of naConta ?? []) {
    if (!anuncio || anuncio.status === "closed") continue;
    const variante = varianteDoRascunho({ tipoAnuncio: anuncio.tipoAnuncio, envio: { freteGratis: anuncio.freteGratis }, preco: anuncio.preco });
    if (!existentes.includes(variante)) existentes.push(variante);
  }
  return { esperadas, existentes, faltam: esperadas.filter((variante) => !existentes.includes(variante)) };
}

/** Lucro de uma unidade do kit (6.8 da spec): lucro do anuncio dividido pelas unidades. `null` sem lucro ou sem unidades. */
export function lucroPorUnidade(lucro, unidades) {
  if (lucro === null || lucro === undefined || !Number.isFinite(Number(lucro)) || !(Number(unidades) > 0)) return null;
  return dinheiro(Number(lucro) / Number(unidades));
}

/**
 * O lucro da loja do produto do rascunho: preco de venda menos custo e imposto (`lucroLiquido`,
 * o mesmo da proposta do ML). Kit (`composicao.itens`): a soma do lucro de cada peca vezes a
 * quantidade dela. `null` quando alguma peca esta sem preco de venda ou sem custo.
 */
export function lucroDaLojaDoRascunho(rascunho, produtos) {
  const porId = produtos instanceof Map ? produtos : new Map((produtos ?? []).map((p) => [p.id, p]));
  // O contexto dos produtos traz o custo como `{ valor, origem }` (custoDoProduto); o teste e outros chamadores, um numero.
  const custoDe = (produto) => Number(produto?.custo && typeof produto.custo === "object" ? produto.custo.valor : produto?.custo);
  const lucroDe = (produto) => lucroLiquido(Number(produto?.precoVenda), custoDe(produto));
  const pecas = Array.isArray(rascunho?.composicao?.itens) && rascunho.composicao.itens.length ? rascunho.composicao.itens : null;
  if (!pecas) {
    const lucro = lucroDe(porId.get(rascunho?.produtoId));
    return lucro === null ? null : dinheiro(lucro);
  }
  let total = 0;
  for (const peca of pecas) {
    const lucro = lucroDe(porId.get(peca.produtoId));
    if (lucro === null || !(Number(peca.quantidade) > 0)) return null;
    total += lucro * Number(peca.quantidade);
  }
  return dinheiro(total);
}

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
import { custosDoAnuncio, LIMITE_DO_FRETE_GRATIS, precoFechado } from "./custos";
import { ATACADO_DESLIGADO, ATACADO_PADRAO, atacadoPermitido } from "./atacado";

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

/** A partir deste preco no ML o produto ganha tambem o Premium com frete gratis (decisao do dono em 08/11/2026, noite). */
export const LIMITE_DO_PREMIUM = 150;

/** O nome curto da variante nas listas (pedido do dono: "fique claro se e classico + frete, premium + frete"). */
export const ROTULO_DA_VARIANTE = {
  classico_sem_frete: "Clássico sem frete",
  classico_frete_gratis: "Clássico + frete grátis",
  premium_sem_frete: "Premium sem frete",
  premium_frete_gratis: "Premium + frete grátis",
};

/**
 * As regras das variantes em texto, uma por linha: a bolha "i" do popup de anuncios e o roteiro da proposta (a IA pelo MCP)
 * leem daqui, para as duas nunca dizerem coisas diferentes.
 */
export const REGRAS_DAS_VARIANTES = [
  "Preço no ML abaixo de R$ 72: um anúncio, Clássico sem frete.",
  "De R$ 72 a R$ 78,99: sobe para R$ 79, Clássico + frete grátis (o frete grátis é obrigatório a partir de R$ 79).",
  "De R$ 79 a R$ 149,99: um anúncio, Clássico + frete grátis.",
  "A partir de R$ 150: dois anúncios, Clássico + frete grátis e Premium + frete grátis.",
  "O preço de cada anúncio deixa no ML o mesmo lucro em R$ que o produto deixa na loja.",
  "Kit: a faixa vale pelo preço do anúncio do kit, e o lucro é o da loja vezes a quantidade.",
];

/**
 * Quais variantes o produto deve ter, pelo preco no ML (o da loja, o calculado, ou o maior Classico ja feito). Sem preco,
 * nenhuma. Abaixo de R$ 72 so o Classico sem frete (o dono tirou o com frete gratis em 08/11/2026, noite); de 72 a 149,99 so o
 * com frete gratis; de 150 em diante tambem o Premium com frete gratis.
 */
export function variantesEsperadas(precoSemFrete) {
  const preco = Number(precoSemFrete);
  if (!(preco > 0)) return [];
  if (preco < LIMITE_DA_SEGUNDA_VARIANTE) return ["classico_sem_frete"];
  return preco < LIMITE_DO_PREMIUM ? ["classico_frete_gratis"] : ["classico_frete_gratis", "premium_frete_gratis"];
}

/** A variante de um rascunho: tipo de anuncio + frete gratis (ligado ou obrigatorio pelo preco). */
export function varianteDoRascunho(rascunho) {
  const premium = rascunho?.tipoAnuncio === TIPO_DA_VARIANTE.premium;
  const freteGratis = Boolean(rascunho?.envio?.freteGratis) || Number(rascunho?.preco) >= LIMITE_DO_FRETE_GRATIS;
  return `${premium ? "premium" : "classico"}_${freteGratis ? "frete_gratis" : "sem_frete"}`;
}

/// A ordem das variantes no popup do produto (pedido do dono em 09/11/2026): primeiro sem frete, Classico antes do Premium.
const ORDEM_NO_POPUP = ["classico_sem_frete", "premium_sem_frete", "classico_frete_gratis", "premium_frete_gratis"];

/**
 * A ordem fixa dos anuncios de um produto no popup "Anúncios do Mercado Livre" (pedido do dono em 09/11/2026: "os cards devem
 * ser fixos na ordem, classico sem frete, premium sem frete, classico com frete, premium com frete e depois os kits mantendo a
 * mesma dinamica"). Primeiro os do produto base (`codigo` = `sku`), depois os kits no ML pelo N do codigo `{sku}_{N}`, do menor
 * ao maior; outro codigo (produto com composicao) por ultimo. Dentro do grupo, a variante; empate fica na ordem recebida.
 * Devolve uma lista nova: a recebida nao muda.
 */
export function ordenarAnunciosDoProduto(anuncios) {
  const grupo = (anuncio) => {
    if (!anuncio?.codigo || anuncio.codigo === anuncio.sku) return 1;
    const kit = String(anuncio.codigo).match(/_(\d+)$/);
    return kit ? Number(kit[1]) : Number.MAX_SAFE_INTEGER;
  };
  const posicao = (anuncio) => ORDEM_NO_POPUP.indexOf(varianteDoRascunho({ tipoAnuncio: anuncio?.tipoAnuncio, envio: { freteGratis: anuncio?.freteGratis }, preco: anuncio?.preco }));
  return [...(Array.isArray(anuncios) ? anuncios : [])].sort(
    (a, b) => grupo(a) - grupo(b) || String(a.codigo ?? "").localeCompare(String(b.codigo ?? "")) || posicao(a) - posicao(b),
  );
}

/**
 * Copia do rascunho com o tipo de anuncio, o frete gratis e o atacado da variante; o original fica como esta.
 * Atacado (dono, 09/11/2026): sem frete gratis nasce DESLIGADO (o ML nao sugere desconto e o Publicar dava erro); com frete
 * gratis fica ligado, com as faixas que o rascunho ja tinha ou as 4 do padrao; kit nunca (`atacadoPermitido`).
 */
export function rascunhoDaVariante(rascunho, variante) {
  const freteGratis = comFreteGratis(variante);
  const comAtacado = freteGratis && atacadoPermitido(rascunho);
  return {
    ...rascunho,
    tipoAnuncio: tipoDaVariante(variante),
    envio: { ...(rascunho?.envio ?? {}), freteGratis },
    atacado: comAtacado ? (rascunho?.atacado?.ligado ? rascunho.atacado : ATACADO_PADRAO()) : ATACADO_DESLIGADO(),
  };
}

// Sobe ao proximo preco "fechado", terminado em 0 centavo (5,83 -> 5,90; 5,80 fica): nunca abaixo do pedido. Pedido do dono
// em 11/11/2026 ("sempre deixar numero fechado, 5,90, 5,80, nao 5,83"); ate ali era terminado em 9 (72,99).
const paraCimaFechado = (valor) => precoFechado(valor);

/**
 * O menor preco fechado (terminado em ,X0) que deixa o `lucro` pedido numa variante, dadas `taxas(preco)` ->
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
    return paraCimaFechado((pedido + custo + Number(tarifaFixa ?? 0) + Number((await frete(referencia, fg)) ?? 0)) / parte);
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
export function variantesDoProduto({ precoVenda, anuncios, naConta: todosNaConta = [] }) {
  // Kit basta (pedido do dono em 09/11/2026: "Sim, kit basta"): o produto com kit ativo no Rise (`codigo` != `sku`) ou na conta
  // (`kit`) nao pede o anuncio de 1 unidade; o "Faltam" fica vazio. O kit nunca vira variante existente nem puxa a faixa.
  const naConta = (todosNaConta ?? []).filter((anuncio) => anuncio && !anuncio.kit);
  const temKit =
    (anuncios ?? []).some((anuncio) => anuncio && String(anuncio.codigo ?? "") !== String(anuncio.sku ?? "") && anuncio.situacaoCanal !== "ENCERRADA") ||
    (todosNaConta ?? []).some((anuncio) => anuncio?.kit && anuncio.status !== "closed");
  // A faixa pelo MAIOR entre o preco da loja e o dos Classicos do produto que ja existem (no Rise ou na conta): o preco no ML
  // passa do da loja, e o Premium e "a partir de R$ 150 no ML" (08/11/2026).
  const doProduto = (anuncios ?? []).filter((anuncio) => anuncio && String(anuncio.codigo ?? "") === String(anuncio.sku ?? "") && anuncio.situacaoCanal !== "ENCERRADA");
  const precosDosClassicos = [...doProduto, ...naConta]
    .filter((anuncio) => anuncio && anuncio.tipoAnuncio !== "gold_pro" && anuncio.status !== "closed")
    .map((anuncio) => Number(anuncio.preco))
    .filter((preco) => preco > 0);
  const esperadas = variantesEsperadas(Math.max(Number(precoVenda) || 0, ...precosDosClassicos) || precoVenda);
  const existentes = [];
  for (const anuncio of anuncios ?? []) {
    if (!anuncio || anuncio.situacaoCanal === "ENCERRADA") continue;
    if (String(anuncio.codigo ?? "") !== String(anuncio.sku ?? "")) continue;
    const variante = varianteDoRascunho({ tipoAnuncio: anuncio.tipoAnuncio, envio: { freteGratis: anuncio.freteGratis }, preco: anuncio.preco });
    if (!existentes.includes(variante)) existentes.push(variante);
  }
  for (const anuncio of naConta) {
    if (anuncio.status === "closed") continue;
    const variante = varianteDoRascunho({ tipoAnuncio: anuncio.tipoAnuncio, envio: { freteGratis: anuncio.freteGratis }, preco: anuncio.preco });
    if (!existentes.includes(variante)) existentes.push(variante);
  }
  return { esperadas, existentes, faltam: temKit ? [] : esperadas.filter((variante) => !existentes.includes(variante)) };
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

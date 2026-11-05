/**
 * Dados fiscais do anuncio no Mercado Livre (pedido do dono em 05/11/2026: "todos os produtos devem nascer ja com dados
 * fiscais. A 4hobby e Simples Nacional"; e logo depois: so os anuncios que o Rise publicou sao ajustados, pelo que esta
 * no Rise; os antigos de fora do Rise nao sao mexidos). O faturador do ML so emite a
 * NF-e da venda quando o SKU do anuncio tem dados fiscais (o app mostra "Anuncio sem dados fiscais" e o pacote nao sai).
 *
 * Regras puras, sem banco e sem rede (o teste e a tela importam): monta o corpo de `POST /items/fiscal_information` a
 * partir do produto do Rise e diz o que falta. O envio fica em `fiscalNoML.js`.
 *
 * Formato medido na conta em 05/11/2026 (o 940502, que o dono cadastrou a mao no ML): `type` "single", `register_type`
 * "final", `tax_information` com ncm, cest, csosn "102", origin_type, origin_detail, ean e os pesos em kg. Documentacao:
 * developers.mercadolivre.com.br/pt_br/envio-dos-dados-fiscais (lida no mesmo dia).
 */

import { ehEanInternoDoRise } from "@/lib/eanInterno";

/**
 * CSOSN da loja: 102 = "tributada pelo Simples Nacional sem permissao de credito", o caso da revenda ao consumidor final.
 * E o que o dono usa nos anuncios cadastrados a mao (medido no 940502). Uma constante, e nao um campo do produto, porque e
 * do regime da EMPRESA: se a 4hobby sair do Simples, o ML passa a pedir `tax_rule_id` no lugar e isto muda inteiro.
 */
export const CSOSN_DA_LOJA = "102";

const digitos = (valor) => String(valor ?? "").replace(/\D/g, "");

/**
 * O tipo de origem do ML a partir da origem da NF-e (0 a 8) e do tipo de producao do Rise. O ML aceita tres valores:
 * manufacturer (fabricacao propria), imported (importacao direta: a loja e a importadora) e reseller (comprou no Brasil,
 * nacional ou estrangeiro). O detalhe da origem (`origin_detail`) leva o digito da NF-e como esta.
 */
export function tipoDeOrigemML({ origem, tipoProducao }) {
  if (tipoProducao === "FABRICACAO_PROPRIA") return "manufacturer";
  return [1, 6].includes(Number(origem)) ? "imported" : "reseller";
}

/** O que falta no produto para o ML aceitar os dados fiscais. Lista vazia = pode enviar. */
export function problemasFiscais(produto) {
  const problemas = [];
  const rotulo = produto?.sku ? `O produto ${produto.sku}` : "O produto";
  if (digitos(produto?.ncm).length !== 8) problemas.push(`${rotulo} está sem NCM válido (8 dígitos) na aba Tributação.`);
  const origem = produto?.origem;
  if (origem === null || origem === undefined || origem === "" || !(Number.isInteger(Number(origem)) && Number(origem) >= 0 && Number(origem) <= 8)) {
    problemas.push(`${rotulo} está sem a origem da mercadoria na aba Tributação.`);
  }
  const cest = digitos(produto?.cest);
  if (cest && cest.length !== 7) problemas.push(`${rotulo} tem CEST com ${cest.length} dígitos (o CEST tem 7).`);
  return problemas;
}

const numero = (valor) => {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * O corpo do SKU de um produto simples. O titulo e o que sai como descricao do item na nota (o nome do produto). O EAN
 * interno do Rise (prefixo 2) NAO vai: nao e GTIN da GS1, e a NF-e com codigo de barras inventado e recusada; sem ele a
 * nota sai "SEM GTIN", que e o certo. O custo e opcional para o ML, e vai quando o Rise tem.
 */
export function corpoFiscalSimples(produto) {
  const ean = digitos(produto.ean);
  const peso = numero(produto.pesoKg);
  const custo = numero(produto.custo);
  return {
    sku: String(produto.sku).trim(),
    title: String(produto.tituloBase ?? "").trim().slice(0, 120),
    type: "single",
    measurement_unit: "UN",
    ...(custo ? { cost: Math.round(custo * 100) / 100 } : {}),
    register_type: "final",
    tax_information: {
      ncm: digitos(produto.ncm),
      origin_type: tipoDeOrigemML(produto),
      origin_detail: String(Number(produto.origem)),
      csosn: CSOSN_DA_LOJA,
      ...(digitos(produto.cest) ? { cest: digitos(produto.cest) } : {}),
      ...([8, 12, 13, 14].includes(ean.length) && !ehEanInternoDoRise(ean) ? { ean } : {}),
      ...(peso ? { net_weight: peso, gross_weight: peso } : {}),
    },
  };
}

/**
 * A parte de cada peca no valor do kit, em % inteiros que somam 100 (o ML pede `percentage_share` para dividir o valor
 * da venda entre os itens da nota). Proporcional ao custo x quantidade; sem custo, ao preco de venda; sem os dois, a
 * quantidade. O resto do arredondamento vai para as pecas de maior parte; nenhuma fica com 0.
 */
export function partilhaDoKit(pecas) {
  const peso = (peca, campo) => (numero(peca.produto?.[campo]) ?? 0) * Number(peca.quantidade);
  const campo = pecas.every((peca) => peso(peca, "custo") > 0) ? "custo" : pecas.every((peca) => peso(peca, "precoVenda") > 0) ? "precoVenda" : null;
  const pesos = pecas.map((peca) => (campo ? peso(peca, campo) : Number(peca.quantidade) || 1));
  const total = pesos.reduce((soma, valor) => soma + valor, 0);
  const partes = pesos.map((valor) => Math.max(1, Math.floor((valor / total) * 100)));
  let sobra = 100 - partes.reduce((soma, valor) => soma + valor, 0);
  const ordem = partes.map((_, indice) => indice).sort((a, b) => pesos[b] - pesos[a]);
  // Mais de 100 pecas nao cabe (cada uma fica com 1%): o laco pararia sem ter onde tirar.
  for (let i = 0, voltas = 0; sobra !== 0 && voltas < 10000; i = (i + 1) % ordem.length, voltas += 1) {
    const indice = ordem[i];
    if (sobra > 0) {
      partes[indice] += 1;
      sobra -= 1;
    } else if (partes[indice] > 1) {
      partes[indice] -= 1;
      sobra += 1;
    }
  }
  return partes;
}

/**
 * O corpo do SKU de um kit (`type` "bundle"): as pecas com o SKU, a quantidade e a parte de cada uma. O ML exige que o SKU
 * de cada peca ja tenha os dados fiscais dele (erro 10086 "Sku not found"), por isso o envio garante as pecas antes.
 * O kit do ML com "Kit de N" do mesmo produto vira um bundle de uma peca so, com quantidade N e 100%.
 */
export function corpoFiscalDoKit({ sku, titulo, pecas }) {
  const partes = partilhaDoKit(pecas);
  return {
    sku: String(sku).trim(),
    title: String(titulo ?? "").trim().slice(0, 120),
    type: "bundle",
    register_type: "final",
    bundle: pecas.map((peca, indice) => ({ sku: String(peca.produto.sku).trim(), quantity: Number(peca.quantidade), percentage_share: partes[indice] })),
  };
}

/**
 * O plano fiscal de um anuncio: o SKU do anuncio e, no kit, os SKUs das pecas que precisam existir antes. Devolve
 * `{ ok, sku, corpos, problemas }`, com `corpos` na ordem de envio (pecas primeiro, o do anuncio por ultimo).
 *
 * @param {{ sku: string, titulo?: string, produto?: object, pecas?: Array<{ produto: object, quantidade: number }> }} alvo
 *   `produto` para o anuncio simples; `pecas` (e `titulo`) para o kit.
 */
export function planoFiscal(alvo) {
  const sku = String(alvo?.sku ?? "").trim();
  if (!sku) return { ok: false, sku, corpos: [], problemas: ["O anúncio está sem código (SKU): o Mercado Livre liga os dados fiscais pelo SKU."] };
  if (!alvo.pecas) {
    const problemas = problemasFiscais({ ...alvo.produto, sku });
    return problemas.length ? { ok: false, sku, corpos: [], problemas } : { ok: true, sku, corpos: [corpoFiscalSimples({ ...alvo.produto, sku })], problemas: [] };
  }
  const pecas = alvo.pecas.filter((peca) => peca?.produto && Number(peca.quantidade) > 0);
  if (pecas.length === 0) return { ok: false, sku, corpos: [], problemas: [`O kit ${sku} está sem peças.`] };
  const problemas = [];
  const vistos = new Set();
  for (const peca of pecas) {
    if (peca.produto.tipo === "COMPOSICAO") problemas.push(`A peça ${peca.produto.sku} do kit ${sku} também é kit: o Mercado Livre não aceita kit dentro de kit.`);
    if (vistos.has(peca.produto.sku)) problemas.push(`A peça ${peca.produto.sku} aparece duas vezes no kit ${sku}.`);
    vistos.add(peca.produto.sku);
    problemas.push(...problemasFiscais(peca.produto));
  }
  // O bundle se apontaria a si mesmo.
  if (vistos.has(sku)) problemas.push(`O kit ${sku} tem o próprio código entre as peças.`);
  if (problemas.length) return { ok: false, sku, corpos: [], problemas: [...new Set(problemas)] };
  return {
    ok: true,
    sku,
    corpos: [...pecas.map((peca) => corpoFiscalSimples(peca.produto)), corpoFiscalDoKit({ sku, titulo: alvo.titulo, pecas })],
    problemas: [],
  };
}

/**
 * Vazio no Rise nao apaga no ML (a regra da LI): o CEST e o EAN que o dono preencheu a mao no ML ficam quando o produto do
 * Rise nao os tem (medido em 05/11/2026: quase todo SKU antigo tem CEST no ML e nenhum no Rise). O PUT leva o corpo
 * inteiro, e sem isto apagaria os dois.
 */
export function mesclarComML(noML, corpo) {
  if (!noML || corpo.type !== "single") return corpo;
  const antigo = noML.tax_information ?? {};
  const novo = { ...corpo.tax_information };
  for (const campo of ["cest", "ean"]) {
    if (!novo[campo] && String(antigo[campo] ?? "").trim()) novo[campo] = String(antigo[campo]).trim();
  }
  return { ...corpo, tax_information: novo };
}

/**
 * Se o que o ML guarda ja diz o mesmo que o Rise mandaria. Compara so o que muda a nota (NCM, CEST, CSOSN, origem, EAN, o
 * tipo e as pecas do kit): titulo, custo, unidade e peso diferentes nao reescrevem o SKU (o 940502 veio do ML com "UNID").
 */
export function fiscalIgual(noML, corpo) {
  if (!noML || noML.type !== corpo.type) return false;
  if (corpo.type === "bundle") {
    const chave = (lista) => JSON.stringify((lista ?? []).map((p) => [String(p.sku), Number(p.quantity), Number(p.percentage_share)]).sort());
    return chave(noML.bundle) === chave(corpo.bundle);
  }
  const a = noML.tax_information ?? {};
  const b = corpo.tax_information;
  const igual = (campo) => String(a[campo] ?? "").trim() === String(b[campo] ?? "").trim();
  return ["ncm", "cest", "csosn", "origin_type", "origin_detail", "ean"].every(igual);
}

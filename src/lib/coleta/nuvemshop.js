/**
 * Variantes de uma pagina de produto da Nuvemshop (Tiendanube).
 *
 * A pagina entrega o produto inteiro como UM item no JSON-LD (o da primeira
 * variante, sem nenhuma opcao escolhida) e o resto num JS: `LS.variants`, uma
 * linha por variante com codigo, opcoes, preco, preco a vista no pix e saldo.
 * Medido na Oceantech em 09/10/2026 com o "Fuso com Castanha SFU 2005" (24
 * tamanhos, de 250 a 2200 mm):
 *
 * - o JSON-LD trazia sku 1156 (a variante de 250 mm), preco 297 (o RISCADO dela;
 *   ela e vendida a 267) e inventoryLevel 178 (a SOMA do saldo dos 24 tamanhos);
 * - `LS.variants` traz o que cada tamanho tem de verdade: codigo, preco, pix e
 *   saldo proprios.
 *
 * Cada variante com codigo proprio e um produto para quem compra, e para a Rise
 * tambem: o dono decidiu (09/10/2026) que cada tamanho e um produto, com o
 * tamanho no nome.
 *
 * Sem imports: o teste e o normalizador leem o mesmo arquivo.
 */

/** Acha o fim do array que comeca em `inicio` (um "["), respeitando as strings do JSON. */
function fimDoArray(texto, inicio) {
  let profundidade = 0;
  let dentroDeTexto = false;

  for (let posicao = inicio; posicao < texto.length; posicao++) {
    const letra = texto[posicao];

    if (dentroDeTexto) {
      if (letra === "\\") posicao++;
      else if (letra === '"') dentroDeTexto = false;
      continue;
    }

    if (letra === '"') dentroDeTexto = true;
    else if (letra === "[") profundidade++;
    else if (letra === "]" && --profundidade === 0) return posicao + 1;
  }

  return -1;
}

/** "R$1.253,65" -> 1253.65. Texto sem numero vira null (nunca zero). */
function valorEmReais(texto) {
  if (typeof texto !== "string") return null;
  const limpo = texto.replace(/[^\d,]/g, "").replace(",", ".");
  const numero = Number(limpo);
  return limpo !== "" && Number.isFinite(numero) && numero > 0 ? numero : null;
}

function numeroPositivo(valor) {
  const numero = typeof valor === "string" ? Number(valor) : valor;
  return typeof numero === "number" && Number.isFinite(numero) && numero > 0 ? numero : null;
}

/**
 * Nomes das opcoes ("Medidas"), na ordem de option0, option1, option2.
 * Vem do bloco `options: [{ name: "Medidas", ... }]` da primeira variante.
 */
function nomesDasOpcoes(html) {
  const bloco = /\boptions:\s*\[((?:\s*\{\s*name:\s*"[^"]*"[^}]*\},?)+)\s*\]/.exec(html);
  if (!bloco) return [];
  return [...bloco[1].matchAll(/name:\s*"([^"]*)"/g)].map((achado) => achado[1].trim());
}

/**
 * Variantes da pagina, ou lista vazia quando a pagina nao e da Nuvemshop (ou nao
 * tem o JS). Cada item:
 *
 *   id, codigo (sku, ou null),
 *   opcoes: [{ nome, valor }] (so as preenchidas),
 *   preco (o que a loja cobra), riscado (o "de", ou null),
 *   aVista (preco no pix, ou null), quantidade (numero, ou null se a loja nao
 *   controla o saldo), disponivel (boolean).
 */
export function variantesDaNuvemshop(html) {
  if (typeof html !== "string") return [];

  const marca = "LS.variants = ";
  const inicioDaMarca = html.indexOf(marca);
  if (inicioDaMarca === -1) return [];

  const inicio = inicioDaMarca + marca.length;
  if (html[inicio] !== "[") return [];

  const fim = fimDoArray(html, inicio);
  if (fim === -1) return [];

  let cruas;
  try {
    cruas = JSON.parse(html.slice(inicio, fim));
  } catch {
    return [];
  }
  if (!Array.isArray(cruas)) return [];

  const nomes = nomesDasOpcoes(html);
  const variantes = [];

  for (const crua of cruas) {
    if (!crua || typeof crua !== "object") continue;

    const preco = numeroPositivo(crua.price_number);
    // Variante sem preco (sob consulta) nao tem o que comparar.
    if (preco === null) continue;

    const riscado = numeroPositivo(crua.compare_at_price_number);
    const aVista = valorEmReais(crua.price_with_payment_discount_short);
    const codigo = typeof crua.sku === "string" && crua.sku.trim() ? crua.sku.trim() : null;

    const opcoes = [crua.option0, crua.option1, crua.option2]
      .map((valor, posicao) => ({
        nome: nomes[posicao] || null,
        valor: typeof valor === "string" ? valor.trim() : "",
      }))
      .filter((opcao) => opcao.valor);

    variantes.push({
      id: crua.id ?? null,
      codigo,
      opcoes,
      preco,
      // O riscado so conta quando e maior que o preco cobrado.
      riscado: riscado !== null && riscado > preco ? riscado : null,
      aVista: aVista !== null && aVista < preco ? aVista : null,
      // Saldo null = a loja nao controla o estoque desta variante (nao e zero).
      quantidade: typeof crua.stock === "number" && crua.stock >= 0 ? crua.stock : null,
      disponivel: crua.available !== false && crua.stock !== 0,
    });
  }

  return variantes;
}

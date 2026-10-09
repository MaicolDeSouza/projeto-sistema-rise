/**
 * Categoria do concorrente como CAMINHO COMPLETO: "Impressão 3D > Partes".
 *
 * Decisao do dono em 09/10/2026: guardar a categoria inteira do site, e nao so um
 * nivel. Ate ali cada leitor ficava com o ULTIMO degrau da trilha (Usinainfo,
 * RoboCore, Eletrus) ou com o PRIMEIRO (o dataLayer, que so tem `item_category`):
 * a Makerhero saia "Impressão 3D" e a Oceantech "ELETRÔNICA", e um fuso e uma fonte
 * chaveada caiam na mesma categoria.
 *
 * Toda trilha passa por `caminhoDeCategoria`, entao todas as lojas saem no mesmo
 * formato. Sem imports: os leitores de plataforma e o normalizador usam o mesmo.
 */

export const SEPARADOR_DE_CATEGORIA = " > ";

/**
 * Degrau que so diz "comeco do site": nao e categoria. "Produtos" so sai do COMECO da
 * trilha (a Unitel: "Home > Produtos > Transformadores"); no meio, fica.
 */
const RAIZ = /^(in[ií]cio|home|p[aá]gina inicial|loja|shop|produtos|todos os produtos)$/i;

const chave = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Junta os degraus de uma trilha num caminho.
 *
 * Tira a raiz do comeco ("Inicio", "Home", "Loja") e o PROPRIO produto do fim
 * (quando o ultimo degrau e o nome dele, ou o comeco dele, com 12 letras ou mais:
 * nome de categoria e curto). Degrau repetido em seguida vira um so.
 *
 * @param {string[]} degraus
 * @param {string|null} nomeDoProduto
 * @returns {string|null}
 */
export function caminhoDeCategoria(degraus, nomeDoProduto = null) {
  const limpos = (Array.isArray(degraus) ? degraus : [])
    .map((degrau) => (typeof degrau === "string" ? degrau.replace(/\s+/g, " ").trim() : ""))
    .filter(Boolean);

  while (limpos.length && RAIZ.test(limpos[0])) limpos.shift();

  const produto = chave(nomeDoProduto);
  const ultimo = chave(limpos.at(-1));
  if (produto && ultimo && (ultimo === produto || (ultimo.length >= 12 && produto.startsWith(ultimo)))) {
    limpos.pop();
  }

  const semRepetir = limpos.filter((degrau, posicao) => posicao === 0 || chave(degrau) !== chave(limpos[posicao - 1]));
  return semRepetir.length ? semRepetir.join(SEPARADOR_DE_CATEGORIA) : null;
}

/** Nomes de uma BreadcrumbList do JSON-LD, na ordem de `position`. */
function nomesDaLista(lista) {
  const itens = Array.isArray(lista?.itemListElement) ? lista.itemListElement : [];
  return [...itens]
    .sort((a, b) => (Number(a?.position) || 0) - (Number(b?.position) || 0))
    .map((item) => item?.name ?? item?.item?.name ?? null)
    .filter((nome) => typeof nome === "string");
}

/** Toda BreadcrumbList do JSON-LD da pagina, solta, em @graph ou dentro de outro no. */
function trilhasDoJsonLd(html) {
  const trilhas = [];
  const visitar = (no, profundidade) => {
    if (!no || typeof no !== "object" || profundidade > 6) return;
    if (Array.isArray(no)) {
      for (const item of no) visitar(item, profundidade + 1);
      return;
    }
    const tipo = [].concat(no["@type"] ?? []);
    if (tipo.includes("BreadcrumbList")) {
      trilhas.push(nomesDaLista(no));
      return;
    }
    for (const valor of Object.values(no)) {
      if (valor && typeof valor === "object") visitar(valor, profundidade + 1);
    }
  };

  for (const bloco of String(html ?? "").matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      visitar(JSON.parse(bloco[1]), 0);
    } catch {
      // bloco de JSON-LD quebrado: as outras fontes de categoria continuam valendo.
    }
  }
  return trilhas;
}

/**
 * Caminho da categoria pelo breadcrumb do JSON-LD.
 *
 * Fica com a trilha MAIS LONGA: a Makerhero publica duas, uma generica do tema
 * ("Inicio > Loja > produto") e a de verdade ("Inicio > Impressão 3D > Partes >
 * produto").
 */
export function caminhoDoJsonLd(html, nomeDoProduto = null) {
  let melhor = null;
  for (const trilha of trilhasDoJsonLd(html)) {
    const caminho = caminhoDeCategoria(trilha, nomeDoProduto);
    if (!caminho) continue;
    const niveis = caminho.split(SEPARADOR_DE_CATEGORIA).length;
    if (!melhor || niveis > melhor.niveis) melhor = { caminho, niveis };
  }
  return melhor?.caminho ?? null;
}

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

import { normalizar } from "@/lib/texto";

/**
 * BUSCA AMPLA (pedido do dono em 09/10/2026): com o botao ligado, a busca do Scraper e a de Produtos procuram
 * tambem na descricao, na ficha tecnica, na categoria e no SEO, e nao so no nome e nos codigos.
 *
 * COMO FICA RAPIDA: cada tabela tem um INDICE DE TRIGRAMAS sobre uma EXPRESSAO (a "formula" abaixo), criado na
 * migration 20261009_busca_ampla. O banco monta e mantem o indice sozinho em toda gravacao (varredura, cadastro,
 * Bling...), e nao ha coluna nova nem preenchimento a rodar. Em troca, a busca precisa repetir a expressao
 * EXATAMENTE como esta no indice, senao o Postgres le a tabela inteira (1,4 s na descricao, medido em
 * 09/10/2026, contra 10 ms com indice). Por isso o texto mora numa constante so, e o teste confere que a
 * migration usa o mesmo.
 *
 * A expressao imita o `normalizar` (minusculas e sem acento) com funcoes IMUTAVEIS, que e o que um indice
 * aceita: `lower` e `translate` (o `unaccent` nao e imutavel, e `concat` tambem nao; por isso o `||`).
 */

/// Acentos que o `translate` troca, na ordem das letras sem acento de `SEM_ACENTO`.
const COM_ACENTO = "áàâãäåéèêëíìîïóòôõöúùûüçñýÿ";
const SEM_ACENTO = "aaaaaaeeeeiiiiooooouuuucnyy";

/// Junta as colunas com espaco, cada uma podendo ser nula.
const juntar = (partes) => partes.map((parte) => `coalesce(${parte}, '')`).join(" || ' ' || ");
const semAcento = (texto) => `translate(lower(${texto}), '${COM_ACENTO}', '${SEM_ACENTO}')`;

/// Produto COLETADO: o `buscaTexto` (nome, marca, modelo, codigo, MPN, EAN, ja normalizado na gravacao) mais o
/// texto da loja. A ficha entra so pelos nomes e valores (o `::text` do JSON inteiro traria as chaves "nome" e
/// "valor", e buscar "valor" acharia o acervo todo).
export const EXPRESSAO_AMPLA_COLETADO = semAcento(
  juntar([
    `"buscaTexto"`,
    `"categoria"`,
    `"descricao"`,
    `jsonb_path_query_array("especificacoes", '$[*].nome')::text`,
    `jsonb_path_query_array("especificacoes", '$[*].valor')::text`,
    `"seo"->>'title'`,
    `"seo"->>'description'`,
    `"seo"->>'keywords'`,
  ]),
);

/// Produto do RISE, busca normal: o que a lista sempre procurou (nome e codigo) mais marca, modelo e EAN.
export const EXPRESSAO_BUSCA_PRODUTO = semAcento(juntar([`"tituloBase"`, `"sku"`, `"marca"`, `"modelo"`, `"ean"`]));

/// Produto do RISE, busca ampla: a normal mais descricao, NCM, homologacao e localizacao.
export const EXPRESSAO_AMPLA_PRODUTO = semAcento(
  juntar([`"tituloBase"`, `"sku"`, `"marca"`, `"modelo"`, `"ean"`, `"descricaoBase"`, `"ncm"`, `"numeroHomologacao"`, `"localizacao"`]),
);

/** As palavras da busca, normalizadas como o texto indexado. Todas sao exigidas. */
export function palavrasDaBusca(busca) {
  return normalizar(busca ?? "").split(/\s+/).filter(Boolean);
}

/** `expressao LIKE '%palavra%'` para cada palavra, ligadas por AND (o indice atende cada uma). */
export function todasAsPalavras(expressao, palavras) {
  return Prisma.join(
    palavras.map((palavra) => Prisma.sql`${Prisma.raw(expressao)} LIKE ${`%${palavra}%`}`),
    " AND ",
  );
}

/**
 * ONDE a busca ampla achou o produto, para o selo da linha: as palavras que NAO estao no nome vem de que parte?
 * `nome` e o texto da busca normal; `lugares` e uma lista `[rotulo, texto]` na ordem de preferencia. Devolve os
 * rotulos sem repetir (vazio = achado pelo nome, sem selo).
 *
 * @param {string} nome
 * @param {[string, string|null][]} lugares
 * @param {string[]} palavras ja normalizadas
 */
export function ondeAchou(nome, lugares, palavras) {
  const doNome = normalizar(nome);
  const textos = lugares.map(([rotulo, texto]) => [rotulo, normalizar(texto)]);
  const achados = [];
  for (const palavra of palavras) {
    if (doNome.includes(palavra)) continue;
    const lugar = textos.find(([, texto]) => texto.includes(palavra));
    if (lugar && !achados.includes(lugar[0])) achados.push(lugar[0]);
  }
  return achados;
}

/**
 * Os ids dos produtos do RISE que tem TODAS as palavras, pelo indice (normal ou amplo). `null` = busca sem
 * palavras, sem restricao. A lista de Produtos pagina e ordena com o Prisma por cima destes ids.
 */
export async function idsDaBuscaDeProdutos(busca, { ampla = false } = {}) {
  const palavras = palavrasDaBusca(busca);
  if (palavras.length === 0) return null;
  const expressao = ampla ? EXPRESSAO_AMPLA_PRODUTO : EXPRESSAO_BUSCA_PRODUTO;
  const linhas = await prisma.$queryRaw`SELECT id FROM "Produto" WHERE ${todasAsPalavras(expressao, palavras)}`;
  return linhas.map((linha) => linha.id);
}

/** O selo da linha de Produtos na busca ampla: onde estao as palavras que nao estao no nome nem no codigo. */
export function ondeAchouNoProduto(produto, palavras) {
  return ondeAchou(
    [produto.tituloBase, produto.sku, produto.marca, produto.modelo, produto.ean].filter(Boolean).join(" "),
    [
      ["descrição", produto.descricaoBase],
      ["NCM", produto.ncm],
      ["homologação", produto.numeroHomologacao],
      ["localização", produto.localizacao],
    ],
    palavras,
  );
}

/** A frase do selo: ["descrição", "SEO"] -> "achado na descrição e no SEO". Lista vazia -> null (sem selo). */
export function textoDoSelo(lugares) {
  if (!Array.isArray(lugares) || lugares.length === 0) return null;
  const comArtigo = lugares.map((lugar) => (["SEO", "NCM"].includes(lugar) ? `no ${lugar}` : `na ${lugar}`));
  const juntos = comArtigo.length === 1 ? comArtigo[0] : `${comArtigo.slice(0, -1).join(", ")} e ${comArtigo.at(-1)}`;
  return `achado ${juntos}`;
}

/** O texto da ficha tecnica (lista de `{nome, valor}`) para o `ondeAchou`. */
export function textoDaFicha(especificacoes) {
  return (Array.isArray(especificacoes) ? especificacoes : [])
    .map((item) => `${item?.nome ?? ""} ${item?.valor ?? ""}`)
    .join(" ");
}

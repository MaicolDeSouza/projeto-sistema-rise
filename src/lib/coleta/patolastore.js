import { buscarPagina } from "./buscar";
import { especificacoesDaDescricao } from "./normalizar";
import { comoTexto } from "./texto-html";

/**
 * Junta o orcamento em PDF da Patola (preco de custo) com a Patolastore (foto, descricao e ficha), 20/10/2026.
 *
 * O orcamento tem o codigo do fabricante ("PB-108 TE") e o preco; a Patolastore e a loja da propria Patola e guarda, por
 * produto, a REFERENCIA do fabricante (`productReference`, "PB-108 TE"). O casamento e por essa referencia, na busca
 * publica da VTEX (sem credencial, pelo `buscarPagina`: robots.txt e ritmo valem). Quem nao casa fica como veio do PDF.
 *
 * Casamento: a referencia igual (sem caixa e sem espacos a mais) vale como esta; a do site com o sufixo " PT" a mais
 * ("PB-108" no PDF, "PB-108 PT" no site) so vale quando nao ha referencia igual, e a origem diz que foi aproximado.
 */

const ORIGEM = "https://www.patolastore.com.br";

const normalizar = (texto) => String(texto ?? "").toUpperCase().replace(/\s+/g, " ").trim();

/**
 * Escolhe, na lista que a busca devolveu, o produto cuja referencia casa com o codigo do PDF.
 *
 * @returns {{ produto: object, aproximado: boolean } | null}
 */
export function escolherPorReferencia(lista, codigo) {
  const alvo = normalizar(codigo);
  const referenciasDe = (produto) =>
    [produto.productReference, produto.productReferenceCode, ...(produto.items ?? []).flatMap((item) => (item.referenceId ?? []).map((ref) => ref.Value))]
      .filter(Boolean)
      .map(normalizar);

  const igual = lista.find((produto) => referenciasDe(produto).includes(alvo));
  if (igual) return { produto: igual, aproximado: false };

  const comPt = lista.find((produto) => referenciasDe(produto).includes(`${alvo} PT`));
  return comPt ? { produto: comPt, aproximado: true } : null;
}

/** As especificacoes cadastradas na VTEX (`allSpecifications`: nome da especificacao -> valores no proprio produto). */
function especificacoesDaLoja(produto) {
  const saida = [];
  for (const nome of produto.allSpecifications ?? []) {
    const valor = Array.isArray(produto[nome]) ? produto[nome].map((item) => comoTexto(item)).filter(Boolean).join(", ") : "";
    if (valor) saida.push({ nome: String(nome).charAt(0) + String(nome).slice(1).toLowerCase(), valor });
  }
  return saida;
}

/** Os campos do produto da Patolastore que entram no produto do fornecedor. Pura. */
export function dadosDoProdutoDaPatolastore(produto) {
  const item = produto.items?.[0] ?? {};
  const imagens = [];
  const vistas = new Set();
  for (const imagem of item.images ?? []) {
    // A versao grande da mesma foto: /arquivos/ids/<id>/nome -> /arquivos/ids/<id>-1000-1000/nome
    const grande = String(imagem.imageUrl ?? "").replace(/\/ids\/(\d+)\//, "/ids/$1-1000-1000/").replace(/^http:\/\//i, "https://");
    const id = /\/ids\/(\d+)/.exec(grande)?.[1] ?? grande;
    if (!grande || vistas.has(id)) continue;
    vistas.add(id);
    imagens.push(grande);
  }

  const caminho = (produto.categories ?? [])[0];
  const categoria = caminho
    ? caminho.split("/").map((parte) => parte.trim()).filter(Boolean).join(" > ")
    : null;

  const html = produto.description ?? "";
  return {
    nome: comoTexto(produto.productName),
    descricao: comoTexto(html),
    especificacoes: especificacoesDaDescricao(html, especificacoesDaLoja(produto)),
    imagens,
    categoria,
    url: typeof produto.link === "string" && /^https?:\/\//i.test(produto.link) ? produto.link : null,
    ean: String(item.ean ?? "").replace(/\D/g, "") || null,
    marca: comoTexto(produto.brand),
  };
}

/** Busca o produto pela referencia na VTEX da Patolastore. @returns {Promise<{produto, aproximado}|null>} */
export async function buscarPorReferencia(codigo, { buscar = buscarPagina, sinal = null } = {}) {
  const resposta = await buscar(`${ORIGEM}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(codigo)}&_from=0&_to=9`, { sinal });
  if (!resposta.ok || !resposta.corpo) throw new Error(resposta.erro ?? `HTTP ${resposta.status ?? "?"}`);
  let lista;
  try {
    lista = JSON.parse(resposta.corpo);
  } catch {
    throw new Error("a busca não respondeu em JSON");
  }
  return Array.isArray(lista) ? escolherPorReferencia(lista, codigo) : null;
}

/**
 * Completa cada item do orcamento (os `brutos` do leitor de arquivo) com o que a Patolastore publica. Falha da loja e aviso,
 * nunca erro: o orcamento vale sozinho.
 *
 * @returns {Promise<{ casados: number, avisos: string[] }>}
 */
export async function juntarComAPatolastore(brutos, { buscar = buscarPagina, sinal = null } = {}) {
  const avisos = [];
  const semCasamento = [];
  const aproximados = [];
  let casados = 0;

  for (const bruto of brutos) {
    sinal?.throwIfAborted();
    let achado;
    try {
      achado = await buscarPorReferencia(bruto.sku, { buscar, sinal });
    } catch (erro) {
      if (sinal?.aborted) throw erro;
      avisos.push(`Patolastore não consultada para ${bruto.sku}: ${erro?.message ?? erro}`);
      continue;
    }
    if (!achado) {
      semCasamento.push(bruto.sku);
      continue;
    }

    const dados = dadosDoProdutoDaPatolastore(achado.produto);
    casados++;
    if (achado.aproximado) aproximados.push(`${bruto.sku} = ${achado.produto.productReference}`);

    if (dados.nome) bruto.desc = dados.nome;
    if (dados.descricao) bruto.info = dados.descricao;
    if (dados.imagens.length > 0) bruto.imagens = dados.imagens;
    if (dados.especificacoes.length > 0) bruto.especificacoes = dados.especificacoes;
    if (dados.categoria) bruto.categoria = dados.categoria;
    if (dados.url) bruto.urlDoFornecedor = dados.url;
    if (dados.ean) bruto.ean = dados.ean;
    if (dados.marca) bruto.marca = dados.marca;
  }

  if (semCasamento.length > 0) avisos.push(`Sem produto na Patolastore com esta referência (ficam só com os dados do orçamento): ${semCasamento.join(", ")}.`);
  if (aproximados.length > 0) avisos.push(`Casados pela referência com o sufixo PT (confira): ${aproximados.join("; ")}.`);
  return { casados, avisos };
}

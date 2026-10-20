import { buscarPagina } from "./buscar";
import { ehCaminhoIgnorado, parametroRuim } from "./descobrir";

/**
 * Leitura da LISTAGEM de uma categoria (20/10/2026).
 *
 * O operador cola o endereco da categoria como a abre no navegador ("loja.com.br/gabinetes") e a fonte varre so os
 * produtos dela. A pagina da categoria lista os produtos; a paginacao leva ao resto. Aqui ela serve so para DESCOBRIR os
 * enderecos: os dados de cada produto continuam sendo lidos na pagina dele, como em toda loja. Passa por `buscarPagina`:
 * robots.txt e ritmo do dominio valem.
 *
 * Nao ha como saber, sem entender cada plataforma, qual link da pagina e de produto: o menu, o rodape e os "mais
 * vendidos" estao ali tambem. O que separa o card da listagem do resto e o PRECO ao lado do link ("R$ 25,90"), e o que
 * separa o link de produto da pagina de categoria e a pagina de produto ter dados de produto — por isso o link achado
 * aqui e so CANDIDATO, e quem decide e a leitura da pagina (a mesma de sempre). Menu com banner de preco pode trazer
 * alguns candidatos a mais; custam uma visita cada e saem sem virar produto.
 */

/** Teto de paginas de uma categoria: acima disso e armadilha (paginacao infinita), nao vitrine. */
const MAXIMO_DE_PAGINAS = 100;
/** Quantos links logo antes de cada preco contam como "o link deste card" (so o mais proximo: mais que isso puxa o menu no primeiro card). */
const LINKS_POR_PRECO = 1;
/** Quanto do HTML antes do preco ainda e o mesmo card. */
const JANELA_DO_CARD = 2500;

const PRECO = /R(?:\$|&#0*36;)\s*(?:&nbsp;|&#160;|\s)*\d/gi;
const NOMES_DA_PAGINA = ["p", "page", "pg", "pagina", "paged"];

function absoluto(href, base) {
  try {
    const endereco = new URL(href, base);
    endereco.hash = "";
    return endereco;
  } catch {
    return null;
  }
}

/** O caminho sem o trecho de paginacao: "/gabinetes/page/3" e "/gabinetes". */
function caminhoSemPagina(caminho) {
  const limpo = caminho.replace(/\/(?:page|pagina|p)\/\d+\/?$/i, "");
  return limpo.length > 1 ? limpo.replace(/\/+$/, "") : limpo;
}

/** 2 para "?page=2", "/page/2" ou "?pg=2"; null quando o endereco nao e de paginacao. */
export function numeroDaPagina(url) {
  let endereco;
  try {
    endereco = new URL(url);
  } catch {
    return null;
  }
  for (const nome of NOMES_DA_PAGINA) {
    const valor = endereco.searchParams.get(nome);
    if (valor !== null) return /^\d+$/.test(valor) ? Number(valor) : null;
  }
  const noCaminho = /\/(?:page|pagina|p)\/(\d+)\/?$/i.exec(endereco.pathname);
  return noCaminho ? Number(noCaminho[1]) : null;
}

/**
 * O endereco esta DENTRO da categoria? Mesma origem e o caminho comeca pelo da categoria (a propria pagina, as paginas
 * dela e as subcategorias). E o que impede a navegacao de sair da categoria quando a listagem nao rendeu produto.
 */
export function dentroDaCategoria(raiz, url) {
  try {
    const base = new URL(raiz);
    const alvo = new URL(url);
    if (alvo.origin !== base.origin) return false;
    const caminhoBase = caminhoSemPagina(base.pathname);
    const caminhoAlvo = caminhoSemPagina(alvo.pathname);
    return caminhoAlvo === caminhoBase || caminhoAlvo.startsWith(`${caminhoBase.replace(/\/$/, "")}/`);
  } catch {
    return false;
  }
}

/** Todos os `<a href>` da pagina, com a posicao no HTML. */
function ancoras(html, base) {
  const lista = [];
  for (const encontro of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"'#][^"']*)["'][^>]*>/gi)) {
    const endereco = absoluto(encontro[1].replace(/&amp;/g, "&"), base);
    if (!endereco || !/^https?:$/.test(endereco.protocol)) continue;
    const fim = html.indexOf("</a>", encontro.index);
    lista.push({
      indice: encontro.index,
      url: endereco.toString(),
      endereco,
      dentro: fim === -1 ? "" : html.slice(encontro.index, Math.min(fim, encontro.index + 4000)),
    });
  }
  return lista;
}

/** Enderecos de produto declarados em JSON-LD (`ItemList`): quando a loja os publica, e a fonte mais certa. */
function itensDoJsonLd(html, base) {
  const achados = [];
  for (const bloco of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let dados;
    try {
      dados = JSON.parse(bloco[1].trim());
    } catch {
      continue;
    }
    const pilha = [dados];
    while (pilha.length) {
      const atual = pilha.pop();
      if (Array.isArray(atual)) {
        pilha.push(...atual);
      } else if (atual && typeof atual === "object") {
        if (Array.isArray(atual.itemListElement)) {
          for (const item of atual.itemListElement) {
            const alvo = item?.url ?? item?.item?.url ?? item?.item?.["@id"] ?? (typeof item?.item === "string" ? item.item : null);
            const endereco = typeof alvo === "string" ? absoluto(alvo, base) : null;
            if (endereco) achados.push(endereco.toString());
          }
        }
        for (const valor of Object.values(atual)) if (valor && typeof valor === "object") pilha.push(valor);
      }
    }
  }
  return achados;
}

/**
 * O bloco MAIOR de candidatos: os cards da listagem ficam juntos no HTML, e carrossel de "mais vendidos" ou de relacionados
 * e outro bloco, mais longe e com menos itens (Kalatec /guia-linear trouxe produtos de outras categorias). Divide onde o
 * vazio entre dois candidatos passa de 5x o vazio tipico e fica com o maior; se o maior nao for pelo menos o dobro do
 * segundo (nao da para dizer qual e a listagem), fica tudo. Pura.
 */
export function doMaiorBloco(candidatos) {
  if (candidatos.length < 4) return candidatos;
  const ordenados = [...candidatos].sort((a, b) => a.indice - b.indice);
  const vazios = ordenados.slice(1).map((item, i) => item.indice - ordenados[i].indice).sort((a, b) => a - b);
  const tipico = Math.max(vazios[Math.floor(vazios.length / 2)], 1);

  const blocos = [[ordenados[0]]];
  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i].indice - ordenados[i - 1].indice > tipico * 5) blocos.push([]);
    blocos[blocos.length - 1].push(ordenados[i]);
  }
  if (blocos.length === 1) return candidatos;

  const porTamanho = [...blocos].sort((a, b) => b.length - a.length);
  if (porTamanho[0].length < porTamanho[1].length * 2) return candidatos;
  return porTamanho[0];
}

/**
 * Carrossel de "mais vendidos" e relacionados tem preco e link como o card da categoria. Quando a loja poe a categoria no
 * caminho do produto (/guia-linear/produto-x), os que estao sob o caminho da pagina sao os da categoria e os outros saem;
 * quando nenhum esta, a loja nao faz isso e fica tudo.
 */
function soDaCategoria(enderecos, base) {
  try {
    const raiz = new URL(base).pathname.replace(/\/+$/, "");
    if (!raiz) return enderecos;
    const daCategoria = enderecos.filter((endereco) => new URL(endereco).pathname.startsWith(`${raiz}/`));
    return daCategoria.length > 0 ? daCategoria : enderecos;
  } catch {
    return enderecos;
  }
}

/**
 * Os enderecos candidatos a produto de UMA pagina de listagem, na ordem em que aparecem. Pura.
 *
 * 1) `ItemList` do JSON-LD, quando existe; 2) os links logo antes de cada preco; 3) sem nenhum preco na pagina (loja que
 * vende por orcamento), os links que envolvem uma imagem.
 */
export function produtosDaListagem(html, base) {
  const texto = String(html ?? "");
  const origem = absoluto(base, base)?.origin;
  if (!texto || !origem) return [];

  const elegivel = (endereco) =>
    endereco.origin === origem &&
    !parametroRuim(endereco.toString()) &&
    !ehCaminhoIgnorado(endereco.toString()) &&
    numeroDaPagina(endereco.toString()) === null &&
    endereco.pathname !== "/" &&
    // A propria listagem (e o link para ela mesma) nao e produto.
    endereco.toString().replace(/\/$/, "") !== String(base).split("#")[0].replace(/\/$/, "");

  const unicos = (enderecos) => {
    const vistos = new Set();
    const saida = [];
    for (const endereco of enderecos) {
      const chave = endereco.replace(/\/$/, "");
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push(endereco);
    }
    return saida;
  };

  const doJsonLd = itensDoJsonLd(texto, base).filter((endereco) => {
    const alvo = absoluto(endereco, base);
    return alvo && elegivel(alvo);
  });
  if (doJsonLd.length > 0) return unicos(doJsonLd);

  const links = ancoras(texto, base).filter((ancora) => elegivel(ancora.endereco));
  const candidatos = [];

  for (const preco of texto.matchAll(PRECO)) {
    const anteriores = links.filter((ancora) => ancora.indice < preco.index && preco.index - ancora.indice <= JANELA_DO_CARD);
    for (const ancora of anteriores.slice(-LINKS_POR_PRECO)) candidatos.push({ url: ancora.url, indice: ancora.indice });
  }

  if (candidatos.length > 0) return soDaCategoria(unicos(doMaiorBloco(candidatos).map((item) => item.url)), base);

  return unicos(links.filter((ancora) => /<img\b|data-src=|background-image/i.test(ancora.dentro)).map((ancora) => ancora.url));
}

/**
 * Os enderecos das PROXIMAS paginas da categoria, em ordem: `rel="next"` e os links com numero de pagina que ficam dentro
 * da categoria. Pura.
 */
export function paginasSeguintes(html, base, raiz) {
  const texto = String(html ?? "");
  const achadas = new Map();

  const adicionar = (endereco, numero) => {
    const chave = endereco.toString();
    if (!achadas.has(chave)) achadas.set(chave, numero ?? Number.MAX_SAFE_INTEGER);
  };

  for (const encontro of texto.matchAll(/<(?:link|a)\b[^>]*\brel\s*=\s*["']next["'][^>]*>/gi)) {
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(encontro[0])?.[1];
    const endereco = href ? absoluto(href.replace(/&amp;/g, "&"), base) : null;
    if (endereco && dentroDaCategoria(raiz, endereco.toString())) adicionar(endereco, numeroDaPagina(endereco.toString()));
  }

  for (const ancora of ancoras(texto, base)) {
    const numero = numeroDaPagina(ancora.url);
    if (numero === null || numero < 2 || numero > 500) continue;
    if (!dentroDaCategoria(raiz, ancora.url)) continue;
    // Pagina com ordenacao ou filtro e outra vitrine, nao a proxima pagina desta.
    const semPaginacao = new URL(ancora.url);
    for (const nome of NOMES_DA_PAGINA) semPaginacao.searchParams.delete(nome);
    if ([...semPaginacao.searchParams.keys()].some((nome) => parametroRuim(`https://x/?${nome}=1`))) continue;
    adicionar(ancora.endereco, numero);
  }

  return [...achadas.entries()].sort((a, b) => a[1] - b[1]).map(([endereco]) => endereco);
}

/**
 * Le a categoria: a pagina, as paginas seguintes e os candidatos a produto de cada uma.
 *
 * @param {object} entrada
 * @param {string} entrada.url      endereco da categoria
 * @param {number} [entrada.limite] quantos enderecos bastam (o teste pede poucos; a coleta pede tudo, com 0)
 * @returns {Promise<{ itens: {name: null, url: string}[], paginas: number, completa: boolean, erro: string|null }>}
 *   `completa`: a paginacao acabou (e nao foi o limite nem o teto que parou a leitura).
 */
export async function lerListagemDaCategoria({
  url,
  limite = 0,
  sinal = null,
  buscar = buscarPagina,
  maximoDePaginas = MAXIMO_DE_PAGINAS,
}) {
  const itens = [];
  const vistos = new Set();
  const visitadas = new Set([url]);
  const fila = [url];
  let paginas = 0;
  let completa = false;
  let raiz = url;

  while (fila.length > 0 && paginas < maximoDePaginas && !sinal?.aborted) {
    const atual = fila.shift();
    const resposta = await buscar(atual, { sinal });
    paginas++;

    if (!resposta.ok || !resposta.corpo) {
      if (paginas === 1) return { itens, paginas, completa: false, erro: resposta.erro ?? `HTTP ${resposta.status ?? "?"}` };
      break;
    }

    const base = resposta.urlFinal ?? atual;
    if (paginas === 1) raiz = base;

    let novos = 0;
    for (const endereco of produtosDaListagem(resposta.corpo, base)) {
      const chave = endereco.replace(/\/$/, "");
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      itens.push({ name: null, url: endereco });
      novos++;
    }

    if (limite > 0 && itens.length >= limite) break;
    // Pagina sem produto novo = fim da categoria (a ultima pagina costuma repetir a anterior, e a que nao existe, vazia).
    if (novos === 0) {
      completa = true;
      break;
    }

    for (const proxima of paginasSeguintes(resposta.corpo, base, raiz)) {
      if (visitadas.has(proxima)) continue;
      visitadas.add(proxima);
      fila.push(proxima);
    }
    if (fila.length === 0) completa = true;
  }

  return { itens, paginas, completa, erro: null };
}

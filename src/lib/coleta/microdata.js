/**
 * Extrator de Microdata (itemprop / itemscope).
 *
 * Terceiro formato de dados estruturados, ao lado de JSON-LD e OpenGraph, e o
 * que faltava para a primeira loja real testada: a Usinainfo nao publica
 * JSON-LD nenhum, mas marca a pagina inteira com itemprop — sku, mpn, brand,
 * availability, description e o breadcrumb da categoria. Sem ler Microdata,
 * um site inteiramente aproveitavel rendia so titulo e preco.
 *
 * E comum em PrestaShop e Magento antigos, entao vale para muito mais que uma
 * loja.
 *
 * A leitura e por expressao regular, sem DOM: o valor de um itemprop esta ou no
 * atributo `content` (o caso das meta/link) ou no texto do proprio elemento.
 */

import { comoNumero, comoTexto } from "./texto-html";

/// Elementos que se fecham sozinhos: procurar tag de fechamento deles acharia
/// o fechamento de outro elemento e traria texto que nao e o valor.
const SEM_FECHAMENTO = /^(meta|link|img|input|br|hr|area|base|col|embed|source|track|wbr)$/i;

/**
 * Valor de um itemprop a partir da posicao onde ele aparece.
 *
 * Devolve o `content` quando existe; senao, o texto do elemento, achando o
 * fechamento correspondente com contagem de aninhamento — parar na primeira
 * tag de fechamento pegaria so o comeco de uma descricao com <p> dentro.
 */
function valorNaPosicao(html, inicioTag) {
  const fimAbertura = html.indexOf(">", inicioTag);
  if (fimAbertura === -1) return null;

  const abertura = html.slice(inicioTag, fimAbertura + 1);

  const conteudo = /\scontent\s*=\s*["']([^"']*)["']/i.exec(abertura)?.[1];
  if (conteudo !== undefined) return comoTexto(conteudo);

  const tag = /^<\s*([a-z0-9]+)/i.exec(abertura)?.[1];

  // Onde cada elemento guarda o valor, segundo o proprio padrao Microdata: img
  // e source no src, a e link no href, time no datetime. Ler so `content` e o
  // texto interno perdia a galeria inteira do produto — <img itemprop="image">
  // nao tem nem um nem outro, e o resultado era sempre uma imagem so.
  if (/^(img|audio|video|source|embed|iframe|track)$/i.test(tag ?? "")) {
    return /\ssrc\s*=\s*["']([^"']*)["']/i.exec(abertura)?.[1] ?? null;
  }
  if (/^(a|area|link)$/i.test(tag ?? "")) {
    return /\shref\s*=\s*["']([^"']*)["']/i.exec(abertura)?.[1] ?? null;
  }
  if (/^time$/i.test(tag ?? "")) {
    return /\sdatetime\s*=\s*["']([^"']*)["']/i.exec(abertura)?.[1] ?? null;
  }

  if (!tag || SEM_FECHAMENTO.test(tag) || abertura.endsWith("/>")) return null;

  const aberturaRe = new RegExp(`<${tag}[\\s>]`, "gi");
  const fechamentoRe = new RegExp(`</${tag}\\s*>`, "gi");

  let profundidade = 1;
  let cursor = fimAbertura + 1;

  while (profundidade > 0 && cursor < html.length) {
    aberturaRe.lastIndex = cursor;
    fechamentoRe.lastIndex = cursor;

    const proximoFecha = fechamentoRe.exec(html);
    if (!proximoFecha) return null;

    const proximoAbre = aberturaRe.exec(html);

    if (proximoAbre && proximoAbre.index < proximoFecha.index) {
      profundidade++;
      cursor = proximoAbre.index + 1;
      continue;
    }

    profundidade--;
    if (profundidade === 0) {
      return comoTexto(html.slice(fimAbertura + 1, proximoFecha.index));
    }
    cursor = proximoFecha.index + 1;
  }

  return null;
}

/**
 * Tira o rotulo que veio junto com o valor.
 *
 * A loja marca o bloco inteiro com itemprop, rotulo incluso, e o texto sai como
 * "Marca:\nImpacto CNC". So se aplica a campo curto de identidade — numa
 * descricao, um "Atencao:" no primeiro paragrafo seria confundido com rotulo e
 * o paragrafo perderia o comeco.
 */
function semRotulo(valor) {
  if (!valor) return valor;

  const semPrefixo = valor.replace(/^[\p{L} ]{2,20}:\s*/u, "").trim();
  return semPrefixo || valor;
}

/**
 * Recorta o HTML no bloco do produto PRINCIPAL.
 *
 * Sem isso, a leitura pegava a pagina inteira — e pagina de produto costuma
 * trazer "quem viu isso viu tambem" com outros Product marcados do mesmo jeito.
 * Numa loja real havia cinco blocos schema.org/Product: o do item e quatro
 * relacionados. Resultado: quatro das cinco imagens coletadas eram de OUTROS
 * produtos, e o preco corria o risco de ser o do relacionado mais barato.
 *
 * O corte e no primeiro sinal de bloco vizinho — um `isRelatedTo` ou um segundo
 * itemtype=Product. Quando a pagina nao declara escopo alghum, devolve o HTML
 * inteiro: e o comportamento antigo, melhor que nao extrair nada.
 */
export function escopoDoProduto(html) {
  const principal = /itemtype\s*=\s*["'][^"']*schema\.org\/Product["']/i.exec(html);
  if (!principal) return html;

  // Comeca na abertura da tag que declara o escopo, nao no atributo.
  const abertura = html.lastIndexOf("<", principal.index);
  const inicio = abertura === -1 ? principal.index : abertura;

  // A procura pelo vizinho comeca depois da PROPRIA declaracao. Medindo a
  // partir da abertura da tag, o itemtype do produto principal caia dentro da
  // busca e casava consigo mesmo — o escopo virava um pedaco de tag, sem preco
  // e sem imagem nenhuma.
  const fimDaDeclaracao = principal.index + principal[0].length;
  const vizinho =
    /itemprop\s*=\s*["']isRelatedTo["']|itemtype\s*=\s*["'][^"']*schema\.org\/Product["']/i.exec(
      html.slice(fimDaDeclaracao),
    );

  return vizinho
    ? html.slice(inicio, fimDaDeclaracao + vizinho.index)
    : html.slice(inicio);
}

/**
 * Preco de tabela publicado em atributo `data-*`.
 *
 * Existe porque nem toda loja marca o preco cheio com itemprop: a Impacto CNC
 * poe no Microdata so o preco do pix (5% menor) e deixa o do cartao em
 * `data-sell-price`. Lendo so o itemprop, o desconto virava o preco normal e a
 * promocao sumia.
 *
 * SO ACEITA VALOR MAIOR que o preco ja marcado na pagina, e essa condicao e o
 * que torna a leitura segura. Atributo `data-price` tambem aparece em opcao de
 * frete e em brinde — noutra loja havia `data-price="0"`, `"2.09"` e `"4.85"`,
 * e sem o piso o frete de dois reais virava "preco promocional" de um produto
 * de dezenove. Preco de tabela nunca e menor que o preco vigente.
 */
function precoDeTabelaNosAtributos(html, precoMarcado) {
  if (!(precoMarcado > 0)) return [];

  const valores = [];

  for (const achado of html.matchAll(
    /data-(?:sell-|product-)?price\s*=\s*["']([\d.,]+)["']/gi,
  )) {
    const numero = comoNumero(achado[1]);
    if (numero !== null && numero > precoMarcado) valores.push(numero);
  }

  return valores;
}

/** Todas as ocorrencias de um itemprop, na ordem em que aparecem. */
function valoresDe(html, propriedade) {
  const padrao = new RegExp(`<[a-z0-9]+[^>]*\\sitemprop\\s*=\\s*["']${propriedade}["']`, "gi");
  const valores = [];

  let achado;
  while ((achado = padrao.exec(html)) !== null) {
    const valor = valorNaPosicao(html, achado.index);
    if (valor) valores.push(valor);
  }

  return valores;
}

/**
 * Categoria pela trilha do BreadcrumbList.
 *
 * Le SO os `name` que estao dentro de um `itemListElement`. Varrer todos os
 * itemprop="name" da pagina parecia equivalente e nao era: pegava tambem o nome
 * da loja e o nome do proprio produto, e a categoria saia como "Usinainfo".
 *
 * A ultima trilha e a categoria mais especifica — a que interessa. "Inicio" sai
 * porque nao diz nada.
 */
function nomesDaTrilha(html) {
  const trilha = [];
  const marcadores = /<[a-z0-9]+[^>]*\sitemprop\s*=\s*["']itemListElement["']/gi;

  let marcador;
  while ((marcador = marcadores.exec(html)) !== null) {
    // O primeiro name depois do marcador e o rotulo daquele degrau da trilha.
    const nome = /<[a-z0-9]+[^>]*\sitemprop\s*=\s*["']name["']/i.exec(
      html.slice(marcador.index, marcador.index + 2000),
    );
    if (!nome) continue;

    const valor = valorNaPosicao(html, marcador.index + nome.index);
    if (valor && valor.length < 60) trilha.push(valor);
  }

  return trilha;
}

function categoriaDoBreadcrumb(trilha) {
  const uteis = trilha.filter((valor) => !/^(in[ií]cio|home)$/i.test(valor));
  return uteis.length > 0 ? uteis[uteis.length - 1] : null;
}

/**
 * Le os dados de produto marcados com Microdata.
 *
 * Devolve `null` quando a pagina nao declara um schema.org/Product — sem essa
 * checagem, qualquer pagina com um itemprop solto (um breadcrumb, por exemplo)
 * seria tomada por produto.
 */
export function doMicrodata(htmlCompleto) {
  const temProduto = /itemtype\s*=\s*["'][^"']*schema\.org\/Product/i.test(htmlCompleto);
  const temOferta = /itemprop\s*=\s*["'](price|offers|availability)["']/i.test(htmlCompleto);
  if (!temProduto && !temOferta) return null;

  // Tudo abaixo le so o bloco do produto principal. A trilha e a excecao: o
  // breadcrumb fica fora do escopo do produto, no topo da pagina.
  const html = escopoDoProduto(htmlCompleto);

  const marcados = valoresDe(html, "price")
    .map(comoNumero)
    .filter((n) => n !== null);

  const precos = [
    ...marcados,
    ...precoDeTabelaNosAtributos(html, marcados.length ? Math.min(...marcados) : 0),
  ];

  const disponibilidade = valoresDe(html, "availability")[0] ?? null;

  // O nome do produto e o primeiro itemprop="name" que NAO seja degrau da
  // trilha. Sem excluir a trilha, o titulo do produto virava "Inicio": o
  // breadcrumb aparece antes no HTML, e "Inicio" tem mais de tres letras.
  const trilha = nomesDaTrilha(htmlCompleto);
  const daTrilha = new Set(trilha);
  const nome =
    valoresDe(html, "name").find((valor) => valor && valor.length > 3 && !daTrilha.has(valor)) ??
    null;

  return {
    fonte: "microdata",
    titulo: nome,
    descricao: valoresDe(html, "description")[0] ?? null,
    marca: semRotulo(valoresDe(html, "brand")[0]) ?? null,
    modelo: semRotulo(valoresDe(html, "model")[0]) ?? null,
    mpn: semRotulo(valoresDe(html, "mpn")[0]) ?? null,
    skuFonte: semRotulo(valoresDe(html, "sku")[0]) ?? null,
    ean:
      valoresDe(html, "gtin13")[0] ??
      valoresDe(html, "gtin")[0] ??
      valoresDe(html, "gtin14")[0] ??
      null,
    categoria: categoriaDoBreadcrumb(trilha),
    // Os precos ficam todos disponiveis: quem decide qual e o normal e qual e o
    // promocional e o normalizador, que ve tambem o que os outros formatos deram.
    // A pagina pode marcar varios precos (o do produto, o de um kit, o de um
    // relacionado). O menor e o que a loja esta cobrando de fato.
    preco: precos.length > 0 ? Math.min(...precos) : null,
    precos,
    disponibilidade,
    imagens: valoresDe(html, "image"),
  };
}

export const paraTeste = { valoresDe, nomesDaTrilha, categoriaDoBreadcrumb, escopoDoProduto };

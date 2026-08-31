import { extrairProduto } from "./extrair";
import { doMicrodata, escopoDoProduto } from "./microdata";
import {
  comoNumero,
  comoTexto,
  comoUrlAbsoluta,
  metaTags,
  situacaoDe,
} from "./texto-html";

/**
 * Normalizador: transforma o HTML de uma pagina no formato unico de produto de
 * mercado, venha ele de JSON-LD, Microdata ou OpenGraph.
 *
 * Os tres formatos sao COMBINADOS, nao escolhidos: a Usinainfo publica preco em
 * OpenGraph, codigo e marca em Microdata, e nenhum JSON-LD. Escolher um formato
 * so devolveria metade do que a pagina oferece.
 *
 * Campo que a pagina nao traz fica null, [] ou {} — nunca inventado. Um valor
 * chutado aqui viraria decisao de preco la na frente.
 */

/// Campos sem os quais a pagina nao conta como produto valido.
const ESSENCIAIS = ["name", "url", "preco"];

/**
 * Marca do produto que a loja publica SEM codigo.
 *
 * O codigo e a chave de acesso ao produto do concorrente, entao um registro
 * sem ele nao se encaixa na estrutura. Marcar e decisao do dono, e e a unica
 * excecao a regra de nunca inventar valor — por isso a origem sempre diz que
 * foi marcacao nossa, e nao leitura da pagina.
 */
const SEM_CODIGO = "N/A";


/**
 * Tira do rol as imagens repetidas.
 *
 * Nao basta comparar a URL inteira: a loja publica a MESMA foto em varios
 * tamanhos, com enderecos tipo `/1019423-large_default/foto.jpg` e
 * `/1019423-thickbox_default/foto.jpg`. Contadas como duas, a previa diria seis
 * imagens onde ha cinco fotos, e o operador acharia que o site tem mais material
 * do que tem. O numero na pasta identifica a foto; o sufixo e so o tamanho.
 *
 * A primeira ocorrencia vence, porque a ordem ja traz a principal na frente.
 */
/**
 * Partes do caminho, sem o segmento de dimensao.
 *
 * ".../800x800/468/produto/123/foto.jpg" e ".../64x50/468/produto/123/foto.jpg"
 * descrevem o mesmo arquivo servido em tamanhos diferentes. Lanca quando o
 * endereco nao e URL valida; quem chama decide o que fazer.
 */
/**
 * Nome do arquivo sem o sufixo de tamanho.
 *
 * Ha loja que codifica o tamanho no NOME, e nao no caminho: a RoboCore serve a
 * mesma foto como "1180_1_H.png", "1180_1_X.png", "1180_1_S.png" e
 * "1180_1_L.png". O filtro de segmento nao alcanca isso, e tres fotos viravam
 * dez na contagem da tela.
 */
function semSufixoDeTamanho(arquivo) {
  return typeof arquivo === "string"
    ? arquivo.replace(/_[A-Z](\.[A-Za-z0-9]+)$/, "$1")
    : arquivo;
}

function partesSemDimensao(endereco) {
  return new URL(endereco).pathname
    .split("/")
    .filter(Boolean)
    .filter((parte) => !/^\d{2,4}x\d{2,4}$/.test(parte));
}

/**
 * Diretorio da foto: origem mais o caminho sem o nome do arquivo. E o que diz
 * de QUEM e a foto.
 *
 * Tem de ser o caminho inteiro, e nao so a ultima pasta: a RoboCore serve
 * ".../1180/images/1180_1_H.png", onde a ultima pasta e "images" — nome generico
 * que casava com o icone do WhatsApp, com o blank.gif e com a foto de OUTRO
 * produto. O caminho inteiro separa "/1180/images/" de "/908/images/".
 */
function diretorioDaImagem(endereco) {
  try {
    const partes = partesSemDimensao(endereco);
    partes.pop();
    return `${new URL(endereco).origin}/${partes.join("/")}`;
  } catch {
    return null;
  }
}

/// Onde mora o endereco grande, em ordem de preferencia. O `src` fica por
/// ultimo porque na galeria ele costuma ser a miniatura.
const ATRIBUTOS_DE_IMAGEM = [
  "data-largeimg",
  "data-zoom-image",
  "data-image-large",
  "data-src",
  "src",
];

/**
 * Galeria das lojas Tray, identificada pelo id do produto.
 *
 * A Tray serve o catalogo INTEIRO de um diretorio so
 * ("/img/img_prod/<loja>/"), entao o filtro por diretorio nao separa nada: de
 * la vinham dezesseis imagens, tres delas de outros alicates. O que separa e o
 * NOME do arquivo, que comeca pelo id do produto: "69_0_...", "69_1_...".
 *
 * Isto so e possivel porque o dataLayer ja nos deu o idProduct — sem ele
 * restaria adivinhar, e adivinhar aqui traz foto de produto errado, que ninguem
 * percebe olhando a tela.
 *
 * "180_600_0_<timestamp>" e a MESMA foto redimensionada, e nao casa com o
 * prefixo: fica de fora, e a versao boa ja veio pelas estruturadas.
 */
function galeriaDaTray(html, tray, urlBase) {
  const id = tray?.idProduct;
  if (!id) return [];

  // Tres convencoes de nome na MESMA loja, todas medidas em produtos reais:
  //   "73_5_<data>"                      — id abre o nome
  //   "71_variacao_3_0_<data>"           — id abre, e a foto e de variacao
  //   "modulo_..._ky_019_73_1_<hash>"    — id vem depois do slug
  //
  // Por isso duas formas: o id no INICIO cobre as duas primeiras, e o id
  // entre sublinhados seguido de numero cobre a terceira. Exigir digito logo
  // apos o id deixava as quatro fotos de "variacao" de fora.
  //
  // A segunda forma pede numero depois do id de proposito: um hash como
  // "..._71ff6f9c..." nao pode ser confundido com o produto 71.
  const doProduto = new RegExp(`^${id}_|_${id}_\\d+_`);

  const achadas = [];

  for (const [tag] of html.matchAll(/<img[^>]+>/gi)) {
    for (const atributo of ATRIBUTOS_DE_IMAGEM) {
      const valor = new RegExp(`\\b${atributo}=["']([^"']+)["']`, "i").exec(tag)?.[1];
      if (!valor) continue;

      const absoluta = comoUrlAbsoluta(valor, urlBase);
      if (!absoluta) continue;

      const arquivo = new URL(absoluta).pathname.split("/").pop() ?? "";
      if (doProduto.test(arquivo)) achadas.push(absoluta);
    }
  }

  return achadas;
}

/// Acima disto nao e galeria de um produto. O maior caso legitimo medido tem
/// cinco fotos (Usinainfo); o dobro disso ja e sinal de diretorio compartilhado.
const TETO_DE_GALERIA = 10;

/**
 * Fotos que a pagina MOSTRA mas nao declara em formato estruturado.
 *
 * A loja publica so a principal em itemprop/og:image; as demais ficam em <img>
 * comum, com o endereco grande num atributo. No Eletrogate, produto com duas
 * fotos aparecia com uma.
 *
 * Recebe a pagina INTEIRA de proposito. Recortar no bloco do produto foi
 * tentado e medido: no Eletrogate a galeria fica FORA do escopo do itemtype, e
 * o recorte custava a segunda foto; na Tray os relacionados ficam DENTRO dele,
 * e o recorte nao resolvia. O filtro util e o diretorio, nao o recorte.
 */
function galeriaDaPagina(html, principal, urlBase) {
  if (!principal) return [];

  const alvo = diretorioDaImagem(principal);
  if (!alvo) return [];

  const candidatas = [];
  const diretorios = new Set();

  for (const [tag] of html.matchAll(/<img[^>]+>/gi)) {
    for (const atributo of ATRIBUTOS_DE_IMAGEM) {
      const valor = new RegExp(`\\b${atributo}=["']([^"']+)["']`, "i").exec(tag)?.[1];
      if (!valor) continue;

      const absoluta = comoUrlAbsoluta(valor, urlBase);
      if (!absoluta) continue;

      const diretorio = diretorioDaImagem(absoluta);
      if (!diretorio) continue;

      diretorios.add(diretorio);
      if (diretorio === alvo) candidatas.push(absoluta);
    }
  }

  // O diretorio so serve de filtro se ele DISTINGUIR. Numa loja que sirva tudo
  // de um diretorio so, aceitar as candidatas traria foto de outro produto —
  // erro pior que faltar foto, porque some da vista: a imagem existe, so nao e
  // do item.
  if (diretorios.size < 2) return [];

  // Galeria de produto e pequena. Passando disso, o diretorio nao e do produto:
  // e balde compartilhado da loja. A Tray serve o catalogo inteiro de
  // "/img/img_prod/<loja>/", e de la vinham dezesseis imagens — duas do produto,
  // tres de outros e o resto banner de categoria.
  //
  // Descartar tudo, e nao aparar a lista, porque nao ha como saber QUAIS das
  // dezesseis eram do produto. Sem galeria, a pagina fica com as imagens
  // estruturadas, que e o comportamento de antes desta funcao existir.
  if (candidatas.length > TETO_DE_GALERIA) return [];

  return candidatas;
}

function semRepetir(urls) {
  const porIdentidade = new Map();

  /** Area declarada no endereco (".../800x800/foto.jpg"), para escolher a maior. */
  const area = (endereco) => {
    const medida = /\/(\d{2,4})x(\d{2,4})\//.exec(endereco);
    return medida ? Number(medida[1]) * Number(medida[2]) : 0;
  };

  for (const endereco of urls) {
    let identidade = endereco;

    try {
      // Segmento de dimensao fica de fora da identidade: a mesma foto aparece
      // em ".../600x450/..." e ".../800x800/...". Mantendo-o, uma foto so era
      // contada duas vezes.
      const partes = partesSemDimensao(endereco);

      const arquivo = semSufixoDeTamanho(partes.at(-1));
      const pasta = partes.at(-2) ?? "";
      const numero = /^(\d+)-/.exec(pasta)?.[1];

      // O numero na pasta identifica a foto no PrestaShop, onde o nome do
      // arquivo se repete entre fotos do mesmo produto.
      identidade =
        numero && arquivo
          ? `${numero}/${arquivo}`
          : [...partes.slice(0, -1), arquivo].join("/");
    } catch {
      // Endereco estranho fica com a URL inteira como identidade: na duvida,
      // manter a imagem e melhor que descartar uma que era diferente.
    }

    const anterior = porIdentidade.get(identidade);
    if (!anterior || area(endereco) > area(anterior)) {
      porIdentidade.set(identidade, endereco);
    }
  }

  return [...porIdentidade.values()];
}

/**
 * Escolhe a descricao entre as fontes disponiveis: vence a MAIS LONGA.
 *
 * Nao e ordem de preferencia por formato, e de proposito. O og:description e um
 * resumo de SEO de uns 155 caracteres — a Usinainfo publica 138 ali e 2946 no
 * itemprop="description" da pagina. Preferindo por formato, o resumo ganhava e
 * a descricao completa era descartada, o que so aparecia quando alguem comparava
 * com o site. Todas as fontes descrevem o mesmo produto, entao a mais completa
 * e sempre a melhor.
 */
function melhorDescricao(candidatas) {
  const limpas = candidatas.filter((texto) => typeof texto === "string" && texto.trim());
  if (limpas.length === 0) return null;

  return limparDescricao(limpas.sort((a, b) => b.length - a.length)[0]);
}

/**
 * Tira do inicio da descricao os rotulos das abas.
 *
 * A loja costuma montar "Descricao / Aplicacoes / Avaliacoes" como abas dentro
 * do mesmo bloco, e o texto delas vem junto. Sao linhas curtas, sem pontuacao
 * de frase, antes do primeiro paragrafo de verdade — e so essas saem.
 */
function limparDescricao(texto) {
  const linhas = texto.split("\n");

  let inicio = 0;
  while (inicio < linhas.length) {
    const linha = linhas[inicio].trim();
    if (linha && (linha.length > 30 || /[.:;!?]$/.test(linha))) break;
    inicio++;
  }

  // Se tudo pareceu rotulo, a leitura esta errada: devolve o texto inteiro em
  // vez de entregar vazio.
  const restante = linhas.slice(inicio).join("\n").trim();
  return restante || texto.trim();
}

/**
 * Especificacoes escritas como lista dentro da descricao.
 *
 * Muita loja nao usa tabela nem additionalProperty: escreve "ESPECIFICACOES:" e
 * depois "- Tensao de trabalho: 4.5V ~ 5.5V;". Sem ler isso, a ficha tecnica
 * some justamente nos sites que a publicam com mais detalhe.
 *
 * Devolve LISTA ORDENADA, nao objeto: a ficha tem linhas sem rotulo ("Tecnologia
 * ultra silenciosa (Stealth Chop2)"), que objeto nenhum comporta sem inventar
 * uma chave. Nessas,  fica null e a ordem da pagina e preservada.
 */
function especificacoesDeLista(texto) {
  if (!texto) return [];

  const linhas = texto.split("\n").map((linha) => linha.trim());

  // Titulo de secao: linha curta que anuncia um bloco. Vale em CAIXA ALTA
  // ("ESPECIFICACOES:") ou terminada em dois-pontos ("Especificacoes:").
  //
  // Exigir caixa alta, como era antes, fazia a ficha inteira ser ignorada nas
  // lojas que escrevem o titulo em caixa normal — e a maioria escreve.
  const ehTitulo = (linha) =>
    linha.length > 2 &&
    linha.length < 45 &&
    (/:\s*$/.test(linha) ||
      (linha === linha.toUpperCase() && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(linha)));

  const inicio = linhas.findIndex(
    (linha) => ehTitulo(linha) && /especifica|ficha t[eé]cnica|dados t[eé]cnicos/i.test(linha),
  );

  // Sem secao de especificacoes, nao ha o que ler. Varrer o texto inteiro atras
  // de "rotulo: valor" parecia mais generoso e nao era: numa pagina real isso
  // trouxe vinte itens, dos quais doze eram frases de marketing da aba de
  // aplicacoes ("Custo baixo: boa solucao quando..."). Ficha tecnica com
  // propaganda dentro e pior que ficha tecnica vazia.
  if (inicio === -1) return [];

  // Paragrafo: linha longa ou com muitas palavras. E o que separa a ficha
  // tecnica do texto corrido que vem depois dela — no caso da Usinainfo, o
  // aviso de que o conteudo foi gerado por IA, e so entao a aba de aplicacoes
  // com frases de marketing em forma de "rotulo: valor".
  const ehParagrafo = (linha) =>
    linha.length > 120 || linha.split(/\s+/).length >= 12;

  const itens = [];
  let seguidasSemPar = 0;
  let houveBranco = false;

  for (const linhaBruta of linhas.slice(inicio + 1)) {
    if (!linhaBruta) {
      houveBranco = true;
      continue;
    }
    if (ehTitulo(linhaBruta)) break;

    // Marcador de lista dito pelo site. Guardado ANTES de ser removido, porque
    // e ele que distingue "mais um item da ficha" de "comecou outro assunto".
    const temMarcador = /^\s*[-•*]\s/.test(linhaBruta);

    const linha = linhaBruta.replace(/^[\s\-•*]+/, "").replace(/[;.]\s*$/, "").trim();
    const separador = linha.indexOf(":");

    const rotulo = separador > 1 ? linha.slice(0, separador).trim() : null;
    const valor = separador > 1 ? linha.slice(separador + 1).trim() : null;

    // O rotulo pode ter ponto: "Carga max." e abreviacao, nao fim de frase.
    // Quem separa rotulo de frase e o tamanho, nao a pontuacao.
    const ehPar =
      rotulo &&
      valor &&
      separador <= 40 &&
      valor.length <= 120 &&
      rotulo.split(/\s+/).length <= 6;

    // Ser par vem ANTES de julgar se e paragrafo. Ao contrario, uma
    // especificacao comprida — "Tensao de operacao: 3,3V (Pino 3.3) / 5 - 6V
    // (USB ou pino 5V)" tem quinze palavras — era tomada por texto corrido e
    // encerrava a leitura no meio da ficha.
    if (ehPar) {
      seguidasSemPar = 0;
      houveBranco = false;
      itens.push({ nome: rotulo, valor });
      continue;
    }

    // Nao e par: agora sim, paragrafo encerra a ficha.
    if (ehParagrafo(linhaBruta)) break;

    // Linha que nao e par vinda DEPOIS de uma linha em branco: a ficha acabou.
    //
    // E o sinal mais confiavel que existe aqui. O que vem depois de um espaco em
    // branco costuma ser outro assunto — um aviso, um subtitulo, o comeco do
    // marketing. Depender do tamanho do paragrafo nao bastava: um aviso curto
    // passava batido.
    //
    // MENOS quando a linha traz marcador de lista. A regra nasceu de lojas cujos
    // itens vem grudados, mas a Tray poe cada item no seu proprio paragrafo, e
    // ali havia um branco entre TODOS — a ficha inteira era descartada no
    // primeiro item. Marcador e o site dizendo "isto ainda e lista"; texto de
    // marketing nao comeca com hifen.
    if (houveBranco && !temMarcador) break;

    // Linha sem rotulo TAMBEM e especificacao — "Tecnologia ultra silenciosa
    // (Stealth Chop2)" descreve o produto tanto quanto "Faixa de tensao: 4.75V".
    // Guardar so os pares descartava cinco das seis linhas de uma ficha real, e
    // com o antigo minimo de dois pares a ficha inteira sumia por causa disso.
    // Sem rotulo, `nome` fica null em vez de receber um nome inventado.
    itens.push({ nome: null, valor: linha });

    if (++seguidasSemPar >= 6) break;
  }

  return itens;
}

/**
 * Le o dataLayer de analytics (GA4 / ecommerce).
 *
 * Quarta fonte de dados, ao lado de JSON-LD, Microdata e OpenGraph. Toda loja
 * que mede conversao publica `item_id`, `item_sku`, `item_name` e
 * `item_category` num objeto de script — e e onde a CATEGORIA aparece nas lojas
 * que nao marcam breadcrumb com Microdata. A Impacto CNC e uma delas: o site
 * mostra "Eletronicos > Drivers de Motor de Passo" na tela, mas so o dataLayer
 * diz isso de forma legivel.
 *
 * O par sku/categoria e casado com o codigo ja extraido porque a pagina empurra
 * um objeto por produto, incluindo os relacionados — pegar o primeiro daria a
 * categoria de outro item.
 */
/**
 * Desfaz os escapes JSON de um texto lido por regex.
 *
 * O dataLayer e JSON, mas nos o lemos com expressao regular — entao "\u00f4"
 * chega cru, e a tela mostrava "Componentes Eletr\u00f4nicos". Decodificar aqui,
 * onde se sabe que a origem e JSON: em comoTexto isso alcancaria texto de HTML,
 * onde essa sequencia nao e escape nenhum e deve ficar como esta.
 */
function semEscapeJson(texto) {
  return typeof texto === "string"
    ? texto.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      )
    : texto;
}

function doDataLayer(html, codigo) {
  const pares = [];

  const padrao =
    /item_sku["']?\s*:\s*["']([^"']*)["'][\s\S]{0,400}?item_category["']?\s*:\s*["']([^"']+)["']/gi;

  let achado;
  while ((achado = padrao.exec(html)) !== null) {
    pares.push({ sku: achado[1], categoria: comoTexto(semEscapeJson(achado[2])) });
  }

  if (pares.length === 0) {
    const solta = /item_category["']?\s*:\s*["']([^"']+)["']/i.exec(html)?.[1];
    return solta ? comoTexto(semEscapeJson(solta)) : null;
  }

  const doProduto = codigo ? pares.find((par) => par.sku === codigo) : null;
  return (doProduto ?? pares[0]).categoria;
}

/**
 * Quantidade em estoque anunciada no texto da pagina.
 *
 * Nenhuma das lojas testadas declara `inventoryLevel` no Microdata, mas escreve
 * "Estoque: 45 unidades" na tela e repete o numero numa classe
 * (`estoque-qtd-45`). Sem ler isso, a quantidade ficava "nao informada" mesmo
 * com o site dizendo quantas pecas tem.
 *
 * Le so dentro do bloco do produto: a mesma marcacao aparece nos relacionados.
 */
function quantidadeNoTexto(html) {
  const padroes = [
    /estoque[-_]?qtd[-_]?(\d{1,6})\b/i,
    /qtde?[-_]?estoque[^>]*>\s*(\d{1,6})/i,
    /estoque\s*:?\s*(?:<[^>]*>\s*)*(\d{1,6})\s*(?:<[^>]*>\s*)*unidade/i,
    /(\d{1,6})\s*unidades?\s*(?:em|no)\s*estoque/i,
  ];

  for (const padrao of padroes) {
    const achado = padrao.exec(html)?.[1];
    if (achado !== undefined) {
      const numero = Number(achado);
      if (Number.isFinite(numero)) return numero;
    }
  }

  return null;
}

/**
 * Acha na ficha tecnica um campo cujo rotulo case com o padrao.
 *
 * Marca e modelo quase nunca vem em dados estruturados nas lojas menores, mas
 * aparecem na ficha tecnica escrita a mao ("Modelo: ESP32C3 Super Mini"). Ler
 * dali recupera dois campos que ficariam vazios.
 *
 * Busca so nas especificacoes JA DELIMITADAS, nunca no HTML solto: procurar
 * "Marca" na pagina inteira trouxe "marcar como Enabled, ela ira nos p..." de
 * um texto de tutorial.
 */
function daFichaTecnica(especificacoes, padrao) {
  for (const item of especificacoes ?? []) {
    if (item?.nome && padrao.test(item.nome.trim())) return item.valor;
  }
  return null;
}

/**
 * Dados de SEO da pagina do concorrente.
 *
 * Nao descrevem o produto: descrevem como a loja tenta ser achada. Sao o titulo
 * e o resumo que ela escolheu para o buscador, e valem justamente por isso —
 * mostram os termos pelos quais o concorrente disputa a busca.
 */
function dadosDeSeo(html, meta, url) {
  const titulo = comoTexto(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]);
  const canonical = /<link[^>]+rel=["']canonical["'][^>]*>/i.exec(html)?.[0];

  return {
    title: titulo,
    description: comoTexto(meta.description ?? meta["og:description"]),
    keywords: comoTexto(meta.keywords),
    canonical: canonical
      ? comoUrlAbsoluta(/href=["']([^"']*)["']/i.exec(canonical)?.[1], url)
      : null,
  };
}

/**
 * NCM: oito digitos da Nomenclatura Comum do Mercosul.
 *
 * Guardado so com os digitos, porque a mesma classificacao aparece como
 * "8531.20.00" e "85312000" dependendo da loja — e duas grafias do mesmo codigo
 * nao poderiam ser comparadas entre si.
 */
function acharNcm(especificacoes, descricao) {
  const daFicha = daFichaTecnica(especificacoes, /^ncm$|nomenclatura/i);
  const bruto = daFicha ?? /\bNCM\b[^\d]{0,12}(\d{4}\.?\d{2}\.?\d{2})/i.exec(descricao ?? "")?.[1];
  if (!bruto) return null;

  const digitos = String(bruto).replace(/\D/g, "");
  return digitos.length === 8 ? digitos : null;
}

/** Especificacoes a partir de tabelas do HTML, quando nao ha dados estruturados. */
function especificacoesDeTabela(html) {
  const itens = [];

  for (const tabela of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    for (const linha of tabela[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
      const celulas = [...linha[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
        (celula) => comoTexto(celula[1]),
      );

      // So pares: tabela de tres colunas nao e ficha tecnica, e adivinhar qual
      // coluna e o valor produziria lixo.
      if (celulas.length === 2 && celulas[0] && celulas[1]) {
        itens.push({ nome: celulas[0].replace(/:$/, ""), valor: celulas[1] });
      }
    }
  }

  return itens;
}

/**
 * Recorta um literal JSON equilibrado a partir de uma posicao.
 *
 * Regex nao serve aqui: o objeto tem arrays dentro ("listSku":[], "priceSell-
 * Details":[{...}]), e um fecha-colchete nao-guloso corta no primeiro deles,
 * produzindo JSON invalido. Contar profundidade, ignorando o que esta dentro de
 * string, e o unico jeito de achar o fim de verdade.
 */
function recortarJson(texto, inicio) {
  let profundidade = 0;
  let emTexto = false;
  let escapado = false;

  for (let i = inicio; i < texto.length; i++) {
    const caractere = texto[i];

    if (emTexto) {
      if (escapado) escapado = false;
      else if (caractere === "\\") escapado = true;
      else if (caractere === '"') emTexto = false;
      continue;
    }

    if (caractere === '"') emTexto = true;
    else if (caractere === "[" || caractere === "{") profundidade++;
    else if (caractere === "]" || caractere === "}") {
      profundidade--;
      if (profundidade === 0) return texto.slice(inicio, i + 1);
    }
  }

  return null;
}

/**
 * O objeto que a Tray publica no dataLayer.
 *
 * A Tray declara microdata so com o NOME — sem price, sem offers, sem sku —, e
 * a pagina reprovava por falta de preco mesmo trazendo nome e endereco. Mas ela
 * publica no dataLayer um objeto com codigo, marca, modelo, EAN, preco e valor
 * a vista, tudo de uma vez.
 *
 * Ler o JSON inteiro, e nao cada campo por regex, resolve de graca os escapes
 * (\u00f4) e o preco a vista, que na tela vem com os centavos quebrados em
 * <span> aninhados.
 *
 * Cada chave aparece UMA vez na pagina: e do produto principal, nunca dos
 * relacionados.
 */
function daTray(html) {
  const marca = /dataLayer\s*=\s*\[/.exec(html);
  if (!marca) return null;

  const bruto = recortarJson(html, marca.index + marca[0].length - 1);
  if (!bruto) return null;

  try {
    const lista = JSON.parse(bruto);
    return (
      (Array.isArray(lista) ? lista : [lista]).find(
        (item) => item?.reference || item?.idProduct,
      ) ?? null
    );
  } catch {
    // dataLayer que nao e JSON valido nao e da Tray. Seguir sem ele.
    return null;
  }
}

/**
 * Preco a vista da Tray.
 *
 * So conta quando e UMA parcela: com duas ou mais, o valor e o da parcela e nao
 * o do produto — registrar 12x de 24,69 como preco daria 24,69 num produto de
 * 296,28.
 */
function aVistaDaTray(tray) {
  const detalhe = tray?.priceSellDetails?.find(
    (parcela) => String(parcela?.["installment.months"]) === "1",
  );

  return comoNumero(detalhe?.["installment.amount"]);
}

/**
 * Descricao que a loja monta em HTML, fora de qualquer formato estruturado.
 *
 * Na Tray o og:description traz 160 caracteres de resumo de SEO e a descricao
 * de verdade — com a secao "Especificacoes:" dentro — mora num bloco de classe
 * "description". Como quem decide e melhorDescricao, pela MAIS LONGA, incluir
 * este bloco nao atropela loja nenhuma: so vence onde for realmente maior.
 */
function descricaoDoBloco(html) {
  const bloco =
    /<div[^>]*class=["'][^"']*\bdescription\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(
      html,
    );

  return bloco ? comoTexto(bloco[1]) : null;
}

/**
 * Decide preco normal e promocional.
 *
 * Nao existe um terceiro campo "vigente": quem usa decide (promocional quando
 * houver, senao normal). Guardar o vigente separado criaria um dado que pode
 * contradizer os outros dois.
 *
 * Quando a loja declara o preco de tabela (`original_price`, `listPrice`,
 * `highPrice`), ele manda. Sem declaracao, o maior dos precos encontrados e o
 * normal e o menor vira promocional — foi o que a Usinainfo exigiu: o
 * OpenGraph traz 28,60 (o de tabela) e o Microdata 27,17 (o a vista), e ler o
 * Microdata como preco normal esconderia a promocao.
 */
function decidirPrecos({ declaradoNormal, candidatos }) {
  const valores = [...new Set(candidatos.filter((n) => typeof n === "number" && n > 0))];

  if (valores.length === 0) {
    return { normal: declaradoNormal ?? null, promotional: null };
  }

  if (declaradoNormal && declaradoNormal > 0) {
    const menor = Math.min(...valores);
    return {
      normal: declaradoNormal,
      promotional: menor < declaradoNormal ? menor : null,
    };
  }

  const maior = Math.max(...valores);
  const menor = Math.min(...valores);

  return { normal: maior, promotional: menor < maior ? menor : null };
}

/**
 * Variacoes com identificador proprio viram produtos independentes.
 *
 * E a regra que a especificacao chama de fundamental: se a loja da codigos
 * diferentes para USB-C e Micro USB, sao dois produtos, com preco e estoque
 * proprios. Agrupa-los perderia justamente a informacao pela qual eles foram
 * separados na origem. Variacao SEM identificador proprio continua sendo
 * variacao, porque nao ha o que a distinga.
 */
/**
 * Separa um campo de codigo que traz mais de um.
 *
 * A Casa da Robotica publica reference="AF01 ou AF02": dois codigos num campo
 * so. Como o codigo e a chave de acesso ao produto do concorrente, um registro
 * com dois codigos dentro nao e alcancavel por NENHUM dos dois — quem procura
 * "AF01" nao acha "AF01 ou AF02".
 *
 * So separa em disjuncao EXPLICITA: a palavra "ou", virgula ou ponto-e-virgula.
 * Hifen, ponto e barra ficam de fora de proposito — "F30-004", "HK-502" e
 * "5V/3A" sao codigos inteiros, e quebra-los inventaria produtos inexistentes.
 */
function separarCodigos(codigo) {
  if (!codigo) return [];

  const partes = codigo
    .split(/\s+ou\s+|\s*[;,]\s*/i)
    .map((parte) => parte.trim())
    .filter(Boolean);

  if (partes.length < 2) return [codigo];

  // Um pedaco sem cara de codigo denuncia que o separador era parte do texto,
  // e nao uma lista. Manter inteiro erra menos que inventar dois produtos.
  const todosSaoCodigo = partes.every(
    (parte) => parte.length >= 2 && parte.length <= 30 && !/\s/.test(parte),
  );

  return todosSaoCodigo ? partes : [codigo];
}

function separarVariacoes(bruto) {
  const lista = [];
  const cru = bruto?.hasVariant ?? bruto?.isVariantOf?.hasVariant ?? null;
  const variantes = Array.isArray(cru) ? cru : cru ? [cru] : [];

  for (const variante of variantes) {
    if (!variante || typeof variante !== "object") continue;

    const identificador =
      comoTexto(variante.sku) ??
      comoTexto(variante.mpn) ??
      comoTexto(variante.gtin13 ?? variante.gtin) ??
      comoTexto(variante.productID);

    lista.push({
      identificador: identificador ?? null,
      nome: comoTexto(variante.name),
      bruto: variante,
    });
  }

  return lista;
}

/** Opcoes de variacao sem identificador proprio, so para exibir. */
function opcoesDeVariacao(bruto) {
  const grupos = [];
  const cru = bruto?.additionalProperty ?? [];
  const lista = Array.isArray(cru) ? cru : [cru];

  for (const item of lista) {
    if (item?.valueReference || Array.isArray(item?.value)) {
      const opcoes = (Array.isArray(item.value) ? item.value : [item.value])
        .map(comoTexto)
        .filter(Boolean);
      if (opcoes.length > 1) grupos.push({ name: comoTexto(item.name), options: opcoes });
    }
  }

  return grupos;
}

/**
 * Le uma pagina e devolve os produtos que ela representa.
 *
 * Devolve LISTA porque uma pagina pode conter mais de um produto: variacao com
 * codigo proprio e produto independente.
 *
 * `plataforma` vem de identificarPlataforma e viaja junto com o produto: sem
 * ela, dois registros com os mesmos campos vazios sao indistinguiveis, e nao ha
 * como responder depois se o preco faltou porque a loja nao publica ou porque a
 * leitura falhou.
 *
 * @returns {{produtos: object[], motivo: string|null, formatos: string[]}}
 */
export function normalizarPagina({
  html,
  url,
  fonte,
  plataforma = null,
  coletadoEm = new Date(),
  // Campos vindos do catalogo publico da plataforma, quando ela publica um.
  // Sao poucos e escolhidos: ver camposDoCatalogo em catalogo.js.
  doCatalogo = null,
}) {
  if (!html) return { produtos: [], motivo: "pagina sem corpo", formatos: [] };

  const estruturado = extrairProduto(html, url);
  const micro = doMicrodata(html);
  const meta = metaTags(html);
  const tray = daTray(html);

  const formatos = [
    estruturado?.fonte,
    micro ? "microdata" : null,
  ].filter(Boolean);

  if (!estruturado?.encontrado && !micro) {
    return { produtos: [], motivo: "sem dados estruturados de produto", formatos };
  }

  const bruto = estruturado?.bruto ?? null;

  // --- precos ---------------------------------------------------------------
  const declaradoNormal =
    comoNumero(meta["product:original_price:amount"]) ??
    comoNumero(bruto?.offers?.priceSpecification?.listPrice) ??
    comoNumero(bruto?.offers?.highPrice) ??
    // PrestaShop publica o preco de tabela numa variavel de script; e o unico
    // lugar onde ele aparece em varias lojas.
    comoNumero(/productPriceWithoutReduction\s*=\s*'([\d.,]+)'/.exec(html)?.[1]);

  const candidatos = [
    estruturado?.preco,
    micro?.preco,
    ...(micro?.precos ?? []),
    comoNumero(meta["product:price:amount"]),
    comoNumero(meta["product:sale_price:amount"]),
    comoNumero(tray?.price),
    // O a vista entra como candidato, nao como promocional direto: quem decide
    // qual e o normal e qual e o promocional e decidirPrecos, com a mesma regra
    // que ja vale para as outras lojas.
    aVistaDaTray(tray),
  ].filter((n) => typeof n === "number");

  const prices = decidirPrecos({ declaradoNormal, candidatos });

  // --- identidade -----------------------------------------------------------
  //
  // Cada campo anota DE ONDE veio. Sem isso nao havia como responder "este
  // codigo foi lido do site ou deduzido?" sem reabrir a pagina e conferir o
  // HTML — e um campo derivado, exibido igual a um campo lido, passa por
  // coletado.
  const origens = {};

  const primeiro = (campo, ...candidatos) => {
    for (const [valor, origem] of candidatos) {
      if (valor !== null && valor !== undefined && valor !== "") {
        origens[campo] = origem;
        return valor;
      }
    }
    return null;
  };

  const name = primeiro(
    "name",
    [estruturado?.fonte === "json-ld" ? estruturado.titulo : null, "json-ld"],
    [micro?.titulo, "itemprop=name"],
    [comoTexto(meta["og:title"]), "og:title"],
    [estruturado?.titulo, estruturado?.fonte ?? "?"],
  );

  const mpn = primeiro(
    "mpn",
    [micro?.mpn, "itemprop=mpn"],
    [estruturado?.mpn, estruturado?.fonte ?? "?"],
  );

  // CODIGO e SKU sao um campo so.
  //
  // Eram dois, e na pratica a loja publica um numero unico: o SKU aparecia
  // repetido no "codigo", que era copia dele. Dois campos com o mesmo valor
  // davam a impressao de dois dados coletados onde havia um.
  const code = primeiro(
    "code",
    [micro?.skuFonte, "itemprop=sku"],
    [estruturado?.skuFonte, estruturado?.fonte ?? "?"],
    [comoTexto(bruto?.productID), "json-ld productID"],
    [comoTexto(tray?.reference), "dataLayer da Tray"],
    [mpn, mpn ? `sem codigo proprio — usando o MPN (${origens.mpn})` : null],
  );

  // MPN igual ao codigo quase nunca e numero de peca do fabricante: e a loja
  // repetindo o codigo dela nos dois campos. Registrar isso importa porque o
  // MPN e justamente o que serviria para reconhecer o mesmo produto em outra
  // loja — e o codigo interno de uma loja nao vale para nada la fora.
  if (mpn && code && mpn === code && origens.code === "itemprop=sku") {
    origens.mpn = `${origens.mpn} — igual ao codigo, provavelmente codigo da loja`;
  }

  // --- estoque --------------------------------------------------------------
  const disponibilidade =
    micro?.disponibilidade ??
    bruto?.offers?.availability ??
    meta["product:availability"] ??
    meta.availability ??
    null;

  // O escopo do produto evita ler o estoque de um relacionado, que traz a mesma
  // marcacao mais abaixo na pagina.
  const escopo = escopoDoProduto(html);
  const quantidade =
    comoNumero(bruto?.offers?.inventoryLevel?.value) ??
    comoNumero(bruto?.offers?.inventoryLevel) ??
    quantidadeNoTexto(escopo);

  const status = situacaoDe(disponibilidade);

  // --- imagens --------------------------------------------------------------
  const estruturadas = [
    ...(estruturado?.imagens ?? []),
    ...(micro?.imagens ?? []),
    meta["og:image"],
  ]
    .map((endereco) => comoUrlAbsoluta(endereco, url))
    .filter(Boolean);

  // A galeria entra DEPOIS de proposito: semRepetir mantem a primeira ocorrencia
  // de cada foto, e a principal precisa continuar em primeiro lugar — e dela que
  // sai a miniatura da tela.
  // A Tray e atendida pelo id do produto; as demais, pelo diretorio da foto.
  // Sao regras diferentes porque as plataformas organizam o CDN de formas
  // incompativeis, e nenhuma das duas cobre a outra.
  const galeria = tray
    ? galeriaDaTray(html, tray, url)
    : galeriaDaPagina(html, estruturadas[0], url);

  // O catalogo SOMA, nao substitui. Ele vem primeiro porque e declarado pela
  // loja e ja vem na ordem certa, mas nao pode calar a leitura da pagina: a
  // listagem da Tray trunca em QUATRO imagens por produto (medido: todo item
  // da listagem tem 4; o detalhe do mesmo produto tem 9). Deixando o catalogo
  // vencer sozinho, cinco fotos que a pagina tinha eram perdidas.
  const images = semRepetir([
    ...(doCatalogo?.imagens ?? []),
    ...estruturadas,
    ...galeria,
  ]);

  // --- descricao ------------------------------------------------------------
  const description = melhorDescricao([
    estruturado?.descricao,
    micro?.descricao,
    comoTexto(meta["og:description"]),
    descricaoDoBloco(html),
  ]);

  // --- especificacoes -------------------------------------------------------
  // Ordem: o que a pagina declarou de forma estruturada vem primeiro; a lista
  // dentro da descricao e o ultimo recurso, por ser a leitura menos segura.
  // O additionalProperty do JSON-LD vem como mapa; aqui tudo vira a mesma lista
  // ordenada de {nome, valor}, para a tela nao precisar conhecer duas formas.
  const doJsonLd = Object.entries(estruturado?.atributos ?? {}).map(([nome, valor]) => ({
    nome,
    valor,
  }));

  const declaradas = doJsonLd.length > 0 ? doJsonLd : especificacoesDeTabela(html);

  const specifications = declaradas.length > 0 ? declaradas : especificacoesDeLista(description);

  const ean = primeiro(
    "ean",
    [micro?.ean, "itemprop=gtin"],
    [estruturado?.ean, estruturado?.fonte ?? "?"],
    [comoTexto(tray?.EAN), "dataLayer da Tray"],
  );
  // Marca e modelo caem para a ficha tecnica quando nao vem estruturados: nas
  // lojas menores eles so existem escritos ali.
  const brand = primeiro(
    "brand",
    [micro?.marca, "itemprop=brand"],
    [estruturado?.marca, estruturado?.fonte ?? "?"],
    [comoTexto(meta["product:brand"]), "meta product:brand"],
    [comoTexto(tray?.brand), "dataLayer da Tray"],
    [daFichaTecnica(specifications, /^(marca|fabricante|brand|manufacturer)$/i), "ficha tecnica da descricao"],
  );
  const model = primeiro(
    "model",
    [estruturado?.modelo, estruturado?.fonte ?? "?"],
    [micro?.modelo, "itemprop=model"],
    [comoTexto(tray?.model), "dataLayer da Tray"],
    [daFichaTecnica(specifications, /^(modelo|model|refer[eê]ncia)$/i), "ficha tecnica da descricao"],
  );

  const ncm = primeiro(
    "ncm",
    [doCatalogo?.ncm ?? null, "catalogo publico da plataforma"],
    [acharNcm(specifications, description), "ficha tecnica ou descricao"],
  );
  const seo = dadosDeSeo(html, meta, url);
  if (Object.values(seo).some(Boolean)) origens.seo = "meta tags da pagina";
  const category = primeiro(
    "category",
    [micro?.categoria, "breadcrumb"],
    [comoTexto(bruto?.category), "json-ld category"],
    [doDataLayer(html, code), "dataLayer de analytics"],
  );

  if (prices.normal !== null) {
    origens.precoNormal = declaradoNormal ? "preco de tabela declarado" : "maior preco da pagina";
  }
  if (prices.promotional !== null) origens.precoPromocional = "menor preco da pagina";
  if (description) origens.description = "texto mais longo entre as fontes";
  if (images.length) origens.images = `${images.length} endereco(s) na pagina`;
  if (status !== "UNKNOWN") origens.status = "availability declarada";
  if (typeof quantidade === "number") {
    origens.quantidade = bruto?.offers?.inventoryLevel ? "inventoryLevel" : "texto da pagina";
  }
  if (specifications.length) {
    origens.specifications = declaradas.length ? "campos estruturados" : "lista dentro da descricao";
  }

  // Sem codigo lido, entra marcado: um produto sem chave nenhuma sairia do
  // alcance da busca por codigo, que e como se chega ao item no concorrente.
  const codigoDoProduto = code ?? SEM_CODIGO;
  if (!code) origens.code = `sem codigo na pagina — marcado ${SEM_CODIGO}`;

  const base = {
    name,
    code: codigoDoProduto,
    mpn,
    ean,
    brand,
    model,
    category,
    ncm,
    url: comoUrlAbsoluta(url, url),
    images,
    prices,
    stock: {
      status,
      // Sem quantidade declarada, null — "em estoque" nao autoriza inventar um
      // numero. Zero so quando a loja diz que acabou.
      quantity: quantidade ?? (status === "OUT_OF_STOCK" ? 0 : null),
    },
    description,
    specifications: specifications ?? {},
    variants: opcoesDeVariacao(bruto),
    seo,
    // Quem serve a loja de onde este produto saiu. null quando nao foi possivel
    // reconhecer — nunca um palpite.
    plataforma:
      plataforma && plataforma.id !== "desconhecida"
        ? { id: plataforma.id, nome: plataforma.nome, confianca: plataforma.confianca }
        : null,
    collectedAt: coletadoEm.toISOString(),
    // De onde saiu cada campo. Nao e dado do produto: e a prestacao de contas
    // da coleta, para a tela distinguir o que foi lido do que foi deduzido.
    origens,
  };

  // O codigo e o ponto de acesso ao produto do concorrente: e por ele que se
  // chega ao item la, e e por ele que se compara aqui. Campo com mais de um
  // codigo vira mais de um produto, nunca um produto com dois codigos —
  // isso quebraria a busca pelos dois ao mesmo tempo.

  const codigos = separarCodigos(codigoDoProduto);

  const produtos =
    codigos.length > 1
      ? codigos.map((umCodigo) => ({
          ...base,
          code: umCodigo,
          origens: {
            ...origens,
            // Fica registrado que o codigo foi separado, e de onde: sem isso,
            // dois produtos identicos na tela pareceriam duplicata nossa.
            code: `${origens.code ?? "?"} — o campo trazia "${code}"`,
          },
        }))
      : [base];

  // Variacao com identificador proprio e DIFERENTE do produto de origem vira um
  // registro independente.
  for (const variacao of separarVariacoes(bruto)) {
    if (!variacao.identificador || variacao.identificador === code) continue;

    const precoVariacao = comoNumero(variacao.bruto?.offers?.price);

    produtos.push({
      ...base,
      name: variacao.nome ?? `${name} - ${variacao.identificador}`,
      code: variacao.identificador,

      mpn: comoTexto(variacao.bruto?.mpn) ?? null,
      ean: comoTexto(variacao.bruto?.gtin13 ?? variacao.bruto?.gtin) ?? null,
      url: comoUrlAbsoluta(variacao.bruto?.url, url) ?? base.url,
      images: (variacao.bruto?.image
        ? [variacao.bruto.image].flat().map((i) => comoUrlAbsoluta(i, url)).filter(Boolean)
        : base.images),
      prices: precoVariacao
        ? decidirPrecos({ declaradoNormal: null, candidatos: [precoVariacao] })
        : base.prices,
      stock: {
        status: situacaoDe(variacao.bruto?.offers?.availability) || status,
        quantity: null,
      },
      // Ja e um produto proprio: repetir as opcoes do grupo aqui sugeriria que
      // ele ainda pode virar outra coisa.
      variants: [],
    });
  }

  return { produtos, motivo: null, formatos, fonte };
}

/** Campos essenciais presentes? Sem eles a pagina nao conta como produto. */
export function ehProdutoValido(produto) {
  return ESSENCIAIS.every((campo) =>
    campo === "preco"
      ? typeof produto?.prices?.normal === "number" && produto.prices.normal > 0
      : Boolean(produto?.[campo]),
  );
}

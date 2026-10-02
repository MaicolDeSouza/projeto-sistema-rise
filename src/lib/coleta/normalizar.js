import { extrairProduto } from "./extrair";
import { precosDaForseti } from "./forseti";
import { categoriaDaRoboCore, descricaoDaRoboCore, estoqueDaRoboCore, precosDaRoboCore } from "./robocore";
import { impostosDaFicha, precoComImpostos, semImpostos } from "./impostos";
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
 * O mesmo, sem preco, para fonte do tipo FORNECEDOR.
 *
 * Atacadista publica catalogo aberto e preco so para cliente cadastrado — a
 * Santana Import mostra nome, EAN, NCM, CEST, multiplo de venda e dimensoes,
 * e nenhum preco. Exigir preco ali jogaria fora um catalogo inteiro de dados
 * uteis por causa do unico campo que o site nao publica para quem nao compra.
 *
 * Para CONCORRENTE a exigencia continua: acompanhar concorrente sem preco nao
 * responde a pergunta que o bloco existe para responder.
 */
const ESSENCIAIS_FORNECEDOR = ["name", "url"];

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
    .filter((parte) => !/^\d{2,4}x\d{2,4}$/.test(parte))
    // O Magento poe o recorte num hash de 32 caracteres dentro de "cache/": a
    // MESMA foto principal chega em tres enderecos (og:image, JSON-LD e o full
    // da galeria), so com hashes diferentes. Sem tirar isso da identidade, uma
    // foto contava como tres — na Saravati, as "2 imagens" coletadas eram a
    // mesma foto duas vezes.
    .filter((parte) => parte !== "cache" && !/^[0-9a-f]{32}$/i.test(parte));
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

/// Titulo de secao de produtos relacionados ("Quem viu ...", "Produtos
/// relacionados", "Veja tambem"). Vocabulario de SECAO, e so vale depois da foto
/// principal.
const TITULO_DE_RELACIONADOS =
  /<h[1-6]\b[^>]*>(?:(?!<\/h[1-6]>)[\s\S]){0,300}?(?:quem viu|relacionad|veja tamb[eé]m|voc[eê] tamb[eé]m|tamb[eé]m compraram|produtos similares|produtos semelhantes)/i;

/** Posicao do HTML em que a galeria acaba; `Infinity` quando nao ha secao de relacionados. */
function fimDaGaleria(html, principal) {
  const arquivo = new URL(principal, "https://x.invalid").pathname.split("/").pop() ?? "";
  const daPrincipal = arquivo ? html.indexOf(arquivo) : -1;
  if (daPrincipal < 0) return Infinity;

  const resto = html.slice(daPrincipal);
  const achado = TITULO_DE_RELACIONADOS.exec(resto);
  return achado ? daPrincipal + achado.index : Infinity;
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

  // A galeria termina onde comecam os RELACIONADOS. A Unitel (30/09/2026) serve
  // as fotos de todos os produtos do MESMO diretorio, e a secao "Quem viu ..."
  // trazia 5 fotos de outros transformadores e fontes: o mesmo diretorio nao
  // distingue foto do produto de foto de vizinho. O corte so vale se o titulo
  // da secao vier DEPOIS da foto principal — galeria nunca fica abaixo de
  // "veja tambem".
  const corte = fimDaGaleria(html, principal);

  for (const achado of html.matchAll(/<img[^>]+>/gi)) {
    const tag = achado[0];
    for (const atributo of ATRIBUTOS_DE_IMAGEM) {
      const valor = new RegExp(`\\b${atributo}=["']([^"']+)["']`, "i").exec(tag)?.[1];
      if (!valor) continue;

      const absoluta = comoUrlAbsoluta(valor, urlBase);
      if (!absoluta) continue;

      const diretorio = diretorioDaImagem(absoluta);
      if (!diretorio) continue;

      diretorios.add(diretorio);
      if (diretorio === alvo && achado.index < corte) candidatas.push(absoluta);
    }
  }

  // O diretorio so serve de filtro se ele DISTINGUIR. Numa loja que sirva tudo
  // de um diretorio so, aceitar as candidatas traria foto de outro produto —
  // erro pior que faltar foto, porque some da vista: a imagem existe, so nao e
  // do item.
  if (diretorios.size < 2) return [];

  // Cada ATRIBUTO (src, data-largeimg...) e cada tamanho servido (miniatura,
  // zoom) do MESMO arquivo entram como candidatas separadas ate aqui. Uma
  // pagina que repete a galeria inteira (tira visivel + bloco oculto do
  // lightbox — medido na 4hobby/Loja Integrada, jquery.fancybox) facilmente
  // passa de dez candidatas sem ter mais que 4 fotos de verdade: as 4 fotos
  // saiam TODAS descartadas, sobrando so a principal. O teto de "balde
  // compartilhado da loja" tem que valer sobre fotos UNICAS, e nao sobre
  // ocorrencias — dedup primeiro (semRepetir, que ja escolhe a maior versao de
  // cada uma), teto depois.
  const unicas = semRepetir(candidatas);

  // Galeria de produto e pequena. Passando disso, o diretorio nao e do produto:
  // e balde compartilhado da loja. A Tray serve o catalogo inteiro de
  // "/img/img_prod/<loja>/", e de la vinham dezesseis imagens — duas do produto,
  // tres de outros e o resto banner de categoria.
  //
  // Descartar tudo, e nao aparar a lista, porque nao ha como saber QUAIS das
  // dezesseis eram do produto. Sem galeria, a pagina fica com as imagens
  // estruturadas, que e o comportamento de antes desta funcao existir.
  if (unicas.length > TETO_DE_GALERIA) return [];

  return unicas;
}

/**
 * Galeria do Magento, que so existe dentro de um bloco JSON.
 *
 * Medido na Saravati: das tres fotos do produto, apenas a principal aparece como
 * <img> na pagina. As outras duas vivem so na inicializacao da galeria
 * (`"[data-gallery-role=gallery-placeholder]"`), como {thumb, img, full} — e por
 * isso nenhuma regra baseada em <img> as alcancava.
 *
 * Fica com o `full`, que e a maior das tres versoes do MESMO arquivo. A ordem e
 * a que a loja publicou, e a primeira e a principal (`isMain`).
 */
function galeriaDoMagento(html, urlBase) {
  const marca = /"\[data-gallery-role=gallery-placeholder\]"/.exec(html);
  if (!marca) return [];

  // Ate o fim do script de inicializacao: sem esse limite, um "full" de outro
  // bloco da pagina entraria na galeria deste produto.
  const inicio = marca.index;
  const fim = html.indexOf("</script>", inicio);
  const bloco = html.slice(inicio, fim === -1 ? undefined : fim);

  const fotos = [];
  for (const achado of bloco.matchAll(/"full"\s*:\s*"([^"]+)"/g)) {
    // O JSON vem dentro do HTML com as barras escapadas.
    const endereco = comoUrlAbsoluta(achado[1].replace(/\\\//g, "/"), urlBase);
    if (endereco) fotos.push(endereco);
  }

  return fotos.slice(0, TETO_DE_GALERIA);
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

  /*
    MESMO TEXTO, COM PARAGRAFOS, VENCE (16/09/2026).

    A Mamute publica a descricao duas vezes: no JSON-LD, tudo numa linha so
    ("... Especificacoes Tecnicas Modelo: CJMCU-219 Interface de comunicacao: I2C
    ..."), e no HTML da pagina, com titulos, paragrafos e listas. Pela regra da
    mais longa, o JSON-LD ganhava por poucos caracteres, e a tela mostrava um
    bloco ilegivel. O tamanho e comparado SEM espacos — quebras de linha e
    marcadores nao sao conteudo —, e a versao com mais linhas vence quando traz
    pelo menos 85% do texto da mais longa. Resumo de SEO continua perdendo: ele
    nao chega perto disso.
  */
  const conteudo = (texto) => texto.replace(/[\s-]+/g, "").length;
  const linhas = (texto) => texto.split("\n").filter((linha) => linha.trim()).length;
  const maior = Math.max(...limpas.map(conteudo));

  const escolhida = limpas
    .filter((texto) => conteudo(texto) >= maior * 0.85)
    .sort((a, b) => linhas(b) - linhas(a) || conteudo(b) - conteudo(a))[0];

  return limparDescricao(escolhida);
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
 * Ficha tecnica escrita SEM titulo de secao: a Unitel (30/09/2026) poe direto
 * na descricao "Corrente Máxima: 10A", "Tensão de saída: 24 + 24Vac", "Peso:
 * 5,072kg", sem "Especificações" antes.
 *
 * E a leitura mais frouxa que existe aqui, entao o criterio e apertado, para nao
 * trazer de volta o problema que fez a varredura do texto inteiro ser recusada
 * (frases de marketing em forma de "rotulo: valor"): uma CORRIDA de pelo menos
 * TRES linhas seguidas, cada uma com rotulo curto (ate 3 palavras, iniciado em
 * maiuscula) e valor curto (ate 40 caracteres). Frase de propaganda tem valor
 * comprido e nao passa. Linha em branco NAO quebra a corrida — o CMS poe cada
 * paragrafo entre <p> —, mas qualquer linha que nao seja par quebra.
 */
function fichaSemTitulo(linhas) {
  const par = (linha) => {
    const limpa = linha.replace(/^[\s\-•*]+/, "").replace(/[;.]\s*$/, "").trim();
    const separador = limpa.indexOf(":");
    if (separador < 2 || separador > 30) return null;

    const nome = limpa.slice(0, separador).trim();
    const valor = limpa.slice(separador + 1).trim();
    if (!valor || valor.length > 40 || nome.split(/\s+/).length > 3) return null;
    if (!/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(nome)) return null;
    return { nome, valor };
  };

  let corrida = [];
  let melhor = [];
  for (const linha of linhas) {
    if (!linha) continue;

    const item = par(linha);
    if (item) {
      corrida.push(item);
    } else {
      if (corrida.length > melhor.length) melhor = corrida;
      corrida = [];
    }
  }
  if (corrida.length > melhor.length) melhor = corrida;

  return melhor.length >= 3 ? melhor : [];
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
  //
  // Caixa alta so e titulo SEM valor depois dos dois-pontos: "- RAM: 256KB;" e
  // toda maiuscula e e item. Tomada por titulo, encerrava a ficha da Usinainfo
  // no EMW3080V2 (16/09/2026) e Dimensoes e Peso, que vinham depois, sumiam.
  const ehTitulo = (linha) =>
    linha.length > 2 &&
    linha.length < 45 &&
    (/:\s*$/.test(linha) ||
      (linha === linha.toUpperCase() &&
        /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(linha) &&
        !/:\s*\S/.test(linha)));

  // O titulo da secao as vezes vem SEM dois-pontos e em caixa normal — a
  // Smartkits escreve so "Especificacoes" no JSN-SR04T, e a ficha inteira,
  // dez itens, era descartada por causa de um caractere.
  //
  // A folga vale so para o titulo que o vocabulario ja reconhece, e so quando a
  // linha e curta e nao passa de tres palavras: o que se aceita e a linha que
  // SO anuncia a secao, nunca uma frase que menciona a palavra.
  const ehSecaoDeFicha = (linha) =>
    linha.length < 45 &&
    /especifica|ficha t[eé]cnica|dados t[eé]cnicos/i.test(linha) &&
    (ehTitulo(linha) || linha.split(/\s+/).length <= 3);

  // A Curto Circuito escreve "Principais Caracteristicas:" (ESP-12E, 17 itens
  // "- Nome: valor;") e a ficha inteira voltava vazia, porque o titulo nao tem
  // nenhuma das palavras acima.
  //
  // So vale como SEGUNDA opcao. "Caracteristicas" tambem e titulo de texto de
  // venda ("Caracteristicas: otima qualidade..."), entao nao pode disputar com
  // "Especificacoes" quando as duas existem: a primeira linha achada venceria, e
  // a ficha de verdade seria trocada pela propaganda. Assim a pagina que ja
  // tinha secao reconhecida le exatamente como lia antes.
  const ehSecaoDeCaracteristicas = (linha) =>
    linha.length < 45 &&
    /caracter[ií]sticas/i.test(linha) &&
    (ehTitulo(linha) || linha.split(/\s+/).length <= 3);

  let inicio = linhas.findIndex(ehSecaoDeFicha);
  if (inicio === -1) inicio = linhas.findIndex(ehSecaoDeCaracteristicas);

  // Sem secao de especificacoes, nao ha o que ler. Varrer o texto inteiro atras
  // de "rotulo: valor" parecia mais generoso e nao era: numa pagina real isso
  // trouxe vinte itens, dos quais doze eram frases de marketing da aba de
  // aplicacoes ("Custo baixo: boa solucao quando..."). Ficha tecnica com
  // propaganda dentro e pior que ficha tecnica vazia.
  if (inicio === -1) return fichaSemTitulo(linhas);

  // Paragrafo: linha longa ou com muitas palavras. E o que separa a ficha
  // tecnica do texto corrido que vem depois dela — no caso da Usinainfo, o
  // aviso de que o conteudo foi gerado por IA, e so entao a aba de aplicacoes
  // com frases de marketing em forma de "rotulo: valor".
  const ehParagrafo = (linha) =>
    linha.length > 120 || linha.split(/\s+/).length >= 12;

  const itens = [];
  let seguidasSemPar = 0;
  let houveBranco = false;
  // A lista usa marcador? Quem responde e o PRIMEIRO item, nao um palpite:
  // secao marcada e secao sem marcador terminam por sinais diferentes.
  let listaMarcada = null;

  for (const linhaBruta of linhas.slice(inicio + 1)) {
    if (!linhaBruta) {
      houveBranco = true;
      continue;
    }
    if (ehTitulo(linhaBruta)) break;

    // Marcador de lista dito pelo site. Guardado ANTES de ser removido, porque
    // e ele que distingue "mais um item da ficha" de "comecou outro assunto".
    const temMarcador = /^\s*[-•*]\s/.test(linhaBruta);
    if (listaMarcada === null) listaMarcada = temMarcador;

    const linha = linhaBruta.replace(/^[\s\-•*]+/, "").replace(/[;.]\s*$/, "").trim();

    // Item que o site quebrou no meio do parentese. A Curto Circuito escreve
    // "Consumo: 70 mA (Standby) e Max 215 mA (802.11b, CCK" e, na linha de baixo,
    // "- 1Mbps,Pout=+19.5dBm);": o "- " e o hifen do proprio texto, nao um novo
    // item. Sem juntar, o Consumo saia cortado e a sobra virava especificacao
    // sem rotulo. Parentese aberto e sem fechar no item anterior e o que prova
    // que a linha e continuacao.
    const anterior = itens[itens.length - 1];
    if (anterior && (anterior.valor.match(/\(/g) ?? []).length > (anterior.valor.match(/\)/g) ?? []).length) {
      anterior.valor = `${anterior.valor}${temMarcador ? " - " : " "}${linha}`;
      continue;
    }

    const separador = linha.indexOf(":");

    const rotulo = separador > 1 ? linha.slice(0, separador).trim() : null;
    const valor = separador > 1 ? linha.slice(separador + 1).trim() : null;

    // O rotulo pode ter ponto: "Carga max." e abreviacao, nao fim de frase.
    // Quem separa rotulo de frase e o tamanho, nao a pontuacao.
    //
    // O TETO DE PALAVRAS DO ROTULO CEDE AO MARCADOR. "Diferenca minima entre a
    // entrada e saida" tem sete palavras e e rotulo de verdade — com o teto
    // fixo em seis, a linha deixava de ser par, caia na regra de paragrafo por
    // ter doze palavras no total, e encerrava a ficha do XL6009 no terceiro
    // item de onze. O que limita rotulo continua sendo o tamanho em caracteres;
    // o numero de palavras so serve onde o site nao disse que aquilo e lista.
    const ehPar =
      rotulo &&
      valor &&
      separador <= 40 &&
      valor.length <= 120 &&
      rotulo.split(/\s+/).length <= (temMarcador ? 10 : 6);

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

    // Numa lista MARCADA, linha sem marcador encerra.
    //
    // E o site dizendo "mudei de assunto" sem usar dois-pontos no subtitulo: no
    // JSN-SR04T a ficha e seguida de "Downloads", "Acompanha" e "Garantia" —
    // todos sem marcador, sem dois-pontos e sem linha em branco antes. Nenhuma
    // das outras regras os alcancava, e os seis viravam especificacao.
    //
    // O par ja escapou acima, entao o item solto sem hifen no meio de uma lista
    // marcada continua sendo lido enquanto for "rotulo: valor". O que esta
    // regra descarta e a linha que nao e nem marcada nem par.
    if (listaMarcada && !temMarcador) break;

    // Nao e par: agora sim, paragrafo encerra a ficha. Menos com marcador —
    // item de lista comprido e ficha tecnica, nao texto corrido.
    if (!temMarcador && ehParagrafo(linhaBruta)) break;

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
    // OpenCart (Solda Fria): `<b>Estoque Atual:</b> <span>317</span>`, sem a
    // palavra "unidades" depois — o padrao acima exige ela e deixava a
    // quantidade "nao informada" numa pagina que diz 317.
    /estoque\s+atual\s*:?\s*(?:<[^>]*>\s*)*(\d{1,6})\b/i,
    // Magento: <div class="availability only" title="2 itens"><strong>2</strong>
    // itens</div>. O bloco e proprio do saldo — ancorar nele deixa de fora
    // qualquer outro "N itens" da pagina, como o do carrinho.
    /availability only[^>]*>\s*(?:<[^>]*>\s*)*(\d{1,6})\s*(?:<\/[^>]*>\s*)*\s*it(?:em|ens)/i,
    // RoboCore: <div id="estoque_3780" class="estoque_do_produto">(43 un. em
    // estoque)</div>. "un." em vez de "unidade(s)" escapava dos padroes acima;
    // o esgotado escreve o mesmo formato com 0, entao a leitura nao inventa nada.
    /\(\s*(\d{1,6})\s*un\.?\s*em\s+estoque\s*\)/i,
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
 * EAN escrito na ficha tecnica.
 *
 * Atacadista publica o codigo de barras com rotulo em portugues e nenhum gtin
 * estruturado: a Santana Import escreve "Cod. Barras: 7899744030168".
 *
 * Exige 8 a 14 digitos porque o MESMO campo recebe "SEM GTIN" quando o produto
 * nao tem codigo de barras — e isso nao e um EAN.
 *
 * O rotulo e ancorado nas pontas para deixar "EAN Caixa Mae" de fora: aquele e
 * o codigo do FARDO, e usa-lo faria a peca aparecer com o identificador da
 * caixa inteira, que e outro produto para quem le.
 */
function eanDaFicha(especificacoes) {
  const bruto = daFichaTecnica(
    especificacoes,
    /^(c[oó]d(igo)?\.?\s*(de\s*)?barras|ean|gtin(-?1[34])?)$/i,
  );

  const digitos = String(bruto ?? "").replace(/\D/g, "");
  return /^\d{8,14}$/.test(digitos) ? digitos : null;
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

  // <script> e <style> saem antes: o JavaScript monta tabelas em strings
  // ('<tr><th>Métodos de envio</th><th>Valor</th></tr>' no calculo de frete do
  // OpenCart) e isso virava "Métodos de envio: Valor" na ficha tecnica, junto
  // com um pedaço do proprio codigo.
  const semCodigo = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");

  for (const tabela of semCodigo.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    for (const linha of tabela[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
      const celulas = [...linha[0].matchAll(/<(t[dh])[^>]*>([\s\S]*?)<\/\1>/gi)].map((celula) => ({
        tag: celula[1].toLowerCase(),
        texto: comoTexto(celula[2]),
      }));

      // So pares: tabela de tres colunas nao e ficha tecnica, e adivinhar qual
      // coluna e o valor produziria lixo.
      if (celulas.length !== 2) continue;

      // Linha só de <th> é cabecalho de tabela (a "Lista de codigos" da
      // Metaltex: <thead><tr><th>Codigo</th><th>Descricao</th></tr></thead>),
      // nunca um par nome:valor — cabecalho nao e o valor de si mesmo. Rotulo
      // em <th> com valor em <td> continua valendo (a Mamute: "Fabricante" em
      // <th>, "IMP" em <td>).
      if (celulas.every((celula) => celula.tag === "th")) continue;

      if (celulas[0].texto && celulas[1].texto) {
        itens.push({ nome: celulas[0].texto.replace(/:$/, ""), valor: celulas[1].texto });
      }
    }
  }

  return itens;
}

/**
 * Tabela comparativa de variantes: a primeira linha traz o codigo de cada
 * coluna, e as demais repetem o valor pro grupo inteiro (colspan, ja lido em
 * especificacoesDeTabela) OU trazem um valor por coluna quando o parametro
 * muda de variante para variante.
 *
 * Existe por causa da Metaltex (29/09/2026): "Saida (carga)" vai de 60A a
 * 100A entre as variantes do mesmo rele, numa tabela com uma coluna por
 * codigo. especificacoesDeTabela so aceita linha de DUAS celulas — de
 * proposito, para nao adivinhar qual coluna e o valor — e descartava a linha
 * inteira, junto com a de "Codigo": nenhuma das tres variantes ficava com o
 * parametro que justamente diferencia elas.
 *
 * So reconhece a linha de cabecalho quando as celulas dela batem com os
 * codigos DAS VARIANTES DE VERDADE (hasVariant[].sku, ja medidos em
 * separarVariacoes) — nunca pela palavra "codigo", que muda de loja para
 * loja e de idioma para idioma.
 */
function especificacoesPorVariante(html, codigosConhecidos) {
  const porCodigo = new Map();
  if (!codigosConhecidos || codigosConhecidos.length < 2) return porCodigo;

  const semCodigo = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");

  for (const tabela of semCodigo.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const linhas = [...tabela[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((linha) =>
      [...linha[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((celula) =>
        comoTexto(celula[1]),
      ),
    );

    const cabecalho = linhas.find(
      (celulas) =>
        celulas.length >= 3 &&
        celulas
          .slice(1)
          .every((valor) =>
            codigosConhecidos.some(
              (codigo) => valor && valor.toUpperCase() === codigo.toUpperCase(),
            ),
          ),
    );
    if (!cabecalho) continue;

    const colunas = cabecalho.slice(1);

    for (const celulas of linhas) {
      if (celulas === cabecalho || celulas.length !== cabecalho.length) continue;

      const nome = celulas[0]?.replace(/:$/, "");
      if (!nome) continue;

      celulas.slice(1).forEach((valor, indice) => {
        if (!valor) return;
        const codigo = colunas[indice];
        if (!porCodigo.has(codigo)) porCodigo.set(codigo, []);
        porCodigo.get(codigo).push({ nome, valor });
      });
    }
  }

  return porCodigo;
}

/// Titulo que anuncia a ficha tecnica escrita na descricao.
const TITULO_DE_FICHA =
  /^(especifica[cç](?:[õo]es|ao|ão)(?: t[eé]cnicas?)?|ficha t[eé]cnica|dados t[eé]cnicos|caracter[ií]sticas t[eé]cnicas)\s*:?$/i;

/// "Características" sozinho tambem anuncia ficha na Solda Fria
/// (`<h3>Características</h3><ul><li><strong>Tipo de Conector:</strong> ...`),
/// mas em outras lojas e titulo de lista de marketing ("Alta durabilidade").
/// Por isso este titulo so vale quando TODOS os itens sao pares "Nome: valor".
const TITULO_DE_FICHA_CURTO = /^caracter[ií]sticas(?: do produto)?\s*:?$/i;

/**
 * Ficha tecnica escrita como LISTA HTML logo abaixo de um titulo:
 * `<h2>Especificações Técnicas</h2><ul><li><strong>Formato:</strong> Tubular</li>`.
 *
 * Existe por causa da Mamute Eletronica (16/09/2026). A descricao do JSON-LD
 * dela vem numa linha so, sem quebras, e a leitura por texto
 * (especificacoesDeLista) nao tem onde separar um item do outro. No HTML a lista
 * esta inteira e marcada. Le so a lista que vem colada ao titulo: a seguinte
 * ("Aplicacoes Indicadas") e outro assunto.
 */
function especificacoesDeListaHtml(html) {
  for (const titulo of html.matchAll(/<(h[1-6]|p|strong|b)\b[^>]*>([\s\S]{0,120}?)<\/\1>/gi)) {
    const textoDoTitulo = comoTexto(titulo[2]) ?? "";
    const tituloCurto = TITULO_DE_FICHA_CURTO.test(textoDoTitulo);
    if (!tituloCurto && !TITULO_DE_FICHA.test(textoDoTitulo)) continue;

    // Entre o titulo e a lista, so tags e espaco: texto no meio quer dizer que a
    // lista e de outra coisa.
    const depois = html.slice(titulo.index + titulo[0].length, titulo.index + titulo[0].length + 2000);
    const lista = /^(?:\s|<(?!ul\b)[^>]*>)*<ul\b[^>]*>([\s\S]*?)<\/ul>/i.exec(depois);
    if (!lista) continue;

    const itens = [];
    for (const item of lista[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
      const texto = comoTexto(item[1]);
      if (!texto) continue;
      const separador = texto.indexOf(":");
      if (separador > 1 && separador <= 60) {
        itens.push({ nome: texto.slice(0, separador).trim(), valor: texto.slice(separador + 1).trim() });
      } else {
        itens.push({ nome: null, valor: texto });
      }
    }
    // "Características" sozinho tambem introduz ficha de verdade SEM pares
    // "Nome: valor" — a Piscaled escreve "Alimentação 100-240 VAC - 3W;",
    // "Dimensões 93x68x17 mm;" como frases soltas (22/09/2026). O que separa
    // isso de uma lista de marketing ("Alta durabilidade") e a PRESENCA DE
    // NUMERO: medida real tem unidade e digito, elogio nao. Exige maioria (nao
    // 100%) porque nem todo item tecnico traz numero ("Suporte para trilho
    // DIN;" nao tem, e ainda assim e ficha).
    const semRotulo = itens.filter((item) => !item.nome);
    if (tituloCurto && semRotulo.length > 0) {
      const comNumero = semRotulo.filter((item) => /\d/.test(item.valor)).length;
      if (comNumero / semRotulo.length < 0.5) continue;
    }
    if (itens.length > 0) return itens;
  }
  return [];
}

/** Junta duas fichas sem repetir o mesmo rotulo; a primeira vence. */
function juntarFichas(primeira, segunda) {
  const rotulos = new Set(
    primeira.filter((item) => item.nome).map((item) => item.nome.toLowerCase()),
  );
  return [
    ...primeira,
    ...segunda.filter((item) => !item.nome || !rotulos.has(item.nome.toLowerCase())),
  ];
}

/**
 * Descarta linha de "especificacao" cujo NOME e literalmente o codigo de uma
 * variante — nao e parametro tecnico, e sobra de uma tabela de referencia.
 *
 * A Metaltex publica, ao lado da ficha de verdade, uma "Lista de codigos"
 * so com Codigo e Descricao (`<td>TZC-60AF/DT+V</td><td>60A</td>`).
 * especificacoesDeTabela nao distingue essa tabela de uma ficha tecnica —
 * as duas sao linhas de duas celulas — e cada codigo virava uma linha de
 * especificacao ("TZC-60AF/DT+V: 60A") em TODOS os produtos da pagina. Um
 * rotulo tecnico nunca e, ele mesmo, o codigo de uma variante.
 */
function semLinhasDeCodigo(lista, codigosConhecidos) {
  if (!codigosConhecidos || codigosConhecidos.length === 0) return lista;

  return lista.filter(
    (item) =>
      !item.nome ||
      !codigosConhecidos.some((codigo) => item.nome.toUpperCase() === codigo.toUpperCase()),
  );
}

/** Reutiliza a leitura da ficha quando o catalogo entrega apenas a descricao HTML. */
export function especificacoesDaDescricao(html, declaradas = []) {
  const tabelaELista = juntarFichas(especificacoesDeTabela(html ?? ""), especificacoesDeListaHtml(html ?? ""));
  return juntarFichas(declaradas, tabelaELista.length ? tabelaELista : especificacoesDeLista(comoTexto(html)));
}

/**
 * Preco a vista do modulo de parcelamento do Magento, calculado como a loja
 * calcula.
 *
 * A Mamute mostra "R$ 46,46 — 5% OFF no PIX" e o numero NAO esta no HTML: o
 * navegador o calcula a partir de uma configuracao `"installment"` com
 * `"discounts": {"name": "PIX, Transferencia ou Deposito", "percentage": "5"}`.
 * Sem isto o sistema so via os R$ 48,90.
 *
 * So vale desconto de pagamento a vista (pix, boleto, transferencia, deposito):
 * desconto de outra natureza, no mesmo bloco, nao e o preco de quem paga a vista.
 * Arredondamento em centavos inteiros, meio para cima: 48,90 x 0,95 = 46,455 ->
 * 46,46, o que a pagina mostra.
 */
function aVistaDoMagento(html, preco) {
  if (typeof preco !== "number" || preco <= 0 || !html.includes('"installment"')) return null;

  const bloco = /"installment"\s*:\s*\{[\s\S]*?"discounts"\s*:\s*\{([\s\S]*?)\}\s*\}/.exec(html);
  if (!bloco) return null;

  let maior = 0;
  for (const desconto of bloco[1].matchAll(/"name"\s*:\s*"([^"]*)"\s*,\s*"percentage"\s*:\s*"?(\d+(?:[.,]\d+)?)"?/g)) {
    const nome = decodificarJson(desconto[1]);
    const percentual = Number(desconto[2].replace(",", "."));
    if (/pix|boleto|transfer|dep[oó]sito|[aà] vista/i.test(nome) && percentual > 0 && percentual < 100) {
      maior = Math.max(maior, percentual);
    }
  }
  if (maior === 0) return null;

  const centavos = Math.round((Math.round(preco * 100) * (100 - maior)) / 100);
  return { aVista: centavos / 100, desconto: maior };
}

/** "Transferência" -> "Transferência", para o nome lido por regex de JSON. */
function decodificarJson(texto) {
  try {
    return JSON.parse(`"${texto}"`);
  } catch {
    return texto;
  }
}

/** Nome ou referencia sem acento, caixa e pontuacao — so para comparar. */
const soLetrasENumeros = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * O conteudo de um <div> ate o fechamento que o equilibra, a partir do primeiro
 * caractere depois da tag de abertura. Sem fechamento, ate 20 mil caracteres.
 */
function conteudoDoDiv(html, inicio) {
  const marcas = /<div\b|<\/div>/gi;
  marcas.lastIndex = inicio;
  let profundidade = 1;
  let marca;
  while ((marca = marcas.exec(html)) !== null) {
    profundidade += marca[0].startsWith("</") ? -1 : 1;
    if (profundidade === 0) return html.slice(inicio, marca.index);
  }
  return html.slice(inicio, inicio + 20000);
}

/**
 * A pagina e uma LISTAGEM da plataforma ASP.NET (_uploads)? Home e categoria
 * repetem itemtype=Product em cada card; sem o painel de detalhe, nao ha produto.
 */
function ehListagemAspNet(html) {
  return (
    /\/_uploads\/Produto/i.test(html) &&
    /produto__item--box/.test(html) &&
    !/detalhe_informacoes_cod_ref/.test(html)
  );
}

/**
 * Pagina de produto da plataforma propria em ASP.NET (Eletru's), 16/09/2026.
 *
 * Nao publica JSON-LD, e o Microdata tem so nome, preco e imagem — com o sku
 * vazio. O resto esta escrito no painel e nas abas, e e lido de la:
 *
 *   <span>Ref: OBT500-18GM60-E5</span> <span>Cod: 53.00.1463</span>
 *   <span itemprop="brand" content="Autonics">Marca: Autonics</span>
 *   <span itemprop="price" content="320.00">  ...  "Ou R$ 304,00 a vista ( - 5% )"
 *   botao "comprar" (em estoque) ou "avise-me" (sem estoque, e sem preco)
 *   abas "Descricao" e "Caracteristicas Tecnicas" (lista de "Nome: valor")
 *
 * @returns {object|null} null quando a pagina nao e o detalhe desta plataforma
 */
function daVitrineAspNet(html, url) {
  const inicioPainel = html.indexOf("detalhe__produto--info");
  if (inicioPainel < 0 || !/detalhe_informacoes_cod_ref/.test(html)) return null;
  const fimPainel = html.indexOf("detalhe_informacoes_frete", inicioPainel);
  const painel = html.slice(inicioPainel, fimPainel > 0 ? fimPainel : inicioPainel + 8000);
  const textoPainel = comoTexto(painel) ?? "";

  const nome = comoTexto(/itemprop="name"[^>]*>([\s\S]*?)<\/h1>/.exec(painel)?.[1]);
  const codigo = comoTexto(/<span>\s*C(?:ó|&#243;|o)d:\s*([^<]+)<\/span>/i.exec(painel)?.[1]);

  // "Ref:" so vale como referencia de fabricante quando NAO e o nome cortado: o
  // ERP da loja preenche o campo com a descricao em 30 letras quando nao ha
  // numero de peca ("LAMPADA VAPOR SODIO 250 W E-40").
  const refBruta = comoTexto(/<span>\s*Ref:\s*([^<]+)<\/span>/i.exec(painel)?.[1]);
  const refEhNome =
    refBruta &&
    (soLetrasENumeros(nome).startsWith(soLetrasENumeros(refBruta)) ||
      refBruta.trim().split(/\s+/).length >= 3);
  const referencia = refEhNome ? null : refBruta;

  const marca =
    comoTexto(/itemprop="brand"[^>]*content="([^"]+)"/.exec(painel)?.[1]) ??
    comoTexto(/Marca:\s*([^<]+)</.exec(painel)?.[1]);

  const preco = comoNumero(/itemprop="price"[^>]*content="([\d.]+)"/.exec(painel)?.[1]);
  const de = comoNumero(/\bDe:\s*R\$\s*([\d.,]+)/i.exec(textoPainel)?.[1]);
  const aVista = comoNumero(/Ou\s*R\$\s*([\d.,]+)\s*(?:à|a)\s*vista/i.exec(textoPainel)?.[1]);

  const disponibilidade = /comprar-btn/.test(painel)
    ? "http://schema.org/InStock"
    : /avise-btn|avise-me/i.test(painel)
      ? "http://schema.org/OutOfStock"
      : null;

  // Categoria: o ultimo degrau do breadcrumb antes do proprio produto.
  const trilha = /<ul class="loja__breadcrumb">([\s\S]*?)<\/ul>/.exec(html)?.[1] ?? "";
  const degraus = [...trilha.matchAll(/<p class="content\s*([^"]*)">([\s\S]*?)<\/p>/g)]
    .filter((degrau) => !/active/.test(degrau[1]))
    .map((degrau) => comoTexto(degrau[2]))
    .filter(Boolean);
  const categoria = degraus.at(-1) ?? null;

  // Fotos: so as da galeria do produto (antes do painel), na versao original.
  // Duas pastas: ProdutoDestaque (a principal) e produtoArquivo (as demais) — o
  // borne PT 2,5 tem 1 + 5, e so a principal vinha. Nome em "__orig" ou "_orig".
  const galeria = html.slice(html.lastIndexOf('id="galeria"', inicioPainel) + 1 || 0, inicioPainel);
  const imagens = [
    ...new Set(
      [...galeria.matchAll(/https?:\/\/[^"'\s]*\/_uploads\/(?:ProdutoDestaque|produtoArquivo)\/[^"'\s]+?_{1,2}orig\.(?:jpe?g|png|webp)/gi)].map(
        (encontro) => comoUrlAbsoluta(encontro[0], url),
      ),
    ),
  ].filter(Boolean);

  // Abas: rotulo -> conteudo.
  const abas = {};
  for (const aba of html.matchAll(/data-bs-toggle="tab"\s+href="#(aba\d+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const abertura = html.indexOf(`id="${aba[1]}"`);
    if (abertura < 0) continue;
    // O conteudo e o que esta DENTRO do <div> da aba, recortado pelo fechamento
    // equilibrado. Cortar em "proxima aba ou relacionados" falhava na ultima aba
    // de produto sem relacionados: ia ate o rodape, e o formulario "avise-me",
    // o telefone e o CNPJ viravam 30 "especificacoes".
    const inicio = html.indexOf(">", abertura) + 1;
    abas[(comoTexto(aba[2]) ?? "").toLowerCase()] = conteudoDoDiv(html, inicio);
  }
  const abaDe = (padrao) => Object.entries(abas).find(([rotulo]) => padrao.test(rotulo))?.[1] ?? null;

  const blocoDescricao = abaDe(/descri/);
  const descricao = blocoDescricao
    ? comoTexto(blocoDescricao.replace(/<li\b[^>]*>/gi, "\n- "))
    : null;

  const especificacoes = [];
  const blocoFicha = abaDe(/caracter|especifica|ficha/);
  if (blocoFicha) {
    const linhas = (comoTexto(blocoFicha) ?? "").split("\n");
    for (const linha of linhas.map((texto) => texto.replace(/^[-•*]\s*/, "").trim()).filter(Boolean)) {
      const separador = linha.indexOf(":");
      if (separador > 1 && separador <= 60) {
        especificacoes.push({ nome: linha.slice(0, separador).trim(), valor: linha.slice(separador + 1).trim() });
      } else {
        especificacoes.push({ nome: null, valor: linha });
      }
    }
  }

  return {
    nome,
    codigo,
    referencia,
    marca,
    preco,
    de,
    aVista,
    disponibilidade,
    categoria,
    imagens,
    descricao,
    especificacoes: especificacoes.filter((item) => item.valor),
  };
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
 *
 * Loja sem parcelamento declarado publica o campo como STRING VAZIA, nao como
 * lista vazia nem ausente — e assim na Smartkits inteira, inclusive num produto
 * de R$ 4.299,90. O `?.` nao alcanca isso, e `"".find` derrubava a validacao da
 * fonte com "find is not a function" antes de qualquer preco ser lido.
 */
function aVistaDaTray(tray) {
  const parcelas = tray?.priceSellDetails;
  if (!Array.isArray(parcelas)) return null;

  const detalhe = parcelas.find(
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
 *
 * O endereco dos documentos NAO fica aqui. A descricao e texto; o link do
 * datasheet vira campo proprio, em documentosDaPagina — senao o mesmo endereco
 * apareceria em dois lugares e nenhum deles clicavel.
 */
function descricaoDoBloco(html) {
  const bloco =
    /<div[^>]*class=["'][^"']*\bdescription\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(
      html,
    );

  return bloco ? textoDoBlocoDeDescricao(bloco[1]) : null;
}

function textoDoBlocoDeDescricao(blocoHtml) {
  // A ESTRUTURA DA PAGINA SOBREVIVE AO TEXTO: titulo ganha uma linha em branco
  // antes, e item de lista vira "- item". Sem isto a lista de especificacoes da
  // Mamute ("Modelo: CJMCU-219", "Interface: I2C" ...) virava linhas soltas, sem
  // o marcador que diz que ainda sao lista.
  const estruturado = blocoHtml
    .replace(/<h[1-6]\b/gi, "\n\n$&")
    .replace(/<li\b[^>]*>\s*(?:[-•*]\s+)?/gi, "\n- ");

  // Item de lista colado ao anterior: o fechamento do <li> e o "\n- " do proximo
  // deixavam uma linha em branco entre cada um.
  return comoTexto(estruturado)?.replace(/\n{2,}- /g, "\n- ") ?? null;
}

/**
 * og:title costuma vir com o nome da loja colado no fim, e as vezes com o
 * PLACEHOLDER do CMS que ninguem trocou: a Unitel (30/09/2026) publica
 * "Transformador - 24 + 24Vac - 10A - Bivolt - Ref. 903 - Nome da empresa",
 * enquanto o <h1> da pagina traz so o titulo do produto.
 *
 * So corta quando o <h1> visivel e um PREFIXO proprio do og:title e o que sobra
 * comeca por separador — o titulo que a loja mostra ao cliente vence o da
 * meta tag, e nada e inventado. Titulo sem <h1> igual ao comeco fica como esta.
 */
function tituloSemSufixoDaLoja(titulo, html) {
  if (!titulo) return titulo;

  for (const [, interno] of html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)) {
    const h1 = comoTexto(interno);
    if (!h1 || h1.length < 8 || titulo.length <= h1.length) continue;
    if (titulo.startsWith(h1) && /^\s*[-–—|:·]\s/.test(titulo.slice(h1.length))) return h1;
  }
  return titulo;
}

/**
 * Descricao que mora na ABA "Descrição" do produto, quando a loja a monta como
 * `<a data-toggle="tab" href="#painel">Descrição</a>` e um painel com esse id.
 *
 * Existe por causa da Solda Fria (OpenCart, 19/09/2026): o JSON-LD, o
 * og:description e o Microdata trazem a descricao CORTADA em ~250 caracteres, no
 * meio da frase, e o texto inteiro (introducao, caracteristicas, aplicacoes) so
 * esta no painel da aba, sem classe "description". Como quem decide e
 * melhorDescricao, pela mais longa, este candidato so vence onde de fato traz mais.
 *
 * Exige data-toggle="tab": link "#descricao" comum e ancora de rolagem, nao aba.
 */
function descricaoDaAba(html) {
  const ROTULO = /^descri[cç][aã]o(?: do produto)?$/i;

  const painelDe = (alvo) => {
    const painel = new RegExp(`\\bid=["']${alvo}["'][^>]*>`, "i").exec(html);
    return painel
      ? textoDoBlocoDeDescricao(conteudoDoDiv(html, painel.index + painel[0].length))
      : null;
  };

  for (const aba of html.matchAll(/<a\b([^>]*)>([\s\S]{0,60}?)<\/a>/gi)) {
    if (!/data-(?:bs-)?toggle=["']tab["']/i.test(aba[1])) continue;
    if (!ROTULO.test((comoTexto(aba[2]) ?? "").trim())) continue;

    const alvo = /href=["']#([\w-]+)["']/i.exec(aba[1])?.[1];
    if (!alvo) continue;

    const texto = painelDe(alvo);
    if (texto !== null) return texto;
  }

  // Aba trocada por JavaScript proprio: a Unitel (30/09/2026) monta
  // `<h2 onclick="openAba(event, 'desc')">Descrição</h2>` e um
  // `<div id="desc" class="tabcontent">`. Sem data-toggle, so o onclick diz
  // QUAL painel a aba abre — e o rotulo continua tendo de ser "Descrição", senao
  // "Orçamento" e "Perguntas e respostas" (abas de outro assunto) entrariam.
  for (const aba of html.matchAll(/<(a|h[1-6]|button|li|span)\b([^>]*)>([\s\S]{0,60}?)<\/\1>/gi)) {
    if (!ROTULO.test((comoTexto(aba[3]) ?? "").trim())) continue;

    const alvo = /onclick=["'][^"']*['"]([\w-]+)['"][^"']*["']/i.exec(aba[2])?.[1];
    if (!alvo) continue;

    const texto = painelDe(alvo);
    if (texto !== null) return texto;
  }
  return null;
}

/// Extensao que denuncia arquivo, e nao pagina. Vale no dominio da propria
/// loja: datasheet hospedado em casa continua sendo documento.
const EXTENSAO_DE_ARQUIVO =
  /\.(pdf|zip|rar|7z|docx?|xlsx?|pptx?|csv|txt|stl|dxf|step|ino|hex)(?:[?#]|$)/i;

/// Endpoint de anexo da plataforma. O PrestaShop serve o arquivo por
/// `controller=attachment`, sem extensao nenhuma no endereco.
const ENDPOINT_DE_ANEXO = /controller=attachment|\/attachments?\/|\/anexos?\//i;

/// O que o link diz que é. Vocabulario de DOCUMENTO, nao de pagina: "blog",
/// "tutorial" e "projeto" ficam de fora de proposito — sao conteudo da loja.
const NOME_DE_DOCUMENTO =
  /datasheet|data sheet|manual|esquem[aá]tico|esquema el[eé]trico|diagrama|cat[aá]logo|ficha t[eé]cnica|firmware|biblioteca|documenta[cç]/i;

/// Teto por produto. Passando disso nao e a ficha do item, e um repositorio da
/// loja inteira — guardar tudo encheria o campo de material de outro produto.
const MAXIMO_DOCUMENTOS = 12;

/**
 * Recorta o HTML no elemento <product-info>...</product-info>, quando existe.
 *
 * E o escopoDoProduto (ver microdata.js) das lojas Shopify de tema novo
 * (Dawn e derivados): o painel do produto principal — fotos, preco, ficha,
 * "Material para Download" — vive dentro desse elemento customizado, e as
 * vitrines de produtos relacionados ("Compare com as linhas", "voce tambem
 * pode gostar") ficam FORA dele, em <section> irmas mais abaixo na mesma
 * pagina. Sem o corte, um botao "Especificacoes" de um cartao de produto
 * vizinho virava documento do produto errado — medido na Metaltex
 * (29/09/2026): a ficha tecnica do TZD e a do TZCM, produtos diferentes,
 * entravam junto com o material do TZC-F so por estarem na mesma pagina.
 *
 * Sem o elemento, devolve o HTML inteiro: e o comportamento de sempre,
 * melhor que nao ler nada.
 */
function escopoDoProductInfo(html) {
  const abertura = /<product-info\b/i.exec(html);
  if (!abertura) return html;

  const fechamento = html.indexOf("</product-info>", abertura.index);
  if (fechamento === -1) return html;

  return html.slice(abertura.index, fechamento + "</product-info>".length);
}

/**
 * Documentos que o concorrente publica para download.
 *
 * O datasheet e o que permite conferir se o produto do concorrente e o MESMO
 * que o nosso: dois modulos com nome diferente e o mesmo CI sao o mesmo item.
 * Sem o endereco, sobrava a palavra "Datasheet" na descricao e o documento
 * ficava inalcancavel.
 *
 * O QUE IDENTIFICA UM DOCUMENTO E O TEXTO DO LINK, mais a extensao e o endpoint
 * de anexo. "Sai da loja" parecia servir e nao serve — medido na pagina INTEIRA,
 * esse criterio devolveu 30 candidatos na Smartkits (WhatsApp vinte vezes,
 * Instagram, TikTok, o selo da Loja Protegida) e 6 na Usinainfo, todos redes
 * sociais. Com extensao, anexo e vocabulario, as duas devolvem UM: o datasheet.
 *
 * Os dois casos reais nao se parecem em nada, e nenhum criterio sozinho pega os
 * dois: a Smartkits hospeda no Google Drive, endereco sem extensao e fora do
 * dominio; a Usinainfo serve pelo anexo do PrestaShop, no proprio dominio e
 * tambem sem extensao.
 *
 * Varre a pagina INTEIRA (recortada no <product-info>, quando existe) porque
 * o link nao mora num lugar so: na Tray ele esta dentro da descricao, na
 * Usinainfo numa aba propria, fora dela.
 */
function documentosDaPagina(html, urlBase) {
  if (!html) return [];

  const achados = new Map();
  const escopo = escopoDoProductInfo(html);

  for (const ancora of escopo.matchAll(
    /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const endereco = comoUrlAbsoluta(ancora[1], urlBase);
    if (!endereco) continue;

    const titulo = comoTexto(ancora[2]);
    let caminho;
    try {
      caminho = new URL(endereco).pathname;
    } catch {
      continue;
    }

    const ehArquivo = EXTENSAO_DE_ARQUIVO.test(caminho) || ENDPOINT_DE_ANEXO.test(endereco);
    const ehDocumento = ehArquivo || (titulo && NOME_DE_DOCUMENTO.test(titulo));

    if (!ehDocumento) continue;

    // SECAO DO SITE NAO E DOCUMENTO DO PRODUTO. Link reconhecido so pelo texto,
    // apontando para uma pagina de primeiro nivel — "Catalogos" -> /catalogos,
    // no menu institucional da Eletrus (16/09/2026) — aparecia como documento
    // em todo produto da loja. Arquivo de verdade tem extensao ou endpoint de
    // anexo, e esse continua valendo onde estiver.
    //
    // O teto de 2 palavras no titulo (de quando so a Eletrus tinha sido
    // medida) deixava passar "Catálogo Completo IOT" — link de CATEGORIA no
    // menu da Piscaled (`<li class="categoria-id-...">`, /catalogo-completo-iot),
    // colado em todo produto da linha IOT (22/09/2026). Sem extensao nem
    // endpoint de anexo, pagina de UM SO segmento ja e o sinal — quem serve
    // documento de verdade sem extensao usa endpoint de anexo (varios
    // segmentos) ou um dominio proprio de arquivo, nunca uma pagina solta do
    // proprio site. O teto de palavras saiu: era o que ainda deixava passar
    // esse caso.
    const paginaDePrimeiroNivel = /^\/[^/]+\/?$/.test(caminho);
    if (!ehArquivo && paginaDePrimeiroNivel) continue;

    // MESMO ARQUIVO, DOIS ROTULOS: junta, nao descarta o segundo. A Metaltex
    // usa dois botoes para o mesmo PDF — "Certificado" e "Declaracao
    // RoHS/REACH (da linha)" — porque o documento responde pelos dois nomes;
    // o dono confirmou que quer os dois (29/09/2026). O mesmo anexo aparece
    // duas vezes na Usinainfo tambem — uma dentro das caracteristicas, outra
    // na aba de download — mas so uma das duas tem texto, entao ali a segunda
    // passagem nao muda nada (titulo vazio nao junta).
    if (achados.has(endereco)) {
      const existente = achados.get(endereco);
      if (titulo && titulo !== existente.titulo && !existente.titulo.includes(titulo)) {
        existente.titulo = `${existente.titulo} — ${titulo}`;
      }
      continue;
    }

    // Sem titulo, o nome do arquivo no endereco; sem ele, rotulo generico:
    // inventar um nome para o documento seria dizer o que a pagina nao disse.
    achados.set(endereco, {
      titulo: titulo || decodeURIComponent(caminho.split("/").pop() || "") || "Documento",
      url: endereco,
    });

    if (achados.size >= MAXIMO_DOCUMENTOS) break;
  }

  return [...achados.values()];
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
 * Codigo tirado do fim da URL, confirmado pelo nome do produto.
 *
 * A Santana Import publica o codigo no endereco e no titulo, e em nenhum
 * formato estruturado: /cabo-usb-...-018-0071.htm com o nome
 * "Cabo USB ... 018-0071". Sem isto o produto entrava como N/A, o que pela
 * regra do dono o deixa fora da estrutura de acesso.
 *
 * A CONFIRMACAO PELO NOME e o que torna isto seguro. Slug tem numero de tudo
 * quanto e tipo — medida, voltagem, metragem —, e adivinhar pelo endereco
 * sozinho inventaria codigo. Exigir que o mesmo texto apareca no nome que a
 * loja escreveu transforma o palpite em conferencia: a loja disse duas vezes.
 *
 * Fica por ULTIMO na ordem do codigo. Onde a pagina declara sku, mpn ou
 * productID, o declarado vence — isto so atende quem nao declara nada.
 */
function codigoNaUrl(url, nome) {
  if (!url || !nome) return null;

  let arquivo;
  try {
    arquivo = new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "";
  } catch {
    return null;
  }

  // Fora a extensao (.htm, .html, .aspx), que nao faz parte do codigo.
  const semExtensao = arquivo.replace(/\.[a-z0-9]{2,5}$/i, "");

  // O codigo vive no FIM do slug, e nao no meio: no comeco esta o nome do
  // produto, que tambem tem numero.
  const bruto =
    /(?:^|-)([a-z0-9]+-[a-z0-9]+)$/i.exec(semExtensao)?.[1] ??
    /(?:^|-)([a-z]{2,}[0-9]{2,}[a-z0-9]*)$/i.exec(semExtensao)?.[1] ??
    null;

  if (!bruto) return null;

  // "ref-903" na URL e "Ref. 903" no nome: "ref" e o ROTULO do codigo, nao
  // parte dele. A Unitel (30/09/2026) saia com codigo "ref-903" onde o
  // fabricante chama o produto de "Ref. 903". So tira o rotulo quando sobra um
  // trecho com digito: "ref-x" ou "cod-a" ficam como estao.
  const candidato = bruto.replace(/^(?:ref|cod|codigo|sku)-(?=[a-z0-9]*\d)/i, "");

  // Sem digito nao e codigo, e sim final de nome: "tipo-c", "pic-esp".
  if (!/[0-9]/.test(candidato)) return null;

  // A confirmacao: o mesmo texto tem de estar no nome, ignorando caixa,
  // acento e separador. "AM26LS32" no nome casa com "am26ls32" na URL.
  const achatar = (texto) =>
    texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();

  return achatar(nome).includes(achatar(candidato)) ? candidato : null;
}
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
  // Preco a vista lido do bloco de formas de pagamento, quando a plataforma o
  // serve fora da pagina. Ver pagamento.js.
  doPagamento = null,
}) {
  if (!html) return { produtos: [], motivo: "pagina sem corpo", formatos: [] };

  const estruturado = extrairProduto(html, url);
  const micro = doMicrodata(html);
  const meta = metaTags(html);
  const tray = daTray(html);

  // Listagem da plataforma ASP.NET: a home da Eletrus virava "produto" com o
  // primeiro card da vitrine, sem codigo e com a URL da home.
  if (ehListagemAspNet(html)) {
    return { produtos: [], motivo: "listagem de produtos, nao pagina de produto", formatos: [] };
  }
  const aspnet = daVitrineAspNet(html, url);

  const formatos = [
    estruturado?.fonte,
    micro ? "microdata" : null,
  ].filter(Boolean);

  if (!estruturado?.encontrado && !micro) {
    return { produtos: [], motivo: "sem dados estruturados de produto", formatos };
  }

  const bruto = estruturado?.bruto ?? null;

  // Codigo de cada variante de verdade deste produto (hasVariant[].sku), lido
  // uma vez e usado tanto para nao ler uma tabela de referencia como ficha
  // tecnica (semLinhasDeCodigo) quanto para casar a tabela comparativa de
  // parametros por coluna (especificacoesPorVariante), mais abaixo.
  const identificadoresDeVariante = separarVariacoes(bruto)
    .map((variacao) => variacao.identificador)
    .filter(Boolean);

  // --- precos ---------------------------------------------------------------
  //
  // Na Tray em promocao o dataLayer traz DOIS numeros: `price` e o RISCADO
  // ("de R$ 6,05") e `priceSell` e o que a loja cobra ("R$ 5,75"). Como o riscado
  // e o maior, entrava como candidato e virava o preco normal, e o 5,75 nem
  // chegava a ser candidato — o WJ Componentes saia 6,05 -> 5,58 contra 5,75 ->
  // 5,58 na tela. Riscado nao e preco vigente; o `preco_atual` da pagina
  // confirma o priceSell.
  const trayPrecoTabela = comoNumero(tray?.price);
  const trayPrecoVenda = comoNumero(tray?.priceSell);
  const trayComRiscado = trayPrecoVenda > 0 && trayPrecoTabela > trayPrecoVenda;
  const forseti = precosDaForseti(html, url);
  const robocore = precosDaRoboCore(html, url, micro?.skuFonte ?? estruturado?.skuFonte);

  const declaradoNormal =
    (trayComRiscado ? trayPrecoVenda : null) ??
    aspnet?.de ??
    forseti?.normal ??
    robocore?.normal ??
    comoNumero(meta["product:original_price:amount"]) ??
    comoNumero(bruto?.offers?.priceSpecification?.listPrice) ??
    comoNumero(bruto?.offers?.highPrice) ??
    // PrestaShop publica o preco de tabela numa variavel de script; e o unico
    // lugar onde ele aparece em varias lojas.
    comoNumero(/productPriceWithoutReduction\s*=\s*'([\d.,]+)'/.exec(html)?.[1]);

  // A BASE E O PRECO DE CARTAO (OpenGraph / finalPrice), nunca o do JSON-LD: na
  // Saravati a oferta do JSON-LD ja e o preco do pix, e aplicar os 10% de novo
  // sobre ela dava 12,07 onde a loja cobra 13,41.
  const magentoAVista = aVistaDoMagento(
    html,
    comoNumero(meta["product:price:amount"]) ??
      comoNumero(/data-price-amount="([\d.]+)"\s+data-price-type="finalPrice"/.exec(html)?.[1]),
  );

  const candidatos = [
    estruturado?.preco,
    micro?.preco,
    ...(micro?.precos ?? []),
    comoNumero(meta["product:price:amount"]),
    comoNumero(meta["product:sale_price:amount"]),
    trayComRiscado ? trayPrecoVenda : trayPrecoTabela,
    // O a vista entra como candidato, nao como promocional direto: quem decide
    // qual e o normal e qual e o promocional e decidirPrecos, com a mesma regra
    // que ja vale para as outras lojas.
    aVistaDaTray(tray),
    // Mesma ideia, para a loja que serve o a vista fora da pagina: a Smartkits
    // anuncia 52,15 no pix contra 54,90 de tabela, e nenhum dos dois numeros
    // convive com o outro no HTML.
    doPagamento?.aVista ?? null,
    // Magento com desconto a vista calculado no navegador (Mamute).
    magentoAVista?.aVista ?? null,
    // ASP.NET (Eletrus): preco e a vista escritos no painel.
    aspnet?.preco ?? null,
    aspnet?.aVista ?? null,
    forseti?.aVista ?? null,
    robocore?.aVista ?? null,
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
    [tituloSemSufixoDaLoja(comoTexto(meta["og:title"]), html), "og:title"],
    [estruturado?.titulo, estruturado?.fonte ?? "?"],
  );

  const mpn = primeiro(
    "mpn",
    [aspnet?.referencia, "painel da pagina (Ref:)"],
    [micro?.mpn, "itemprop=mpn"],
    [estruturado?.mpn, estruturado?.fonte ?? "?"],
  );

  // CODIGO e SKU sao um campo so.
  //
  // Eram dois, e na pratica a loja publica um numero unico: o SKU aparecia
  // repetido no "codigo", que era copia dele. Dois campos com o mesmo valor
  // davam a impressao de dois dados coletados onde havia um.
  // O SKU DA TRAY NO JSON-LD E O ID INTERNO, nao o codigo da loja.
  //
  // Medido em tres lojas Tray: onde o JSON-LD publica sku, ele e sempre igual
  // ao idProduct do dataLayer (Smartkits 1079, Arduino Brasil Shop 1001), e o
  // codigo que a pagina mostra ao cliente — "REF: SK1244" — e o reference. A
  // Casa da Robotica nao publica sku nenhum, e por isso ja vinha certa.
  //
  // Sao IGUAIS a proposito: o teste nao adivinha, confere. Loja que um dia
  // publicar um sku proprio, diferente do id, continua vencendo pela ordem
  // normal — este desvio so vale quando esta provado que o sku e o id.
  const skuEhIdInterno =
    tray?.idProduct &&
    String(estruturado?.skuFonte ?? micro?.skuFonte ?? "") === String(tray.idProduct);

  const code = primeiro(
    "code",
    [aspnet?.codigo, "painel da pagina (Cod:)"],
    [skuEhIdInterno ? comoTexto(tray?.reference) : null, "dataLayer da Tray (REF da loja)"],
    [micro?.skuFonte, "itemprop=sku"],
    [estruturado?.skuFonte, estruturado?.fonte ?? "?"],
    [comoTexto(bruto?.productID), "json-ld productID"],
    [comoTexto(tray?.reference), "dataLayer da Tray"],
    [mpn, mpn ? `sem codigo proprio — usando o MPN (${origens.mpn})` : null],
    [codigoNaUrl(url, name), "codigo no endereco, confirmado pelo nome"],
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
    aspnet?.disponibilidade ??
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
    // A RoboCore nunca declara inventoryLevel, e o "(92 un. em estoque)" so
    // existe dentro do JS que atualiza o painel por variante — nao no texto
    // visivel que quantidadeNoTexto varre.
    estoqueDaRoboCore(html, url, code) ??
    quantidadeNoTexto(escopo);

  const status = situacaoDe(disponibilidade);

  // --- imagens --------------------------------------------------------------
  // Na plataforma ASP.NET o Microdata de imagem traz lixo ("Passe o mouse para
  // dar zoom" virava endereco de foto): la vale so a galeria lida do HTML.
  const estruturadas = [
    ...(aspnet?.imagens ?? []),
    ...(aspnet ? [] : (estruturado?.imagens ?? [])),
    ...(aspnet ? [] : (micro?.imagens ?? [])),
    aspnet ? null : meta["og:image"],
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

  // A galeria declarada do Magento vem ANTES das estruturadas: a primeira
  // entrada dela ja e a foto principal, e o `full` e a maior versao — como
  // endereco de Magento nao declara dimensao, quem chega primeiro e quem fica.
  const doMagento = galeriaDoMagento(html, url);

  // O catalogo SOMA, nao substitui. Ele vem primeiro porque e declarado pela
  // loja e ja vem na ordem certa, mas nao pode calar a leitura da pagina: a
  // listagem da Tray trunca em QUATRO imagens por produto (medido: todo item
  // da listagem tem 4; o detalhe do mesmo produto tem 9). Deixando o catalogo
  // vencer sozinho, cinco fotos que a pagina tinha eram perdidas.
  const images = semRepetir([
    ...(doCatalogo?.imagens ?? []),
    ...doMagento,
    ...estruturadas,
    ...galeria,
  ]);

  // --- descricao ------------------------------------------------------------
  // A plataforma ASP.NET ja le a propria aba (aspnet.descricao).
  const daAba = aspnet ? null : descricaoDaAba(html);

  // Com a aba "Descrição" lida, o og:description SAI da disputa. Ele e resumo de
  // SEO — e na Unitel (30/09/2026) e o texto da EMPRESA colado ao titulo ("...
  // A Unitel Transformadores e uma empresa do ramo eletroeletronico fundada em
  // abril..."), o mesmo em todo produto. O cabo USB-C dela tem na aba so "Peso:
  // 0,060kg": pela regra da mais longa, o texto da empresa vencia e a descricao
  // do produto nunca chegava. O texto que a pagina mostra ao cliente vale mais
  // que a meta tag; sem aba, o og:description continua entrando como antes.
  const description = descricaoDaRoboCore(html, url) ?? melhorDescricao([
    aspnet?.descricao,
    estruturado?.descricao,
    micro?.descricao,
    daAba ? null : comoTexto(meta["og:description"]),
    descricaoDoBloco(html),
    daAba,
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

  // A lista HTML SOMA a tabela, nao espera ela faltar: a Mamute tem uma tabela de
  // atributos com UMA linha ("Fabricante: IMP") e a ficha de verdade na lista da
  // descricao — com "tabela ou lista", as quatro especificacoes sumiam.
  const daListaHtml = especificacoesDeListaHtml(html);
  const juntas = juntarFichas(juntarFichas(aspnet?.especificacoes ?? [], declaradas), daListaHtml);

  const specifications = semLinhasDeCodigo(
    juntas.length > 0 ? juntas : especificacoesDeLista(description),
    identificadoresDeVariante,
  );

  const ean = primeiro(
    "ean",
    [micro?.ean, "itemprop=gtin"],
    [estruturado?.ean, estruturado?.fonte ?? "?"],
    [comoTexto(tray?.EAN), "dataLayer da Tray"],
    [eanDaFicha(specifications), "ficha tecnica da descricao"],
  );
  // Marca e modelo caem para a ficha tecnica quando nao vem estruturados: nas
  // lojas menores eles so existem escritos ali.
  const brand = primeiro(
    "brand",
    [aspnet?.marca, "painel da pagina (Marca:)"],
    [micro?.marca, "itemprop=brand"],
    [estruturado?.marca, estruturado?.fonte ?? "?"],
    [comoTexto(meta["product:brand"]), "meta product:brand"],
    [comoTexto(tray?.brand), "dataLayer da Tray"],
    [daFichaTecnica(specifications, /^(marca|fabricante|brand|manufacturer)$/i), "ficha tecnica da descricao"],
  );
  const model = primeiro(
    "model",
    [aspnet?.referencia, "painel da pagina (Ref:)"],
    [estruturado?.modelo, estruturado?.fonte ?? "?"],
    [micro?.modelo, "itemprop=model"],
    [comoTexto(tray?.model), "dataLayer da Tray"],
    [daFichaTecnica(specifications, /^(modelo|model|refer[eê]ncia)$/i), "ficha tecnica da descricao"],
  );

  // A ficha tecnica e a unica fonte: rotulo conhecido (IPI, ICMS, ST) com
  // percentual ao lado. Varrer atras de qualquer % traria garantia e desconto.
  const impostos = impostosDaFicha(specifications);

  // O que virou imposto sai da ficha: ele tem campo proprio ao lado do preco,
  // e repetir a linha crua diria a mesma coisa sem o valor que ela produz.
  const fichaSemImpostos = semImpostos(specifications);

  // Especificacao que muda por variante (a Metaltex: "Saida (carga)" vai de
  // 60A a 100A entre os codigos do mesmo rele), lida da tabela comparativa da
  // pagina. So roda quando ha mais de uma variante — tabela de uma coluna so
  // nao compara nada.
  const especPorVariante = especificacoesPorVariante(html, identificadoresDeVariante);

  const ncm = primeiro(
    "ncm",
    [doCatalogo?.ncm ?? null, "catalogo publico da plataforma"],
    [acharNcm(specifications, description), "ficha tecnica ou descricao"],
  );
  const seo = dadosDeSeo(html, meta, url);
  if (Object.values(seo).some(Boolean)) origens.seo = "meta tags da pagina";
  const category = primeiro(
    "category",
    [aspnet?.categoria, "breadcrumb da pagina"],
    [categoriaDaRoboCore(html, url), "breadcrumb da pagina"],
    [micro?.categoria, "breadcrumb"],
    [comoTexto(bruto?.category), "json-ld category"],
    [doDataLayer(html, code), "dataLayer de analytics"],
  );

  if (prices.normal !== null) {
    origens.precoNormal = trayComRiscado
      ? `dataLayer da Tray (priceSell); o price de R$ ${trayPrecoTabela.toFixed(2).replace(".", ",")} e o riscado`
      : declaradoNormal
        ? "preco de tabela declarado"
        : "maior preco da pagina";
  }
  if (prices.promotional !== null) {
    // Dizer QUAL bloco trouxe o desconto importa: o a vista da Tray nao esta na
    // pagina, e um promocional sem essa nota pareceria lido do HTML por quem
    // fosse conferir a mao e nao o encontrasse la.
    //
    // E dizer se foi LIDO ou CALCULADO importa mais ainda. O desconto e da
    // loja, entao ele e perguntado uma vez por fonte e aplicado ao resto — quem
    // conferir precisa saber em qual dos dois casos este produto caiu.
    origens.precoPromocional =
      doPagamento && prices.promotional === doPagamento.aVista
        ? doPagamento.derivado
          ? `calculado: desconto de ${doPagamento.desconto}% da loja, conferido em ${doPagamento.conferidoEm} leitura(s)`
          : `formas de pagamento${doPagamento.desconto ? ` — desconto de ${doPagamento.desconto}%` : ""}`
        : robocore && prices.promotional === robocore.aVista
          ? "painel da RoboCore: preco a vista no PIX"
        : forseti && prices.promotional === forseti.aVista
          ? "painel da Forseti: preco a vista no PIX"
        : aspnet?.aVista && prices.promotional === aspnet.aVista
          ? "a vista escrito na pagina"
          : magentoAVista && prices.promotional === magentoAVista.aVista
          ? `calculado: desconto a vista de ${magentoAVista.desconto}% do parcelamento da loja`
          : "menor preco da pagina";
  }
  const documentos = documentosDaPagina(html, url);

  if (description) origens.description = "texto mais longo entre as fontes";
  if (documentos.length) origens.documentos = `${documentos.length} link(s) de download`;
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
    prices: {
      ...prices,
      // Distribuidor cobra imposto por fora: o preco de tabela e um numero, o
      // que se paga e outro. Guardados separados para dar para comparar
      // fornecedor que embute imposto com fornecedor que nao embute.
      comImpostos: precoComImpostos(prices.normal, impostos),
    },
    taxes: impostos,
    stock: {
      status,
      // Sem quantidade declarada, null — "em estoque" nao autoriza inventar um
      // numero. Zero so quando a loja diz que acabou.
      quantity: quantidade ?? (status === "OUT_OF_STOCK" ? 0 : null),
      // Vitrine de loja nao anuncia o que ainda vai chegar: isso e informacao
      // de fornecedor e vem por arquivo. Null aqui para o campo ter a mesma
      // forma nos dois caminhos.
      aChegar: null,
    },
    description,
    specifications: fichaSemImpostos ?? [],
    documentos,
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

  // Variacao com identificador proprio e DIFERENTE do produto de origem vira um
  // registro independente.
  const variacoesReais = separarVariacoes(bruto).filter(
    (variacao) => variacao.identificador && variacao.identificador !== code,
  );

  // O node do ProductGroup pode ser so um involucro de variantes, sem ser ele
  // mesmo um item compravel. A Metaltex publica "Rele TZC-F com Dissipador e
  // Ventilador" com tres variantes (60A/80A/100A) e NENHUM sku nem oferta no
  // proprio grupo — a pagina nem chega a marcar uma opcao ao carregar (o
  // usuario mediu isso na tela: nenhuma amperagem vem selecionada). Sem
  // codigo do grupo e com variante de verdade, o "N/A" nao e um produto: e
  // so o rotulo da familia, e gravar ele criaria um item fantasma por
  // produto com variante, sem forma de comprar aquele "N/A".
  //
  // Quando o grupo TEM codigo proprio (o ESP32 NodeMCU do teste, sku "08240"
  // com oferta e preco no proprio grupo), ele continua sendo um produto de
  // verdade, igual antes.
  const grupoEhSoInvolucro = !code && variacoesReais.length > 0;

  const produtos = grupoEhSoInvolucro
    ? []
    : codigos.length > 1
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

  for (const variacao of variacoesReais) {
    const precoVariacao = comoNumero(variacao.bruto?.offers?.price);
    // Parametro proprio da coluna desta variante (ex.: "Saida (carga): 60A")
    // vence o valor compartilhado do grupo, que pode nem existir ou ser o
    // texto generico ("48 a 440 VCA ou 48 a 530 VCA") lido da descricao.
    const especDaVariacao = especPorVariante.get(variacao.identificador) ?? [];

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
        aChegar: null,
      },
      specifications: especDaVariacao.length
        ? juntarFichas(especDaVariacao, base.specifications)
        : base.specifications,
      // Ja e um produto proprio: repetir as opcoes do grupo aqui sugeriria que
      // ele ainda pode virar outra coisa.
      variants: [],
    });
  }

  return { produtos, motivo: null, formatos, fonte };
}

/** Campos essenciais presentes? Sem eles a pagina nao conta como produto. */
export function ehProdutoValido(produto, tipoDaFonte = null) {
  const exigidos =
    tipoDaFonte === "FORNECEDOR" ? ESSENCIAIS_FORNECEDOR : ESSENCIAIS;

  return exigidos.every((campo) =>
    campo === "preco"
      ? typeof produto?.prices?.normal === "number" && produto.prices.normal > 0
      : Boolean(produto?.[campo]),
  );
}

import { buscarPagina } from "./buscar";
import { extrairProduto } from "./extrair";
import { ehRoboCore } from "./robocore";

/**
 * Descoberta de paginas de produto por navegacao.
 *
 * Existe porque a premissa do sitemap nao se sustentou no primeiro site real:
 * a Usinainfo declara no robots.txt um sitemap de ROTAS DE BUSCA (doze
 * enderecos /busca/...), nao tem /sitemap.xml, e ainda assim publica OpenGraph
 * com preco em cada produto. Sem este caminho, um site inteiramente aproveitavel
 * seria dado como incompativel.
 *
 * O rastreamento e em largura, a partir do endereco cadastrado, e SO dentro do
 * mesmo dominio. Cada pagina visitada e testada: se extrai um produto, e
 * produto; de qualquer forma, os links dela entram na fila. Assim descobrir e
 * coletar acontecem na mesma passada — rastrear para listar e depois visitar
 * de novo para ler dobraria as visitas ao site alheio.
 */

/// Caminhos que nunca sao produto e so gastariam visita. Nao e uma lista de
/// bloqueio de seguranca — o robots.txt cuida disso — e sim de economia.
const IGNORAR = [
  /\/(carrinho|cart|checkout|login|conta|account|minha-conta|cadastro|busca|search|blog|noticias|contato|institucional|politica|termos|sobre)(\/|$)/i,
  /\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|css|js|xml|ico)(\?|$)/i,
];

/// Parametros de ordenacao e filtro geram infinitas URLs para a mesma pagina.
/// Segui-los prenderia o rastreamento numa mesma vitrine para sempre.
const PARAMETROS_RUINS = /[?&](orderby|orderway|tag|search_query|id_currency|back|n|p|page|q)=/i;

/**
 * A URL tem cara de pagina de produto?
 *
 * Nao decide nada sozinha — quem decide e a extracao. Serve so para ORDENAR a
 * fila: em largura pura, o rastreamento visita todas as categorias antes de
 * chegar ao primeiro produto, e a conferencia do cadastro esgotava o orcamento
 * sem nunca ver um. Os dois sinais valem em quase toda loja: terminacao .html
 * (PrestaShop, Magento) e o id numerico no fim do slug.
 */
export function pareceProduto(url) {
  const caminho = url.split("?")[0];
  // RoboCore usa /categoria/produto, sem extensao nem id numerico no final.
  if (ehRoboCore(url)) {
    const endereco = new URL(url);
    return /^\/(?!tutoriais\/|modules\/)[^/]+\/[^/]+\/?$/.test(endereco.pathname);
  }
  return (
    /\.html?$/i.test(caminho) ||
    /-\d{3,}(\.|\/|$)/.test(caminho) ||
    // "/{slug}/p": a plataforma ASP.NET da Eletrus (16/09/2026) e a VTEX.
    /\/[^/]+\/p\/?$/i.test(caminho)
  );
}

/**
 * A URL tem cara de LISTAGEM (categoria, departamento, marca)? Serve para mandar
 * essas para o fim da fila do sitemap: o da Eletrus lista as 249 categorias antes
 * dos 1.825 produtos, e a amostra do teste abria so categoria.
 */
export function pareceListagem(url) {
  const caminho = url.split("?")[0];
  return /\/(produtos|categorias?|category|categories|departamentos?|colecao|colecoes|marcas?|brands?)(\/|$)/i.test(caminho);
}

function ehSeguivel(url, origem, prefixo) {
  if (!url.startsWith(origem)) return false;
  if (PARAMETROS_RUINS.test(url)) return false;
  if (IGNORAR.some((padrao) => padrao.test(url))) return false;
  if (prefixo && !url.includes(prefixo)) return false;
  return true;
}

/** Links do mesmo dominio, ja absolutos e sem ancora. */
function linksDe(html, urlBase, origem, prefixo) {
  const achados = new Set();

  for (const encontro of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    let absoluta;
    try {
      absoluta = new URL(encontro[1], urlBase);
    } catch {
      continue;
    }

    absoluta.hash = "";
    const texto = absoluta.toString();

    // O prefixo restringe o que COLETAMOS, mas nao o que navegamos: a vitrine
    // que lista os produtos da secao costuma estar fora dela.
    if (texto.startsWith(origem) && !PARAMETROS_RUINS.test(texto) && !IGNORAR.some((p) => p.test(texto))) {
      achados.add(texto);
    }
  }

  return [...achados];
}

/**
 * FREIO DE SECURA: paginas abertas em sequencia sem UM produto novo.
 *
 * O teto de 20.000 paginas nao bastava. O Eletrogate declara 2.033 produtos no
 * catalogo publico e a colheita fecha em 2.030: por causa de TRES itens que a
 * loja conta e nao publica, a navegacao saiu atras deles e passou 6h40 abrindo
 * 6.111 paginas sem gravar nada (17/09/2026). Loja com produto a achar acha bem
 * antes de trezentas paginas seguidas — a Usinainfo, que so se varre por
 * navegacao, acha um produto a cada duas paginas.
 */
const SEM_ACHADO = 300;

/**
 * Rastreia o site chamando `aoAchar` para cada pagina que extrai um produto.
 *
 * @param {object} opcoes
 * @param {string} opcoes.semente      por onde comecar
 * @param {string} [opcoes.prefixo]    so coleta o que estiver sob este trecho
 * @param {number} [opcoes.orcamento]  teto de paginas VISITADAS
 * @param {(achado: {url: string, html: string, dados: object, resposta: object}) => Promise<void>} [opcoes.aoAchar]
 * @param {(andamento: {visitadas: number, produtos: number}) => Promise<void>} [opcoes.aoProgredir]
 *   chamado a CADA pagina aberta. Quem grava em banco decide o proprio ritmo: o
 *   worker guarda em memoria e grava por relogio. Chamado so a cada 25 paginas,
 *   uma loja que pede 10 s entre visitas passava mais de quatro minutos sem dar
 *   sinal, e o vigia de "varredura parada" nao teria como distinguir isso de
 *   uma varredura travada.
 * @param {AbortSignal} [opcoes.sinal] cancela o rastreamento entre paginas e a
 *   requisicao em voo
 */
export async function rastrear({
  semente,
  prefixo,
  orcamento = 300,
  pararApos = Infinity,
  aoAchar,
  aoProgredir,
  paginasConhecidas,
  sinal = null,
  pular = null,
  pararSemAchado = SEM_ACHADO,
  buscar = buscarPagina,
}) {
  const inicio = new URL(semente);
  const origem = inicio.origin;

  const fila = [inicio.toString()];
  const jaVistas = new Set(fila);
  const conhecidas = new Map(
    (paginasConhecidas ?? []).map((pagina) => [pagina.url, pagina]),
  );

  let visitadas = 0;
  let produtos = 0;
  // Paginas abertas desde o ultimo produto NOVO. Retomado nao zera: ele nao
  // custou visita e nao prova que ainda ha o que achar por aqui.
  let semAchado = 0;
  let secou = false;
  // Paginas de produto ja gravadas antes de uma queda (retomada): contam como
  // produto e nao sao abertas.
  let pulados = 0;
  const urlsDeProduto = [];

  while (fila.length > 0 && visitadas < orcamento && produtos < pararApos && !sinal?.aborted) {
    const url = fila.shift();
    const anterior = conhecidas.get(url);

    if (pular?.(url)) {
      produtos++;
      pulados++;
      if (aoProgredir) await aoProgredir({ visitadas, produtos, pulados });
      continue;
    }

    const resposta = await buscar(url, {
      etag: anterior?.etag ?? undefined,
      vistoEm: anterior?.vistoEm ?? undefined,
      sinal,
    });
    visitadas++;

    // 304 confirma que a pagina nao mudou. Ela segue sendo produto (se ja era),
    // mas nao ha corpo para tirar links novos.
    if (resposta.naoModificado) {
      if (anterior) {
        produtos++;
        semAchado = 0;
        urlsDeProduto.push(url);
        if (aoAchar) await aoAchar({ url, html: null, dados: null, resposta });
      }
      continue;
    }

    if (!resposta.ok || !resposta.corpo) continue;

    const dados = extrairProduto(resposta.corpo, resposta.urlFinal ?? url);

    if (dados.encontrado && ehSeguivel(url, origem, prefixo)) {
      const aceito = await aoAchar?.({ url, html: resposta.corpo, dados, resposta });
      // O normalizador pode rejeitar uma pagina que so parecia produto.
      // Ela nao pode consumir uma vaga na amostra solicitada.
      if (aceito !== false) {
        produtos++;
        semAchado = 0;
        urlsDeProduto.push(url);
      } else {
        semAchado++;
      }
    } else if (++semAchado >= pararSemAchado) {
      // O site ainda responde, mas nao ha mais o que achar por aqui.
      secou = true;
      if (aoProgredir) await aoProgredir({ visitadas, produtos, pulados });
      break;
    }

    // Quem parece produto fura a fila; o resto vai para o fim. Sem isso, um
    // site com cinquenta categorias gasta cinquenta visitas antes do primeiro
    // produto.
    for (const link of linksDe(resposta.corpo, url, origem, prefixo)) {
      if (jaVistas.has(link)) continue;
      jaVistas.add(link);

      if (pareceProduto(link)) fila.unshift(link);
      else fila.push(link);
    }

    if (aoProgredir) await aoProgredir({ visitadas, produtos, pulados });
  }

  if (aoProgredir) await aoProgredir({ visitadas, produtos, pulados });

  return {
    visitadas,
    produtos,
    pulados,
    // Parou pelo freio de secura, e nao por acabar o site ou o orcamento.
    secou,
    semAchado,
    urls: urlsDeProduto,
    // Sobrou fila: o orcamento acabou antes do site. A tela precisa saber para
    // nao dar o numero como total do catalogo.
    parcial: fila.length > 0,
  };
}

/**
 * Rastreamento curto so para responder "este site funciona?".
 *
 * Para no primeiro produto encontrado: a resposta que o cadastro precisa e
 * binaria, e visitar o site inteiro para dar uma resposta binaria seria abuso.
 */
export async function acharUmProduto(semente, prefixo, orcamento = 20) {
  let achado = null;

  await rastrear({
    semente,
    prefixo,
    orcamento,
    pararApos: 1,
    aoAchar: async (item) => {
      if (!achado) achado = item;
    },
  });

  return achado;
}

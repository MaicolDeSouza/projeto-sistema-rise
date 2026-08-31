import { buscarPagina, podeVisitar } from "./buscar";
import { acharUmProduto, rastrear } from "./descobrir";
import { extrairProduto, resumirExtracao } from "./extrair";
import { gravarPagina } from "./gravar";
import { descobrirSitemaps, lerSitemaps } from "./sitemap";

/**
 * Orquestracao: visitar, extrair, gravar.
 *
 * Junta as pecas sem conhecer banco nem tela, para que a mesma sequencia sirva
 * ao botao "Atualizar tabelas", ao worker de 24 horas e a coleta de uma URL
 * avulsa no cadastro. Um caminho so — nao existe "modo manual" com codigo
 * proprio para divergir do automatico.
 */

/// Quantos sitemaps ler ao conferir um site novo. Loja grande encadeia dezenas;
/// ler todos deixaria o cadastro parado por minutos. Tres dao a ordem de
/// grandeza, e a tela avisa que o total e "pelo menos" o contado.
const SITEMAPS_NA_CONFERENCIA = 3;

/** Visita uma URL e grava o resultado. */
export async function coletarUrl({ fonte, url, etag, vistoEm }) {
  const resposta = await buscarPagina(url, { etag, vistoEm });

  const extraido =
    resposta.ok && resposta.corpo
      ? extrairProduto(resposta.corpo, resposta.urlFinal ?? url)
      : null;

  return gravarPagina({ fonte, url, resposta, extraido });
}

/**
 * Confere um site antes de cadastra-lo.
 *
 * E a parte mais valiosa do cadastro: descobrir em segundos que um site nao
 * publica dados estruturados — e precisaria de adaptador proprio — evita
 * esperar uma varredura inteira para receber nada. Nada e gravado aqui.
 *
 * O tipo da URL colada e decidido por EVIDENCIA, tentando extrair um produto
 * dela, e nao pelo formato do endereco: ha loja com produto na raiz e categoria
 * com barra no fim, e chutar pelo desenho da URL erra nos dois casos.
 */
export async function conferirSite(urlColada) {
  let alvo;
  try {
    alvo = new URL(
      /^https?:\/\//i.test(urlColada) ? urlColada : `https://${urlColada}`,
    );
  } catch {
    return { ok: false, erro: "Endereco invalido." };
  }

  const origem = alvo.origin;
  const dominio = alvo.hostname;

  const permissao = await podeVisitar(alvo.toString());

  // Bloqueio se respeita: nada mais e buscado neste site.
  if (!permissao.permitido) {
    return {
      ok: true,
      dominio,
      origem,
      url: alvo.toString(),
      prefixoUrl: null,
      robotsPermite: false,
      robotsMotivo: permissao.motivo,
      ehPaginaDeProduto: false,
      sitemaps: [],
      totalUrls: 0,
      totalParcial: false,
      amostra: null,
      resumo: `robots.txt bloqueia — ${permissao.motivo}`,
    };
  }

  // 1) A URL colada e, ela mesma, uma pagina de produto?
  const visita = await buscarPagina(alvo.toString());
  const extraido =
    visita.ok && visita.corpo
      ? extrairProduto(visita.corpo, visita.urlFinal ?? alvo.toString())
      : null;

  const ehPaginaDeProduto = Boolean(extraido?.encontrado);

  // Produto solto registra o dominio inteiro; secao vira prefixo. Raiz sem
  // caminho nao tem prefixo nenhum.
  const caminho = alvo.pathname.replace(/\/+$/, "");
  const prefixoUrl = ehPaginaDeProduto || !caminho ? null : `${caminho}/`;

  // 2) e 3) Sitemaps e dimensao da varredura.
  const sitemaps = await descobrirSitemaps(origem);
  let totalUrls = 0;
  let totalParcial = false;
  let primeiraUrl = null;

  if (sitemaps.length > 0) {
    const leitura = await lerSitemaps(sitemaps, {
      prefixo: prefixoUrl ?? undefined,
      maxSitemaps: SITEMAPS_NA_CONFERENCIA,
    });
    totalUrls = leitura.urls.length;
    totalParcial = leitura.parcial;
    primeiraUrl = leitura.urls[0]?.url ?? null;
  }

  // 4) Amostra: a propria pagina quando ela e produto; senao, a primeira do
  // sitemap. Sem amostra nao da para afirmar que a extracao funciona.
  let amostra = null;
  let descoberta = "sitemap";

  if (ehPaginaDeProduto) {
    amostra = { url: alvo.toString(), dados: extraido, resumo: resumirExtracao(extraido) };
  } else if (primeiraUrl) {
    const visitaAmostra = await buscarPagina(primeiraUrl);
    const dadosAmostra =
      visitaAmostra.ok && visitaAmostra.corpo
        ? extrairProduto(visitaAmostra.corpo, primeiraUrl)
        : null;

    if (dadosAmostra?.encontrado) {
      amostra = { url: primeiraUrl, dados: dadosAmostra, resumo: resumirExtracao(dadosAmostra) };
    }
  }

  // O sitemap declarado nem sempre lista produtos. A Usinainfo, por exemplo,
  // aponta no robots.txt um sitemap de rotas de busca e nao tem /sitemap.xml —
  // e ainda assim publica OpenGraph com preco em cada produto. Desistir aqui
  // daria um site inteiramente aproveitavel como incompativel, entao a
  // navegacao entra como segundo caminho.
  if (!amostra) {
    const achado = await acharUmProduto(alvo.toString(), prefixoUrl);
    if (achado) {
      descoberta = "navegacao";
      amostra = {
        url: achado.url,
        dados: achado.dados,
        resumo: resumirExtracao(achado.dados),
      };
    }
  }

  const extraiu = Boolean(amostra?.dados?.encontrado);

  const ondeAchar =
    descoberta === "navegacao"
      ? "o sitemap nao lista produtos — a varredura vai navegar pelo site"
      : sitemaps.length > 0
        ? `${totalParcial ? "pelo menos " : ""}${totalUrls} endereco(s) no sitemap`
        : "sitemap nao encontrado — a varredura vai navegar pelo site";

  return {
    ok: true,
    dominio,
    origem,
    url: alvo.toString(),
    prefixoUrl,
    robotsPermite: true,
    robotsMotivo: null,
    ehPaginaDeProduto,
    // Sitemap so fica gravado quando de fato leva a produto; senao a varredura
    // seguiria uma lista que ja se provou inutil.
    sitemaps: descoberta === "sitemap" ? sitemaps : [],
    descoberta,
    totalUrls: descoberta === "sitemap" ? totalUrls : 0,
    totalParcial,
    descobertaMostra: ondeAchar,
    amostra,
    resumo: [
      ondeAchar,
      "robots.txt permite",
      extraiu ? resumirExtracao(amostra.dados) : "extracao falhou (sem dados estruturados)",
    ].join(" · "),
  };
}

/**
 * Varre uma fonte inteira.
 *
 * `aoProgredir` recebe {total, feitas} para o worker registrar andamento no
 * payload do Job — e o que a tela le para mostrar a barra.
 */
/// Teto de paginas visitadas numa varredura por navegacao. A 1 req/2s sao umas
/// tres horas — muito para uma noite so, mas a varredura seguinte recomeca da
/// semente e o site vai sendo coberto aos poucos.
const ORCAMENTO_NAVEGACAO = 5000;

export async function varrerFonte(fonte, paginasConhecidas, aoProgredir) {
  if (!fonte.robotsPermite || !fonte.ativa) {
    return { total: 0, feitas: 0, contagem: {}, erro: "fonte bloqueada ou pausada" };
  }

  const conhecidas = new Map(
    (paginasConhecidas ?? []).map((pagina) => [pagina.url, pagina]),
  );

  const sitemaps = fonte.urlSitemap ? [fonte.urlSitemap] : [];

  // Sem sitemap util, navega. E o caminho para as lojas que nao publicam
  // sitemap de produto — a maioria das que nao usam plataforma grande.
  if (sitemaps.length === 0) {
    const semente = `https://${fonte.dominio}${fonte.prefixoUrl ?? "/"}`;
    const contagemNav = {};

    const resultado = await rastrear({
      semente,
      prefixo: fonte.prefixoUrl ?? undefined,
      orcamento: ORCAMENTO_NAVEGACAO,
      paginasConhecidas,
      aoAchar: async ({ url, dados, resposta }) => {
        const gravado = await gravarPagina({ fonte, url, resposta, extraido: dados });
        contagemNav[gravado.acao] = (contagemNav[gravado.acao] ?? 0) + 1;
      },
      aoProgredir: aoProgredir
        ? ({ visitadas, produtos }) =>
            aoProgredir({ total: ORCAMENTO_NAVEGACAO, feitas: visitadas, produtos })
        : undefined,
    });

    return {
      total: resultado.visitadas,
      feitas: resultado.visitadas,
      contagem: contagemNav,
      descoberta: "navegacao",
      erro: null,
    };
  }

  const { urls } = await lerSitemaps(sitemaps, {
    prefixo: fonte.prefixoUrl ?? undefined,
  });

  const contagem = {};
  let feitas = 0;

  for (const item of urls) {
    const anterior = conhecidas.get(item.url);

    // O <lastmod> do sitemap NAO e usado para pular pagina, embora fosse
    // tentador: loja muda preco sem mexer no lastmod com frequencia, e confiar
    // nele faria a varredura ignorar justamente o que ela existe para vigiar —
    // uma queda de preco do concorrente passaria em branco, sem erro nenhum na
    // tela. O que da barateza aqui e o ETag/If-Modified-Since, que quem
    // responde e o servidor, olhando o conteudo de verdade. O ganho de tempo
    // seria pequeno de todo modo: a varredura e limitada pelo ritmo de uma
    // requisicao a cada dois segundos, nao pela banda.
    const resultado = await coletarUrl({
      fonte,
      url: item.url,
      etag: anterior?.etag ?? undefined,
      vistoEm: anterior?.vistoEm ?? undefined,
    });
    contagem[resultado.acao] = (contagem[resultado.acao] ?? 0) + 1;

    feitas++;
    if (aoProgredir && feitas % 25 === 0) await aoProgredir({ total: urls.length, feitas });
  }

  if (aoProgredir) await aoProgredir({ total: urls.length, feitas });
  return { total: urls.length, feitas, contagem, erro: null };
}

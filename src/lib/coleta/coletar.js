import { lerArquivosDaFonte, lerColeta, salvarColeta } from "./arquivo";
import { juntarListas, lerArquivo } from "./arquivos";
import { conciliar, quedaSuspeita } from "./conciliar";
import { regrasDoFornecedor } from "./fornecedores";
import { buscarPagina, podeVisitar } from "./buscar";
import { colherProdutos } from "./colher";
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

/// Quantos produtos cada fonte deve render numa varredura. Combinado com o
/// dono: 20 por concorrente ou fornecedor — o bastante para conferir a
/// extracao com material real, sem varrer catalogo inteiro enquanto os testes
/// correm.
export const PRODUTOS_POR_FONTE = 20;

/**
 * Reprocessa a ultima lista que o fornecedor mandou.
 *
 * ARQUIVO NAO SE ATUALIZA SOZINHO — ele e uma foto do dia em que o fornecedor
 * mandou. O que a varredura faz e ler de novo o que esta guardado, com os
 * leitores de hoje. Por isso o resumo diz a data da LISTA, e nao so a do
 * reprocessamento: sem ela, uma lista de tres semanas atras parece tao fresca
 * quanto a vitrine varrida agora.
 */
async function reprocessarArquivos(fonte, guardados, aoProgredir) {
  const comecou = Date.now();
  const regras = regrasDoFornecedor({ nome: fonte.nome, url: `https://${fonte.dominio}` });
  const lidos = [];

  for (const arquivo of guardados.arquivos) {
    const leitura = await lerArquivo({
      nome: arquivo.nome,
      bytes: arquivo.bytes,
      fonte: { name: fonte.nome, type: fonte.tipo },
    });
    lidos.push(leitura);

    if (aoProgredir) {
      await aoProgredir({ total: guardados.arquivos.length, feitas: lidos.length });
    }
  }

  // A pronta entrega vem primeiro: em juntarListas quem chega antes vence, e o
  // preco a manter e o dela — medido na Fortek, onde o 65-276 custa 79,90 na
  // reserva e 82,90 na pronta entrega.
  const ordenados = [...lidos].sort(
    (a, b) => (a.modalidade === "RESERVA" ? 1 : 0) - (b.modalidade === "RESERVA" ? 1 : 0),
  );

  const listas = ordenados.map((leitura) => leitura.produtos);
  let produtos =
    listas.length > 1
      ? juntarListas(listas, { sufixoDeCarga: regras.sufixoDeCarga })
      : (listas[0] ?? []);

  if (produtos.length === 0) {
    return {
      total: guardados.arquivos.length,
      feitas: 0,
      produtos: 0,
      arquivo: null,
      erro: "nenhum produto reconhecido nos arquivos guardados",
    };
  }

  // Site + arquivo, quando a regra do fornecedor diz que sao o mesmo catalogo
  // pela metade: a Nightech publica foto, texto e endereco no site e preco e
  // saldo na planilha. Mesmo codigo = um produto.
  if (regras.mesclarSiteComArquivo && fonte.robotsPermite) {
    const doSite = await colherProdutos({
      url: `https://${fonte.dominio}/`,
      secao: fonte.prefixoUrl ?? undefined,
      nome: fonte.nome,
      tipo: fonte.tipo,
      limite: PRODUTOS_POR_FONTE,
    });

    // Site ANTES do arquivo: quem chega primeiro vence, e a foto e a descricao
    // de venda sao do site.
    if (doSite.produtos.length > 0) {
      produtos = juntarListas([doSite.produtos, produtos]);
    }
  }

  const anterior = await lerColeta(fonte.dominio);

  // TRAVA: lista muito menor que a anterior nao e aplicada.
  const queda = quedaSuspeita({
    anteriores: anterior?.produtos,
    novos: produtos,
    origemAnterior: anterior?.origem,
  });

  if (queda) {
    return {
      total: guardados.arquivos.length,
      feitas: 0,
      produtos: 0,
      arquivo: null,
      erro:
        `a lista nova tem ${queda.agora} produto(s) contra ${queda.antes} da anterior — ` +
        `${queda.percentual}% sumiriam. Confira se o conjunto esta completo ` +
        `(a Fortek manda duas listas) e envie de novo.`,
    };
  }

  const { produtos: conciliados, resumo: contagem } = conciliar({
    anteriores: anterior?.produtos,
    novos: produtos,
    dataDaLista: guardados.manifesto?.enviadoEm,
  });

  const resumo =
    `${conciliados.length} produto(s) · ${contagem.novos} novo(s), ` +
    `${contagem.atualizados} atualizado(s), ${contagem.ausentes} ausente(s) da lista · ` +
    `lista de ${new Date(guardados.manifesto?.enviadoEm ?? Date.now()).toLocaleDateString("pt-BR")}`;

  const arquivo = await salvarColeta({
    fonte: {
      nome: fonte.nome,
      dominio: fonte.dominio,
      tipo: fonte.tipo,
      url: `https://${fonte.dominio}/`,
      secao: fonte.prefixoUrl ?? null,
    },
    produtos: conciliados,
    resumo,
    origem: "arquivo",
    listaEnviadaEm: guardados.manifesto?.enviadoEm ?? null,
    duracaoMs: Date.now() - comecou,
  });

  return {
    total: guardados.arquivos.length,
    feitas: guardados.arquivos.length,
    produtos: conciliados.length,
    visitas: 0,
    arquivo,
    resumo,
    contagem,
    /*
      Para fornecedor que manda lista, O CATALOGO E A LISTA. Nao ha vitrine
      para contar: o total do fornecedor e o que a lista declara, ja conciliado
      com o que estava guardado — inclusive os ausentes, que continuam sendo
      produtos dele, so sem saldo confirmado nesta remessa.
    */
    produtosNoSite: conciliados.length,
    produtosNoSiteParcial: false,
    erro: null,
  };
}

/**
 * Varredura de uma fonte GRAVANDO EM JSON.
 *
 * E o que o botao "Atualizar tabelas" faz hoje. O banco fica parado de
 * proposito ate os testes terminarem: o schema e o `varrerFonte` abaixo
 * continuam de pe, mas *o que* se guarda ainda nao foi decidido, e gravar antes
 * disso enche a tabela com o formato errado.
 *
 * USA O MESMO CAMINHO DO "TESTAR FONTE" — colherProdutos —, mudando so o
 * limite. Era aqui que as duas trilhas divergiam: a tela mostrava o que o
 * normalizador completo extraia e a varredura gravava o que um extrator antigo
 * entendia, entao o que o operador aprovava no cadastro nao era o que ficava
 * guardado. Com uma funcao so, a divergencia deixa de ser possivel.
 */
export async function varrerFonteParaJson(fonte, aoProgredir) {
  const comecou = Date.now();
  // FORNECEDOR COM ARQUIVO NAO SE VARRE: reprocessa.
  //
  // A Fortek e um portal atras de login — varrer devolve zero. E onde ha lista
  // enviada, ela e a fonte melhor de qualquer jeito: traz preco e saldo, que a
  // vitrine de atacado nao publica.
  if (fonte.tipo === "FORNECEDOR" && fonte.ativa) {
    const guardados = await lerArquivosDaFonte(fonte.dominio);
    if (guardados.arquivos.length > 0) {
      return reprocessarArquivos(fonte, guardados, aoProgredir);
    }
  }

  // Pausada e bloqueada nao se varre. "Pausar mantem tudo que ja foi coletado"
  // e uma promessa da tela: varrer assim mesmo a quebraria.
  if (!fonte.robotsPermite || !fonte.ativa) {
    return {
      total: PRODUTOS_POR_FONTE,
      feitas: 0,
      produtos: 0,
      arquivo: null,
      erro: fonte.robotsPermite ? "fonte pausada" : "robots.txt do site nos barra",
    };
  }

  const colheita = await colherProdutos({
    url: `https://${fonte.dominio}/`,
    secao: fonte.prefixoUrl ?? undefined,
    nome: fonte.nome,
    tipo: fonte.tipo,
    limite: PRODUTOS_POR_FONTE,
    // O andamento e contado em PRODUTOS, nao em paginas abertas: e o numero que
    // o operador pediu ("20 de cada"), e paginas abertas sobem sem parar em
    // loja que exige muita navegacao ate achar produto.
    aoProgredir: aoProgredir
      ? ({ produtos }) => aoProgredir({ total: PRODUTOS_POR_FONTE, feitas: produtos })
      : undefined,
  });

  if (colheita.produtos.length === 0) {
    return {
      total: PRODUTOS_POR_FONTE,
      feitas: 0,
      produtos: 0,
      arquivo: null,
      visitas: colheita.visitas,
      erro: colheita.motivo ?? "nenhum produto valido",
    };
  }

  const resumo =
    `${colheita.produtos.length} produto(s) em ${colheita.visitas} pagina(s) · ` +
    `formatos: ${colheita.formatos.join(", ")}` +
    (colheita.ritmoMs ? ` · site pede ${colheita.ritmoMs / 1000}s entre visitas` : "");

  const arquivo = await salvarColeta({
    fonte: {
      nome: fonte.nome,
      dominio: fonte.dominio,
      tipo: fonte.tipo,
      url: `https://${fonte.dominio}/`,
      secao: fonte.prefixoUrl ?? null,
    },
    produtos: colheita.produtos,
    resumo,
    duracaoMs: Date.now() - comecou,
  });

  return {
    total: PRODUTOS_POR_FONTE,
    feitas: colheita.produtos.length,
    produtos: colheita.produtos.length,
    visitas: colheita.visitas,
    arquivo,
    resumo,
    /*
      O TAMANHO DO CATALOGO, que a colheita ja mede e vinha sendo descartado.

      "Produtos no site" so era gravado no cadastro da fonte, entao ficava
      congelado no que o teste viu naquele dia — e fonte cujo teste nao provou
      o total mostrava travessao para sempre, por mais varreduras que rodasse.
      A cada varredura o catalogo publico e o sitemap sao consultados de novo;
      guardar o numero e de graca.

      Vem `null` quando a varredura nao provou o total (ver `produtosNoSite` em
      colher.js: endereco no sitemap nao e produto). Quem grava decide o que
      fazer com o null — aqui nao se inventa numero.
    */
    produtosNoSite: colheita.produtosNoSite ?? null,
    produtosNoSiteParcial: colheita.produtosNoSiteParcial ?? false,
    // Colheita que ficou abaixo do pedido nao e erro: a loja pode nao ter 20
    // produtos legiveis. Dizer quantos vieram e mais util que falhar.
    erro: null,
  };
}

/**
 * Varredura gravando no BANCO. PARADA ate os testes terminarem.
 *
 * Continua de pe e com teste proprio (`npm run teste:coleta`), porque o banco
 * volta depois — mas nada em producao a chama hoje: quem o botao e o worker
 * usam e `varrerFonteParaJson`.
 */
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

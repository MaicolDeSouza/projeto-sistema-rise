import { buscarPagina, podeVisitar, ritmoPedido } from "./buscar";
import { backendDoMagentoPwa, colherMagentoPwa } from "./magento-pwa";
import { colherWooCommerce } from "./woocommerce";
import { pareceListagem, pareceProduto, rastrear } from "./descobrir";
import { ehProdutoValido, normalizarPagina } from "./normalizar";
import { camposDoCatalogo, lerCatalogo, urlDoItem } from "./catalogo";
import { chaveDoProduto } from "./linha";
import {
  catalogoPublicoDe,
  identidadeDoEndereco,
  identificarPlataforma,
  pagamentoDe,
} from "./plataformas";
import { lerAVista, novaMemoriaDePagamento } from "./pagamento";
import { descobrirSitemaps, lerSitemaps } from "./sitemap";

/**
 * Colheita de produtos de uma fonte.
 *
 * CAMINHO UNICO. O teste da fonte e a coleta em lote chamam esta funcao, com
 * limites diferentes — e so isso os separa. Ate aqui havia duas trilhas: o
 * teste usava o normalizador completo e a gravacao usava um extrator antigo,
 * entao o que a tela mostrava nao era o que se guardava. Um caminho so torna
 * essa divergencia impossivel por construcao.
 *
 * Descobre por sitemap e, quando ele nao entrega produto, navegando pelo site.
 * Respeita robots.txt e o Crawl-delay em toda visita, porque quem visita e
 * sempre buscarPagina.
 */

/**
 * Endereco na forma de comparar: sem ancora, sem barra final, dominio minusculo.
 * A retomada compara o endereco de agora com o gravado antes da queda, e
 * "/produto/" e "/produto" sao a mesma pagina.
 */
export function enderecoComparavel(endereco) {
  try {
    const url = new URL(endereco);
    url.hash = "";
    const caminho = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    return `${url.protocol}//${url.host.toLowerCase()}${caminho}${url.search}`;
  } catch {
    return String(endereco ?? "");
  }
}

function passo(nome, ok, detalhe = null) {
  return { nome, ok, detalhe };
}

/** Abre uma pagina e normaliza. Pode render mais de um produto (variacoes). */
async function tentarUrl(url, fonte, plataforma, doCatalogo = null, memoriaPagamento = null, sinal = null) {
  const resposta = await buscarPagina(url, { sinal });
  if (!resposta.ok || !resposta.corpo) {
    return { produtos: [], formatos: [], erro: resposta.erro ?? "sem corpo" };
  }

  // UMA requisicao a mais por FONTE, nao por produto.
  //
  // A Tray nao entrega o preco a vista no corpo da pagina — ele vem de um
  // endereco proprio. Sem essa visita, o desconto do pix nao e coletado e a
  // comparacao usa um preco que ninguem paga. Mas perguntar item a item
  // dobrava a colheita: o ritmo e de uma visita a cada 2s por dominio, entao
  // uma fonte de 20 produtos passava de 40s para 80s.
  //
  // O desconto e da LOJA, nao do produto. A memoria guarda a regra aprendida no
  // primeiro item e o resto sai de conta — mas so quando a regra declarada pela
  // loja reproduz exatamente o valor lido; ver regraDaLoja.
  //
  // Vem antes de normalizar porque o a vista entra como CANDIDATO a preco:
  // quem decide normal e promocional continua sendo decidirPrecos, com a mesma
  // regra de toda loja.
  const doPagamento = await lerAVista(
    pagamentoDe(plataforma, resposta.urlFinal ?? url),
    resposta.corpo,
    memoriaPagamento,
    sinal,
  );

  const { produtos, formatos } = normalizarPagina({
    html: resposta.corpo,
    url: resposta.urlFinal ?? url,
    fonte,
    plataforma,
    doCatalogo,
    doPagamento,
  });

  // O tipo da fonte decide o que e produto valido: fornecedor sem preco ainda
  // e um cadastro util; concorrente sem preco, nao.
  return {
    produtos: produtos.filter((p) => ehProdutoValido(p, fonte?.type)),
    formatos,
    erro: null,
  };
}

/**
 * @param {object} entrada
 * @param {string}  entrada.url        endereco da fonte
 * @param {string} [entrada.secao]     limita a um trecho do site
 * @param {string} [entrada.nome]
 * @param {string} [entrada.tipo]
 * @param {number} [entrada.limite]    quantos produtos colher
 * @param {number} [entrada.orcamento] teto de paginas abertas
 * @param {(a: {visitadas: number, produtos: number}) => void} [entrada.aoProgredir]
 * @param {(produto: object) => void} [entrada.aoGuardar] chamado com cada produto
 *   NOVO, no momento em que e achado — e o que permite gravar em lotes
 * @param {Set<string>} [entrada.jaColetadas] RETOMADA: enderecos (enderecoComparavel)
 *   de produtos ja gravados nesta varredura, antes de uma queda. Nao sao abertos de
 *   novo e contam como encontrados (`retomados`). Sem isto, cada queda do worker
 *   recomecava a loja do zero — a Smartkits, 3.780 produtos a ~2 s cada.
 * @param {Set<string>} [entrada.evitar] enderecos a NAO abrir, sem contar como achado
 *   — diferente de jaColetadas, que conta. Existe para "Testar fonte": o toggle
 *   "Amostra variada" manda aqui os produtos ja mostrados num teste anterior, para
 *   o proximo teste pular esses e mostrar tres DIFERENTES, em vez de recontar os
 *   mesmos como se ja tivessem sido gravados.
 * @param {AbortSignal} [entrada.sinal] cancela a colheita: o worker o dispara ao
 *   encerrar e quando a varredura para de andar. Conferido antes de cada pagina,
 *   e a requisicao em voo tambem e interrompida (buscarPagina). Cancelada, a
 *   colheita LANCA o motivo — nao devolve resultado parcial como se fosse inteiro.
 */
export async function colherProdutos({
  url,
  secao,
  nome,
  tipo,
  limite = 3,
  orcamento,
  evitar = null,
  aoProgredir,
  aoGuardar,
  sinal = null,
  jaColetadas = null,
}) {
  const conferirSinal = () => sinal?.throwIfAborted();
  let retomados = 0;

  // Sobra de visitas sobre o alvo: nem toda pagina aberta vira produto, e sem
  // folga a colheita para antes de completar o pedido.
  const tetoVisitas = orcamento ?? limite * 3 + 10;
  const amostraSitemap = Math.max(8, limite * 2);

  const passos = [];

  let alvo;
  try {
    alvo = new URL(/^https?:\/\//i.test(url ?? "") ? url : `https://${url}`);
  } catch {
    return {
      ok: false,
      motivo: "O endereco informado nao e uma URL valida.",
      passos: [passo("Endereco valido", false)],
      produtos: [],
      formatos: [],
      visitas: 0,
    };
  }
  passos.push(passo("Endereco valido", true, alvo.origin));

  const home = await buscarPagina(alvo.toString(), { sinal });
  if (!home.ok && !home.corpo) {
    passos.push(passo("Site acessivel", false, home.erro));
    return {
      ok: false,
      motivo: `Nao foi possivel abrir o site: ${home.erro}`,
      passos,
      produtos: [],
      formatos: [],
      visitas: 1,
    };
  }
  passos.push(passo("Site acessivel", true));

  // PRIMEIRO PASSO DA ANALISE: quem serve esta loja.
  //
  // Vem antes do robots e do sitemap de proposito. Saber a plataforma muda o
  // que se procura em cada pagina — a Loja Integrada nao publica JSON-LD
  // nenhum, a Tray esconde o preco num input — e muda o que o relatorio
  // consegue dizer quando falta um campo: sem isto sobrava "faltou preco",
  // nunca "a Tray publica o preco em preco_atual e esta pagina nao trouxe".
  //
  // Cabecalhos e cookies entram na conta junto com o HTML: metade das
  // plataformas nao se declara no corpo da pagina.
  let plataforma = identificarPlataforma({
    html: home.corpo ?? "",
    cabecalhos: home.cabecalhos,
    cookies: home.cookies,
  });
  const graphqlPwa = backendDoMagentoPwa(home.corpo ?? "", alvo.toString());
  if (graphqlPwa) {
    plataforma = {
      id: "magento-pwa",
      nome: "Magento 2 com vitrine Venia",
      familia: "Magento 2 / Adobe Commerce",
      confianca: "alta",
      sinais: ["vitrine Venia no HTML", "endereco Magento GraphQL declarado pela loja"],
      alternativas: [],
      entrega: {
        resumo: "A vitrine e carregada por JavaScript; os produtos estao no catalogo GraphQL publico.",
        formatos: ["graphql"],
        preco: "price_range.minimum_price.final_price",
        codigo: "sku",
        estoque: "stock_status",
        imagens: "media_gallery",
      },
    };
  }

  // Endereco, nao dados: quem visita e sempre buscarPagina, com robots e ritmo.
  const catalogo = catalogoPublicoDe(plataforma, alvo.toString(), home.corpo ?? "");

  passos.push(
    passo(
      "Plataforma identificada",
      plataforma.id !== "desconhecida",
      plataforma.id === "desconhecida"
        ? "front proprio ou plataforma fora do catalogo — segue pela leitura generica"
        : plataforma.nome +
            " · confianca " +
            plataforma.confianca +
            " · " +
            plataforma.sinais.join(" · "),
    ),
  );

  const permissao = await podeVisitar(alvo.toString());
  const ritmo = await ritmoPedido(alvo.toString());
  passos.push(
    passo(
      "robots.txt analisado",
      permissao.permitido,
      permissao.motivo ??
        (ritmo ? `permite · pede ${ritmo / 1000}s entre visitas` : "permite a coleta"),
    ),
  );

  if (!permissao.permitido) {
    return {
      ok: false,
      motivo: `O robots.txt deste site nos bloqueia: ${permissao.motivo}. Bloqueio se respeita.`,
      passos,
      produtos: [],
      formatos: [],
      visitas: 1,
      plataforma,
      catalogo,
    };
  }

  const prefixo = secao?.trim() || null;
  const fonte = { name: nome ?? alvo.hostname, type: tipo ?? "OUTRO" };

  if (graphqlPwa) {
    const leitura = await colherMagentoPwa({
      graphql: graphqlPwa,
      origem: alvo.origin,
      secao: prefixo,
      limite,
      orcamento: orcamento ?? limite * 3 + 10,
      fonte,
      plataforma,
      jaColetadas,
      evitar,
      aoGuardar,
      aoProgredir,
      sinal,
    });
    passos.push(passo("Catalogo GraphQL lido", !leitura.erro, leitura.erro ?? `${leitura.total ?? "?"} produto(s) no catalogo`));
    passos.push(passo("Produtos encontrados", leitura.produtos.length > 0, `${leitura.produtos.length} valido(s) em ${leitura.visitas} consulta(s)`));
    return {
      ok: leitura.produtos.length + leitura.retomados > 0,
      motivo: leitura.erro ?? (leitura.produtos.length + leitura.retomados ? null : "O catalogo GraphQL nao retornou produtos validos."),
      passos,
      produtos: leitura.produtos,
      formatos: leitura.produtos.length ? ["graphql"] : [],
      visitas: leitura.visitas,
      retomados: leitura.retomados,
      dominio: alvo.hostname,
      prefixoUrl: prefixo,
      ritmoMs: ritmo,
      plataforma,
      catalogo: null,
      produtosNoSite: leitura.total,
      produtosNoSiteParcial: false,
      produtosNoSiteFonte: leitura.total === null ? null : "catalogo",
    };
  }

  if (plataforma.id === "woocommerce" && catalogo?.url) {
    const leitura = await colherWooCommerce({
      catalogo, origem: alvo.origin, secao: prefixo, limite,
      orcamento: tetoVisitas, fonte, plataforma, jaColetadas,
      aoGuardar, aoProgredir, sinal,
    });
    // Se a API caiu depois de alguns lotes, o worker precisa retomar; fechar
    // uma coleta parcial como concluida esconderia os itens ainda nao lidos.
    if (leitura.erro && (leitura.produtos.length || leitura.retomados)) {
      throw new Error(`Catalogo WooCommerce interrompido: ${leitura.erro}`);
    }
    // Algumas lojas bloqueiam a Store API. Se nao veio nenhum produto, a
    // navegacao HTML continua sendo a alternativa existente.
    if (leitura.produtos.length || leitura.retomados) {
      passos.push(passo("Catalogo WooCommerce lido", true, `${leitura.total ?? "?"} produto(s) no catalogo`));
      passos.push(passo("Produtos encontrados", true, `${leitura.produtos.length} valido(s) em ${leitura.visitas} consulta(s)`));
      return {
        ok: true, motivo: null, passos, produtos: leitura.produtos,
        formatos: ["woocommerce-store-api"], visitas: leitura.visitas + 1,
        retomados: leitura.retomados, dominio: alvo.hostname, prefixoUrl: prefixo,
        ritmoMs: ritmo, plataforma, catalogo,
        produtosNoSite: leitura.total, produtosNoSiteParcial: false,
        produtosNoSiteFonte: leitura.total === null ? null : "catalogo",
      };
    }
    passos.push(passo("Catalogo WooCommerce lido", false, leitura.erro ?? "nenhum produto valido; seguindo pelas paginas"));
  }

  // Uma memoria POR COLHEITA, nunca global: o desconto a vista e desta loja, e
  // uma memoria compartilhada faria uma fonte responder pela outra.
  const memoriaPagamento = novaMemoriaDePagamento();
  const encontrados = [];
  const formatos = new Set();
  const vistas = new Set();
  let visitas = 0;

  /*
    ENDERECOS JA TRATADOS NESTA COLHEITA — abertos ou retomados.

    O catalogo, o sitemap e a navegacao respondem a mesma pergunta e listam os
    mesmos produtos. Sem este registro cada fase refazia o trabalho da anterior:
    na Smartkits (16/09/2026) os 3.780 itens do catalogo eram abertos DE NOVO pelo
    sitemap, e numa retomada cada produto ja gravado era contado duas vezes (7.249
    "retomados" de 3.625 gravados).

    PRE-MARCADO com `evitar` (29/09/2026): "Testar fonte" com o toggle "Amostra
    variada" manda aqui os enderecos ja mostrados num teste anterior. Marcados
    como tratados desde o inicio, o catalogo/sitemap/navegacao os pulam do
    mesmo jeito que pulariam um endereco repetido — sem contar como achado
    (isso e o `jaColetadas`, que soma em retomados), entao a colheita continua
    procurando ate achar tres DIFERENTES.
  */
  const tratados = new Set(
    evitar ? [...evitar].map((endereco) => enderecoComparavel(endereco)) : [],
  );

  /*
    O MESMO PRODUTO POR OUTRO ENDERECO (19/09/2026).

    Em plataforma que repete o produto por caminho de categoria (OpenCart), o
    endereco nao identifica o produto e cada variante era aberta e contada: a
    Solda Fria apontava 10.647 produtos para 5.350 no banco, a 2,3 s cada. Aqui a
    identidade vem do registro da plataforma (`identidadeDoEndereco`); onde ela
    nao existe, `identidade` devolve null e nada muda.

    So entra em `identidadesTratadas` o que virou PRODUTO ou foi retomado —
    categoria nunca marca, senao a navegacao deixaria de seguir os links dela.
  */
  const identidade = (endereco) => identidadeDoEndereco(plataforma, endereco);
  const identidadesTratadas = new Set();
  let variantesIgnoradas = 0;

  // RETOMADA: o endereco gravado e o da ULTIMA variante visitada, e o sitemap
  // pode trazer outra primeiro. Sem casar pela identidade, a retomada reabria
  // produto que os lotes ja tinham salvo.
  const identidadesColetadas = new Set(
    [...(jaColetadas ?? [])].map((endereco) => identidade(endereco)).filter(Boolean),
  );
  const jaTenho = (endereco) => {
    if (!jaColetadas) return false;
    if (jaColetadas.has(enderecoComparavel(endereco))) return true;
    const chave = identidade(endereco);
    return Boolean(chave && identidadesColetadas.has(chave));
  };
  /** Conta o produto como retomado UMA vez e marca a identidade, para as variantes. */
  const retomar = (endereco) => {
    retomados++;
    const chave = identidade(endereco);
    if (chave) identidadesTratadas.add(chave);
  };
  /** true se este endereco e outra variante de um produto ja tratado. */
  const ehVariante = (endereco) => {
    const chave = identidade(endereco);
    if (!chave || !identidadesTratadas.has(chave)) return false;
    variantesIgnoradas++;
    return true;
  };

  /** true se o endereco ja foi tratado; senao o marca e devolve false. */
  const jaTratado = (endereco) => {
    const chave = enderecoComparavel(endereco);
    if (tratados.has(chave)) return true;
    tratados.add(chave);
    return ehVariante(endereco);
  };
  // Encontrados nesta passada mais os retomados de antes da queda.
  const achados = () => encontrados.length + retomados;

  const guardar = (novos, formatosDaPagina) => {
    for (const produto of novos) {
      // A mesma chave do BANCO (`chaveDoProduto`: codigo, senao endereco, senao
      // nome). Antes era codigo+URL, e o produto aberto por dois enderecos contava
      // duas vezes na tela enquanto o banco guardava uma linha so — e a segunda
      // visita reescrevia a linha. Variacao com codigo proprio divide a URL com o
      // produto de origem, mas o codigo dela e outro, entao continua separada.
      const chave = chaveDoProduto(produto) ?? `${produto.code ?? ""}|${produto.url}`;
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      if (produto.url) {
        tratados.add(enderecoComparavel(produto.url));
        const id = identidade(produto.url);
        if (id) identidadesTratadas.add(id);
      }
      encontrados.push(produto);
      aoGuardar?.(produto);
    }
    formatosDaPagina?.forEach((f) => formatos.add(f));
  };

  // 1) A propria URL ja e um produto?
  conferirSinal();
  const daPropria = await tentarUrl(alvo.toString(), fonte, plataforma, null, memoriaPagamento, sinal);
  visitas++;
  guardar(daPropria.produtos, daPropria.formatos);

  // 1.5) Catalogo publico da plataforma, quando ela publica um.
  //
  // Vem ANTES do sitemap porque responde melhor a mesma pergunta: quantos
  // produtos a loja tem e onde cada um esta. O sitemap da um teto ("500+");
  // o catalogo da o numero exato, e de quebra a lista de imagens declarada.
  //
  // Nao dispensa abrir a pagina: medido na Tray, o catalogo NAO traz a
  // referencia da loja nem o preco a vista. Ele encurta a descoberta, nao a
  // leitura.
  let itensDoCatalogo = [];
  let totalDoCatalogo = null;

  if (catalogo) {
    const leitura = await lerCatalogo(catalogo, { limite, sinal });
    conferirSinal();
    totalDoCatalogo = leitura.total;
    itensDoCatalogo = leitura.itens;

    passos.push(
      passo(
        "Catalogo publico lido",
        !leitura.erro && itensDoCatalogo.length > 0,
        leitura.erro
          ? `nao respondeu: ${leitura.erro}`
          : // totalDoCatalogo so vem preenchido quando a paginacao esgotou (ou a
            // plataforma declara o total). No teste, o limite pequeno corta a
            // leitura na primeira pagina, e itensDoCatalogo.length e so a
            // amostra lida ate ali — dizer isso como "no catalogo da loja"
            // afirmaria um tamanho de loja que nao foi provado.
            totalDoCatalogo !== null
            ? `${totalDoCatalogo} produto(s) no catalogo da loja`
            : `${itensDoCatalogo.length} produto(s) lido(s) nesta amostra — a loja tem mais (total confirmado so na coleta completa)`,
      ),
    );
  }

  for (const item of itensDoCatalogo) {
    if (achados() >= limite || visitas >= tetoVisitas) break;
    conferirSinal();

    const enderecoItem = urlDoItem(item, alvo.origin);
    if (!enderecoItem || jaTratado(enderecoItem)) continue;
    if (jaTenho(enderecoItem)) {
      retomar(enderecoItem);
      aoProgredir?.({ visitadas: visitas, produtos: achados(), retomados });
      continue;
    }

    const tentativa = await tentarUrl(
      enderecoItem,
      fonte,
      plataforma,
      camposDoCatalogo(item, alvo.origin),
      memoriaPagamento,
      sinal,
    );
    visitas++;
    guardar(tentativa.produtos, tentativa.formatos);

    if (aoProgredir) aoProgredir({ visitadas: visitas, produtos: achados(), retomados });
  }
  // 2) Sitemap
  // O sitemap so entra se o catalogo nao completou a cota: sao duas formas de
  // responder a mesma pergunta, e correr as duas gastaria requisicao a toa.
  //
  // CATALOGO COMPLETO ENCERRA A COLHEITA. Quando a loja declara o total e todos os
  // itens foram lidos, sitemap e navegacao so repetiriam os mesmos produtos — e
  // a navegacao ia ate o teto de 20.000 paginas: a Smartkits, com o catalogo todo
  // tratado, seguia abrindo categoria e achava um produto a cada ~280 paginas
  // (564 s por produto na tela).
  const catalogoCompleto =
    typeof totalDoCatalogo === "number" &&
    totalDoCatalogo > 0 &&
    itensDoCatalogo.length >= totalDoCatalogo;
  const precisaDoSitemap = achados() < limite && !catalogoCompleto;

  conferirSinal();
  const sitemaps = precisaDoSitemap ? await descobrirSitemaps(alvo.origin, { sinal }) : [];
  let urlsSitemap = [];

  // Teto da leitura. Nomeado porque a contagem do catalogo precisa saber se
  // parou por acabar o sitemap ou por bater aqui — a diferenca entre
  // "a loja tem 500 produtos" e "a loja tem pelo menos 500".
  const TETO_SITEMAP = Math.max(500, limite * 20);

  if (sitemaps.length > 0) {
    const leitura = await lerSitemaps(sitemaps, {
      prefixo: prefixo ?? undefined,
      maxSitemaps: 6,
      limite: TETO_SITEMAP,
      sinal,
    });
    conferirSinal();
    // Produto primeiro, listagem por ultimo, o resto no meio — na ordem do
    // sitemap dentro de cada grupo. Sem isto a amostra do "Testar fonte" (8
    // enderecos) caia inteira nas categorias que o sitemap lista antes.
    const grupo = (endereco) => (pareceProduto(endereco) ? 0 : pareceListagem(endereco) ? 2 : 1);
    // So enderecos da loja. O robots.txt da Mamute Eletronica declara tambem o
    // sitemap do BLOG (outro subdominio): os posts entrariam na fila e na conta
    // de "produtos no site". O arquivo do sitemap pode estar num CDN; o que ele
    // lista, nao.
    const semWww = (host) => host.replace(/^www\./i, "");
    const daLoja = (endereco) => {
      try {
        return semWww(new URL(endereco).hostname) === semWww(alvo.hostname);
      } catch {
        return false;
      }
    };
    urlsSitemap = leitura.urls
      .map((item) => item.url)
      .filter(daLoja)
      .map((endereco, ordem) => ({ endereco, ordem, grupo: grupo(endereco) }))
      .sort((a, b) => a.grupo - b.grupo || a.ordem - b.ordem)
      .map((item) => item.endereco);
  }

  const sitemapNoTeto = urlsSitemap.length === TETO_SITEMAP;

  // ENDERECO NAO E PRODUTO.
  //
  // O passo conta o que de fato foi contado: linhas no sitemap. Chamar isso de
  // "produto" ja enganou — a Usinainfo declara no robots.txt um sitemap de
  // ROTAS DE BUSCA, e a tela anunciava "12 produto(s) no sitemap" numa loja com
  // milhares. Pior: o numero ia para "Catalogo da loja" e ficava gravado na
  // fonte, como se a loja inteira tivesse doze itens.
  //
  // Filtrar por "cara de produto" nao resolveria: das 12 rotas, onze nao tem
  // cara de produto e a decima segunda tem por acidente — "baterias-18650"
  // casa com id numerico, e 18650 e o modelo da bateria.
  if (precisaDoSitemap) {
    passos.push(
      passo(
        "Sitemap identificado",
        sitemaps.length > 0,
        sitemaps.length > 0
          ? `${urlsSitemap.length}${sitemapNoTeto ? "+" : ""} endereco(s) no sitemap`
          : "nao publicado — vamos navegar pelo site",
      ),
    );
  }

  // Quantos dos enderecos do sitemap viraram produto de verdade. E o que separa
  // sitemap de catalogo de sitemap de qualquer outra coisa — e so a tentativa
  // responde isso.
  let produtosDoSitemap = 0;

  for (const candidata of urlsSitemap.slice(0, amostraSitemap)) {
    if (achados() >= limite || visitas >= tetoVisitas) break;
    if (jaTratado(candidata)) continue;
    conferirSinal();
    if (jaTenho(candidata)) {
      retomar(candidata);
      produtosDoSitemap++;
      aoProgredir?.({ visitadas: visitas, produtos: achados(), retomados });
      continue;
    }

    const antes = encontrados.length;
    const tentativa = await tentarUrl(candidata, fonte, plataforma, null, memoriaPagamento, sinal);
    visitas++;
    guardar(tentativa.produtos, tentativa.formatos);
    if (encontrados.length > antes) produtosDoSitemap++;

    if (aoProgredir) aoProgredir({ visitadas: visitas, produtos: achados(), retomados });
  }

  // Quantos produtos a loja tem.
  //
  // Tres respostas possiveis, e a ordem importa. O total do CATALOGO e
  // declarado pela propria loja — vale como esta. O do SITEMAP so vale depois
  // de provado que aquele sitemap lista produto: se nenhum dos enderecos
  // abertos virou produto, ele nao e um indice de catalogo, e repetir o numero
  // de linhas seria inventar um tamanho de loja.
  //
  // Sem nenhuma das duas, `null` — e a tela mostra travessao. Dizer zero
  // afirmaria que a loja nao tem catalogo, quando a verdade e que ela nao
  // publica a lista.
  //
  // Onde a plataforma repete o produto por caminho de categoria, o sitemap conta
  // ENDERECOS de um mesmo produto varias vezes (Solda Fria: 38.839 para ~8,6 mil).
  // Conta-se por identidade; sem identidade, e cada endereco (como sempre foi).
  const produtosNoSite =
    totalDoCatalogo ??
    (produtosDoSitemap > 0
      ? new Set(urlsSitemap.map((endereco) => identidade(endereco) ?? endereco)).size
      : null);

  const produtosNoSiteParcial =
    totalDoCatalogo === null && produtosDoSitemap > 0 && sitemapNoTeto;

  // 3) Navegacao, quando o sitemap nao bastou. Nem toda loja publica sitemap de
  // produto: ha quem declare no robots.txt um sitemap de rotas de busca.
  if (achados() < limite && visitas < tetoVisitas && !catalogoCompleto) {
    const abertasAntes = visitas;
    const retomadosAntes = retomados;

    const varredura = await rastrear({
      semente: alvo.toString(),
      prefixo: prefixo ?? undefined,
      orcamento: tetoVisitas - visitas,
      pararApos: limite - retomadosAntes,
      sinal,
      // Pagina de produto ja gravada nao e aberta de novo. Os links dela ficam de
      // fora — e a categoria que a listou continua sendo lida.
      // Produto ja tratado nesta colheita (aberto pelo catalogo ou pelo sitemap)
      // tambem nao e reaberto; so o retomado de verdade entra na conta.
      pular: (endereco) => {
        const chave = enderecoComparavel(endereco);
        if (tratados.has(chave)) return true;
        // Outra variante de um produto ja tratado: nao reabre. Categoria nunca
        // esta em `identidadesTratadas`, entao a navegacao continua nela.
        if (ehVariante(endereco)) {
          tratados.add(chave);
          return true;
        }
        if (jaTenho(endereco)) {
          tratados.add(chave);
          retomar(endereco);
          return true;
        }
        return false;
      },
      aoAchar: async ({ url: achada, html }) => {
        const antes = encontrados.length;
        const { produtos, formatos: fs } = normalizarPagina({
          html,
          url: achada,
          fonte,
          plataforma,
        });
        guardar(produtos.filter((p) => ehProdutoValido(p, fonte?.type)), fs);
        return encontrados.length > antes;
      },
      // O andamento vem do rastreador, e nao do aoAchar: contado la dentro, ele
      // so enxergaria pagina que RENDEU produto, e a barra ficaria parada
      // durante toda a navegacao pelas categorias — justo o trecho demorado.
      aoProgredir: aoProgredir
        ? async ({ visitadas }) =>
            aoProgredir({
              visitadas: abertasAntes + visitadas,
              produtos: achados(),
              retomados,
            })
        : undefined,
    });

    // Conta TODA pagina aberta, inclusive a categoria que nao rendeu produto.
    // Somando dentro do aoAchar, o numero era o de acertos, nao o de visitas —
    // e e o de visitas que diz se a fonte e cara de varrer.
    visitas += varredura.visitadas;

    // Parou pelo freio de secura: e resultado, nao defeito, e a tela precisa
    // dizer isso — senao "2.030 de 2.033" parece varredura incompleta por erro.
    if (varredura.secou) {
      passos.push(
        passo(
          "Navegacao encerrada",
          true,
          `${varredura.semAchado} pagina(s) seguidas sem produto novo — o resto do site nao tem o que colher`,
        ),
      );
    }
  }

  // A navegacao sai do laco quando cancelada; aqui isso vira erro, e nao um
  // resultado parcial com cara de varredura completa.
  conferirSinal();

  passos.push(
    passo(
      "Produtos encontrados",
      encontrados.length > 0,
      `${encontrados.length} valido(s) em ${visitas} pagina(s) abertas`,
    ),
  );

  // So diz quando aconteceu: sem variante, o passo seria ruido em toda loja.
  if (variantesIgnoradas > 0) {
    passos.push(
      passo(
        "Enderecos repetidos ignorados",
        true,
        `${variantesIgnoradas} endereco(s) eram o mesmo produto por outro caminho de categoria`,
      ),
    );
  }

  if (encontrados.length > 0) {
    passos.push(passo("Extracao concluida", true, [...formatos].join(", ") || "—"));
  }

  return {
    ok: achados() > 0,
    retomados,
    // Quando falha, a plataforma diz ONDE os dados deveriam estar. Sem isso a
    // recusa era generica ("nao publica JSON-LD, Microdata nem OpenGraph") e
    // nao ajudava ninguem a decidir se o problema era do site ou nosso.
    motivo:
      achados() > 0
        ? null
        : "Nao foram encontrados produtos validos. O site nao publica JSON-LD, Microdata nem OpenGraph de produto nas paginas que abrimos." +
          (plataforma.id === "desconhecida"
            ? ""
            : ` A loja roda em ${plataforma.nome}: ${plataforma.entrega.resumo}`),
    passos,
    produtos: encontrados.slice(0, limite),
    formatos: [...formatos],
    visitas,
    dominio: alvo.hostname,
    prefixoUrl: prefixo,
    ritmoMs: ritmo,
    plataforma,
    catalogo,
    produtosNoSite,
    produtosNoSiteParcial,
    // De onde saiu a contagem. A tela dizia "publicados no sitemap" mesmo
    // quando o numero vinha do catalogo da plataforma — os 2.296 da Casa da
    // Robotica sao do /web_api/products, e nao do sitemap.
    produtosNoSiteFonte: produtosNoSite === null ? null : totalDoCatalogo !== null ? "catalogo" : "sitemap",
  };
}

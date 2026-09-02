import { buscarPagina } from "./buscar";
import { comoNumero, comoTexto } from "./texto-html";

/**
 * Preco a vista publicado fora da pagina do produto.
 *
 * A Tray monta o bloco "Formas de Pagamento" por AJAX. Na Smartkits a vitrine
 * anuncia "a vista R$ 52,15 — Desconto de 5 %" e a string "52,15" NAO existe no
 * HTML entregue: o que vem e o preco de tabela (54,90) num campo oculto. Sem
 * abrir este endereco, o desconto do pix simplesmente nao e coletado, e a
 * comparacao com o concorrente usa um preco que ninguem paga.
 *
 * O valor e LIDO, nunca calculado. O desconto e da loja inteira (5% medido em
 * tres produtos da Smartkits), entao daria para multiplicar — mas a Tray TRUNCA
 * o centavo em vez de arredondar: 59,90 vira 56,90, e nao 56,91. Reproduzir
 * esse truncamento seria inventar a regra de arredondamento de um terceiro para
 * gravar preco de concorrente como se fosse lido.
 *
 * Tudo passa por buscarPagina, entao robots.txt, Crawl-delay, ritmo do dominio
 * e charset valem igual — o endpoint responde em ISO-8859-1.
 */

/**
 * Quantas parcelas a linha descreve.
 *
 * O rotulo vem como "a vista" ou "12x". Ler o numero e nao a palavra evita
 * depender do acento, que chega diferente conforme o charset da loja.
 */
function parcelasDaLinha(rotulo) {
  if (!rotulo) return null;
  const vezes = /(\d+)\s*x/i.exec(rotulo);
  if (vezes) return Number(vezes[1]);
  return /vista/i.test(rotulo) ? 1 : null;
}

/**
 * As formas de pagamento que o bloco declara.
 *
 * Cada <tr> traz rotulo, valor e observacao em celulas diferentes. O valor esta
 * sempre em <b>; a observacao usa <strong>. Essa separacao importa: o cartao
 * escreve "Parcela Minima de <strong>R$ 30,00</strong>" na mesma linha, e um
 * leitor que pegasse qualquer "R$" gravaria 30,00 como preco do produto.
 */
export function lerFormasDePagamento(html) {
  if (!html) return [];

  const formas = [];

  for (const linha of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const corpo = linha[1];

    const rotulo = comoTexto(
      /<strong[^>]*class=["'][^"']*\bcolor\b[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i.exec(
        corpo,
      )?.[1],
    );
    const valor = comoNumero(/<b[^>]*>([^<]*R\$[^<]*)<\/b>/i.exec(corpo)?.[1]);
    const parcelas = parcelasDaLinha(rotulo);

    if (valor === null || parcelas === null) continue;

    formas.push({
      parcelas,
      valor,
      desconto: comoNumero(/Desconto de\s*([\d.,]+)\s*%/i.exec(corpo)?.[1]),
    });
  }

  return formas;
}

/**
 * O menor preco a vista entre as formas de pagamento.
 *
 * SO UMA PARCELA conta — a mesma regra que ja valia para o priceSellDetails do
 * dataLayer. Com duas ou mais, o valor e o da parcela e nao o do produto:
 * registrar 12x de 24,69 como preco daria 24,69 num produto de 296,28.
 *
 * O menor porque as formas convivem: o cartao cobra os 54,90 de tabela e o pix
 * cobra 52,15. O que caracteriza promocao e o mais barato que a loja aceita.
 */
export function menorAVista(formas) {
  const aVista = formas.filter((forma) => forma.parcelas === 1);
  if (aVista.length === 0) return null;

  return aVista.reduce((menor, forma) => (forma.valor < menor.valor ? forma : menor));
}

/**
 * Corta o centavo, nao arredonda.
 *
 * A Tray trunca: 59,90 com 5% vira 56,90 e nao 56,91; 54,90 vira 52,15 e nao
 * 52,16. Medido em quatro produtos de duas lojas.
 */
/**
 * Como a loja resolve o centavo quebrado.
 *
 * NAO E A MESMA EM TODA LOJA, e a diferenca e de um centavo: a Smartkits
 * TRUNCA (8,90 -5% = 8,455 e ela cobra 8,45) e a Casa da Robotica ARREDONDA
 * (4,89 -5% = 4,6455 e ela cobra 4,65). Supor uma das duas erra a outra.
 *
 * A conta e feita em CENTAVOS INTEIROS. Em ponto flutuante, 59,90 x 0,95 vira
 * 56,90499999999999 e o meio-centavo desaparece — o que faz os dois modos
 * parecerem iguais justamente na amostra que os separaria.
 */
const MODOS = {
  truncar: (centavosVezesCem) => Math.floor(centavosVezesCem / 100),
  arredondar: (centavosVezesCem) => Math.round(centavosVezesCem / 100),
};

function emCentavos(valor) {
  return Math.round(valor * 100);
}

/** O que cada modo daria para esta amostra, em centavos. */
function previsoes({ precoTabela, percentual }) {
  const numerador = emCentavos(precoTabela) * (100 - percentual);
  return Object.fromEntries(
    Object.entries(MODOS).map(([nome, calcular]) => [nome, calcular(numerador)]),
  );
}

/**
 * A regra de desconto DA LOJA, aprendida nas primeiras leituras.
 *
 * UMA A DUAS REQUISICOES POR FONTE, nao uma por produto. O ritmo e de uma
 * visita a cada 2s por dominio, entao perguntar o preco a vista item a item
 * DOBRAVA a coleta: numa fonte de 20 produtos, 40s viravam 80s. E o desconto a
 * vista nao e do produto — e da loja: 5% em todos os produtos medidos na
 * Smartkits e na Casa da Robotica.
 *
 * SO ADOTA A REGRA QUANDO A AMOSTRA DISCRIMINA. Conferir que a regra reproduz o
 * valor lido nao basta, e isso ja custou um centavo errado: o primeiro produto
 * da Casa da Robotica (12,99 -5% = 12,3405) da 12,34 truncando OU arredondando,
 * entao ele nao prova nada — e a regra escolhida ali errou o produto seguinte.
 * Enquanto os dois modos explicarem todas as amostras, continua perguntando.
 *
 * Modo nenhum explicando todas as amostras, ou percentual mudando de um produto
 * para o outro, e sinal de que a loja nao tem regra unica: `semRegra`, e a
 * fonte pergunta produto a produto ate o fim. Preco errado de concorrente e
 * pior que coleta lenta.
 */
function aprender(amostras) {
  const percentuais = new Set(amostras.map((a) => a.percentual));
  if (percentuais.size !== 1) return { semRegra: true };

  const percentual = [...percentuais][0];

  const explicam = Object.keys(MODOS).filter((modo) =>
    amostras.every((a) => previsoes(a)[modo] === emCentavos(a.aVista)),
  );

  if (explicam.length === 0) return { semRegra: true };
  // Ainda ambiguo: os dois modos servem para o que se viu ate agora.
  if (explicam.length > 1) return {};

  // Quantas leituras foram precisas fica registrado: a Smartkits resolve na
  // primeira, a Casa da Robotica so na segunda, e a origem do preco derivado
  // diz qual dos dois casos foi.
  return { regra: { percentual, modo: explicam[0], conferidoEm: amostras.length } };
}

/// Exposto para o teste offline: aprender e a decisao mais delicada deste
/// modulo — ja errou um centavo por adotar regra de amostra que nao separava os
/// modos — e provar isso sem rede exige chamar a funcao direto.
export { aprender as aprenderParaTeste };

/** O preco a vista que a regra ja aprendida preve para este produto. */
function aplicar(regra, precoTabela) {
  const numerador = emCentavos(precoTabela) * (100 - regra.percentual);
  return MODOS[regra.modo](numerador) / 100;
}

/**
 * Memoria de uma fonte. Guarda o que ja foi aprendido sobre a loja para nao
 * perguntar duas vezes. Uma por colheita — nunca global, senao uma loja
 * responderia pela outra.
 */
export function novaMemoriaDePagamento() {
  return { regra: null, semRegra: false, amostras: [] };
}

/**
 * Os tres parametros que o endpoint exige, lidos da pagina do produto.
 *
 * Sao os mesmos que o tema da loja passa. Qualquer um faltando, nao ha
 * requisicao a fazer: montar a URL com id chutado abriria a pagina de outro
 * produto e gravaria o preco errado sem dar erro nenhum.
 */
export function parametrosDaPagina(html) {
  if (!html) return null;

  const idLoja = /(?:img_prod|loja\/arquivos|mvc\/store)\/(\d{4,9})/.exec(html)?.[1] ?? null;

  const idProduto =
    /"idProduct"\s*:\s*"?(\d+)"?/.exec(html)?.[1] ??
    /data-product-id=["'](\d+)["']/i.exec(html)?.[1] ??
    null;

  // A Tray escreve o mesmo input nas duas ordens na MESMA pagina:
  // `id="preco_atual" value="54.9"` e `value="54.90" id="preco_atual"`.
  //
  // E O ZERA no produto sem estoque: a fonte 1075 da Smartkits traz
  // `value="0.00"` e um input so, enquanto o dataLayer e a vitrine seguem
  // anunciando 59,90. Sem a alternativa, todo produto esgotado ficava sem
  // preco a vista — justamente onde a comparacao com o concorrente interessa,
  // porque o preco continua publicado.
  const preco =
    comoNumero(
      /id=["']preco_atual["'][^>]*\bvalue=["']([^"']+)["']/i.exec(html)?.[1] ??
        /\bvalue=["']([^"']+)["'][^>]*id=["']preco_atual["']/i.exec(html)?.[1],
    ) ??
    comoNumero(/"price"\s*:\s*"([\d.,]+)"/.exec(html)?.[1]) ??
    comoNumero(/"priceSell"\s*:\s*"([\d.,]+)"/.exec(html)?.[1]);

  if (!idLoja || !idProduto || preco === null) return null;

  return { idLoja, idProduto, preco };
}

/**
 * Le o preco a vista da pagina de um produto.
 *
 * @param {object|null} pagamento  o bloco `entrega.pagamento` do registro, ja com url
 * @param {string} html            o HTML da pagina do produto
 * @returns {Promise<{aVista: number, desconto: number|null, url: string}|null>}
 */
export async function lerAVista(pagamento, html, memoria = null) {
  if (!pagamento?.url) return null;

  const parametros = parametrosDaPagina(html);
  if (!parametros) return null;

  // Regra ja aprendida nesta fonte: nao ha requisicao a fazer.
  if (memoria?.regra) {
    if (!memoria.regra.percentual) return null;

    return {
      aVista: aplicar(memoria.regra, parametros.preco),
      desconto: memoria.regra.percentual,
      derivado: true,
      conferidoEm: memoria.regra.conferidoEm ?? 1,
      url: null,
    };
  }

  const alvo = new URL(pagamento.url);
  alvo.searchParams.set("loja", parametros.idLoja);
  alvo.searchParams.set("IdProd", parametros.idProduto);
  alvo.searchParams.set("preco", String(parametros.preco));

  const resposta = await buscarPagina(alvo.toString());
  if (!resposta.ok || !resposta.corpo) return null;

  const forma = menorAVista(lerFormasDePagamento(resposta.corpo));
  if (!forma) return null;

  if (memoria && !memoria.semRegra) {
    // Loja sem desconto a vista: resposta legitima e definitiva. Guardar isso
    // evita 19 requisicoes que devolveriam sempre o preco de tabela.
    if (forma.valor >= parametros.preco) {
      memoria.regra = { percentual: 0, modo: "truncar" };
    } else if (forma.desconto > 0 && forma.desconto < 100) {
      memoria.amostras.push({
        precoTabela: parametros.preco,
        aVista: forma.valor,
        percentual: forma.desconto,
      });
      Object.assign(memoria, aprender(memoria.amostras));
    } else {
      // Desconto que a loja nao declara: nao ha o que reproduzir.
      memoria.semRegra = true;
    }
  }

  return {
    aVista: forma.valor,
    desconto: forma.desconto,
    derivado: false,
    url: alvo.toString(),
  };
}

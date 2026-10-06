import { produtosParaLista } from "@/lib/coleta/banco";
import { casaPalavra, indiceDePalavras, palavrasDoTermo } from "@/lib/texto";

/**
 * Referencias de mercado para o cadastro de produto: fornecedores e
 * concorrentes parecidos com o titulo, do mais parecido para o menos.
 *
 * Le a mesma lista da tela Mercados (ultima coleta de cada fonte), mas NAO usa a
 * regra dela. La o operador filtra, e todas as palavras sao exigidas; aqui ele
 * cola um titulo inteiro, e ninguem repete as nove palavras de
 * "PLACA COMPATIVEL ARDUINO UNO R3 CH340 COM CABO USB" — a busca nao achava
 * nada, com 37 produtos tendo "arduino uno".
 */

/// Mais que isso nao se marca a mao, e a lista pesaria na tela.
const TETO = 200;

/// Fracao do peso do titulo que o produto precisa ter. Metade separa bem nos
/// titulos medidos: a placa certa fica acima e o "Case Arduino Uno R3"
/// (acessorio) fica abaixo.
const NOTA_MINIMA = 0.5;

const ORDEM = { FORNECEDOR: 0, CONCORRENTE: 1, OUTRO: 2 };

export async function buscarReferencias(termo, { limite = TETO, fornecedoresLigados = [], idsConcorrentesLigados = [] } = {}) {
  const palavras = palavrasDoTermo(termo);
  // Sem palavras ainda acha os VINCULOS (pedido do dono em 06/10/2026: as indicacoes dos fornecedores e
  // concorrentes salvos aparecem mesmo com o Nome vazio); so nao ha achados por semelhanca.
  if (palavras.length === 0 && fornecedoresLigados.length === 0 && idsConcorrentesLigados.length === 0) {
    return { total: 0, itens: [] };
  }

  const todos = await produtosParaLista({ incluirIds: idsConcorrentesLigados });

  // Quais palavras cada produto tem. Guardado para calcular o peso de cada
  // palavra antes da nota.
  const casamentos = todos.map((produto) => {
    const formas = indiceDePalavras(produto.buscaTexto);
    return palavras.map((palavra) => casaPalavra(formas, palavra));
  });

  /*
    PESO PELA RARIDADE. "sensor" esta em centenas de produtos e nao diz qual e
    a peca; "hcsr04" esta em poucos e diz. Com peso igual, a busca por
    "SENSOR DE DISTANCIA ULTRASSONICO HC-SR04 5V" punha sensores ToF (sensor +
    distancia + 5V) no mesmo nivel do HC-SR04. Palavra com digito ganha um
    bonus a mais: e modelo, CI ou especificacao.
  */
  const pesos = palavras.map((palavra, indice) => {
    const comEla = casamentos.filter((linha) => linha[indice]).length;
    const raridade = Math.log((todos.length + 1) / (comEla + 1)) + 1;
    return /\d/.test(palavra) ? raridade * 1.5 : raridade;
  });
  const pesoTotal = pesos.reduce((soma, peso) => soma + peso, 0);

  // Com ate duas palavras todas precisam aparecer: "sensor" sozinho casaria com
  // metade do acervo.
  const minima = palavras.length <= 2 ? 1 : NOTA_MINIMA;

  const achados = [];
  const notas = new Map();
  todos.forEach((produto, indice) => {
    const pesoCasado = casamentos[indice].reduce(
      (soma, casou, posicao) => soma + (casou ? pesos[posicao] : 0),
      0,
    );
    // Sem palavras o peso total e zero: nota zero, e nenhum achado (so os vinculos, abaixo).
    const nota = pesoTotal > 0 ? pesoCasado / pesoTotal : 0;
    notas.set(produto.id, nota);
    // Margem de arredondamento: com duas palavras, 1 pode vir como 0,9999.
    if (palavras.length > 0 && nota >= minima - 1e-9) achados.push({ produto, nota });
  });

  achados.sort(
    (a, b) =>
      b.nota - a.nota ||
      (ORDEM[a.produto.fonte.tipo] ?? 9) - (ORDEM[b.produto.fonte.tipo] ?? 9) ||
      (a.produto.name ?? "").localeCompare(b.produto.name ?? "", "pt-BR"),
  );

  // Fornecedor vinculado e uma EMPRESA, nao todos os produtos dessa empresa.
  // Escolhe a referencia exata pelo link/codigo quando possivel; sem eles,
  // so o produto mais parecido da loja pode representar esse vinculo.
  const vinculados = new Set(idsConcorrentesLigados);
  const texto = (valor) => String(valor ?? "").trim().toLocaleLowerCase("pt-BR");
  const url = (valor) => {
    try {
      const endereco = new URL(valor);
      return `${endereco.hostname.replace(/^www\./, "")}${endereco.pathname.replace(/\/$/, "")}`.toLocaleLowerCase("pt-BR");
    } catch {
      return String(valor ?? "").trim().toLocaleLowerCase("pt-BR");
    }
  };
  for (const fornecedor of fornecedoresLigados) {
    const temIdentificador = Boolean(fornecedor.link || fornecedor.codigo);
    const candidatos = todos.filter(
      (produto) =>
        texto(produto.fonte.nome) === texto(fornecedor.nome) ||
        (fornecedor.link && produto.url && url(fornecedor.link) === url(produto.url)),
    );
    const melhor = candidatos
      .map((produto) => ({
        produto,
        nota: notas.get(produto.id) ?? 0,
        exato: Boolean(
          (fornecedor.link && produto.url && url(fornecedor.link) === url(produto.url)) ||
          (fornecedor.codigo && produto.code && texto(fornecedor.codigo) === texto(produto.code)),
        ),
      }))
      .sort((a, b) => Number(b.exato) - Number(a.exato) || b.nota - a.nota)[0];
    if (melhor && (melhor.exato || (!temIdentificador && melhor.nota >= minima - 1e-9))) {
      vinculados.add(melhor.produto.id);
    }
  }

  // Vínculos podem estar fora dos 200 resultados ou abaixo do corte textual.
  // Eles ainda precisam aparecer na lupa, antes dos achados novos.
  const porId = new Map(todos.map((produto) => [produto.id, produto]));
  const ligados = [...vinculados]
    .map((id) => porId.get(id))
    .filter(Boolean)
    .map((produto) => ({ produto, nota: notas.get(produto.id) ?? 0 }));
  const restantes = achados.filter(({ produto }) => !vinculados.has(produto.id));
  const exibidos = [...ligados, ...restantes.slice(0, Math.max(0, limite - ligados.length))];

  return {
    total: new Set([...achados.map(({ produto }) => produto.id), ...ligados.map(({ produto }) => produto.id)]).size,
    itens: exibidos.map(({ produto, nota }) => ({
      id: produto.id,
      vinculado: vinculados.has(produto.id),
      nome: produto.name,
      codigo: produto.code,
      tipo: produto.fonte.tipo,
      fonte: produto.fonte.nome,
      url: produto.url,
      origem: produto.origem,
      // Preco NORMAL primeiro (regra do dono em 19/09/2026, valida em todo o
      // sistema): promocional e desconto a vista ou de campanha, e temporario —
      // comparar ou copiar por ele engana a referencia de custo/mercado. So
      // cai no promocional quando a loja nao publicou preco normal.
      preco: produto.prices.normal ?? produto.prices.promotional,
      // Estritamente o de tabela, sem cair no promocional: a lista de
      // Concorrentes da aba Fornecedores (pedido do dono em 18/09/2026) prefere
      // mostrar "—" a mostrar um preco que nao e o de tabela.
      precoNormal: produto.prices.normal,
      relevancia: Math.round(nota * 100),
    })),
  };
}

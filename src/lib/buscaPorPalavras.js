import { produtosParaLista } from "@/lib/coleta/banco";
import { custoDoFornecedor } from "@/lib/coleta/impostos";
import { prisma } from "@/lib/db";
import { casaPalavra, indiceDePalavras, normalizar, notaComPesos, notasDeRelevancia, palavrasDoTermo, pesoDaPalavra } from "@/lib/texto";

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

const textoComparavel = (valor) => String(valor ?? "").trim().toLocaleLowerCase("pt-BR");

function enderecoComparavel(valor) {
  try {
    const endereco = new URL(valor);
    return `${endereco.hostname.replace(/^www\./, "")}${endereco.pathname.replace(/\/$/, "")}`.toLocaleLowerCase("pt-BR");
  } catch {
    return String(valor ?? "").trim().toLocaleLowerCase("pt-BR");
  }
}

/**
 * Os produtos que PODEM ser vinculos: os concorrentes pelo id, os das lojas com o nome de um fornecedor ligado e os do
 * mesmo endereco do link. E um superconjunto: a escolha de cada vinculo continua em `buscarReferencias`, com a mesma regra.
 */
async function produtosDosVinculos(fornecedoresLigados, idsConcorrentesLigados) {
  const nomes = new Set(fornecedoresLigados.map((fornecedor) => textoComparavel(fornecedor.nome)).filter(Boolean));
  const fontes = nomes.size ? await prisma.fonteColeta.findMany({ select: { id: true, nome: true } }) : [];
  const fontesDoNome = (nome) => fontes.filter((fonte) => textoComparavel(fonte.nome) === textoComparavel(nome)).map((fonte) => fonte.id);
  // Fornecedor com codigo ou link so escolhe o produto EXATO (codigo igual ou mesmo endereco): da loja dele basta o de codigo
  // parecido. Sem os dois, a escolha e pela nota entre TODOS os produtos da loja, e a loja inteira vem.
  const pelasLojas = fornecedoresLigados.flatMap((fornecedor) => {
    const ids = fontesDoNome(fornecedor.nome);
    if (!ids.length) return [];
    if (fornecedor.codigo) return [{ fonteId: { in: ids }, codigo: { contains: String(fornecedor.codigo).trim(), mode: "insensitive" } }];
    if (fornecedor.link) return [];
    return [{ fonteId: { in: ids } }];
  });
  // Pelo link: o endereco salvo contem o caminho (o host sem "www"); a comparacao exata e feita depois, como sempre.
  const pelosLinks = fornecedoresLigados
    .filter((fornecedor) => fornecedor.link)
    .map((fornecedor) => {
      try {
        const endereco = new URL(fornecedor.link);
        const caminho = endereco.pathname.replace(/\/$/, "");
        return { AND: [{ url: { contains: endereco.hostname.replace(/^www\./, ""), mode: "insensitive" } }, ...(caminho ? [{ url: { contains: caminho, mode: "insensitive" } }] : [])] };
      } catch {
        return { url: { contains: String(fornecedor.link).trim(), mode: "insensitive" } };
      }
    });
  const ou = [
    ...(idsConcorrentesLigados.length ? [{ id: { in: idsConcorrentesLigados } }] : []),
    ...pelasLojas,
    ...pelosLinks,
  ];
  return ou.length ? produtosParaLista({ OR: ou }) : [];
}

/**
 * A nota de cada candidato com a raridade das palavras medida no ACERVO INTEIRO, como a lupa, sem le-lo todo: uma palavra so
 * casa com um produto se aparece no `buscaTexto` dele sem os separadores (toda forma do `indiceDePalavras` e um pedaco desse
 * texto, e `casaPalavra` pede a forma igual ou comecando pela palavra). So a coluna `buscaTexto` e lida (medido no PC: 150
 * ms, contra 2,5 s de filtrar com regex no banco), o indice so e montado para quem contem alguma palavra, e a contagem exata
 * e feita com o `casaPalavra` de sempre.
 */
async function notasPelaRaridadeDoAcervo(palavras, candidatos) {
  if (palavras.length === 0) return candidatos.map(() => 0);
  const linhas = await prisma.produtoColetado.findMany({ select: { buscaTexto: true } });
  const formas = linhas
    .map((linha) => linha.buscaTexto ?? "")
    .filter((texto) => {
      const compacto = texto.replace(/[^a-z0-9]/g, "");
      return palavras.some((palavra) => compacto.includes(palavra));
    })
    .map((texto) => indiceDePalavras(texto));
  const total = linhas.length;
  const pesos = palavras.map((palavra) => pesoDaPalavra(palavra, total, formas.filter((itens) => casaPalavra(itens, palavra)).length));
  return candidatos.map((produto) => notaComPesos(indiceDePalavras(produto.buscaTexto), palavras, pesos));
}

export async function buscarReferencias(termo, { limite = TETO, fornecedoresLigados = [], idsConcorrentesLigados = [] } = {}) {
  const palavras = palavrasDoTermo(termo);
  // Sem palavras ainda acha os VINCULOS (pedido do dono em 06/10/2026: as indicacoes dos fornecedores e
  // concorrentes salvos aparecem mesmo com o Nome vazio); so nao ha achados por semelhanca.
  if (palavras.length === 0 && fornecedoresLigados.length === 0 && idsConcorrentesLigados.length === 0) {
    return { total: 0, itens: [] };
  }

  // Limite 0 pede SO os vinculos (a leitura que roda ao abrir o cadastro). Sem nenhum vinculo, como no produto novo, nao ha o que
  // devolver: ler o acervo inteiro (70 mil) levava 4 a 5 s na VPS e o Salvar esperava na fila das acoes do servidor (16/11/2026).
  if (limite === 0 && fornecedoresLigados.length === 0 && idsConcorrentesLigados.length === 0) {
    return { total: 0, itens: [] };
  }

  // Limite 0 (so os vinculos, a leitura que roda ao abrir o cadastro; 16/11/2026, Opcao 1 do dono): le no banco SO os produtos
  // ligados, e a raridade das palavras sai de uma contagem que nao monta o acervo inteiro. Ler os 120 mil coletados levava 4
  // a 6 s na VPS, e o Salvar esperava na fila das acoes. As notas sao as MESMAS do acervo inteiro (teste:cadastros compara).
  const soVinculos = limite === 0;
  // Todos os produtos do banco (07/10/2026), inclusive os concorrentes ligados que a ultima varredura nao viu.
  const todos = soVinculos ? await produtosDosVinculos(fornecedoresLigados, idsConcorrentesLigados) : await produtosParaLista();

  // A nota de cada produto: a fracao do peso do titulo que ele tem (ver `notasDeRelevancia`, em texto.js).
  const notasPorProduto = soVinculos
    ? await notasPelaRaridadeDoAcervo(palavras, todos)
    : notasDeRelevancia(palavras, todos.map((produto) => indiceDePalavras(produto.buscaTexto))).notas;

  // Com ate duas palavras todas precisam aparecer: "sensor" sozinho casaria com
  // metade do acervo.
  const minima = palavras.length <= 2 ? 1 : NOTA_MINIMA;

  // NOME CURTO DENTRO DO TITULO (pedido do dono em 25/10/2026): a Nightech chama a placa so de "PLACA PRO MINI", e
  // com o titulo "PLACA PRO MINI ATMEGA328P 5V 16MHZ COMPATIVEL COM ARDUINO" ela tirava 31% (as palavras de mais peso,
  // o modelo e a especificacao, nao estao no nome dela) e sumia da lupa. Produto cujo nome inteiro, com 3 palavras ou
  // mais, esta no titulo tambem entra, com a nota que tem. Com 3+ palavras o "Placa Arduino" generico continua fora.
  const formasDoTermo = indiceDePalavras(normalizar(termo));
  const nomeCabeNoTermo = (produto) => {
    const doNome = palavrasDoTermo(produto.name);
    return doNome.length >= 3 && doNome.every((palavra) => casaPalavra(formasDoTermo, palavra));
  };

  const achados = [];
  const notas = new Map();
  todos.forEach((produto, indice) => {
    // Sem palavras a nota e zero: nenhum achado (so os vinculos, abaixo).
    const nota = notasPorProduto[indice];
    notas.set(produto.id, nota);
    // Margem de arredondamento: com duas palavras, 1 pode vir como 0,9999.
    const passa = nota >= minima - 1e-9 || (palavras.length > 2 && nota > 0 && nomeCabeNoTermo(produto));
    if (palavras.length > 0 && passa) achados.push({ produto, nota });
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
      // FORNECEDOR: o custo com os impostos (IPI etc.), que e o que se paga (pedido do dono em 23/10/2026; a Fortek
      // aparecia sem o IPI). E este numero que vai para o custo do vinculo e para a lista "$" do preco.
      preco:
        produto.fonte.tipo === "FORNECEDOR"
          ? custoDoFornecedor(produto.prices, produto.taxes)
          : produto.prices.normal ?? produto.prices.promotional,
      // Estritamente o de tabela, sem cair no promocional: a lista de
      // Concorrentes da aba Fornecedores (pedido do dono em 18/09/2026) prefere
      // mostrar "—" a mostrar um preco que nao e o de tabela.
      precoNormal: produto.prices.normal,
      relevancia: Math.round(nota * 100),
      // Quando foi visto pela ultima vez, se a ultima varredura da loja nao o viu (a lupa marca).
      naoVistoDesde: produto.naoVistoDesde ?? null,
      // O estoque da loja (pedido do dono em 25/10/2026): a lista do "$" do preco poe quem nao tem por ultimo, como a aba
      // Concorrentes (`situacaoDeEstoque`), e mostra a quantidade quando a loja a informa.
      estoque: { quantidade: produto.stock?.quantity ?? null, estoqueStatus: produto.stock?.status ?? null },
    })),
  };
}

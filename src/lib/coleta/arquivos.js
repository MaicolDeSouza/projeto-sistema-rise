import { impostosDaFicha, precoComImpostos, semImpostos } from "./impostos";
import { mesclarNoExistente } from "./mesclar";
import { comoNumero, comoTexto } from "./texto-html";
import { normalizarPagina } from "./normalizar";

/**
 * Leitura de arquivo trazido do fornecedor.
 *
 * Caminho diferente da coleta, de proposito. Coleta abre o site do terceiro,
 * respeita robots.txt e ritmo, e deduz onde o dado esta. Aqui o operador ja
 * trouxe o arquivo: nao ha rede, nao ha educacao a respeitar, e os campos
 * costumam vir nomeados.
 *
 * Serve principalmente o fornecedor de portal fechado — a Benser publica
 * catalogo so depois do login, a Santana Import so mostra preco a cliente
 * cadastrado. Salvar a pagina ou baixar o catalogo e o unico caminho, e nao
 * envolve credencial nenhuma do nosso lado.
 *
 * O produto sai no MESMO formato da coleta. Muitos leitores, uma forma so —
 * senao a tela e a comparacao passariam a precisar saber de onde veio a linha.
 */

/// Quantos produtos um arquivo pode render. Catalogo de fornecedor grande passa
/// de mil itens; o teto existe para um arquivo corrompido nao virar um milhao
/// de linhas vazias.
const MAXIMO_PRODUTOS = 20000;

/// Nomes de campo que cada coisa costuma ter, em ordem de preferencia. E o
/// mapeamento declarativo do plano: fornecedor novo entra somando nome de
/// coluna aqui, ou num ajuste proprio, nunca escrevendo leitor novo.
const CAMPOS = {
  codigo: [
    "sku",
    "codigo",
    "cod",
    "reference",
    "referencia",
    "code",
    "id_produto",
    // Planilha de importador costuma chamar assim.
    "part_number",
    "partnumber",
  ],
  nome: ["desc", "descricao", "descrição", "nome", "name", "titulo", "título", "produto"],
  descricao: ["info", "detalhe", "detalhes", "descricao_longa", "observacao", "observação"],
  preco: [
    "preco",
    "price",
    "valor",
    "vlr",
    "preco_unitario",
    "valor_unitario",
    "valor_unit",
    "preco_unit",
  ],

  // Fornecedor que cobra diferente pelo que ainda vai chegar. Nem todos tem:
  // na Benser o preco e o mesmo nas duas listas na maioria dos itens.
  precoReserva: [
    "preco_reserva",
    "valor_reserva",
    "preco_encomenda",
    "preco_previsao",
  ],
  // Pronta entrega: o que da para despachar hoje.
  estoque: [
    "estoque",
    "saldo",
    "quantidade",
    "qtde",
    "qtd",
    "stock",
    "disponivel",
  ],

  // A chegar: comprado e ainda em transito. Fornecedor que trabalha com
  // importacao publica as duas colunas na mesma linha — a Benser separa em
  // dois arquivos, outros mandam num so.
  estoqueAChegar: [
    "reserva",
    "a_chegar",
    "achegar",
    "previsto",
    "previsao",
    "encomenda",
    "chegando",
    "em_transito",
    "transito",
    "futuro",
    "previsao",
  ],

  /// Colunas que PARECEM estoque e nao sao. A planilha da Nightech tem
  /// "QUANTIDADE DO PEDIDO", que e quanto o comprador esta pedindo — ler isso
  /// como saldo do fornecedor mostraria zero em produto com 4618 em estoque.
  ignorar: [
    "quantidade_do_pedido",
    "qtde_pedido",
    "valor_bruto",
    "total",
    "subtotal",
  ],
  ncm: ["ncm"],
  ean: ["ean", "gtin", "codigo_barras", "cod_barras", "barras"],
  ipi: ["ipi"],
  categoria: ["cat", "categoria", "category", "grupo", "linha"],
  multiplo: ["multiplo", "múltiplo", "multiplo_de_venda", "embalagem", "caixa", "pack"],
};

/**
 * Normaliza um nome de coluna para comparar: sem acento, sem pontuacao, em
 * minusculas, separado por sublinhado. "VALOR UNIT. (R$)" vira "valor_unit_r".
 */
function comoChave(texto) {
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Acha, num objeto, a primeira chave que casa com um dos nomes conhecidos.
 *
 * Casa por PREFIXO: a Nightech escreve "PREVISÃO 20/09" e "VALOR UNIT. (R$)",
 * com a data e a moeda coladas no nome. Exigir igualdade exata perderia as
 * duas — e a data no cabecalho muda a cada planilha.
 *
 * Colunas em CAMPOS.ignorar sao descartadas antes: ha nome que parece estoque
 * e nao e ("QUANTIDADE DO PEDIDO" e o pedido do comprador).
 */
function valorDe(objeto, nomes) {
  const chaves = Object.keys(objeto).map((original) => ({
    original,
    normalizada: comoChave(original),
  }));

  const uteis = chaves.filter(
    ({ normalizada }) => !CAMPOS.ignorar.some((ruim) => normalizada.startsWith(ruim)),
  );

  for (const nome of nomes) {
    const achada = uteis.find(
      ({ normalizada }) => normalizada === nome || normalizada.startsWith(`${nome}_`),
    );

    if (achada) {
      const valor = objeto[achada.original];
      if (valor !== "" && valor !== null && valor !== undefined) return valor;
    }
  }
  return null;
}

/**
 * Um objeto solto vira produto no formato da coleta.
 *
 * Campo ausente fica null, nunca inventado — a mesma regra da coleta. O codigo
 * e a excecao combinada: sem ele o produto sai da estrutura de acesso, entao
 * entra como N/A, e a origem registra que a marcacao foi nossa.
 */
function comoProduto(bruto, { fonte, origem, imagens, modalidade }) {
  const codigo = comoTexto(valorDe(bruto, CAMPOS.codigo));
  const nome = comoTexto(valorDe(bruto, CAMPOS.nome));
  if (!nome) return null;

  const deReserva = modalidade === "RESERVA";

  const preco = comoNumero(valorDe(bruto, CAMPOS.preco));
  const precoReserva = comoNumero(valorDe(bruto, CAMPOS.precoReserva));
  const estoque = comoNumero(valorDe(bruto, CAMPOS.estoque));
  const aChegar = comoNumero(valorDe(bruto, CAMPOS.estoqueAChegar));

  const especificacoes = [];
  const ipi = valorDe(bruto, CAMPOS.ipi);
  if (ipi !== null) especificacoes.push({ nome: "IPI", valor: String(ipi) });

  // Multiplo de venda e regra de COMPRA, nao caracteristica do produto (o dono,
  // 17/09/2026): vai para `multiploVenda`, com caixa propria na tela.
  const multiplo = comoNumero(valorDe(bruto, CAMPOS.multiplo));

  // O IPI da planilha ja virou especificacao acima; daqui ele vira imposto de
  // verdade, com percentual, e produz o preco com impostos.
  const impostos = impostosDaFicha(especificacoes);

  return {
    name: nome,
    code: codigo ?? "N/A",
    mpn: null,
    ean: comoTexto(valorDe(bruto, CAMPOS.ean)),
    brand: null,
    model: null,
    category: comoTexto(valorDe(bruto, CAMPOS.categoria)),
    ncm: comoTexto(valorDe(bruto, CAMPOS.ncm)),
    url: null,
    // A foto vem do mapa da pagina salva, casada pelo codigo. Sem codigo
    // nao ha como casar, e ficar sem foto e melhor que mostrar a de outro.
    images: codigo && imagens?.get(codigo) ? [imagens.get(codigo)] : [],
    prices: {
      // `normal` e sempre o de PRONTA ENTREGA. O que se paga pelo que ainda
      // vai chegar fica separado: os dois costumam divergir, e um campo so
      // esconderia a diferenca com dois numeros igualmente plausiveis.
      //
      // Num arquivo que E a lista de reserva, o preco da linha e o de reserva:
      // nao ha preco de pronta entrega ali para guardar.
      normal: deReserva ? null : preco,
      promotional: null,
      reserva: deReserva ? preco : precoReserva,
      comImpostos: deReserva ? null : precoComImpostos(preco, impostos),
    },
    taxes: impostos,
    multiploVenda: multiplo > 0 ? Math.round(multiplo) : null,
    // Estoque negativo e informacao, nao erro: quer dizer vendido a descoberto.
    //
    // `quantity` e sempre a PRONTA ENTREGA — o que da para despachar hoje. O
    // que esta comprado e em transito fica em `aChegar`, separado: somar os
    // dois num numero so prometeria entrega que o fornecedor nao tem.
    stock: {
      status:
        deReserva || estoque === null
          ? "UNKNOWN"
          : estoque > 0
            ? "IN_STOCK"
            : "OUT_OF_STOCK",
      // Na lista de reserva a quantidade da linha e o que VAI chegar, nao o
      // que ha em casa. Trocar os dois prometeria entrega imediata de algo que
      // ainda esta em transito.
      quantity: deReserva ? null : estoque,
      aChegar: deReserva ? estoque : aChegar,
    },
    description: comoTexto(valorDe(bruto, CAMPOS.descricao)) ?? nome,
    specifications: semImpostos(especificacoes),
    variants: [],
    seo: {},
    collectedAt: new Date().toISOString(),
    origens: {
      code: codigo ? origem : "sem codigo no arquivo — marcado N/A",
      name: origem,
      ...(preco !== null ? { price: origem } : {}),
    },
    fonte,
  };
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

/** Recorta um literal JSON equilibrado, ignorando colchetes dentro de string. */
function recortarJson(texto, inicio) {
  let profundidade = 0;
  let emTexto = false;
  let escapado = false;

  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (emTexto) {
      if (escapado) escapado = false;
      else if (c === "\\") escapado = true;
      else if (c === '"') emTexto = false;
      continue;
    }
    if (c === '"') emTexto = true;
    else if (c === "[" || c === "{") profundidade++;
    else if (c === "]" || c === "}") {
      profundidade--;
      if (profundidade === 0) return texto.slice(inicio, i + 1);
    }
  }
  return null;
}

/**
 * Array de produtos embutido num <script> da pagina salva.
 *
 * E o caso da Benser: o portal monta a tela por JavaScript e leva o catalogo
 * inteiro junto, 1592 produtos com sku, desc, preco, estoque, ncm e ipi. Salvar
 * a pagina traz tudo de uma vez, sem login e sem raspagem.
 */
function arrayEmbutido(html) {
  // Procura o primeiro objeto que tenha cara de produto e recua ate o "[".
  const marca = /\{\s*"(sku|codigo|reference)"\s*:/i.exec(html);
  if (!marca) return [];

  const abertura = html.lastIndexOf("[", marca.index);
  if (abertura === -1) return [];

  const bruto = recortarJson(html, abertura);
  if (!bruto) return [];

  try {
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

/**
 * Fotos embutidas na pagina salva, por codigo do produto.
 *
 * A Benser leva o catalogo inteiro no HTML, e as fotos junto: um mapa de
 * '"09-010": "data:image/jpeg;base64,..."' com uma imagem por SKU, cerca de
 * 6 kB cada. Salvar a pagina traz produto e foto de uma vez.
 *
 * Ficam como data URI mesmo. Gravar em disco seria melhor para o catalogo
 * inteiro — sao 10 MB —, mas a previa mostra tres produtos, e escrever
 * arquivo so para exibir tres miniaturas criaria lixo para limpar depois.
 */
function imagensEmbutidas(html) {
  const porCodigo = new Map();

  const padrao = /"([^"]{2,24})"\s*:\s*"(data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+)"/gi;
  for (const achado of html.matchAll(padrao)) {
    if (!porCodigo.has(achado[1])) porCodigo.set(achado[1], achado[2]);
  }

  return porCodigo;
}
/** Linhas de <table>, com o cabecalho virando nome de campo. */
function linhasDeTabela(html) {
  const tabelas = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  const itens = [];

  for (const tabela of tabelas) {
    const linhas = tabela.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    if (linhas.length < 2) continue;

    const celulas = (linha) =>
      [...linha.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => comoTexto(m[1]) ?? "");

    const cabecalho = celulas(linhas[0]);
    if (cabecalho.length < 2) continue;

    for (const linha of linhas.slice(1)) {
      const valores = celulas(linha);
      if (valores.length !== cabecalho.length) continue;

      const objeto = {};
      cabecalho.forEach((nome, i) => {
        objeto[nome] = valores[i];
      });
      itens.push(objeto);
    }
  }

  return itens;
}

// ---------------------------------------------------------------------------
// Planilha (XLSX)
// ---------------------------------------------------------------------------

/// Ate onde procurar o cabecalho. Planilha de fornecedor comeca com logo,
/// data e total do pedido — a Nightech poe os nomes de coluna na LINHA 6.
const LINHAS_ATE_CABECALHO = 20;

/**
 * Acha a linha de cabecalho: a que tem mais nomes de coluna reconheciveis.
 *
 * Assumir a linha 1 quebraria em toda planilha com cabecalho decorado, que e a
 * maioria — e o erro seria silencioso, porque o leitor acharia colunas chamadas
 * "" e devolveria produtos vazios.
 */
function acharCabecalho(folha) {
  const conhecidos = Object.values(CAMPOS).flat();
  let melhor = { linha: 1, pontos: 0 };

  const ate = Math.min(LINHAS_ATE_CABECALHO, folha.rowCount);
  for (let n = 1; n <= ate; n++) {
    let pontos = 0;

    folha.getRow(n).eachCell({ includeEmpty: false }, (celula) => {
      const chave = comoChave(celula.text ?? "");
      if (!chave) return;
      if (conhecidos.some((nome) => chave === nome || chave.startsWith(`${nome}_`))) {
        pontos++;
      }
    });

    if (pontos > melhor.pontos) melhor = { linha: n, pontos };
  }

  return melhor.pontos >= 2 ? melhor.linha : null;
}

/**
 * Fotos embutidas na planilha, por LINHA.
 *
 * Excel nao guarda imagem dentro da celula: ela flutua sobre a folha, ancorada
 * a uma posicao. O ExcelJS devolve as ancoras separadas das linhas, e o
 * `imageId` de cada uma aponta para o binario em `workbook.model.media`.
 *
 * Medido no catalogo da Nightech: 459 ancoras para 431 arquivos — imagem
 * repetida em produtos parecidos —, todas na coluna da IMAGEM, uma por linha
 * de produto.
 *
 * Vira data URI porque a previa mostra tres produtos. Para a importacao
 * completa isso precisa ir para disco, como ja acontece com dados/produtos.
 */
function imagensDaPlanilha(pasta, folha) {
  const porLinha = new Map();

  for (const ancorada of folha.getImages?.() ?? []) {
    const linha = Math.round(ancorada.range?.tl?.nativeRow ?? -1) + 1;
    if (linha < 1 || porLinha.has(linha)) continue;

    const media = pasta.model?.media?.[Number(ancorada.imageId)];
    if (!media?.buffer) continue;

    const tipo = media.extension === "png" ? "image/png" : "image/jpeg";
    const base64 = Buffer.from(media.buffer).toString("base64");
    porLinha.set(linha, `data:${tipo};base64,${base64}`);
  }

  return porLinha;
}
/**
 * Linhas de uma planilha, com o cabecalho virando nome de campo.
 *
 * Le a PRIMEIRA folha. Fornecedor que manda varias abas costuma separar por
 * linha de produto, e adivinhar qual vale seria escolher por ele.
 */
async function lerPlanilha(bytes) {
  const ExcelJS = (await import("exceljs")).default;

  const pasta = new ExcelJS.Workbook();
  await pasta.xlsx.load(bytes);

  const folha = pasta.worksheets[0];
  if (!folha) return { itens: [], imagens: null, aviso: "A planilha nao tem nenhuma folha." };

  const linhaCabecalho = acharCabecalho(folha);
  if (!linhaCabecalho) {
    return {
      itens: [],
      imagens: null,
      aviso:
        `Nao reconheci o cabecalho nas primeiras ${LINHAS_ATE_CABECALHO} linhas da folha "${folha.name}".`,
    };
  }

  const nomes = new Map();
  folha.getRow(linhaCabecalho).eachCell({ includeEmpty: false }, (celula, coluna) => {
    const nome = (celula.text ?? "").trim();
    if (nome) nomes.set(coluna, nome);
  });

  const fotosPorLinha = imagensDaPlanilha(pasta, folha);

  const itens = [];
  const imagens = new Map();

  for (let n = linhaCabecalho + 1; n <= folha.rowCount; n++) {
    const linha = folha.getRow(n);
    const objeto = {};
    let preenchidas = 0;

    for (const [coluna, nome] of nomes) {
      const celula = linha.getCell(coluna);
      // .text resolve formula e formatacao; .value traria o objeto cru.
      const valor = (celula.text ?? "").trim();
      objeto[nome] = valor;
      if (valor) preenchidas++;
    }

    // Linha de total ou separador tem uma celula so preenchida.
    if (preenchidas < 2) continue;

    itens.push(objeto);

    // A foto e casada pela LINHA e guardada pelo CODIGO, que e como o resto do
    // leitor procura imagem. Sem codigo nao ha como guardar.
    const foto = fotosPorLinha.get(n);
    const codigo = foto ? comoTexto(valorDe(objeto, CAMPOS.codigo)) : null;
    if (codigo && !imagens.has(codigo)) imagens.set(codigo, foto);
  }

  return { itens, imagens, aviso: null, folha: folha.name, linhaCabecalho };
}
// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/**
 * Linhas de catalogo em PDF.
 *
 * A extracao de tabela da biblioteca devolve vazio nos catalogos testados — o
 * PDF da Santana Import tem 65 paginas "com tabela" e nenhuma linha. O que
 * funciona e o texto: as colunas chegam separadas por tabulacao.
 *
 *   "020-2160 \t 2K X 1600V \t 10"
 *
 * A linha so vira produto quando comeca por algo com cara de codigo. Sem esse
 * ancoradouro, entram titulo de secao, rodape e texto de garantia — o catalogo
 * da Santana tem 9465 linhas e so 581 sao produto.
 */
function linhasDePdf(texto) {
  const itens = [];

  for (const linhaBruta of texto.split("\n")) {
    const colunas = linhaBruta.split("\t").map((c) => c.trim()).filter(Boolean);
    if (colunas.length < 2) continue;

    // Codigo: comeca a linha, tem digito e separador ou e alfanumerico curto.
    const codigo = colunas[0];
    const ehCodigo =
      /^[A-Z0-9]{2,}[-.][A-Z0-9-]{2,}$/i.test(codigo) ||
      /^[A-Z]{1,4}\d{3,}$/i.test(codigo);
    if (!ehCodigo) continue;

    const numeros = colunas.slice(2).map(comoNumero).filter((n) => n !== null);

    itens.push({
      sku: codigo,
      desc: colunas[1],
      // A terceira coluna do catalogo da Santana e o multiplo de venda. Nao e
      // preco: o catalogo impresso nao traz preco, que la e so para cliente
      // cadastrado.
      multiplo: numeros[0] ?? null,
    });
  }

  return itens;
}

async function textoDoPdf(bytes) {
  const { PDFParse } = await import("pdf-parse");
  const leitor = new PDFParse({ data: new Uint8Array(bytes) });

  try {
    const { text } = await leitor.getText();
    return text ?? "";
  } finally {
    await leitor.destroy?.();
  }
}

// ---------------------------------------------------------------------------

/**
 * O arquivo e da lista de PRONTA ENTREGA ou da de RESERVA?
 *
 * Fornecedor que importa mantem duas listas. A Benser manda dois arquivos, e
 * eles se identificam sozinhos no titulo:
 *
 *   <title>Benser · Portal de Pedidos</title>   → pronta entrega
 *   <title>Benser · Lista de Reserva</title>    → reserva
 *
 * O titulo vem antes do nome do arquivo porque o nome o operador renomeia; o
 * titulo veio do fornecedor. Na duvida, PRONTA_ENTREGA — e o caso comum, e
 * marcar reserva por engano transformaria estoque disponivel em estoque
 * futuro, prometendo entrega que nao existe.
 *
 * Planilha com as DUAS colunas na mesma linha nao tem modalidade: cada linha
 * ja traz os dois numeros. Por isso so decide sobre HTML e PDF.
 */
export function modalidadeDoArquivo({ nome, texto, formato }) {
  if (formato === "xlsx") return null;

  const titulo = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(texto ?? "")?.[1] ?? "";

  const diz = (frase) =>
    frase
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const marcado = `${diz(titulo)} ${diz(nome ?? "")}`;

  if (/\breserva\b|\bencomenda\b|\ba\s*chegar\b/.test(marcado)) return "RESERVA";
  return "PRONTA_ENTREGA";
}
/** Pelo nome e pelos primeiros bytes — extensao mente, assinatura nao. */
export function formatoDoArquivo(nome, bytes) {
  if (bytes?.length > 4 && String.fromCharCode(...bytes.slice(0, 4)) === "%PDF") return "pdf";

  // XLSX e um ZIP: os dois primeiros bytes sao PK.
  if (bytes?.length > 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return "xlsx";

  const extensao = /\.([a-z0-9]+)$/i.exec(nome ?? "")?.[1]?.toLowerCase();
  if (extensao === "pdf") return "pdf";
  if (extensao === "xlsx" || extensao === "xlsm") return "xlsx";
  if (extensao === "json") return "json";
  if (extensao === "html" || extensao === "htm") return "html";

  const inicio = new TextDecoder("latin1").decode(bytes.slice(0, 400)).trim();
  if (inicio.startsWith("{") || inicio.startsWith("[")) return "json";
  if (/^<!doctype html|^<html/i.test(inicio)) return "html";

  return "desconhecido";
}

/**
 * Le o arquivo do fornecedor e devolve produtos no formato da coleta.
 *
 * @param {object} entrada
 * @param {string} entrada.nome    nome do arquivo, para descobrir o formato
 * @param {Uint8Array} entrada.bytes
 * @param {object} entrada.fonte   {name, type}
 */
export async function lerArquivo({ nome, bytes, fonte }) {
  const formato = formatoDoArquivo(nome, bytes);
  const avisos = [];
  let brutos = [];
  let origem = "arquivo do fornecedor";
  let imagensPorCodigo = null;
  let modalidade = null;

  if (formato === "xlsx") {
    const { itens, imagens, aviso, folha, linhaCabecalho } = await lerPlanilha(bytes);
    brutos = itens;
    imagensPorCodigo = imagens ?? null;
    origem = folha
      ? `planilha do fornecedor (folha "${folha}", cabecalho na linha ${linhaCabecalho})`
      : "planilha do fornecedor";
    if (aviso) avisos.push(aviso);
  } else if (formato === "pdf") {
    const texto = await textoDoPdf(bytes);
    brutos = linhasDePdf(texto);
    origem = "catalogo em PDF do fornecedor";
    if (brutos.length === 0 && texto.length > 0) {
      avisos.push(
        "O PDF tem texto, mas nenhuma linha com cara de produto. Catalogo em imagem, ou colunas em outro formato.",
      );
    }
  } else if (formato === "json") {
    try {
      const dados = JSON.parse(new TextDecoder("utf-8").decode(bytes));
      const lista = Array.isArray(dados)
        ? dados
        : Object.values(dados).find((v) => Array.isArray(v)) ?? [];
      brutos = lista.map((item) => item?.Product ?? item);
      origem = "arquivo JSON do fornecedor";
    } catch {
      avisos.push("O arquivo nao e JSON valido.");
    }
  } else if (formato === "html") {
    // O charset importa: portal brasileiro em Latin-1 nao e raro, e decodificar
    // como UTF-8 grava texto corrompido.
    const bruto = new TextDecoder("latin1").decode(bytes.slice(0, 4096));
    const declarado =
      /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(bruto)?.[1]?.toLowerCase() ?? "utf-8";

    let html;
    try {
      html = new TextDecoder(declarado).decode(bytes);
    } catch {
      html = new TextDecoder("utf-8").decode(bytes);
    }

    modalidade = modalidadeDoArquivo({ nome, texto: html, formato });

    brutos = arrayEmbutido(html);
    origem = "catalogo embutido na pagina salva";
    imagensPorCodigo = imagensEmbutidas(html);

    if (brutos.length === 0) {
      brutos = linhasDeTabela(html);
      origem = "tabela da pagina salva";
    }

    // Ainda nada: pode ser a pagina de UM produto, e ai vale o normalizador.
    if (brutos.length === 0) {
      const { produtos } = normalizarPagina({
        html,
        url: "file://arquivo",
        fonte,
      });
      return { formato, produtos, avisos, origem: "pagina de produto salva" };
    }
  } else {
    avisos.push(`Formato nao reconhecido: ${nome ?? "sem nome"}.`);
  }

  if (brutos.length > MAXIMO_PRODUTOS) {
    avisos.push(`O arquivo traz ${brutos.length} linhas; lendo as primeiras ${MAXIMO_PRODUTOS}.`);
    brutos = brutos.slice(0, MAXIMO_PRODUTOS);
  }

  const produtos = brutos
    .map((bruto) =>
      comoProduto(bruto, { fonte, origem, imagens: imagensPorCodigo, modalidade }),
    )
    .filter(Boolean);

  return { formato, produtos, avisos, origem, modalidade };
}

/**
 * Junta produtos vindos de listas diferentes do MESMO fornecedor.
 *
 * O caso e a Fortek: um arquivo de pronta entrega e outro de reserva, e o
 * mesmo item aparece nos dois com quantidades diferentes. Vira um produto so —
 * o codigo e a chave de acesso, e duas linhas com o mesmo codigo tornariam a
 * busca por codigo ambigua.
 *
 * O casamento e por codigo EXATO por padrao. `sufixoDeCarga` amplia isso para
 * o fornecedor cujo codigo carrega o lote no fim ("02-268-A" e o mesmo item que
 * "02-268"), e vem do registro em fornecedores.js — por fornecedor, medido, e
 * nunca como palpite geral: noutro catalogo o "-2" pode ser voltagem ou versao,
 * e juntar apagaria produto.
 *
 * @param {object[][]} listas
 * @param {object} [opcoes]
 * @param {RegExp} [opcoes.sufixoDeCarga]
 */
export function juntarListas(listas, { sufixoDeCarga } = {}) {
  // A chave de agrupamento: o codigo, sem o sufixo de carga quando o
  // fornecedor tem essa regra declarada.
  const chaveDe = (codigo) =>
    sufixoDeCarga ? String(codigo).replace(sufixoDeCarga, "") : String(codigo);

  const porChave = new Map();
  const juntos = [];

  for (const produto of listas.flat()) {
    if (!produto.code || produto.code === "N/A") {
      juntos.push(produto);
      continue;
    }

    const chave = chaveDe(produto.code);
    const existente = porChave.get(chave);

    if (!existente) {
      juntos.push(produto);
      porChave.set(chave, produto);
      continue;
    }

    // A regra de mesclagem mora em mesclar.js, compartilhada com a tela: a
    // juncao de site com planilha usa exatamente a mesma.
    mesclarNoExistente(existente, produto);
  }

  return juntos;
}

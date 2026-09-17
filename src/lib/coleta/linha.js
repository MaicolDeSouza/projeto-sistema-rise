import { createHash } from "node:crypto";

import { normalizar } from "@/lib/texto";

/**
 * Conversao entre o produto coletado e a linha de `ProdutoColetado`.
 *
 * O produto que `normalizar.js` e os leitores de arquivo devolvem continua
 * sendo a forma de trabalho — conciliar, mesclar e a previa falam nela. O banco
 * so guarda. Por isso a conversao vai e volta, e VOLTA IGUAL: um produto lido do
 * banco e gravado de novo sem mudanca tem que dar a mesma assinatura, senao
 * toda coleta reescreveria a lista inteira da Fortek.
 *
 * Nada aqui toca o banco: da para testar sem Postgres.
 */

/// O que `normalizar.js` grava quando a pagina nao publica codigo. Nao
/// identifica nada — dois produtos N/A sao produtos diferentes.
const SEM_CODIGO = "N/A";

const comoTexto = (valor) =>
  valor === null || valor === undefined || String(valor).trim() === "" ? null : String(valor);

const comoNumero = (valor) =>
  typeof valor === "number" && Number.isFinite(valor) ? valor : null;

// A coluna e inteira; saldo fracionado nao existe em lista de fornecedor, e
// arredondar e melhor que a gravacao inteira falhar por um "12.0000001".
const comoInteiro = (valor) =>
  typeof valor === "number" && Number.isFinite(valor) ? Math.round(valor) : null;

// Lista vazia e objeto vazio viram null: `[]` e "nao tem" dizem o mesmo, e
// guardar os dois faria o mesmo produto ter duas assinaturas.
const comoLista = (valor) => (Array.isArray(valor) && valor.length > 0 ? valor : null);

const comoObjeto = (valor) =>
  valor && typeof valor === "object" && !Array.isArray(valor) && Object.keys(valor).length > 0
    ? valor
    : null;

const comoData = (valor) => {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
};

// Decimal do Prisma, string ou numero: a comparacao de preco precisa de numero.
const numeroDoBanco = (valor) => (valor === null || valor === undefined ? null : Number(valor));

/**
 * O que identifica o produto dentro da fonte.
 *
 * O CODIGO primeiro: e o ponto de acesso ao produto do concorrente, e e por ele
 * que conciliar e mesclar ja casam. Sem codigo, o endereco. Sem os dois — linha
 * de planilha sem codigo —, o nome normalizado. Nunca a posicao na lista.
 *
 * @returns {string|null} null quando nao ha nada que identifique o produto
 */
export function chaveDoProduto(produto) {
  const codigo = comoTexto(produto?.code)?.trim();
  if (codigo && codigo !== SEM_CODIGO) return `codigo:${codigo}`;

  const url = comoTexto(produto?.url);
  if (url) return `url:${url}`;

  const nome = normalizar(produto?.name ?? "");
  return nome ? `nome:${nome}` : null;
}

/**
 * JSON com as chaves em ordem alfabetica.
 *
 * O JSONB do Postgres NAO guarda a ordem das chaves: `origens` e `seo` voltam do
 * banco reordenados. Com JSON.stringify comum, o mesmo produto lido do banco e
 * gravado de novo daria outra assinatura, e todo ausente seria reescrito a cada
 * lista. A ordem dos ITENS de uma lista continua valendo — a ficha e ordenada.
 */
function estavel(valor) {
  if (valor instanceof Date) return JSON.stringify(valor.toISOString());
  if (Array.isArray(valor)) return `[${valor.map(estavel).join(",")}]`;
  if (valor && typeof valor === "object") {
    const chaves = Object.keys(valor)
      .filter((chave) => valor[chave] !== undefined)
      .sort();
    return `{${chaves.map((chave) => `${JSON.stringify(chave)}:${estavel(valor[chave])}`).join(",")}}`;
  }
  return JSON.stringify(valor ?? null);
}

/**
 * Assinatura do conteudo.
 *
 * `coletadoEm` fica de fora de proposito: toda coleta le a pagina de novo, e com
 * a data dentro nenhuma linha jamais pareceria inalterada.
 */
function assinatura(linha) {
  const { coletadoEm, hashConteudo, ...conteudo } = linha;
  return createHash("sha1").update(estavel(conteudo)).digest("hex");
}

/**
 * Produto coletado -> dados da linha (sem fonteId, sem vistoEm).
 *
 * @param {object} produto  como sai de normalizar.js ou dos leitores de arquivo
 * @param {object} opcoes
 * @param {"site"|"arquivo"} opcoes.origem
 */
export function linhaDoProduto(produto, { origem }) {
  const imagens = comoLista(produto.images);

  const linha = {
    chave: chaveDoProduto(produto),
    origem,

    codigo: comoTexto(produto.code),
    nome: comoTexto(produto.name),
    marca: comoTexto(produto.brand),
    modelo: comoTexto(produto.model),
    mpn: comoTexto(produto.mpn),
    ean: comoTexto(produto.ean),
    categoria: comoTexto(produto.category),
    ncm: comoTexto(produto.ncm),
    url: comoTexto(produto.url),

    precoNormal: comoNumero(produto.prices?.normal),
    precoPromocional: comoNumero(produto.prices?.promotional),
    precoReserva: comoNumero(produto.prices?.reserva),
    precoComImpostos: comoNumero(produto.prices?.comImpostos),
    impostos: comoLista(produto.taxes),

    // So entram na linha quando existem: `undefined` fica fora da assinatura, e
    // os produtos que nunca tiveram estes campos nao mudam de assinatura — senao
    // a primeira varredura depois deles reescreveria todas as fontes.
    precosPorQuantidade: comoLista(produto.precosPorQuantidade) ?? undefined,
    multiploVenda: comoInteiro(produto.multiploVenda) ?? undefined,

    estoqueStatus: comoTexto(produto.stock?.status),
    quantidade: comoInteiro(produto.stock?.quantity),
    aChegar: comoInteiro(produto.stock?.aChegar),

    miniatura: imagens ? String(imagens[0]) : null,
    imagens,
    descricao: comoTexto(produto.description),
    especificacoes: comoLista(produto.specifications),
    documentos: comoLista(produto.documentos),
    variantes: comoLista(produto.variants),
    seo: comoObjeto(produto.seo),
    plataforma: comoObjeto(produto.plataforma),
    origens: comoObjeto(produto.origens),

    ausenteDesde: comoData(produto.ausente?.desde),
    ausenteMotivo: comoTexto(produto.ausente?.motivo),

    coletadoEm: comoData(produto.collectedAt),
  };

  // Os mesmos campos que a busca da tela sempre varreu. A descricao fica de
  // fora: procurar "preto" devolveria o catalogo inteiro.
  linha.buscaTexto =
    normalizar(
      [linha.nome, linha.marca, linha.modelo, linha.codigo, linha.mpn, linha.ean]
        .filter(Boolean)
        .join(" "),
    ) || null;

  linha.hashConteudo = assinatura(linha);
  return linha;
}

/**
 * Linha do banco -> produto coletado, na forma que conciliar e a tela conhecem.
 */
export function produtoDaLinha(linha) {
  return {
    name: linha.nome,
    code: linha.codigo,
    mpn: linha.mpn,
    ean: linha.ean,
    brand: linha.marca,
    model: linha.modelo,
    category: linha.categoria,
    ncm: linha.ncm,
    url: linha.url,
    images: linha.imagens ?? [],
    prices: {
      normal: numeroDoBanco(linha.precoNormal),
      promotional: numeroDoBanco(linha.precoPromocional),
      reserva: numeroDoBanco(linha.precoReserva),
      comImpostos: numeroDoBanco(linha.precoComImpostos),
    },
    taxes: linha.impostos ?? [],
    precosPorQuantidade: linha.precosPorQuantidade ?? [],
    multiploVenda: linha.multiploVenda ?? null,
    stock: {
      status: linha.estoqueStatus,
      quantity: linha.quantidade,
      aChegar: linha.aChegar,
    },
    description: linha.descricao,
    specifications: linha.especificacoes ?? [],
    documentos: linha.documentos ?? [],
    variants: linha.variantes ?? [],
    seo: linha.seo ?? {},
    plataforma: linha.plataforma ?? null,
    origens: linha.origens ?? {},
    collectedAt: linha.coletadoEm ? new Date(linha.coletadoEm).toISOString() : null,
    ...(linha.ausenteDesde
      ? {
          ausente: {
            desde: new Date(linha.ausenteDesde).toISOString(),
            motivo: linha.ausenteMotivo,
          },
        }
      : {}),
  };
}

/**
 * O preco ou o estoque declarado mudaram entre a linha guardada e a nova?
 *
 * E o que decide se a serie ganha linha. A quantidade fica de fora: muda todo
 * dia no fornecedor e faria toda coleta parecer mudanca de preco.
 */
export function mudouPreco(guardada, nova) {
  return (
    numeroDoBanco(guardada.precoNormal) !== nova.precoNormal ||
    numeroDoBanco(guardada.precoPromocional) !== nova.precoPromocional ||
    numeroDoBanco(guardada.precoReserva) !== nova.precoReserva ||
    (guardada.estoqueStatus ?? null) !== nova.estoqueStatus
  );
}

/** A linha da serie de preco que corresponde a uma linha de produto. */
export function linhaDePreco(linha) {
  return {
    precoNormal: linha.precoNormal,
    precoPromocional: linha.precoPromocional,
    precoReserva: linha.precoReserva,
    estoqueStatus: linha.estoqueStatus,
  };
}

import { prisma } from "@/lib/db";
import { obter, USER_AGENT } from "@/lib/coleta/http";
import { ErroDeRecusa, enderecoPublico, lookupPublico, validarEnderecoPublico } from "@/lib/redePublica";

const MAXIMO_REFERENCIAS = 100;
const MAXIMO_BYTES = 20 * 1024 * 1024;
const MAXIMO_REDIRECIONAMENTOS = 3;
const formatosConsultados = new Map();

/// Toda busca de documento passa por aqui: o IP conferido e o IP em que a conexao abre (`lookupPublico`), e o
/// endereco de cada salto de redirecionamento e conferido antes de sair (`validarEnderecoPublico`). Com `fetch`,
/// o nome era resolvido uma vez para conferir e outra, pelo fetch, para conectar.
const REDE_PUBLICA = { lookup: lookupPublico, validar: validarEnderecoPublico };

function formatoPeloNome(valor) {
  const extensao = String(valor ?? "").match(/\.(pdf|jpe?g|png|zip|rar|7z|docx?|xlsx?|pptx?|csv|txt|stl|dxf|step|ino|hex)(?:[?#]|$)/i)?.[1];
  return extensao ? (extensao.toLowerCase() === "jpeg" ? "JPG" : extensao.toUpperCase()) : null;
}

async function formatoPeloCabecalho(endereco) {
  let url = enderecoPublico(endereco);
  const sinal = AbortSignal.timeout(5000);
  for (let tentativa = 0; tentativa <= MAXIMO_REDIRECIONAMENTOS; tentativa++) {
    // `seguir: false`: um HEAD so quer os cabecalhos, e o salto seguinte do `obter` seria um GET que baixaria o
    // arquivo inteiro em segundo plano. Os redirecionamentos sao seguidos aqui, um HEAD por salto.
    const resposta = await obter(url, {
      ...REDE_PUBLICA,
      metodo: "HEAD",
      seguir: false,
      sinal,
      cabecalhos: { "User-Agent": USER_AGENT },
    });
    if ([301, 302, 303, 307, 308].includes(resposta.status)) {
      if (!resposta.localizacao) return null;
      url = enderecoPublico(new URL(resposta.localizacao, url).href);
      continue;
    }
    if (resposta.status < 200 || resposta.status >= 300) return null;
    const disposicao = resposta.cabecalhos["content-disposition"] ?? "";
    const nome = disposicao.match(/filename\*?=(?:UTF-8''|["']?)([^"';]+)/i)?.[1];
    const formato = formatoPeloNome(nome && decodeURIComponent(nome));
    if (formato) return formato;
    const tipo = resposta.cabecalhos["content-type"] ?? "";
    if (/application\/pdf/i.test(tipo)) return "PDF";
    if (/image\/jpe?g/i.test(tipo)) return "JPG";
    if (/image\/png/i.test(tipo)) return "PNG";
    if (/application\/(zip|x-zip-compressed)/i.test(tipo)) return "ZIP";
    return formatoPeloNome(url.pathname);
  }
  return null;
}

function formatoDoDocumento(url, titulo) {
  const imediato = formatoPeloNome(url) || formatoPeloNome(titulo);
  if (imediato) return Promise.resolve(imediato);
  if (!formatosConsultados.has(url)) {
    if (formatosConsultados.size > 500) formatosConsultados.clear();
    formatosConsultados.set(url, formatoPeloCabecalho(url).catch(() => null));
  }
  return formatosConsultados.get(url);
}

function siteDaReferencia(produto) {
  const endereco = produto.url || produto.fonte.dominio;
  if (!endereco) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(endereco) ? endereco : `https://${endereco}`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export async function listarDocumentosDasReferencias(ids) {
  const lista = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string"))]
    .slice(0, MAXIMO_REFERENCIAS);
  if (!lista.length) return [];

  const produtos = await prisma.produtoColetado.findMany({
    where: { id: { in: lista } },
    select: {
      id: true,
      nome: true,
      url: true,
      documentos: true,
      fonte: { select: { nome: true, dominio: true } },
    },
  });

  const itens = produtos.flatMap((produto) =>
    (Array.isArray(produto.documentos) ? produto.documentos : []).flatMap((documento, indice) => {
      if (typeof documento?.url !== "string" || !/^https?:\/\//i.test(documento.url)) return [];
      const tituloOriginal = String(documento.titulo || "Documento").trim();
      let titulo = tituloOriginal;
      if (/^\(?clique aqui\)?$/i.test(tituloOriginal)) {
        try {
          titulo = decodeURIComponent(new URL(documento.url).pathname.split("/").pop()) || tituloOriginal;
        } catch { /* O link continua disponível pelo título original. */ }
      }
      return [{
        referenciaId: produto.id,
        indice,
        titulo,
        url: documento.url,
        fonte: produto.fonte.nome,
        produto: produto.nome,
        site: siteDaReferencia(produto),
      }];
    }),
  );
  return Promise.all(itens.map(async (item) => ({
    ...item,
    formato: (await formatoDoDocumento(item.url, item.titulo)) || "Arquivo",
  })));
}

export async function localizarDocumentoDaReferencia(referenciaId, indice) {
  if (typeof referenciaId !== "string" || !Number.isInteger(indice) || indice < 0 || indice >= 12) {
    throw new ErroDeRecusa("Documento inválido.");
  }
  const produto = await prisma.produtoColetado.findUnique({
    where: { id: referenciaId },
    select: { documentos: true },
  });
  const documento = Array.isArray(produto?.documentos) ? produto.documentos[indice] : null;
  if (!documento?.url) throw new ErroDeRecusa("Documento não encontrado na referência.");
  return documento;
}

function tipoDoArquivo(bytes, url, contentType) {
  const extensao = url.pathname.match(/\.(zip|rar|7z|docx?|xlsx?|pptx?|csv|txt|stl|dxf|step|ino|hex)$/i)?.[1]?.toLowerCase();
  if (bytes.subarray(0, 5).toString() === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return { mime: "image/jpeg", ext: "jpg" };
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { mime: "image/png", ext: "png" };
  }
  if (bytes.subarray(0, 2).toString() === "PK") {
    return { mime: "application/zip", ext: extensao || "zip" };
  }
  if (/text\/html/i.test(contentType) || /<(!doctype|html)/i.test(bytes.subarray(0, 200).toString())) {
    throw new ErroDeRecusa("Este link abriu uma página, não um arquivo. Confira a página da loja pelo nome do fornecedor.");
  }
  if (extensao) return { mime: "application/octet-stream", ext: extensao };
  throw new ErroDeRecusa("Este link não retornou um arquivo para download. Confira a página da loja pelo nome do fornecedor.");
}

export async function baixarDocumentoDaReferencia(referenciaId, indice) {
  return baixarDocumento(await localizarDocumentoDaReferencia(referenciaId, indice));
}

/// A parte da busca que nao depende do banco (o `{ url, titulo }` do documento ja localizado): e onde o filtro de
/// rede publica esta ligado, e por isso exportada para o teste conferir a ligacao sem banco.
export async function baixarDocumento(documento) {
  const url = enderecoPublico(documento.url);

  // O `obter` segue os redirecionamentos (ate 5) e confere cada salto (`REDE_PUBLICA`); o corpo e lido ate 20 MB
  // +1 byte: um byte a mais que o teto prova que o arquivo e maior, sem baixar o resto.
  const resposta = await obter(url, {
    ...REDE_PUBLICA,
    sinal: AbortSignal.timeout(15000),
    cabecalhos: { "User-Agent": USER_AGENT, Accept: "application/pdf,image/jpeg,image/png,*/*" },
    tetoDoCorpo: (status) => (status >= 200 && status < 300 ? MAXIMO_BYTES + 1 : 0),
  });
  if (resposta.status < 200 || resposta.status >= 300 || !resposta.bytes) {
    throw new ErroDeRecusa(`Falha ao baixar o documento (${resposta.status}).`);
  }
  if (resposta.bytes.length > MAXIMO_BYTES) throw new ErroDeRecusa("Documento maior que 20 MB.");

  const bytes = resposta.bytes;
  const tipo = tipoDoArquivo(bytes, new URL(resposta.urlFinal), resposta.cabecalhos["content-type"] ?? "");
  const base = String(documento.titulo || "documento")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
    .replace(/\.(pdf|jpe?g|png|zip|rar|7z|docx?|xlsx?|pptx?|csv|txt|stl|dxf|step|ino|hex)$/i, "")
    .slice(0, 80) || "documento";
  return { bytes, mime: tipo.mime, nome: `${base}.${tipo.ext}` };
}

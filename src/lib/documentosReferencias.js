import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { prisma } from "@/lib/db";

const MAXIMO_REFERENCIAS = 100;
const MAXIMO_BYTES = 20 * 1024 * 1024;
const MAXIMO_REDIRECIONAMENTOS = 3;
const formatosConsultados = new Map();

function formatoPeloNome(valor) {
  const extensao = String(valor ?? "").match(/\.(pdf|jpe?g|png|zip|rar|7z|docx?|xlsx?|pptx?|csv|txt|stl|dxf|step|ino|hex)(?:[?#]|$)/i)?.[1];
  return extensao ? (extensao.toLowerCase() === "jpeg" ? "JPG" : extensao.toUpperCase()) : null;
}

async function formatoPeloCabecalho(endereco) {
  let url = enderecoPublico(endereco);
  for (let tentativa = 0; tentativa <= MAXIMO_REDIRECIONAMENTOS; tentativa++) {
    const ips = await lookup(url.hostname, { all: true });
    if (!ips.length || ips.some(({ address }) => !ipPublico(address))) return null;
    const resposta = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5000) });
    if ([301, 302, 303, 307, 308].includes(resposta.status)) {
      const destino = resposta.headers.get("location");
      if (!destino) return null;
      url = enderecoPublico(new URL(destino, url).href);
      continue;
    }
    if (!resposta.ok) return null;
    const disposicao = resposta.headers.get("content-disposition") ?? "";
    const nome = disposicao.match(/filename\*?=(?:UTF-8''|["']?)([^"';]+)/i)?.[1];
    const formato = formatoPeloNome(nome && decodeURIComponent(nome));
    if (formato) return formato;
    const tipo = resposta.headers.get("content-type") ?? "";
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
    throw new Error("Documento invalido.");
  }
  const produto = await prisma.produtoColetado.findUnique({
    where: { id: referenciaId },
    select: { documentos: true },
  });
  const documento = Array.isArray(produto?.documentos) ? produto.documentos[indice] : null;
  if (!documento?.url) throw new Error("Documento nao encontrado na referencia.");
  return documento;
}

function enderecoPublico(valor) {
  const url = new URL(valor);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Endereco do documento invalido.");
  }
  const host = url.hostname.toLowerCase();
  if (
    !host || host === "localhost" ||
    /\.(local|localhost|internal|test)$/.test(host) ||
    isIP(host) || url.port
  ) {
    throw new Error("O documento precisa estar em um endereco publico.");
  }
  return url;
}

function ipPublico(ip) {
  const valor = ip.toLowerCase();
  if (valor.includes(":")) {
    return !(/^(::1|::|fe80:|fc|fd)/.test(valor) || valor.startsWith("::ffff:"));
  }
  const [a, b] = valor.split(".").map(Number);
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  );
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
    throw new Error("Este link abriu uma pagina, nao um arquivo. Confira a pagina da loja pelo nome do fornecedor.");
  }
  if (extensao) return { mime: "application/octet-stream", ext: extensao };
  throw new Error("Este link nao retornou um arquivo para download. Confira a pagina da loja pelo nome do fornecedor.");
}

export async function baixarDocumentoDaReferencia(referenciaId, indice) {
  const documento = await localizarDocumentoDaReferencia(referenciaId, indice);
  let url = enderecoPublico(documento.url);

  for (let tentativa = 0; tentativa <= MAXIMO_REDIRECIONAMENTOS; tentativa++) {
    const ips = await lookup(url.hostname, { all: true });
    if (!ips.length || ips.some(({ address }) => !ipPublico(address))) {
      throw new Error("O servidor do documento nao tem endereco publico valido.");
    }

    const resposta = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "application/pdf,image/jpeg,image/png,*/*" },
    });
    if ([301, 302, 303, 307, 308].includes(resposta.status)) {
      const destino = resposta.headers.get("location");
      await resposta.body?.cancel();
      if (!destino) throw new Error("Redirecionamento sem destino.");
      url = enderecoPublico(new URL(destino, url).href);
      continue;
    }
    if (!resposta.ok || !resposta.body) throw new Error(`Falha ao baixar documento (${resposta.status}).`);
    if (Number(resposta.headers.get("content-length")) > MAXIMO_BYTES) {
      await resposta.body.cancel();
      throw new Error("Documento maior que 20 MB.");
    }
    const partes = [];
    let tamanho = 0;
    for await (const parte of resposta.body) {
      tamanho += parte.length;
      if (tamanho > MAXIMO_BYTES) {
        await resposta.body.cancel();
        throw new Error("Documento maior que 20 MB.");
      }
      partes.push(parte);
    }
    const bytes = Buffer.concat(partes);
    const tipo = tipoDoArquivo(bytes, url, resposta.headers.get("content-type") ?? "");
    const base = String(documento.titulo || "documento")
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
      .replace(/\.(pdf|jpe?g|png|zip|rar|7z|docx?|xlsx?|pptx?|csv|txt|stl|dxf|step|ino|hex)$/i, "")
      .slice(0, 80) || "documento";
    return { bytes, mime: tipo.mime, nome: `${base}.${tipo.ext}` };
  }
  throw new Error("O documento redirecionou muitas vezes.");
}

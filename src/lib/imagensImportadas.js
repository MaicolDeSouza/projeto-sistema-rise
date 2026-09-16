import { readFile } from "node:fs/promises";

import { prisma } from "@/lib/db";
import { MAXIMO_IMAGENS, caminhoDe, salvarArquivo, urlDe } from "@/lib/arquivos";

/**
 * Imagens que vem de fora do formulario: do Bling, de outro produto da Rise ou
 * de um produto coletado de fornecedor/concorrente.
 *
 * Tudo passa por `salvarArquivo`, o mesmo caminho do envio manual, entao valem
 * as mesmas regras do Mercado Livre (JPEG/PNG, 500 a 1920 px). Foto fora delas e
 * pulada e contada — nunca derruba a gravacao do produto.
 */

const TIMEOUT_MS = 20 * 1000;

/**
 * O tipo pelos primeiros bytes, e nao pelo cabecalho: CDN de loja devolve
 * `application/octet-stream` e base64 gravado na coleta pode declarar um tipo e
 * conter outro. WebP e GIF ficam sem tipo de proposito — o Mercado Livre nao
 * aceita, e a recusa sai com o motivo do `salvarArquivo`.
 */
function tipoPelosBytes(bytes) {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  return "";
}

/** Bytes de uma fonte: endereco http(s), data URI ou arquivo de outro produto. */
async function bytesDe(fonte) {
  if (fonte.tipo === "arquivo") {
    const caminho = caminhoDe(fonte.sku, "IMAGEM", fonte.nome);
    if (!caminho) throw new Error("caminho de arquivo invalido");
    return readFile(caminho);
  }

  if (/^data:/i.test(fonte.endereco)) {
    const casamento = /^data:[^;,]*;base64,(.+)$/is.exec(fonte.endereco);
    if (!casamento) throw new Error("data URI sem base64");
    return Buffer.from(casamento[1], "base64");
  }

  if (!/^https?:\/\//i.test(fonte.endereco)) throw new Error("endereco nao e http nem https");

  const abortar = new AbortController();
  const relogio = setTimeout(() => abortar.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetch(fonte.endereco, { cache: "no-store", signal: abortar.signal });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return Buffer.from(await resposta.arrayBuffer());
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Grava as imagens no produto, na ordem dada; a primeira que passar vira a
 * principal. Respeita o limite de imagens contando as que o produto ja tem.
 *
 * @param {string} produtoId
 * @param {string} sku
 * @param {Array<{tipo: "endereco", endereco: string} | {tipo: "arquivo", sku: string, nome: string}>} fontes
 */
export async function anexarImagens(produtoId, sku, fontes) {
  const jaTem = await prisma.produtoArquivo.count({ where: { produtoId, tipo: "IMAGEM" } });
  const vagas = Math.max(0, MAXIMO_IMAGENS - jaTem);

  let salvas = 0;
  const recusadas = [];

  for (const fonte of fontes) {
    if (salvas >= vagas) break;
    try {
      const bytes = await bytesDe(fonte);
      const arquivo = new File([bytes], "importada", { type: tipoPelosBytes(bytes) });
      const resultado = await salvarArquivo(sku, "IMAGEM", arquivo);

      if (!resultado.ok) {
        recusadas.push(resultado.erro);
        continue;
      }

      await prisma.produtoArquivo.create({
        data: {
          produtoId,
          tipo: "IMAGEM",
          principal: jaTem === 0 && salvas === 0,
          arquivo: resultado.nome,
          nomeOriginal: null,
          mimeType: resultado.mimeType,
          tamanhoBytes: resultado.tamanhoBytes,
          ordem: jaTem + salvas,
        },
      });
      salvas++;
    } catch (erro) {
      recusadas.push(erro.message);
    }
  }

  return { salvas, recusadas };
}

/**
 * De onde vem as imagens de um produto que serviu de base ao cadastro:
 * `rise:<id>` (outro produto nosso) ou `coletado:<id>` (fornecedor/concorrente).
 *
 * O formulario manda SO essa referencia, e os enderecos sao lidos aqui, do
 * banco. Aceitar endereco vindo do navegador faria o servidor baixar o que
 * alguem mandasse.
 *
 * Devolve as fontes (para gravar) e os enderecos de previa (para a tela).
 */
export async function imagensDaOrigem(origem) {
  const [tipo, id] = String(origem ?? "").split(":");
  if (!id) return { fontes: [], previas: [] };

  if (tipo === "rise") {
    const produto = await prisma.produto.findUnique({
      where: { id },
      select: {
        sku: true,
        arquivos: {
          where: { tipo: "IMAGEM" },
          orderBy: [{ principal: "desc" }, { ordem: "asc" }],
          select: { arquivo: true },
        },
      },
    });
    const arquivos = (produto?.arquivos ?? []).slice(0, MAXIMO_IMAGENS);
    return {
      fontes: arquivos.map((a) => ({ tipo: "arquivo", sku: produto.sku, nome: a.arquivo })),
      previas: arquivos.map((a) => urlDe(produto.sku, "IMAGEM", a.arquivo)),
    };
  }

  if (tipo === "coletado") {
    const linha = await prisma.produtoColetado.findUnique({
      where: { id },
      select: { id: true, imagens: true, miniatura: true },
    });
    if (!linha) return { fontes: [], previas: [] };

    const lista = (Array.isArray(linha.imagens) ? linha.imagens : [])
      .filter((item) => typeof item === "string" && item)
      .slice(0, MAXIMO_IMAGENS);
    if (lista.length === 0 && linha.miniatura) lista.push(linha.miniatura);

    return {
      fontes: lista.map((endereco) => ({ tipo: "endereco", endereco })),
      // Base64 nao vai para a tela dentro da resposta (a da Nightech chega a
      // 1 MB): a previa dele passa pela rota da miniatura.
      previas: lista.map((endereco, indice) =>
        /^https?:\/\//i.test(endereco)
          ? endereco
          : indice === 0
            ? `/api/mercados/miniatura/${encodeURIComponent(linha.id)}`
            : null,
      ).filter(Boolean),
    };
  }

  return { fontes: [], previas: [] };
}

import { readFile } from "node:fs/promises";

import { prisma } from "@/lib/db";
import { MAXIMO_IMAGENS, caminhoDe, salvarArquivo, urlDe } from "@/lib/arquivos";
import { padronizarImagem } from "@/lib/imagens/padronizar";

/**
 * Imagens que vem de fora do formulario: do Bling, de outro produto da Rise ou
 * de um produto coletado de fornecedor/concorrente.
 *
 * Cada foto e PADRONIZADA (1024x1024, fundo branco, JPEG, ver `padronizarImagem`)
 * antes de gravar, e a gravacao passa por `salvarArquivo`, o mesmo caminho do envio
 * manual. Foto que nao da para tratar (ilegivel, formato que nao e JPEG/PNG/WebP,
 * grande demais) e pulada e contada — nunca derruba a gravacao do produto. Nao ha
 * tamanho minimo: foto pequena e ampliada e contada em `ampliadas`.
 *
 * So o cadastro de produto NOVO usa isto (decisao do dono em 20/09/2026): a coleta
 * de fornecedor e concorrente guarda a foto como o site a publica.
 */

const TIMEOUT_MS = 20 * 1000;

/** Bytes de uma fonte: endereco http(s), data URI ou arquivo de outro produto. */
export async function bytesDe(fonte) {
  if (fonte.tipo === "arquivo") {
    const caminho = caminhoDe(fonte.sku, "IMAGEM", fonte.nome);
    if (!caminho) throw new Error("caminho de arquivo inválido");
    return readFile(caminho);
  }

  if (/^data:/i.test(fonte.endereco)) {
    const casamento = /^data:[^;,]*;base64,(.+)$/is.exec(fonte.endereco);
    if (!casamento) throw new Error("data URI sem base64");
    return Buffer.from(casamento[1], "base64");
  }

  if (!/^https?:\/\//i.test(fonte.endereco)) throw new Error("endereço não é http nem https");

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
  // So FOTO conta nas 100 do produto e decide a principal; a RESERVA fica guardada a parte.
  const jaTem = await prisma.produtoArquivo.count({ where: { produtoId, tipo: "IMAGEM", papel: "FOTO" } });
  const vagas = Math.max(0, MAXIMO_IMAGENS - jaTem);

  let salvas = 0;
  let ampliadas = 0;
  const recusadas = [];

  for (const fonte of fontes) {
    if (salvas >= vagas) break;
    try {
      const padrao = await padronizarImagem(await bytesDe(fonte));
      if (!padrao.ok) {
        recusadas.push(padrao.erro);
        continue;
      }

      const arquivo = new File([padrao.bytes], "importada", { type: padrao.mimeType });
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
      if (padrao.ampliada) ampliadas++;
    } catch (erro) {
      recusadas.push(erro.message);
    }
  }

  return { salvas, ampliadas, recusadas };
}

/** Enderecos das fotos de um produto coletado; sem lista, a miniatura e a unica que existe. */
function enderecosDaLinha(linha, limite) {
  const lista = (Array.isArray(linha.imagens) ? linha.imagens : [])
    .filter((item) => typeof item === "string" && item)
    .slice(0, limite);
  if (lista.length === 0 && linha.miniatura) lista.push(linha.miniatura);
  return lista;
}

/**
 * As fotos de VARIOS produtos coletados de uma vez: os marcados na lupa do Nome (pedido do dono
 * em 21/09/2026: as fotos dos concorrentes e fornecedores escolhidos entram no painel de fotos).
 *
 * O navegador manda so os ids e os enderecos sao lidos aqui, do banco (ver `imagensDaOrigem`).
 * Devolve na ordem dos ids, com o nome da loja e do produto para o dono saber de onde veio cada
 * foto ao escolher.
 *
 * @param {string[]} ids
 * @param {number} limite fotos por produto
 * @returns {Promise<Array<{ ref: string, fonte: string, produto: string, fontes: Array<{ tipo: "endereco", endereco: string }> }>>}
 */
export async function fotosDasReferencias(ids, limite) {
  const pedidos = [...new Set((ids ?? []).filter((id) => typeof id === "string" && id))];
  if (pedidos.length === 0) return [];

  const linhas = await prisma.produtoColetado.findMany({
    where: { id: { in: pedidos } },
    select: { id: true, nome: true, imagens: true, miniatura: true, fonte: { select: { nome: true } } },
  });
  const porId = new Map(linhas.map((linha) => [linha.id, linha]));

  return pedidos
    .filter((id) => porId.has(id))
    .map((id) => {
      const linha = porId.get(id);
      return {
        ref: id,
        fonte: linha.fonte?.nome ?? "",
        produto: linha.nome ?? "",
        fontes: enderecosDaLinha(linha, limite).map((endereco) => ({ tipo: "endereco", endereco })),
      };
    });
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
export async function imagensDaOrigem(origem, limite = MAXIMO_IMAGENS) {
  const [tipo, id] = String(origem ?? "").split(":");
  if (!id) return { fontes: [], previas: [] };

  if (tipo === "rise") {
    const produto = await prisma.produto.findUnique({
      where: { id },
      select: {
        sku: true,
        arquivos: {
          where: { tipo: "IMAGEM", papel: "FOTO" },
          orderBy: [{ principal: "desc" }, { ordem: "asc" }],
          select: { arquivo: true },
        },
      },
    });
    const arquivos = (produto?.arquivos ?? []).slice(0, limite);
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

    const lista = enderecosDaLinha(linha, limite);

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

import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { imageSize } from "image-size";

import { MAXIMO_IMAGENS } from "./limites";

export { MAXIMO_IMAGENS };

/**
 * Arquivos do produto, organizados por SKU:
 *
 *   dados/produtos/<SKU>/imagens/
 *                        manuais/
 *                        fichas-tecnicas/
 *                        certificados/
 *
 * Fica fora de public/ de proposito: arquivo gravado em public/ durante a
 * execucao nao entra no build de producao e some num deploy com Docker. A pasta
 * dados/ vira um volume no VPS e sobrevive.
 */

export const RAIZ = path.join(process.cwd(), "dados", "produtos");

export const PASTAS = {
  IMAGEM: "imagens",
  MANUAL: "manuais",
  FICHA_TECNICA: "fichas-tecnicas",
  CERTIFICADO: "certificados",
};

/** Caminho de volta: nome da pasta → tipo. Usado pela rota que serve arquivos. */
export const TIPOS_POR_PASTA = Object.fromEntries(
  Object.entries(PASTAS).map(([tipo, pasta]) => [pasta, tipo]),
);



// Limites do Mercado Livre, validados no envio e nao na publicacao: descobrir
// que a foto e pequena demais so na hora de publicar e descobrir tarde.
const REGRAS = {
  IMAGEM: {
    tipos: { "image/jpeg": ".jpg", "image/png": ".png" },
    tamanhoMaximo: 10 * 1024 * 1024,
    ladoMinimo: 500,
    ladoMaximo: 1920,
  },
  DOCUMENTO: {
    tipos: {
      "application/pdf": ".pdf",
      "image/jpeg": ".jpg",
      "image/png": ".png",
    },
    tamanhoMaximo: 20 * 1024 * 1024,
  },
};

const regrasDe = (tipo) => (tipo === "IMAGEM" ? REGRAS.IMAGEM : REGRAS.DOCUMENTO);

// ---------------------------------------------------------------------------
// Validacao de nomes — a defesa contra travessia de caminho
// ---------------------------------------------------------------------------

/**
 * O SKU vira nome de pasta, entao precisa ser seguro como caminho.
 *
 * O padrao aceita ponto (SKUs como "1.2.3" existem), e por isso a checagem de
 * "so pontos" e obrigatoria: ".." casaria no padrao e subiria um diretorio.
 */
const PADRAO_SKU = /^[A-Za-z0-9._-]+$/;

export function skuValido(sku) {
  if (typeof sku !== "string" || sku.length === 0 || sku.length > 64) return false;
  if (!PADRAO_SKU.test(sku)) return false;
  if (/^\.+$/.test(sku)) return false; // "." e ".."
  return true;
}

/** Aceita apenas o nome gerado por nos: 32 hexadecimais mais a extensao. */
export function nomeValido(nome) {
  return /^[0-9a-f]{32}\.(jpg|png|pdf)$/.test(nome ?? "");
}

export function pastaDoProduto(sku) {
  if (!skuValido(sku)) return null;
  return path.join(RAIZ, sku);
}

/** Caminho absoluto, ou null se qualquer segmento for invalido. */
export function caminhoDe(sku, tipo, nome) {
  const pasta = PASTAS[tipo];
  if (!pasta || !skuValido(sku) || !nomeValido(nome)) return null;
  return path.join(RAIZ, sku, pasta, nome);
}

/** Endereco pelo qual a interface pede o arquivo. Calculado, nunca gravado. */
export function urlDe(sku, tipo, nome) {
  return `/api/arquivos/${encodeURIComponent(sku)}/${PASTAS[tipo]}/${nome}`;
}

// ---------------------------------------------------------------------------
// Gravacao
// ---------------------------------------------------------------------------

/**
 * Valida e grava um arquivo enviado pelo formulario.
 *
 * @param {string} sku
 * @param {keyof PASTAS} tipo
 * @param {File} arquivo
 */
export async function salvarArquivo(sku, tipo, arquivo) {
  if (!skuValido(sku)) {
    return {
      ok: false,
      erro: "SKU invalido: use apenas letras, numeros, ponto, hifen e sublinhado.",
    };
  }

  if (!PASTAS[tipo]) return { ok: false, erro: `Tipo desconhecido: ${tipo}.` };

  if (!arquivo || typeof arquivo.arrayBuffer !== "function" || !arquivo.size) {
    return { ok: false, erro: "Nenhum arquivo enviado." };
  }

  const regras = regrasDe(tipo);
  const extensao = regras.tipos[arquivo.type];

  if (!extensao) {
    const aceitos = Object.keys(regras.tipos)
      .map((mime) => mime.split("/")[1].toUpperCase())
      .join(", ");
    return {
      ok: false,
      erro: `Formato ${arquivo.type || "desconhecido"} nao aceito. Envie ${aceitos}.`,
    };
  }

  if (arquivo.size > regras.tamanhoMaximo) {
    const mb = (arquivo.size / 1024 / 1024).toFixed(1);
    const limite = regras.tamanhoMaximo / 1024 / 1024;
    return { ok: false, erro: `O arquivo tem ${mb} MB; o limite e ${limite} MB.` };
  }

  const bytes = Buffer.from(await arquivo.arrayBuffer());

  if (tipo === "IMAGEM") {
    let dimensao;
    try {
      dimensao = imageSize(bytes);
    } catch {
      return { ok: false, erro: "Nao foi possivel ler a imagem. Arquivo corrompido?" };
    }

    const { width, height } = dimensao;

    if (width < regras.ladoMinimo || height < regras.ladoMinimo) {
      return {
        ok: false,
        erro: `A imagem tem ${width}x${height}px. O Mercado Livre exige no minimo ${regras.ladoMinimo}x${regras.ladoMinimo}px.`,
      };
    }

    if (width > regras.ladoMaximo || height > regras.ladoMaximo) {
      return {
        ok: false,
        erro: `A imagem tem ${width}x${height}px. O maximo aceito pelo Mercado Livre e ${regras.ladoMaximo}x${regras.ladoMaximo}px.`,
      };
    }
  }

  // O nome vem de nos, nunca do cliente: nome enviado pelo navegador e dado
  // nao confiavel.
  const nome = `${randomUUID().replaceAll("-", "")}${extensao}`;
  const destino = path.join(RAIZ, sku, PASTAS[tipo]);

  await mkdir(destino, { recursive: true });
  await writeFile(path.join(destino, nome), bytes);

  return {
    ok: true,
    nome,
    nomeOriginal: arquivo.name ?? null,
    mimeType: arquivo.type,
    tamanhoBytes: arquivo.size,
    url: urlDe(sku, tipo, nome),
  };
}

export async function apagarArquivo(sku, tipo, nome) {
  const caminho = caminhoDe(sku, tipo, nome);
  if (!caminho) return;
  try {
    await unlink(caminho);
  } catch (erro) {
    if (erro.code !== "ENOENT") throw erro;
  }
}

/**
 * Renomeia a pasta quando o SKU do produto muda.
 *
 * Recusa se ja existir pasta com o nome novo: juntar os arquivos de dois
 * produtos numa pasta so seria pior do que falhar.
 */
export async function renomearPastaProduto(skuAntigo, skuNovo) {
  if (skuAntigo === skuNovo) return { ok: true };

  const origem = pastaDoProduto(skuAntigo);
  const destino = pastaDoProduto(skuNovo);

  if (!origem || !destino) return { ok: false, erro: "SKU invalido." };

  try {
    await readdir(destino);
    return {
      ok: false,
      erro: `Ja existe uma pasta de arquivos para o SKU "${skuNovo}".`,
    };
  } catch (erro) {
    if (erro.code !== "ENOENT") throw erro;
  }

  try {
    await rename(origem, destino);
  } catch (erro) {
    // Produto sem arquivo nenhum nao tem pasta — nada a renomear.
    if (erro.code !== "ENOENT") throw erro;
  }

  return { ok: true };
}

/** Remove a pasta inteira do produto. Usado ao excluir o produto. */
export async function apagarPastaProduto(sku) {
  const pasta = pastaDoProduto(sku);
  if (!pasta) return;
  await rm(pasta, { recursive: true, force: true });
}

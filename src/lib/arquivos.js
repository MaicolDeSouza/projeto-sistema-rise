import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { imageSize } from "image-size";

import { MAXIMO_IMAGENS } from "./limites";

export { MAXIMO_IMAGENS };

/**
 * Arquivos do produto, organizados por SKU:
 *
 *   dados/produtos/<SKU>/imagens/
 *                        documentos/
 *                        certificados/
 *
 * Fica fora de public/ de proposito: arquivo gravado em public/ durante a
 * execucao nao entra no build de producao e some num deploy com Docker. A pasta
 * dados/ vira um volume no VPS e sobrevive.
 */

export const RAIZ = path.join(process.cwd(), "dados", "produtos");

export const PASTAS = {
  IMAGEM: "imagens",
  DOCUMENTO: "documentos",
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

  const resultado = await validarEGravar(path.join(RAIZ, sku), tipo, arquivo);
  return resultado.ok ? { ...resultado, url: urlDe(sku, tipo, resultado.nome) } : resultado;
}

/**
 * A validacao e a gravacao, em qualquer pasta-base: a do produto ou a
 * temporaria do cadastro novo. Uma funcao so, para o arquivo enviado antes de
 * salvar passar pelas MESMAS regras (formato, tamanho, nome gerado por nos).
 */
async function validarEGravar(base, tipo, arquivo) {
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
  const destino = path.join(base, PASTAS[tipo]);

  await mkdir(destino, { recursive: true });
  await writeFile(path.join(destino, nome), bytes);

  return {
    ok: true,
    nome,
    nomeOriginal: arquivo.name ?? null,
    mimeType: arquivo.type,
    tamanhoBytes: arquivo.size,
  };
}

// ---------------------------------------------------------------------------
// Pasta temporaria do cadastro novo
// ---------------------------------------------------------------------------

/**
 * Documentos e certificado enviados ANTES de o produto existir — pedido do dono
 * em 16/09/2026. O produto novo nao tem SKU gravado, e a pasta definitiva tem o
 * nome do SKU; entao o arquivo espera em dados/temporarios/<lote>/ e e movido no
 * Salvar. Fica dentro de dados/, fora de public/ e do git, como o resto.
 */
export const RAIZ_TEMPORARIA = path.join(process.cwd(), "dados", "temporarios");

/// Tipos que podem ser enviados antes de salvar. Imagem fica de fora: no
/// cadastro novo ela vem da busca por codigo, e a copia ja e feita no Salvar.
export const TIPOS_TEMPORARIOS = ["DOCUMENTO", "CERTIFICADO"];

/// Lote de cadastro abandonado (aba fechada sem salvar) e apagado depois disso.
const VALIDADE_TEMPORARIO_MS = 24 * 60 * 60 * 1000;

/** O lote e um UUID gerado pelo navegador: so esse formato vira nome de pasta. */
export function loteValido(lote) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(lote ?? "");
}

const TIPO_POR_EXTENSAO = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".png": "image/png" };

/** Apaga lotes com mais de 24 h. Falha aqui nunca derruba o envio. */
async function limparTemporariosAntigos() {
  try {
    const lotes = await readdir(RAIZ_TEMPORARIA, { withFileTypes: true });
    const agora = Date.now();
    for (const lote of lotes) {
      if (!lote.isDirectory() || !loteValido(lote.name)) continue;
      const caminho = path.join(RAIZ_TEMPORARIA, lote.name);
      const { mtimeMs } = await stat(caminho);
      if (agora - mtimeMs > VALIDADE_TEMPORARIO_MS) {
        await rm(caminho, { recursive: true, force: true });
      }
    }
  } catch (erro) {
    if (erro.code !== "ENOENT") console.error("Falha ao limpar temporarios:", erro.message);
  }
}

export async function salvarArquivoTemporario(lote, tipo, arquivo) {
  if (!loteValido(lote)) return { ok: false, erro: "Lote de envio invalido." };
  if (!TIPOS_TEMPORARIOS.includes(tipo)) {
    return { ok: false, erro: "Este tipo de arquivo so pode ser enviado depois de salvar." };
  }
  await limparTemporariosAntigos();
  return validarEGravar(path.join(RAIZ_TEMPORARIA, lote), tipo, arquivo);
}

export async function apagarArquivoTemporario(lote, tipo, nome) {
  if (!loteValido(lote) || !TIPOS_TEMPORARIOS.includes(tipo) || !nomeValido(nome)) return;
  try {
    await unlink(path.join(RAIZ_TEMPORARIA, lote, PASTAS[tipo], nome));
  } catch (erro) {
    if (erro.code !== "ENOENT") throw erro;
  }
}

/**
 * Move os arquivos do lote para a pasta do produto recem-criado.
 *
 * So entra o que EXISTE no lote com nome gerado por nos: a lista vem do
 * navegador, entao cada item e conferido no disco, e tamanho e formato sao lidos
 * daqui, nao do que o navegador disse. Ao fim o lote inteiro e apagado.
 *
 * @param {string} lote
 * @param {string} sku
 * @param {Array<{tipo: string, nome: string}>} itens
 */
export async function moverTemporarios(lote, sku, itens) {
  if (!loteValido(lote) || !skuValido(sku)) return [];

  const movidos = [];
  for (const item of itens ?? []) {
    if (!TIPOS_TEMPORARIOS.includes(item?.tipo) || !nomeValido(item?.nome)) continue;

    const origem = path.join(RAIZ_TEMPORARIA, lote, PASTAS[item.tipo], item.nome);
    const pasta = path.join(RAIZ, sku, PASTAS[item.tipo]);
    try {
      const { size } = await stat(origem);
      await mkdir(pasta, { recursive: true });
      await rename(origem, path.join(pasta, item.nome));
      movidos.push({
        tipo: item.tipo,
        nome: item.nome,
        tamanhoBytes: size,
        mimeType: TIPO_POR_EXTENSAO[path.extname(item.nome)] ?? null,
      });
    } catch (erro) {
      // Arquivo que sumiu do lote (limpeza, remocao em outra aba) so nao entra.
      if (erro.code !== "ENOENT") throw erro;
    }
  }

  await rm(path.join(RAIZ_TEMPORARIA, lote), { recursive: true, force: true });
  return movidos;
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

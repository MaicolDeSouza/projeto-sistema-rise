import sharp from "sharp";
import vtracer from "@visioncortex/vtracer";

import { LADO_MAXIMO_SVG, OPCOES_LOGO, TETO_BYTES_SVG, TETO_MB_SVG } from "./presetsSvg";
import {
  coresDaImagem,
  detectarFundo,
  paraHex,
  refinarBorda,
  removerFundo,
  temTransparencia,
} from "./pixels";

/**
 * Converte uma imagem (PNG, JPEG ou WebP) em SVG vetorial colorido, para LOGOS:
 * fundo transparente e cores exatas, sem nenhum ajuste na tela.
 *
 * Motor: `@visioncortex/vtracer` (WASM, sem binario nativo), escolhido em
 * 20/09/2026 contra o imagetracerjs e os tres repositorios que o dono indicou
 * (dois so trocam cada pixel por um retangulo, e o terceiro e o Potrace, de
 * uma cor so). Ver "Ferramentas" no CLAUDE.md.
 *
 * Nada aqui grava em disco nem abre rede. O vtracer nunca recebe o arquivo do
 * usuario: quem decodifica e o `sharp` (libvips), que ja tem teto de pixels, e
 * o WASM so ve pixels RGBA.
 */

/** Teto de pixels da imagem ENVIADA. Contra "bomba de descompressao": um PNG de
 *  poucos KB pode declarar 50.000 x 50.000 pixels e pedir gigabytes ao decodificar. */
const TETO_PIXELS_ENTRADA = 40_000_000;
const ERRO_PIXELS_DEMAIS = "A imagem tem pixels demais para converter. Reduza as dimensoes e tente de novo.";

/**
 * Tipo pelos BYTES, nunca pelo `type` do navegador nem pela extensao: quem
 * envia escolhe os dois. Um .svg, um .html ou um executavel renomeado para .png
 * chega aqui com cara de PNG. WebP fica aceito (o de produto o recusa de
 * proposito; aqui a entrada e so para virar vetor, e nada e gravado).
 */
export function tipoPelosBytes(bytes) {
  if (!bytes || bytes.length < 12) return null;
  const igual = (inicio, esperado) => esperado.every((valor, i) => bytes[inicio + i] === valor);

  if (igual(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (igual(0, [0xff, 0xd8, 0xff])) return "jpeg";
  // "RIFF" .... "WEBP"
  if (igual(0, [0x52, 0x49, 0x46, 0x46]) && igual(8, [0x57, 0x45, 0x42, 0x50])) return "webp";
  return null;
}

/**
 * Confere o SVG que o conversor devolveu. O vtracer so escreve <path>, mas
 * SVG e XML e pode carregar script: o projeto ja recusa servir SVG de terceiro
 * do proprio dominio (ver a rota de miniaturas de Mercados), e esta saida vai
 * ser baixada e usada em outros lugares. Melhor recusar do que confiar.
 *
 * @returns {string|null} o motivo da recusa, ou null se esta tudo certo.
 */
export function motivoDeSvgInseguro(svg) {
  if (typeof svg !== "string" || !/^\s*<svg[\s>]/i.test(svg)) return "a saida nao comeca por <svg>";
  const proibidos = [
    [/<script/i, "<script>"],
    [/<foreignObject/i, "<foreignObject>"],
    [/<image[\s>]/i, "<image>"],
    [/<use[\s>]/i, "<use>"],
    [/<iframe|<embed|<object/i, "conteudo embutido"],
    [/<!DOCTYPE|<!ENTITY/i, "DOCTYPE/ENTITY"],
    [/\son[a-z]+\s*=/i, "atributo de evento (on...)"],
    [/javascript:/i, "javascript:"],
    [/\b(xlink:)?href\s*=/i, "href"],
  ];
  for (const [padrao, nome] of proibidos) {
    if (padrao.test(svg)) return `a saida traz ${nome}`;
  }
  return null;
}

/** Tira a declaracao XML e o comentario do gerador, e poe um viewBox: sem ele
 *  o SVG nao escala (o vtracer so escreve width e height). */
function normalizarSvg(svg, largura, altura) {
  const semCabecalho = svg
    .replace(/^\s*<\?xml[^>]*\?>\s*/i, "")
    .replace(/<!--[\s\S]*?-->\s*/g, "");
  return semCabecalho.replace(
    /<svg\b[^>]*>/i,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}">`,
  );
}

/**
 * @param {object} p
 * @param {Uint8Array} p.bytes  Arquivo enviado, inteiro.
 * @returns {Promise<{ok: true, svg: string, largura: number, altura: number,
 *   larguraOriginal: number, alturaOriginal: number, reduzida: boolean, tipo: string,
 *   bytesOriginal: number, bytesSvg: number, caminhos: number, cores: string[],
 *   fundoRemovido: string|null, jaTransparente: boolean, ms: number}
 *   | {ok: false, erro: string}>}
 */
export async function converterImagemParaSvg({ bytes }) {
  if (!bytes || bytes.length === 0) return { ok: false, erro: "Nenhum arquivo enviado." };
  if (bytes.length > TETO_BYTES_SVG) {
    return {
      ok: false,
      erro: `O arquivo tem ${(bytes.length / 1024 / 1024).toFixed(1)} MB e o limite e ${TETO_MB_SVG} MB.`,
    };
  }

  const tipo = tipoPelosBytes(bytes);
  if (!tipo) {
    return { ok: false, erro: "Formato nao aceito. Envie uma imagem PNG, JPG ou WebP." };
  }

  const inicio = performance.now();

  // ---- decodifica e reduz (sharp) ------------------------------------------
  let pixels;
  let info;
  let original;
  try {
    const imagem = sharp(bytes, { limitInputPixels: TETO_PIXELS_ENTRADA });
    original = await imagem.metadata();

    // Conferido AQUI, pelo cabecalho, antes de decodificar: o sharp le as
    // dimensoes de um PNG falso de 50.000 x 50.000 sem reclamar e so recusa no
    // decodificador, com um "arquivo corrompido" que nao diz o que houve.
    if ((original.width ?? 0) * (original.height ?? 0) > TETO_PIXELS_ENTRADA) {
      return { ok: false, erro: ERRO_PIXELS_DEMAIS };
    }

    ({ data: pixels, info } = await imagem
      .rotate() // respeita a orientacao gravada pela camera (EXIF)
      .resize({
        width: LADO_MAXIMO_SVG,
        height: LADO_MAXIMO_SVG,
        fit: "inside",
        withoutEnlargement: true,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }));
  } catch (erro) {
    const excedeu = /pixel limit|exceeds/i.test(erro?.message ?? "");
    return {
      ok: false,
      erro: excedeu ? ERRO_PIXELS_DEMAIS : "Nao foi possivel ler a imagem. O arquivo pode estar corrompido.",
    };
  }

  // Foto de celular vem "deitada" com a orientacao gravada no EXIF (5 a 8 =
  // girada em 90 graus): as dimensoes do cabecalho estao trocadas em relacao ao
  // que o sharp devolve depois de `.rotate()`. Sem trocar, toda foto assim
  // pareceria "reduzida" mesmo sem ter sido.
  const girada = (original.orientation ?? 1) >= 5;
  const larguraOriginal = (girada ? original.height : original.width) ?? info.width;
  const alturaOriginal = (girada ? original.width : original.height) ?? info.height;

  // ---- fundo transparente e cores exatas -----------------------------------
  const rgba = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);

  // Ja transparente: nada a apagar. Fundo de uma cor so: apaga o que toca a
  // borda. Fundo que nao e uma cor so (foto, degrade): fica como esta, porque
  // apagar as cegas comeria o proprio logo.
  const jaTransparente = temTransparencia(rgba);
  let fundoRemovido = null;
  let corDoFundo = null;
  if (!jaTransparente) {
    corDoFundo = detectarFundo(rgba, info.width, info.height);
    if (corDoFundo) {
      removerFundo(rgba, info.width, info.height, corDoFundo);
      fundoRemovido = paraHex(corDoFundo[0], corDoFundo[1], corDoFundo[2]);
    }
  }

  const paleta = coresDaImagem(rgba);
  if (paleta.length === 0) {
    return { ok: false, erro: "A imagem esta toda transparente: nao ha o que converter." };
  }

  // A borda entre o fundo apagado e o desenho precisa da paleta para ser
  // "desmisturada" (ver `refinarBorda`); por isso vem depois de descobri-la.
  if (corDoFundo) refinarBorda(rgba, info.width, info.height, corDoFundo, paleta);

  // ---- vetoriza (vtracer, WASM) --------------------------------------------
  // Uma cor so nao e paleta: o vtracer escolhe sozinho.
  const opcoes = paleta.length >= 2 ? { ...OPCOES_LOGO, palette: paleta } : { ...OPCOES_LOGO };

  let bruto;
  try {
    bruto = vtracer.convertPixels(rgba, info.width, info.height, opcoes);
  } catch (erro) {
    return {
      ok: false,
      erro: `O conversor falhou nesta imagem (${String(erro?.message ?? erro).slice(0, 120)}).`,
    };
  }

  const svg = normalizarSvg(String(bruto), info.width, info.height);
  const motivo = motivoDeSvgInseguro(svg);
  if (motivo) {
    // Nao devolve o SVG suspeito: quem o pedir nao chega a te-lo.
    return { ok: false, erro: `Conversao recusada por seguranca: ${motivo}.` };
  }

  const cores = [
    ...new Set([...svg.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((achado) => achado[1].toUpperCase())),
  ];

  return {
    ok: true,
    svg,
    largura: info.width,
    altura: info.height,
    larguraOriginal,
    alturaOriginal,
    reduzida: info.width !== larguraOriginal || info.height !== alturaOriginal,
    tipo,
    bytesOriginal: bytes.length,
    bytesSvg: Buffer.byteLength(svg),
    caminhos: (svg.match(/<path\b/g) ?? []).length,
    cores,
    fundoRemovido,
    jaTransparente,
    ms: Math.round(performance.now() - inicio),
  };
}

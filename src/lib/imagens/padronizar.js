import sharp from "sharp";

/**
 * Padroniza a foto de um produto NOVO: quadrado de 1024x1024, fundo branco, JPEG.
 *
 * Pedido do dono em 20/09/2026. Um tamanho so serve aos tres canais: a Shopee
 * pede 1:1 de 1024 px ou mais em fundo branco liso, o Mercado Livre recomenda
 * fundo branco e aceita de 500 a 1920 px, e a Loja Integrada aceita JPG de ate
 * 2500 px e 4 MB. O peso alvo (1 MB) fica bem abaixo do menor teto.
 *
 * NAO ha tamanho minimo na origem (decisao do dono em 20/09/2026): foto pequena e
 * ampliada e marcada como tal.
 *
 * So se aplica ao cadastro de produto novo (foto do Bling, de outro produto ou de
 * concorrente escolhido na lupa). A coleta de fornecedor e concorrente guarda a
 * foto como o site a publica, e o envio manual num produto existente segue as
 * regras do `salvarArquivo` sem mexer nos pixels.
 *
 * Funcao pura sobre bytes: sem rede, sem banco, sem disco. Quem chama grava.
 */

export const LADO_PADRAO = 1024;

/** Peso que a foto padronizada tenta respeitar. */
export const PESO_ALVO_BYTES = 1024 * 1024;

/**
 * Origem maior que isso nao e foto de produto, e ler nao vale a memoria. O
 * `fetch` de `imagensImportadas` nao tem teto de tamanho, entao ele vale aqui.
 */
const ENTRADA_MAXIMA_BYTES = 25 * 1024 * 1024;

/** Protecao contra imagem-bomba: o sharp recusa acima disso, sem decodificar. */
const PIXELS_MAXIMOS = 80_000_000;

/**
 * Formatos lidos. WebP entra de proposito: CDN de loja serve WebP com frequencia, e
 * como a saida e sempre JPEG o Mercado Livre nunca o ve. GIF e SVG ficam de fora
 * (animacao e vetor nao viram foto de produto).
 */
const FORMATOS_ACEITOS = ["jpeg", "png", "webp"];

/**
 * Do mais nitido para o mais leve. O primeiro que cabe no peso alvo ganha; com
 * 1024x1024 quase toda foto cabe ja na primeira.
 */
const QUALIDADES = [90, 85, 80, 75, 70, 60, 50];

const BRANCO = { r: 255, g: 255, b: 255 };

/**
 * @param {Buffer} bytes
 * @returns {Promise<
 *   | { ok: true, bytes: Buffer, mimeType: "image/jpeg", largura: number, altura: number,
 *       ampliada: boolean, jaPadrao: boolean, qualidade: number | null,
 *       origem: { largura: number, altura: number, formato: string, bytes: number } }
 *   | { ok: false, erro: string }
 * >}
 */
export async function padronizarImagem(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    return { ok: false, erro: "Nenhum arquivo enviado." };
  }
  if (bytes.length > ENTRADA_MAXIMA_BYTES) {
    const mb = (bytes.length / 1024 / 1024).toFixed(1);
    return { ok: false, erro: `A imagem tem ${mb} MB; o limite de leitura é ${ENTRADA_MAXIMA_BYTES / 1024 / 1024} MB.` };
  }

  const abrir = () => sharp(bytes, { limitInputPixels: PIXELS_MAXIMOS });

  let meta;
  try {
    meta = await abrir().metadata();
  } catch {
    return { ok: false, erro: "Não foi possível ler a imagem. Arquivo corrompido?" };
  }

  if (!FORMATOS_ACEITOS.includes(meta.format)) {
    return {
      ok: false,
      erro: `Formato ${meta.format ?? "desconhecido"} não aceito. Use JPEG, PNG ou WebP.`,
    };
  }

  // A orientacao EXIF de 5 a 8 troca largura e altura na hora de exibir. As duas
  // medidas abaixo sao as que o operador veria, nao as gravadas no arquivo.
  const orientacao = meta.orientation ?? 1;
  const girada = orientacao >= 5;
  const largura = girada ? meta.height : meta.width;
  const altura = girada ? meta.width : meta.height;
  if (!largura || !altura) {
    return { ok: false, erro: "Não foi possível ler a imagem. Arquivo corrompido?" };
  }

  const origem = { largura, altura, formato: meta.format, bytes: bytes.length };

  // Sem tamanho minimo: decisao do dono em 20/09/2026 ("pode ser qualquer tamanho"),
  // que antes era 500 px no menor lado. Foto pequena entra, so que ampliada, e o
  // aviso abaixo diz isso. Se o minimo voltar, e aqui que ele entra.

  // Ampliada = o lado maior precisou crescer para chegar a 1024. Foto de 800x600
  // vira 1024x768 dentro do quadrado; a tela avisa, porque ampliar nao devolve
  // detalhe que a foto nao tinha.
  const ampliada = Math.max(largura, altura) < LADO_PADRAO;

  // Idempotente: refazer uma foto que ja e o resultado deste tratamento (copiada de
  // outro produto da Rise, por exemplo) so gastaria uma geracao de compressao JPEG.
  if (
    meta.format === "jpeg" &&
    largura === LADO_PADRAO &&
    altura === LADO_PADRAO &&
    orientacao === 1 &&
    !meta.hasAlpha &&
    bytes.length <= PESO_ALVO_BYTES
  ) {
    return {
      ok: true,
      bytes,
      mimeType: "image/jpeg",
      largura: LADO_PADRAO,
      altura: LADO_PADRAO,
      ampliada: false,
      jaPadrao: true,
      qualidade: null,
      origem,
    };
  }

  try {
    // `rotate()` sem argumento aplica a orientacao EXIF. `flatten` pousa o PNG
    // transparente no branco; sem ele o JPEG sairia com fundo preto.
    const base = abrir()
      .rotate()
      .flatten({ background: BRANCO })
      .resize(LADO_PADRAO, LADO_PADRAO, {
        fit: "contain",
        background: BRANCO,
        kernel: "lanczos3",
        withoutEnlargement: false,
      })
      .toColourspace("srgb");

    // Codificador JPEG comum, e nao o mozjpeg: medido em 21/09/2026 com fotos reais, o mozjpeg
    // levava ~340 ms por foto (so ~64 ms eram do redimensionamento) contra ~78 ms do comum, e o
    // arquivo saia so 13% menor (137 contra 155 KB), muito abaixo do teto de 1 MB. Com 20 fotos
    // entrando de uma vez pela lupa, eram segundos a mais para nenhum ganho que o dono note.
    let escolhido = null;
    for (const qualidade of QUALIDADES) {
      const saida = await base
        .clone()
        .jpeg({ quality: qualidade, mozjpeg: false, chromaSubsampling: "4:4:4" })
        .toBuffer();
      escolhido = { saida, qualidade };
      if (saida.length <= PESO_ALVO_BYTES) break;
    }

    return {
      ok: true,
      bytes: escolhido.saida,
      mimeType: "image/jpeg",
      largura: LADO_PADRAO,
      altura: LADO_PADRAO,
      ampliada,
      jaPadrao: false,
      qualidade: escolhido.qualidade,
      origem,
    };
  } catch {
    return { ok: false, erro: "Não foi possível tratar a imagem. Arquivo corrompido?" };
  }
}

import { deflateSync } from "node:zlib";

/**
 * Gera um PNG de cor solida, sem dependencia externa.
 *
 * Existe para o seed criar imagens de verdade em dados/imagens: com URL falsa
 * as miniaturas apareceriam quebradas e a revisao visual da tela ficaria
 * incompleta justamente na coluna de imagem.
 */

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function bloco(tipo, dados) {
  const nome = Buffer.from(tipo, "ascii");
  const corpo = Buffer.concat([nome, dados]);
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const verificacao = Buffer.alloc(4);
  verificacao.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, verificacao]);
}

/** @param {[number,number,number]} cor */
export function pngSolido(lado, cor) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // truecolor RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Cada linha comeca com o byte de filtro (0 = nenhum).
  const linha = Buffer.alloc(1 + lado * 3);
  for (let x = 0; x < lado; x++) {
    linha[1 + x * 3] = cor[0];
    linha[2 + x * 3] = cor[1];
    linha[3 + x * 3] = cor[2];
  }

  const bruto = Buffer.concat(Array.from({ length: lado }, () => linha));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco("IHDR", ihdr),
    bloco("IDAT", deflateSync(bruto)),
    bloco("IEND", Buffer.alloc(0)),
  ]);
}

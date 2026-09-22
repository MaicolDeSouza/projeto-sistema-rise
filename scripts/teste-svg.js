/**
 * Testa o conversor de imagem para SVG (Ferramentas). Sem rede e sem banco:
 * as imagens sao geradas aqui, com o proprio sharp.
 *
 *   npm run teste:svg
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
const zlib = await import("node:zlib");

register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { default: sharp } = await import("sharp");
const { converterImagemParaSvg, motivoDeSvgInseguro, tipoPelosBytes } = await import(
  "../src/lib/ferramentas/imagemParaSvg.js"
);
const { coresDaImagem, detectarFundo, temTransparencia } = await import("../src/lib/ferramentas/pixels.js");
const { TETO_BYTES_SVG } = await import("../src/lib/ferramentas/presetsSvg.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}`);
  if (!ok) console.log(`       obtido:   ${JSON.stringify(obtido)}\n       esperado: ${JSON.stringify(esperado)}`);
}

// ---------------------------------------------------------------- imagens
// Logo de 3 cores sobre fundo amarelo (como o do Mercado Livre): contorno azul,
// miolo dourado e uma faixa branca ENCERRADA pelo contorno.
const LOGO_SOBRE_AMARELO = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">
  <rect width="240" height="240" fill="#FFE600"/>
  <circle cx="120" cy="120" r="90" fill="#2D3277"/>
  <circle cx="120" cy="120" r="76" fill="#FFD100"/>
  <rect x="70" y="100" width="100" height="40" rx="10" fill="#FFFFFF"/>
</svg>`;

// Mesmo desenho, sobre BRANCO: o branco de dentro nao pode ser confundido com o fundo.
const ANEL_SOBRE_BRANCO = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <rect width="200" height="200" fill="#FFFFFF"/>
  <circle cx="100" cy="100" r="80" fill="#2D3277"/>
  <circle cx="100" cy="100" r="62" fill="#FFFFFF"/>
</svg>`;

const CIRCULO_TRANSPARENTE = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <circle cx="100" cy="100" r="70" fill="#2D3277"/>
</svg>`;

// Fundo em degrade (nao e uma cor so): nao ha "cor de fundo" a apagar.
const SOBRE_DEGRADE = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs>
  <rect width="200" height="200" fill="url(#g)"/>
  <circle cx="100" cy="100" r="50" fill="#FFFFFF"/>
</svg>`;

const png = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function blocoPng(tipo, dados) {
  const comprimento = Buffer.alloc(4);
  comprimento.writeUInt32BE(dados.length);
  const nome = Buffer.from(tipo);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([nome, dados])) >>> 0);
  return Buffer.concat([comprimento, nome, dados, crc]);
}

/**
 * PNG cabecalho VALIDO que so declara dimensoes, sem dados de imagem. O sharp o
 * recusa como corrompido; serve para provar que nao vira "pixels demais".
 */
function pngSemDados(largura, altura) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // 8 bits
  ihdr[9] = 2; // RGB
  return Buffer.concat([ASSINATURA_PNG, blocoPng("IHDR", ihdr), blocoPng("IEND", Buffer.alloc(0))]);
}

/**
 * "Bomba de descompressao" de verdade: um PNG VALIDO, em cinza de 8 bits, que
 * declara largura x altura e traz todos os pixels como zeros. Comprime a uns
 * 40 KB e, se fosse decodificado, ocuparia dezenas de MB — ou GB, com dimensoes
 * maiores. E o que um atacante enviaria; o cabecalho falso do teste anterior
 * nem chega a ser lido como imagem.
 */
function pngBomba(largura, altura) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // 8 bits
  ihdr[9] = 0; // cinza
  const linhas = Buffer.alloc(altura * (1 + largura)); // 1 byte de filtro + pixels, tudo zero
  return Buffer.concat([
    ASSINATURA_PNG,
    blocoPng("IHDR", ihdr),
    blocoPng("IDAT", zlib.deflateSync(linhas)),
    blocoPng("IEND", Buffer.alloc(0)),
  ]);
}

/** RGBA de uma imagem, para os testes de pixel. */
async function rgbaDe(svgOuBuffer) {
  const origem = typeof svgOuBuffer === "string" ? Buffer.from(svgOuBuffer) : svgOuBuffer;
  const { data, info } = await sharp(origem).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), w: info.width, h: info.height };
}

/** Cor de um pixel (x, y) do SVG rasterizado sobre `fundo` — revela o que e transparente. */
async function pixelDoSvg(svg, x, y, fundo, lado = 240) {
  const cru = await sharp(Buffer.from(svg), { density: 72 })
    .resize(lado, lado, { fit: "fill" })
    .flatten({ background: fundo })
    .removeAlpha()
    .raw()
    .toBuffer();
  const i = (y * lado + x) * 3;
  return [cru[i], cru[i + 1], cru[i + 2]];
}

const perto = (a, b, tolerancia = 12) => a.every((v, i) => Math.abs(v - b[i]) <= tolerancia);

/** Erro medio de pixel (0 a 255) entre o original e o SVG rasterizado sobre a cor do fundo original. */
async function erroMedio(original, svg, fundo) {
  const { width, height } = await sharp(original).metadata();
  const a = await sharp(original).removeAlpha().raw().toBuffer();
  const b = await sharp(Buffer.from(svg), { density: 72 })
    .resize(width, height, { fit: "fill" })
    .flatten({ background: fundo })
    .removeAlpha()
    .raw()
    .toBuffer();
  let soma = 0;
  for (let i = 0; i < a.length; i++) soma += Math.abs(a[i] - b[i]);
  return soma / a.length;
}

// ---------------------------------------------------------------------------
console.log("\n— tipo pelos bytes —");
const logoPng = await png(LOGO_SOBRE_AMARELO);
const logoJpeg = await sharp(logoPng).jpeg({ quality: 92 }).toBuffer();
const logoWebp = await sharp(logoPng).webp({ quality: 92 }).toBuffer();
const gif = Buffer.from("GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04", "latin1");

conferir("PNG reconhecido", tipoPelosBytes(logoPng), "png");
conferir("JPEG reconhecido", tipoPelosBytes(logoJpeg), "jpeg");
conferir("WebP reconhecido", tipoPelosBytes(logoWebp), "webp");
conferir("GIF nao e aceito", tipoPelosBytes(gif), null);
conferir("SVG enviado como imagem nao e aceito", tipoPelosBytes(Buffer.from(LOGO_SOBRE_AMARELO)), null);
conferir("HTML nao e aceito", tipoPelosBytes(Buffer.from("<html><script>alert(1)</script></html>")), null);
conferir("vazio nao e aceito", tipoPelosBytes(Buffer.alloc(0)), null);

// ---------------------------------------------------------------------------
console.log("\n— seguranca do SVG de saida —");
conferir("SVG limpo passa", motivoDeSvgInseguro('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0,0Z" fill="#fff"/></svg>'), null);
conferir("script e recusado", motivoDeSvgInseguro("<svg><script>alert(1)</script></svg>") !== null, true);
conferir("foreignObject e recusado", motivoDeSvgInseguro("<svg><foreignObject/></svg>") !== null, true);
conferir("<image> embutida e recusada", motivoDeSvgInseguro('<svg><image href="data:image/png;base64,AA"/></svg>') !== null, true);
conferir("onload e recusado", motivoDeSvgInseguro('<svg onload="alert(1)"></svg>') !== null, true);
conferir("javascript: e recusado", motivoDeSvgInseguro('<svg><a href="javascript:alert(1)"/></svg>') !== null, true);
conferir("o que nao comeca por <svg e recusado", motivoDeSvgInseguro("<html></html>") !== null, true);

// ---------------------------------------------------------------------------
console.log("\n— pixels: fundo e cores —");
const amarelo = await rgbaDe(LOGO_SOBRE_AMARELO);
conferir("fundo de uma cor so e detectado", detectarFundo(amarelo.rgba, amarelo.w, amarelo.h), [255, 230, 0]);
const degrade = await rgbaDe(SOBRE_DEGRADE);
conferir("fundo em degrade NAO e detectado", detectarFundo(degrade.rgba, degrade.w, degrade.h), null);
conferir("imagem opaca nao conta como transparente", temTransparencia(amarelo.rgba), false);
const transparente = await rgbaDe(CIRCULO_TRANSPARENTE);
conferir("PNG com fundo transparente e reconhecido", temTransparencia(transparente.rgba), true);

// Anti-aliasing: a borda do circulo gera dezenas de cores de mistura. So as 4
// de verdade (fundo incluso) podem sair na paleta, e EXATAS.
conferir("paleta: so as cores de verdade, exatas", coresDaImagem(amarelo.rgba).sort(), ["#2D3277", "#FFD100", "#FFE600", "#FFFFFF"]);

// ---------------------------------------------------------------------------
console.log("\n— conversao: fundo transparente e cores exatas —");
const logo = await converterImagemParaSvg({ bytes: logoPng });
conferir("PNG converte", logo.ok, true);
conferir("o fundo amarelo foi reconhecido e removido", logo.fundoRemovido, "#FFE600");
conferir("so as 3 cores do logo, exatas (sem o fundo, sem misturas)", [...logo.cores].sort(), ["#2D3277", "#FFD100", "#FFFFFF"]);
conferir("comeca por <svg e traz viewBox", /^<svg [^>]*viewBox="0 0 240 240"/.test(logo.svg), true);
conferir("sem declaracao XML nem comentario do gerador", /<\?xml|<!--/.test(logo.svg), false);
conferir("poucos caminhos para um logo de 3 cores", logo.caminhos >= 3 && logo.caminhos <= 10, true);
conferir("nada de script, <image> ou href na saida", motivoDeSvgInseguro(logo.svg), null);

const canto = await pixelDoSvg(logo.svg, 4, 4, "#ff00ff");
conferir("o canto (era amarelo) agora e transparente: deixa o magenta aparecer", perto(canto, [255, 0, 255]), true);
const meioFaixa = await pixelDoSvg(logo.svg, 120, 120, "#ff00ff");
conferir("o branco de DENTRO do logo fica (nao e fundo)", perto(meioFaixa, [255, 255, 255]), true);
const contorno = await pixelDoSvg(logo.svg, 120, 36, "#ff00ff"); // dentro do anel azul (raio 90, miolo 76)
conferir("o contorno azul fica", perto(contorno, [45, 50, 119]), true);
const erroLogo = await erroMedio(logoPng, logo.svg, "#FFE600");
conferir(`fiel ao original sobre o amarelo (erro medio ${erroLogo.toFixed(2)} de 255, teto 6)`, erroLogo < 6, true);

// Sem "halo": nenhum pixel do meio da borda do contorno pode virar dourado ou amarelo.
const borda = await pixelDoSvg(logo.svg, 120, 30, "#ff00ff"); // limite externo do anel (120-90 = 30)
conferir("a borda externa nao ganha filete dourado", !perto(borda, [255, 209, 0], 40) && !perto(borda, [255, 230, 0], 40), true);

const anel = await converterImagemParaSvg({ bytes: await png(ANEL_SOBRE_BRANCO) });
conferir("logo sobre BRANCO: o fundo branco e removido", anel.ok && anel.fundoRemovido, "#FFFFFF");
const foraAnel = await pixelDoSvg(anel.svg, 3, 3, "#ff00ff", 200);
const dentroAnel = await pixelDoSvg(anel.svg, 100, 100, "#ff00ff", 200);
conferir("logo sobre branco: fora do anel e transparente", perto(foraAnel, [255, 0, 255]), true);
conferir("logo sobre branco: o branco encerrado pelo anel e preservado", perto(dentroAnel, [255, 255, 255]), true);

const circulo = await png(CIRCULO_TRANSPARENTE);
const jaTransparente = await converterImagemParaSvg({ bytes: circulo });
conferir("PNG ja transparente: nada e removido", [jaTransparente.ok, jaTransparente.jaTransparente, jaTransparente.fundoRemovido], [true, true, null]);
conferir("PNG ja transparente: o canto deixa o fundo aparecer", perto(await pixelDoSvg(jaTransparente.svg, 3, 3, "#ff00ff", 200), [255, 0, 255]), true);

const sobreDegrade = await converterImagemParaSvg({ bytes: await png(SOBRE_DEGRADE) });
conferir("fundo em degrade: NAO apaga as cegas", [sobreDegrade.ok, sobreDegrade.fundoRemovido], [true, null]);

conferir("JPEG converte e remove o fundo", await (async () => {
  const r = await converterImagemParaSvg({ bytes: logoJpeg });
  return r.ok && r.fundoRemovido !== null;
})(), true);
conferir("WebP converte e remove o fundo", await (async () => {
  const r = await converterImagemParaSvg({ bytes: logoWebp });
  return r.ok && r.fundoRemovido !== null;
})(), true);

const grande = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="3000"><rect width="3000" height="3000" fill="#FFE600"/><circle cx="1500" cy="1500" r="1200" fill="#2D3277"/></svg>`)).png().toBuffer();
const reduzido = await converterImagemParaSvg({ bytes: grande });
conferir("imagem grande e reduzida antes de converter", reduzido.ok && reduzido.reduzida && reduzido.largura <= 2048, true);
conferir("a reducao guarda o tamanho original", reduzido.larguraOriginal, 3000);

// Foto de celular "deitada": 200 x 100 no cabecalho, orientacao EXIF 6 (girada
// 90 graus), que aparece como 100 x 200. Nao pode contar como "reduzida".
const deitada = await sharp(
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#FFFFFF"/><circle cx="100" cy="50" r="35" fill="#2D3277"/></svg>`),
)
  .jpeg()
  .withMetadata({ orientation: 6 })
  .toBuffer();
const emPe = await converterImagemParaSvg({ bytes: deitada });
conferir("foto girada por EXIF: dimensoes ja trocadas", [emPe.largura, emPe.altura], [100, 200]);
conferir("foto girada por EXIF: nao conta como reduzida", [emPe.reduzida, emPe.larguraOriginal, emPe.alturaOriginal], [false, 100, 200]);

// ---------------------------------------------------------------------------
console.log("\n— recusas —");
const recusa = async (nome, parametros) => {
  const r = await converterImagemParaSvg(parametros);
  conferir(nome, r.ok === false && typeof r.erro === "string" && r.erro.length > 0, true);
  return r;
};

await recusa("sem arquivo", { bytes: undefined });
await recusa("arquivo vazio", { bytes: Buffer.alloc(0) });
const svgDisfarcado = await recusa("SVG renomeado para .png", { bytes: Buffer.from(LOGO_SOBRE_AMARELO) });
conferir("o recado diz quais formatos servem", /PNG, JPG ou WebP/.test(svgDisfarcado.erro), true);
await recusa("HTML com script", { bytes: Buffer.from("<html><script>alert(1)</script></html>") });
await recusa("GIF", { bytes: gif });
await recusa("bytes aleatorios", { bytes: Buffer.from(Array.from({ length: 200 }, (_, i) => (i * 37 + 11) % 256)) });
const truncado = await recusa("PNG truncado", { bytes: logoPng.subarray(0, 60) });
conferir("PNG truncado: recado de arquivo corrompido", /corrompido/.test(truncado.erro), true);

const acimaDoTeto = Buffer.concat([logoPng, Buffer.alloc(TETO_BYTES_SVG)]);
const pesado = await recusa("arquivo acima de 10 MB", { bytes: acimaDoTeto });
conferir("o recado cita o limite", /10 MB/.test(pesado.erro), true);

const semDados = await recusa("PNG so com cabecalho, sem dados de imagem", { bytes: pngSemDados(50000, 50000) });
conferir("cabecalho sem dados: recado de arquivo corrompido, nao de pixels demais", /corrompido/.test(semDados.erro), true);

const bombaBytes = pngBomba(7000, 6000); // 42 milhoes de pixels, acima do teto de 40 milhoes
const bomba = await recusa("bomba de descompressao (PNG valido de 7000 x 6000)", { bytes: bombaBytes });
conferir(`a bomba tem so ${(bombaBytes.length / 1024).toFixed(0)} KB e e recusada por pixels demais`, bombaBytes.length < 200 * 1024 && /pixels demais/.test(bomba.erro), true);

const corUnica = await sharp({ create: { width: 80, height: 80, channels: 3, background: "#FFE600" } }).png().toBuffer();
const tudoFundo = await recusa("imagem de uma cor so (tudo seria fundo)", { bytes: corUnica });
conferir("uma cor so: recado de imagem toda transparente", /toda transparente/.test(tudoFundo.erro), true);

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

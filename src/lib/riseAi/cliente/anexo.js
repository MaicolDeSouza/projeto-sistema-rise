import { randomBytes } from "node:crypto";

/**
 * O ARQUIVO que o visitante anexa no chat da loja (fase 3, pedido do dono em 22/11/2026: "deve ter opcao de anexar um
 * arquivo e a IA ter capacidade interpretar o arquivo. pode ser lista de peca, imagem e etc").
 *
 * Regras, todas pela seguranca do servico publico:
 *  - o tipo sai dos BYTES, nunca do nome nem do Content-Type (um `.exe` chamado `lista.pdf` e recusado);
 *  - o arquivo nunca vai ao disco: vira texto (PDF, planilha, CSV, TXT) ou uma foto REGRAVADA (JPEG, no maximo 1280 px,
 *    sem EXIF: some o GPS do celular), que fica na memoria por 10 minutos, uma por visitante, e sai ao ser usada;
 *  - planilha e zip: antes de abrir, soma o tamanho descompactado que o proprio zip declara (o teto barra a "bomba");
 *  - tudo com teto de tempo: arquivo que prende a leitura e recusado.
 * Nao confundir com `lerAnexo` das Propostas nem com `tipoPelosBytes` do conversor SVG (outros usos, dentro do Rise).
 */

export const TAMANHO_MAXIMO_DO_ANEXO = 5 * 1024 * 1024;
/** O texto que vai ao modelo: o resto e cortado (e o modelo e avisado). */
export const TETO_DO_TEXTO_DO_ANEXO = 12000;
const LINHAS_DA_PLANILHA = 400;
const TETO_DESCOMPACTADO = 25 * 1024 * 1024;
const LADO_DA_FOTO = 1280;
const TEMPO_DE_LEITURA_MS = 10000;
const VALIDADE_MS = 10 * 60 * 1000;
const MAXIMO_NA_GUARDA = 100;

export class ErroDoAnexo extends Error {
  /** @param {"ilegivel" | "escaneado"} motivo */
  constructor(motivo) {
    super(motivo);
    this.motivo = motivo;
  }
}

const comeca = (bytes, assinatura) => bytes.length >= assinatura.length && assinatura.every((valor, posicao) => bytes[posicao] === valor);

/**
 * Le o diretorio central de um zip (sem descompactar nada): os nomes e a soma dos tamanhos declarados. Zip64, zip sem o
 * fim do diretorio ou entrada que passa do arquivo: `null` (recusado como ilegivel).
 * @returns {{ nomes: string[], total: number } | null}
 */
export function diretorioDoZip(bytes) {
  const inicioDaBusca = Math.max(0, bytes.length - 22 - 65535);
  let fim = -1;
  for (let posicao = bytes.length - 22; posicao >= inicioDaBusca; posicao--) {
    if (bytes.readUInt32LE(posicao) === 0x06054b50) {
      fim = posicao;
      break;
    }
  }
  if (fim < 0) return null;
  const entradas = bytes.readUInt16LE(fim + 10);
  let posicao = bytes.readUInt32LE(fim + 16);
  if (entradas === 0xffff || posicao === 0xffffffff) return null;
  const nomes = [];
  let total = 0;
  for (let i = 0; i < entradas; i++) {
    if (posicao + 46 > bytes.length || bytes.readUInt32LE(posicao) !== 0x02014b50) return null;
    const tamanho = bytes.readUInt32LE(posicao + 24);
    if (tamanho === 0xffffffff) return null;
    const tamanhoDoNome = bytes.readUInt16LE(posicao + 28);
    const fimDoNome = posicao + 46 + tamanhoDoNome;
    if (fimDoNome > bytes.length) return null;
    nomes.push(bytes.toString("utf8", posicao + 46, fimDoNome));
    total += tamanho;
    posicao = fimDoNome + bytes.readUInt16LE(posicao + 30) + bytes.readUInt16LE(posicao + 32);
  }
  return { nomes, total };
}

/** Texto: UTF-8 valido, ou Latin-1 (planilha salva no Windows); `null` quando ha bytes de controle (binario). */
function comoTexto(bytes) {
  let texto;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    texto = bytes.toString("latin1");
  }
  texto = texto.replace(/^﻿/, "");
   
  if (/[\u0000-\u0008\u000E-\u001F\u007F]/.test(texto)) return null;
  return texto;
}

/**
 * O tipo do arquivo pelos primeiros bytes. HTML e XML com cara de texto sao recusados: viram pagina se alguem os abrir.
 * @returns {"png" | "jpeg" | "webp" | "pdf" | "xlsx" | "texto" | null}
 */
export function tipoPelosBytes(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) return null;
  if (comeca(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (comeca(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (bytes.toString("latin1", 0, 5) === "%PDF-") return "pdf";
  if (comeca(bytes, [0x50, 0x4b, 0x03, 0x04])) return diretorioDoZip(bytes)?.nomes.includes("xl/workbook.xml") ? "xlsx" : null;
  const texto = comoTexto(bytes);
  if (texto === null || /^\s*<(?:!doctype|html|script|\?xml|svg|body|head)\b/i.test(texto)) return null;
  return "texto";
}

/** O nome que o visitante deu ao arquivo: sem caminho, uma linha, no maximo 80 caracteres. So aparece como texto. */
export function nomeDoAnexo(bruto) {
  const nome = String(bruto ?? "")
    .split(/[\\/]/)
    .pop()
     
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
  return nome ? nome.slice(0, 80) : "arquivo";
}

function cortar(texto) {
  const limpo = texto.replace(/\r\n?/g, "\n").trim();
  return limpo.length > TETO_DO_TEXTO_DO_ANEXO ? { texto: limpo.slice(0, TETO_DO_TEXTO_DO_ANEXO), cortado: true } : { texto: limpo, cortado: false };
}

const plural = (quantos, um, varios) => `${quantos} ${quantos === 1 ? um : varios}`;

async function lerSemTempo(bytes, tipo) {
  if (tipo === "png" || tipo === "jpeg" || tipo === "webp") {
    const sharp = (await import("sharp")).default;
    // `rotate()` aplica a orientacao do EXIF antes de ele sumir; o sharp nao copia metadado nenhum sem `withMetadata`.
    const regravada = await sharp(bytes, { limitInputPixels: 40e6 }).rotate().resize(LADO_DA_FOTO, LADO_DA_FOTO, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    return { imagem: { mime: "image/jpeg", base64: regravada.toString("base64") }, resumo: "imagem" };
  }
  if (tipo === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const leitor = new PDFParse({ data: new Uint8Array(bytes) });
    try {
      const resultado = await leitor.getText();
      const texto = String(resultado?.text ?? "")
        .replace(/--\s*\d+\s*of\s*\d+\s*--/g, "")
        .trim();
      // PDF de foto (escaneado) nao tem texto: o visitante precisa mandar a foto ou a lista em texto.
      if (texto.replace(/\s/g, "").length < 10) throw new ErroDoAnexo("escaneado");
      const paginas = Number(resultado?.total) || resultado?.pages?.length || 1;
      return { ...cortar(texto), resumo: plural(paginas, "página", "páginas") };
    } finally {
      await leitor.destroy?.();
    }
  }
  if (tipo === "xlsx") {
    const diretorio = diretorioDoZip(bytes);
    if (!diretorio || diretorio.total > TETO_DESCOMPACTADO) throw new ErroDoAnexo("ilegivel");
    const ExcelJS = (await import("exceljs")).default;
    const pasta = new ExcelJS.Workbook();
    await pasta.xlsx.load(bytes);
    // A primeira aba que tem dado (planilha com a capa vazia na primeira aba e comum).
    const folha = pasta.worksheets.find((candidata) => candidata.actualRowCount > 0);
    if (!folha) throw new ErroDoAnexo("ilegivel");
    const linhas = [];
    folha.eachRow({ includeEmpty: false }, (linha) => {
      if (linhas.length >= LINHAS_DA_PLANILHA) return;
      const celulas = [];
      linha.eachCell({ includeEmpty: true }, (celula) => celulas.push(String(celula.text ?? "").replace(/\s+/g, " ").trim()));
      while (celulas.length && !celulas.at(-1)) celulas.pop();
      if (celulas.length) linhas.push(celulas.join("\t"));
    });
    if (!linhas.length) throw new ErroDoAnexo("ilegivel");
    return { ...cortar(linhas.join("\n")), resumo: plural(linhas.length, "linha", "linhas") };
  }
  const texto = comoTexto(bytes);
  if (!texto || !texto.trim()) throw new ErroDoAnexo("ilegivel");
  const lido = cortar(texto);
  return { ...lido, resumo: plural(lido.texto.split("\n").filter((linha) => linha.trim()).length, "linha", "linhas") };
}

/**
 * Le o arquivo, ja reconhecido por `tipoPelosBytes`. Qualquer falha da leitura (arquivo corrompido, tempo) vira
 * `ErroDoAnexo("ilegivel")`; o detalhe nao vai ao visitante.
 */
export async function lerAnexo(bytes, tipo, { tempoMs = TEMPO_DE_LEITURA_MS } = {}) {
  let relogio = null;
  const prazo = new Promise((_, falhar) => {
    relogio = setTimeout(() => falhar(new ErroDoAnexo("ilegivel")), tempoMs);
  });
  try {
    return await Promise.race([lerSemTempo(bytes, tipo), prazo]);
  } catch (falha) {
    if (falha instanceof ErroDoAnexo) throw falha;
    throw new ErroDoAnexo("ilegivel");
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Onde o arquivo lido espera a pergunta seguinte: na memoria, um por visitante (o novo substitui o anterior), 10 minutos.
 * `pegar` so entrega a quem o enviou, e uma vez.
 */
export function criarGuardaDeAnexos({ agora = Date.now, validadeMs = VALIDADE_MS, maximo = MAXIMO_NA_GUARDA } = {}) {
  /** @type {Map<string, { id: string, anexo: object, vale: number }>} */
  const porSessao = new Map();
  function faxina() {
    const instante = agora();
    for (const [sessaoId, guardado] of porSessao) if (guardado.vale < instante) porSessao.delete(sessaoId);
    // Acima do teto sai o mais antigo (o Map guarda a ordem de entrada).
    while (porSessao.size >= maximo) porSessao.delete(porSessao.keys().next().value);
  }
  return {
    guardar(sessaoId, anexo) {
      porSessao.delete(sessaoId);
      faxina();
      const id = randomBytes(12).toString("hex");
      porSessao.set(sessaoId, { id, anexo, vale: agora() + validadeMs });
      return id;
    },
    pegar(sessaoId, id) {
      const guardado = porSessao.get(sessaoId);
      if (!guardado || guardado.id !== id) return null;
      porSessao.delete(sessaoId);
      return guardado.vale >= agora() ? guardado.anexo : null;
    },
    tamanho: () => porSessao.size,
  };
}

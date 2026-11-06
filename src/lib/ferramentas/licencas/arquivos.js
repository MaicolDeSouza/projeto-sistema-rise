import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

/**
 * O arquivo de licenca do Mach3 (spec 2026-11-05-licencas-softwares-design.md, §6.3): ler o que o dono envia (o `.dat`
 * solto ou um `.zip` com um unico arquivo dentro) e montar o zip que ele manda ao cliente (`<identificador>.zip` com a
 * pasta `<identificador>/` e o arquivo dentro, igual ao que ele ja fazia a mao).
 *
 * Zip escrito e lido aqui, sem dependencia nova: e um arquivo de 201 bytes numa unica entrada, e o formato basico
 * (local header, diretorio central, fim) cabe em poucas linhas. A soma sha256 acompanha o arquivo do upload ao
 * download: perder ou trocar o arquivo da licenca e o pior erro desta ferramenta.
 */

/** 1 MB. Uma licenca tem 201 bytes; o teto so evita engano (a planilha, uma foto), tambem no tamanho descompactado. */
export const TETO_BYTES_ARQUIVO = 1048576;

const ACIMA_DO_TETO = "Arquivo acima de 1 MB.";
const CORROMPIDO = "Zip corrompido.";
const NAO_SUPORTADO = "Zip em formato não suportado: envie o arquivo solto ou um zip comum.";

const ASSINATURA_LOCAL = 0x04034b50;
const ASSINATURA_CENTRAL = 0x02014b50;
const ASSINATURA_FIM = 0x06054b50;

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * O nome vem do navegador (ou de dentro de um zip) e e dado de terceiro: so o nome base, sem caractere fora de
 * letras, numeros, ponto, hifen e espaco. So pontos ("..") ou vazio vira "licenca.dat".
 */
export function limparNomeDeArquivo(nome) {
  return limparTrecho(nome) || "licenca.dat";
}

function limparTrecho(texto) {
  const base = String(texto ?? "").split(/[\\/]/).pop();
  const limpo = base.replace(/[^\w.\- ]/g, "_").trim();
  return /^\.*$/.test(limpo) ? "" : limpo;
}

/** Le um zip que deve ter UM arquivo (entradas de pasta, terminadas em "/", sao ignoradas). */
export function lerZipDeUmArquivo(entrada) {
  const bytes = Buffer.from(entrada);
  try {
    const fim = acharFim(bytes);
    if (fim < 0) return { ok: false, erro: CORROMPIDO };
    const total = bytes.readUInt16LE(fim + 10);
    let posicao = bytes.readUInt32LE(fim + 16);
    const arquivos = [];
    for (let i = 0; i < total; i++) {
      if (bytes.readUInt32LE(posicao) !== ASSINATURA_CENTRAL) return { ok: false, erro: CORROMPIDO };
      const tamanhoDoNome = bytes.readUInt16LE(posicao + 28);
      const entradaCentral = {
        flags: bytes.readUInt16LE(posicao + 8),
        metodo: bytes.readUInt16LE(posicao + 10),
        crc: bytes.readUInt32LE(posicao + 16),
        compactado: bytes.readUInt32LE(posicao + 20),
        tamanho: bytes.readUInt32LE(posicao + 24),
        local: bytes.readUInt32LE(posicao + 42),
        nome: bytes.subarray(posicao + 46, posicao + 46 + tamanhoDoNome).toString("utf8"),
      };
      if (!entradaCentral.nome.endsWith("/")) arquivos.push(entradaCentral);
      posicao += 46 + tamanhoDoNome + bytes.readUInt16LE(posicao + 30) + bytes.readUInt16LE(posicao + 32);
    }
    if (arquivos.length !== 1) return { ok: false, erro: "O zip precisa ter um único arquivo dentro." };
    const arquivo = arquivos[0];

    // Bit 0 = cifrado; 0xffffffff = zip64. Nenhum dos dois e o zip de uma licenca.
    if (arquivo.flags & 1 || arquivo.compactado === 0xffffffff || arquivo.tamanho === 0xffffffff) return { ok: false, erro: NAO_SUPORTADO };
    if (arquivo.metodo !== 0 && arquivo.metodo !== 8) return { ok: false, erro: NAO_SUPORTADO };
    if (arquivo.tamanho > TETO_BYTES_ARQUIVO) return { ok: false, erro: ACIMA_DO_TETO };

    if (bytes.readUInt32LE(arquivo.local) !== ASSINATURA_LOCAL) return { ok: false, erro: CORROMPIDO };
    const flagsLocais = bytes.readUInt16LE(arquivo.local + 6);
    const crcLocal = bytes.readUInt32LE(arquivo.local + 14);
    const inicio = arquivo.local + 30 + bytes.readUInt16LE(arquivo.local + 26) + bytes.readUInt16LE(arquivo.local + 28);
    const dados = bytes.subarray(inicio, inicio + arquivo.compactado);
    if (dados.length !== arquivo.compactado) return { ok: false, erro: CORROMPIDO };

    let conteudo;
    if (arquivo.metodo === 0) conteudo = Buffer.from(dados);
    else {
      try {
        // O teto vale tambem aqui: o tamanho declarado no zip pode mentir.
        conteudo = inflateRawSync(dados, { maxOutputLength: TETO_BYTES_ARQUIVO });
      } catch (erro) {
        return { ok: false, erro: erro?.code === "ERR_BUFFER_TOO_LARGE" || erro instanceof RangeError ? ACIMA_DO_TETO : CORROMPIDO };
      }
    }
    const crc = crc32(conteudo);
    // Com o bit 3 o CRC do local header vem zerado (fica num descritor depois dos dados): vale so o do diretorio.
    const localConfere = flagsLocais & 8 ? true : crcLocal === crc;
    if (conteudo.length !== arquivo.tamanho || crc !== arquivo.crc || !localConfere) return { ok: false, erro: CORROMPIDO };
    return { ok: true, nome: arquivo.nome, bytes: conteudo };
  } catch {
    // Leitura fora do buffer (RangeError do readUInt*): zip truncado.
    return { ok: false, erro: CORROMPIDO };
  }
}

function acharFim(bytes) {
  const limite = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= limite; i--) {
    if (bytes.readUInt32LE(i) === ASSINATURA_FIM) return i;
  }
  return -1;
}

/** O que o dono envia na tela: o `.dat` solto ou um zip com um unico arquivo (o Rise guarda o arquivo, nao o zip). */
export function lerArquivoEnviado({ nome, bytes }) {
  const recebidos = Buffer.from(bytes ?? []);
  if (!recebidos.length) return { ok: false, erro: "Arquivo vazio." };
  if (recebidos.length > TETO_BYTES_ARQUIVO) return { ok: false, erro: ACIMA_DO_TETO };

  let conteudo = recebidos;
  let nomeOriginal = limparNomeDeArquivo(nome);
  if (recebidos.length >= 4 && recebidos.readUInt32LE(0) === ASSINATURA_LOCAL) {
    const lido = lerZipDeUmArquivo(recebidos);
    if (!lido.ok) return lido;
    conteudo = lido.bytes;
    nomeOriginal = limparNomeDeArquivo(lido.nome);
    if (!conteudo.length) return { ok: false, erro: "Arquivo vazio." };
  }
  return {
    ok: true,
    nomeOriginal,
    bytes: conteudo,
    sha256: sha256Hex(conteudo),
    tamanhoBytes: conteudo.length,
    mimeType: "application/octet-stream",
  };
}

/** Data e hora no formato do MS-DOS que o zip usa (sem fuso: a hora local do servidor, que roda em Sao Paulo). */
function dataDos(agora = new Date()) {
  const hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | Math.floor(agora.getSeconds() / 2);
  const dia = ((Math.max(1980, agora.getFullYear()) - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
  return { hora, dia };
}

/** `<identificador>.zip` com uma entrada sem compressao: `<identificador>/<nomeOriginal>`. */
export function montarZipDoArquivo({ identificador, nomeOriginal, bytes }) {
  const pasta = limparTrecho(identificador) || "licenca";
  const conteudo = Buffer.from(bytes);
  const nome = Buffer.from(`${pasta}/${limparNomeDeArquivo(nomeOriginal)}`, "utf8");
  const crc = crc32(conteudo);
  const { hora, dia } = dataDos();

  const local = Buffer.alloc(30);
  local.writeUInt32LE(ASSINATURA_LOCAL, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt16LE(hora, 10);
  local.writeUInt16LE(dia, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(conteudo.length, 18);
  local.writeUInt32LE(conteudo.length, 22);
  local.writeUInt16LE(nome.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(ASSINATURA_CENTRAL, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(hora, 12);
  central.writeUInt16LE(dia, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(conteudo.length, 20);
  central.writeUInt32LE(conteudo.length, 24);
  central.writeUInt16LE(nome.length, 28);
  central.writeUInt32LE(0, 42);

  const tamanhoLocal = local.length + nome.length + conteudo.length;
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(ASSINATURA_FIM, 0);
  fim.writeUInt16LE(1, 8);
  fim.writeUInt16LE(1, 10);
  fim.writeUInt32LE(central.length + nome.length, 12);
  fim.writeUInt32LE(tamanhoLocal, 16);

  return { nome: `${pasta}.zip`, bytes: Buffer.concat([local, nome, conteudo, central, nome, fim]) };
}

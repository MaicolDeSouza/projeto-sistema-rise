import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";

/**
 * A cotacao que o cliente mandou (spec 2026-11-12, extra D): um ou mais arquivos por proposta, em
 * dados/propostas/<propostaId>/cotacao/, com nome gerado por nos (o nome real fica no banco e volta no download). Direto na
 * pasta, sem lote temporario, como os comprovantes de Compras: o anexo e feito e excluido na hora. Nunca vai no PDF.
 *
 * O formato e conferido pelos BYTES (o tipo que o navegador diz e o nome sao dados de terceiro): PDF, JPEG, PNG, WebP,
 * planilha (XLSX/ODS, que sao zip) e XLS antigo; ate 20 MB cada.
 */

export const RAIZ_PROPOSTAS = path.join(process.cwd(), "dados", "propostas");
const PASTA = "cotacao";
const TAMANHO_MAXIMO = 20 * 1024 * 1024;
const POR_VEZ = 10;

const ASSINATURAS = [
  { extensao: ".pdf", confere: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { extensao: ".jpg", confere: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { extensao: ".png", confere: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { extensao: ".webp", confere: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  // XLSX, ODS e DOCX sao zip: a extensao vem do nome que o cliente deu (so se for uma dessas), senao fica .zip.
  { extensao: ".zip", confere: (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 },
  { extensao: ".xls", confere: (b) => b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) },
];
const DO_ZIP = [".xlsx", ".ods", ".docx"];

export const TIPO_DO_ARQUIVO = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".zip": "application/zip",
  ".xls": "application/vnd.ms-excel",
};

/**
 * Confere um arquivo enviado (tamanho e formato pelos BYTES) e devolve os bytes com o nome gerado. Usado tambem pela
 * ficha cadastral do cliente (lib/clientes/arquivos.js, 13/11/2026).
 */
export async function prepararArquivo(arquivo, nomePadrao = "arquivo") {
  const nomeOriginal = String(arquivo.name ?? "").slice(0, 200) || nomePadrao;
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: `${nomeOriginal} tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB; o limite é 20 MB.` };
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  let extensao = ASSINATURAS.find((a) => a.confere(bytes))?.extensao;
  if (!extensao) return { erro: `${nomeOriginal}: envie PDF, imagem ou planilha.` };
  if (extensao === ".zip") {
    const pedida = path.extname(nomeOriginal).toLowerCase();
    if (DO_ZIP.includes(pedida)) extensao = pedida;
  }
  return { bytes, nome: `${randomUUID().replaceAll("-", "")}${extensao}`, nomeOriginal, tamanho: bytes.length };
}

export const NOME_GERADO_DO_ARQUIVO = /^[0-9a-f]{32}\.(pdf|jpg|png|webp|xlsx|ods|docx|zip|xls)$/;
const ID = /^[a-z0-9]{10,40}$/;

export function caminhoDoAnexo(propostaId, nome) {
  if (!ID.test(propostaId ?? "") || !NOME_GERADO_DO_ARQUIVO.test(nome ?? "")) throw new Error("Caminho de anexo inválido.");
  return path.join(RAIZ_PROPOSTAS, propostaId, PASTA, nome);
}

export async function apagarPastaDaProposta(propostaId) {
  if (!ID.test(propostaId ?? "")) return;
  await rm(path.join(RAIZ_PROPOSTAS, propostaId), { recursive: true, force: true });
}

/** Grava os arquivos enviados e as linhas do banco. Um arquivo recusado nao grava nenhum (a mensagem diz qual). */
export async function anexarCotacao(numeroDaProposta, arquivos) {
  const proposta = await prisma.propostaParaCliente.findUnique({ where: { numero: Number(numeroDaProposta) || 0 }, select: { id: true } });
  if (!proposta) return { ok: false, erro: "Proposta não encontrada." };
  const lista = (arquivos ?? []).filter((a) => a && typeof a.arrayBuffer === "function" && a.size);
  if (!lista.length) return { ok: false, erro: "Nenhum arquivo enviado." };
  if (lista.length > POR_VEZ) return { ok: false, erro: `No máximo ${POR_VEZ} arquivos por vez.` };

  const preparados = [];
  for (const arquivo of lista) {
    const preparado = await prepararArquivo(arquivo, "cotacao");
    if (preparado.erro) return { ok: false, erro: preparado.erro };
    preparados.push(preparado);
  }
  for (const item of preparados) {
    const destino = caminhoDoAnexo(proposta.id, item.nome);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, item.bytes);
  }
  await prisma.anexoDaProposta.createMany({
    data: preparados.map((item) => ({ propostaId: proposta.id, arquivo: item.nome, nomeOriginal: item.nomeOriginal, tamanho: item.tamanho })),
  });
  return { ok: true, anexados: preparados.length };
}

export async function excluirAnexo(numeroDaProposta, anexoId) {
  const anexo = await prisma.anexoDaProposta.findFirst({
    where: { id: String(anexoId ?? ""), proposta: { numero: Number(numeroDaProposta) || 0 } },
    select: { id: true, arquivo: true, propostaId: true },
  });
  if (!anexo) return { ok: false, erro: "Anexo não encontrado." };
  await prisma.anexoDaProposta.delete({ where: { id: anexo.id } });
  await rm(caminhoDoAnexo(anexo.propostaId, anexo.arquivo), { force: true });
  return { ok: true };
}

/** Os bytes de um anexo para o download (a rota confere o acesso). */
export async function lerAnexo(anexoId) {
  const anexo = await prisma.anexoDaProposta.findUnique({ where: { id: String(anexoId ?? "") } });
  if (!anexo) return null;
  try {
    const bytes = await readFile(caminhoDoAnexo(anexo.propostaId, anexo.arquivo));
    return { bytes, nomeOriginal: anexo.nomeOriginal, tipo: TIPO_DO_ARQUIVO[path.extname(anexo.arquivo)] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";

import { RAIZ_TEMPORARIA, limparTemporariosAntigos, loteValido } from "@/lib/arquivos";

/**
 * O arquivo da proposta do fornecedor (o orcamento que ele mandou). Como os documentos do produto: o envio vai para o
 * lote temporario e so o Salvar do pedido o leva para dados/compras/<pedidoId>/ (Cancelar descarta). Nome gerado por
 * nos; o nome real fica no banco e volta no download.
 *
 * O formato e conferido pelos BYTES (o tipo que o navegador diz e o nome do arquivo sao dados de terceiro): PDF, JPEG
 * ou PNG, ate 20 MB.
 */

export const RAIZ_COMPRAS = path.join(process.cwd(), "dados", "compras");
const PASTA = "proposta";
const TAMANHO_MAXIMO = 20 * 1024 * 1024;

const ASSINATURAS = [
  { extensao: ".pdf", confere: (bytes) => bytes.subarray(0, 5).toString("latin1") === "%PDF-" },
  { extensao: ".jpg", confere: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { extensao: ".png", confere: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
];

const NOME_GERADO = /^[0-9a-f]{32}\.(pdf|jpg|png)$/;
const ID_DO_PEDIDO = /^[a-z0-9]{10,40}$/;

export function caminhoDaPropostaDoPedido(pedidoId, nome) {
  if (!ID_DO_PEDIDO.test(pedidoId ?? "") || !NOME_GERADO.test(nome ?? "")) throw new Error("Caminho de proposta inválido.");
  return path.join(RAIZ_COMPRAS, pedidoId, PASTA, nome);
}

/** Grava o arquivo enviado no lote temporario. */
export async function guardarPropostaTemporaria(lote, arquivo) {
  if (!loteValido(lote)) return { ok: false, erro: "Lote de envio inválido." };
  if (!arquivo || typeof arquivo.arrayBuffer !== "function" || !arquivo.size) return { ok: false, erro: "Nenhum arquivo enviado." };
  if (arquivo.size > TAMANHO_MAXIMO) return { ok: false, erro: `O arquivo tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB; o limite é 20 MB.` };

  const bytes = Buffer.from(await arquivo.arrayBuffer());
  const formato = ASSINATURAS.find((assinatura) => assinatura.confere(bytes));
  if (!formato) return { ok: false, erro: "Envie a proposta em PDF, JPG ou PNG." };

  await limparTemporariosAntigos();
  const nome = `${randomUUID().replaceAll("-", "")}${formato.extensao}`;
  const destino = path.join(RAIZ_TEMPORARIA, lote, PASTA);
  await mkdir(destino, { recursive: true });
  await writeFile(path.join(destino, nome), bytes);
  return { ok: true, nome, nomeOriginal: String(arquivo.name ?? "").slice(0, 200) || null };
}

/** Leva o arquivo do lote para a pasta do pedido; devolve o nome. Recusa nome e lote fora do formato. */
export async function moverPropostaParaPedido(pedidoId, lote, nome) {
  if (!loteValido(lote) || !NOME_GERADO.test(nome ?? "")) throw new Error("Proposta temporária inválida.");
  const origem = path.join(RAIZ_TEMPORARIA, lote, PASTA, nome);
  const destino = caminhoDaPropostaDoPedido(pedidoId, nome);
  await mkdir(path.dirname(destino), { recursive: true });
  try {
    await rename(origem, destino);
  } catch (erro) {
    // Discos diferentes (volume do Docker): copia e apaga.
    if (erro.code !== "EXDEV") throw erro;
    await copyFile(origem, destino);
    await rm(origem, { force: true });
  }
  return nome;
}

export async function apagarPropostaDoPedido(pedidoId, nome) {
  if (!nome) return;
  await rm(caminhoDaPropostaDoPedido(pedidoId, nome), { force: true });
}

export async function apagarPastaDoPedido(pedidoId) {
  if (!ID_DO_PEDIDO.test(pedidoId ?? "")) return;
  await rm(path.join(RAIZ_COMPRAS, pedidoId), { recursive: true, force: true });
}

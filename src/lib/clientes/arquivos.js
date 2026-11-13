import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";
import { NOME_GERADO_DO_ARQUIVO, TIPO_DO_ARQUIVO, prepararArquivo } from "@/lib/propostas/arquivos";

/**
 * Arquivos do cliente (pedido do dono em 13/11/2026: "anexar essa ficha cadastral ao cadastro do cliente ... criar o
 * campo no cadastro do cliente para fazer o upload da ficha cadastral para os proximos clientes"). Em
 * dados/clientes/<clienteId>/, com nome gerado; o formato e conferido pelos bytes (o mesmo da cotacao da proposta).
 */

export const RAIZ_CLIENTES = path.join(process.cwd(), "dados", "clientes");
export const TIPOS_DE_ARQUIVO_DO_CLIENTE = { FICHA_CADASTRAL: "Ficha cadastral", OUTRO: "Outro documento" };
const ID = /^[a-z0-9]{10,40}$/;

export function caminhoDoArquivoDoCliente(clienteId, nome) {
  if (!ID.test(clienteId ?? "") || !NOME_GERADO_DO_ARQUIVO.test(nome ?? "")) throw new Error("Caminho de arquivo inválido.");
  return path.join(RAIZ_CLIENTES, clienteId, nome);
}

/** A pasta do cliente (para apagar junto com ele); id invalido = null. */
export function pastaDoCliente(clienteId) {
  return ID.test(String(clienteId ?? "")) ? path.join(RAIZ_CLIENTES, String(clienteId)) : null;
}

export async function listarArquivosDoCliente(clienteId) {
  return prisma.arquivoDoCliente.findMany({
    where: { clienteId: String(clienteId ?? "") },
    orderBy: { criadoEm: "asc" },
    select: { id: true, tipo: true, nomeOriginal: true, tamanho: true, criadoEm: true },
  });
}

/** Grava os arquivos enviados. Um recusado nao grava nenhum (a mensagem diz qual). */
export async function anexarArquivosDoCliente(clienteId, arquivos, tipo = "FICHA_CADASTRAL") {
  const cliente = await prisma.cliente.findUnique({ where: { id: String(clienteId ?? "") }, select: { id: true } });
  if (!cliente) return { ok: false, erro: "Cliente não encontrado." };
  const lista = (arquivos ?? []).filter((a) => a && typeof a.arrayBuffer === "function" && a.size);
  if (!lista.length) return { ok: false, erro: "Nenhum arquivo enviado." };
  if (lista.length > 10) return { ok: false, erro: "No máximo 10 arquivos por vez." };
  const preparados = [];
  for (const arquivo of lista) {
    const preparado = await prepararArquivo(arquivo, "ficha-cadastral");
    if (preparado.erro) return { ok: false, erro: preparado.erro };
    preparados.push(preparado);
  }
  for (const item of preparados) {
    const destino = caminhoDoArquivoDoCliente(cliente.id, item.nome);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, item.bytes);
  }
  await prisma.arquivoDoCliente.createMany({
    data: preparados.map((item) => ({
      clienteId: cliente.id,
      tipo: TIPOS_DE_ARQUIVO_DO_CLIENTE[tipo] ? tipo : "FICHA_CADASTRAL",
      arquivo: item.nome,
      nomeOriginal: item.nomeOriginal,
      tamanho: item.tamanho,
    })),
  });
  return { ok: true, anexados: preparados.length };
}

export async function excluirArquivoDoCliente(clienteId, arquivoId) {
  const arquivo = await prisma.arquivoDoCliente.findFirst({ where: { id: String(arquivoId ?? ""), clienteId: String(clienteId ?? "") } });
  if (!arquivo) return { ok: false, erro: "Arquivo não encontrado." };
  await prisma.arquivoDoCliente.delete({ where: { id: arquivo.id } });
  await rm(caminhoDoArquivoDoCliente(arquivo.clienteId, arquivo.arquivo), { force: true });
  return { ok: true };
}

/** Os bytes para o download (a rota confere o acesso). */
export async function lerArquivoDoCliente(arquivoId) {
  const arquivo = await prisma.arquivoDoCliente.findUnique({ where: { id: String(arquivoId ?? "") } });
  if (!arquivo) return null;
  try {
    const bytes = await readFile(caminhoDoArquivoDoCliente(arquivo.clienteId, arquivo.arquivo));
    return { bytes, nomeOriginal: arquivo.nomeOriginal, tipo: TIPO_DO_ARQUIVO[path.extname(arquivo.arquivo)] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

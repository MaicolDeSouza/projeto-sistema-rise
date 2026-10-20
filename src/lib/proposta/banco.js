import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { apagarPastaDaProposta, caminhoDaProposta } from "@/lib/arquivos";
import { prisma } from "@/lib/db";
import { padronizarImagem } from "@/lib/imagens/padronizar";

import { validarPlano } from "./plano";

/**
 * Gravacao da proposta automatica de produto (spec 2026-10-16). Uma secao por chamada: cria a proposta ou SUBSTITUI a
 * secao, e nunca toca em `Produto` nem em `ProdutoArquivo`. Usada pelo script da sessao (`proposta <sku> --plano=`) e,
 * na Parte 2, pela tela e pelo Conferido.
 *
 * Arquivos (fotos candidatas e PDFs) vao para dados/produtos/<SKU>/proposta/ com nome gerado por nos, ANTES do banco;
 * se o banco falhar, os novos sao apagados. Os arquivos que a secao substituida deixou de citar saem DEPOIS do banco.
 */

const ehPdf = (bytes) => bytes.subarray(0, 5).toString("latin1") === "%PDF-";
const novoNome = (extensao) => `${randomUUID().replaceAll("-", "")}.${extensao}`;

/** Nomes de arquivo da pasta proposta/ que uma secao cita (fotos: candidatas; documentos: itens). */
function arquivosDaSecao(secao, conteudo) {
  if (secao === "fotos") return (conteudo?.candidatas ?? []).map((c) => c.arquivo).filter(Boolean);
  if (secao === "documentos") return (conteudo?.itens ?? []).map((i) => i.arquivo).filter(Boolean);
  return [];
}

async function gravarArquivo(sku, nome, bytes, criados) {
  const destino = caminhoDaProposta(sku, nome);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, bytes);
  criados.push(destino);
}

/**
 * @param {string} sku
 * @param {{ secao: string, conteudo: any }} plano
 * @param {{ bytes?: Map<string, Buffer> }} [opcoes] bytes das fotos e PDFs novos, pelo id da candidata ou do documento
 * @returns {Promise<{ ok: true, secoes: string[], aviso: string|null } | { ok: false, erro: string }>}
 */
export async function gravarProposta(sku, plano, { bytes = new Map() } = {}) {
  const validado = validarPlano(plano);
  if (!validado.ok) return validado;
  const produto = await prisma.produto.findUnique({ where: { sku }, select: { id: true, conferido: true } });
  if (!produto) return { ok: false, erro: `Produto ${sku} não existe.` };
  if (produto.conferido) return { ok: false, erro: `${sku} está Conferido: a proposta não é gravada (o dono já aprovou).` };

  const anterior = await prisma.propostaDeProduto.findUnique({ where: { produtoId: produto.id } });
  const conteudo = structuredClone(plano.conteudo);
  const { secao } = validado;
  const citadosAntes = new Set(arquivosDaSecao(secao, anterior?.secoes?.[secao]));
  const criados = [];

  try {
    if (secao === "fotos") {
      const fotosAtuais = new Set(
        (await prisma.produtoArquivo.findMany({ where: { produtoId: produto.id, tipo: "IMAGEM", papel: "FOTO" }, select: { arquivo: true } })).map((f) => f.arquivo),
      );
      for (const candidata of conteudo.candidatas) {
        const recebidos = bytes.get(candidata.id);
        if (recebidos) {
          const padrao = await padronizarImagem(recebidos);
          if (!padrao.ok) throw new Error(`foto ${candidata.id}: ${padrao.erro}`);
          candidata.arquivo = novoNome("jpg");
          await gravarArquivo(sku, candidata.arquivo, padrao.bytes, criados);
        } else if (candidata.fotoAtual) {
          // Foto que o produto ja tem: fica onde esta (imagens/), a proposta so a cita.
          if (!fotosAtuais.has(candidata.fotoAtual)) throw new Error(`a foto atual ${candidata.fotoAtual} não é foto deste produto.`);
        } else if (!(candidata.arquivo && citadosAntes.has(candidata.arquivo))) {
          throw new Error(`a candidata ${candidata.id} veio sem a imagem (nem foto atual, nem arquivo já guardado).`);
        }
      }
    }
    if (secao === "documentos") {
      for (const item of conteudo.itens) {
        const recebidos = bytes.get(item.id);
        if (!recebidos) continue; // so o link, sem baixar
        if (!ehPdf(recebidos)) throw new Error(`documento ${item.id}: não é um PDF.`);
        item.arquivo = novoNome("pdf");
        await gravarArquivo(sku, item.arquivo, recebidos, criados);
      }
    }

    const secoes = { ...(anterior?.secoes ?? {}), [secao]: conteudo };
    // Conteudo novo ainda nao foi aplicado pelo dono: a marca da secao sai.
    const aplicadas = { ...(anterior?.aplicadas ?? {}) };
    delete aplicadas[secao];
    await prisma.propostaDeProduto.upsert({
      where: { produtoId: produto.id },
      create: { produtoId: produto.id, secoes, aplicadas },
      update: { secoes, aplicadas },
    });

    const citadosAgora = new Set(arquivosDaSecao(secao, conteudo));
    for (const nome of citadosAntes) {
      if (!citadosAgora.has(nome)) await unlink(caminhoDaProposta(sku, nome)).catch(() => {});
    }
    return { ok: true, secoes: Object.keys(secoes), aviso: validado.aviso ?? null };
  } catch (falha) {
    for (const arquivo of criados) await unlink(arquivo).catch(() => {});
    return { ok: false, erro: falha.message };
  }
}

/** A proposta do produto (com o SKU e o id do produto), ou null. */
export async function lerProposta(sku) {
  const produto = await prisma.produto.findUnique({ where: { sku }, select: { id: true, sku: true, proposta: true } });
  return produto?.proposta ? { ...produto.proposta, sku: produto.sku } : null;
}

/** Apaga a proposta (linha e pasta proposta/). Sem proposta, nao faz nada. */
export async function apagarProposta(produtoId, sku) {
  await prisma.propostaDeProduto.deleteMany({ where: { produtoId } });
  await apagarPastaDaProposta(sku);
}

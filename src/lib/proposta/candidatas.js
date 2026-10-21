import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { caminhoDaProposta } from "@/lib/arquivos";
import { prisma } from "@/lib/db";
import { padronizarImagem } from "@/lib/imagens/padronizar";
import { bytesDe } from "@/lib/imagensImportadas";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

import { fotosNaPasta, gravarIndiceDeCandidatas, lerIndiceDeCandidatas } from "./banco";
import { fotoDaOferta } from "./leitura";

/**
 * O Rise baixa as fotos candidatas da proposta (spec 2026-10-21, `baixarCandidatas` do MCP). O endereco de cada uma sai
 * das ofertas VINCULADAS ao produto, pelo id que `lerParaProposta` deu (`fotoDaOferta`): nada que venha da conversa vira
 * download. O download e o `bytesDe` (so rede publica, o IP conferido na conexao), e a foto e padronizada em 1024x1024 e
 * guardada em proposta/<32 hex>.jpg, ainda sem nenhuma secao citando. A secao `fotos` gravada depois decide o que fica.
 */

export const MAXIMO_POR_CHAMADA = 20;
// O dono trocou 60 por 100 em 21/10/2026: o mesmo limite de fotos do cadastro. Conta tudo o que esta na pasta.
export const LIMITE_DE_CANDIDATAS = 100;

const NAO_E_DA_OFERTA = "não é foto das ofertas deste produto (use o id que lerParaProposta deu)";

const baixarDaRede = (url) => bytesDe({ endereco: url });

/**
 * @param {string} sku
 * @param {string[]} ids  ids `<produtoColetadoId>:<indice>` de `lerParaProposta`
 * @param {{ baixar?: (url: string) => Promise<Buffer> }} [opcoes]  o teste passa um download falso
 * @returns {Promise<{ baixadas: { id: string, arquivo: string, loja: string, largura: number, altura: number }[], falharam: { id: string, motivo: string }[] }>}
 */
export async function baixarCandidatas(sku, ids, { baixar = baixarDaRede } = {}) {
  const pedidos = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (pedidos.length === 0) throw new ErroDeFerramenta("Informe ao menos um id de foto.");
  if (pedidos.length > MAXIMO_POR_CHAMADA) throw new ErroDeFerramenta(`Peça no máximo ${MAXIMO_POR_CHAMADA} fotos por vez (vieram ${pedidos.length}).`);

  const produto = await prisma.produto.findUnique({ where: { sku: String(sku ?? "") }, select: { conferido: true } });
  if (!produto) throw new ErroDeFerramenta(`O produto ${sku} não existe no Rise.`);
  if (produto.conferido) throw new ErroDeFerramenta(`O produto ${sku} já foi Conferido (já aprovado: nada a propor).`);

  const indice = await lerIndiceDeCandidatas(sku);
  let guardadas = (await fotosNaPasta(sku)).length;
  const jaGuardada = (id) => indice[id]?.arquivo && existsSync(caminhoDaProposta(sku, indice[id].arquivo) ?? "");
  if (guardadas >= LIMITE_DE_CANDIDATAS && pedidos.some((id) => !jaGuardada(id))) {
    throw new ErroDeFerramenta(
      `Já há ${guardadas} fotos candidatas guardadas (o limite é ${LIMITE_DE_CANDIDATAS}). Grave a seção fotos com gravarSecao antes de baixar mais: as que ela não citar saem.`,
    );
  }

  const baixadas = [];
  const falharam = [];
  let mudou = false;
  for (const id of pedidos) {
    if (jaGuardada(id)) {
      baixadas.push({ id, ...indice[id] });
      continue;
    }
    const alvo = await fotoDaOferta(sku, id);
    if (!alvo) {
      falharam.push({ id, motivo: NAO_E_DA_OFERTA });
      continue;
    }
    if (guardadas >= LIMITE_DE_CANDIDATAS) {
      falharam.push({ id, motivo: `limite de ${LIMITE_DE_CANDIDATAS} candidatas: grave a seção fotos antes` });
      continue;
    }
    let bytes;
    try {
      bytes = await baixar(alvo.url);
    } catch (erro) {
      falharam.push({ id, motivo: `não foi possível baixar (${erro?.message ?? "erro"})` });
      continue;
    }
    const padrao = await padronizarImagem(bytes);
    if (!padrao.ok) {
      falharam.push({ id, motivo: padrao.erro });
      continue;
    }
    const arquivo = `${randomUUID().replaceAll("-", "")}.jpg`;
    const destino = caminhoDaProposta(sku, arquivo);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, padrao.bytes);
    indice[id] = { arquivo, loja: alvo.loja, largura: padrao.largura, altura: padrao.altura };
    baixadas.push({ id, ...indice[id] });
    guardadas++;
    mudou = true;
  }
  if (mudou) await gravarIndiceDeCandidatas(sku, indice);
  return { baixadas, falharam };
}

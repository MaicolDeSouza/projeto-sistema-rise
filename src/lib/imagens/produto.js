import { readFile } from "node:fs/promises";

import { prisma } from "@/lib/db";
import { apagarArquivo, caminhoDe } from "@/lib/arquivos";
import { MAXIMO_IMAGENS } from "@/lib/limites";

import { baseValida, lerDoLote, moverImagensParaProduto } from "./lote";

/**
 * Aplica ao produto que JA EXISTE o que o painel de fotos deixou (pedido do dono em 21/09/2026: editar
 * um produto usa o mesmo painel do cadastro novo).
 *
 * O painel trabalha num lote temporario: as fotos do produto entram nele ao abrir a tela (padronizadas,
 * cada uma com o `arquivoId` da linha que a originou), as das referencias entram como candidatas, e o
 * dono ordena, escolhe, melhora e exclui. NADA disso toca o produto ate o Salvar, e e aqui que o Salvar
 * acontece. Antes, cada envio e cada exclusao gravavam na hora e nao tinham volta.
 *
 * Por foto, na ORDEM do painel (a primeira e a principal):
 *  - **mantida**: veio do produto e o arquivo do lote tem os mesmos bytes do que esta no disco (foto
 *    que ja estava no padrao: a padronizacao devolve os mesmos bytes). Nada e reescrito, so a ordem;
 *  - **substituida**: veio do produto e o arquivo do lote e outro (foto antiga fora do padrao, que a
 *    padronizacao refez, ou foto que o dono melhorou). O arquivo novo entra, a linha aponta para ele e o
 *    velho e apagado;
 *  - **nova**: veio das referencias ou do envio, nao tem `arquivoId`;
 *  - **removida**: estava no produto e nao esta mais no painel (o dono excluiu).
 *
 * `preservar` sao as fotos do produto que NAO puderam entrar no painel (arquivo ilegivel ou sumido):
 * ficam como estao e vao para o fim da ordem. Sem isso, o que nao carregou pareceria "excluido" e
 * seria apagado no Salvar.
 *
 * Ordem das operacoes, para uma falha nao deixar o produto sem foto: primeiro os arquivos novos
 * entram na pasta, depois as linhas mudam, e so no fim os arquivos velhos saem.
 *
 * SO AS FOTOS VALIDADAS FICAM (pedido do dono em 04/10/2026: ao salvar, apenas as imagens validadas serao
 * salvas e as demais serao excluidas). "Validada" e o check verde (`finalizada`), que o formulario manda
 * em cada foto. Foto com `finalizada: false` NAO entra no plano: se ja era do produto, cai em "removida"
 * (linha e arquivo apagados); se era candidata (referencias, envio), nunca chega a ser gravada.
 *
 * O que decide e o `false` EXPLICITO. Campo AUSENTE (`undefined`) quer dizer "o formulario nao sabe" e a
 * foto fica: um formulario aberto antes desta regra salva sem o campo, e tratar a falta como "nao
 * validada" apagaria as fotos de um produto inteiro. Por isso tambem a foto que ja estava salva volta
 * sempre como validada ao reabrir (ver `prepararFotosDoProduto`): salva = validada.
 *
 * @param {{ produto: { id: string, sku: string }, lote: string,
 *           itens: Array<{ base: string, arquivoId?: string, finalizada?: boolean }>,
 *           preservar?: string[] }} entrada
 */
export async function reconciliarImagensDoProduto({ produto, lote, itens, preservar = [] }) {
  const vistas = new Set();
  const lista = [];
  for (const item of Array.isArray(itens) ? itens : []) {
    if (!baseValida(item?.base) || vistas.has(item.base)) continue;
    vistas.add(item.base);
    lista.push({
      base: item.base,
      arquivoId: typeof item.arquivoId === "string" ? item.arquivoId : null,
      // So `false` de verdade tira a foto; qualquer outra coisa (ausente, texto) a mantem.
      validada: item.finalizada !== false,
    });
  }
  const validadas = lista.filter((item) => item.validada);
  const naoValidadas = lista.length - validadas.length;
  const escolhidas = validadas.slice(0, MAXIMO_IMAGENS);

  const atuais = await prisma.produtoArquivo.findMany({
    where: { produtoId: produto.id, tipo: "IMAGEM" },
    orderBy: { ordem: "asc" },
  });
  const porId = new Map(atuais.map((linha) => [linha.id, linha]));
  const preservadas = new Set((Array.isArray(preservar) ? preservar : []).filter((id) => porId.has(id)));

  // Decide o destino de cada foto do painel.
  const plano = [];
  for (const item of escolhidas) {
    const linha = item.arquivoId ? porId.get(item.arquivoId) : null;
    const doLote = await lerDoLote(lote, "imagens", `${item.base}.jpg`);

    if (linha) {
      if (!doLote) {
        // O lote perdeu a foto (limpeza de 24 h, outra aba): a do produto continua valendo.
        plano.push({ tipo: "mantida", linha, base: item.base });
        continue;
      }
      // Nome fora do formato do sistema (`caminhoDe` devolve null) ou arquivo sumido: nao ha o que
      // comparar, e a foto do painel entra no lugar.
      let noDisco = null;
      const caminho = caminhoDe(produto.sku, "IMAGEM", linha.arquivo);
      if (caminho) {
        try {
          noDisco = await readFile(caminho);
        } catch (erro) {
          if (erro.code !== "ENOENT") throw erro;
        }
      }
      plano.push({
        tipo: noDisco && noDisco.equals(doLote) ? "mantida" : "substituida",
        linha,
        base: item.base,
      });
    } else if (doLote) {
      plano.push({ tipo: "nova", base: item.base });
    }
    // Sem `arquivoId` e sem arquivo no lote: nao ha o que gravar.
  }

  // Passo 1: os arquivos novos entram na pasta do produto.
  const aMover = plano.filter((p) => p.tipo === "substituida" || p.tipo === "nova").map((p) => p.base);
  const movidas = aMover.length > 0 ? await moverImagensParaProduto(lote, produto.sku, aMover) : [];
  const porNome = new Map(movidas.map((m) => [m.nome, m]));

  // Passo 2: as linhas. Ordem do painel, e so a primeira e a principal.
  const naLista = new Set(plano.filter((p) => p.linha).map((p) => p.linha.id));
  const removidas = atuais.filter((linha) => !naLista.has(linha.id) && !preservadas.has(linha.id));
  const arquivosVelhos = removidas.map((linha) => linha.arquivo);
  // `naoValidadas`: as que o painel mandou sem o check e por isso ficaram de fora (as que ja eram do
  // produto tambem entram em `removidas`).
  const contagem = { mantidas: 0, substituidas: 0, novas: 0, removidas: removidas.length, naoValidadas };

  await prisma.$transaction(async (tx) => {
    for (const [posicao, passo] of plano.entries()) {
      const principal = posicao === 0;
      if (passo.tipo === "mantida") {
        contagem.mantidas++;
        await tx.produtoArquivo.update({ where: { id: passo.linha.id }, data: { ordem: posicao, principal } });
        continue;
      }

      const movida = porNome.get(`${passo.base}.jpg`);
      if (!movida) continue; // o arquivo sumiu do lote entre o plano e a mudanca: nada a gravar

      if (passo.tipo === "substituida") {
        contagem.substituidas++;
        arquivosVelhos.push(passo.linha.arquivo);
        await tx.produtoArquivo.update({
          where: { id: passo.linha.id },
          data: {
            arquivo: movida.nome,
            mimeType: movida.mimeType,
            tamanhoBytes: movida.tamanhoBytes,
            ordem: posicao,
            principal,
          },
        });
      } else {
        contagem.novas++;
        await tx.produtoArquivo.create({
          data: {
            produtoId: produto.id,
            tipo: "IMAGEM",
            principal,
            arquivo: movida.nome,
            nomeOriginal: null,
            mimeType: movida.mimeType,
            tamanhoBytes: movida.tamanhoBytes,
            ordem: posicao,
          },
        });
      }
    }

    // As que nao carregaram no painel ficam depois das outras, como estavam. Se o painel ficou vazio, a
    // primeira delas e a principal: o produto nao pode ficar com fotos e sem principal.
    let seguinte = plano.length;
    for (const linha of atuais) {
      if (!preservadas.has(linha.id) || naLista.has(linha.id)) continue;
      const primeira = seguinte === 0;
      await tx.produtoArquivo.update({
        where: { id: linha.id },
        data: { ordem: seguinte, principal: primeira },
      });
      seguinte++;
    }

    if (removidas.length > 0) {
      await tx.produtoArquivo.deleteMany({ where: { id: { in: removidas.map((linha) => linha.id) } } });
    }
  });

  // Passo 3: com as linhas ja apontando para os arquivos certos, os velhos saem.
  for (const nome of arquivosVelhos) await apagarArquivo(produto.sku, "IMAGEM", nome);

  return { ok: true, ...contagem };
}

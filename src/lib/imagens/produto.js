import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { prisma } from "@/lib/db";
import { apagarArquivo, caminhoDe } from "@/lib/arquivos";
import { MAXIMO_IMAGENS } from "@/lib/limites";

import { VERSOES, baseValida, lerDoLote, lerVersao, moverImagensParaProduto } from "./lote";
import { apagarDaReserva, gravarNaReserva, lerDaReserva } from "./reserva";

const impressao = (bytes) => createHash("sha1").update(bytes).digest("hex");

/** Os bytes de uma FOTO do produto no disco, ou null (nome fora do formato, arquivo sumido). */
async function bytesDaFoto(sku, nome) {
  const caminho = caminhoDe(sku, "IMAGEM", nome);
  if (!caminho) return null;
  try {
    return await readFile(caminho);
  } catch (erro) {
    if (erro.code === "ENOENT") return null;
    throw erro;
  }
}

/** As versoes guardadas no lote para a foto (`original`, `photoroom`, `nanobanana`), as que existirem. */
async function versoesDoItem(lote, base) {
  const achadas = [];
  for (const versao of VERSOES) {
    const bytes = await lerVersao(lote, base, versao);
    if (bytes) achadas.push({ versao, bytes });
  }
  return achadas;
}

/**
 * Aplica ao produto o que o painel de fotos deixou: e o Salvar das fotos, do produto que ja existe e (desde a
 * reserva) tambem do produto novo, que so nao tem linhas ainda (pedido do dono em 21/09/2026: editar usa o
 * mesmo painel do cadastro novo).
 *
 * O painel trabalha num lote temporario: as fotos do produto entram nele ao abrir a tela (padronizadas,
 * cada uma com o `arquivoId` da linha que a originou), as das referencias entram como candidatas, e o
 * dono ordena, escolhe, melhora e exclui. NADA disso toca o produto ate o Salvar.
 *
 * Por foto VALIDADA, na ORDEM do painel (a primeira e a principal):
 *  - **mantida**: veio do produto e o arquivo do lote tem os mesmos bytes do que esta no disco. Nada e
 *    reescrito, so a ordem (e a `versao` nao muda);
 *  - **substituida**: veio do produto e o arquivo do lote e outro (foto antiga padronizada, ou outra versao
 *    escolhida). O arquivo novo entra e a linha aponta para ele;
 *  - **nova**: veio das referencias, do envio ou da reserva, nao tem `arquivoId`;
 *  - **removida**: estava no produto e nao esta mais no painel (o dono excluiu).
 *
 * SO AS FOTOS VALIDADAS VIRAM FOTO (04/10/2026): o check verde (`finalizada`). O que decide e o `false`
 * EXPLICITO; campo ausente mantem a foto (um formulario aberto antes da regra salva sem o campo). A foto
 * salva volta validada ao reabrir: salva = validada.
 *
 * RESERVA (Nano Banana, 05/10/2026): o arquivo velho NAO e mais sempre apagado. Original e versoes geradas
 * que o dono pagou ou trabalhou descem para a reserva do produto (linha `papel: RESERVA`, arquivo em
 * reserva/), no mesmo `grupo` da foto:
 *  - o arquivo velho de uma substituida, quando a troca envolve uma versao gerada (a foto antiga so
 *    padronizada continua sendo apagada, como antes);
 *  - toda versao do lote (`versoes/`) diferente da foto final;
 *  - a foto PAGA sem validar (alguma versao photoroom/nanobanana no lote): nada entra no carrossel, e
 *    todas as versoes dela, inclusive a original, vao para a reserva. A geracao paga nunca some em silencio;
 *  - a FOTO que saiu da lista mas divide o grupo com uma foto validada que ficou (o dono trouxe outra
 *    versao da reserva): a mesma linha vira RESERVA.
 *  Nunca duas imagens iguais (sha1) no mesmo grupo: a RESERVA igual a foto final e apagada (o conteudo
 *  agora mora na FOTO), e nada novo e criado se o grupo ja tem aqueles bytes. `reservaExcluida` apaga
 *  RESERVA deste produto (linha e arquivo), e o que foi excluido nao e recriado a partir do lote.
 *
 * `preservar` sao as fotos do produto que NAO puderam entrar no painel (arquivo ilegivel ou sumido): ficam
 * como estao e vao para o fim da ordem. Sem isso, o que nao carregou pareceria "excluido".
 *
 * Ordem das operacoes, para uma falha nao deixar o produto sem foto: primeiro os arquivos novos entram (na
 * pasta de imagens e na reserva, sempre com nome novo), depois as linhas mudam numa transacao, e so no fim
 * os arquivos velhos saem.
 *
 * @param {{ produto: { id: string, sku: string }, lote: string,
 *           itens: Array<{ base: string, arquivoId?: string, finalizada?: boolean, versao?: string, grupo?: string }>,
 *           preservar?: string[], reservaExcluida?: string[] }} entrada
 */
export async function reconciliarImagensDoProduto({ produto, lote, itens, preservar = [], reservaExcluida = [] }) {
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
      // So rotulo: nenhuma regra de seguranca depende dele.
      versao: VERSOES.includes(item.versao) ? item.versao : "original",
      grupo: typeof item.grupo === "string" && item.grupo ? item.grupo : null,
    });
  }
  const validadas = lista.filter((item) => item.validada);
  const naoValidadas = lista.length - validadas.length;
  const escolhidas = validadas.slice(0, MAXIMO_IMAGENS);

  const [atuais, reservas] = await Promise.all([
    prisma.produtoArquivo.findMany({ where: { produtoId: produto.id, tipo: "IMAGEM", papel: "FOTO" }, orderBy: { ordem: "asc" } }),
    prisma.produtoArquivo.findMany({ where: { produtoId: produto.id, tipo: "IMAGEM", papel: "RESERVA" }, orderBy: { criadoEm: "asc" } }),
  ]);
  const porId = new Map(atuais.map((linha) => [linha.id, linha]));
  const preservadas = new Set((Array.isArray(preservar) ? preservar : []).filter((id) => porId.has(id)));
  const grupoDe = (linha) => linha.grupo ?? linha.id;
  const gruposConhecidos = new Set([...atuais, ...reservas].map(grupoDe));
  // O grupo de uma foto: o da linha dela; senao o que veio da tela, se for um grupo deste produto; senao um novo.
  const grupoDoItem = (item, linha) =>
    linha ? grupoDe(linha) : item.grupo && gruposConhecidos.has(item.grupo) ? item.grupo : randomUUID();

  // Impressoes por grupo: o que o grupo JA TEM (ou decidiu nao ter). Nada novo entra se o grupo ja tem os bytes.
  const doGrupo = new Map();
  const impressoesDo = (grupo) => {
    if (!doGrupo.has(grupo)) doGrupo.set(grupo, new Set());
    return doGrupo.get(grupo);
  };
  const impressaoDaReserva = new Map();
  for (const linha of reservas) {
    const bytes = await lerDaReserva(produto.sku, linha.arquivo);
    const marca = bytes ? impressao(bytes) : null;
    impressaoDaReserva.set(linha.id, marca);
    // Inclusive as excluidas agora: o que o dono tirou da reserva nao volta pelo lote.
    if (marca) impressoesDo(grupoDe(linha)).add(marca);
  }

  // Regra 7: excluir da reserva so vale para RESERVA deste produto.
  const idsExcluidos = new Set((Array.isArray(reservaExcluida) ? reservaExcluida : []).filter((id) => typeof id === "string"));
  const reservasExcluidas = reservas.filter((linha) => idsExcluidos.has(linha.id));
  const reservasQueFicam = reservas.filter((linha) => !idsExcluidos.has(linha.id));

  // Decide o destino de cada foto validada e os bytes finais dela.
  const plano = [];
  for (const item of escolhidas) {
    const linha = item.arquivoId ? porId.get(item.arquivoId) : null;
    const doLote = await lerDoLote(lote, "imagens", `${item.base}.jpg`);
    const grupo = grupoDoItem(item, linha);

    if (linha) {
      const noDisco = await bytesDaFoto(produto.sku, linha.arquivo);
      if (!doLote) {
        // O lote perdeu a foto (limpeza de 24 h, outra aba): a do produto continua valendo.
        plano.push({ tipo: "mantida", linha, item, grupo, final: noDisco });
        continue;
      }
      // Nome fora do formato do sistema ou arquivo sumido: nao ha o que comparar, e a foto do painel entra.
      const igual = Boolean(noDisco) && noDisco.equals(doLote);
      plano.push({ tipo: igual ? "mantida" : "substituida", linha, item, grupo, final: doLote, velho: igual ? null : noDisco });
    } else if (doLote) {
      plano.push({ tipo: "nova", item, grupo, final: doLote });
    }
    // Sem `arquivoId` e sem arquivo no lote: nao ha o que gravar.
  }

  // A foto final de cada grupo conta como "ja existe no grupo" antes de qualquer copia para a reserva.
  const finaisPorGrupo = new Map();
  for (const passo of plano) {
    if (!passo.final) continue;
    const marca = impressao(passo.final);
    impressoesDo(passo.grupo).add(marca);
    if (!finaisPorGrupo.has(passo.grupo)) finaisPorGrupo.set(passo.grupo, new Set());
    finaisPorGrupo.get(passo.grupo).add(marca);
  }

  // O que desce para a reserva: bytes novos a gravar, e FOTO que vira RESERVA (a mesma linha).
  const novasReservas = [];
  const virarReserva = [];
  const fotosApagadas = [];
  const candidata = (grupo, versao, bytes) => {
    if (!bytes) return;
    const marca = impressao(bytes);
    const conhecidas = impressoesDo(grupo);
    if (conhecidas.has(marca)) return;
    conhecidas.add(marca);
    novasReservas.push({ grupo, versao, bytes });
  };

  for (const passo of plano) {
    // O arquivo velho da substituida desce quando a troca envolve uma versao gerada.
    if (passo.tipo === "substituida" && (passo.linha.versao !== "original" || passo.item.versao !== "original")) {
      candidata(passo.grupo, passo.linha.versao, passo.velho);
    }
    // Toda versao guardada no lote diferente da foto final.
    for (const { versao, bytes } of await versoesDoItem(lote, passo.item.base)) candidata(passo.grupo, versao, bytes);
  }

  // Foto PAGA sem validar: tudo dela vai para a reserva; se era FOTO do produto, a linha sai.
  const pagasSemValidar = new Set();
  for (const item of lista.filter((i) => !i.validada)) {
    const versoes = await versoesDoItem(lote, item.base);
    if (!versoes.some((v) => v.versao !== "original")) continue;
    const linha = item.arquivoId ? porId.get(item.arquivoId) : null;
    const grupo = grupoDoItem(item, linha);
    for (const { versao, bytes } of versoes) candidata(grupo, versao, bytes);
    if (linha) {
      // A foto que estava no produto tambem nao some: se os bytes dela nao estao entre as versoes, descem.
      candidata(grupo, linha.versao, await bytesDaFoto(produto.sku, linha.arquivo));
      pagasSemValidar.add(linha.id);
    }
  }

  // FOTO fora da lista: desce para a reserva se divide o grupo com uma foto validada que ficou; senao foi
  // excluida na tela (ou era paga sem validar, ja copiada acima) e sai de vez.
  const naLista = new Set(plano.filter((p) => p.linha).map((p) => p.linha.id));
  const gruposQueFicam = new Set(plano.map((p) => p.grupo));
  for (const linha of atuais) {
    if (naLista.has(linha.id) || preservadas.has(linha.id)) continue;
    if (pagasSemValidar.has(linha.id) || !gruposQueFicam.has(grupoDe(linha))) {
      fotosApagadas.push(linha);
      continue;
    }
    const bytes = await bytesDaFoto(produto.sku, linha.arquivo);
    const conhecidas = impressoesDo(grupoDe(linha));
    if (!bytes || conhecidas.has(impressao(bytes))) {
      fotosApagadas.push(linha);
      continue;
    }
    conhecidas.add(impressao(bytes));
    virarReserva.push({ linha, bytes });
  }

  // A RESERVA igual a foto final do grupo sai: o conteudo agora mora na FOTO.
  const reservasRepetidas = reservasQueFicam.filter((linha) => finaisPorGrupo.get(grupoDe(linha))?.has(impressaoDaReserva.get(linha.id)));
  const reservasApagadas = [...reservasExcluidas, ...reservasRepetidas];

  // Passo 1: os arquivos novos entram (na pasta do produto e na reserva), antes de qualquer linha mudar.
  const aMover = plano.filter((p) => p.tipo === "substituida" || p.tipo === "nova").map((p) => p.item.base);
  const movidas = aMover.length > 0 ? await moverImagensParaProduto(lote, produto.sku, aMover) : [];
  const porNome = new Map(movidas.map((m) => [m.nome, m]));
  for (const reserva of novasReservas) reserva.gravada = await gravarNaReserva(produto.sku, reserva.bytes);
  for (const descida of virarReserva) descida.gravada = await gravarNaReserva(produto.sku, descida.bytes);

  // `naoValidadas`: as que o painel mandou sem o check e por isso ficaram de fora como FOTO.
  const contagem = {
    mantidas: 0,
    substituidas: 0,
    novas: 0,
    removidas: fotosApagadas.length,
    naoValidadas,
    reservadas: novasReservas.length + virarReserva.length,
    reservaExcluidas: reservasExcluidas.length,
  };
  const arquivosVelhos = fotosApagadas.map((linha) => linha.arquivo);

  // Passo 2: as linhas. Ordem do painel, e so a primeira e a principal.
  await prisma.$transaction(async (tx) => {
    for (const [posicao, passo] of plano.entries()) {
      const principal = posicao === 0;
      if (passo.tipo === "mantida") {
        contagem.mantidas++;
        await tx.produtoArquivo.update({ where: { id: passo.linha.id }, data: { ordem: posicao, principal, grupo: passo.grupo } });
        continue;
      }

      const movida = porNome.get(`${passo.item.base}.jpg`);
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
            versao: passo.item.versao,
            grupo: passo.grupo,
          },
        });
      } else {
        contagem.novas++;
        await tx.produtoArquivo.create({
          data: {
            produtoId: produto.id,
            tipo: "IMAGEM",
            papel: "FOTO",
            versao: passo.item.versao,
            grupo: passo.grupo,
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
      await tx.produtoArquivo.update({ where: { id: linha.id }, data: { ordem: seguinte, principal: seguinte === 0 } });
      seguinte++;
    }

    for (const reserva of novasReservas) {
      await tx.produtoArquivo.create({
        data: {
          produtoId: produto.id,
          tipo: "IMAGEM",
          papel: "RESERVA",
          versao: reserva.versao,
          grupo: reserva.grupo,
          principal: false,
          arquivo: reserva.gravada.nome,
          nomeOriginal: null,
          mimeType: reserva.gravada.mimeType,
          tamanhoBytes: reserva.gravada.tamanhoBytes,
          ordem: 0,
        },
      });
    }
    // A mesma linha muda de papel; o arquivo dela ja tem a copia na reserva, e o de imagens/ sai no fim.
    for (const { linha, gravada } of virarReserva) {
      arquivosVelhos.push(linha.arquivo);
      await tx.produtoArquivo.update({
        where: { id: linha.id },
        data: {
          papel: "RESERVA",
          grupo: grupoDe(linha),
          principal: false,
          ordem: 0,
          arquivo: gravada.nome,
          mimeType: gravada.mimeType,
          tamanhoBytes: gravada.tamanhoBytes,
        },
      });
    }

    const apagarLinhas = [...fotosApagadas, ...reservasApagadas].map((linha) => linha.id);
    if (apagarLinhas.length > 0) await tx.produtoArquivo.deleteMany({ where: { id: { in: apagarLinhas } } });
  });

  // Passo 3: com as linhas ja apontando para os arquivos certos, os velhos saem.
  for (const nome of arquivosVelhos) await apagarArquivo(produto.sku, "IMAGEM", nome);
  for (const linha of reservasApagadas) await apagarDaReserva(produto.sku, linha.arquivo);

  return { ok: true, ...contagem };
}

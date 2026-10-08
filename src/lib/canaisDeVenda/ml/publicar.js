import { readFile } from "node:fs/promises";

import { caminhoDe } from "@/lib/arquivos";
import { prisma } from "@/lib/db";
import { buscarNoBling } from "@/lib/blingSync/leitura";
import { carregarAnuncioML, gravarPublicacao, lerPublicacao } from "./banco";
import { conferirKitNoBling, criarKitNoBling, vincularNoBlingML, vinculoNoBlingML } from "./bling";
import { etapasDoAnuncio, proximaEtapa } from "./etapas";
import { lerCategoriaCompleta, textoDoErroML } from "./leitura";
import { nomeDaFoto, montarPayloadML } from "./payload";
import { causasDoML, corpoDaCriacao, situacaoDoItem, textoDaRecusaML } from "./respostas";
import { validarRascunhoML } from "./validacao";

/**
 * O Publicar do anuncio do Mercado Livre (fase 3, plano de 08/10/2026). Recebe `{ ml, bling }` por
 * parametro (`clienteML()` e `clienteBling()`, ou os falsos do teste) e nunca lanca para a tela.
 */

const CATEGORIA_ML = /^MLB\d+$/;

/**
 * Le tudo o que a publicacao precisa e confere se ela pode comecar. So LEITURA: nada e escrito no ML,
 * no Bling nem no banco. Devolve os motivos todos juntos (a tela mostra a lista), e o que a publicacao
 * usa depois (`interno`).
 */
async function prepararInterno(anuncioId, { ml, bling }) {
  const carregado = await carregarAnuncioML(anuncioId);
  if (!carregado.ok) return { ok: false, motivos: [carregado.erro], incerta: false, proxima: null };

  const { rascunho, status } = carregado;
  const { publicacao } = await lerPublicacao(anuncioId);
  const kit = rascunho.composicao ?? null;
  const etapas = etapasDoAnuncio({ kit: Boolean(kit) });
  const base = { incerta: Boolean(publicacao?.incerta), proxima: proximaEtapa(publicacao, etapas) };
  if (status === "PUBLICADO") return { ok: false, motivos: ["O anúncio já está publicado."], ...base };

  const motivos = [];
  // A validacao roda aqui, no servidor, com a categoria lida agora: a da tela pode ser velha.
  const contexto = { ...carregado.contexto };
  const categoriaId = String(rascunho.categoriaId ?? "").trim();
  if (CATEGORIA_ML.test(categoriaId)) {
    try {
      contexto.categoria = await lerCategoriaCompleta(ml, categoriaId);
      if (!contexto.categoria) motivos.push(`A categoria ${categoriaId} não existe no Mercado Livre.`);
    } catch (erro) {
      motivos.push(`Não foi possível conferir a categoria no Mercado Livre: ${textoDoErroML(erro)}`);
    }
  }
  for (const problema of validarRascunhoML(rascunho, contexto)) {
    if (problema.bloqueante) motivos.push(problema.problema);
  }

  const principal = contexto.produtos[rascunho.produtoId];
  const codigo = kit ? String(kit.codigo ?? "").trim() : String(principal?.sku ?? "").trim();
  let resumoDoKit = null;
  let outrosVinculos = [];

  if (kit) {
    const itens = (kit.itens ?? []).map((item) => ({ sku: contexto.produtos[item.produtoId]?.sku, quantidade: Number(item.quantidade) }));
    if (codigo && itens.every((item) => item.sku)) {
      const conferido = await conferirKitNoBling(bling, { codigo, itens });
      if (conferido.situacao === "criar" || conferido.situacao === "igual") {
        resumoDoKit = { codigo, situacao: conferido.situacao, itens };
      } else if (conferido.situacao === "diferente") {
        motivos.push(`O kit ${codigo} já existe no Bling com outras peças (${conferido.diferencas.join("; ")}). Vincular baixaria o estoque dos produtos errados: use outro código ou corrija o kit no Bling.`);
      } else {
        motivos.push(conferido.erro);
      }
    }
  } else if (codigo) {
    try {
      const busca = await buscarNoBling(bling, codigo);
      if (busca.situacao === "nao_existe") {
        motivos.push(`O produto ${codigo} não está entre os produtos ativos do Bling: o anúncio precisa dele para o estoque e as vendas.`);
      } else if (busca.situacao === "duplicado") {
        motivos.push(`O código ${codigo} aparece ${busca.quantidade} vezes no Bling: deixe só um.`);
      } else {
        // Produto com composicao do cadastro: no Bling ele tem que ser kit, senao a venda nao baixa as pecas.
        const doRise = await prisma.produto.findUnique({ where: { id: rascunho.produtoId }, select: { tipo: true } });
        if (doRise?.tipo === "COMPOSICAO" && busca.produto?.formato !== "E") {
          motivos.push(`O kit ${codigo} é produto simples no Bling: o estoque das peças não baixaria. Cadastre a composição no Bling antes de publicar.`);
        }
        const vinculo = await vinculoNoBlingML(bling, codigo, publicacao?.itemId ?? "");
        outrosVinculos = vinculo.outros ?? [];
      }
    } catch (erro) {
      motivos.push(`Não foi possível conferir o produto no Bling: ${erro?.message ?? erro}`);
    }
  }

  const payload = montarPayloadML(rascunho, contexto);
  const resumo = {
    familyName: payload.item.family_name,
    preco: Number(rascunho.preco ?? 0),
    estoque: Number(rascunho.estoque ?? 0),
    tipoAnuncio: rascunho.tipoAnuncio,
    fotos: Array.isArray(rascunho.imagens) ? rascunho.imagens.length : 0,
    codigo,
    kit: resumoDoKit,
    outrosVinculos,
  };
  return {
    ok: motivos.length === 0,
    motivos,
    resumo,
    ...base,
    interno: { rascunho, contexto, payload, codigo, publicacao, etapas, principal },
  };
}

/**
 * A pre-checagem e o resumo da janela de confirmacao do Publicar. So leitura.
 * @returns {Promise<{ ok: boolean, motivos: string[], resumo?: object, proxima: string|null, incerta: boolean }>}
 */
export async function prepararPublicacaoML(anuncioId, clientes) {
  try {
    const { interno: _interno, ...publico } = await prepararInterno(anuncioId, clientes);
    return publico;
  } catch (erro) {
    console.error("[ml publicar]", erro);
    return { ok: false, motivos: [`Não foi possível conferir o anúncio: ${erro?.message ?? erro}`], proxima: null, incerta: false };
  }
}

// ---------------------------------------------------------------------------
// Publicar: as etapas, gravadas uma a uma, e a retomada
// ---------------------------------------------------------------------------

/// Uma publicacao por anuncio de cada vez, neste processo (o mesmo molde da sincronizacao do Bling).
const emAndamento = new Set();

const RECADO_INCERTA =
  "A criação do anúncio pode ter chegado ao Mercado Livre sem resposta. Confira em Anúncios > Pausados; se não estiver lá, use Criar de novo.";

/// A foto do produto no disco (`dados/produtos/<SKU>/imagens/<arquivo>`).
async function lerFotoDoDisco(sku, arquivo) {
  const caminho = caminhoDe(sku, "IMAGEM", arquivo);
  if (!caminho) throw new Error(`caminho inválido para a foto ${arquivo}`);
  return readFile(caminho);
}

const tipoDaFoto = (arquivo) => (/\.png$/i.test(String(arquivo)) ? "image/png" : "image/jpeg");
const textoDe = (erro) => erro?.message ?? String(erro);

/// O NCM, o CEST e a origem do produto principal, so os digitos (o formato que o Bling recebe do Rise).
async function fiscalDoPrincipal(produtoId) {
  const produto = await prisma.produto.findUnique({ where: { id: produtoId }, select: { ncm: true, cest: true, origem: true } });
  const digitos = (valor) => String(valor ?? "").replace(/\D/g, "") || null;
  return { ncm: digitos(produto?.ncm), cest: digitos(produto?.cest), origem: produto?.origem ?? null };
}

/**
 * Publica o anuncio, ou continua de onde parou ("Retomar publicacao", "Verificar no Bling"). Uma volta
 * so: para na primeira falha, grava o erro e a etapa, e nunca tenta de novo sozinha.
 *
 * Ordem: pre-checagem (so leitura) -> as duas travas (ML e Bling) ANTES de qualquer escrita -> fotos
 * -> validar -> criar pausado -> pausar (se o ML criou ativo) -> descricao -> kit no Bling (so
 * composicao) -> vinculo no Bling -> ativar -> gravar. Enquanto o item nao existe no ML, fotos e
 * validacao rodam de novo (o rascunho pode ter mudado); as fotos ja subidas nao sobem de novo.
 *
 * @param {object} opcoes
 * @param {boolean} [opcoes.recriar] o dono conferiu no ML que a criacao incerta nao chegou la.
 * @param {"validar"|null} [opcoes.ate] "validar" para depois do validador (o "Validar no ML").
 * @param {(sku: string, arquivo: string) => Promise<Buffer>} [opcoes.lerFoto] injetavel no teste.
 */
export async function publicarAnuncioML(anuncioId, { ml, bling, recriar = false, ate = null, lerFoto = lerFotoDoDisco } = {}) {
  if (emAndamento.has(anuncioId)) return { ok: false, etapa: null, feitas: [], erro: "Publicação em andamento." };
  emAndamento.add(anuncioId);
  try {
    return await publicarUmaVolta(anuncioId, { ml, bling, recriar, ate, lerFoto });
  } catch (erro) {
    console.error("[ml publicar]", erro);
    return { ok: false, etapa: null, feitas: [], erro: `Não foi possível publicar: ${textoDe(erro)}` };
  } finally {
    emAndamento.delete(anuncioId);
  }
}

/** "Validar no ML": sobe as fotos que faltam e roda o validador, sem criar nada e sem mudar o status. */
export function validarNoML(anuncioId, clientes) {
  return publicarAnuncioML(anuncioId, { ...clientes, ate: "validar" });
}

async function publicarUmaVolta(anuncioId, { ml, bling, recriar, ate, lerFoto }) {
  const soValidar = ate === "validar";
  const preparado = await prepararInterno(anuncioId, { ml, bling });
  if (!preparado.ok) {
    return { ok: false, etapa: null, feitas: preparado.interno?.publicacao?.feitas ?? [], erro: preparado.motivos.join(" "), motivos: preparado.motivos };
  }
  const { rascunho, payload, codigo, etapas, principal, contexto } = preparado.interno;
  let pub = preparado.interno.publicacao ?? { feitas: [], fotos: {}, itemId: null, statusML: null, incerta: false };
  if (pub.incerta && !recriar && !soValidar) return { ok: false, etapa: "criar", feitas: pub.feitas ?? [], erro: RECADO_INCERTA, incerta: true };
  // Com o item ja criado, as etapas de validar ficam para tras: "Validar no ML" seguiria direto para a
  // descricao, o vinculo e a ativacao, e publicaria sem o dono pedir.
  if (soValidar && pub.itemId) {
    return { ok: false, etapa: null, feitas: pub.feitas ?? [], erro: "O anúncio já existe no Mercado Livre (pausado): não há o que validar. Use Retomar publicação." };
  }

  // As duas travas antes da primeira escrita: a recusa nao pode deixar meia publicacao.
  try {
    ml.exigirEscrita(codigo);
    bling.exigirEscrita(codigo);
  } catch (erro) {
    return { ok: false, etapa: null, feitas: pub.feitas ?? [], erro: textoDe(erro) };
  }

  const gravar = async (parcial, colunas = {}, opcoes = {}) => {
    pub = await gravarPublicacao(anuncioId, parcial, colunas, opcoes);
    return pub;
  };
  const marcar = (etapa) => gravar({ feitas: [...new Set([...(pub.feitas ?? []), etapa])] });
  const falhar = async (etapa, erro, { incerta = false, aguardandoBling = false, avisos } = {}) => {
    if (!soValidar) {
      await gravar({ erro, etapaComErro: etapa, ...(incerta ? { incerta: true } : {}) }, { status: aguardandoBling ? "PUBLICANDO" : "ERRO", erro });
    }
    return {
      ok: false,
      etapa,
      feitas: pub.feitas ?? [],
      erro,
      ...(incerta ? { incerta: true } : {}),
      ...(avisos?.length ? { avisos } : {}),
      ...(pub.itemId ? { itemId: pub.itemId } : {}),
    };
  };

  if (!soValidar) await gravar({ erro: null, etapaComErro: null, ...(recriar ? { incerta: false } : {}) }, { status: "PUBLICANDO", erro: null });

  // Sem item no ML, fotos e validacao rodam sempre: o rascunho pode ter mudado desde a ultima volta.
  const feitas = new Set(pub.itemId ? (pub.feitas ?? []) : []);
  const ids = Array.isArray(rascunho.imagens) ? rascunho.imagens : [];
  const corpo = () => corpoDaCriacao(payload.item, ids.map((id) => pub.fotos?.[id]));
  let avisos = [];

  for (const etapa of etapas) {
    if (feitas.has(etapa)) continue;

    if (etapa === "fotos") {
      const arquivos = await prisma.produtoArquivo.findMany({ where: { id: { in: ids } }, select: { id: true, arquivo: true, produto: { select: { sku: true } } } });
      const porId = new Map(arquivos.map((arquivo) => [arquivo.id, arquivo]));
      for (const [indice, id] of ids.entries()) {
        if (pub.fotos?.[id]) continue;
        const arquivo = porId.get(id);
        if (!arquivo) return falhar(etapa, `A foto ${indice + 1} não foi encontrada (pode ter sido excluída do produto). Ajuste a aba Imagens.`);
        let resposta;
        try {
          const bytes = await lerFoto(arquivo.produto.sku, arquivo.arquivo);
          resposta = await ml.upload("/pictures/items/upload", { bytes, nome: nomeDaFoto(payload.item.family_name, indice), tipo: tipoDaFoto(arquivo.arquivo) });
        } catch (erro) {
          return falhar(etapa, `Falha ao enviar a foto ${indice + 1}: ${textoDe(erro)}`);
        }
        if (!resposta?.ok || !resposta.dados?.id) return falhar(etapa, textoDaRecusaML(resposta, `a foto ${indice + 1}`));
        // Gravada a cada foto: uma queda no meio nao perde as que ja subiram.
        await gravar({ fotos: { [id]: resposta.dados.id } });
      }
    } else if (etapa === "validar") {
      let resposta;
      try {
        resposta = await ml.post("/items/validate", corpo());
      } catch (erro) {
        return falhar(etapa, `Falha ao falar com o Mercado Livre: ${textoDe(erro)}`);
      }
      const causas = causasDoML(resposta?.dados);
      avisos = causas.avisos;
      // O validador responde 400 "Validation error" mesmo quando TODAS as causas sao avisos (medido no
      // primeiro envio real, 08/10/2026: "User has not mode me1", "Mandatory free shipping added"). Aviso
      // nao bloqueia: so barra o 400 com causa de erro (ou sem causa nenhuma). O POST /items decide no fim.
      if (!resposta?.ok && causas.erros.length > 0) return falhar(etapa, textoDaRecusaML(resposta, "o anúncio na validação"), { avisos });
      if (soValidar) {
        await marcar(etapa);
        return { ok: true, etapa, feitas: pub.feitas, ...(avisos.length ? { avisos } : {}) };
      }
    } else if (etapa === "criar") {
      const corpoDoItem = corpo();
      await gravar({ incerta: false }, { payloadEnviado: corpoDoItem });
      let resposta;
      try {
        resposta = await ml.post("/items", corpoDoItem);
      } catch (erro) {
        return falhar(etapa, `${RECADO_INCERTA} (${textoDe(erro)})`, { incerta: true });
      }
      if (resposta?.status >= 500) return falhar(etapa, `${RECADO_INCERTA} (HTTP ${resposta.status})`, { incerta: true });
      if (!resposta?.ok || !resposta.dados?.id) return falhar(etapa, textoDaRecusaML(resposta, "a criação do anúncio"));
      await gravar(
        { itemId: resposta.dados.id, permalink: resposta.dados.permalink ?? null, statusML: resposta.dados.status ?? null, incerta: false },
        { idExterno: resposta.dados.id, urlExterna: resposta.dados.permalink ?? null, situacaoCanal: situacaoDoItem(resposta.dados.status) },
      );
    } else if (etapa === "pausar") {
      if (pub.statusML !== "paused") {
        let resposta;
        try {
          resposta = await ml.put(`/items/${pub.itemId}`, { status: "paused" });
        } catch (erro) {
          return falhar(etapa, `Falha ao pausar o anúncio ${pub.itemId}: ${textoDe(erro)}. Pause-o no Mercado Livre se ele aparecer ativo.`);
        }
        if (!resposta?.ok) return falhar(etapa, textoDaRecusaML(resposta, `a pausa do anúncio ${pub.itemId}`));
        const status = resposta.dados?.status ?? "paused";
        await gravar({ statusML: status }, { situacaoCanal: situacaoDoItem(status) });
      }
    } else if (etapa === "descricao") {
      let resposta;
      try {
        resposta = await ml.post(`/items/${pub.itemId}/description`, { plain_text: payload.descricao.plain_text });
      } catch (erro) {
        return falhar(etapa, `Falha ao enviar a descrição: ${textoDe(erro)}`);
      }
      if (!resposta?.ok) return falhar(etapa, textoDaRecusaML(resposta, "a descrição"));
    } else if (etapa === "kit_bling") {
      const itens = (rascunho.composicao?.itens ?? []).map((item) => ({ sku: contexto.produtos[item.produtoId]?.sku, quantidade: Number(item.quantidade) }));
      const conferido = await conferirKitNoBling(bling, { codigo, itens });
      let id = conferido.situacao === "igual" ? conferido.id : null;
      if (conferido.situacao === "criar") {
        const criado = await criarKitNoBling(bling, {
          codigo,
          titulo: payload.item.family_name,
          preco: rascunho.preco,
          envio: rascunho.envio,
          principal: await fiscalDoPrincipal(principal?.id ?? rascunho.produtoId),
          itens,
        });
        if (!criado.ok) return falhar(etapa, `Aguardando o kit no Bling: ${criado.erro}`, { aguardandoBling: true });
        id = criado.id;
      } else if (!id) {
        const motivo = conferido.situacao === "diferente" ? `o kit ${codigo} existe no Bling com outras peças (${conferido.diferencas.join("; ")})` : conferido.erro;
        return falhar(etapa, `Aguardando o kit no Bling: ${motivo}`, { aguardandoBling: true });
      }
      await gravar({ blingKitId: id }, {}, { blingProdutoId: String(id) });
    } else if (etapa === "vinculo") {
      const vinculo = await vincularNoBlingML(bling, codigo, pub.itemId, rascunho.preco);
      if (!vinculo.ok) return falhar(etapa, vinculo.erro ?? "Não foi possível vincular o anúncio no Bling.");
    } else if (etapa === "ativar") {
      let resposta;
      try {
        resposta = await ml.put(`/items/${pub.itemId}`, { status: "active" });
      } catch (erro) {
        return falhar(etapa, `Falha ao ativar o anúncio ${pub.itemId}: ${textoDe(erro)}. Confira no Mercado Livre antes de tentar de novo.`);
      }
      if (!resposta?.ok) return falhar(etapa, textoDaRecusaML(resposta, `a ativação do anúncio ${pub.itemId}`));
      await gravar({ statusML: resposta.dados?.status ?? "active" });
    } else if (etapa === "gravar") {
      await gravar(
        { feitas: [...new Set([...(pub.feitas ?? []), "gravar"])], erro: null, etapaComErro: null },
        { status: "PUBLICADO", situacaoCanal: situacaoDoItem(pub.statusML), publicadoEm: new Date(), erro: null },
      );
      return { ok: true, etapa, feitas: pub.feitas, itemId: pub.itemId, permalink: pub.permalink, ...(avisos.length ? { avisos } : {}) };
    }
    await marcar(etapa);
  }
  return { ok: true, etapa: null, feitas: pub.feitas ?? [], itemId: pub.itemId, permalink: pub.permalink };
}

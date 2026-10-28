import { readFile } from "node:fs/promises";

import { caminhoDe } from "@/lib/arquivos";
import { prisma } from "@/lib/db";
import { buscarNoBling } from "@/lib/blingSync/leitura";
import { conteudoAtualDoAnuncio } from "./acompanhar";
import { carregarAnuncioML, gravarPublicacao, lerPublicacao } from "./banco";
import { impressaoDoConteudo } from "./impressao";
import { conferirKitNoBling, criarKitNoBling, registrarAnuncioNoBlingML, vincularNoBlingML, vinculoNoBlingML } from "./bling";
import { ETAPAS, etapasDoAnuncio, proximaEtapa } from "./etapas";
import { iniciarProgressoML } from "./progresso";
import { ROTULO_DA_PARTE, atributosDaRetomada, impressaoDaCriacao, partesMudadas } from "./criadoCom";
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
  // Anuncio simples leva TODAS as fotos validadas do produto (spec 2026-10-24): acima do que a categoria aceita, vao as
  // primeiras, em vez de recusar o Publicar. O kit continua com as fotos que o dono escolheu (a validacao confere).
  const maxFotos = Number(contexto.categoria?.maxFotos);
  if (!rascunho.composicao && maxFotos > 0 && Array.isArray(rascunho.imagens)) rascunho.imagens = rascunho.imagens.slice(0, maxFotos);
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
        // Outros anuncios do mesmo produto no Bling: so informacao para a janela (o vinculo produto-loja e um
        // so e e reaproveitado; cada anuncio e registrado a parte em /anuncios).
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

/// Uma publicacao por anuncio de cada vez, neste processo (o mesmo molde da sincronizacao do Bling). O "Enviar mudancas
/// ao ML" (atualizar.js) usa a mesma trava: os dois escrevem no mesmo item.
export const emAndamento = new Set();

const RECADO_INCERTA =
  "A criação do anúncio pode ter chegado ao Mercado Livre sem resposta. Confira em Anúncios > Pausados; se não estiver lá, use Criar de novo.";

/// A foto do produto no disco (`dados/produtos/<SKU>/imagens/<arquivo>`).
export async function lerFotoDoDisco(sku, arquivo) {
  const caminho = caminhoDe(sku, "IMAGEM", arquivo);
  if (!caminho) throw new Error(`caminho inválido para a foto ${arquivo}`);
  return readFile(caminho);
}

export const tipoDaFoto = (arquivo) => (/\.png$/i.test(String(arquivo)) ? "image/png" : "image/jpeg");
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
  // O andamento etapa por etapa para o popup do editor (pedido do dono em 27/10/2026: "igual a LI, mostrando as etapas"),
  // na mesma memoria e na mesma rota do "Sincronizar com o ML". O "Validar no ML" nao abre andamento.
  const progresso = ate === "validar" ? SEM_PROGRESSO : iniciarProgressoML(anuncioId, ["preparar", "atualizar", ...ETAPAS]);
  let resultado;
  try {
    resultado = await publicarUmaVolta(anuncioId, { ml, bling, recriar, ate, lerFoto, progresso });
  } catch (erro) {
    console.error("[ml publicar]", erro);
    resultado = { ok: false, etapa: null, feitas: [], erro: `Não foi possível publicar: ${textoDe(erro)}` };
  } finally {
    emAndamento.delete(anuncioId);
  }
  // A etapa que estava andando leva o motivo (a pre-checagem, as travas ou a etapa que falhou).
  if (!resultado.ok) progresso.falhou(resultado.erro);
  progresso.fim();
  return resultado;
}

/// O "Validar no ML" nao mostra andamento: as marcas viram nada.
const SEM_PROGRESSO = { andando() {}, feita() {}, falhou() {}, fim() {} };

/** O ML recusou ativar porque o anuncio esta sem estoque (a causa vem em ingles: "...without stock"). */
export function recusaPorFaltaDeEstoque(resposta) {
  return /without stock|sem estoque|out of stock/i.test(JSON.stringify(resposta?.dados ?? ""));
}

/** "Validar no ML": sobe as fotos que faltam e roda o validador, sem criar nada e sem mudar o status. */
export function validarNoML(anuncioId, clientes) {
  return publicarAnuncioML(anuncioId, { ...clientes, ate: "validar" });
}

async function publicarUmaVolta(anuncioId, { ml, bling, recriar, ate, lerFoto, progresso = SEM_PROGRESSO }) {
  const soValidar = ate === "validar";
  progresso.andando("preparar");
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

  progresso.feita("preparar");

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

  // Retomar com o item JA criado no ML (pedido do dono em 27/10/2026, Opcao 1): o editor deixa mexer de novo no que o ML
  // aceita trocar, e aqui vai so o que mudou desde a criacao (preco, ficha, fotos, peso e medidas), antes das etapas que
  // faltam. Para na primeira parte que falha; a impressao avanca parte a parte (uma queda no meio nao reenvia o que ja foi).
  if (pub.itemId && !soValidar) {
    progresso.andando("atualizar");
    const agora = impressaoDaCriacao(payload, rascunho.imagens);
    const partes = partesMudadas(pub.criadoCom ?? null, agora);
    const { ficha, pacote } = atributosDaRetomada(payload);
    let criadoCom = { ...(pub.criadoCom ?? {}) };
    for (const parte of partes) {
      let resposta;
      try {
        if (parte === "preco") {
          // Num PUT so dele: junto com outros campos o ML ignora o preco (ver atualizar.js).
          resposta = await ml.put(`/items/${pub.itemId}`, { price: payload.item.price });
        } else if (parte === "ficha") {
          resposta = await ml.put(`/items/${pub.itemId}`, { attributes: ficha });
        } else if (parte === "pacote") {
          resposta = await ml.put(`/items/${pub.itemId}`, { attributes: pacote });
        } else if (parte === "prazo") {
          resposta = await ml.put(`/items/${pub.itemId}`, { sale_terms: payload.item.sale_terms ?? [] });
        } else if (parte === "fotos") {
          const ids = Array.isArray(rascunho.imagens) ? rascunho.imagens : [];
          const faltam = ids.filter((id) => !pub.fotos?.[id]);
          const arquivos = await prisma.produtoArquivo.findMany({ where: { id: { in: faltam } }, select: { id: true, arquivo: true, produto: { select: { sku: true } } } });
          const porId = new Map(arquivos.map((arquivo) => [arquivo.id, arquivo]));
          for (const [indice, id] of ids.entries()) {
            if (pub.fotos?.[id]) continue;
            const arquivo = porId.get(id);
            if (!arquivo) return falhar("atualizar", `A foto ${indice + 1} não foi encontrada (pode ter sido excluída). Ajuste a aba Imagens.`);
            const subida = await ml.upload("/pictures/items/upload", { bytes: await lerFoto(arquivo.produto.sku, arquivo.arquivo), nome: nomeDaFoto(payload.item.family_name, indice), tipo: tipoDaFoto(arquivo.arquivo) });
            if (!subida?.ok || !subida.dados?.id) return falhar("atualizar", textoDaRecusaML(subida, `a foto ${indice + 1}`));
            await gravar({ fotos: { [id]: subida.dados.id } });
          }
          resposta = await ml.put(`/items/${pub.itemId}`, { pictures: ids.map((id) => ({ id: pub.fotos?.[id] })) });
        }
      } catch (erro) {
        return falhar("atualizar", `Falha ao atualizar ${ROTULO_DA_PARTE[parte]} no Mercado Livre: ${textoDe(erro)}`);
      }
      if (!resposta?.ok) return falhar("atualizar", textoDaRecusaML(resposta, ROTULO_DA_PARTE[parte]));
      criadoCom = { ...criadoCom, [parte]: agora[parte] };
      await gravar({ criadoCom });
    }
    progresso.feita("atualizar", partes.length > 0 ? partes.map((parte) => ROTULO_DA_PARTE[parte]).join(", ") : "nada mudou");
  }

  // Retomar: as etapas ja feitas numa volta anterior aparecem concluidas no popup.
  for (const etapa of feitas) progresso.feita(etapa, "já feita");
  for (const etapa of etapas) {
    if (feitas.has(etapa)) continue;
    progresso.andando(etapa);

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
        // `criadoCom`: o que foi na criacao, para o Retomar mandar so o que mudar depois (27/10/2026).
        { itemId: resposta.dados.id, permalink: resposta.dados.permalink ?? null, statusML: resposta.dados.status ?? null, incerta: false, criadoCom: impressaoDaCriacao(payload, rascunho.imagens) },
        { idExterno: resposta.dados.id, urlExterna: resposta.dados.permalink ?? null, situacaoCanal: situacaoDoItem(resposta.dados.status) },
      );
      // O anuncio existe no ML: a marca "Nao anunciar no ML" do produto deixa de valer e o X do icone sai (pedido do dono em
      // 28/10/2026). SQL cru, sem subir o `atualizadoEm` (a lista de Produtos ordena por ele). Falha aqui nao para a publicacao.
      try {
        await prisma.$executeRaw`UPDATE "Produto" SET "naoAnunciarEm" = array_remove("naoAnunciarEm", 'MERCADO_LIVRE'::"Canal") WHERE id = ${rascunho.produtoId} AND 'MERCADO_LIVRE'::"Canal" = ANY("naoAnunciarEm")`;
      } catch (erro) {
        console.error("[ml publicar] tirar o Nao anunciar", erro);
      }
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
      if (!vinculo.ok) return falhar(etapa, vinculo.erro ?? "Não foi possível vincular o produto à loja no Bling.");
    } else if (etapa === "registrar_bling") {
      // O registro do anuncio no Bling (/anuncios), um por MLB: e o que deixa varios anuncios do mesmo
      // produto com o estoque no Bling. O produto e achado pelo codigo, na hora (no kit, o codigo do kit).
      let busca;
      try {
        busca = await buscarNoBling(bling, codigo);
      } catch (erro) {
        return falhar(etapa, `Não foi possível achar o produto ${codigo} no Bling: ${textoDe(erro)}`);
      }
      if (busca.situacao !== "existe") return falhar(etapa, `O produto ${codigo} não foi achado entre os produtos ativos do Bling para registrar o anúncio.`);
      const registro = await registrarAnuncioNoBlingML(bling, { codigo, idProduto: busca.id, itemId: pub.itemId, titulo: payload.item.family_name, preco: rascunho.preco, tipoAnuncio: rascunho.tipoAnuncio });
      if (!registro.ok) return falhar(etapa, registro.erro ?? "Não foi possível registrar o anúncio no Bling.");
      await gravar({ blingAnuncioId: registro.id });
    } else if (etapa === "ativar") {
      // SEM ESTOQUE o ML recusa ativar ("Is not possible to activate an item without stock"). Opcao 2 do dono em
      // 24/10/2026: a publicacao conclui com o anuncio PAUSADO e marcado `aguardandoEstoque`, e o worker o ativa quando
      // o ML mostrar estoque no anuncio (`ativarAnunciosAguardandoEstoque`). O anuncio ja esta criado e vinculado.
      const aguardarEstoque = async () => {
        await gravar({ statusML: "paused", aguardandoEstoque: true });
        avisos = [...avisos, `Sem estoque: o anúncio ${pub.itemId} ficou pausado e será ativado sozinho quando o estoque chegar ao Mercado Livre.`];
      };
      if (!(Number(rascunho.estoque) > 0)) {
        await aguardarEstoque();
      } else {
        let resposta;
        try {
          resposta = await ml.put(`/items/${pub.itemId}`, { status: "active" });
        } catch (erro) {
          return falhar(etapa, `Falha ao ativar o anúncio ${pub.itemId}: ${textoDe(erro)}. Confira no Mercado Livre antes de tentar de novo.`);
        }
        if (!resposta?.ok && recusaPorFaltaDeEstoque(resposta)) await aguardarEstoque();
        else if (!resposta?.ok) return falhar(etapa, textoDaRecusaML(resposta, `a ativação do anúncio ${pub.itemId}`));
        else await gravar({ statusML: resposta.dados?.status ?? "active", aguardandoEstoque: false });
      }
    } else if (etapa === "gravar") {
      // A impressao do que foi ao ML (spec 2026-10-24): e com ela que a lista acende o "!" quando o produto mudar. As
      // fotos sao as do PRODUTO, sem o corte da categoria: senao o anuncio cortado nasceria "para tras" do produto.
      const enviado = { ...impressaoDoConteudo(conteudoAtualDoAnuncio(rascunho, contexto.produtos)), em: new Date().toISOString() };
      await gravar(
        { feitas: [...new Set([...(pub.feitas ?? []), "gravar"])], erro: null, etapaComErro: null, enviado },
        { status: "PUBLICADO", situacaoCanal: situacaoDoItem(pub.statusML), publicadoEm: new Date(), erro: null },
        { apagarProposta: true },
      );
      progresso.feita(etapa);
      return { ok: true, etapa, feitas: pub.feitas, itemId: pub.itemId, permalink: pub.permalink, ...(avisos.length ? { avisos } : {}) };
    }
    await marcar(etapa);
    progresso.feita(etapa);
  }
  return { ok: true, etapa: null, feitas: pub.feitas ?? [], itemId: pub.itemId, permalink: pub.permalink };
}

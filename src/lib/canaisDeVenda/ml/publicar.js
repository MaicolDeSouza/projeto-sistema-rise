import { prisma } from "@/lib/db";
import { buscarNoBling } from "@/lib/blingSync/leitura";
import { carregarAnuncioML, lerPublicacao } from "./banco";
import { conferirKitNoBling, vinculoNoBlingML } from "./bling";
import { etapasDoAnuncio, proximaEtapa } from "./etapas";
import { lerCategoriaCompleta, textoDoErroML } from "./leitura";
import { montarPayloadML } from "./payload";
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

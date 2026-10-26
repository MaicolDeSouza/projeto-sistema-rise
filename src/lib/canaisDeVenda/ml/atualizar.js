import { conteudoAtualDoAnuncio, mudancasDoAnuncio } from "./acompanhar";
import { carregarAnuncioML, gravarPublicacao } from "./banco";
import { PARTES_DO_ENVIO_ML } from "./etapasDoEnvio";
import { iniciarProgressoML } from "./progresso";
import { impressaoDoConteudo } from "./impressao";
import { lerCategoriaCompleta } from "./leitura";
import { nomeDaFoto } from "./payload";
import { emAndamento, lerFotoDoDisco, tipoDaFoto } from "./publicar";
import { textoDaRecusaML } from "./respostas";

/**
 * "Enviar mudancas ao ML" (spec 2026-10-24): leva ao anuncio JA PUBLICADO o que mudou desde o ultimo envio: do produto,
 * a descricao, as fotos e o peso e as medidas; do proprio anuncio (editados nele depois de publicado, 24/10/2026), o preco
 * e a ficha tecnica. No molde do Publicar: recebe o cliente do ML por parametro, uma volta
 * so, nenhuma escrita repete sozinha, e cada parte que deu certo e gravada na impressao na hora (uma falha no meio
 * deixa o "!" so no que faltou). Para na primeira parte que falha.
 *
 * Medir no ML real antes do primeiro uso: nenhuma das tres escritas (PUT da descricao, de `pictures` e de `attributes`)
 * foi mandada a um item publicado da conta (User Products).
 */

const textoDe = (erro) => erro?.message ?? String(erro);

/** @returns {Promise<{ ok: boolean, enviadas: string[], erro?: string, parte?: string }>} */
export async function enviarMudancasML(anuncioId, { ml, lerFoto = lerFotoDoDisco } = {}) {
  if (emAndamento.has(anuncioId)) return { ok: false, enviadas: [], erro: "Envio em andamento." };
  emAndamento.add(anuncioId);
  // O andamento do popup do editor (26/10/2026): cada etapa marcada aqui, lida pela rota `/api/mercado-livre/progresso`.
  const progresso = iniciarProgressoML(anuncioId);
  try {
    const resultado = await enviarUmaVez(anuncioId, { ml, lerFoto, progresso });
    if (!resultado.ok) progresso.falhou(resultado.erro ?? "O envio não foi concluído.");
    return resultado;
  } catch (erro) {
    console.error("[ml atualizar]", erro);
    progresso.falhou(textoDe(erro));
    return { ok: false, enviadas: [], erro: `Não foi possível enviar: ${textoDe(erro)}` };
  } finally {
    progresso.fim();
    emAndamento.delete(anuncioId);
  }
}

async function enviarUmaVez(anuncioId, { ml, lerFoto, progresso }) {
  const carregado = await carregarAnuncioML(anuncioId);
  if (!carregado.ok) return { ok: false, enviadas: [], erro: carregado.erro };
  const { rascunho, contexto, publicacao } = carregado;
  const itemId = publicacao?.itemId;
  if (carregado.status !== "PUBLICADO" || !itemId) return { ok: false, enviadas: [], erro: "O anúncio não está publicado." };

  const conteudo = conteudoAtualDoAnuncio(rascunho, contexto.produtos);
  const atual = impressaoDoConteudo(conteudo);
  const { partes } = mudancasDoAnuncio(publicacao.enviado ?? null, atual);
  if (partes.length === 0) {
    for (const etapa of ["permissao", "ler", ...PARTES_DO_ENVIO_ML]) progresso.feita(etapa, "nada a enviar");
    return { ok: true, enviadas: [] };
  }

  const principal = contexto.produtos[rascunho.produtoId];
  const codigo = String(rascunho.composicao ? rascunho.composicao.codigo : principal?.sku ?? "").trim();
  progresso.andando("permissao");
  try {
    ml.exigirEscrita(codigo);
  } catch (erro) {
    return { ok: false, enviadas: [], erro: textoDe(erro) };
  }
  progresso.feita("permissao");

  progresso.andando("ler");
  const lido = await ml.get(`/items/${itemId}`);
  if (!lido?.ok) return { ok: false, enviadas: [], erro: textoDaRecusaML(lido, `a leitura do anúncio ${itemId}`) };
  if (lido.dados?.status === "closed") return { ok: false, enviadas: [], erro: `O anúncio ${itemId} está encerrado no Mercado Livre: não dá para atualizar.` };
  progresso.feita("ler", itemId);
  // As partes que nao mudaram ficam marcadas de uma vez; as outras, uma a uma, no laco.
  for (const parte of PARTES_DO_ENVIO_ML) if (!partes.includes(parte)) progresso.feita(parte, "sem mudança");

  // A impressao vai sendo completada parte a parte: sem impressao (anuncio publicado antes de 24/10/2026), comeca vazia.
  let enviado = { ...(publicacao.enviado ?? {}) };
  let fotosNoML = { ...(publicacao.fotos ?? {}) };
  const enviadas = [];
  const gravarParte = async (parte) => {
    enviado = { ...enviado, [parte]: atual[parte], em: new Date().toISOString() };
    await gravarPublicacao(anuncioId, { enviado });
    enviadas.push(parte);
  };
  const falhar = (parte, erro) => ({ ok: false, enviadas, parte, erro });

  for (const parte of partes) {
    progresso.andando(parte);
    if (parte === "descricao") {
      let resposta;
      try {
        resposta = await ml.put(`/items/${itemId}/description`, { plain_text: conteudo.descricao });
      } catch (erro) {
        return falhar(parte, `Falha ao enviar a descrição: ${textoDe(erro)}`);
      }
      if (!resposta?.ok) return falhar(parte, textoDaRecusaML(resposta, "a descrição"));
    } else if (parte === "fotos") {
      // Acima do que a categoria aceita, vao as primeiras. Categoria que nao pode ser lida: vai tudo, e o ML diz.
      let ids = Array.isArray(rascunho.imagens) ? rascunho.imagens : [];
      try {
        const maxFotos = Number((await lerCategoriaCompleta(ml, rascunho.categoriaId))?.maxFotos);
        if (maxFotos > 0) ids = ids.slice(0, maxFotos);
      } catch {
        // segue com todas
      }
      const porId = new Map((principal?.imagens ?? []).map((imagem) => [imagem.id, imagem]));
      for (const [indice, id] of ids.entries()) {
        if (fotosNoML[id]) continue;
        const foto = porId.get(id);
        if (!foto) return falhar(parte, `A foto ${indice + 1} não foi encontrada no produto.`);
        let resposta;
        try {
          resposta = await ml.upload("/pictures/items/upload", { bytes: await lerFoto(principal.sku, foto.arquivo), nome: nomeDaFoto(rascunho.titulo, indice), tipo: tipoDaFoto(foto.arquivo) });
        } catch (erro) {
          return falhar(parte, `Falha ao enviar a foto ${indice + 1}: ${textoDe(erro)}`);
        }
        if (!resposta?.ok || !resposta.dados?.id) return falhar(parte, textoDaRecusaML(resposta, `a foto ${indice + 1}`));
        // Gravada a cada foto, como no Publicar: uma queda no meio nao sobe de novo as que ja foram.
        fotosNoML = { ...fotosNoML, [id]: resposta.dados.id };
        await gravarPublicacao(anuncioId, { fotos: { [id]: resposta.dados.id } });
      }
      let resposta;
      try {
        // A lista inteira numa chamada: o ML troca as fotos de uma vez, e o anuncio nunca fica sem foto no meio.
        resposta = await ml.put(`/items/${itemId}`, { pictures: ids.map((id) => ({ id: fotosNoML[id] })) });
      } catch (erro) {
        return falhar(parte, `Falha ao enviar as fotos: ${textoDe(erro)}`);
      }
      if (!resposta?.ok) return falhar(parte, textoDaRecusaML(resposta, "as fotos"));
    } else if (parte === "pacote") {
      const { alturaCm, larguraCm, comprimentoCm, pesoG } = conteudo.pacote;
      const attributes = [
        { id: "SELLER_PACKAGE_HEIGHT", value_name: `${alturaCm} cm` },
        { id: "SELLER_PACKAGE_WIDTH", value_name: `${larguraCm} cm` },
        { id: "SELLER_PACKAGE_LENGTH", value_name: `${comprimentoCm} cm` },
        { id: "SELLER_PACKAGE_WEIGHT", value_name: `${pesoG} g` },
      ];
      let resposta;
      try {
        resposta = await ml.put(`/items/${itemId}`, { attributes });
      } catch (erro) {
        return falhar(parte, `Falha ao enviar o peso e as medidas: ${textoDe(erro)}`);
      }
      if (!resposta?.ok) return falhar(parte, textoDaRecusaML(resposta, "o peso e as medidas"));
    } else if (parte === "preco") {
      // Num PUT so dele. Medido no 100107 em 24/10/2026 (MLB7881142312, conta sem automatizacao de precos): 200 e o
      // preco mudou. A documentacao diz que, desde 18/03/2026, o PUT so com o preco e recusado (400) para quem usa a
      // automatizacao, e que o preco junto com outros campos e IGNORADO: por isso ele nunca vai com a ficha.
      let resposta;
      try {
        resposta = await ml.put(`/items/${itemId}`, { price: conteudo.preco });
      } catch (erro) {
        return falhar(parte, `Falha ao enviar o preço: ${textoDe(erro)}`);
      }
      if (!resposta?.ok) return falhar(parte, textoDaRecusaML(resposta, "o preço"));
    } else if (parte === "ficha") {
      // So os atributos que tem valor: tirar um atributo no Rise nao o apaga no ML (nao medido como apagar).
      let resposta;
      try {
        resposta = await ml.put(`/items/${itemId}`, { attributes: conteudo.ficha });
      } catch (erro) {
        return falhar(parte, `Falha ao enviar a ficha técnica: ${textoDe(erro)}`);
      }
      if (!resposta?.ok) return falhar(parte, textoDaRecusaML(resposta, "a ficha técnica"));
    }
    await gravarParte(parte);
    progresso.feita(parte, "enviado");
  }
  return { ok: true, enviadas };
}

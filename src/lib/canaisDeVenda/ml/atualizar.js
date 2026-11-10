import { conteudoAtualDoAnuncio, mudancasDoAnuncio, temParaMandar } from "./acompanhar";
import { garantirFiscalNoML, planoFiscalDoRascunho } from "./fiscalNoML";
import { carregarAnuncioML, gravarPublicacao } from "./banco";
import { atacadoDoEnvio, enviarAtacadoML, impressaoDoAtacado } from "./atacado";
import { moverVinculoParaRiseML } from "./bling";
import { PARTES_DO_ENVIO_ML } from "./etapasDoEnvio";
import { iniciarProgressoML } from "./progresso";
import { impressaoDoConteudo } from "./impressao";
import { lerCategoriaCompleta } from "./leitura";
import { nomeDaFoto, termosParaAtualizar } from "./payload";
import { emAndamento, fiscalDoPrincipal, lerFotoDoDisco, tipoDaFoto } from "./publicar";
import { textoDaRecusaML } from "./respostas";
import { reutilizadoPendente } from "./rotulos";
import { guardarContaDoEditorSemFalhar } from "@/lib/canaisDeVenda/ml/contaDoEditor";

/**
 * "Enviar mudancas ao ML" (spec 2026-10-24): leva ao anuncio JA PUBLICADO o que mudou desde o ultimo envio: do produto,
 * a descricao, as fotos e o peso e as medidas; do proprio anuncio (editados nele depois de publicado, 24/10/2026), o preco
 * e a ficha tecnica; e, no anuncio reaproveitado da conta (08/11/2026), o titulo. No molde do Publicar: recebe o cliente do
 * ML por parametro, uma volta so, nenhuma escrita repete sozinha, e cada parte que deu certo e gravada na impressao na hora
 * (uma falha no meio deixa o "!" so no que faltou). Para na primeira parte que falha.
 *
 * O anuncio reaproveitado tem etapas a mais, depois das partes. No Publicar dele (ainda "Reutilizado", 09/11/2026: "como se
 * fosse produto novo"): todas as partes da tela, os dados fiscais e o estoque do Rise. E, enquanto nao foi movido, o vinculo
 * do Bling sai da loja antiga e entra na Rise_ML, SEM pergunta (dono, 09/11/2026; ate ali o popup pedia o OK, `moverBling`).
 * Depois de movido (`reaproveitado.blingMovidoEm`), nunca mais. A revisao e carimbada por ultimo.
 *
 * Medir no ML real antes do primeiro uso: nenhuma das tres escritas (PUT da descricao, de `pictures` e de `attributes`)
 * foi mandada a um item publicado da conta (User Products).
 */

const textoDe = (erro) => erro?.message ?? String(erro);

/**
 * O aviso de regra do ML num PUT de atributos (medido em 09/11/2026 no MLB5340689634, do 900309): o ML
 * responde 200, grava o valor e avisa em `warnings` (`code` "...business_conditional...", `message` "Attribute
 * [UNITS_PER_PACK] to be modified - values [(null,25)] should be [(null,1)]"); depois troca sozinho pelo valor dele (o 25 do
 * Publicar das 06:51 virou 1 as 07:07). Sem olhar o aviso, o Rise dava a ficha por enviada. Devolve o texto da falha ou null.
 *
 * So conta o aviso de atributo que ESTE envio levou (`enviados`): o ML avisa sobre o anuncio inteiro em qualquer PUT de
 * atributos, e o envio do peso e medidas do 900309 parou com o aviso do UNITS_PER_PACK, que so a ficha manda (09/11/2026).
 */
export function atributosQueOMLTroca(resposta, enviados = []) {
  const levados = new Set((Array.isArray(enviados) ? enviados : []).map((atributo) => String(atributo?.id ?? "")));
  const avisos = (Array.isArray(resposta?.dados?.warnings) ? resposta.dados.warnings : []).filter((aviso) => {
    const id = String(aviso?.message ?? "").match(/Attribute \[([^\]]+)\]/)?.[1];
    return id ? levados.has(id) : false;
  });
  const nomes = new Map((Array.isArray(resposta?.dados?.attributes) ? resposta.dados.attributes : []).map((atributo) => [atributo?.id, atributo?.name]));
  const textos = avisos
    .filter((aviso) => /business_conditional/.test(String(aviso?.code ?? "")))
    .map((aviso) => {
      const lido = String(aviso?.message ?? "").match(/Attribute \[([^\]]+)\].*?values \[\(\w*,\s*([^)]*)\)\] should be \[\(\w*,\s*([^)]*)\)\]/);
      if (!lido) return String(aviso?.message ?? "").trim();
      const [, id, enviado, esperado] = lido;
      return `${nomes.get(id) ?? id} (${id}): o Rise mandou ${enviado.trim()} e o ML exige ${esperado.trim()}`;
    })
    .filter(Boolean);
  if (textos.length === 0) return null;
  return `O Mercado Livre não aceita a ficha como está e troca o valor sozinho: ${textos.join("; ")}. Ajuste a ficha no Rise (por exemplo, o Formato de venda) e sincronize de novo.`;
}
// As partes da tela que o Publicar do reutilizado sempre manda (o titulo, o preco da loja e o atacado seguem as regras deles).
const PARTES_DA_TELA = ["descricao", "fotos", "pacote", "preco", "ficha", "prazo"];

/**
 * @returns {Promise<{ ok: boolean, enviadas: string[], avisos?: string[], erro?: string, parte?: string,
 *   pedeBling?: { de: string|null, codigo: string, itemId: string }, bling?: object }>}
 */
export async function enviarMudancasML(anuncioId, { ml, bling = null, lerFoto = lerFotoDoDisco } = {}) {
  if (emAndamento.has(anuncioId)) return { ok: false, enviadas: [], erro: "Envio em andamento." };
  emAndamento.add(anuncioId);
  // O andamento do popup do editor (26/10/2026): cada etapa marcada aqui, lida pela rota `/api/mercado-livre/progresso`.
  const progresso = iniciarProgressoML(anuncioId);
  try {
    const resultado = await enviarUmaVez(anuncioId, { ml, bling, lerFoto, progresso });
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

async function enviarUmaVez(anuncioId, { ml, bling, lerFoto, progresso }) {
  const carregado = await carregarAnuncioML(anuncioId);
  if (!carregado.ok) return { ok: false, enviadas: [], erro: carregado.erro };
  const { rascunho, contexto, publicacao } = carregado;
  const itemId = publicacao?.itemId;
  if (carregado.status !== "PUBLICADO" || !itemId) return { ok: false, enviadas: [], erro: "O anúncio não está publicado." };

  const conteudo = conteudoAtualDoAnuncio(rascunho, contexto.produtos);
  const atual = impressaoDoConteudo(conteudo);
  const { partes: mudaram } = mudancasDoAnuncio(publicacao.enviado ?? null, atual);
  // TODO envio manda todas as partes da tela que o anuncio tem, nao so as do "!", mais os dados fiscais e o estoque (dono,
  // 09/11/2026, primeiro no Publicar do reutilizado: "quero que mova todos os dados da tela do ML para o anuncio
  // reaproveitado, inclusive dados fiscais e estoque do bling"; depois para todo envio, ao ver a ficha do 900309 diferente no
  // ML: "Haviamos combinado de sempre atualizar tudo ao publicar", opcao "Mandar tudo sempre"). So o "!" olhava a impressao, e
  // o que o ML mudou do lado dele nunca voltava. As fotos ja no ML nao sobem de novo (o id guardado em `publicacao.fotos`).
  const revisar = reutilizadoPendente(publicacao);
  const partes = PARTES_DO_ENVIO_ML.filter((parte) => mudaram.includes(parte) || (PARTES_DA_TELA.includes(parte) && temParaMandar(atual, parte)));
  const principal = contexto.produtos[rascunho.produtoId];
  const codigo = String(rascunho.composicao ? rascunho.composicao.codigo : principal?.sku ?? "").trim();
  const enviadas = [];
  const avisos = [];

  if (partes.length === 0) {
    for (const etapa of ["permissao", "ler", ...PARTES_DO_ENVIO_ML]) progresso.feita(etapa, "nada a enviar");
  } else {
    const falha = await enviarPartes({ ml, lerFoto, progresso, anuncioId, itemId, codigo, rascunho, contexto, conteudo, atual, publicacao, partes, enviadas, avisos });
    if (falha) return falha;
    // O preco mudou no ML: guarda a conta do editor nova (09/11/2026), a estimativa das vendas daqui para a frente.
    if (partes.includes("preco")) await guardarContaDoEditorSemFalhar(anuncioId, { ml, motivo: "preco" });
  }

  const pronto = (extra = {}) => ({ ok: true, enviadas, ...(avisos.length ? { avisos } : {}), ...extra });
  let reaproveitado = publicacao.reaproveitado;

  // Todo envio, como num anuncio novo (09/11/2026): os dados fiscais (o SKU e o vinculo dele ao anuncio) e o estoque do Rise
  // no ML (no kit, o estoque do produto / N). Falhou, para antes do Bling e da revisao: o "!" fica.
  {
    try {
      ml.exigirEscrita(codigo);
    } catch (erro) {
      return { ok: false, enviadas, parte: "fiscal", erro: textoDe(erro) };
    }
    progresso.andando("fiscal");
    const fiscal = await garantirFiscalNoML(ml, await planoFiscalDoRascunho(rascunho), { itemId });
    if (!fiscal.ok) return { ok: false, enviadas, parte: "fiscal", erro: `Dados fiscais: ${fiscal.erro}` };
    if (fiscal.podeFaturar === false) avisos.push(`O Mercado Livre ainda não marcou o anúncio ${itemId} como apto a faturar: confira em Faturamento no ML.`);
    progresso.feita("fiscal", fiscal.feitos.length ? fiscal.feitos.join(" ") : "já estavam no ML");

    progresso.andando("estoque");
    const estoque = Math.max(0, Math.floor(Number(rascunho.estoque ?? 0)) || 0);
    const lido = await ml.get(`/items/${itemId}`);
    const noML = lido?.ok ? Number(lido.dados?.available_quantity) : Number.NaN;
    if (noML === estoque) progresso.feita("estoque", "já estava certo");
    else {
      let resposta;
      try {
        resposta = await ml.put(`/items/${itemId}`, { available_quantity: estoque });
      } catch (erro) {
        return { ok: false, enviadas, parte: "estoque", erro: `Falha ao acertar o estoque do anúncio ${itemId}: ${textoDe(erro)}` };
      }
      if (!resposta?.ok) return { ok: false, enviadas, parte: "estoque", erro: textoDaRecusaML(resposta, `o estoque do anúncio ${itemId}`) };
      progresso.feita("estoque", `${Number.isFinite(noML) ? noML : "?"} → ${estoque}`);
    }
  }

  // O vinculo do Bling do anuncio reaproveitado, uma vez so e SEM pergunta (dono, 09/11/2026: "nao precisa perguntar se deseja
  // mover para bling, todo produto reaproveitado ja muda para o Rise_ml no bling").
  let movido = null;
  if (reaproveitado && !reaproveitado.blingMovidoEm) {
    if (!bling) return { ok: false, enviadas, parte: "bling", erro: "Sem cliente do Bling para mover o vínculo." };
    const dadosDoBling = { preco: rascunho.preco, titulo: rascunho.titulo, tipoAnuncio: rascunho.tipoAnuncio };
    // O kit reaproveitado: sem o kit no Bling, o Mover o cria como o Publicar (as pecas, o frete e a parte fiscal).
    if (rascunho.composicao) {
      dadosDoBling.kit = {
        itens: (rascunho.composicao.itens ?? []).map((item) => ({ sku: contexto.produtos[item.produtoId]?.sku, quantidade: Number(item.quantidade) })),
        envio: rascunho.envio ?? {},
        principal: await fiscalDoPrincipal(principal?.id ?? rascunho.produtoId),
      };
    }
    progresso.andando("bling");
    movido = await moverVinculoParaRiseML(bling, codigo, itemId, dadosDoBling);
    if (!movido.ok) return { ok: false, enviadas, parte: "bling", erro: movido.erro ?? "O Bling não concluiu a mudança do vínculo." };
    reaproveitado = { ...reaproveitado, blingMovidoEm: new Date().toISOString() };
    await gravarPublicacao(anuncioId, { reaproveitado, ...(movido.kitCriado ? { blingKitId: movido.kitCriado } : {}) }, {}, movido.kitCriado ? { blingProdutoId: String(movido.kitCriado) } : {});
    const comKit = movido.kitCriado ? ` (kit ${codigo} criado no Bling)` : "";
    progresso.feita("bling", `${movido.de === "ML_4h" ? "movido da ML_4h para a Rise_ML" : "registrado na Rise_ML"}${comKit}`);
  } else {
    progresso.feita("bling", "não se aplica");
  }

  // A revisao do dono (o Publicar do editor) e carimbada por ULTIMO: o selo "Reutilizado" e o "!" saem so com tudo feito.
  if (revisar) {
    reaproveitado = { ...reaproveitado, revisadoEm: new Date().toISOString() };
    await gravarPublicacao(anuncioId, { reaproveitado });
  }
  return pronto(movido ? { bling: movido } : {});
}

/** As partes que mudaram, uma a uma. Devolve o resultado de falha, ou `null` quando todas foram. */
async function enviarPartes({ ml, lerFoto, progresso, anuncioId, itemId, codigo, rascunho, contexto, conteudo, atual, publicacao, partes, enviadas, avisos }) {
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
  // O atacado que o ML gravou: a impressao dele vem daqui (com os % da recomendacao), nao do rascunho de antes do envio.
  let atacadoEnviado = null;
  const gravarParte = async (parte) => {
    enviado = { ...enviado, [parte]: parte === "atacado" && atacadoEnviado ? impressaoDoAtacado(atacadoEnviado) : atual[parte], em: new Date().toISOString() };
    await gravarPublicacao(anuncioId, { enviado });
    enviadas.push(parte);
  };
  const falhar = (parte, erro) => ({ ok: false, enviadas, parte, erro });

  for (const parte of partes) {
    progresso.andando(parte);
    let detalhe = "enviado";
    if (parte === "titulo") {
      // O ML nao muda o titulo de anuncio com vendas (CLAUDE.md): o Rise registra o titulo do editor e avisa, sem escrever.
      if (Number(lido.dados?.sold_quantity ?? 0) > 0) {
        avisos.push("O título não muda depois de vendas: ficou o do ML.");
        detalhe = "com vendas: ficou o do ML";
      } else {
        // No modelo User Products o titulo vem do `family_name`; item sem ele (anuncio antigo) recebe o `title`.
        const corpo = lido.dados?.family_name !== undefined && lido.dados?.family_name !== null ? { family_name: conteudo.titulo } : { title: conteudo.titulo };
        let resposta;
        try {
          resposta = await ml.put(`/items/${itemId}`, corpo);
        } catch (erro) {
          return falhar(parte, `Falha ao enviar o título: ${textoDe(erro)}`);
        }
        if (!resposta?.ok) return falhar(parte, textoDaRecusaML(resposta, "o título"));
      }
    } else if (parte === "descricao") {
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
      // A foto pode ser do produto, de uma peca do kit ou uma foto propria do kit (28/10/2026): procura em todos, com o SKU dono.
      const porId = new Map(
        Object.values(contexto.produtos ?? {}).flatMap((dono) => [...(dono?.imagens ?? []), ...(dono?.fotosDoKit ?? [])].map((imagem) => [imagem.id, { ...imagem, sku: dono.sku }])),
      );
      for (const [indice, id] of ids.entries()) {
        if (fotosNoML[id]) continue;
        const foto = porId.get(id);
        if (!foto) return falhar(parte, `A foto ${indice + 1} não foi encontrada (pode ter sido excluída). Ajuste a aba Imagens.`);
        let resposta;
        try {
          resposta = await ml.upload("/pictures/items/upload", { bytes: await lerFoto(foto.sku, foto.arquivo), nome: nomeDaFoto(rascunho.titulo, indice), tipo: tipoDaFoto(foto.arquivo) });
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
      const regra = atributosQueOMLTroca(resposta, attributes);
      if (regra) return falhar(parte, regra);
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
    } else if (parte === "prazo") {
      // Os termos de venda inteiros (garantia e prazo). Prazo 0 vai como MANUFACTURING_TIME nulo: sem ele na lista o ML
      // responde 200 e mantem o prazo antigo (medido em 08/11/2026).
      let resposta;
      try {
        resposta = await ml.put(`/items/${itemId}`, { sale_terms: termosParaAtualizar(rascunho, contexto) });
      } catch (erro) {
        return falhar(parte, `Falha ao enviar o prazo de disponibilidade: ${textoDe(erro)}`);
      }
      if (!resposta?.ok) return falhar(parte, textoDaRecusaML(resposta, "o prazo de disponibilidade"));
    } else if (parte === "ficha") {
      // So os atributos que tem valor: tirar um atributo no Rise nao o apaga no ML (nao medido como apagar).
      let resposta;
      try {
        resposta = await ml.put(`/items/${itemId}`, { attributes: conteudo.ficha });
      } catch (erro) {
        return falhar(parte, `Falha ao enviar a ficha técnica: ${textoDe(erro)}`);
      }
      if (!resposta?.ok) return falhar(parte, textoDaRecusaML(resposta, "a ficha técnica"));
      const regra = atributosQueOMLTroca(resposta, conteudo.ficha);
      if (regra) return falhar(parte, regra);
    } else if (parte === "atacado") {
      // Recomendacao do ML -> POST com X-Version -> leitura de volta. Desligar manda a lista vazia. Os % que o ML gravou
      // entram no rascunho, para ele e a impressao ficarem iguais (spec 6.6).
      const resultado = await enviarAtacadoML(ml, { itemId, preco: conteudo.preco, atacado: rascunho.atacado });
      if (!resultado.ok) return falhar(parte, resultado.erro);
      atacadoEnviado = atacadoDoEnvio(rascunho.atacado, resultado.faixas);
      await gravarPublicacao(anuncioId, {}, {}, { atacado: atacadoEnviado });
      detalhe = rascunho.atacado?.ligado ? "enviado" : "desligado";
    } else if (parte === "precoDaLoja") {
      // Sem ramo: o preco de venda da loja nao vai ao ML, so a base nova e registrada, para o "!" apagar depois que o dono
      // refez (ou manteve) o preco do ML.
      detalhe = "registrado";
    }
    await gravarParte(parte);
    progresso.feita(parte, detalhe);
  }
  return null;
}

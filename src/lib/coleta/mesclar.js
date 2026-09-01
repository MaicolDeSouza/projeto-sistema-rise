/**
 * Mescla dois registros do MESMO produto, vindos de fontes diferentes.
 *
 * Modulo sem import nenhum de proposito: a juncao de listas roda no servidor e
 * a juncao de site com arquivo roda na tela. Com uma copia em cada lado, uma
 * mudanca num deles produziria resultados diferentes para o mesmo produto — e
 * nada apontaria qual dos dois esta certo.
 *
 * Sao dois casos, e a regra e a mesma:
 *
 *   - duas listas do mesmo fornecedor (pronta entrega e reserva)
 *   - o site do fornecedor e a planilha dele
 *
 * Quem chega PRIMEIRO vence nos campos em conflito. Quem chama decide a ordem:
 * na leitura de arquivo, a pronta entrega vem antes porque e o preco que o dono
 * mantem; entre site e planilha, o site vem antes porque descreve o produto
 * melhor, e a planilha entra com o que so ela tem — preco e saldo.
 */

/** Preenche em `existente` o que falta, tirando de `novo`. Muta e devolve. */
export function mesclarNoExistente(existente, novo) {
  if (!existente || !novo) return existente;

  existente.name ??= novo.name;
  existente.mpn ??= novo.mpn;
  existente.ean ??= novo.ean;
  existente.brand ??= novo.brand;
  existente.model ??= novo.model;
  existente.category ??= novo.category;
  existente.ncm ??= novo.ncm;
  existente.url ??= novo.url;

  existente.prices ??= {};
  existente.prices.normal ??= novo.prices?.normal;
  existente.prices.promotional ??= novo.prices?.promotional;
  existente.prices.reserva ??= novo.prices?.reserva;
  existente.prices.comImpostos ??= novo.prices?.comImpostos;

  existente.stock ??= {};
  existente.stock.quantity ??= novo.stock?.quantity;

  // Duas cargas do mesmo produto SOMAM o que vai chegar. Manter so a primeira
  // descartaria a segunda em silencio — sao 13 casos nos arquivos da Fortek,
  // com "65-361" e "65-361-2" na mesma lista de reserva.
  if (typeof novo.stock?.aChegar === "number") {
    existente.stock.aChegar =
      typeof existente.stock.aChegar === "number"
        ? existente.stock.aChegar + novo.stock.aChegar
        : novo.stock.aChegar;
  }

  if (!existente.stock.status || existente.stock.status === "UNKNOWN") {
    existente.stock.status = novo.stock?.status ?? existente.stock.status;
  }

  // Descricao: vence a MAIS LONGA, e nao a primeira. O site escreve texto de
  // venda; a planilha costuma repetir o nome do produto.
  if ((novo.description?.length ?? 0) > (existente.description?.length ?? 0)) {
    existente.description = novo.description;
  }

  // As fotos SOMAM, e a nova entra por ultimo. O site publica a foto de venda,
  // em resolucao alta; a planilha traz uma miniatura de conferencia. As duas
  // servem, e a ordem importa: a primeira e a que vira miniatura na tela.
  //
  // Deduplicado por endereco: o mesmo arquivo em duas fontes e uma foto so.
  {
    const vistas = new Set(existente.images ?? []);
    const somadas = [...(existente.images ?? [])];

    for (const foto of novo.images ?? []) {
      if (!vistas.has(foto)) {
        vistas.add(foto);
        somadas.push(foto);
      }
    }

    existente.images = somadas;
  }
  if ((existente.specifications?.length ?? 0) === 0) {
    existente.specifications = novo.specifications ?? [];
  }
  if ((existente.taxes?.length ?? 0) === 0) existente.taxes = novo.taxes ?? [];

  if (!Object.values(existente.seo ?? {}).some(Boolean)) {
    existente.seo = novo.seo ?? existente.seo;
  }

  existente.origens = { ...(novo.origens ?? {}), ...(existente.origens ?? {}) };

  return existente;
}

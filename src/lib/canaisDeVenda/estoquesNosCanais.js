/**
 * "Bling 5 · Rise 5 · ML 3 · LI 5": o estoque do produto em cada lugar, para a dica da coluna Estoque da lista de
 * Produtos (pedido do dono em 25/10/2026). O Bling e a referencia; o ML vem da releitura de hora em hora dos anuncios
 * do Rise (`estadoML.estoque`) e a LI do monitor do worker (`monitorLI.estoque`). Puro: so le o que a lista ja traz.
 * Sem nenhum numero alem do Rise, nao ha o que comparar e a dica nao aparece (`null`).
 */
export function textoDosEstoquesNosCanais(produto) {
  const anuncios = Array.isArray(produto?.anuncios) ? produto.anuncios : [];
  const partes = [];
  // O saldo do Bling pode ser negativo (reservas); o Rise e os canais mostram 0 nesse caso.
  if (typeof produto?.blingSaldo === "number") partes.push(`Bling ${Math.max(0, produto.blingSaldo)}`);
  const doCanal = (canal, ler) => [
    ...new Set(anuncios.filter((anuncio) => anuncio.canal === canal && anuncio.status === "PUBLICADO").map(ler).filter((numero) => typeof numero === "number")),
  ];
  const ml = doCanal("MERCADO_LIVRE", (anuncio) => anuncio.dados?.publicacao?.estadoML?.estoque);
  const li = doCanal("LOJA_INTEGRADA", (anuncio) => anuncio.dados?.monitorLI?.estoque);
  if (partes.length === 0 && ml.length === 0 && li.length === 0) return null;
  partes.push(`Rise ${produto?.estoque ?? "-"}`);
  if (ml.length) partes.push(`ML ${ml.join("/")}`);
  if (li.length) partes.push(`LI ${li.join("/")}`);
  return partes.join(" · ");
}

import { prisma } from "@/lib/db";

/**
 * O proximo codigo automatico livre da faixa 25xxxx: o maior ja usado mais um, sem reaproveitar buraco (anuncio
 * antigo ou planilha apontariam para outra peca). Conta tambem o codigo do kit dos anuncios do ML: ele vira um
 * produto no Bling ao publicar, e um produto novo com o mesmo 25xxxx seria recusado la. A mesma regra serve o botao
 * do cadastro (`gerarSku`) e a proposta (roteiro unico de 21/10/2026: a LLM nao enxerga o maior codigo).
 *
 * @returns {Promise<string|null>} null quando a faixa acabou (259999 ja existe)
 */
export const SKU_AUTOMATICO = /^25\d{4}$/;
export const PRIMEIRO_SKU_AUTOMATICO = 250001;
export const ULTIMO_SKU_AUTOMATICO = 259999;

export async function proximoCodigoLivre() {
  const [usados, anuncios] = await Promise.all([
    prisma.produto.findMany({ where: { sku: { startsWith: "25" } }, select: { sku: true } }),
    prisma.anuncio.findMany({ where: { canal: "MERCADO_LIVRE" }, select: { dados: true } }),
  ]);
  const maior = [...usados.map((produto) => produto.sku), ...anuncios.map((anuncio) => String(anuncio.dados?.composicao?.codigo ?? ""))]
    .filter((sku) => SKU_AUTOMATICO.test(sku))
    .reduce((atual, sku) => Math.max(atual, Number(sku)), PRIMEIRO_SKU_AUTOMATICO - 1);
  return maior >= ULTIMO_SKU_AUTOMATICO ? null : String(maior + 1);
}

import { avisoDoCatalogo, digitosDoEan, problemaLocalDoEan } from "@/lib/eanNoMercadoLivre";

/**
 * Confere o EAN que o produto ja tem contra o catalogo do Mercado Livre (pedido do dono em 21/10/2026, opcao 1). So
 * leitura: `GET /products/search?site_id=MLB&status=active&product_identifier=<EAN>` (medido em 21/10/2026: o 100101
 * achou o proprio Uno R3; o "0000000100106" do 100106 achou uma locao). O cliente vem por parametro (`clienteML()`),
 * como as outras leituras do ML, e o teste passa um falso.
 *
 * Memoria de 6 h por EAN: o cadastro confere ao abrir e ao sair do campo, e o catalogo do ML nao muda a cada minuto.
 */
const MEMORIA_MS = 6 * 60 * 60 * 1000;
const MAXIMO_NA_MEMORIA = 2000;
const memoria = new Map();

/** Os produtos do catalogo do ML com este EAN, como `{ id, nome }`. Lanca quando o ML nao responde. */
export async function itensDoCatalogoPorEan(cliente, ean, { agora = Date.now() } = {}) {
  const digitos = digitosDoEan(ean);
  if (!digitos) return [];
  const guardado = memoria.get(digitos);
  if (guardado && agora - guardado.em < MEMORIA_MS) return guardado.itens;

  const resposta = await cliente.get("/products/search", { site_id: "MLB", status: "active", product_identifier: digitos });
  if (!resposta.ok) throw new Error(`O Mercado Livre respondeu HTTP ${resposta.status} à consulta do código de barras.`);
  const itens = (resposta.dados?.results ?? []).map((item) => ({ id: String(item.id ?? ""), nome: String(item.name ?? "") }));

  if (memoria.size >= MAXIMO_NA_MEMORIA) memoria.delete(memoria.keys().next().value);
  memoria.set(digitos, { em: agora, itens });
  return itens;
}

/**
 * O aviso do campo GTIN/EAN, ou null quando nao ha o que dizer. O problema local (formato, digito, codigo com zeros)
 * vem primeiro e dispensa o ML; sem conseguir falar com o ML, `{ semConsulta: true }` (a tela nao avisa nada: nao saber
 * nao e erro do cadastro).
 *
 * @returns {Promise<{ aviso: { tipo: string, texto: string, itens?: { id: string, nome: string }[] } | null, semConsulta?: boolean }>}
 */
export async function conferirEanNoML(cliente, { ean, sku, titulo }, opcoes) {
  const local = problemaLocalDoEan(ean, sku);
  if (local) return { aviso: local };
  if (!digitosDoEan(ean)) return { aviso: null };
  try {
    return { aviso: avisoDoCatalogo(await itensDoCatalogoPorEan(cliente, ean, opcoes), titulo) };
  } catch (erro) {
    console.error("[ean-ml]", erro?.message ?? erro);
    return { aviso: null, semConsulta: true };
  }
}

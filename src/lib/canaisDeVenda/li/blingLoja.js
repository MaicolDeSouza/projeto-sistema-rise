import { buscarNoBling } from "@/lib/blingSync/leitura";

/**
 * O produto esta ligado, DENTRO do Bling, ao canal da Loja Integrada? E esse vinculo (produto x loja
 * do Bling) que faz o Bling mandar estoque e preco para a LI e receber os pedidos dela (pedido do
 * dono em 07/10/2026: o editor da LI mostra isso ao abrir). So le o Bling.
 *
 * Medido em 07/10/2026: `GET /produtos/lojas?idProduto=` devolve um registro por loja; o da LI e a
 * loja 203478870, e o `codigo` dele e o id do produto NA LI (o 100101 tem "204930845"). O alvo sai do
 * SKU (`buscarNoBling`), nunca de um `blingId` guardado: a mesma regra da sincronizacao com o Bling.
 *
 * Situacoes: "ligado" (com codigo e preco do vinculo), "codigo_diferente" (ligado a OUTRO produto da
 * LI), "sem_vinculo" (o produto existe no Bling sem o canal da LI), "sem_produto_no_bling",
 * "duplicado" (mais de um produto com o codigo no Bling) e "erro" (com o recado). Nunca lanca.
 */

/** O canal "Loja_Integrada" do Bling (`GET /canais-venda`, confirmado pelo dono em 06/10/2026). */
export const LOJA_LI_NO_BLING = "203478870";

const centavos = (valor) => (Number.isFinite(Number(valor)) ? Math.round(Number(valor) * 100) / 100 : null);

export async function vinculoBlingNaLI(cliente, sku, idExternoLI) {
  try {
    const busca = await buscarNoBling(cliente, sku);
    if (busca.situacao === "nao_existe") return { situacao: "sem_produto_no_bling" };
    if (busca.situacao === "duplicado") return { situacao: "duplicado" };

    const resposta = await cliente.get("/produtos/lojas", { idProduto: busca.id });
    if (!resposta?.ok || !Array.isArray(resposta.dados?.data)) {
      return { situacao: "erro", erro: `Não foi possível ler os vínculos do produto no Bling (HTTP ${resposta?.status ?? "?"}).` };
    }
    const daLI = resposta.dados.data.find((vinculo) => String(vinculo?.loja?.id) === LOJA_LI_NO_BLING);
    if (!daLI) return { situacao: "sem_vinculo" };

    const codigo = String(daLI.codigo ?? "").trim();
    // O codigo do vinculo e o id do produto na LI: outro numero quer dizer que o Bling manda estoque
    // e preco para OUTRO produto da loja. Produto ainda fora da LI nao tem com o que comparar.
    if (idExternoLI && codigo && codigo !== String(idExternoLI)) return { situacao: "codigo_diferente", codigo, preco: centavos(daLI.preco) };
    return { situacao: "ligado", codigo, preco: centavos(daLI.preco) };
  } catch (erro) {
    return { situacao: "erro", erro: erro?.message ? `Bling: ${erro.message}` : "Não foi possível ler o Bling." };
  }
}

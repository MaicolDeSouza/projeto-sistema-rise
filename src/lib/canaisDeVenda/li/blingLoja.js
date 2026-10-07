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

/// O que o Bling disse ao recusar: HTTP e descricao (o mesmo formato da sincronizacao com o Bling).
function motivoDoBling(resposta) {
  const erro = resposta?.dados?.error;
  const descricao = erro?.description ?? erro?.message ?? null;
  return `HTTP ${resposta?.status ?? "sem status"}${descricao ? `: ${descricao}` : ""}`;
}

/**
 * "Ligar no Bling" (pedido do dono em 07/10/2026): cria no Bling o vinculo do produto com a loja
 * Loja_Integrada, para o Bling mandar estoque e preco ao produto da LI e receber os pedidos dele.
 * `POST /produtos/lojas` com o `codigo` = id do produto NA LI (o formato medido no 100101), o produto e
 * a loja. O preco e o do PRODUTO NO BLING: o Bling e o dono do preco na LI, o Rise nao decide.
 *
 * Regras: so produto que ja esta na LI (sem o id nao ha o que ligar); vinculo que ja existe com o mesmo
 * id nao e criado de novo; ligado a OUTRO produto da LI nao e mexido (o dono decide no Bling); as travas
 * BLING_ESCRITA e BLING_ESCRITA_CODIGOS (`exigirEscrita`) antes da escrita; uma tentativa so (o cliente
 * do Bling nunca repete escrita). Depois do POST le de novo para confirmar. Nunca lanca.
 */
export async function ligarNoBlingLI(cliente, sku, idExternoLI) {
  if (!idExternoLI) return { ok: false, erro: "O produto ainda não está na Loja Integrada: cadastre na LI antes de ligar no Bling." };
  const antes = await vinculoBlingNaLI(cliente, sku, idExternoLI);
  if (antes.situacao === "ligado") return { ok: true, ...antes, jaEstava: true };
  if (antes.situacao === "codigo_diferente") {
    return { ok: false, ...antes, erro: `No Bling, o produto já está ligado a outro produto da Loja Integrada (${antes.codigo}). Corrija no Bling: o Rise não mexe nesse vínculo.` };
  }
  if (antes.situacao !== "sem_vinculo") {
    return { ok: false, ...antes, erro: antes.erro ?? "O produto não está no Bling (ou está repetido lá): não há o que ligar." };
  }

  try {
    const busca = await buscarNoBling(cliente, sku);
    cliente.exigirEscrita(sku);
    const corpo = {
      codigo: String(idExternoLI),
      preco: centavos(busca.produto?.preco) ?? 0,
      produto: { id: busca.id },
      loja: { id: Number(LOJA_LI_NO_BLING) },
    };
    let resposta;
    try {
      resposta = await cliente.post("/produtos/lojas", corpo);
    } catch (erro) {
      return { ok: false, situacao: "erro", erro: `Falha ao ligar no Bling: ${erro?.message ?? erro}. Confira no Bling antes de tentar de novo.` };
    }
    if (!resposta?.ok) {
      const dica = resposta?.status >= 500 ? " O Bling pode ter gravado mesmo assim: confira no Bling antes de tentar de novo." : "";
      return { ok: false, situacao: "erro", erro: `O Bling recusou o vínculo com a Loja Integrada (${motivoDoBling(resposta)}).${dica}` };
    }
    const depois = await vinculoBlingNaLI(cliente, sku, idExternoLI);
    return depois.situacao === "ligado"
      ? { ok: true, ...depois }
      : { ok: false, ...depois, erro: "O Bling aceitou, mas a releitura não mostrou o vínculo. Confira no Bling antes de tentar de novo." };
  } catch (erro) {
    // A trava fechada lanca aqui, antes de qualquer escrita.
    return { ok: false, situacao: "erro", erro: erro?.message ?? "Não foi possível ligar no Bling." };
  }
}

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

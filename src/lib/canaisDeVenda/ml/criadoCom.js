/**
 * O que foi ao Mercado Livre na CRIACAO do anuncio, para o "Retomar publicacao" mandar so o que mudou depois (pedido do dono
 * em 27/10/2026, Opcao 1: "todos os campos que normalmente podem ser editados devem voltar a poder ser editados apos um erro
 * de publicacao; o Rise reenvia o que foi mudado"). So as partes que o ML aceita trocar num item ja criado (medido no
 * publicado): preco, ficha tecnica, fotos e peso/medidas. A descricao tem etapa propria (vai depois da criacao) e o titulo,
 * a categoria e o tipo nao mudam (o editor os trava). Puro, sem imports: o Publicar e o teste leem o mesmo arquivo.
 */

export const PARTES_DA_RETOMADA = ["preco", "ficha", "fotos", "pacote"];

export const ROTULO_DA_PARTE = { preco: "preço", ficha: "ficha técnica", fotos: "fotos", pacote: "peso e medidas" };

const doPacote = (atributo) => String(atributo?.id ?? "").startsWith("SELLER_PACKAGE_");
const emOrdem = (lista) => JSON.stringify([...lista].sort((a, b) => String(a.id).localeCompare(String(b.id))));

/** A ficha (sem o SKU e o pacote) e o pacote do corpo do item, como vao ao ML. */
export function atributosDaRetomada(payload) {
  const atributos = Array.isArray(payload?.item?.attributes) ? payload.item.attributes : [];
  return {
    ficha: atributos.filter((atributo) => !doPacote(atributo) && atributo.id !== "SELLER_SKU"),
    pacote: atributos.filter(doPacote),
  };
}

/** A impressao de cada parte (texto comparavel), a partir do corpo do item e das fotos do rascunho. */
export function impressaoDaCriacao(payload, imagens) {
  const { ficha, pacote } = atributosDaRetomada(payload);
  return {
    preco: Number(payload?.item?.price ?? 0),
    ficha: emOrdem(ficha),
    fotos: JSON.stringify(Array.isArray(imagens) ? imagens : []),
    pacote: emOrdem(pacote),
  };
}

/** As partes que mudaram desde a criacao. Sem impressao (anuncio criado antes de 27/10/2026), todas: nao ha como saber. */
export function partesMudadas(antes, agora) {
  if (!antes) return [...PARTES_DA_RETOMADA];
  return PARTES_DA_RETOMADA.filter((parte) => antes[parte] !== agora[parte]);
}

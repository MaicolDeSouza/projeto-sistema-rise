/**
 * O fornecedor PADRAO do produto (pedido do dono em 08/11/2026): "sempre que o produto tiver um unico fornecedor
 * automaticamente deve marcar aquele como padrao. Caso tenha varios fornecedores e eu quiser excluir um fornecedor
 * padrao nao permite, devo marcar outro fornecedor padrao para depois excluir o fornecedor desejado. Caso tenha apenas
 * 01 fornecedor ai sim deixa excluir mesmo marcado como padrao."
 *
 * Regras puras, sobre a lista que a aba Fornecedores mostra (os vinculos e, quando vale, o fornecedor do Bling em
 * rascunho): a aba (cliente) e o servidor usam as mesmas. Sem banco aqui, para o componente poder importar.
 */

export const RECADO_TROCAR_PADRAO = "Marque outro fornecedor como padrão antes de excluir este.";

/**
 * A lista com o unico fornecedor marcado como padrao. Com dois ou mais, nao escolhe por ninguem: a regra do dono fala
 * do fornecedor unico, e escolher o padrao entre varios decide o custo do produto.
 *
 * @template {{ padrao?: boolean }} T
 * @param {T[] | null | undefined} lista
 * @returns {T[]}
 */
export function comPadraoUnico(lista) {
  const itens = Array.isArray(lista) ? lista : [];
  if (itens.length !== 1 || itens[0]?.padrao) return itens;
  return [{ ...itens[0], padrao: true }];
}

/**
 * Pode tirar este fornecedor da lista? O padrao so sai sozinho; com outros na lista, marque outro antes (o custo do
 * produto vem dele, e trocar sem o dono escolher mudaria o custo em silencio).
 *
 * @param {{ id: string, padrao?: boolean }[]} lista
 * @param {string} id
 * @returns {{ ok: true } | { ok: false, erro: string }}
 */
export function podeRemoverFornecedor(lista, id) {
  const itens = Array.isArray(lista) ? lista : [];
  const alvo = itens.find((item) => item.id === id);
  if (!alvo) return { ok: false, erro: "Fornecedor não encontrado." };
  if (alvo.padrao && itens.length > 1) return { ok: false, erro: RECADO_TROCAR_PADRAO };
  return { ok: true };
}

/**
 * A lista sem o fornecedor; se sobrou um so, ele vira o padrao. Quem chama confere antes com `podeRemoverFornecedor`.
 *
 * @template {{ id: string, padrao?: boolean }} T
 * @param {T[]} lista
 * @param {string} id
 * @returns {T[]}
 */
export function semOFornecedor(lista, id) {
  return comPadraoUnico((Array.isArray(lista) ? lista : []).filter((item) => item.id !== id));
}

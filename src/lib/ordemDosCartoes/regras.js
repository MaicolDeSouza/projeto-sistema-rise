/**
 * Regras puras da ordem dos cartoes (pedido do dono em 07/11/2026: os cartoes das paginas de bloco trocam de lugar
 * segurando e arrastando, e a ordem fica salva por pessoa). Sem imports: usadas pela tela e pelo servidor.
 */

/**
 * As paginas de cartoes que guardam ordem; outra pagina e recusada no servidor. "menu" nao e pagina: e a ordem dos
 * botoes do menu lateral (pedido do dono em 09/11/2026), guardada na mesma tabela, por pessoa, com o href do bloco como id.
 */
export const PAGINAS_COM_CARTOES = ["painel", "cadastros", "canais-de-venda", "compras", "configuracoes", "estoque", "ferramentas", "indicadores", "menu"];

const TETO_DE_CARTOES = 60;
const TETO_DO_ID = 200;

/**
 * A ordem para mostrar: os ids salvos que ainda existem, na ordem salva, e depois os que nao estavam na lista (cartao
 * novo) na ordem padrao. Sem ordem salva, a padrao.
 */
export function aplicarOrdem(idsPadrao, ordemSalva) {
  if (!Array.isArray(ordemSalva) || ordemSalva.length === 0) return [...idsPadrao];
  const existentes = new Set(idsPadrao);
  const primeiro = ordemSalva.filter((id, posicao) => existentes.has(id) && ordemSalva.indexOf(id) === posicao);
  const vistos = new Set(primeiro);
  return [...primeiro, ...idsPadrao.filter((id) => !vistos.has(id))];
}

/** Move `id` para a posicao de `alvo` (o arrastar): devolve a lista nova, ou a mesma quando nada muda. */
export function moverPara(ids, id, alvo) {
  const de = ids.indexOf(id);
  const para = ids.indexOf(alvo);
  if (de < 0 || para < 0 || de === para) return ids;
  const nova = [...ids];
  nova.splice(de, 1);
  nova.splice(para, 0, id);
  return nova;
}

/** A ordem e a padrao? (entao nao ha o que guardar, e o "Ordem padrão" some). */
export function ehOrdemPadrao(ids, idsPadrao) {
  return ids.length === idsPadrao.length && ids.every((id, posicao) => id === idsPadrao[posicao]);
}

/** @returns {{ ok: true, pagina: string, ordem: string[] } | { ok: false, erro: string }} */
export function validarOrdem(pagina, ordem) {
  if (!PAGINAS_COM_CARTOES.includes(pagina)) return { ok: false, erro: "Página sem cartões." };
  if (!Array.isArray(ordem) || ordem.length > TETO_DE_CARTOES) return { ok: false, erro: "Ordem inválida." };
  const limpa = [];
  for (const id of ordem) {
    if (typeof id !== "string" || !id.trim() || id.length > TETO_DO_ID) return { ok: false, erro: "Ordem inválida." };
    if (!limpa.includes(id)) limpa.push(id);
  }
  return { ok: true, pagina, ordem: limpa };
}

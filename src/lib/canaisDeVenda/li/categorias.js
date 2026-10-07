/**
 * Sugestao de categoria da Loja Integrada pela IA (pedido do dono em 07/10/2026): as regras puras.
 * Sem imports: a aba Categorias (marcar com os pais) e o servidor (limpar a resposta) leem o mesmo.
 *
 * A arvore e a de `listarCategoriasDaLI`: `[{ id, nome, paiId, caminho }]`, ids em texto.
 */

/// Quantas categorias a IA pode sugerir de uma vez.
export const MAXIMO_DE_SUGESTOES = 3;

/**
 * So o que existe na arvore da loja: id inventado pela IA sai, repetido vira um, e o caminho vem da
 * arvore (nunca do texto da IA). No maximo `MAXIMO_DE_SUGESTOES`.
 */
export function limparSugestoesDeCategoria(sugestoes, categorias) {
  const porId = new Map((categorias ?? []).map((categoria) => [String(categoria.id), categoria]));
  const vistas = new Set();
  const limpas = [];
  for (const sugestao of Array.isArray(sugestoes) ? sugestoes : []) {
    const id = String(sugestao?.id ?? "");
    const categoria = porId.get(id);
    if (!categoria || vistas.has(id)) continue;
    vistas.add(id);
    limpas.push({ id, caminho: categoria.caminho ?? categoria.nome, motivo: String(sugestao?.motivo ?? "").trim() });
    if (limpas.length >= MAXIMO_DE_SUGESTOES) break;
  }
  return limpas;
}

/**
 * Os ids com as categorias-pai junto: e assim que os produtos estao marcados na loja (o 100101 tem
 * "Embarcados", "Embarcados > Arduino" e "Embarcados > Arduino > Placas Arduino"). Pai que sumiu da
 * arvore nao entra.
 */
export function comAncestrais(ids, categorias) {
  const porId = new Map((categorias ?? []).map((categoria) => [String(categoria.id), categoria]));
  const todos = new Set();
  for (const id of ids ?? []) {
    let atual = porId.get(String(id));
    while (atual && !todos.has(String(atual.id))) {
      todos.add(String(atual.id));
      atual = atual.paiId ? porId.get(String(atual.paiId)) : null;
    }
  }
  return [...todos];
}

/** O pedido a IA: o produto e a arvore inteira, uma categoria por linha ("id: caminho"). */
export function montarPedidoDeCategorias({ titulo = "", marca = "", descricao = "", categorias = [] }) {
  const linhas = (categorias ?? []).map((categoria) => `${categoria.id}: ${categoria.caminho ?? categoria.nome}`).join("\n");
  return (
    "Escolha a(s) categoria(s) da loja virtual em que este produto deve aparecer.\n\n" +
    "Regras:\n" +
    `- escolha de 1 a ${MAXIMO_DE_SUGESTOES} categorias, SÓ da lista abaixo, pelo id;\n` +
    "- prefira a categoria mais específica (a do fim do caminho), e não a categoria-pai: os pais são marcados sozinhos;\n" +
    "- mais de uma só quando o produto pertence de verdade a assuntos diferentes;\n" +
    "- para cada uma, um motivo curto (uma frase).\n\n" +
    `Produto: ${titulo}\nMarca: ${marca || "(sem)"}\n\nDescrição:\n${String(descricao ?? "").slice(0, 3000) || "(vazia)"}\n\n` +
    `Categorias da loja (id: caminho):\n${linhas}\n\n` +
    'Responda no formato {"categorias": [{"id": "...", "motivo": "..."}]}.'
  );
}

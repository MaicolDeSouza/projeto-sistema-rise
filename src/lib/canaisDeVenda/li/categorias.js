/**
 * Sugestao de categoria da Loja Integrada pela IA (pedido do dono em 07/10/2026): as regras puras.
 * Sem imports: a aba Categorias, a comparacao com a loja, o envio e o servidor (limpar a resposta) leem o mesmo.
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
 * Tira da lista a categoria que e PAI (ou avo...) de outra categoria da mesma lista: marcar a filha ja
 * basta, porque a loja mostra o produto tambem na pagina do pai (medido em 24/10/2026: "Placas Embarcadas"
 * lista os 22 produtos de "01 - Placas Arduino"). Decisao do dono em 24/10/2026, a partir do 100105: o Rise
 * guardava pai + filha e o pop-up acusava "Categorias: diferente" contra a loja, que so tinha a filha
 * (marcar a filha no painel da LI nao marca o pai). Vale na COMPARACAO e no ENVIO; o rascunho continua como
 * esta (produto antigo da loja, como o 100101, tem pai + filha e nao precisa ser mexido).
 *
 * Pai sozinho (sem filha na lista) fica. Id que nao esta na arvore fica (categoria que sumiu da loja e
 * assunto de outra regra). A ordem de entrada e mantida. `categorias` e `[{ id, paiId }]`, ids em texto.
 */
export function semAncestraisRedundantes(ids, categorias) {
  const lista = Array.isArray(ids) ? ids : [];
  const porId = new Map((categorias ?? []).map((categoria) => [String(categoria.id), categoria]));
  const ancestrais = new Set();
  for (const id of lista) {
    const vistos = new Set([String(id)]);
    let pai = porId.get(String(porId.get(String(id))?.paiId ?? ""));
    while (pai && !vistos.has(String(pai.id))) {
      vistos.add(String(pai.id));
      ancestrais.add(String(pai.id));
      pai = porId.get(String(pai.paiId ?? ""));
    }
  }
  const restantes = lista.filter((id) => !ancestrais.has(String(id)));
  // Ciclo na arvore (nao existe numa loja de verdade) nunca esvazia a lista inteira.
  return restantes.length > 0 || lista.length === 0 ? restantes : lista;
}

/** O pedido a IA: o produto e a arvore inteira, uma categoria por linha ("id: caminho"). */
export function montarPedidoDeCategorias({ titulo = "", marca = "", descricao = "", categorias = [] }) {
  const linhas = (categorias ?? []).map((categoria) => `${categoria.id}: ${categoria.caminho ?? categoria.nome}`).join("\n");
  return (
    "Escolha a(s) categoria(s) da loja virtual em que este produto deve aparecer.\n\n" +
    "Regras:\n" +
    `- escolha de 1 a ${MAXIMO_DE_SUGESTOES} categorias, SÓ da lista abaixo, pelo id;\n` +
    "- prefira a categoria mais específica (a do fim do caminho), e não a categoria-pai: a loja já mostra o produto no pai;\n" +
    "- mais de uma só quando o produto pertence de verdade a assuntos diferentes;\n" +
    "- para cada uma, um motivo curto (uma frase).\n\n" +
    `Produto: ${titulo}\nMarca: ${marca || "(sem)"}\n\nDescrição:\n${String(descricao ?? "").slice(0, 3000) || "(vazia)"}\n\n` +
    `Categorias da loja (id: caminho):\n${linhas}\n\n` +
    'Responda no formato {"categorias": [{"id": "...", "motivo": "..."}]}.'
  );
}

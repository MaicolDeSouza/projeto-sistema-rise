/**
 * Avisos dos concorrentes do ML pelo catalogo (spec 2026-10-21-concorrentes-ml-catalogo-design.md, secao 7.6), puro e
 * sem imports: o editor (navegador) e a lista de anuncios (servidor) usam o mesmo texto.
 */

const reais = (valor) => `R$ ${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const depoisDe = (data, vistoEm) => !vistoEm || new Date(data) > new Date(vistoEm);
const centavos = (valor) => (valor === null || valor === undefined ? null : Math.round(Number(valor) * 100));

/**
 * O que mudou desde que o dono olhou (`vistoEm`; nulo = tudo e novidade).
 * @param {{ posicoes: { posicao: number|null, menorPreco: number|null, lidoEm: Date }[],
 *           concorrentes: { vendedorApelido?: string|null, vendedorId?: string, historico: { preco: number|null, lidoEm: Date }[] }[],
 *           vistoEm: Date|null }} entrada `posicoes` e `historico`: os dois ultimos, o mais recente primeiro.
 * @returns {{ tipo: "caiu"|"preco_baixou"|"novo_mais_barato", texto: string }[]}
 */
export function avisosDoML({ posicoes = [], concorrentes = [], vistoEm = null } = {}) {
  const avisos = [];
  const [agora, antes] = posicoes;

  if (agora && antes && depoisDe(agora.lidoEm, vistoEm) && agora.posicao !== null && antes.posicao !== null && agora.posicao > antes.posicao) {
    avisos.push({ tipo: "caiu", texto: `caiu de ${antes.posicao}º para ${agora.posicao}º` });
  }

  const baixaram = [];
  for (const concorrente of concorrentes) {
    const [ultimo, anterior] = concorrente.historico ?? [];
    if (!ultimo || !anterior || !depoisDe(ultimo.lidoEm, vistoEm)) continue;
    if (centavos(ultimo.preco) !== null && centavos(anterior.preco) !== null && centavos(ultimo.preco) < centavos(anterior.preco)) {
      baixaram.push(centavos(ultimo.preco));
      const nome = concorrente.vendedorApelido || `vendedor ${concorrente.vendedorId ?? ""}`.trim();
      avisos.push({ tipo: "preco_baixou", texto: `${nome} baixou para ${reais(ultimo.preco)}` });
    }
  }

  // O menor preco do catalogo caiu e nenhum concorrente que ja estava ali explica a queda: entrou alguem novo abaixo.
  if (agora && antes && depoisDe(agora.lidoEm, vistoEm) && centavos(agora.menorPreco) !== null && centavos(antes.menorPreco) !== null) {
    const menor = centavos(agora.menorPreco);
    if (menor < centavos(antes.menorPreco) && !baixaram.includes(menor)) {
      avisos.push({ tipo: "novo_mais_barato", texto: `novo vendedor abaixo do seu preço (${reais(agora.menorPreco)})` });
    }
  }
  return avisos;
}

/**
 * Os concorrentes do ML no formato de `posicaoDePreco` (`src/lib/posicaoDePreco.js`): cada vendedor conta uma vez (o
 * nome e a "loja"), e quem saiu do top fica de fora como indisponivel.
 */
export function concorrentesParaPosicao(concorrentes) {
  return (concorrentes ?? []).map((concorrente) => ({
    loja: concorrente.vendedorApelido || `vendedor ${concorrente.vendedorId ?? ""}`.trim(),
    preco: concorrente.preco,
    indisponivel: concorrente.ausenteDesde !== null && concorrente.ausenteDesde !== undefined,
  }));
}

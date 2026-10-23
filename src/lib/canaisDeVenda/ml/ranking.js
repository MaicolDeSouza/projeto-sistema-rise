/**
 * O ranking de precos pelos catalogos (spec 2026-10-23-ranking-catalogos-referencia-ml-design.md, 4.4): o 1o de cada
 * catalogo (o do anuncio e os de referencia) mais o preco deste anuncio, do mais barato ao mais caro. Sem imports: a
 * tela recalcula enquanto o dono digita o preco, e a lista de anuncios usa a mesma conta.
 *
 * O preco que decide e o `price` do ML (o que ele cobra), como no resto do codigo do ML; o riscado so informa.
 */

const HORAS_DE_LEITURA_ANTIGA = 48;

const centavos = (valor) => Math.round(Number(valor) * 100);
const reais = (c) => c / 100;
const temPreco = (valor) => valor !== null && valor !== undefined && valor !== "" && Number.isFinite(Number(valor)) && Number(valor) > 0;

/**
 * Junta o catalogo do anuncio (da tela dos concorrentes) e as referencias num formato so. O 1o do catalogo do anuncio e
 * o proprio dono quando a posicao dele e 1; senao, o concorrente presente de menor posicao. A referencia com o mesmo id
 * do catalogo do anuncio sai (o dono trocou o catalogo do anuncio para um que ja era referencia).
 */
export function catalogosDoRanking(telaConcorrentes, referencias) {
  const lista = [];
  const doAnuncio = telaConcorrentes?.catalogoId ?? null;
  if (doAnuncio) {
    const presentes = (telaConcorrentes.concorrentes ?? []).filter((c) => !c.ausenteDesde).sort((a, b) => a.posicao - b.posicao);
    const souOPrimeiro = telaConcorrentes.posicao?.posicao === 1;
    const primeiro = souOPrimeiro ? { meu: true } : presentes[0] ? { ...presentes[0], meu: false } : null;
    lista.push({
      catalogoId: doAnuncio,
      nome: telaConcorrentes.catalogoNome ?? null,
      papel: "anuncio",
      primeiro,
      semAnuncios: !primeiro,
      lidoEm: telaConcorrentes.lidoEm ?? null,
      erro: null,
    });
  }
  for (const r of referencias ?? []) {
    if (r.catalogoId === doAnuncio) continue;
    lista.push({ catalogoId: r.catalogoId, nome: r.nome ?? null, papel: "referencia", primeiro: r.primeiro ?? null, semAnuncios: Boolean(r.semAnuncios), lidoEm: r.lidoEm ?? null, erro: r.erro ?? null, id: r.id });
  }
  return lista;
}

/** Diferenca do preco do anuncio para outro, em reais e em % sobre o outro (uma casa). */
function diferenca(meuC, outroC) {
  if (outroC === null) return null;
  return { reais: reais(meuC - outroC), percentual: Math.round(((meuC - outroC) / outroC) * 1000) / 10 };
}

/**
 * @param {{ preco: number|string|null, catalogos: ReturnType<typeof catalogosDoRanking> }} entrada
 * @returns {{ linhas: object[], foraDaConta: object[], posicao: number|null, total: number, maisBarato: number|null,
 *   media: number|null, paraOMaisBarato: { reais, percentual }|null, paraAMedia: { reais, percentual }|null }}
 */
export function montarRanking({ preco, catalogos }) {
  const contados = [];
  const foraDaConta = [];
  for (const catalogo of catalogos ?? []) {
    const p = catalogo.primeiro;
    // O 1o que e o proprio dono sai: a linha "Voce" o representa (com o preco que esta no campo agora).
    if (p && !p.meu && temPreco(p.preco)) contados.push({ tipo: "catalogo", ...catalogo, preco: Number(p.preco), c: centavos(p.preco) });
    else foraDaConta.push(catalogo);
  }
  const meuC = temPreco(preco) ? centavos(preco) : null;
  const precosC = contados.map((linha) => linha.c);
  const maisBaratoC = precosC.length > 0 ? Math.min(...precosC) : null;
  const mediaC = precosC.length > 0 ? Math.round(precosC.reduce((soma, c) => soma + c, 0) / precosC.length) : null;

  // Ordem estavel: empate entre catalogos mantem a ordem de entrada; o dono fica na frente de quem empata com ele.
  const todos = meuC === null ? [...contados] : [...contados, { tipo: "voce", preco: reais(meuC), c: meuC }];
  todos.sort((a, b) => a.c - b.c || (a.tipo === "voce" ? -1 : b.tipo === "voce" ? 1 : 0));
  const linhas = todos.map(({ c: _c, ...linha }, indice) => ({ ...linha, posicao: indice + 1 }));
  const voce = linhas.find((linha) => linha.tipo === "voce");

  return {
    linhas,
    foraDaConta,
    posicao: voce?.posicao ?? null,
    total: linhas.length,
    maisBarato: maisBaratoC === null ? null : reais(maisBaratoC),
    media: mediaC === null ? null : reais(mediaC),
    paraOMaisBarato: meuC === null ? null : diferenca(meuC, maisBaratoC),
    paraAMedia: meuC === null ? null : diferenca(meuC, mediaC),
  };
}

/** Leitura com mais de 48 h: a tela avisa (o worker relê uma vez por dia; dois dias sem leitura e falha dele). */
export function leituraAntiga(lidoEm, agora = new Date()) {
  if (!lidoEm) return false;
  return new Date(agora).getTime() - new Date(lidoEm).getTime() > HORAS_DE_LEITURA_ANTIGA * 3600 * 1000;
}

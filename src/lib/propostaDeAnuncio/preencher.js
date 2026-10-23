/**
 * A regra de preenchimento da proposta de anuncio (spec 2026-10-23, secao 6.3), a mesma do cadastro de produto: campo
 * VAZIO no rascunho recebe o valor proposto (e a marca "PROPOSTA" no editor); campo ja preenchido com OUTRO valor fica
 * como esta e o proposto vira sugestao (topo da lista do icone). Sem imports: o editor tambem a usa.
 *
 * Os caminhos sao com ponto ("seo.description"), sobre o rascunho do canal.
 */

const ehVazio = (valor) => valor === null || valor === undefined || (typeof valor === "string" && valor.trim() === "") || (Array.isArray(valor) && valor.length === 0);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function ler(objeto, caminho) {
  return caminho.split(".").reduce((atual, chave) => (atual === null || atual === undefined ? undefined : atual[chave]), objeto);
}

function escrever(objeto, caminho, valor) {
  const partes = caminho.split(".");
  let atual = objeto;
  for (const chave of partes.slice(0, -1)) {
    if (atual[chave] === null || typeof atual[chave] !== "object") atual[chave] = {};
    atual = atual[chave];
  }
  atual[partes.at(-1)] = valor;
}

/**
 * @param {object} rascunho  o rascunho do canal (nao e alterado: volta uma copia)
 * @param {Record<string, unknown>} propostos  valor proposto por caminho; vazio ou ausente nao entra
 * @param {{ vazio?: (caminho: string, valorAtual: unknown) => boolean }} [opcoes]
 * @returns {{ rascunho: object, campos: string[], sugestoes: Record<string, unknown>, valores: Record<string, unknown> }}
 */
export function aplicarProposta(rascunho, propostos, { vazio = (_caminho, valor) => ehVazio(valor) } = {}) {
  const copia = structuredClone(rascunho ?? {});
  const campos = [];
  const sugestoes = {};
  const valores = {};
  for (const [caminho, valor] of Object.entries(propostos ?? {})) {
    if (ehVazio(valor)) continue;
    const atual = ler(copia, caminho);
    if (vazio(caminho, atual)) {
      escrever(copia, caminho, structuredClone(valor));
      campos.push(caminho);
      valores[caminho] = structuredClone(valor);
    } else if (!igual(atual, valor)) {
      sugestoes[caminho] = structuredClone(valor);
    }
  }
  return { rascunho: copia, campos, sugestoes, valores };
}

/** O `Anuncio.dados.proposta`: o que veio da LLM e o que a proposta fez. Os `extras` sao do canal (o ML guarda o preco e os catalogos). */
export function montarProposta({ versaoDoRoteiro, campos = [], sugestoes = {}, valores = {}, relatorio = "", extras = {} } = {}) {
  return {
    ...extras,
    versaoDoRoteiro: String(versaoDoRoteiro ?? ""),
    criadaEm: new Date().toISOString(),
    campos: [...campos],
    valores: { ...valores },
    sugestoes: { ...sugestoes },
    relatorio: String(relatorio ?? ""),
  };
}

/** O que a tela mostra num campo: "preenchido" (marca PROPOSTA), "sugestao" (topo da lista) ou nada. */
export function marcaDaProposta(proposta, caminho) {
  if (!proposta) return null;
  if ((proposta.campos ?? []).includes(caminho)) return "preenchido";
  if (proposta.sugestoes && Object.hasOwn(proposta.sugestoes, caminho)) return "sugestao";
  return null;
}

/** O valor proposto de um campo (o que entrou ou a sugestao); a tela compara com o atual para saber se o dono ja editou. */
export function valorProposto(proposta, caminho) {
  if (!proposta) return undefined;
  if (proposta.sugestoes && Object.hasOwn(proposta.sugestoes, caminho)) return proposta.sugestoes[caminho];
  if (proposta.valores && Object.hasOwn(proposta.valores, caminho)) return proposta.valores[caminho];
  return undefined;
}

/**
 * Regras puras das pecas proprias e da ordem de producao (spec 2026-10-26-producao-pecas-proprias-design.md).
 * Sem imports: a tela, o servidor e o teste leem as mesmas contas.
 */

export const MAXIMO_PECAS = 50;
export const MAXIMO_DESCRICAO = 120;
export const MAXIMO_QUANTIDADE = 99999;
export const MAXIMO_CODIGO_MANUAL = 60;
export const MAXIMO_FORNECEDOR_MANUAL = 120;
/// O nome que `fotosManuais.js` gera (32 hex + .jpg): o navegador manda o nome, e so esse formato passa.
const PADRAO_FOTO_MANUAL = /^[a-f0-9]{32}\.jpg$/;

export const SITUACOES = ["ABERTA", "EM_PRODUCAO", "CONCLUIDA", "CANCELADA"];

export const ROTULO_DA_SITUACAO = {
  ABERTA: "Aberta",
  EM_PRODUCAO: "Em produção",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

const PROXIMAS = {
  ABERTA: ["EM_PRODUCAO", "CANCELADA"],
  EM_PRODUCAO: ["CONCLUIDA", "CANCELADA"],
  CONCLUIDA: [],
  CANCELADA: [],
};

/** Numero com virgula ou ponto decimal ("1,50", "0.5"); vazio ou texto vira null. */
function numeroDe(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const texto = String(valor ?? "").trim().replace(",", ".");
  if (texto === "" || !/^-?\d+(\.\d+)?$/.test(texto)) return null;
  return Number(texto);
}

/** Em milesimos inteiros: 0,1 x 30 em ponto flutuante da 3,0000000000000004 e arredondaria para 4. */
function milesimos(valor) {
  return Math.round(Number(valor) * 1000);
}

/**
 * Custo total das pecas (custo x quantidade). Uma peca sem custo deixa o total INCOMPLETO e nulo: uma soma parcial
 * pareceria uma margem boa que nao existe (a mesma regra do kit).
 */
export function custoDasPecas(pecas = []) {
  let centavos = 0;
  for (const peca of pecas) {
    const custo = numeroDe(peca?.custo);
    if (custo === null) return { total: null, incompleto: true };
    centavos += Math.round(custo * 100) * milesimos(peca.quantidade);
  }
  return { total: Math.round(centavos / 1000) / 100, incompleto: false };
}

/** A cor do icone de estoque, como o do Bling: vazio vermelho, abaixo do minimo amarelo, o resto verde. */
export function corDoEstoque({ estoque, estoqueMinimo }) {
  const atual = Number(estoque) || 0;
  if (atual <= 0) return "vermelho";
  if (estoqueMinimo !== null && estoqueMinimo !== undefined && atual < Number(estoqueMinimo)) return "amarelo";
  return "verde";
}

/** O texto da dica do icone: titulo e uma linha por numero (minimo e maximo so quando cadastrados). */
export function textoDoEstoque({ estoque, estoqueMinimo, estoqueMaximo }) {
  const cor = corDoEstoque({ estoque, estoqueMinimo });
  const titulo = cor === "vermelho" ? "Estoque do produto vazio" : cor === "amarelo" ? "Estoque abaixo do mínimo" : "Estoque ok";
  const linhas = [`Estoque atual: ${Number(estoque) || 0}`];
  if (estoqueMinimo !== null && estoqueMinimo !== undefined) linhas.push(`Estoque mínimo: ${estoqueMinimo}`);
  if (estoqueMaximo !== null && estoqueMaximo !== undefined) linhas.push(`Estoque máximo: ${estoqueMaximo}`);
  return { titulo, linhas };
}

/**
 * Confere a lista que vem do navegador. Cada peca e um produto do Rise (`componenteId`) OU um item manual
 * (`descricao` + `custoManual`). `produtoId` e o proprio produto, que nao pode ser peca de si mesmo.
 */
export function validarPecas(lista, produtoId = null) {
  if (!Array.isArray(lista)) return { ok: false, erro: "Lista de peças inválida." };
  if (lista.length > MAXIMO_PECAS) return { ok: false, erro: `No máximo ${MAXIMO_PECAS} peças.` };
  const vistos = new Set();
  const pecas = [];
  for (const [indice, bruta] of lista.entries()) {
    const posicao = `Peça ${indice + 1}`;
    const quantidadeTexto = String(bruta?.quantidade ?? "").trim().replace(",", ".");
    const quantidade = numeroDe(bruta?.quantidade);
    if (quantidade === null || quantidade <= 0 || quantidade > MAXIMO_QUANTIDADE) {
      return { ok: false, erro: `${posicao}: informe a quantidade, maior que zero.` };
    }
    if (/\.\d{3,}$/.test(quantidadeTexto)) return { ok: false, erro: `${posicao}: a quantidade aceita até 2 casas decimais.` };

    const componenteId = bruta?.componenteId ? String(bruta.componenteId) : null;
    if (componenteId) {
      if (produtoId && componenteId === String(produtoId)) return { ok: false, erro: "O produto não pode ser peça de si mesmo." };
      if (vistos.has(componenteId)) return { ok: false, erro: `${posicao}: este produto já está na lista.` };
      vistos.add(componenteId);
      pecas.push({ componenteId, descricao: null, custoManual: null, codigoManual: null, fornecedorManual: null, fotoManual: null, quantidade, ordem: indice });
      continue;
    }

    const descricao = String(bruta?.descricao ?? "").trim();
    if (!descricao) return { ok: false, erro: `${posicao}: escreva o nome do item.` };
    if (descricao.length > MAXIMO_DESCRICAO) return { ok: false, erro: `${posicao}: o nome aceita até ${MAXIMO_DESCRICAO} caracteres.` };
    const custoManual = numeroDe(bruta?.custoManual);
    if (custoManual === null || custoManual < 0) return { ok: false, erro: `${posicao}: informe o custo do item.` };
    // Codigo, fornecedor e foto do item manual sao opcionais (27/10/2026).
    const codigoManual = String(bruta?.codigoManual ?? "").trim() || null;
    if (codigoManual && codigoManual.length > MAXIMO_CODIGO_MANUAL) return { ok: false, erro: `${posicao}: o código aceita até ${MAXIMO_CODIGO_MANUAL} caracteres.` };
    const fornecedorManual = String(bruta?.fornecedorManual ?? "").trim() || null;
    if (fornecedorManual && fornecedorManual.length > MAXIMO_FORNECEDOR_MANUAL) {
      return { ok: false, erro: `${posicao}: o fornecedor aceita até ${MAXIMO_FORNECEDOR_MANUAL} caracteres.` };
    }
    const foto = String(bruta?.fotoManual ?? "");
    const fotoManual = PADRAO_FOTO_MANUAL.test(foto) ? foto : null;
    pecas.push({ componenteId: null, descricao, custoManual, codigoManual, fornecedorManual, fotoManual, quantidade, ordem: indice });
  }
  return { ok: true, pecas };
}

/// Unidades que se quebram (metro, hora): a quantidade anda de 0,01 em 0,01. As outras (UN, KIT) so inteiras.
const UNIDADES_FRACIONADAS = ["MT", "HR"];

/** Casas decimais da quantidade pela unidade do produto (pedido do dono em 27/10/2026): UN e KIT 0, MT e HR 2. */
export function casasDaUnidade(unidade) {
  return UNIDADES_FRACIONADAS.includes(String(unidade ?? "").toUpperCase()) ? 2 : 0;
}

/** Casas da quantidade de uma linha: o item manual nao tem unidade, entao aceita 2 casas. */
export function casasDaPeca(peca) {
  return peca?.componenteId ? casasDaUnidade(peca.unidade) : 2;
}

/** A quantidade respeita as casas da unidade? (2 com 0 casas sim; 1,5 com 0 casas nao). */
export function quantidadeCabe(quantidade, casas) {
  const fator = 10 ** casas;
  return Math.abs(Math.round(Number(quantidade) * fator) - Number(quantidade) * fator) < 1e-6;
}

/** Quanto da peca a ordem consome: o estoque e inteiro, entao o total vai para cima (0,5 x 3 = 2). */
export function quantidadeTotalDaPeca(quantidadePorUnidade, planejada) {
  return Math.ceil((milesimos(quantidadePorUnidade) * Number(planejada)) / 1000);
}

/** As pecas do Rise sem estoque para a baixa. `estoques`: Map(componenteId -> saldo). Item manual nao tem estoque. */
export function faltasParaBaixa(itens = [], estoques = new Map()) {
  const faltas = [];
  for (const item of itens) {
    if (!item.componenteId) continue;
    const disponivel = Number(estoques.get(item.componenteId)) || 0;
    if (disponivel < item.quantidadeTotal) {
      faltas.push({ sku: item.sku, descricao: item.descricao, necessario: item.quantidadeTotal, disponivel });
    }
  }
  return faltas;
}

export function numeroDaOrdem(numero) {
  return `OP-${String(numero).padStart(4, "0")}`;
}

export function podeIrPara(de, para) {
  return (PROXIMAS[de] ?? []).includes(para);
}

/** Quantas sairam boas ao concluir: inteiro de 1 ate a planejada (a diferenca e perda). */
export function validarQuantidadeProduzida(valor, planejada) {
  const texto = String(valor ?? "").trim();
  const quantidade = Number(texto);
  if (!/^\d+$/.test(texto) || quantidade < 1) return { ok: false, erro: "Informe quantas unidades ficaram prontas." };
  if (quantidade > planejada) return { ok: false, erro: `No máximo ${planejada} (a quantidade planejada).` };
  return { ok: true, quantidade };
}

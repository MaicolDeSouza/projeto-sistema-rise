/**
 * Regras puras do produto com composicao (kit): um produto feito de outros produtos do Rise,
 * em quantidades (pedido do dono em 07/10/2026). Sem banco, sem rede e sem Next: a tela, as
 * acoes e o teste leem daqui, e copiar a conta em dois lugares faria o cadastro e a lista
 * divergirem em silencio.
 *
 * Cada funcao recebe a lista de pecas ja lida (`{ sku, quantidade, ... }`); quem le o banco e
 * `composicaoBanco.js`.
 */

/// Quantidade maxima de uma peca no kit (o mesmo teto do anuncio de kit do Mercado Livre).
export const MAXIMO_QUANTIDADE = 9999;

/// Numero finito ou null: os Decimals do Prisma chegam como texto, e texto vazio nao e zero.
function numeroOuNull(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

/// Quantidade da peca como inteiro positivo, ou 0 quando nao serve (quem valida e `validarComposicao`).
function quantidadeDe(peca) {
  const numero = Number(peca?.quantidade);
  return Number.isInteger(numero) && numero > 0 ? numero : 0;
}

/// Arredonda para N casas sem o lixo do ponto flutuante (0.1 + 0.2).
const casas = (valor, n) => Math.round(valor * 10 ** n) / 10 ** n;

/**
 * Estoque do kit: quantos kits inteiros as pecas permitem montar — o menor de
 * `estoque da peca / quantidade dela no kit`, arredondado para baixo. E a mesma conta do
 * estoque virtual do Bling. Peca com estoque negativo conta 0 (o Bling deixa o saldo
 * negativo; o kit nao pode). Sem pecas, 0: um kit sem composicao nao tem o que vender.
 *
 * @param {{estoque: number|string, quantidade: number}[]} pecas
 * @returns {number}
 */
export function estoqueDoKit(pecas) {
  if (!Array.isArray(pecas) || pecas.length === 0) return 0;
  let menor = Infinity;
  for (const peca of pecas) {
    const quantidade = quantidadeDe(peca);
    if (quantidade === 0) continue;
    const estoque = Math.max(0, numeroOuNull(peca.estoque) ?? 0);
    menor = Math.min(menor, Math.floor(estoque / quantidade));
  }
  return menor === Infinity ? 0 : menor;
}

/**
 * Custo total e venda total do kit (soma de valor x quantidade), para o dono decidir o preco do
 * kit. Peca sem o valor deixa o total NULO e entra na lista de quem falta: uma soma parcial
 * pareceria uma margem boa e enganaria.
 *
 * @param {{sku: string, quantidade: number, precoVenda: number|string|null, custo: number|string|null}[]} pecas
 * @returns {{custo: number|null, venda: number|null, faltaCusto: string[], faltaVenda: string[]}}
 */
export function totaisDoKit(pecas) {
  const lista = Array.isArray(pecas) ? pecas : [];
  const resultado = { custo: null, venda: null, faltaCusto: [], faltaVenda: [] };
  if (lista.length === 0) return resultado;

  let custo = 0;
  let venda = 0;
  for (const peca of lista) {
    const quantidade = quantidadeDe(peca);
    const valorCusto = numeroOuNull(peca.custo);
    const valorVenda = numeroOuNull(peca.precoVenda);
    if (valorCusto === null) resultado.faltaCusto.push(peca.sku);
    else custo += valorCusto * quantidade;
    if (valorVenda === null) resultado.faltaVenda.push(peca.sku);
    else venda += valorVenda * quantidade;
  }
  if (resultado.faltaCusto.length === 0) resultado.custo = casas(custo, 2);
  if (resultado.faltaVenda.length === 0) resultado.venda = casas(venda, 2);
  return resultado;
}

/**
 * Peso e medidas sugeridos para o kit. O peso soma (peca x quantidade). As medidas NAO somam
 * nos tres eixos (tres pecas de 5 cm nao viram uma caixa de 15 x 15 x 15): comprimento e largura
 * ficam com a maior peca, e a altura soma, como pecas empilhadas. E uma sugestao — a caixa real
 * depende da embalagem, e os campos continuam editaveis. Peca sem um dado deixa o campo
 * correspondente nulo e e apontada em `incompleto`.
 *
 * @param {{sku: string, quantidade: number, pesoKg, comprimentoCm, larguraCm, alturaCm}[]} pecas
 * @returns {{pesoKg: number|null, comprimentoCm: number|null, larguraCm: number|null, alturaCm: number|null, incompleto: string[]}}
 */
export function pesoEMedidasDoKit(pecas) {
  const lista = Array.isArray(pecas) ? pecas : [];
  const falta = { pesoKg: false, comprimentoCm: false, larguraCm: false, alturaCm: false };
  const incompleto = [];
  let peso = 0;
  let comprimento = 0;
  let largura = 0;
  let altura = 0;

  for (const peca of lista) {
    const quantidade = quantidadeDe(peca);
    const valores = {
      pesoKg: numeroOuNull(peca.pesoKg),
      comprimentoCm: numeroOuNull(peca.comprimentoCm),
      larguraCm: numeroOuNull(peca.larguraCm),
      alturaCm: numeroOuNull(peca.alturaCm),
    };
    let faltouAlgo = false;
    for (const campo of Object.keys(valores)) {
      if (valores[campo] === null) {
        falta[campo] = true;
        faltouAlgo = true;
      }
    }
    if (faltouAlgo) incompleto.push(peca.sku);
    if (valores.pesoKg !== null) peso += valores.pesoKg * quantidade;
    if (valores.comprimentoCm !== null) comprimento = Math.max(comprimento, valores.comprimentoCm);
    if (valores.larguraCm !== null) largura = Math.max(largura, valores.larguraCm);
    if (valores.alturaCm !== null) altura += valores.alturaCm * quantidade;
  }

  const vazio = lista.length === 0;
  return {
    pesoKg: vazio || falta.pesoKg ? null : casas(peso, 3),
    comprimentoCm: vazio || falta.comprimentoCm ? null : casas(comprimento, 2),
    larguraCm: vazio || falta.larguraCm ? null : casas(largura, 2),
    alturaCm: vazio || falta.alturaCm ? null : casas(altura, 2),
    incompleto,
  };
}

/**
 * Os NCMs das pecas, cada um uma vez, com os SKUs que o usam — a lista de escolha do campo NCM do
 * kit. Compara so pelos digitos ("8483.50.10" e "84835010" sao o mesmo NCM; o Bling reformata), e
 * mostra o NCM como veio na primeira peca. Peca sem NCM fica fora.
 *
 * @param {{sku: string, ncm: string|null}[]} pecas
 * @returns {{ncm: string, pecas: string[]}[]}
 */
export function ncmsDasPecas(pecas) {
  const porDigitos = new Map();
  for (const peca of Array.isArray(pecas) ? pecas : []) {
    const ncm = String(peca?.ncm ?? "").trim();
    const digitos = ncm.replace(/\D/g, "");
    if (!digitos) continue;
    const grupo = porDigitos.get(digitos) ?? { ncm, pecas: [] };
    grupo.pecas.push(peca.sku);
    porDigitos.set(digitos, grupo);
  }
  return [...porDigitos.values()];
}

/**
 * Valida a lista de pecas que vem do navegador ANTES de gravar: lista nao vazia, cada item com id
 * e quantidade inteira de 1 a 9999, pelo menos 2 unidades no total (um kit de uma unidade e o
 * proprio produto), sem peca repetida e sem o proprio produto. O que e peca permitida (simples,
 * conferida, vinculada ao Bling) depende do banco e fica em `composicaoBanco.js`.
 *
 * @param {{componenteId: string, quantidade: number|string}[]} itens
 * @param {{produtoId?: string|null}} contexto
 * @returns {{ok: true} | {ok: false, erro: string}}
 */
export function validarComposicao(itens, { produtoId = null } = {}) {
  if (!Array.isArray(itens)) return { ok: false, erro: "Revise a composição antes de salvar." };
  if (itens.length === 0) return { ok: false, erro: "Um produto com composição precisa de pelo menos uma peça." };

  const vistos = new Set();
  let unidades = 0;
  for (const [indice, item] of itens.entries()) {
    const id = String(item?.componenteId ?? "").trim();
    if (!id) return { ok: false, erro: `A peça ${indice + 1} está sem produto. Escolha um produto do Rise.` };
    if (produtoId && id === String(produtoId)) return { ok: false, erro: "O produto não pode ser peça dele mesmo." };
    if (vistos.has(id)) return { ok: false, erro: "A mesma peça aparece duas vezes. Junte as quantidades numa linha só." };
    vistos.add(id);

    const quantidade = Number(item?.quantidade);
    if (!Number.isInteger(quantidade) || quantidade < 1) {
      return { ok: false, erro: `A peça ${indice + 1} precisa de uma quantidade inteira, de 1 em diante.` };
    }
    if (quantidade > MAXIMO_QUANTIDADE) return { ok: false, erro: `A quantidade de uma peça vai até ${MAXIMO_QUANTIDADE}.` };
    unidades += quantidade;
  }

  if (unidades < 2) return { ok: false, erro: "Um kit precisa de pelo menos 2 unidades no total; com uma só, é o próprio produto." };
  return { ok: true };
}

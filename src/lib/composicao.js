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

/// Tamanho maximo da Localizacao (o mesmo da edicao rapida da lista). O Bling tambem recebe esse campo, e o limite
/// dele nao foi medido: ficar em 40 evita uma recusa no envio.
export const LIMITE_DA_LOCALIZACAO = 40;

/// Texto da Localizacao do kit quando a lista das pecas nao cabe em `LIMITE_DA_LOCALIZACAO` (pedido do dono em
/// 10/10/2026): quem separa o pedido le a aba Composicao.
export const LOCALIZACAO_DE_VARIAS_PECAS = "Verificar a aba composição";

// Os kits reais do Bling escrevem o milhar com ponto (920302_1.000); o anuncio do ML usa a mesma regra.
const FORMATO_DO_MILHAR = new Intl.NumberFormat("pt-BR");

/**
 * Codigo sugerido para o kit (pedido do dono em 10/10/2026): com UMA peca, `{sku}_{quantidade}`, no mesmo
 * formato dos kits do Bling e do anuncio do ML (`920302_1.000`); com mais de uma, nenhum (o dono digita ou usa
 * a varinha). Quantidade 1 tambem nao sugere: um kit precisa de 2 unidades, e "100101_1" seria a propria peca.
 *
 * @param {{sku: string, quantidade: number|string}[]} pecas
 * @returns {string|null}
 */
export function codigoSugeridoDoKit(pecas) {
  const lista = Array.isArray(pecas) ? pecas : [];
  if (lista.length !== 1) return null;
  const sku = String(lista[0]?.sku ?? "").trim();
  const quantidade = quantidadeDe(lista[0]);
  if (!sku || quantidade < 2 || quantidade > MAXIMO_QUANTIDADE) return null;
  return `${sku}_${FORMATO_DO_MILHAR.format(quantidade)}`;
}

/**
 * Localizacao do kit (pedidos do dono em 10/10/2026). E sempre AUTOMATICA e fica travada: o kit nao tem lugar
 * proprio, ele sai dos lugares das pecas.
 *  - UMA peca: a localizacao da peca.
 *  - VARIAS: cada peca com o lugar dela, na ordem da aba Composicao, `100101(F9) / 101010(H2)`. Peca sem
 *    localizacao entra so com o codigo. Se a lista passar de `LIMITE_DA_LOCALIZACAO` caracteres, vira
 *    `LOCALIZACAO_DE_VARIAS_PECAS` (a lista inteira esta na coluna Localizacao da aba Composicao e no popup da lista).
 *  - Sem pecas, nada a sugerir (e o campo continua editavel).
 *
 * @param {{sku?: string, localizacao?: string|null}[]} pecas
 * @returns {{valor: string|null, travada: boolean}}
 */
export function localizacaoDoKit(pecas) {
  const lista = Array.isArray(pecas) ? pecas : [];
  if (lista.length === 0) return { valor: null, travada: false };
  if (lista.length === 1) return { valor: String(lista[0]?.localizacao ?? "").trim(), travada: true };
  const texto = lista
    .map((peca) => {
      const sku = String(peca?.sku ?? "").trim();
      const lugar = String(peca?.localizacao ?? "").trim();
      return lugar ? `${sku}(${lugar})` : sku;
    })
    .join(" / ");
  return { valor: texto.length > LIMITE_DA_LOCALIZACAO ? LOCALIZACAO_DE_VARIAS_PECAS : texto, travada: true };
}

/**
 * O que falta para um produto poder ser peca de kit (decisao do dono em 07/10/2026: simples, Conferido e
 * vinculado ao Bling), TUDO de uma vez (pedido do dono em 10/10/2026: a busca mostrava so o primeiro motivo).
 * Lista vazia = apto. Kit nunca e peca, e os outros motivos nao importam nesse caso.
 *
 * @param {{tipo?: string, conferido?: boolean, blingId?: string|null}} produto
 * @returns {string[]}
 */
export function faltasParaSerPeca(produto) {
  if ((produto?.tipo ?? "SIMPLES") !== "SIMPLES") return ["É um kit, não pode ser peça"];
  const faltas = [];
  if (!produto?.conferido) faltas.push("validar no Rise");
  if (!produto?.blingId) faltas.push("integrar com o Bling");
  return faltas;
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

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

/// Como cada campo do retrato aparece no quadro do kit. O custo, o estoque e a localizacao ficam de fora de
/// proposito (pedido do dono em 10/10/2026): o estoque muda a cada venda e o kit ja o recalcula, a localizacao
/// o kit ja acompanha sozinho, e o custo o dono nao quer acompanhando o "!".
const CAMPOS_DO_RETRATO = [
  { chave: "tituloBase", rotulo: "Nome", formato: (valor) => String(valor ?? "") || "—" },
  { chave: "precoVenda", rotulo: "Preço de venda", numero: true, formato: (valor) => (valor === null ? "—" : MOEDA.format(valor)) },
  { chave: "pesoKg", rotulo: "Peso", numero: true, formato: (valor) => (valor === null ? "—" : `${NUMERO.format(valor)} kg`) },
  { chave: "comprimentoCm", rotulo: "Comprimento", numero: true, formato: (valor) => (valor === null ? "—" : `${NUMERO.format(valor)} cm`) },
  { chave: "larguraCm", rotulo: "Largura", numero: true, formato: (valor) => (valor === null ? "—" : `${NUMERO.format(valor)} cm`) },
  { chave: "alturaCm", rotulo: "Altura", numero: true, formato: (valor) => (valor === null ? "—" : `${NUMERO.format(valor)} cm`) },
  { chave: "ncm", rotulo: "NCM", digitos: true, formato: (valor) => String(valor ?? "") || "—" },
  { chave: "ativo", rotulo: "Situação", formato: (valor) => (valor ? "Ativo" : "Inativo") },
  { chave: "conferido", rotulo: "Conferido", formato: (valor) => (valor ? "Sim" : "Não") },
];

const valorDoRetrato = (valor) => (valor === undefined ? null : valor);

/**
 * O que mudou numa peca desde o ultimo Salvar do kit (pedido do dono em 10/10/2026), em frases para o quadro do
 * kit: "Preço de venda: R$ 38,90 → R$ 42,00", "Descrição alterada", "Fotos: 3 → 4", "Documentos: novo
 * Datasheet.pdf". `antes` e o retrato guardado (`ProdutoComponente.retrato`), `agora` o da peca hoje, os dois no
 * formato de `retratoDaPeca`. Sem retrato guardado nao ha com o que comparar: nada muda (o kit fica sem "!").
 *
 * Numeros comparam como numero (o banco devolve 12.4 e o Prisma "12.40"), o NCM so pelos digitos (o Bling
 * reformata) e os documentos como conjunto de nomes (a ordem nao importa).
 *
 * @returns {{campo: string, texto: string}[]}
 */
export function mudancasDaPeca(antes, agora) {
  if (!antes || !agora || typeof antes !== "object" || typeof agora !== "object") return [];
  const mudancas = [];

  for (const { chave, rotulo, numero, digitos, formato } of CAMPOS_DO_RETRATO) {
    let a = valorDoRetrato(antes[chave]);
    let b = valorDoRetrato(agora[chave]);
    if (numero) {
      a = numeroOuNull(a);
      b = numeroOuNull(b);
    }
    const iguais = digitos
      ? String(a ?? "").replace(/\D/g, "") === String(b ?? "").replace(/\D/g, "")
      : a === b;
    if (!iguais) mudancas.push({ campo: rotulo, texto: `${rotulo}: ${formato(a)} → ${formato(b)}` });
  }

  if (valorDoRetrato(antes.descricao) !== valorDoRetrato(agora.descricao)) {
    mudancas.push({ campo: "Descrição", texto: "Descrição alterada" });
  }

  const fotosAntes = Number(antes.quantidadeFotos) || 0;
  const fotosAgora = Number(agora.quantidadeFotos) || 0;
  if (fotosAntes !== fotosAgora) {
    mudancas.push({ campo: "Fotos", texto: `Fotos: ${fotosAntes} → ${fotosAgora}` });
  } else if (valorDoRetrato(antes.fotos) !== valorDoRetrato(agora.fotos)) {
    mudancas.push({ campo: "Fotos", texto: "Fotos trocadas" });
  }

  const nomes = (lista) => new Set((Array.isArray(lista) ? lista : []).map(String));
  const documentosAntes = nomes(antes.documentos);
  const documentosAgora = nomes(agora.documentos);
  const novos = [...documentosAgora].filter((nome) => !documentosAntes.has(nome));
  const saiu = [...documentosAntes].filter((nome) => !documentosAgora.has(nome));
  if (novos.length > 0 || saiu.length > 0) {
    const partes = [];
    if (novos.length > 0) partes.push(`${novos.length === 1 ? "novo" : "novos"} ${novos.join(", ")}`);
    if (saiu.length > 0) partes.push(`${saiu.length === 1 ? "removido" : "removidos"} ${saiu.join(", ")}`);
    mudancas.push({ campo: "Documentos", texto: `Documentos: ${partes.join("; ")}` });
  }

  return mudancas;
}

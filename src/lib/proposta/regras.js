import { posicaoDePreco } from "../posicaoDePreco.js";

/**
 * Regras puras da proposta automatica de produto (spec docs/superpowers/specs/2026-10-16-proposta-automatica-de-produto-
 * design.md): preco por markup com a posicao entre os concorrentes, peso e medidas, NCM e origem fiscal. Sem banco e
 * sem rede: o script da sessao e a tela usam as mesmas contas.
 *
 * Imports RELATIVOS de proposito: o teste roda em Node puro, sem o resolvedor do "@/".
 */

/**
 * As tres opcoes de MARKUP da proposta (pedido do dono em 24/10/2026: "markup em todo o Rise", com o aviso abaixo de 60%
 * para a loja). Ate ali eram as margens 40, 50 e 60% sobre o preco (19/10/2026); 60/80/100 e decisao da sessao, para as
 * tres ficarem no aviso ou acima dele.
 */
export const MARKUPS_DA_PROPOSTA = [60, 80, 100];

/** O dono quer ficar entre os 5 primeiros (1º = o mais barato). */
export const POSICAO_MAXIMA = 5;

/**
 * Preco de venda que da o markup pedido, na conta do cadastro (`calcularMarkup`): preco = custo * (1 + markup), sem o
 * imposto (custo R$ 50 com 100% = R$ 100). Arredonda PARA CIMA ate o proximo multiplo de 5 centavos (pedido do dono em
 * 22/10/2026: a loja nao usa preco quebrado como 35,41; 35,41 vira 35,45): para baixo daria um markup menor que o pedido.
 * @returns {number|null} nulo sem custo ou com markup que nao e numero
 */
export function precoParaMarkup(custo, markup) {
  const base = Number(custo);
  const fator = 1 + Number(markup) / 100;
  if (!(base > 0) || !(fator > 0)) return null;
  // O epsilon tira o ruido do ponto flutuante (30,24 * 1,6 nao vira 48,38400001 e depois 48,45).
  const centavos = Math.ceil(base * fator * 100 - 1e-9);
  return (Math.ceil(centavos / DEGRAU_DO_PRECO) * DEGRAU_DO_PRECO) / 100;
}

/** O preco da proposta anda de 5 em 5 centavos (em centavos). */
export const DEGRAU_DO_PRECO = 5;

/** O preco recomendado fica R$ 0,10 abaixo do concorrente de referencia (pedido do dono em 24/10/2026), em centavos. */
export const CENTAVOS_ABAIXO_DO_CONCORRENTE = 10;

/**
 * Abaixo deste markup a recomendada leva um aviso para o relatorio (sem piso, so aviso: decisao do dono em 24/10/2026;
 * no mesmo dia o aviso passou de 30% de margem para 60% de markup, "60% para LI").
 */
export const MARKUP_DE_AVISO = 60;

/** O markup do Rise para um preco: (preco - custo) / custo, em %, com uma casa. Sem custo ou sem preco, null. */
export function markupDoPreco(custo, preco) {
  const base = Number(custo);
  const valor = Number(preco);
  if (!(base > 0) || !(valor > 0)) return null;
  return Math.round(((valor - base) / base) * 1000) / 10;
}

const centavosDe = (valor) => {
  const numero = Number(typeof valor === "string" ? valor.replace(",", ".") : valor);
  return Number.isFinite(numero) && numero > 0 ? Math.round(numero * 100) : null;
};

/**
 * O concorrente que decide o preco (pedido do dono em 24/10/2026: "o concorrente em 5 esta a R$ 35,90 e devo colocar uns
 * 10 centavos a menos"): o 5º mais barato, contando cada loja pelo menor preco dela e sem as indisponiveis (a mesma conta
 * da `posicaoDePreco`). Com menos de 5 lojas, o MAIS CARO delas (decisao 2 do dono, opcao 1). Sem nenhuma, null.
 * @returns {{ loja: string, centavos: number, quinto: boolean, lojas: number } | null}
 */
export function concorrenteDeReferencia(concorrentes) {
  const porLoja = new Map();
  for (const item of concorrentes ?? []) {
    if (item?.indisponivel) continue;
    const centavos = centavosDe(item?.preco);
    if (centavos === null) continue;
    const nome = String(item?.loja ?? "").trim();
    const chave = nome.toLocaleLowerCase("pt-BR");
    const atual = porLoja.get(chave);
    if (!atual || centavos < atual.centavos) porLoja.set(chave, { loja: nome, centavos });
  }
  const lojas = [...porLoja.values()].sort((a, b) => a.centavos - b.centavos);
  if (lojas.length === 0) return null;
  const quinto = lojas.length >= POSICAO_MAXIMA;
  const escolhida = quinto ? lojas[POSICAO_MAXIMA - 1] : lojas.at(-1);
  return { ...escolhida, quinto, lojas: lojas.length };
}

const reais = (centavos) => `R$ ${(centavos / 100).toFixed(2).replace(".", ",")}`;

/**
 * As tres opcoes de markup (60, 80, 100%) com a posicao de cada uma, e a recomendada (regra de 24/10/2026, pedido do
 * dono): R$ 0,10 abaixo do 5º concorrente com estoque (com menos de 5, do mais caro), arredondado PARA BAIXO aos 5 centavos
 * (para ficar abaixo dele de verdade). E o maior markup que ainda deixa o produto entre os 5 primeiros. Ate 23/10/2026
 * subia de 1 em 1% e parava no ultimo preco que cabia, o que deixava centavos na mesa (39,35 com o 5º a 39,90).
 * Sem piso (decisao 3 do dono): abaixo de 60% de markup vai o aviso; abaixo de 1% (ou prejuizo) nao ha recomendada.
 * Os campos se chamam `markup` desde 24/10/2026 (as propostas de antes guardaram `margem`, sobre o preco).
 * @param {number|null} custo custo do fornecedor padrao
 * @param {{loja: string, preco: number|string|null, indisponivel?: boolean}[]} concorrentes o formato de `posicaoDePreco`
 */
export function opcoesDePreco(custo, concorrentes) {
  const opcoes = MARKUPS_DA_PROPOSTA.map((markup) => {
    const preco = precoParaMarkup(custo, markup);
    return { markup, preco, posicao: preco === null ? null : posicaoDePreco(preco, concorrentes) };
  });
  if (!(Number(custo) > 0)) {
    return { opcoes, recomendada: null, motivoSemRecomendada: "sem custo do fornecedor padrão: não há como calcular o markup" };
  }
  const referencia = concorrenteDeReferencia(concorrentes);
  // Sem concorrente com preco, nao ha posicao: a recomendada vira a maior das tres opcoes do dono.
  if (!referencia) return { opcoes, recomendada: opcoes.at(-1), motivoSemRecomendada: null };

  const qual = referencia.quinto ? "do 5º concorrente" : `do concorrente mais caro (só ${referencia.lojas} com estoque)`;
  const centavos = Math.floor((referencia.centavos - CENTAVOS_ABAIXO_DO_CONCORRENTE) / DEGRAU_DO_PRECO) * DEGRAU_DO_PRECO;
  const preco = centavos / 100;
  const markup = markupDoPreco(custo, preco);
  if (!(centavos > 0) || markup === null || markup < 1) {
    return {
      opcoes,
      recomendada: null,
      motivoSemRecomendada: `R$ 0,10 abaixo ${qual} (${referencia.loja}, ${reais(referencia.centavos)}) o markup fica abaixo de 1%: o produto não cabe entre os ${POSICAO_MAXIMA} primeiros com lucro`,
    };
  }
  return {
    opcoes,
    recomendada: {
      markup,
      preco,
      posicao: posicaoDePreco(preco, concorrentes),
      referencia: { loja: referencia.loja, preco: referencia.centavos / 100, regra: referencia.quinto ? "5º concorrente" : "concorrente mais caro (menos de 5)" },
      aviso: markup < MARKUP_DE_AVISO ? `markup abaixo de ${MARKUP_DE_AVISO}%` : null,
    },
    motivoSemRecomendada: null,
  };
}

const CAMPOS_DE_MEDIDA = ["pesoKg", "alturaCm", "larguraCm", "comprimentoCm"];
const ehUsinainfo = (loja) => /usinainfo/i.test(String(loja ?? ""));
const temValor = (valor) => valor !== null && valor !== undefined && valor !== "" && Number(valor) > 0;

/** O valor mais repetido entre os itens; empate, o de quem tem `prefere`; empate sem preferido, o primeiro da lista. */
function maisRepetido(itens, prefere) {
  const contagem = new Map();
  itens.forEach((item, ordem) => {
    const chave = String(item.valor);
    const atual = contagem.get(chave) ?? { valor: item.valor, vezes: 0, ordem, preferido: false, quem: [] };
    atual.vezes += 1;
    atual.preferido ||= Boolean(prefere?.(item));
    atual.quem.push(item.quem);
    contagem.set(chave, atual);
  });
  return [...contagem.values()].sort((a, b) => (b.vezes - a.vezes) || (Number(b.preferido) - Number(a.preferido)) || (a.ordem - b.ordem))[0] ?? null;
}

/**
 * Peso e medidas da proposta (decisao do dono em 19/10/2026): a da USINAINFO quando ela publica o campo; sem ela, o valor
 * mais repetido entre os demais concorrentes; empate, o do fabricante. Decide campo a campo.
 * @param {{loja: string, pesoKg?: number|null, alturaCm?: number|null, larguraCm?: number|null, comprimentoCm?: number|null, fabricante?: boolean}[]} porLoja
 * @returns {{ valor: Record<string, number|null>, origem: string } | null}
 */
export function escolherMedidas(porLoja) {
  const valor = {};
  const origens = [];
  for (const campo of CAMPOS_DE_MEDIDA) {
    const comValor = (porLoja ?? []).filter((item) => temValor(item?.[campo]));
    const usina = comValor.find((item) => ehUsinainfo(item.loja));
    if (usina) {
      valor[campo] = Number(usina[campo]);
      origens.push(`${campo}: ${usina.loja}`);
      continue;
    }
    const vencedor = maisRepetido(comValor.map((item) => ({ valor: Number(item[campo]), quem: item.loja, fabricante: item.fabricante })), (item) => item.fabricante);
    valor[campo] = vencedor ? vencedor.valor : null;
    if (vencedor) origens.push(`${campo}: ${vencedor.vezes > 1 ? `${vencedor.vezes} lojas (${vencedor.quem.join(", ")})` : vencedor.quem[0]}`);
  }
  if (CAMPOS_DE_MEDIDA.every((campo) => valor[campo] === null)) return null;
  return { valor, origem: origens.join("; ") };
}

/**
 * NCM da proposta (decisao do dono em 19/10/2026): o da FORTEK quando ela publica; sem ela, o mais repetido entre os
 * fornecedores; empate, o primeiro da lista. Fornecedor sem NCM nao conta.
 * @param {{fornecedor: string, ncm: string|null}[]} porFornecedor
 * @returns {{ ncm: string, origem: string } | null}
 */
export function escolherNcm(porFornecedor) {
  const comNcm = (porFornecedor ?? []).filter((item) => String(item?.ncm ?? "").trim() !== "");
  const fortek = comNcm.find((item) => /fortek/i.test(String(item.fornecedor ?? "")));
  if (fortek) return { ncm: String(fortek.ncm).trim(), origem: `${fortek.fornecedor} (fornecedor preferido)` };
  const vencedor = maisRepetido(comNcm.map((item) => ({ valor: String(item.ncm).trim(), quem: item.fornecedor })));
  if (!vencedor) return null;
  return { ncm: vencedor.valor, origem: vencedor.vezes > 1 ? `${vencedor.vezes} fornecedores (${vencedor.quem.join(", ")})` : vencedor.quem[0] };
}

/** Origem fiscal da proposta: 2 (estrangeira, adquirida no mercado interno) com fornecedor; 0 (nacional) sem. */
export function origemFiscal(temFornecedor) {
  return temFornecedor ? 2 : 0;
}
